// Monster item use, the leaf part that low modules can read: curing a monster's blindness, the
// monsters' memory of the hero's resistances (M_SEEN_*: which attack wands not to zap at her) and
// whether a monster has zapped an attack wand before (its first shot always misses).
// And whether a monster reflects (mon_reflects()), which items a monster wants for its muse
// (searches_for_item(), read by mon_would_take_item()) and the items monsters are made with
// (rnd_defensive_item(), rnd_offensive_item(), rnd_misc_item(), called by m_initweap() and
// m_initinv()).
// ref: src/muse.c mcureblindness(), mon_reflects(), searches_for_item(), cures_stoning(),
// rnd_defensive_item(), rnd_offensive_item(), rnd_misc_item(); src/mondata.c monstseesu(),
// monstunseesu(); include/monst.h M_SEEN_*, m_seenres(), mwandexp
import {
  inventoryOf,
  isContainer,
  sortedIds,
  type Ctx,
  type DefId,
  type EntityId,
  type Entity,
  type Msg,
} from '@nh/core';
import { mCanSeeU } from './apparxy';
import { uswallow } from './engulfstate';
import { epriOf } from './epri';
import { eshkOf } from './eshk';
import { monInvisible, invisBlocked, seeInvisible } from './invis';
import { hardHelmet } from './material';
import { amorphous, isUnicorn, noncorporeal, nonliving } from './mondata';
import {
  hasWandExp,
  mcansee,
  mspeed,
  seenResOf,
  setSeenRes,
  setWandExp,
  unblindMonst,
} from './mstate';
import { discover } from './o_init';
import { monNam } from './perception';
import { onscary } from './scary';
import { isSokoban } from './sokoban';
import { resistsSton, touchPetrifies } from './stonestate';
import { noteleportLevel } from './teleport';
import { isGuard } from './vaultstate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/mondata.h haseyes(): not M1_NOEYES */
const haseyes = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean =>
  !ctx.defs.monster(mon.def).flags.includes('noeyes');

/**
 * A blinded monster can see again: "The hill orc can see again." when `verbose` and it has eyes.
 * ref: src/muse.c mcureblindness()
 */
export function mcureblindness(ctx: Ctx, mon: Entity, verbose: boolean): void {
  if (mcansee(ctx, mon.id)) return;
  unblindMonst(ctx, mon.id);
  if (verbose && haseyes(ctx, mon)) say(ctx, 'muse.can_see_again', { mon: monNam(ctx, mon) });
}

/** The hero's resistances a monster may have seen. ref: include/monst.h M_SEEN_* */
export const M_SEEN = {
  magr: 0x1,
  fire: 0x2,
  cold: 0x4,
  sleep: 0x8,
  disint: 0x10,
  elec: 0x20,
  poison: 0x40,
  acid: 0x80,
  refl: 0x100,
} as const;

/** Whether the monster has seen the hero resist (any of) `bits`. ref: m_seenres() */
export const mSeenres = (ctx: Pick<Ctx, 'state'>, id: EntityId, bits: number): boolean =>
  (seenResOf(ctx, id) & bits) !== 0;

/**
 * Every monster of her level that could see her (m_canseeu(): its own blindness does not
 * matter) learns (`set`) or forgets that she resists `bits`; nothing while she is swallowed.
 */
function seesu(ctx: Pick<Ctx, 'state' | 'defs'>, bits: number, set: boolean): void {
  if (bits === 0 || uswallow(ctx)) return;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    if (!mon?.c.monster || !mCanSeeU(ctx, mon)) continue;
    const cur = seenResOf(ctx, id);
    setSeenRes(ctx, id, set ? cur | bits : cur & ~bits);
  }
}

/** Monsters in her line of sight see her resist `bits`. ref: src/mondata.c monstseesu() */
export const monstseesu = (ctx: Pick<Ctx, 'state' | 'defs'>, bits: number): void =>
  seesu(ctx, bits, true);

/** Monsters in her line of sight see her not resist `bits`. ref: src/mondata.c monstunseesu() */
export const monstunseesu = (ctx: Pick<Ctx, 'state' | 'defs'>, bits: number): void =>
  seesu(ctx, bits, false);

/** `mtmp->mwandexp`: it has zapped an attack wand (its first shot always misses). */
export const mwandexp = (ctx: Pick<Ctx, 'state'>, id: EntityId): boolean => hasWandExp(ctx, id);

export const setMwandexp = (ctx: Pick<Ctx, 'state'>, id: EntityId): void => setWandExp(ctx, id);

const SHIELD_OF_REFLECTION: DefId = 'nh:shield_of_reflection';
const AMULET_OF_REFLECTION: DefId = 'nh:amulet_of_reflection';

/**
 * Whether the monster reflects: a worn shield of reflection, then a worn amulet of reflection.
 * When it does and `key` is given, says it with `mon` (the monster) and `what` ("shield",
 * "amulet") added to `params`, and learns the shield or amulet ("But it reflects from the hill
 * orc's shield!"). ref: src/muse.c mon_reflects() (no artifact weapons, silver dragon scales or
 * silver and chromatic dragons in this port)
 */
export function monReflects(
  ctx: Ctx,
  mon: Entity,
  key: string | null,
  params: Msg['params'] = {},
): boolean {
  const worn = (slot: string): Entity | undefined =>
    inventoryOf(ctx.state, mon.id).find((o) => o.c.item?.equipped === slot);
  let what: 'shield' | 'amulet';
  let learn: DefId;
  if (worn('shield')?.def === SHIELD_OF_REFLECTION) {
    what = 'shield';
    learn = SHIELD_OF_REFLECTION;
  } else if (worn('amulet')?.def === AMULET_OF_REFLECTION) {
    what = 'amulet';
    learn = AMULET_OF_REFLECTION;
  } else return false;
  if (key) {
    say(ctx, key, { ...params, mon: monNam(ctx, mon), what: { key: `muse.reflect.what.${what}` } });
    discover(ctx, learn);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// the items monsters want and are made with

const hasFlag = (ctx: Pick<Ctx, 'defs'>, mon: Entity, f: string): boolean =>
  ctx.defs.monster(mon.def).flags.includes(f);
const hasAttack = (ctx: Pick<Ctx, 'defs'>, mon: Entity, at: string): boolean =>
  ctx.defs.monster(mon.def).attacks.some((a) => a.at === at);
/** ref: include/mondata.h is_animal(), mindless() */
const animalOrMindless = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean =>
  hasFlag(ctx, mon, 'animal') || hasFlag(ctx, mon, 'mindless');
/** ref: include/mondata.h is_floater(): S_EYE and S_LIGHT */
const isFloater = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean => {
  const ch = ctx.defs.monster(mon.def).glyph.ch;
  return ch === 'e' || ch === 'y';
};
const worn = (ctx: Pick<Ctx, 'state'>, mon: Entity, slot: string): Entity | undefined =>
  inventoryOf(ctx.state, mon.id).find((o) => o.c.item?.equipped === slot);

const LIZARD: DefId = 'nh:lizard';
const CORPSE: DefId = 'nh:corpse';
const EGG: DefId = 'nh:egg';
const POT_ACID: DefId = 'nh:potion_of_acid';

/**
 * Whether `obj` cures the monster's petrification: a potion of acid, or a lizard or acidic
 * corpse. ref: src/muse.c cures_stoning() (no globs or tins: mcould_eat_tin() is never needed)
 */
export function curesStoning(ctx: Pick<Ctx, 'defs'>, obj: Entity): boolean {
  if (obj.def === POT_ACID) return true;
  if (obj.def !== CORPSE) return false;
  const of = obj.c.item?.corpseOf;
  if (!of || !ctx.defs.isMonster(of)) return false;
  return of === LIZARD || ctx.defs.monster(of).flags.includes('acid');
}

/** The potions a monster looks for whatever it is. ref: searches_for_item() POTION_CLASS */
const SEARCHED_POTIONS: readonly DefId[] = [
  'nh:potion_of_healing',
  'nh:potion_of_extra_healing',
  'nh:potion_of_full_healing',
  'nh:potion_of_polymorph',
  'nh:potion_of_gain_level',
  'nh:potion_of_paralysis',
  'nh:potion_of_sleeping',
  POT_ACID,
  'nh:potion_of_confusion',
];
/** ref: searches_for_item() SCROLL_CLASS */
const SEARCHED_SCROLLS: readonly DefId[] = [
  'nh:scroll_of_teleportation',
  'nh:scroll_of_create_monster',
  'nh:scroll_of_earth',
  'nh:scroll_of_fire',
];
/** The non-ray wands it wants. ref: searches_for_item() WAND_CLASS */
const SEARCHED_WANDS: readonly DefId[] = [
  'nh:wand_of_striking',
  'nh:wand_of_undead_turning',
  'nh:wand_of_teleportation',
  'nh:wand_of_create_monster',
];

/**
 * Whether the monster wants `obj` for its own use (muse): charged attack and escape wands, the
 * potions and scrolls it can use, amulets of life saving and reflection, a pick-axe for a digger,
 * an uncursed unicorn horn, a container to loot, the corpses that cure stoning (or a cockatrice's
 * for a gloved monster) and cockatrice eggs. Not an object on a scary square it stands on, and
 * nothing for animals, the mindless and ghosts.
 * ref: src/muse.c searches_for_item() (no tins, horns, cameras or amulets of guarding here; no
 * vampire shapeshifters)
 */
export function searchesForItem(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  mon: Entity,
  obj: Entity,
): boolean {
  const typ = obj.def;
  const op = obj.c.pos;
  const mp = mon.c.pos;
  // don't let monsters interact with protected items on the floor
  if (
    op &&
    mp &&
    op.level === mp.level &&
    op.x === mp.x &&
    op.y === mp.y &&
    onscary(ctx, op.x, op.y, mon)
  )
    return false;
  // don't loot bones piles
  if (animalOrMindless(ctx, mon) || mon.def === 'nh:ghost') return false;
  if (typ === 'nh:wand_of_make_invisible' || typ === 'nh:potion_of_invisibility')
    return !monInvisible(ctx, mon) && !invisBlocked(ctx, mon) && !hasAttack(ctx, mon, 'gaze');
  if (typ === 'nh:wand_of_speed_monster' || typ === 'nh:potion_of_speed')
    return mspeed(ctx, mon.id) !== 'fast';
  const od = ctx.defs.object(typ);
  const it = obj.c.item;
  const mdef = ctx.defs.monster(mon.def);
  switch (od.class) {
    case 'wand':
      if ((it?.spe ?? 0) <= 0) return false;
      if (typ === 'nh:wand_of_digging') return !isFloater(ctx, mon);
      if (typ === 'nh:wand_of_polymorph') return mdef.difficulty < 6;
      return od.wand?.dir === 'ray' || SEARCHED_WANDS.includes(typ);
    case 'potion':
      if (SEARCHED_POTIONS.includes(typ)) return true;
      return typ === 'nh:potion_of_blindness' && !hasAttack(ctx, mon, 'gaze');
    case 'scroll':
      return SEARCHED_SCROLLS.includes(typ);
    case 'amulet':
      if (typ === 'nh:amulet_of_life_saving') return !nonliving(mdef);
      return typ === 'nh:amulet_of_reflection';
    case 'tool':
      if (typ === 'nh:pick_axe') return mdef.flags.includes('needpick');
      if (typ === 'nh:unicorn_horn') return it?.buc !== 'cursed' && !isUnicorn(mdef);
      // Is_container(obj) && !(Is_mbag(obj) && obj->cursed) && !obj->olocked
      return (
        isContainer(ctx.defs, obj) &&
        !(typ === 'nh:bag_of_holding' && it?.buc === 'cursed') &&
        !it?.locked
      );
    case 'food': {
      const of = it?.corpseOf;
      const pm = of && ctx.defs.isMonster(of) ? ctx.defs.monster(of) : null;
      if (typ === CORPSE)
        return (
          (worn(ctx, mon, 'gloves') !== undefined && pm !== null && touchPetrifies(pm)) ||
          (!resistsSton(ctx, mon) && curesStoning(ctx, obj))
        );
      if (typ === EGG) return pm !== null && touchPetrifies(pm);
      return false;
    }
    default:
      return false;
  }
}

/** ref: include/mondata.h: the monsters no rnd_*_item() gives anything to */
const noMuseItems = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean => {
  const ch = ctx.defs.monster(mon.def).glyph.ch;
  return animalOrMindless(ctx, mon) || hasAttack(ctx, mon, 'explode') || ch === ' ' || ch === 'K';
};

/** isshk, isgd, ispriest (none is set yet while makemon() gives the starting inventory) */
const isShkGdPriest = (ctx: Pick<Ctx, 'state' | 'defs'>, id: EntityId): boolean =>
  eshkOf(ctx, id) !== null || isGuard(ctx.state, id) || epriOf(ctx, id) !== null;

const levelOfMon = (ctx: Pick<Ctx, 'state'>, mon: Entity) =>
  ctx.state.levels[mon.c.pos?.level ?? ctx.state.currentLevel];

/**
 * A defensive item for a monster being made (null: none): scrolls and wands of teleportation and
 * create monster, the healing potions, a wand of digging.
 * ref: src/muse.c rnd_defensive_item() (no Pestilence; `Sokoban` is the monster's level)
 */
export function rndDefensiveItem(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  id: EntityId,
): DefId | null {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster || noMuseItems(ctx, mon)) return null;
  const pm = ctx.defs.monster(mon.def);
  const difficulty = pm.difficulty;
  const level = levelOfMon(ctx, mon);
  let trycnt = 0;
  for (;;) {
    const r = ctx.rng.rn2(8 + +(difficulty > 3) + +(difficulty > 6) + +(difficulty > 8));
    switch (r) {
      case 6:
      case 9:
        if (level && noteleportLevel(ctx, level) && ++trycnt < 2) continue; // try_again
        if (!ctx.rng.rn2(3)) return 'nh:wand_of_teleportation';
        return 'nh:scroll_of_teleportation';
      case 0:
      case 1:
        return 'nh:scroll_of_teleportation';
      case 8:
      case 10:
        if (!ctx.rng.rn2(3)) return 'nh:wand_of_create_monster';
        return 'nh:scroll_of_create_monster';
      case 2:
        return 'nh:scroll_of_create_monster';
      case 3:
        return 'nh:potion_of_healing';
      case 4:
        return 'nh:potion_of_extra_healing';
      case 5:
        return 'nh:potion_of_full_healing';
      case 7:
        // usually avoid digging in Sokoban
        if (level && isSokoban(level) && ctx.rng.rn2(4)) continue; // try_again
        // some creatures shouldn't dig down to another level when hurt
        if (isFloater(ctx, mon) || isShkGdPriest(ctx, id)) return null;
        return 'nh:wand_of_digging';
      default:
        return null;
    }
  }
}

/**
 * An offensive item for a monster being made (null: none): attack wands, the potions it hurls,
 * the scroll of earth for a monster with a hard hat or none needed.
 * ref: src/muse.c rnd_offensive_item()
 */
export function rndOffensiveItem(
  ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>,
  id: EntityId,
): DefId | null {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster || noMuseItems(ctx, mon)) return null;
  const pm = ctx.defs.monster(mon.def);
  const difficulty = pm.difficulty;
  if (difficulty > 7 && !ctx.rng.rn2(35)) return 'nh:wand_of_death';
  switch (ctx.rng.rn2(9 - +(difficulty < 4) + 4 * +(difficulty > 6))) {
    case 0: {
      const helmet = worn(ctx, mon, 'helm');
      if (
        (helmet && hardHelmet(ctx.defs.object(helmet.def))) ||
        amorphous(pm) ||
        pm.flags.includes('wallwalk') ||
        noncorporeal(pm) ||
        pm.flags.includes('unsolid')
      )
        return 'nh:scroll_of_earth';
      return 'nh:wand_of_striking';
    }
    case 1:
      return 'nh:wand_of_striking';
    case 2:
      return POT_ACID;
    case 3:
      return 'nh:potion_of_confusion';
    case 4:
      return 'nh:potion_of_blindness';
    case 5:
      return 'nh:potion_of_sleeping';
    case 6:
      return 'nh:potion_of_paralysis';
    case 7:
    case 8:
      return 'nh:wand_of_magic_missile';
    case 9:
      return 'nh:wand_of_sleep';
    case 10:
      return 'nh:wand_of_fire';
    case 11:
      return 'nh:wand_of_cold';
    case 12:
      return 'nh:wand_of_lightning';
    default:
      return null;
  }
}

/**
 * A misc item for a (weak) monster being made (null: none): polymorph, an amulet of life saving,
 * speed, invisibility, gain level. ref: src/muse.c rnd_misc_item() (no vampire shapeshifters)
 */
export function rndMiscItem(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, id: EntityId): DefId | null {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster || noMuseItems(ctx, mon)) return null;
  const pm = ctx.defs.monster(mon.def);
  // "Unlike other rnd_item functions, we only allow _weak_ monsters to have this item; after
  // all, the item will be used to strengthen the monster and strong monsters won't use it at
  // all..."
  if (pm.difficulty < 6 && !ctx.rng.rn2(30))
    return ctx.rng.rn2(6) ? 'nh:potion_of_polymorph' : 'nh:wand_of_polymorph';
  if (!ctx.rng.rn2(40) && !nonliving(pm)) return 'nh:amulet_of_life_saving';
  switch (ctx.rng.rn2(3)) {
    case 0:
      if (isGuard(ctx.state, id)) return null;
      return ctx.rng.rn2(6) ? 'nh:potion_of_speed' : 'nh:wand_of_speed_monster';
    case 1:
      if (mon.c.monster.peaceful && !seeInvisible(ctx.state)) return null;
      return ctx.rng.rn2(6) ? 'nh:potion_of_invisibility' : 'nh:wand_of_make_invisible';
    default:
      return 'nh:potion_of_gain_level';
  }
}
