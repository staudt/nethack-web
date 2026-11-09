// Corpses: when a killed monster leaves one, and how corpses rot away.
// ref: src/mon.c xkilled(), corpse_chance(), make_corpse(); src/mkobj.c start_corpse_timeout()
import {
  getPlayer,
  rnl,
  type Ctx,
  type DefId,
  type EntityId,
  type Json,
  type ModApi,
  type MonsterDef,
} from '@nh/core';
import { mswallowerOf } from './engulfstate';
import { hungerData } from './hunger';
import { encumberMsg } from './itemactions';
import { mkcorpse, mkgold, mksobj, rne } from './items';
import { isUnicorn } from './mondata';
import { GLASS_GEMS } from './gem';
import { isGolem } from './golem';
import { luckOf } from './luck';
import { xnameOf } from './objnam';

/** ref: include/hack.h ROT_AGE: a corpse rots away at this age (turns) */
export const ROT_AGE = 250;

/** ref: include/hack.h TAINT_AGE: age when a corpse becomes tainted */
export const TAINT_AGE = 100;

/**
 * The corpse a zombie or mummy leaves: its living race. ref: src/mon.c undead_to_corpse()
 * (no vampires yet)
 */
const UNDEAD_TO_CORPSE: Readonly<Record<string, DefId>> = {
  'nh:kobold_zombie': 'nh:kobold',
  'nh:kobold_mummy': 'nh:kobold',
  'nh:dwarf_zombie': 'nh:dwarf',
  'nh:dwarf_mummy': 'nh:dwarf',
  'nh:gnome_zombie': 'nh:gnome',
  'nh:gnome_mummy': 'nh:gnome',
  'nh:orc_zombie': 'nh:orc',
  'nh:orc_mummy': 'nh:orc',
  'nh:elf_zombie': 'nh:elf',
  'nh:elf_mummy': 'nh:elf',
  'nh:human_zombie': 'nh:human',
  'nh:human_mummy': 'nh:human',
  'nh:giant_zombie': 'nh:giant',
  'nh:giant_mummy': 'nh:giant',
  'nh:ettin_zombie': 'nh:ettin',
  'nh:ettin_mummy': 'nh:ettin',
};

/** ref: include/mondata.h bigmonst() */
const bigmonst = (def: MonsterDef): boolean =>
  def.size === 'large' || def.size === 'huge' || def.size === 'gigantic';

/** ref: src/rnd.c rnz(): a number around `i`, widely spread, geometric in feel */
export function rnz(ctx: Pick<Ctx, 'state' | 'rng'>, i: number): number {
  const lvl = getPlayer(ctx.state).c.experience?.level ?? 1;
  let x = i;
  let tmp = 1000;
  tmp += ctx.rng.rn2(1000);
  tmp *= rne(ctx.rng, 4, lvl);
  if (ctx.rng.rn2(2)) {
    x *= tmp;
    x = Math.trunc(x / 1000);
  } else {
    x *= 1000;
    x = Math.trunc(x / tmp);
  }
  return x;
}

/**
 * A gas spore (any monster with an AT_BOOM attack) exploding as it dies: explode.ts registers it
 * (it sits above mondeath.ts, which calls in here). `byHero`: C's `!context.mon_moving`.
 */
export type DeathExplosion = (
  ctx: Ctx,
  def: MonsterDef,
  at: { level: string; x: number; y: number },
  byHero: boolean,
  swallower: EntityId | null,
) => void;
let deathExplosion: DeathExplosion | null = null;

/** Registers the AT_BOOM explosion (explode.ts, at load time). */
export function setDeathExplosion(fn: DeathExplosion): void {
  deathExplosion = fn;
}

/**
 * Whether a killed monster leaves a corpse. ref: src/mon.c corpse_chance(): big monsters always
 * do, as do golems; others with chance 1/(2 + (rare) + (tiny)). Not ported: liches, player
 * monsters, riders, shopkeepers, cloned monsters. (The gas spore's explosion is in
 * xkilledCorpse().)
 */
export function corpseChance(ctx: Ctx, def: MonsterDef): boolean {
  if (bigmonst(def) || isGolem(def)) return true;
  const tmp = 2 + (def.frequency < 2 ? 1 : 0) + (def.size === 'tiny' ? 1 : 0);
  return ctx.rng.rn2(tmp) === 0;
}

/** gm.mswallower, while it is an engulfer that still exists */
function swallowerOf(ctx: Ctx): EntityId | null {
  const id = mswallowerOf();
  const e = id === null ? undefined : ctx.state.entities[String(id)];
  if (!e?.c.monster) return null;
  return ctx.defs.monster(e.def).attacks.some((a) => a.at === 'engulf') ? (id as EntityId) : null;
}

/**
 * corpse_chance() for a monster swallowed whole by `magr` (C's `was_swallowed`): a gas spore
 * explodes inside it (and leaves nothing), else the usual chance. The caller makes no corpse; a
 * digesting pet takes the nourishment. ref: src/mon.c corpse_chance()
 */
export function corpseChanceSwallowed(
  ctx: Ctx,
  def: MonsterDef,
  at: { level: string; x: number; y: number },
  magr: EntityId,
): boolean {
  if (def.attacks.some((a) => a.at === 'boom')) {
    deathExplosion?.(ctx, def, at, false, magr);
    return false;
  }
  return corpseChance(ctx, def);
}

/** What make_corpse() reads of the dead monster, taken before it was removed. */
export interface DeadMon {
  /** `mtmp->mrevived` */
  revived: boolean;
  /** Its name when the hero saw it die (canseemon()) and it was revived, else null. */
  seen: string | null;
}

/**
 * The objects make_corpse() leaves besides the corpse: a long worm's tooth, a unicorn's horn
 * (which crumbles to dust half the time when the unicorn had been revived).
 * ref: src/mon.c make_corpse() PM_LONG_WORM, PM_*_UNICORN
 */
function corpseExtras(
  ctx: Ctx,
  def: MonsterDef,
  at: { level: string; x: number; y: number },
  dead: DeadMon,
): void {
  // ref: make_corpse() PM_LONG_WORM: `mksobj_at(WORM_TOOTH, x, y, TRUE, FALSE)`
  if (def.id === 'nh:long_worm') {
    mksobj(ctx, ctx.defs.object('nh:worm_tooth'), { at, init: true });
    return;
  }
  if (!isUnicorn(def)) return;
  if (dead.revived && ctx.rng.rn2(2)) {
    if (dead.seen)
      ctx.emit({ type: 'msg', key: 'unicorn.horn_crumbles', params: { mon: dead.seen } });
  } else mksobj(ctx, ctx.defs.object('nh:unicorn_horn'), { at, init: true });
  // (a revived unicorn's horn is `degraded_horn`: only poly_obj() reads it, see DEVIATIONS.md)
}

type GolemStatue = (ctx: Ctx, mon: DefId, at: { level: string; x: number; y: number }) => void;
let golemStatue: GolemStatue | null = null;

/** mkobj.ts hands down the statue maker (it sits above this module). */
export function setGolemStatue(fn: GolemStatue): void {
  golemStatue = fn;
}

/**
 * What a golem leaves instead of a corpse: iron chains (d(2,6)), glass gems (d(2,4) of
 * rn2(NUM_GLASS_GEMS)), 50..69 rocks, a statue of a stone golem, d(2,4) quarterstaffs, small
 * shields, clubs, elven spears or boomerangs, rn2(3) leashes, bullwhips or grappling hooks, d(2,4)
 * leather armors, leather cloaks or saddles, 200 - rnl(101) gold, rnd(4) blank scrolls. The
 * port has no iron chain, boomerang, leash, grappling hook or saddle: their rolls are drawn and
 * nothing is made (DEVIATIONS.md "Golems"). False for anything else (straw and flesh golems
 * included: the default corpse rules). ref: src/mon.c make_corpse() PM_*_GOLEM
 */
function golemDrop(
  ctx: Ctx,
  def: MonsterDef,
  at: { level: string; x: number; y: number },
): boolean {
  const make = (id: string | null): void => {
    if (id !== null) mksobj(ctx, ctx.defs.object(id as never), { at, init: true });
  };
  let num: number;
  switch (def.id) {
    case 'nh:iron_golem':
      num = ctx.rng.d(2, 6);
      while (num--) make(null); // IRON_CHAIN
      return true;
    case 'nh:glass_golem':
      num = ctx.rng.d(2, 4); // very low chance of creating all glass gems
      while (num--) make(GLASS_GEMS[ctx.rng.rn2(GLASS_GEMS.length)] ?? null);
      return true;
    case 'nh:clay_golem': {
      const n = ctx.rng.rn2(20) + 50;
      mksobj(ctx, ctx.defs.object('nh:rock'), { at, init: false, quantity: n });
      return true;
    }
    case 'nh:stone_golem':
      // mkcorpstat(STATUE, NULL, mdat, ...) without CORPSTAT_INIT
      golemStatue?.(ctx, def.id, at);
      return true;
    case 'nh:wood_golem':
      num = ctx.rng.d(2, 4);
      while (num--)
        make(
          ctx.rng.rn2(2)
            ? 'nh:quarterstaff'
            : ctx.rng.rn2(3)
              ? 'nh:small_shield'
              : ctx.rng.rn2(3)
                ? 'nh:club'
                : ctx.rng.rn2(3)
                  ? 'nh:elven_spear'
                  : null, // BOOMERANG
        );
      return true;
    case 'nh:rope_golem':
      num = ctx.rng.rn2(3);
      while (num-- > 0) make(ctx.rng.rn2(2) ? null : ctx.rng.rn2(3) ? 'nh:bullwhip' : null); // LEASH, GRAPPLING_HOOK
      return true;
    case 'nh:leather_golem':
      num = ctx.rng.d(2, 4);
      while (num--)
        make(ctx.rng.rn2(4) ? 'nh:leather_armor' : ctx.rng.rn2(3) ? 'nh:leather_cloak' : null); // SADDLE
      return true;
    case 'nh:gold_golem':
      // Good luck gives more coins
      mkgold(ctx, 200 - rnl(ctx.rng, 101, luckOf(ctx.state)), at);
      return true;
    case 'nh:paper_golem':
      num = ctx.rng.rnd(4);
      while (num--) make('nh:scroll_of_blank_paper');
      return true;
    default:
      return false;
  }
}

/**
 * Leaves a corpse where the hero killed `def`, if the rules say so, and starts its rot timer.
 * ref: src/mon.c xkilled() ("corpse--none if hero was inside the monster"), make_corpse().
 * Not ported: the 1 in 6 random "treasure drop" (needs random object generation), burying in
 * pits, zombification, revival of trolls.
 */
export function xkilledCorpse(
  ctx: Ctx,
  def: MonsterDef,
  at: { level: string; x: number; y: number },
  byHero = false,
  dead: DeadMon = { revived: false, seen: null },
): void {
  // ref: src/mon.c corpse_chance(): "Gas spores always explode upon death" (inside the monster
  // that swallowed it, gm.mswallower, when one did)
  if (def.attacks.some((a) => a.at === 'boom')) {
    deathExplosion?.(ctx, def, at, byHero, swallowerOf(ctx));
    return;
  }
  const undead = UNDEAD_TO_CORPSE[def.id];
  // G_NOCORPSE stops only make_corpse()'s default case: golems leave their material
  if (undead === undefined && !isGolem(def) && def.genFlags.includes('nocorpse')) return;
  if (!corpseChance(ctx, def)) return;
  if (golemDrop(ctx, def, at)) return;
  if (undead !== undefined) {
    // ref: make_corpse() zombies and mummies: their race's corpse, and an *OLD* one. The
    // ettin mummy leaves none (no ettin here).
    if (!ctx.defs.isMonster(undead)) return;
    const id = mkcorpse(ctx, ctx.defs.monster(undead), { at });
    const it = ctx.state.entities[String(id)]?.c.item;
    if (it) it.age = (it.age ?? 0) - (TAINT_AGE + 1);
    startCorpseTimeout(ctx, id);
    return;
  }
  if (def.genFlags.includes('nocorpse')) return; // a straw golem
  corpseExtras(ctx, def, at, dead);
  const id = mkcorpse(ctx, def, { at });
  startCorpseTimeout(ctx, id);
}

/**
 * Starts the timer that rots a corpse away. ref: src/mkobj.c start_corpse_timeout(): the
 * corpse's age counts toward ROT_AGE and the time varies by rnz(10) - 10 (rnz(25) - 25 for
 * level creation). Lizards and lichens never rot; trolls may revive instead. No Riders.
 */
export function startCorpseTimeout(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule'>,
  id: number,
  inMklev = false,
): void {
  const it = ctx.state.entities[String(id)]?.c.item;
  if (!it) return;
  // lizards and lichen don't rot or revive
  if (it.corpseOf === 'nh:lizard' || it.corpseOf === 'nh:lichen') return;
  const rotAdjust = inMklev ? 25 : 10; // ref: gi.in_mklev ? 25 : 10
  const age = Math.max(ctx.state.turn, 1) - (it.age ?? 0);
  let when = age > ROT_AGE ? rotAdjust : ROT_AGE - age;
  when += rnz(ctx, rotAdjust) - rotAdjust;
  // ref: start_corpse_timeout(): a troll revives 1 time in TROLL_REVIVE_CHANCE for each age
  // 2..TAINT_AGE (revive.ts 'nh:revive_mon'); no Riders, no zombify
  if (it.corpseOf && trollCorpse(it.corpseOf)) {
    for (let a = 2; a <= TAINT_AGE; a++)
      if (!ctx.rng.rn2(TROLL_REVIVE_CHANCE)) {
        ctx.schedule(a, 'nh:revive_mon', { id });
        return;
      }
  }
  ctx.schedule(Math.max(when, 1), 'nh:rot_corpse', { id });
}

/** ref: include/hack.h TROLL_REVIVE_CHANCE: 1/37 for 50 turns, about 75% */
const TROLL_REVIVE_CHANCE = 37;
/** ref: start_corpse_timeout() `mons[body->corpsenm].mlet == S_TROLL` (the roster's troll) */
const trollCorpse = (mon: DefId): boolean => mon === 'nh:troll';

/**
 * Makes a corpse that of `mon`: its rot timer is stopped and started again for the new type.
 * ref: src/mkobj.c set_corpsenm() (obj_stop_timers(), start_corpse_timeout())
 */
export function setCorpsenm(
  ctx: Pick<Ctx, 'state' | 'rng' | 'schedule'>,
  id: number,
  mon: DefId,
  inMklev = false,
): void {
  const it = ctx.state.entities[String(id)]?.c.item;
  if (!it) return;
  it.corpseOf = mon;
  ctx.state.timers = ctx.state.timers.filter(
    (t) =>
      !(
        (t.kind === 'nh:rot_corpse' || t.kind === 'nh:revive_mon') &&
        (t.data as { id?: unknown } | null)?.id === id
      ),
  );
  startCorpseTimeout(ctx, id, inMklev);
}

/** Called when a corpse rots away completely. ref: src/dig.c rot_corpse() */
function rotCorpse(ctx: Ctx, data: Json): void {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'number') return;
  const e = ctx.state.entities[String(id)];
  if (!e || e.def !== 'nh:corpse' || !e.c.item) return; // eaten, merged away or gone
  const carriedByHero = e.c.item.carriedBy === ctx.state.playerId;
  const v = hungerData(ctx).victual;
  if (carriedByHero) {
    // ref: src/dig.c rot_corpse(): "Your newt corpse rots away."
    ctx.emit({
      type: 'msg',
      key: 'corpse.rots_away',
      params: { item: xnameOf(ctx.state, ctx.defs, e) },
    });
  }
  // ref: src/eat.c food_disappears(): a meal on this corpse is over
  if (v && v.piece === id) {
    hungerData(ctx).victual = null;
    ctx.interrupt();
  }
  ctx.remove(id);
  if (carriedByHero) encumberMsg(ctx);
}

export function registerCorpses(api: ModApi): void {
  api.defineTimer({ id: 'nh:rot_corpse', fire: rotCorpse });
}
