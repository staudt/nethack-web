// Monsters using items and the level to save themselves: find_defensive() picks what to do,
// use_defensive() does it (in the same move: nothing about the choice is kept). This step has the
// item-free escapes (up or down the stairs, the branch stairs, into a trap door or hole, onto a
// teleportation trap, out of the dungeon from the first level's up stairs) and the healing
// potions; the defensive wands, scrolls, unicorn horn, lizard corpse and bugle come next.
// ref: src/muse.c find_defensive(), use_defensive(), precheck(), mquaffmsg(), m_use_healing(),
// m_tele(), reveal_trap(), mon_escape(); include/hack.h WAND_BACKFIRE_CHANCE
//
// Not ported: the ghost in a milky potion and the djinni in a smoky one (precheck(); as for the
// hero's quaff), ladders, Pestilence, the Wizard, monsters carrying the Amulet (mon_has_amulet(),
// mon_has_special(): never), Fort Ludios (m_next2m(): never reached), deafness (never deaf).
import {
  cellIndex,
  getLevel,
  getPlayer,
  levelIdFor,
  rootDungeon,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Level,
  type Msg,
  type Pos,
  type Trap,
} from '@nh/core';
import { couldseeAt } from './apparxy';
import { boulderAt } from './boulder';
import { uswallow } from './engulfstate';
import { epriOf } from './epri';
import { useOne } from './erode';
import { eshkOf } from './eshk';
import { ustuck } from './hackmove';
import { maybeUnhideAt } from './hide';
import { canseemon } from './invis';
import { migrateToLevel } from './migrate';
import { amorphous, isFlyer, nohands, nolimbs, slithy } from './mondata';
import { mongone, monkilled } from './mondeath';
import { minvent } from './mongear';
import { isFleeing, monflee } from './monflee';
import { healmon, mcansee } from './mstate';
import { mcureblindness } from './musestate';
import { discover } from './o_init';
import { doname, xnameOf } from './objnam';
import { monNam } from './perception';
import { onscary } from './scary';
import { isAnimal } from './steal';
import { T, setTerrain } from './terrain';
import { TRAP, canFallThru, cansee, isHole, mintrap, seetrap } from './trap';
import { isMtrapped, monLearnsTraps } from './trapstate';
import { noteleportLevel, teleRestrict } from './teleport';
import { isGuard } from './vaultstate';
import { wormMove } from './worm';
import { mAt, wormRec } from './wormstate';

/** The defensive choices. ref: src/muse.c MUSE_* (the defensive ones; no ladders) */
export type MuseDef =
  | 'scr_tele'
  | 'wan_tele_self'
  | 'wan_tele'
  | 'pot_healing'
  | 'pot_extra_healing'
  | 'pot_full_healing'
  | 'wan_digging'
  | 'trapdoor'
  | 'teleport_trap'
  | 'upstairs'
  | 'downstairs'
  | 'sstairs'
  | 'wan_create_monster'
  | 'scr_create_monster'
  | 'bugle'
  | 'unicorn_horn'
  | 'lizard_corpse'
  | 'wan_undead_turning';

/** A monster's choice: C's gm.m.has_defense/defensive, and gt.trapx/trapy for a trap. */
export interface MuseChoice<K> {
  kind: K;
  obj: EntityId | null;
  trap?: Pos;
}

/** 0: nothing happened; 1: the monster died; 2: it acted (and can't attack this move). */
export type MuseResult = 0 | 1 | 2;

/** ref: include/hack.h WAND_BACKFIRE_CHANCE */
const WAND_BACKFIRE_CHANCE = 100;
/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

const POT_HEALING: DefId = 'nh:potion_of_healing';
const POT_EXTRA_HEALING: DefId = 'nh:potion_of_extra_healing';
const POT_FULL_HEALING: DefId = 'nh:potion_of_full_healing';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const dist2 = (x0: number, y0: number, x1: number, y1: number): number =>
  (x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1);

/** ref: include/mondata.h mindless(): M1_MINDLESS */
const mindless = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('mindless');

/** ref: include/mondata.h is_floater(): S_EYE and S_LIGHT */
const isFloater = (ctx: Ctx, mon: Entity): boolean => {
  const ch = ctx.defs.monster(mon.def).glyph.ch;
  return ch === 'e' || ch === 'y';
};

/** ref: include/mondata.h verysmall(), throws_rocks(), passes_walls() */
const ignoresBoulders = (ctx: Ctx, mon: Entity): boolean => {
  const def = ctx.defs.monster(mon.def);
  return def.size === 'tiny' || def.flags.includes('rockthrow') || def.flags.includes('wallwalk');
};

/** ref: include/mondata.h NODIAG(): the grid bug */
const noDiag = (mon: Entity): boolean => mon.def === 'nh:grid_bug';

/** isshk, isgd, ispriest */
const isShkGdPriest = (ctx: Ctx, id: EntityId): boolean =>
  eshkOf(ctx, id) !== null || isGuard(ctx.state, id) || epriOf(ctx, id) !== null;

/** ref: src/mkobj.c bcsign() */
const bcsign = (o: Entity): number =>
  o.c.item?.buc === 'blessed' ? 1 : o.c.item?.buc === 'cursed' ? -1 : 0;

/** The first carried object of type `otyp` in minvent order. ref: src/invent.c m_carrying() */
const mCarrying = (ctx: Ctx, id: EntityId, otyp: DefId): Entity | null =>
  minvent(ctx, id).find((o) => o.def === otyp) ?? null;

/** The terrain's stairs at (x, y): 'up', 'down' or undefined. ref: levl[x][y].typ == STAIRS */
function stairsAt(ctx: Ctx, level: Level, x: number, y: number): 'up' | 'down' | undefined {
  const t = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  return t === undefined ? undefined : ctx.defs.terrain(t).stairs;
}

/** ledger_no(&u.uz) == 1: the first level of the Dungeons of Doom. */
const firstLevel = (ctx: Ctx, level: Level): boolean =>
  level.dungeon === rootDungeon(ctx.state).id && level.dlevel === 1;

/**
 * Whether a monster close to "seeing" range is near enough to be heard nearby: the same near/far
 * threshold as mzapwand(): within 9 squares where the hero could see it, 5 otherwise.
 */
function heardNearby(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  if (!p || !hp) return false;
  const range = couldseeAt(ctx, p.x, p.y) ? BOLT_LIM + 1 : BOLT_LIM - 3;
  return dist2(p.x, p.y, hp.x, hp.y) <= range * range;
}

/**
 * Whatever can go wrong before the monster uses `obj`: a cursed wand blows up one time in 100
 * (`d(spe + 2, 6)` to the monster, "The kobold zaps a wand of striking, which suddenly
 * explodes!", or "You hear a zap and an explosion nearby." unseen). Returns 1 when that killed it,
 * -1 when the wand blew up (the choice is gone: use_defensive() does nothing more), else 0.
 * ref: src/muse.c precheck() (not ported: the milky potion's ghost and the smoky potion's djinni)
 */
export function precheck(ctx: Ctx, id: EntityId, obj: Entity | null): -1 | 0 | 1 {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  const it = obj?.c.item;
  if (!mon || !p || !obj || !it) return 0;
  const vis = cansee(ctx, p.level, p.x, p.y);
  if (ctx.defs.object(obj.def).class !== 'wand' || it.buc !== 'cursed') return 0;
  if (ctx.rng.rn2(WAND_BACKFIRE_CHANCE)) return 0;
  const dam = ctx.rng.d(it.spe + 2, 6);
  if (vis)
    say(ctx, 'muse.wand_explodes', {
      mon: monNam(ctx, mon),
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
  else say(ctx, heardNearby(ctx, mon) ? 'muse.hear_zap_explode_near' : 'muse.hear_zap_explode_far');
  useOne(ctx, id, obj);
  const hp = mon.c.hp;
  if (hp) {
    hp.cur -= dam;
    if (hp.cur <= 0) {
      monkilled(ctx, id, true); // AD_RBRE
      return 1;
    }
  }
  return -1;
}

/** ref: src/muse.c m_use_healing(): full, then extra, then plain healing */
function mUseHealing(ctx: Ctx, id: EntityId): MuseChoice<MuseDef> | null {
  for (const [otyp, kind] of [
    [POT_FULL_HEALING, 'pot_full_healing'],
    [POT_EXTRA_HEALING, 'pot_extra_healing'],
    [POT_HEALING, 'pot_healing'],
  ] as const) {
    const o = mCarrying(ctx, id, otyp);
    if (o) return { kind, obj: o.id };
  }
  return null;
}

/**
 * Looks for a defensive item or escape for the monster: null when there is none. `tryescape`
 * (m_move(): it has nowhere to go) skips the distance and wound checks. `mux` is where it thinks
 * the hero is (default: its kept guess, else her square).
 * ref: src/muse.c find_defensive() (the unicorn horn, lizard corpse, bugle, undead turning and the
 * wands and scrolls of the inventory loop come with the next step; Pestilence is not ported)
 */
export function findDefensive(
  ctx: Ctx,
  id: EntityId,
  tryescape: boolean,
  mux?: Pos,
): MuseChoice<MuseDef> | null {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  const m = mon?.c.monster;
  if (!mon || !p || !m) return null;
  const def = ctx.defs.monster(mon.def);
  const level = getLevel(ctx.state, p.level);
  const { x, y } = p;
  const stuck = ustuck(ctx) === id;
  const immobile = def.speed === 0;
  const hp = getPlayer(ctx.state).c.pos;
  const mu = mux ?? hp ?? p;

  if (isAnimal(def) || mindless(ctx, mon)) return null;
  if (!tryescape && dist2(x, y, mu.x, mu.y) > 25) return null;
  // (Fort Ludios' m_next2m() test: there is no Fort Ludios)
  if (uswallow(ctx) && stuck) return null;

  // the unicorn horn when confused, stunned or blind, and the lizard corpse when confused or
  // stunned: the next step

  // "the first case is when the monster is blind (healing cures blindness)"
  if (!mcansee(ctx, id) && !nohands(def)) {
    const c = mUseHealing(ctx, id);
    if (c) return c;
  }

  // the wand of undead turning against a cockatrice-corpse wielder: the next step

  if (!tryescape) {
    // "do we try to heal?"
    const ulevel = getPlayer(ctx.state).c.experience?.level ?? 1;
    const fraction = ulevel < 10 ? 5 : ulevel < 14 ? 4 : 3;
    const cur = mon.c.hp?.cur ?? 0;
    const max = mon.c.hp?.max ?? 0;
    if (cur >= max || (cur >= 10 && cur * fraction >= max)) return null;
    if (m.peaceful) return nohands(def) ? null : mUseHealing(ctx, id);
  }

  let choice: MuseChoice<MuseDef> | null = null;
  if (stuck || immobile || isMtrapped(ctx, id)) {
    // "fleeing by stairs or traps is not possible"
  } else if (stairsAt(ctx, level, x, y) !== undefined) {
    const b = level.branch;
    if (b && b.pos.x === x && b.pos.y === y) {
      if (b.dir === 'up' || !isFloater(ctx, mon)) choice = { kind: 'sstairs', obj: null };
    } else if (stairsAt(ctx, level, x, y) === 'down') {
      if (!isFloater(ctx, mon)) choice = { kind: 'downstairs', obj: null };
    } else choice = { kind: 'upstairs', obj: null };
  } else {
    // "Note: trap doors take precedence over teleport traps."; the monster's own square first,
    // then its neighbours (x outer, y inner)
    const diagOk = !noDiag(mon);
    const locs: Pos[] = [{ x, y }];
    for (let xx = x - 1; xx <= x + 1; xx++)
      for (let yy = y - 1; yy <= y + 1; yy++)
        if (xx >= 0 && yy >= 0 && xx < level.width && yy < level.height && (xx !== x || yy !== y))
          locs.push({ x: xx, y: yy });
    for (const l of locs) {
      // not the hero's square, not a diagonal for a grid bug, no other monster there
      if (hp && hp.level === level.id && hp.x === l.x && hp.y === l.y) continue;
      if (l.x !== x && l.y !== y && !diagOk) continue;
      if ((l.x !== x || l.y !== y) && mAt(ctx.state, level.id, l.x, l.y)) continue;
      const t = trapAt(level, l.x, l.y);
      if (
        !t ||
        (!ignoresBoulders(ctx, mon) && boulderAt(ctx, level.id, l.x, l.y)) ||
        onscary(ctx, l.x, l.y, mon)
      )
        continue;
      if (
        isHole(t.def) &&
        !isFloater(ctx, mon) &&
        !isShkGdPriest(ctx, id) &&
        canFallThru(ctx.state, level)
      ) {
        choice = { kind: 'trapdoor', obj: null, trap: { x: l.x, y: l.y } };
        break; // "no need to look at any other spots"
      } else if (t.def === TRAP.tele) {
        choice = { kind: 'teleport_trap', obj: null, trap: { x: l.x, y: l.y } };
      }
    }
  }

  if (nohands(def)) return choice; // "can't use objects"
  // the mercenary's bugle: the next step

  // "use immediate physical escape prior to attempting magic"
  if (choice) return choice;

  // the inventory loop, in minvent order; "don't always use the same selection pattern"
  // (`nomore(x)`: once x is chosen, later objects of its kind are passed over). The wand of
  // digging, the teleportation wand and scroll, the create monster wand and scroll and their
  // checks come with the next step.
  for (const obj of minvent(ctx, id)) {
    if (choice && !ctx.rng.rn2(3)) break;
    const kind = choice?.kind;
    if (kind === 'wan_digging') break;
    // (not Pestilence)
    if (kind === 'pot_full_healing') continue;
    if (obj.def === POT_FULL_HEALING) choice = { kind: 'pot_full_healing', obj: obj.id };
    if (choice?.kind === 'pot_extra_healing') continue;
    if (obj.def === POT_EXTRA_HEALING) choice = { kind: 'pot_extra_healing', obj: obj.id };
    if (choice?.kind === 'pot_healing') continue;
    if (obj.def === POT_HEALING) choice = { kind: 'pot_healing', obj: obj.id };
  }
  return choice;
}

/**
 * A monster deliberately entering a trap in a niche opens the niche: a secret corridor there
 * becomes a corridor; the trap is seen when `seeit`. ref: src/muse.c reveal_trap()
 */
function revealTrap(ctx: Ctx, level: Level, t: Trap, seeit: boolean): void {
  const i = cellIndex(level, t.x, t.y);
  if (level.palette[level.cells[i] ?? 0] === T.scorr) setTerrain(level, t.x, t.y, T.corr);
  if (seeit) seetrap(t);
}

/**
 * The monster leaves the dungeon by the first level's up stairs, for good (with all it carries):
 * "The hill orc escapes the dungeon!" when seen. ref: src/muse.c mon_escape() (no Amulet or
 * invocation items, no Wizard)
 */
function monEscape(ctx: Ctx, mon: Entity, vismon: boolean): MuseResult {
  if (vismon) say(ctx, 'muse.escapes_dungeon', { mon: monNam(ctx, mon) });
  mongone(ctx, mon.id);
  return 2;
}

/**
 * The verb for the monster getting onto a trap: jumps, or floats, flies, slithers, oozes or
 * crawls. ref: include/mondata.h locomotion(ptr, "jump"), vtense()
 */
function jumpVerb(ctx: Ctx, mon: Entity): Msg {
  const def = ctx.defs.monster(mon.def);
  const v = isFloater(ctx, mon)
    ? 'float'
    : isFlyer(def)
      ? 'fly'
      : slithy(def)
        ? 'slither'
        : amorphous(def)
          ? 'ooze'
          : def.speed === 0
            ? 'wiggle'
            : nolimbs(def)
              ? 'crawl'
              : 'jump';
  return { key: `muse.loco.${v}` };
}

/**
 * The monster moves onto the trap square it chose (not rloc_to(): "worm tails must move").
 * ref: src/muse.c use_defensive() remove_monster()/place_monster()/worm_move()
 */
function stepOnto(ctx: Ctx, mon: Entity, to: Pos): void {
  const p = mon.c.pos;
  if (!p || (p.x === to.x && p.y === to.y)) return;
  const from = { x: p.x, y: p.y };
  p.x = to.x;
  p.y = to.y;
  ctx.emit({ type: 'moved', id: mon.id, from, to: { x: to.x, y: to.y } });
  if (wormRec(ctx.state, mon.id)) wormMove(ctx, mon.id, from);
}

/**
 * The monster teleports by a trap it chose to step on (`how` 0): unless the level forbids it
 * ("A mysterious force prevents the gnome from teleporting!", and it learns that teleport traps
 * do not work here), the trap goes off under it. ref: src/muse.c m_tele() (how == 0; no Amulet or
 * Wizard's Tower)
 */
function mTeleTrap(ctx: Ctx, mon: Entity): void {
  const p = mon.c.pos;
  if (!p) return;
  if (teleRestrict(ctx, mon)) {
    if (noteleportLevel(ctx, getLevel(ctx.state, p.level))) monLearnsTraps(ctx, mon.id, TRAP.tele);
  } else mintrap(ctx, mon.id, { force: true });
}

/**
 * Does what findDefensive() chose; call it right after. Returns 0 (nothing happened), 1 (it
 * died) or 2 (it acted: it can't attack). A monster that runs away flees for
 * `33 - 30 * hp / maxhp` turns unless it already flees (the `m_flee` macro).
 * ref: src/muse.c use_defensive() (the healing potions and the item-free escapes)
 */
export function useDefensive(ctx: Ctx, id: EntityId, c: MuseChoice<MuseDef>): MuseResult {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  if (!mon?.c.monster || !p) return 0;
  const otmp = c.obj === null ? null : (ctx.state.entities[String(c.obj)] ?? null);
  const pre = precheck(ctx, id, otmp);
  if (pre === 1) return 1;
  if (pre === -1) return 0; // "case 0: i.e. an exploded wand"
  const level = getLevel(ctx.state, p.level);
  const vis = cansee(ctx, p.level, p.x, p.y);
  const vismon = canseemon(ctx, mon);
  const oseen = otmp !== null && vismon;
  const hp = mon.c.hp ?? { cur: 1, max: 1 };
  // "when using defensive choice to run away, we want monster to avoid rushing right straight
  // back; don't override if already scared"
  const fleetim = !isFleeing(ctx, id) ? 33 - Math.trunc((30 * hp.cur) / Math.max(1, hp.max)) : 0;
  const mFlee = (): void => {
    if (fleetim) monflee(ctx, id, fleetim, false, false);
  };
  const name = (): string => monNam(ctx, mon);

  switch (c.kind) {
    case 'trapdoor': {
      // "trap doors on 'bottom' levels of dungeons are rock-drop trap doors"
      if (!canFallThru(ctx.state, level) || !c.trap) return 0;
      mFlee();
      const t = trapAt(level, c.trap.x, c.trap.y);
      if (!t) return 0;
      if (vis)
        say(ctx, 'muse.jumps_into', { mon: name(), verb: jumpVerb(ctx, mon), trap: `@${t.def}` });
      revealTrap(ctx, level, t, vis);
      stepOnto(ctx, mon, c.trap);
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel + 1 }),
      );
      return 2;
    }
    case 'upstairs': {
      mFlee();
      if (stairsAt(ctx, level, p.x, p.y) !== 'up') return 0;
      // "impossible; level 1 upstairs are SSTAIRS"
      if (firstLevel(ctx, level)) return monEscape(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.escapes_upstairs', { mon: name() });
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel - 1 }),
        'stairs_down',
      );
      return 2;
    }
    case 'downstairs': {
      mFlee();
      if (stairsAt(ctx, level, p.x, p.y) !== 'down') return 0;
      if (vismon) say(ctx, 'muse.escapes_downstairs', { mon: name() });
      migrateToLevel(
        ctx,
        mon,
        levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel + 1 }),
        'stairs_up',
      );
      return 2;
    }
    case 'sstairs': {
      mFlee();
      const b = level.branch;
      if (!b || b.pos.x !== p.x || b.pos.y !== p.y) return 0;
      if (firstLevel(ctx, level)) return monEscape(ctx, mon, vismon);
      if (vismon)
        say(ctx, b.dir === 'up' ? 'muse.escapes_upstairs' : 'muse.escapes_downstairs', {
          mon: name(),
        });
      migrateToLevel(ctx, mon, levelIdFor(ctx.state, b.to), 'sstairs');
      return 2;
    }
    case 'teleport_trap': {
      if (!c.trap) return 0;
      mFlee();
      const t = trapAt(level, c.trap.x, c.trap.y);
      if (!t) return 0;
      if (vis)
        say(ctx, 'muse.jumps_onto', { mon: name(), verb: jumpVerb(ctx, mon), trap: `@${t.def}` });
      revealTrap(ctx, level, t, vis);
      stepOnto(ctx, mon, c.trap);
      maybeUnhideAt(ctx, level.id, c.trap.x, c.trap.y);
      mTeleTrap(ctx, mon);
      return 2;
    }
    case 'pot_healing': {
      if (!otmp) return 0;
      mquaffmsg(ctx, mon, otmp);
      const i = ctx.rng.d(6 + 2 * bcsign(otmp), 4);
      healmon(mon, i, 1);
      if (otmp.c.item?.buc !== 'cursed' && !mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.looks_better', { mon: name() });
      if (oseen) discover(ctx, POT_HEALING);
      useOne(ctx, id, otmp);
      return 2;
    }
    case 'pot_extra_healing': {
      if (!otmp) return 0;
      mquaffmsg(ctx, mon, otmp);
      const i = ctx.rng.d(6 + 2 * bcsign(otmp), 8);
      healmon(mon, i, otmp.c.item?.buc === 'blessed' ? 5 : 2);
      if (!mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.looks_much_better', { mon: name() });
      if (oseen) discover(ctx, POT_EXTRA_HEALING);
      useOne(ctx, id, otmp);
      return 2;
    }
    case 'pot_full_healing': {
      if (!otmp) return 0;
      mquaffmsg(ctx, mon, otmp);
      healmon(mon, hp.max, otmp.c.item?.buc === 'blessed' ? 8 : 4);
      if (!mcansee(ctx, id)) mcureblindness(ctx, mon, vismon);
      if (vismon) say(ctx, 'muse.looks_completely_healed', { mon: name() });
      if (oseen) discover(ctx, otmp.def);
      useOne(ctx, id, otmp);
      return 2;
    }
    default:
      return 0; // the item cases of the next step
  }
}

/**
 * "The hill orc drinks a potion of healing!" when seen, else "You hear a chugging sound."
 * ref: src/muse.c mquaffmsg() (observe_object(): the port's objects are always dknown)
 */
function mquaffmsg(ctx: Ctx, mon: Entity, otmp: Entity): void {
  const it = otmp.c.item;
  if (canseemon(ctx, mon)) {
    const one: Entity = it ? { ...otmp, c: { ...otmp.c, item: { ...it, quantity: 1 } } } : otmp;
    say(ctx, 'muse.drinks', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, one) });
  } else say(ctx, 'muse.chugging');
}
