// Applying tools (a): lamps, lock tools, containers, whistles, the blindfold and digging tools
// (the pick-axe and the dwarvish mattock, a weapon; dig.ts); polearms and lances (pole.ts);
// applying a wand breaks it (breakwand.ts).
// ref: src/apply.c doapply(), use_whistle(), use_magic_whistle(), magic_whistled();
// src/mon.c wake_nearby(), wake_nearto_core() (petcall); src/teleport.c tele_to_rnd_pet()
//
// Not ported (see DEVIATIONS.md): the tools outside the subset, Deafness, being underwater,
// vault guards summoned by a cursed tin whistle, stasis, and the combined
// one-sentence report of a known magic whistle (each kind of move is its own sentence here).
import {
  NORMAL_SPEED,
  getPlayer,
  inBounds,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Msg,
  type Offer,
} from '@nh/core';
import { answerBreakWand, doBreakWand } from './breakwand';
import { useContainer } from './container';
import { nohands } from './mondata';
import { heroForm } from './upoly';
import { DIG_ID, isPick, usePickAxe } from './dig';
import { POLE_ID, poleAction, usePole } from './pole';
import { isPole } from './skills';
import { mnextoPos } from './generation';
import { blindfOff, blindfOn, cursedWorn, isEyewear } from './jewelry';
import { applyLockTool, isLockTool } from './lock';
import { changeLuck } from './luck';
import { isLamp, useLamp } from './light';
import { checkCapacity } from './magic';
import { edogOf } from './dog';
import { wakeNearto } from './noise';
import { discover, isKnown } from './o_init';
import { canSpotMon, monNam } from './perception';
import { P, heroHas, wornIn } from './props';
import { inStasis, noteleportLevel, teleok } from './teleport';
import { mintrap, teleds } from './trap';
import { setMtrapped } from './trapstate';

export const APPLY_ID: DefId = 'nh:apply';

export const WHISTLE = { tin: 'nh:tin_whistle', magic: 'nh:magic_whistle' } as const;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/** Whether `a` can apply this object (the tools of the subset, and wands: breaking them). */
export function applicable(ctx: Pick<Ctx, 'defs'>, e: Entity): boolean {
  const def = ctx.defs.object(e.def);
  if (isPick(def)) return true; // PICK_AXE, DWARVISH_MATTOCK
  if (isPole(def)) return true; // polearms and lances: use_pole()
  if (def.class === 'wand') return true; // do_break_wand()
  if (def.class !== 'tool') return false;
  return (
    def.container !== undefined ||
    isLamp(e.def) ||
    isLockTool(e.def) ||
    e.def === WHISTLE.tin ||
    e.def === WHISTLE.magic ||
    isEyewear(e.def)
  );
}

// ---------------------------------------------------------------------------------------------
// whistles

/**
 * Wakes the monsters within u.ulevel * 20 (distance squared) of the hero; pets among them come
 * to her for a few turns (whistletime). ref: src/mon.c wake_nearby(TRUE), wake_nearto_core()
 */
function wakeNearby(ctx: Ctx): void {
  const h = hero(ctx);
  const p = h.c.pos;
  if (!p) return;
  const dist = (h.c.experience?.level ?? 1) * 20;
  wakeNearto(ctx, p.x, p.y, dist);
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    const mp = m?.c.pos;
    if (!m?.c.monster?.tame || !mp || mp.level !== p.level) continue;
    if ((mp.x - p.x) ** 2 + (mp.y - p.y) ** 2 >= dist) continue;
    const edog = edogOf(ctx, id);
    if (edog) edog.whistletime = ctx.state.turn;
  }
}

/** ref: src/apply.c use_whistle() */
function useWhistle(ctx: Ctx, obj: Entity): void {
  say(ctx, 'whistle.sound', {
    how: { key: obj.c.item?.buc === 'cursed' ? 'whistle.shrill' : 'whistle.high' },
  });
  wakeNearby(ctx);
  // a cursed one summons the vault guard (vault_summon_gd()): no vaults yet
}

const HOW_MANY = (n: number): string =>
  n === 2 ? 'two' : n === 3 ? 'three' : n === 4 ? 'four' : n <= 7 ? 'several' : 'many';

/** Every pet on the level comes next to the hero. ref: src/apply.c magic_whistled() */
function magicWhistled(ctx: Ctx, obj: Entity): void {
  const alreadyDiscovered = isKnown(ctx.state, ctx.defs, obj.def);
  const hp = hero(ctx).c.pos;
  const level = hp ? ctx.state.levels[hp.level] : undefined;
  if (!hp || !level) return;
  if (inStasis(ctx.state, level.id)) return; // stasis prevents magic-whistling
  let shift = 0;
  let appear = 0;
  let disappear = 0;
  let trapped = 0;
  let shiftName: string | null = null;
  let appearName: string | null = null;
  let disappearName: string | null = null;
  for (const id of sortedIds(ctx.state)) {
    const mtmp = ctx.state.entities[String(id)];
    const mp = mtmp?.c.pos;
    // only tame monsters on this level are affected
    if (!mtmp?.c.monster?.tame || !mp || mp.level !== hp.level || (mtmp.c.hp?.cur ?? 1) < 1)
      continue;
    setMtrapped(ctx, id, false); // no longer in previous trap
    const oseen = canSpotMon(ctx, mtmp);
    const oname = oseen ? monNam(ctx, mtmp) : null;
    const omx = mp.x;
    const omy = mp.y;
    // mnexto(): next to the hero, if there is room
    const spot = mnextoPos(ctx, level, id, hp);
    if (!spot) continue;
    mtmp.c.pos = { level: hp.level, x: spot.x, y: spot.y };
    if (spot.x === omx && spot.y === omy) continue;
    if (!alreadyDiscovered) {
      // rloc(RLOC_MSG): the vanishing and appearing messages
      const nseen = canSpotMon(ctx, mtmp);
      if (oseen && nseen) say(ctx, 'whistle.vanish_reappear', { mon: monNam(ctx, mtmp) });
      else if (oseen) say(ctx, 'whistle.vanishes', { mon: oname ?? '' });
      else if (nseen)
        say(ctx, heroHas(ctx.state, P.BLINDED) ? 'whistle.arrives' : 'whistle.appears', {
          mon: monNam(ctx, mtmp),
        });
    }
    const res = mintrap(ctx, id);
    if (res === 'killed') changeLuck(ctx, -1);
    if (res !== 'finished') {
      ++trapped;
      continue;
    }
    const alive = ctx.state.entities[String(id)]?.c.monster !== undefined;
    const nseen = alive && canSpotMon(ctx, mtmp);
    if (nseen) {
      if (oseen) {
        if (++shift === 1) shiftName = monNam(ctx, mtmp);
      } else if (++appear === 1) appearName = monNam(ctx, mtmp);
    } else if (oseen) {
      if (++disappear === 1) disappearName = oname;
    }
  }
  if (!alreadyDiscovered) {
    // if only noticeable change was pet(s) disappearing, the magic whistle won't become discovered
    if (shift + appear + trapped > 0) discover(ctx, obj.def);
    return;
  }
  if (shift === 1) say(ctx, 'whistle.shifts', { mon: shiftName ?? '' });
  else if (shift > 1) say(ctx, 'whistle.shift_n', { n: { key: `whistle.n.${HOW_MANY(shift)}` } });
  if (appear === 1) say(ctx, 'whistle.appears_one', { mon: appearName ?? '' });
  else if (appear > 1)
    say(ctx, 'whistle.appear_n', { n: { key: `whistle.n.${HOW_MANY(appear)}` } });
  if (disappear === 1) say(ctx, 'whistle.disappears', { mon: disappearName ?? '' });
  else if (disappear > 1)
    say(ctx, 'whistle.disappear_n', { n: { key: `whistle.n.${HOW_MANY(disappear)}` } });
}

/**
 * The hero lands next to a random pet (teleds() with its "You materialize..." message and spot
 * effects). ref: src/teleport.c tele_to_rnd_pet(), teleok()
 */
function teleToRndPet(ctx: Ctx): void {
  const h = hero(ctx);
  const hp = h.c.pos;
  if (!hp) return;
  let pet: Entity | null = null;
  let cnt = 0;
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    if (!m?.c.monster?.tame || m.c.pos?.level !== hp.level) continue;
    cnt++;
    if (!ctx.rng.rn2(cnt)) pet = m;
  }
  const pp = pet?.c.pos;
  if (!pp || Math.max(Math.abs(pp.x - hp.x), Math.abs(pp.y - hp.y)) <= 1) return;
  const tx = pp.x + ctx.rng.rn2(3) - 1;
  const ty = pp.y + ctx.rng.rn2(3) - 1;
  const level = ctx.state.levels[hp.level];
  if (!level || !inBounds(level, tx, ty)) return; // isok()
  if (teleok(ctx, level, tx, ty, false)) teleds(ctx, tx, ty, { teleport: true });
}

/** ref: src/apply.c use_magic_whistle() */
function useMagicWhistle(ctx: Ctx, obj: Entity): void {
  if (obj.c.item?.buc === 'cursed' && !ctx.rng.rn2(2)) {
    say(ctx, 'whistle.humming');
    wakeNearby(ctx);
    const level = ctx.state.levels[hero(ctx).c.pos?.level ?? ''];
    if (!ctx.rng.rn2(2) && level && !noteleportLevel(ctx, level)) teleToRndPet(ctx);
    return;
  }
  // it's magic!  it works underwater too (at a higher pitch)
  say(ctx, 'whistle.sound', {
    how: { key: heroHas(ctx.state, P.HALLUC) ? 'whistle.normal' : 'whistle.strange' },
  });
  magicWhistled(ctx, obj);
}

// ---------------------------------------------------------------------------------------------
// the action

/** The polymorphed form has no hands. ref: include/mondata.h nohands() */
const formNohands = (ctx: Ctx): boolean => {
  const form = heroForm(ctx);
  return !!form && nohands(form);
};

const apply: ActionDef = {
  id: APPLY_ID,
  labelKey: 'action.nh:apply',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    // applying a wand breaks it: its own "Break" offer (still #apply, so `a` lists wands)
    const wand = e !== null && ctx.defs.object(e.def).class === 'wand';
    return e && applicable(ctx, e) && !formNohands(ctx)
      ? [
          {
            action: { type: 'mod', action: APPLY_ID, args: { item: e.id } },
            labelKey: wand ? 'action.nh:break' : 'action.nh:apply',
          },
        ]
      : [];
  },
  // ref: src/apply.c doapply()
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    const obj = heroItem(ctx, (action.args as { item?: unknown } | undefined)?.item);
    // ref: doapply(): a form without hands, before anything else (no time)
    if (formNohands(ctx)) {
      say(ctx, 'apply.nohands');
      return 0;
    }
    if (!obj || !applicable(ctx, obj)) {
      say(ctx, 'apply.cant');
      return 0;
    }
    if (checkCapacity(ctx)) return 0;
    const def = ctx.defs.object(obj.def);
    if (def.class === 'wand') return doBreakWand(ctx, obj, APPLY_ID);
    if (def.container) return useContainer(ctx, obj);
    if (isLockTool(obj.def)) return applyLockTool(ctx, obj);
    if (isPick(def)) return usePickAxe(ctx, obj);
    if (isPole(def)) return usePole(ctx, obj, false);
    if (isLamp(obj.def)) useLamp(ctx, obj);
    else if (obj.def === WHISTLE.magic) useMagicWhistle(ctx, obj);
    else if (obj.def === WHISTLE.tin) useWhistle(ctx, obj);
    else if (isEyewear(obj.def)) {
      const ublindf = wornIn(ctx.state, ctx.state.playerId, 'blindfold');
      if (ublindf?.id === obj.id) {
        if (!cursedWorn(ctx, obj)) blindfOff(ctx, obj);
      } else if (!ublindf) blindfOn(ctx, obj);
      else say(ctx, 'puton.already_blindfold');
    }
    return NORMAL_SPEED;
  },
  // "Are you really sure you want to break X?"
  answer: answerBreakWand,
  // a lock tool may start the lock-picking occupation (lock.ts); a pick being wielded is swung
  // on the next move (dig.ts), a polearm being wielded is applied on the next move (pole.ts)
  continues: (ctx) =>
    ctx.state.occupation?.action.type === 'mod' &&
    (ctx.state.occupation.action.action === 'nh:picklock' ||
      ctx.state.occupation.action.action === DIG_ID ||
      ctx.state.occupation.action.action === POLE_ID),
};

export const APPLY_ACTIONS: readonly ActionDef[] = [apply, poleAction];
