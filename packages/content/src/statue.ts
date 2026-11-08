// Statues: making one of a given monster (mkcorpstat(STATUE)), breaking one (break_statue()),
// and statue traps: the "living" statue a statue trap is made with (mk_trap_statue()), setting one
// off (activate_statue_trap()) and a statue coming to life (animate_statue(), also stone to
// flesh's). The random monster and spellbook of a new statue are mkobj.ts mksobjStatue(); the
// historic flag and the look are statuestate.ts; a monster turned to stone leaves its statue
// through mondeath.ts makeStatue(). Sits below zap.ts, dig.ts, dokick.ts and scatter.ts; trap.ts
// reaches the statue trap through setTrapEffect().
// ref: src/mkobj.c mkcorpstat(); src/zap.c break_statue(); src/trap.c mk_trap_statue(),
// animate_statue(), activate_statue_trap(), trapeffect_statue_trap(); src/read.c cant_revive()
//
// Not ported: genders, shop billing for a fractured statue (fracture_rock()'s breakobj()), saved
// monster traits (`omonst`: a stoned monster's statue comes to life as a new monster of its kind),
// named statues, mimics and hiders, golems (no golems: no flesh golem transformation),
// doppelgangers (a unique monster's statue does not come to life: cant_revive() would make a
// doppelganger, which the roster lacks), quest guardians, the hero hiding under objects.
import {
  contents,
  getPlayer,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type LevelId,
  type MonsterDef,
  type Msg,
  type Trap,
} from '@nh/core';
import { fractureRock } from './boulder';
import { costlySpot } from './eshk';
import { makemon } from './generation';
import { mapInvisible } from './invis';
import { placeObject, removeFromInventory } from './items';
import { adjalign, uState } from './luck';
import { mksobjStatue, rndmonnum, type MkobjCtx } from './mkobj';
import { nonliving } from './mondata';
import { forgetMonster, mDoWear, minvent } from './mongear';
import { forgetMState } from './mstate';
import { xnameOf } from './objnam';
import { canSpotMon, monNam, rndmonnam } from './perception';
import { P, hasProp } from './props';
import { shkYour, shopAt } from './revive';
import { stolenValue } from './shk';
import { mpickobj } from './steal';
import { STATUE, isHistoric, pruneHistoric, setHistoric } from './statuestate';
import { TRAP, cansee, setTrapEffect } from './trap';
import { stopOccupation } from './eat';
import type { Entity, ModApi } from '@nh/core';

/** ref: include/monsters.h PM_ARCHEOLOGIST (no such role yet) */
const ARCHEOLOGIST: DefId = 'nh:archeologist';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * A statue of `mon` (null: a random monster) at `at`. With `init` (CORPSTAT_INIT) it is made as
 * mksobj(STATUE, TRUE) makes it: the random monster rolled, maybe a spellbook inside, then `mon`
 * put in its place; `historic` is CORPSTAT_HISTORIC. ref: src/mkobj.c mkcorpstat(STATUE, ...)
 */
export function mkcorpstat(
  ctx: MkobjCtx,
  mon: DefId | null,
  at: { level: LevelId; x: number; y: number },
  opts: { init?: boolean; historic?: boolean; inMklev?: boolean } = {},
): EntityId {
  const id = mksobjStatue(
    ctx,
    ctx.defs.object(STATUE),
    { at, init: opts.init === true, ...(mon !== null ? { corpseOf: mon } : {}) },
    { level: at.level, inMklev: opts.inMklev === true },
  );
  if (opts.historic) setHistoric(ctx, id, true);
  return id;
}

/**
 * A statue on the floor hit by striking, force bolt, a pick-axe or a blast: what it held drops
 * where it stands and it becomes a pile of rocks (fracture_rock()). An Archeologist breaking a
 * historic statue feels guilty (-1 alignment). On a statue trap the statue comes to life instead
 * ("Instead of shattering, ..."): false then. No message otherwise: the callers say what was seen
 * or heard. ref: src/zap.c break_statue()
 */
export function breakStatue(ctx: Ctx, obj: Entity, byYou = true): boolean {
  const p = obj.c.pos;
  if (!p) return false;
  const level = ctx.state.levels[p.level];
  const trap = level ? trapAt(level, p.x, p.y) : undefined;
  if (trap?.def === TRAP.statue && activateStatueTrap(ctx, p.level, trap, true, byYou))
    return false;
  // drop any objects contained inside the statue
  for (const item of contents(ctx.state, obj.id)) {
    const it = item.c.item;
    if (!it) continue;
    delete it.containedIn;
    placeObject(ctx, item.id, p.level, p.x, p.y);
  }
  if (byYou && getPlayer(ctx.state).def === ARCHEOLOGIST && isHistoric(ctx.state, obj.id)) {
    ctx.emit({ type: 'msg', key: 'statue.historic_guilt' });
    adjalign(ctx, -1);
  }
  setHistoric(ctx, obj.id, false); // obj->spe = 0
  fractureRock(ctx, obj, byYou);
  return true;
}

// ---------------------------------------------------------------------------------------------
// statue traps

/** ref: include/mondata.h is_unicorn(): S_UNICORN && likes_gems() */
const isUnicorn = (def: MonsterDef): boolean =>
  def.glyph.ch === 'u' && def.flags.includes('jewels');

/**
 * mongone() of the statue trap's stand-in: it leaves the game (its inventory is in the statue).
 * ref: src/mon.c mongone()
 */
function mongone(ctx: Ctx, id: EntityId): void {
  forgetMonster(ctx, id);
  forgetMState(ctx, id);
  ctx.remove(id);
}

/**
 * The statue a statue trap is made with: a monster of a slightly harder kind than the level's
 * (rndmonnum_adj(3, 6); a unicorn of the hero's alignment is rerolled up to 10 times), made and
 * then removed so its starting inventory ends up inside the statue.
 * ref: src/trap.c mk_trap_statue()
 */
export function mkTrapStatue(
  ctx: Ctx,
  levelId: LevelId,
  x: number,
  y: number,
  inMklev: boolean,
): void {
  const depth = ctx.state.levels[levelId]?.depth ?? 1;
  const ualign = Math.sign(uState(ctx.state).alignType);
  let trycount = 10;
  let mptr: MonsterDef;
  // avoid ultimately hostile co-aligned unicorn
  do mptr = rndmonnum(ctx, depth, 3, 6);
  while (--trycount > 0 && isUnicorn(mptr) && ualign === Math.sign(mptr.alignment));
  const statue = mkcorpstat(ctx, mptr.id, { level: levelId, x, y }, { inMklev });
  const mtmp = makemon(ctx, mptr, null, { level: levelId, inMklev }); // MM_NOCOUNTBIRTH | MM_NOMSG
  if (mtmp === null) return; // should never happen
  for (const o of minvent(ctx, mtmp)) {
    const it = o.c.item;
    if (!it) continue;
    removeFromInventory(ctx, o.id); // otmp->owornmask = 0; obj_extract_self()
    it.containedIn = statue; // add_to_container()
    it.placed = ctx.state.seq++;
  }
  mongone(ctx, mtmp);
}

/** Why a statue came to life: ANIMATE_NORMAL, ANIMATE_SHATTER, ANIMATE_SPELL (include/trap.h) */
export type AnimateCause = 'normal' | 'shatter' | 'spell';

/** animate_statue()'s result: the monster, or why there is none (AS_MON_IS_UNIQUE, AS_NO_MON). */
export interface Animated {
  mon: Entity | null;
  fail: 'unique' | 'nomon' | null;
}

/**
 * Monster types cant_revive() turns into a human zombie. ref: src/read.c cant_revive() (PM_GUARD,
 * PM_HIGH_CLERIC, PM_ALIGNED_CLERIC, PM_ANGEL; shopkeepers may be revived)
 */
const ZOMBIFIED: readonly DefId[] = ['nh:guard', 'nh:high_cleric', 'nh:aligned_cleric', 'nh:angel'];

/**
 * The statue comes to life as its monster, at (x, y) or next to it when that square is taken
 * (only for the spell, or when the hero stands there: makemon()'s `byyou`): awake, and hostile
 * when a trap or a blow set it off; its contents become the monster's inventory, which it puts on.
 * "The statue comes to life!" when she stands there, "The statue of a jackal comes to life!" for
 * the spell, "Instead of shattering, the statue of a jackal suddenly comes to life!" for a blow, else
 * "You find a jackal posing as a statue."; an unseen monster "disappears", a nonliving one
 * "moves". The hero pays for a shop's statue (not for a trap's). An Archeologist feels guilty
 * about a historic statue (-1 alignment); `byYou` false (a monster's doing): regret, no penalty.
 * The statue is gone. ref: src/trap.c animate_statue()
 */
export function animateStatue(
  ctx: Ctx,
  statue: Entity,
  x: number,
  y: number,
  cause: AnimateCause,
  byYou = true,
): Animated {
  const sit = statue.c.item;
  const montype = sit?.corpseOf;
  if (!sit || !montype || !ctx.defs.isMonster(montype)) return { mon: null, fail: 'nomon' };
  const hero = getPlayer(ctx.state);
  const historic = hero.def === ARCHEOLOGIST && isHistoric(ctx.state, statue.id);
  let mptr = ctx.defs.monster(montype);
  // cant_revive(): some monsters become human zombies, unique ones doppelgangers (none here)
  if (ZOMBIFIED.includes(montype) && ctx.defs.isMonster('nh:human_zombie'))
    mptr = ctx.defs.monster('nh:human_zombie');
  else if (mptr.genFlags.includes('uniq')) return { mon: null, fail: 'unique' };

  const levelId = statue.c.pos?.level ?? hero.c.pos?.level ?? ctx.state.currentLevel;
  const hp = hero.c.pos;
  const uAt = !!hp && hp.level === levelId && hp.x === x && hp.y === y;
  // NO_MINVENT | MM_NOMSG (| MM_ADJACENTOK for the spell; makemon() moves it off her square)
  const id = makemon(
    ctx,
    mptr,
    { x, y },
    { level: levelId, noInventory: true, nogroup: true, adjacentOk: cause === 'spell' || uAt },
  );
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  if (!mon?.c.monster) return { mon: null, fail: 'nomon' };

  mon.c.monster.asleep = false; // msleeping = 0
  if (cause === 'normal' || cause === 'shatter') {
    // trap always releases hostile monster
    delete mon.c.monster.tame;
    mon.c.monster.peaceful = false;
  }

  const how: Msg = {
    key: !canSpotMon(ctx, mon)
      ? 'statue.how.disappears'
      : nonliving(mptr)
        ? 'statue.how.moves'
        : 'statue.how.comes_to_life',
  };
  if (uAt || cause === 'spell') {
    // "the|your|Manlobbi's statue [of a wombat]"
    say(ctx, 'statue.animate', {
      owner: shkYour(ctx, statue, true),
      statue: cause === 'spell' ? xnameOf(ctx.state, ctx.defs, statue) : '@statue.word',
      how,
    });
  } else if (hasProp(hero, P.HALLUC)) {
    // they don't know it's a statue
    say(ctx, 'statue.animate.halluc', { mon: `@${rndmonnam(ctx)}` });
  } else if (cause === 'shatter') {
    if (cansee(ctx, levelId, x, y))
      say(ctx, 'statue.animate.shatter', {
        owner: shkYour(ctx, statue, false),
        statue: xnameOf(ctx.state, ctx.defs, statue),
        how,
      });
    else say(ctx, 'statue.animate.shatter_unseen', { how });
  } else {
    if (canSpotMon(ctx, mon)) say(ctx, 'statue.animate.posing', { mon: monNam(ctx, mon) });
    else {
      say(ctx, 'statue.animate.posing_something');
      if (hasProp(hero, P.BLINDED)) mapInvisible(ctx, x, y);
    }
    stopOccupation(ctx);
  }

  if (byYou) {
    // if the statue is owned by a shop, the hero has to pay for it (not for a trap's)
    const carried = sit.carriedBy === hero.id;
    if (
      cause !== 'normal' &&
      levelId === ctx.state.currentLevel &&
      costlySpot(ctx, x, y) &&
      (carried ? !!sit.unpaid : !sit.noCharge)
    ) {
      const shkp = shopAt(ctx, x, y);
      // avoid charging for Manlobbi's statue of Manlobbi
      if (shkp && shkp.id !== mon.id)
        stolenValue(ctx, statue, x, y, !!shkp.c.monster?.peaceful, false);
    }
    if (historic) {
      say(ctx, 'statue.historic_gone_guilty');
      adjalign(ctx, -1);
    }
  } else if (historic && cansee(ctx, levelId, x, y)) say(ctx, 'statue.historic_gone_regret');

  // transfer any statue contents to monster's inventory
  for (const item of contents(ctx.state, statue.id)) {
    if (!item.c.item) continue;
    delete item.c.item.containedIn; // obj_extract_self()
    mpickobj(ctx, mon.id, item);
  }
  mDoWear(ctx, mon.id, true);
  // statue no longer exists (in case she carried it: zapped stone to flesh at herself)
  if (sit.carriedBy !== null && sit.carriedBy !== undefined) removeFromInventory(ctx, statue.id);
  setHistoric(ctx, statue.id, false);
  ctx.remove(statue.id);
  return { mon, fail: null };
}

/**
 * A statue trap goes off: stepped on, found by searching, kicked, struck by force bolt or striking
 * (`shatter`) or dug at. The trap is gone; the first statue there that can come to life does
 * (past unique monsters' statues). Returns the monster, or null.
 * ref: src/trap.c activate_statue_trap()
 */
export function activateStatueTrap(
  ctx: Ctx,
  levelId: LevelId,
  trap: Trap,
  shatter: boolean,
  byYou = true,
): Entity | null {
  const { x, y } = trap;
  ctx.removeTrap(levelId, { x, y }); // deltrap()
  // the statues there, top first (sobj_at(), then nxtobj(otmp, STATUE, TRUE))
  const statues = itemsAt(ctx.defs, ctx.state, levelId, x, y).filter((o) => o.def === STATUE);
  for (const otmp of statues) {
    const r = animateStatue(ctx, otmp, x, y, shatter ? 'shatter' : 'normal', byYou);
    if (r.mon || r.fail !== 'unique') return r.mon;
  }
  return null;
}

/** The hero's level (statue traps go off only there). */
const heroLevel = (ctx: Ctx): LevelId =>
  getPlayer(ctx.state).c.pos?.level ?? ctx.state.currentLevel;

/** Statues: their historic flags are dropped once they are gone; the statue trap. */
export function registerStatues(api: ModApi): void {
  api.on('endOfTurn', (ctx) => pruneHistoric(ctx));
  setTrapEffect(TRAP.statue, {
    // ref: src/trap.c trapeffect_statue_trap(): the hero sets it off at her feet
    you: (ctx, trap) => void activateStatueTrap(ctx, heroLevel(ctx), trap, false),
    // monsters don't trigger statue traps
    mon: () => 'finished',
    made: (ctx, levelId, trap, inMklev) => mkTrapStatue(ctx, levelId, trap.x, trap.y, inMklev),
  });
}
