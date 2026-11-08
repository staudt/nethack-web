// Pets: the starting kitten, taming and abuse, what pets like to eat, and following the hero
// between levels. ref: src/dog.c makedog(), initedog(), dogfood(), tamedog(), abuse_dog(),
// keepdogs(), losedogs(), mon_catchup_elapsed_time(); src/sounds.c yelp(), growl()
//
// Tameness is core's `MonsterComponent.tame` (mtame); the rest of NetHack's `struct edog` lives
// in `modData.nh.edog[id]`, and a meal in progress (`mtmp->meating`) in `modData.nh.meating[id]`.
import { fleshPetrifies, resistsSton } from './stonestate';
import {
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type Json,
  type MonsterDef,
  type ModApi,
} from '@nh/core';
import { makemon, mnextoPos } from './generation';
import { nhData } from './items';
import { isFleeing, monflee, stopFleeing } from './monflee';
import { forgetMonster } from './mongear';
import {
  catchUpRegen,
  frozenTime,
  forgetMState,
  isFrozen,
  isMConfused,
  paralyzeMonst,
} from './mstate';
import { canSpotMon, monNam } from './perception';
import { P, heroHas } from './props';
import { ustuck, setUstuck } from './hackmove';
import { mintrap } from './trap';
import { isMtrapped } from './trapstate';
import { eshkOf } from './eshk';
import { makeHappyShk } from './shk';

/** ref: include/dog.h dogfood() results, best first */
export const DOGFOOD = 0;
export const CADAVER = 1;
export const ACCFOOD = 2;
export const MANFOOD = 3;
export const APPORT = 4;
export const POISON = 5;
export const UNDEF = 6;
export const TABU = 7;

/** ref: include/mextra.h struct edog (the fields that apply here) */
export interface Edog {
  droptime: number;
  dropdist: number;
  apport: number;
  whistletime: number;
  hungrytime: number;
  /** Previous goal when the hero was out of sight; x = -1/0 when unset. */
  ogoal: [number, number];
  abuse: number;
  mhpmaxPenalty: number;
}

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, key: string, create: boolean): Table | null {
  const md = ctx.state.modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root[key];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root[key] = t;
  }
  return t;
}

/** The pet's edog record, or null for a monster that was never tame. */
export function edogOf(ctx: Pick<Ctx, 'state'>, id: EntityId): Edog | null {
  const v = table(ctx, 'edog', false)?.[String(id)];
  return isObj(v) ? (v as unknown as Edog) : null;
}

function newEdog(ctx: Pick<Ctx, 'state'>, id: EntityId): Edog {
  const t = table(ctx, 'edog', true) as Table;
  const e: Edog = {
    droptime: 0,
    dropdist: 10000,
    apport: 0,
    whistletime: 0,
    hungrytime: 0,
    ogoal: [-1, -1],
    abuse: 0,
    mhpmaxPenalty: 0,
  };
  t[String(id)] = e as unknown as Json;
  return e;
}

/** `mtmp->meating`: turns left of a meal (0 = not eating). */
export function meating(ctx: Pick<Ctx, 'state'>, id: EntityId): number {
  const v = table(ctx, 'meating', false)?.[String(id)];
  return typeof v === 'number' ? v : 0;
}

export function setMeating(ctx: Pick<Ctx, 'state'>, id: EntityId, n: number): void {
  if (n > 0) (table(ctx, 'meating', true) as Table)[String(id)] = n;
  else {
    const t = table(ctx, 'meating', false);
    if (t) delete t[String(id)];
  }
}

/** Forgets the pet records of a monster that is gone. */
export function forgetPet(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  for (const k of ['edog', 'meating']) {
    const t = table(ctx, k, false);
    if (t) delete t[String(id)];
  }
}

export const tameness = (mon: Entity | undefined): number => mon?.c.monster?.tame ?? 0;
export const isTame = (mon: Entity | undefined): boolean => tameness(mon) > 0;

/** ref: include/mondata.h is_domestic() */
export const isDomestic = (def: MonsterDef): boolean => def.flags.includes('domestic');
/** ref: include/mondata.h carnivorous() / herbivorous() (M1_OMNIVORE is both) */
export const carnivorous = (def: MonsterDef): boolean =>
  def.flags.includes('carnivore') || def.flags.includes('omnivore');
export const herbivorous = (def: MonsterDef): boolean =>
  def.flags.includes('herbivore') || def.flags.includes('omnivore');

/** ref: include/mondata.h vegan(): blobs, jellies, fungi, vortices, lights (by class letter) */
const vegan = (def: MonsterDef): boolean => 'bjFvy'.includes(def.glyph.ch);
/** ref: include/mondata.h poisonous() / acidic() */
const poisonous = (def: MonsterDef): boolean => def.flags.includes('pois');
const acidic = (def: MonsterDef): boolean => def.flags.includes('acid');

/** Foods after SLIME_MOLD in objects.h order (dogfood()'s default case: carnivores accept them). */
const AFTER_SLIME_MOLD = new Set([
  'nh:lump_of_royal_jelly',
  'nh:cream_pie',
  'nh:candy_bar',
  'nh:fortune_cookie',
  'nh:pancake',
  'nh:lembas_wafer',
  'nh:cram_ration',
  'nh:food_ration',
  'nh:k_ration',
  'nh:c_ration',
  'nh:tin',
]);

/**
 * How much the monster wants the object, DOGFOOD (best) to TABU. ref: src/dog.c dogfood().
 * Not ported: poisoned weapons, artifacts, riders, ghouls, royal jelly, eggs
 * (none exist), slime, garlic, tins, polymorph food, silver-haters, metallivores.
 */
export function dogfood(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity, obj: Entity): number {
  const mdef = ctx.defs.monster(mon.def);
  const odef = ctx.defs.object(obj.def);
  const cursed = obj.c.item?.buc === 'cursed';
  if (odef.class === 'food') {
    const fx = obj.c.item?.corpseOf;
    // c*ckatrice or Medusa
    if (
      obj.def === 'nh:corpse' &&
      fx &&
      ctx.defs.isMonster(fx) &&
      fleshPetrifies(ctx.defs.monster(fx)) &&
      !resistsSton(ctx, mon)
    )
      return POISON;
    const carni = carnivorous(mdef);
    const herbi = herbivorous(mdef);
    if (!carni && !herbi) return cursed ? UNDEF : APPORT;
    const starving = isTame(mon) && (edogOf(ctx, mon.id)?.mhpmaxPenalty ?? 0) > 0;
    switch (obj.def) {
      case 'nh:tripe_ration':
      case 'nh:meatball':
      case 'nh:meat_ring':
      case 'nh:meat_stick':
      case 'nh:enormous_meatball':
        return carni ? DOGFOOD : MANFOOD;
      case 'nh:corpse': {
        const fx = obj.c.item?.corpseOf;
        const fptr = fx && ctx.defs.isMonster(fx) ? ctx.defs.monster(fx) : null;
        const old = (obj.c.item?.age ?? ctx.state.turn) + 50 <= ctx.state.turn;
        if (!fptr) return carni ? CADAVER : MANFOOD;
        if (
          (old && fx !== 'nh:lizard' && fx !== 'nh:lichen' && mdef.glyph.ch !== 'F') ||
          (acidic(fptr) && !mdef.resists.includes('acid')) ||
          (poisonous(fptr) && !mdef.resists.includes('poison'))
        )
          return POISON;
        if (vegan(fptr)) return herbi ? CADAVER : MANFOOD;
        return carni ? CADAVER : MANFOOD;
      }
      case 'nh:apple':
        return herbi ? DOGFOOD : starving ? ACCFOOD : MANFOOD;
      case 'nh:carrot':
        return herbi ? DOGFOOD : starving ? ACCFOOD : MANFOOD;
      case 'nh:banana':
        return herbi || starving ? ACCFOOD : MANFOOD;
      default:
        if (starving) return ACCFOOD;
        return AFTER_SLIME_MOLD.has(obj.def)
          ? carni
            ? ACCFOOD
            : MANFOOD
          : herbi
            ? ACCFOOD
            : MANFOOD;
    }
  }
  // boulders and rocks: ROCK_CLASS
  if (obj.def === 'nh:boulder' || obj.def === 'nh:statue') return UNDEF;
  return cursed ? UNDEF : APPORT;
}

/**
 * The pet's edog record, made fresh if it has none (a monster made tame by another mod or a
 * test). Tameness is left as it is. ref: src/dog.c newedog() + initedog()'s record part
 */
export function ensureEdog(ctx: Pick<Ctx, 'state'>, id: EntityId): Edog {
  const old = edogOf(ctx, id);
  if (old) return old;
  const e = newEdog(ctx, id);
  e.apport = getPlayer(ctx.state).c.attributes?.cha ?? 10;
  e.hungrytime = ctx.state.turn + 1000;
  return e;
}

/**
 * Makes the monster a pet with at least the minimum tameness (10 domestic, 5 other); with
 * `everything` the edog record starts fresh. ref: src/dog.c initedog()
 */
export function initedog(ctx: Ctx, id: EntityId, everything: boolean): void {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m) return;
  const minimumtame = isDomestic(ctx.defs.monster(mon.def)) ? 10 : 5;
  m.tame = Math.max(minimumtame, m.tame ?? 0);
  m.peaceful = true;
  let e = edogOf(ctx, id);
  if (everything || !e) {
    setMeating(ctx, id, 0);
    e = newEdog(ctx, id);
    e.apport = getPlayer(ctx.state).c.attributes?.cha ?? 10; // ACURR(A_CHA)
  } else if (e.apport <= 0) e.apport = 1;
  const minhungry = ctx.state.turn + 1000;
  if (e.hungrytime < minhungry) e.hungrytime = minhungry;
}

/**
 * The role's starting pet next to the hero. ref: src/dog.c makedog() with pet_type(): the
 * Valkyrie's is a kitten (src/role.c). Not ported: pet names, the `pettype` option, horses.
 */
export function makedog(ctx: Ctx): EntityId | null {
  const hero = getPlayer(ctx.state);
  const p = hero.c.pos;
  if (!p || !ctx.defs.isMonster('nh:kitten')) return null;
  // makemon(&mons[pettype], u.ux, u.uy, MM_EDOG | NO_MINVENT): the hero's square is taken, so
  // it goes next to her
  const id = makemon(
    ctx,
    ctx.defs.monster('nh:kitten'),
    { x: p.x, y: p.y },
    {
      adjacentOk: true,
      noInventory: true,
      nogroup: true,
    },
  );
  if (id === null) return null;
  initedog(ctx, id, true);
  return id;
}

/** "The kitten yowls!" ref: src/sounds.c yelp() (cats yowl, dogs yelp) */
function yelp(ctx: Ctx, mon: Entity): void {
  if (isFrozen(ctx, mon.id) || mon.c.monster?.asleep || !canSpotMon(ctx, mon)) return;
  const ch = ctx.defs.monster(mon.def).glyph.ch;
  if (ch !== 'f' && ch !== 'd') return;
  ctx.emit({
    type: 'msg',
    key: ch === 'f' ? 'dog.yowls' : 'dog.yelps',
    params: { mon: monNam(ctx, mon) },
  });
  ctx.interrupt(); // if (context.run) nomul(0)
}

/** "The kitten hisses!" ref: src/sounds.c growl(), growl_sound() */
export function growl(ctx: Ctx, mon: Entity): void {
  if (isFrozen(ctx, mon.id) || mon.c.monster?.asleep || !canSpotMon(ctx, mon)) return;
  const ch = ctx.defs.monster(mon.def).glyph.ch;
  if (ch !== 'f' && ch !== 'd') return;
  ctx.emit({
    type: 'msg',
    key: ch === 'f' ? 'dog.hisses' : 'dog.growls',
    params: { mon: monNam(ctx, mon) },
  });
  ctx.interrupt();
}

/**
 * The hero mistreats a pet: tameness drops by one (and the abuse is remembered), it yelps or
 * growls (halved with Aggravate monster or Conflict). ref: src/dog.c abuse_dog() (no leashes)
 */
export function abuseDog(ctx: Ctx, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m || !m.tame) return;
  if (heroHas(ctx.state, P.AGGRAVATE_MONSTER) || heroHas(ctx.state, P.CONFLICT))
    m.tame = Math.trunc(m.tame / 2);
  else m.tame--;
  if (m.tame) {
    const e = edogOf(ctx, id);
    if (e) e.abuse++;
  } else delete m.tame;
  if (m.tame && ctx.rng.rn2(m.tame)) yelp(ctx, mon);
  else growl(ctx, mon);
}

/**
 * The hero hit (`dmg` > 0) or kicked her pet: abuse, then it flees for a while.
 * ref: src/uhitm.c hmon_hitmon_pet() (melee: `10 * rnd(dmg)`), src/dokick.c kickdmg()
 */
export function hurtPet(ctx: Ctx, id: EntityId, fleetime: number, destroyed: boolean): void {
  abuseDog(ctx, id);
  const mon = ctx.state.entities[String(id)];
  if (!destroyed && isTame(mon)) monflee(ctx, id, fleetime, false, false);
}

/**
 * Food or magic makes the monster peaceful, and tame if it can be; a pet catches and eats thrown
 * food it likes. Returns true when the food was eaten (it is gone) or the monster was just
 * tamed; a shopkeeper is only made happy. ref: src/dog.c tamedog() (no full moon, scrolls of taming
 * or minions)
 */
export function tamedog(
  ctx: Ctx,
  id: EntityId,
  food: Entity | null,
  givemsg: boolean,
  eat: (ctx: Ctx, mon: EntityId, obj: Entity, devour: boolean) => void,
): boolean {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m) return false;
  const def = ctx.defs.monster(mon.def);
  // reduce timed sleep or paralysis; end indefinite sleep
  if (isFrozen(ctx, id)) paralyzeMonst(ctx, id, Math.trunc((frozenTime(ctx, id) + 1) / 2));
  m.asleep = false;

  if (givemsg && !m.peaceful && canSpotMon(ctx, mon)) {
    ctx.emit({
      type: 'msg',
      key: heroHas(ctx.state, P.HALLUC) ? 'dog.really_chill' : 'dog.more_amiable',
      params: { mon: monNam(ctx, mon) },
    });
    givemsg = false;
  }
  m.peaceful = true;
  // if we cannot tame it, at least it's no longer afraid
  stopFleeing(ctx, id);
  // make a grabber let go
  if (ustuck(ctx) === id) setUstuck(ctx, null);

  // feeding it treats makes it tamer
  if (m.tame && food) {
    const tasty = dogfood(ctx, mon, food);
    const e = edogOf(ctx, id);
    if (
      !isFrozen(ctx, id) &&
      !isMConfused(ctx, id) &&
      !meating(ctx, id) &&
      (tasty === DOGFOOD || (tasty <= ACCFOOD && (e?.hungrytime ?? 0) <= ctx.state.turn))
    ) {
      if (canSpotMon(ctx, mon))
        ctx.emit({ type: 'msg', key: 'dog.catches', params: { mon: monNam(ctx, mon) } });
      eat(ctx, id, food, false);
      return true;
    }
    return false;
  }
  if (m.tame && m.tame < 10) {
    if (m.tame < ctx.rng.rnd(10)) m.tame++;
    return false;
  }
  // pacify angry shopkeeper but don't tame him
  if (eshkOf(ctx, id)) {
    makeHappyShk(ctx, id);
    return false;
  }
  if (
    isFrozen(ctx, id) ||
    def.flags.includes('human') ||
    (food && dogfood(ctx, mon, food) >= MANFOOD)
  )
    return false;
  initedog(ctx, id, !edogOf(ctx, id));
  if (food) eat(ctx, id, food, true); // thrown food is devoured
  if (givemsg && canSpotMon(ctx, mon))
    ctx.emit({
      type: 'msg',
      key: heroHas(ctx.state, P.HALLUC) ? 'dog.approachable' : 'dog.quite_friendly',
      params: { mon: monNam(ctx, mon) },
    });
  return true;
}

/**
 * Whether the monster follows the hero to another level when next to her.
 * ref: src/mon.c levl_follower(): pets and a shopkeeper following her always; stalkers unless
 * fleeing
 */
function levlFollower(ctx: Ctx, mon: Entity): boolean {
  if (isTame(mon) || eshkOf(ctx, mon.id)?.following) return true; // is_fshk()
  const def = ctx.defs.monster(mon.def);
  return def.flags.includes('stalk') && !isFleeing(ctx, mon.id);
}

/**
 * A pet left on a level comes back wilder the longer the hero was away.
 * ref: src/dog.c mon_catchup_elapsed_time() (the tameness part): `wilder = (imv + 75) / 150`
 */
function catchUpTameness(ctx: Ctx, mon: Entity, imv: number): void {
  const m = mon.c.monster;
  if (!m?.tame) return;
  const wilder = Math.trunc((imv + 75) / 150);
  if (m.tame > wilder) m.tame -= wilder;
  else if (m.tame > ctx.rng.rn2(wilder))
    delete m.tame; // untame
  else {
    delete m.tame;
    m.peaceful = false; // hostile
  }
}

/**
 * Adjacent followers come along to the new level and arrive next to the hero; a pet still eating
 * stays behind. Pets found on an arrival level go wilder for the time she was away.
 * ref: src/dog.c keepdogs(), losedogs(), mon_arrive(), mon_catchup_elapsed_time()
 */
function changeLevel(ctx: Ctx, from: string, fromPos: { x: number; y: number }, to: string): void {
  const nh = nhData(ctx) as unknown as { levelLeft?: Record<string, number> };
  const left = (nh.levelLeft ??= {});
  left[from] = ctx.state.turn;
  const followers: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const p = mon?.c.pos;
    if (!mon?.c.monster || !p || p.level !== from) continue;
    if (Math.max(Math.abs(p.x - fromPos.x), Math.abs(p.y - fromPos.y)) > 1) continue;
    if (!levlFollower(ctx, mon)) continue;
    if (mon.c.monster.asleep || isFrozen(ctx, id)) continue;
    // ref: keepdogs(): a trapped follower tries to escape; still eating or trapped, it stays
    if (isMtrapped(ctx, id)) mintrap(ctx, id);
    if (meating(ctx, id) || isMtrapped(ctx, id)) {
      if (canSeeOnLevel(ctx, mon, from))
        ctx.emit({
          type: 'msg',
          key: meating(ctx, id) ? 'dog.still_eating' : 'dog.still_trapped',
          params: { mon: `@${mon.def}` },
        });
      continue;
    }
    followers.push(mon);
  }
  // monsters left here earlier have been alone a while: pets go wilder, wounds heal
  const since = left[to];
  if (since !== undefined) {
    for (const id of sortedIds(ctx.state)) {
      const mon = ctx.state.entities[String(id)];
      if (mon?.c.monster && mon.c.pos?.level === to) {
        if (isTame(mon)) catchUpTameness(ctx, mon, ctx.state.turn - since);
        catchUpRegen(ctx, mon, ctx.state.turn - since);
      }
    }
  }
  const level = getLevel(ctx.state, to);
  const hero = getPlayer(ctx.state).c.pos;
  if (!hero) return;
  for (const mon of followers) {
    const spot = mnextoPos(ctx, level, null, hero);
    if (!spot) continue; // no room: it stays behind (mon_arrive would migrate it)
    mon.c.pos = { level: to, x: spot.x, y: spot.y };
  }
}

/** The hero saw the monster's square when she left (state.visible is still the old level's). */
function canSeeOnLevel(ctx: Ctx, mon: Entity, levelId: string): boolean {
  const p = mon.c.pos;
  const level = ctx.state.levels[levelId];
  return !!p && !!level && ctx.state.visible.includes(p.y * level.width + p.x);
}

/** Dead or departed pets' records are dropped once a turn. */
function cleanup(ctx: Ctx): void {
  for (const k of ['edog', 'meating']) {
    const t = table(ctx, k, false);
    if (!t) continue;
    for (const key of Object.keys(t).sort())
      if (!ctx.state.entities[key]?.c.monster) {
        delete t[key];
        forgetMonster(ctx, Number(key));
        forgetMState(ctx, Number(key));
      }
  }
}

export function registerDog(api: ModApi): void {
  api.on('levelChange', (ctx, c) => {
    if (c.from === null || c.fromPos === null) makedog(ctx);
    else changeLevel(ctx, c.from, c.fromPos, c.to);
  });
  api.on('endOfTurn', cleanup);
}

/**
 * A pet swallowed a monster of type `cdef` whole: half the nourishment of its corpse and a quarter
 * of the eating time. ref: src/uhitm.c mhitm_ad_dgst() (dog_nutrition() of a virtual corpse)
 */
export function swallowedNutrition(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  pet: Entity,
  cdef: MonsterDef,
): void {
  const mult = { tiny: 8, small: 6, medium: 5, large: 4, huge: 3, gigantic: 2 }[
    ctx.defs.monster(pet.def).size
  ];
  // dog_nutrition(): a corpse takes 3 + (cwt >> 6) turns and gives its nutrition times the size
  let meal = 3 + (cdef.weight >> 6);
  let nutrit = cdef.nutrition * mult;
  // only 50% nutrition, 25% of normal eating time
  if (meal > 1) meal = Math.trunc((meal + 3) / 4);
  setMeating(ctx, pet.id, meal);
  if (nutrit > 1) nutrit = Math.trunc(nutrit / 2);
  const edog = edogOf(ctx, pet.id);
  if (edog) edog.hungrytime += nutrit;
}
