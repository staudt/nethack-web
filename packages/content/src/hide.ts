// Monsters hiding under objects (M1_CONCEAL: snakes, some spiders) and on the ceiling (M1_HIDE:
// piercers, trappers, lurkers above): hiding, coming out when the object goes, hiding again when
// unwatched, and hiding when the hero comes back to a level. The flag is hidestate.ts's; the
// `nh:hiding` perception (perception.ts) keeps a hidden monster out of the view.
// ref: src/mon.c hideunder(), hide_monst(), maybe_unhide_at(), restrap();
// src/monmove.c can_hide_under_obj()
//
// Not ported: eels (no water), the hero hiding as a form (u.uundetected), mimics' restrap()
// branch (m13 step 2).
import {
  cellIndex,
  getPlayer,
  isVisible,
  itemsAt,
  sortedIds,
  trapAt,
  type Ctx,
  type Entity,
  type EntityId,
  type LevelId,
} from '@nh/core';
import { ustuck } from './hackmove';
import { hidesUnder, isHider, isUndetected, setUndetected } from './hidestate';
import { canseemon } from './invis';
import { isCancelled } from './mstate';
import { xnameOf } from './objnam';
import { monNam, sensemon } from './perception';
import { resistsSton, touchPetrifies } from './stonestate';
import { T } from './terrain';
import { isMtrapped, isPit } from './trapstate';

export { ceilingHider, hidesUnder, isHider, isUndetected, setUndetected } from './hidestate';

/** The monster (not the hero) at (x, y) of `level`, or null. */
function monAt(ctx: Pick<Ctx, 'state'>, level: LevelId, x: number, y: number): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && id !== ctx.state.playerId && p?.level === level && p.x === x && p.y === y)
      return e;
  }
  return null;
}

/** A trap other than a pit is at (x, y) of `level`. */
function nonPitTrapAt(ctx: Pick<Ctx, 'state'>, level: LevelId, x: number, y: number): boolean {
  const lv = ctx.state.levels[level];
  const t = lv ? trapAt(lv, x, y) : undefined;
  return !!t && !isPit(t.def);
}

/**
 * The floor pile at (x, y) can be hidden under: there is one, there is no trap but a pit, and it
 * is not just a few coins (fewer than 10 on top with nothing else under them).
 * ref: src/monmove.c can_hide_under_obj() (NO_HIDING_UNDER_STATUES is off)
 */
export function canHideUnderObj(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: LevelId,
  x: number,
  y: number,
): boolean {
  const pile = itemsAt(ctx.defs, ctx.state, level, x, y);
  if (pile.length === 0) return false;
  if (nonPitTrapAt(ctx, level, x, y)) return false;
  let coins = 0;
  for (const o of pile) {
    if (ctx.defs.object(o.def).class !== 'coin') return true;
    coins += o.c.item?.quantity ?? 1;
    if (coins >= 10) return true;
  }
  return false; // whole pile was less than 10 coins
}

/**
 * The monster tries to hide under something on its square: not while holding or held by the
 * hero, trapped, or on any trap but a pit; only a hider-underer, under a pile it can hide under
 * (a pet not under a cursed object), and not under cockatrice corpses alone unless it resists
 * stoning. On a square she sees: "You see the garter snake hide under a dagger." Anything else
 * brings it out of hiding (a ceiling hider too). `quiet` is level creation (gi.in_mklev) or a
 * return to the level: no message. Returns whether it is hidden. ref: src/mon.c hideunder()
 */
export function hideunder(ctx: Ctx, id: EntityId, quiet = false): boolean {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  if (!mon?.c.monster || !p) return false;
  const def = ctx.defs.monster(mon.def);
  const seeit = quiet ? false : canseemon(ctx, mon);
  let undetected = false;
  let seenobj: Entity | null = null;
  if (ustuck(ctx) === id) {
    // can't hide if holding you or held by you
  } else if (isMtrapped(ctx, id) || nonPitTrapAt(ctx, p.level, p.x, p.y)) {
    // can't hide while trapped or on/in/under any non-pit trap when not trapped
  } else if (
    hidesUnder(def) &&
    canHideUnderObj(ctx, p.level, p.x, p.y) &&
    // pets won't hide under a cursed item or a pile holding one
    !(
      (mon.c.monster.tame ?? 0) > 0 &&
      itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).some((o) => o.c.item?.buc === 'cursed')
    )
  ) {
    const pile = itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y);
    if (seeit) seenobj = pile[0] ?? null;
    // most monsters won't hide under a cockatrice corpse but they can hide under a pile
    // containing more than just such corpses
    let i = 0;
    if (!resistsSton(ctx, mon))
      while (
        pile[i]?.def === 'nh:corpse' &&
        touchPetrifies(ctx.defs.monster(pile[i]?.c.item?.corpseOf ?? 'nh:newt'))
      )
        i++;
    if (pile[i]) undetected = true;
  }
  setUndetected(ctx, id, undetected);
  if (undetected && seeit && seenobj)
    ctx.emit({
      type: 'msg',
      key: 'hide.see_hide',
      params: { mon: monNam(ctx, mon), item: xnameOf(ctx.state, ctx.defs, seenobj) },
    });
  return undetected;
}

/**
 * A monster hiding under an object at (x, y) whose object went away (or that got trapped) comes
 * out, or hides under what is left. ref: src/mon.c maybe_unhide_at() (no eels, no hero hiding)
 */
export function maybeUnhideAt(ctx: Ctx, level: LevelId, x: number, y: number): void {
  const mon = monAt(ctx, level, x, y);
  if (!mon || !isUndetected(ctx, mon.id)) return;
  if (
    hidesUnder(ctx.defs.monster(mon.def)) &&
    (isMtrapped(ctx, mon.id) || !canHideUnderObj(ctx, level, x, y))
  )
    hideunder(ctx, mon.id);
}

/** cansee(x, y): the hero sees the square (on her level). */
function cansee(ctx: Pick<Ctx, 'state'>, level: LevelId, x: number, y: number): boolean {
  const lv = ctx.state.levels[level];
  return !!lv && level === ctx.state.currentLevel && isVisible(ctx.state, cellIndex(lv, x, y));
}

/**
 * An unwatched hider hides again, 1 time in 3: not cancelled, not on a square she sees, not
 * holding her, not trapped (but in a pit), not next to her when she senses it; a piercer,
 * trapper or lurker above hides on plain floor (every level has a ceiling here). `unseen` is
 * hide_monst()'s forced "hero can't see the spot". Returns whether it hid. ref: src/mon.c
 * restrap() (the mimic branch is m13 step 2)
 */
export function restrap(ctx: Ctx, mon: Entity, unseen = false): boolean {
  const p = mon.c.pos;
  if (!p) return false;
  const hp = getPlayer(ctx.state).c.pos;
  const next2u =
    !!hp && hp.level === p.level && Math.max(Math.abs(hp.x - p.x), Math.abs(hp.y - p.y)) <= 1;
  if (
    isCancelled(ctx, mon.id) ||
    (!unseen && cansee(ctx, p.level, p.x, p.y)) ||
    ctx.rng.rn2(3) ||
    ustuck(ctx) === mon.id ||
    // can't hide while trapped except in pits
    (isMtrapped(ctx, mon.id) && nonPitTrapAt(ctx, p.level, p.x, p.y)) ||
    // won't hide when adjacent to hero
    (sensemon(ctx, mon) && next2u)
  )
    return false;
  const lv = ctx.state.levels[p.level];
  const here = lv ? lv.palette[lv.cells[cellIndex(lv, p.x, p.y)] ?? 0] : undefined;
  if (here === T.floor) {
    setUndetected(ctx, mon.id, true);
    return true;
  }
  return false;
}

/**
 * Called for each monster when the hero comes back to its level after a while: a hider that is
 * not hiding gets a restrap() as if unseen, a hider-underer a hideunder(). ref: src/mon.c
 * hide_monst() (no mimics or eels yet)
 */
export function hideMonst(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const hiderUnder = hidesUnder(def);
  if ((isHider(def) || hiderUnder) && !isUndetected(ctx, mon.id)) {
    if (isHider(def)) restrap(ctx, mon, true);
    if (hiderUnder) hideunder(ctx, mon.id, true);
  }
}
