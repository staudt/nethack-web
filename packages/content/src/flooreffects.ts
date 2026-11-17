// Objects landing on the floor: a boulder fills a pool, a pit or a hole, an object falling into
// water gets wet and one falling into lava burns; a potion may break on a hot level's ground.
// ref: src/do.c flooreffects(),
// boulder_hits_pool(); src/trap.c lava_damage(), fire_damage(), fire_damage_chain()
//
// Shared by moverock.ts (a pushed boulder), the scroll of earth (falling boulders), dropping,
// throwing, kicking and scattering, so it sits below them and imports none of them; trap.ts uses
// it for objects teleported onto a pit or hole (rloco()).
// Not ported: the Plane of Water, burying the objects under a filled
// pool or pit (bury_objs(): nothing is buried), globs merging, the
// teetering-at-a-pit tumble, ship_object().
import {
  cellIndex,
  contents,
  getPlayer,
  heroBlind,
  isVisible,
  itemsAt,
  takeOut,
  trapAt,
  type Ctx,
  type Entity,
  type Msg,
} from '@nh/core';
import { couldseeAt } from './apparxy';
import { erodeObj } from './erode';
import { potionVaporsLate, setFloorEffects } from './floorfx';
import { placeOnFloor, weight } from './items';
import { catchLit } from './light';
import { isLava, isPool, isPoolOrLava, isWaterwall, mInAir, waterbodyName } from './liquid';
import { luckOf } from './luck';
import { belowDragonHide, objResists } from './material';
import { mondied } from './mondeath';
import { wakeNearto } from './noise';
import { P, hasProp } from './props';
import { burnAwaySlime } from './slimestate';
import { T, setTerrain, terrainIdAt } from './terrain';
import { levelTemperature } from './temperature';
import { flying, levitating } from './trapstate';
import { setUinwater, uinwater } from './uwater';
import { waterDamage } from './water';
import { isRaisedSpan, setDrawbridgeUnder } from './dbstate';
import { BOULDER } from './boulder';
import { dbonU, monsterIdAt } from './combat';
import { hmonThrownHit } from './hmon';
import { losehp } from './hp';
import { monkilled } from './mondeath';
import { ringBonus } from './props';
import { maybeFinishSokoban } from './sokoban';
import {
  clearConjoinedPits,
  isHole,
  isMtrapped,
  isPit,
  setMtrapped,
  setUtrap,
  utrap,
} from './trapstate';
import { doname, xnameOf } from './objnam';

/**
 * A boulder's damage to a monster: `rnd(20)` (objects.h BOULDER sdam = ldam = 20; it is never
 * blessed, enchanted or eroded). ref: src/weapon.c dmgval()
 */
export const boulderDmgval = (ctx: Pick<Ctx, 'rng'>): number => ctx.rng.rnd(20);

/**
 * The verb of flooreffects(): `"fall"` from moverock() and the scroll of earth, `"land"` from
 * scatter(), `"settle"` from fill_pit().
 */
export type FloorVerb = 'fall' | 'land' | 'settle' | 'drop';

const say = (ctx: Ctx, key: string, params?: Record<string, string | { key: string }>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * The boulder `obj` lands at (x, y) of the hero's level. On a pit or hole: a monster trapped
 * there is hit by it (thrown by the hero: hmon() with the boulder's `rnd(20)` plus the
 * increase-damage and Str bonuses) and let out of the pit; the hero trapped there is squished
 * (`rnd(15)`); then "The boulder fills a pit." (or plugs the hole), the trap is gone and the
 * boulder used up. Returns false (nothing happened, the caller places the boulder) anywhere else.
 * With `monMoving` (a rolling boulder set off by a monster) the trapped monster takes the
 * boulder's dmgval() without the hero's hmon() and its kill is no one's.
 * `seen` is moverock()'s "vision kludge": the pushed-into pit counts as in sight unless the
 * hero is blind. Only the hero's boulders are ported (no `context.mon_moving` case: no monster
 * throws or drops one). The objects in the pit are not buried (bury_objs(): nothing is buried).
 * ref: src/do.c flooreffects()
 */
export function boulderFlooreffects(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  verb: FloorVerb,
  seen = false,
  monMoving = false,
): boolean {
  if (obj.def !== BOULDER) return false;
  if (boulderHitsPool(ctx, obj, x, y, false)) return true;
  const levelId = ctx.state.currentLevel;
  const level = ctx.state.levels[levelId];
  const t = level ? trapAt(level, x, y) : undefined;
  if (!level || !t || !(isPit(t.def) || isHole(t.def))) return false;
  const ttyp = t.def;
  const tseen = t.seen;
  const blind = heroBlind(ctx.defs, ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  const uAt = hp?.level === levelId && hp.x === x && hp.y === y;
  const cansee = seen ? !blind : isVisible(ctx.state, cellIndex(level, x, y));
  const verbs = { key: `boulder.verb.${verb}s` };
  const mtmp = monsterAt(ctx, levelId, x, y);
  let squished = false;
  if ((mtmp && isMtrapped(ctx, mtmp.id)) || (utrap(ctx) && uAt)) {
    const trappedMon = mtmp && isMtrapped(ctx, mtmp.id) ? mtmp : null;
    if (cansee || uAt)
      say(
        ctx,
        trappedMon
          ? blind
            ? 'boulder.into_pit_blind'
            : 'boulder.into_pit'
          : blind
            ? 'boulder.into_pit_you_blind'
            : 'boulder.into_pit_you',
        { verb: verbs },
      );
    if (trappedMon && monMoving) {
      // context.mon_moving (a rolling boulder a monster set off): dmgval() off its hit points,
      // "The X is killed!" when spotted, mondied(); no credit to the hero
      const hp2 = trappedMon.c.hp;
      if (hp2) hp2.cur -= boulderDmgval(ctx);
      if (!hp2 || hp2.cur < 1) monkilled(ctx, trappedMon.id, true);
      else setMtrapped(ctx, trappedMon.id, false);
    } else if (trappedMon) {
      // no passes_walls or rock throwers exist: hmon(mtmp, obj, HMON_THROWN, dieroll 1)
      let dmg = boulderDmgval(ctx);
      // hmon_hitmon_dmg_recalc(): u.udaminc and the Str bonus (no launcher)
      if (dmg > 0) dmg += ringBonus(ctx.state, 'nh:ring_of_increase_damage');
      dmg += dbonU(ctx);
      if (dmg < 1) dmg = 1;
      hmonThrownHit(ctx, trappedMon, dmg, xnameOf(ctx.state, ctx.defs, obj));
      if (ctx.state.entities[String(trappedMon.id)]) setMtrapped(ctx, trappedMon.id, false);
    } else {
      // no Passes_walls or giant form for the hero
      losehp(ctx, ctx.rng.rnd(15), '!@killer.boulder.squished');
      squished = true;
    }
  }
  if (!squished) {
    if (blind && uAt) say(ctx, 'boulder.crash_beneath');
    else if (!blind && cansee)
      say(
        ctx,
        ttyp === 'nh:trap_door'
          ? tseen
            ? 'boulder.plugs_trapdoor_floor'
            : 'boulder.triggers_plugs_trapdoor'
          : ttyp === 'nh:hole'
            ? 'boulder.plugs_hole_floor'
            : 'boulder.fills_pit',
      );
    else say(ctx, 'boulder.hear_verb', { verb: { key: `boulder.verb.${verb}` } });
  }
  // deletedwithboulder: delfloortrap() (lets a monster still in it out), reset_utrap()
  const filled = trapAt(level, x, y);
  if (filled) {
    const m = monsterAt(ctx, levelId, x, y);
    if (m) setMtrapped(ctx, m.id, false);
    clearConjoinedPits(level, filled); // deltrap()
    ctx.removeTrap(levelId, { x, y });
    maybeFinishSokoban(ctx, levelId); // deltrap()
    if (utrap(ctx) && uAt) setUtrap(ctx, 0, 'pit');
  }
  ctx.remove(obj.id); // useupf(obj, 1L)
  return true;
}

const monsterAt = (ctx: Ctx, levelId: string, x: number, y: number): Entity | null => {
  const id = monsterIdAt(ctx, { x, y }, levelId);
  return id === null || id === ctx.state.playerId ? null : (ctx.state.entities[String(id)] ?? null);
};

/**
 * A boulder lying on a pit or hole fills it (after a land mine turned into a pit under it).
 * ref: src/trap.c fill_pit()
 */
export function fillPit(ctx: Ctx, x: number, y: number, monMoving = false): void {
  const levelId = ctx.state.currentLevel;
  const level = ctx.state.levels[levelId];
  const t = level ? trapAt(level, x, y) : undefined;
  if (!t || !(isPit(t.def) || isHole(t.def))) return;
  const b = boulderOn(ctx, levelId, x, y);
  if (!b) return;
  delete b.c.pos; // obj_extract_self()
  if (!boulderFlooreffects(ctx, b, x, y, 'settle', false, monMoving))
    b.c.pos = { level: levelId, x, y };
}

const boulderOn = (ctx: Ctx, levelId: string, x: number, y: number): Entity | null => {
  for (const o of itemsAt(ctx.defs, ctx.state, levelId, x, y)) if (o.def === BOULDER) return o;
  return null;
};

// ---------------------------------------------------------------------------------------------
// pools and lava

const heroAtXY = (ctx: Ctx, x: number, y: number): boolean => {
  const hp = getPlayer(ctx.state).c.pos;
  return hp?.level === ctx.state.currentLevel && hp.x === x && hp.y === y;
};

/** cansee(x, y) on the hero's level. */
const canseeXY = (ctx: Ctx, x: number, y: number): boolean => {
  const level = ctx.state.levels[ctx.state.currentLevel];
  return !!level && isVisible(ctx.state, cellIndex(level, x, y));
};

/**
 * A boulder dropped, thrown or pushed (`pushing`) into water or lava at (rx, ry) of the hero's
 * level: it fills the spot 9 times in 10 in water, 1 in 10 in lava, half the time in a wall of
 * water (`rn2(10)`), making floor there and killing a monster in it that is not in the air
 * ("You push the boulder into the pool of water.  Now you can cross it!"); else it sinks
 * ("There is a large splash as the boulder falls into the pool of water."  "It sinks without a
 * trace!"), and molten lava splashes the hero next to it (`d(3, 6)`, `d(1, 6)` fire resistant).
 * The boulder is gone either way. False when (rx, ry) is no water or lava.
 * ref: src/do.c boulder_hits_pool() (no Plane of Water, steeds or Deafness; the objects under it
 * are not buried)
 */
export function boulderHitsPool(
  ctx: Ctx,
  otmp: Entity,
  rx: number,
  ry: number,
  pushing: boolean,
): boolean {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (otmp.def !== BOULDER || !level || !isPoolOrLava(ctx, level, rx, ry)) return false;
  const lava = isLava(ctx, level, rx, ry);
  const what = `@${waterbodyName(ctx, level, rx, ry)}`;
  const chance = ctx.rng.rn2(10); // water: 90%; lava: 10%
  // chance for boulder to fill pool: lava 10%, wall of water 50%, other water 90%
  const fillsUp = isWaterwall(ctx, level, rx, ry) ? chance < 5 : lava ? chance === 0 : chance !== 0;
  const blind = heroBlind(ctx.defs, ctx.state);
  const name = xnameOf(ctx.state, ctx.defs, otmp);
  if (fillsUp) {
    // the moat or lava under a raised drawbridge becomes its floor (DB_FLOOR)
    if (isRaisedSpan(level, rx, ry)) setDrawbridgeUnder(ctx, level, rx, ry, 'floor');
    else setTerrain(level, rx, ry, T.floor);
    const mtmp = monsterAt(ctx, level.id, rx, ry);
    if (mtmp && !mInAir(ctx, mtmp)) mondied(ctx, mtmp.id);
    // no trap can lie on water; nothing is buried (bury_objs())
    if (pushing) {
      say(ctx, 'boulder.push_into', { what: name, water: what });
      if (!blind) say(ctx, 'boulder.can_cross');
      // no splashing in this case
    }
  }
  if (!fillsUp || !pushing) {
    // splashing occurs
    if (!uinwater(ctx)) {
      if (pushing ? !blind : canseeXY(ctx, rx, ry))
        say(ctx, fillsUp ? 'boulder.splash_fills' : 'boulder.splash_falls', {
          what: name,
          water: what,
        });
      else say(ctx, lava ? 'boulder.hear_sizzle' : 'boulder.hear_splash');
      wakeNearto(ctx, rx, ry, 40);
    }
    const hp = getPlayer(ctx.state).c.pos;
    const near = hp !== undefined && Math.abs(hp.x - rx) <= 1 && Math.abs(hp.y - ry) <= 1;
    if (fillsUp && uinwater(ctx) && heroAtXY(ctx, rx, ry)) {
      setUinwater(ctx, false);
      say(ctx, 'boulder.dry_land');
    } else if (lava && near) {
      const fireRes = hasProp(getPlayer(ctx.state), P.FIRE_RES);
      say(ctx, fireRes ? 'boulder.molten_hit_res' : 'boulder.molten_hit');
      burnAwaySlime(ctx);
      losehp(ctx, ctx.rng.d(fireRes ? 1 : 3, 6), '@killer.lava'); // no Half_physical_damage source
    } else if (!fillsUp && (pushing ? !blind : canseeXY(ctx, rx, ry))) say(ctx, 'boulder.sinks');
  }
  // boulder is now gone
  if (otmp.c.item?.carriedBy != null || otmp.c.item?.containedIn !== undefined)
    takeOut(ctx.state, otmp.id);
  ctx.remove(otmp.id);
  return true;
}

/** ref: src/trap.c destroy_strings[] rows for fire_damage(): potions, oil, scrolls, books */
const burnKey = (dindx: 'boil' | 'oil' | 'scroll' | 'book', many: boolean): string =>
  `destroy.${dindx}${many ? '_pl' : ''}`;

/**
 * Sets an object (free or on the floor at (x, y)) on fire; true when it was destroyed. A lamp
 * may light instead; statues and ice boxes are immune; another container burns unless luck saves
 * it (`rn2(chance)` against Luck + 5: 40 for a chest, 30 for a large box, 20 else; never with
 * `force`), "The sack catches fire and burns." and its contents fall out onto (x, y) (into
 * flooreffects()); else luck may save it (`rn2(20)`); scrolls and spellbooks burn (not fire
 * ones), potions boil, anything else burns one level and may be destroyed.
 * ref: src/trap.c fire_damage()
 */
export function fireDamage(ctx: Ctx, obj: Entity, force: boolean, x: number, y: number): boolean {
  const it = obj.c.item;
  if (!it) return false;
  const inSight = !heroBlind(ctx.defs, ctx.state) && couldseeAt(ctx, x, y);
  // object might light in a controlled manner
  if (catchLit(ctx, obj)) return false;
  const def = ctx.defs.object(obj.def);
  const name = (): Msg => xnameOf(ctx.state, ctx.defs, obj);
  if (def.container || obj.def === 'nh:statue') {
    if (obj.def === 'nh:statue' || obj.def === 'nh:ice_box') return false; // immune
    const chance = obj.def === 'nh:chest' ? 40 : obj.def === 'nh:large_box' ? 30 : 20;
    if (!force && luckOf(ctx.state) + 5 > ctx.rng.rn2(chance)) return false;
    // container is burnt up - dump contents out
    if (inSight) say(ctx, 'flooreffects.container_burns', { item: name() });
    const inside = contents(ctx.state, obj.id);
    if (inside.length > 0) {
      if (inSight) say(ctx, 'flooreffects.contents_fall');
      const levelId = ctx.state.currentLevel;
      for (const o of inside) {
        takeOut(ctx.state, o.id);
        if (!flooreffects(ctx, o, x, y, '')) placeOnFloor(ctx, o.id, levelId, x, y);
      }
    }
    destroyObj(ctx, obj);
    return true;
  }
  // chance per item of sustaining damage: max luck 10%, avg luck (Luck==0) 75%, awful luck
  // (Luck<-4) 100%
  if (!force && luckOf(ctx.state) + 5 > ctx.rng.rn2(20)) return false;
  if (def.class === 'scroll' || def.class === 'spellbook') {
    if (obj.def === 'nh:scroll_of_fire' || obj.def === 'nh:spellbook_of_fireball') return false;
    if (obj.def === 'nh:book_of_the_dead') {
      if (inSight) say(ctx, 'erode.book_smoke', { item: name() });
      return false;
    }
    if (inSight)
      say(ctx, 'flooreffects.burns', {
        item: name(),
        what: { key: burnKey(def.class === 'scroll' ? 'scroll' : 'book', it.quantity > 1) },
      });
    destroyObj(ctx, obj);
    return true;
  }
  if (def.class === 'potion') {
    if (inSight)
      say(ctx, 'flooreffects.burns', {
        item: name(),
        what: { key: burnKey(obj.def !== 'nh:potion_of_oil' ? 'boil' : 'oil', it.quantity > 1) },
      });
    destroyObj(ctx, obj);
    return true;
  }
  return (
    withSpot(ctx, obj, x, y, () => erodeObj(ctx, obj, null, 'burn', { destroy: true })) ===
    'destroyed'
  );
}

/**
 * fire_damage() for each object of `objs` (lying at (x, y)); "You smell smoke." when the hero
 * cannot see it. Returns how many were destroyed. ref: src/trap.c fire_damage_chain()
 */
export function fireDamageChain(
  ctx: Ctx,
  objs: readonly Entity[],
  force: boolean,
  x: number,
  y: number,
): number {
  let num = 0;
  for (const o of objs)
    if (ctx.state.entities[String(o.id)] && fireDamage(ctx, o, force, x, y)) num++;
  if (num && heroBlind(ctx.defs, ctx.state) && !couldseeAt(ctx, x, y))
    say(ctx, 'flooreffects.smell_smoke');
  return num;
}

/**
 * An object thrown or dropped into lava: anything up to bone (not scrolls or spellbooks, which
 * fire_damage() burns) that is not fireproof, a wand of fire or a container with something in it
 * burns up ("You see a dagger hit lava and burn up!", "It burns up!" for the thrown or kicked
 * object); the rest is fire_damage() with no luck. True when it is gone.
 * ref: src/trap.c lava_damage() (no Amulet, invocation items or Rider corpses: obj_resists())
 */
export function lavaDamage(ctx: Ctx, obj: Entity, x: number, y: number, thrown = false): boolean {
  const def = ctx.defs.object(obj.def);
  if (
    belowDragonHide(def) &&
    def.class !== 'scroll' &&
    def.class !== 'spellbook' &&
    def.prop !== P.FIRE_RES &&
    obj.def !== 'nh:wand_of_fire' &&
    obj.def !== 'nh:fire_horn' &&
    !obj.c.item?.erodeproof &&
    // fire_damage() knows how to deal with containers and contents
    contents(ctx.state, obj.id).length === 0
  ) {
    if (canseeXY(ctx, x, y)) {
      if (thrown)
        say(
          ctx,
          (obj.c.item?.quantity ?? 1) > 1
            ? 'flooreffects.they_burn_up'
            : 'flooreffects.it_burns_up',
        );
      else say(ctx, 'flooreffects.hit_lava', { item: doname(ctx.state, ctx.defs, obj) });
    }
    destroyObj(ctx, obj);
    return true;
  }
  return fireDamage(ctx, obj, true, x, y);
}

/** delobj(): the object is gone, from wherever it is. */
function destroyObj(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (it?.containedIn !== undefined) takeOut(ctx.state, obj.id);
  ctx.remove(obj.id);
}

/**
 * Runs `fn` with a free object at (x, y) of the hero's level, as C's flooreffects() sets
 * bhitpos so erode_obj() can tell whether the hero sees it.
 */
function withSpot<R>(ctx: Ctx, obj: Entity, x: number, y: number, fn: () => R): R {
  if (obj.c.pos || obj.c.item?.carriedBy != null || obj.c.item?.containedIn !== undefined)
    return fn();
  obj.c.pos = { level: ctx.state.currentLevel, x, y };
  try {
    return fn();
  } finally {
    if (ctx.state.entities[String(obj.id)]) delete obj.c.pos;
  }
}

/** ref: include/weight.h WT_SPLASH_THRESHOLD: weight needed to make splash in water */
const WT_SPLASH_THRESHOLD = 9;

/**
 * A free object (`obj`, in no inventory, container or square) lands at (x, y) of the hero's
 * level. A boulder fills water, lava, a pit or a hole (boulderHitsPool(), boulderFlooreffects());
 * in lava anything else meets lava_damage(); in water it gets wet (water_damage()), with
 * "Splash!" for something heavy (or "Plop!" when floating) at her blind or floating feet. True
 * when the object is gone, else the caller places it. `verb` is C's: '' for no boulder message;
 * `thrown` is C's thrownobj/kickedobj for lava's message.
 * ref: src/do.c flooreffects() (the boulder, lava and pool parts; no Underwater view)
 */
export function flooreffects(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  verb: FloorVerb | '',
  opts: { thrown?: boolean; seen?: boolean; monMoving?: boolean } = {},
): boolean {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level) return false;
  if (obj.def === BOULDER)
    return boulderFlooreffects(
      ctx,
      obj,
      x,
      y,
      verb === '' ? 'fall' : verb,
      opts.seen === true,
      opts.monMoving === true,
    );
  if (isLava(ctx, level, x, y)) return lavaDamage(ctx, obj, x, y, opts.thrown === true);
  if (isPool(ctx, level, x, y)) {
    // reasonably bulky objects (arbitrary) splash when dropped; if you're floating above the
    // water even small things make noise
    const floating = levitating(ctx) || flying(ctx);
    if ((heroBlind(ctx.defs, ctx.state) || floating) && heroAtXY(ctx, x, y)) {
      if (weight(ctx.defs, obj, ctx.state) > WT_SPLASH_THRESHOLD) say(ctx, 'flooreffects.splash');
      else if (floating) say(ctx, 'flooreffects.plop');
    }
    return withSpot(ctx, obj, x, y, () => waterDamage(ctx, obj, null, false)) === 'destroyed';
  }
  if (
    ctx.defs.object(obj.def).class === 'potion' &&
    levelTemperature(ctx, level) > 0 &&
    (terrainIdAt(level, x, y) === T.floor || terrainIdAt(level, x, y) === T.corr)
  )
    return hotGround(ctx, obj, x, y);
  return false;
}

/**
 * A potion landing on the hot ground of a hot level: "The potion heats up as it hits the hot
 * ground." when seen; it survives 50 times in 100 (70 blessed; adjusted by 2 per point of Luck
 * when it is or was hers; oil always), else "It shatters from the heat!" ("You hear a
 * shattering noise." unseen) and it breaks (its vapors next to her). True when it is gone.
 * ref: src/do.c flooreffects() (the potion part); src/dothrow.c breakobj() (not hero-caused)
 */
function hotGround(ctx: Ctx, obj: Entity, x: number, y: number): boolean {
  const many = (obj.c.item?.quantity ?? 1) > 1;
  const seen = canseeXY(ctx, x, y);
  if (seen)
    say(ctx, many ? 'flooreffects.heat_up_pl' : 'flooreffects.heat_up', {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
  let survival = obj.c.item?.buc === 'blessed' ? 70 : 50;
  if (obj.c.item?.letter) survival += luckOf(ctx.state) * 2;
  if (obj.def === 'nh:potion_of_oil') survival = 100;
  if (objResists(ctx, obj, survival, 100)) return false;
  if (seen) say(ctx, many ? 'flooreffects.shatter_heat_pl' : 'flooreffects.shatters_heat');
  else say(ctx, 'flooreffects.hear_shatter');
  potionVaporsLate(ctx, obj, x, y);
  if (ctx.state.entities[String(obj.id)]) destroyObj(ctx, obj);
  return true;
}

setFloorEffects((ctx, obj, x, y, verb) => flooreffects(ctx, obj, x, y, verb));
