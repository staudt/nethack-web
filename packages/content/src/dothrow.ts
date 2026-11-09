// Throwing objects. ref: src/dothrow.c dothrow(), throw_obj(), throwit(), thitmonst(), tmiss(),
// hitfloor(); src/zap.c bhit() (thrown objects only); src/uhitm.c hmon_hitmon(); shop goods
// thrown (check_shop_obj(), in shk.ts)
import { minstapetrify } from './stoning';
import { bareCorpseTouch, petrifyingCorpse } from './stonetouch';
import { digests, engulfingU, isSwallowed, isWhirly, uswallow } from './engulfstate';
import { isAnimal, mpickobj } from './steal';
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  inBounds,
  inventoryOf,
  isVisible,
  shownId,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Json,
  type Msg,
  type ObjectDef,
  type Offer,
  type PlayerAction,
  type Pos,
  type PromptOption,
} from '@nh/core';
import { getdirImpaired } from './hackmove';
import { aAlign, doaltarobj } from './align';
import { ACCFOOD, dogfood, isDomestic, isTame, tamedog } from './dog';
import { setmangry, wakeup } from './peaceful';
import { canBlnd } from './adtyping';
import { killedByHero } from './buzz';
import { mblinded, mcansee, setMblinded } from './mstate';
import { dogEat } from './dogmove';
import { dbonU, dmgval, monsterIdAt } from './combat';
import { encumberMsg } from './itemactions';
import {
  mksobj,
  placeObject,
  placeOnFloor,
  removeFromInventory,
  splitStack,
  stackobj,
  weight,
} from './items';
import { uShops } from './eshk';
import { isUnpaid } from './price';
import { checkShopObj, sellobj, sellobjState } from './shk';
import { checkCapacity, heroEntity } from './magic';
import { hatesSilver, nohands, notake } from './mondata';
import { xnameOf } from './objnam';
import { heroForm } from './upoly';
import { stuckInWeb } from './web';
import {
  ammoAndLauncher,
  isAmmo,
  isMissile,
  matchingLauncher,
  omonAdj,
  shouldMulchMissile,
} from './mthrowu';
import {
  P_EXPERT,
  P_SKILLED,
  skillLevel,
  useSkill,
  weaponDamBonus,
  weaponHitBonus,
} from './skills';
import { acurrstr, findMac } from './stats';
import { monNam, revealUnseenAt } from './perception';
import { luckOf } from './luck';
import { P, hasProp, heroHas, ringBonus, wornIn } from './props';
import { hmonThrownHit, missileMsg, type Shot } from './hmon';
import { EGG } from './eggstate';
import { breakEggs, hitWithEgg } from './egghit';
import { breaktest } from './material';

export const THROW_ID: DefId = 'nh:throw';

const BLINDING_VENOM: DefId = 'nh:splash_of_blinding_venom';

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

const msg = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * ref: src/dothrow.c throwing_weapon(): missiles (darts), spears, daggers and knives (pierce
 * blades that are not swords) and the aklys are meant to be thrown. (We have no war hammers.)
 */
function throwingWeapon(def: ObjectDef): boolean {
  const skill = def.weapon?.skill;
  return (
    isMissile(def) ||
    skill === 'spear' ||
    skill === 'dagger' ||
    skill === 'knife' ||
    def.id === 'nh:aklys'
  );
}

/** The hero's wielded weapon (the launcher, for ammo), if any. */
function heroWielded(ctx: Ctx): Entity | null {
  return (
    inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null
  );
}

const distmin = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// ---------------------------------------------------------------------------------------------
// hitting a monster

/** ref: src/dothrow.c tmiss(): "The dagger misses the newt." and a 1 in 3 chance to wake it. */
function tmiss(ctx: Ctx, mon: Entity, missile: Msg, shot: Shot): void {
  missileMsg(ctx, 'throw.miss', shot, missile, { mon: monNam(ctx, mon) });
  if (mon.c.monster && ctx.rng.rn2(3) === 0) wakeup(ctx, mon.id); // wakeup(mon, TRUE)
}

/**
 * The thrown object tries to hit the monster; returns true when it was used up (a missile that
 * broke). ref: src/dothrow.c thitmonst(): to-hit is -1 + AC + level + Dex bonus + distance
 * (3 - distance, at least -4) + size + sleeping + hitval; ammo shot from its launcher adds the
 * launcher's enchantment and skill bonus, ammo thrown by hand is -4, other weapons get +2 when
 * meant to be thrown (-2 when not) and the skill bonus; `tmp >= rnd(20)` hits; then
 * src/uhitm.c hmon(): ammo shot from its launcher does dmgval() plus the launcher's skill damage
 * bonus (no Str bonus), ammo thrown by hand only rnd(2) plus the Str bonus. Hits may break the
 * missile (should_mulch_missile). Rings of increase accuracy and damage count; gauntlets of power (-2) and of
 * fumbling (-3) hinder a bow. An egg hits if Dex > rnd(25) (egghit.ts). Not ported: racial bows,
 * unicorns, the quest leader, boomerangs and balls, cream pies, thrown potions (they
 * land without breaking), taming with food, passive responses, poison, knockback. Silver sears
 * a silver-hater. `applied`: a polearm or lance applied at range (HMON_APPLIED, pole.ts): no
 * thrown penalty, melee damage, a miss wakes the monster, and the pole is never used up.
 */
export function thitmonst(
  ctx: Ctx,
  monId: EntityId,
  objId: EntityId,
  shot: Shot,
  applied = false,
): boolean {
  const mon = ctx.state.entities[String(monId)];
  const obj = ctx.state.entities[String(objId)];
  const m = mon?.c.monster;
  const hero = heroEntity(ctx);
  if (!mon || !m || !obj?.c.item || !hero.c.pos || !mon.c.pos) return false;
  const mdef = ctx.defs.monster(mon.def);
  const odef = ctx.defs.object(obj.def);
  const dex = hero.c.attributes?.dex ?? 10;
  const ulevel = hero.c.experience?.level ?? 1;

  let tmp =
    -1 +
    luckOf(ctx.state) +
    findMac(ctx.state, ctx.defs, monId) +
    ringBonus(ctx.state, 'nh:ring_of_increase_accuracy') + // u.uhitinc
    ulevel;
  if (dex < 4) tmp -= 3;
  else if (dex < 6) tmp -= 2;
  else if (dex < 8) tmp -= 1;
  else if (dex >= 14) tmp += dex - 14;
  // distance: close targets are easier
  let disttmp = 3 - distmin(hero.c.pos.x, hero.c.pos.y, mon.c.pos.x, mon.c.pos.y);
  if (disttmp < -4) disttmp = -4;
  tmp += disttmp;
  // gloves are a hindrance to proper use of bows
  const wielded = heroWielded(ctx);
  const gloves = wornIn(ctx.state, hero.id, 'gloves');
  if (gloves && wielded && ctx.defs.object(wielded.def).weapon?.skill === 'bow') {
    if (gloves.def === 'nh:gauntlets_of_power')
      tmp -= 2; // metal
    else if (gloves.def === 'nh:gauntlets_of_fumbling') tmp -= 3;
  }
  tmp += omonAdj(mon, mdef, obj, odef);

  // the engulfer holding her is a guaranteed hit
  const guaranteedHit = engulfingU(ctx, monId);
  if (guaranteedHit) tmp += 1000;

  const dieroll = ctx.rng.rnd(20);
  const missile = xnameOf(ctx.state, ctx.defs, obj);

  // venom spat by a polymorphed hero (#monster): `guaranteed_hit || ACURR(A_DEX) > rnd(25)` hits
  // and is used up; else it misses and splashes where it lands (throwit())
  if (odef.class === 'venom') {
    if (guaranteedHit || dex > ctx.rng.rnd(25)) {
      venomHit(ctx, mon, obj);
      ctx.remove(objId);
      return true;
    }
    if (guaranteedHit) return false; // (never: the hit above is guaranteed)
    tmiss(ctx, mon, missile, shot);
    return false;
  }

  if ((odef.class !== 'weapon' && odef.class !== 'gem') || !odef.weapon) {
    // ref: thitmonst(): an egg hits if `guaranteed_hit || ACURR(A_DEX) > rnd(25)`; hmon() uses
    // it up (or leaves the rock it became)
    if (obj.def === EGG && (guaranteedHit || dex > ctx.rng.rnd(25))) {
      if (hitWithEgg(ctx, mon, obj, true) === 'hit')
        hmonThrownHit(ctx, mon, 1, missile, shot, null, true);
      return true;
    }
    // ref: thitmonst(): food thrown to a domestic animal (or to a pet that wants it) may tame it
    // or be caught and eaten (befriend_with_obj(); no monkeys or unicorns here)
    if (
      odef.class === 'food' &&
      (isDomestic(mdef) || (isTame(mon) && dogfood(ctx, mon, obj) <= ACCFOOD))
    ) {
      if (
        tamedog(ctx, monId, obj, true, (c, id, o, devour) => {
          const p = mon.c.pos;
          if (!p) return;
          placeOnFloor(c, o.id, p.level, p.x, p.y); // dog_eat expects a floor object
          dogEat(c, id, o, { x: p.x, y: p.y }, devour);
        })
      )
        return true; // the food is gone (or the monster was just tamed)
      tmiss(ctx, mon, missile, shot);
      m.asleep = false;
      return false;
    }
    if (guaranteedHit) {
      // this assumes that guaranteed_hit is due to swallowing: "The apple vanishes into the
      // purple worm's entrails."
      wakeup(ctx, monId);
      const md = ctx.defs.monster(mon.def);
      // a cockatrice corpse turns an animal engulfer to stone
      if (petrifyingCorpse(ctx, obj) && isAnimal(md)) {
        minstapetrify(ctx, mon, true);
        // don't leave a cockatrice corpse available in a statue
        if (!isSwallowed(ctx)) {
          ctx.remove(objId);
          return true;
        }
      }
      msg(ctx, `throw.vanishes${digests(md) ? '_entrails' : isWhirly(md) ? '_currents' : ''}`, {
        item: missile,
        mon: monNam(ctx, mon),
      });
      return false;
    }
    tmiss(ctx, mon, missile, shot);
    return false;
  }
  const uwep = heroWielded(ctx);
  const uwdef = uwep ? ctx.defs.object(uwep.def) : null;
  const launched = uwep !== null && uwdef !== null && ammoAndLauncher(odef, uwdef);
  if (isAmmo(odef)) {
    if (!launched) tmp -= 4;
    else {
      tmp += uwep.c.item?.spe ?? 0;
      tmp += weaponHitBonus(skillLevel(ctx, uwdef.weapon?.skill ?? ''), uwdef);
    }
  } else {
    // thrown non-ammo or applied polearm: +2 for a weapon meant to be thrown, -2 for another
    // thrown one (an applied polearm has neither), plus the skill bonus
    if (throwingWeapon(odef)) tmp += 2;
    else if (!applied) tmp -= 2;
    tmp += weaponHitBonus(skillLevel(ctx, odef.weapon.skill), odef);
  }
  if (!(tmp >= dieroll)) {
    tmiss(ctx, mon, missile, shot);
    if (applied) wakeup(ctx, monId); // wakeup(mon, TRUE)
    return false;
  }

  // ref: src/uhitm.c hmon_hitmon_dmg_recalc(): `dmgbonus = u.udaminc` for every thrown weapon
  const udaminc = ringBonus(ctx.state, 'nh:ring_of_increase_damage');
  let dmg: number;
  // ref: hmon_hitmon_weapon_*(): silvermsg, silverobj (dmgval() adds the melee rnd(20))
  const silverHit = odef.material === 'silver' && hatesSilver(mdef);
  if (isAmmo(odef) && !launched) {
    // ref: hmon_hitmon_weapon_ranged(): "then do only 1-2 points of damage"; no skill bonus;
    // silver makes it worse, `rnd(dmg ? 20 : 10)`
    dmg = ctx.rng.rnd(2);
    if (silverHit) dmg += ctx.rng.rnd(dmg ? 20 : 10);
    dmg += udaminc + dbonU(ctx);
  } else if (launched && uwdef) {
    // a propellor gives the launcher's skill bonus but not a strength one
    dmg = dmgval(ctx.rng, obj, odef, mdef);
    // ref: hmon_hitmon_weapon_ranged(): train_weapon_skill = (dmg > 0), the launcher's skill
    useSkill(ctx, uwdef.weapon?.skill ?? '', 1);
    if (dmg > 0) dmg += udaminc; // hmon_hitmon_dmg_recalc(): increase damage, no Str bonus
    dmg += weaponDamBonus(skillLevel(ctx, uwdef.weapon?.skill ?? ''), uwdef);
  } else {
    // ref: src/uhitm.c hmon_hitmon_weapon_melee(): dmgval, then the Str bonus and the
    // weapon-skill bonus; at least 1.
    dmg = dmgval(ctx.rng, obj, odef, mdef);
    if (dmg > 1) useSkill(ctx, odef.weapon.skill, 1); // a minimal hit doesn't exercise proficiency
    if (dmg > 0) dmg += udaminc;
    dmg += dbonU(ctx);
    dmg += weaponDamBonus(skillLevel(ctx, odef.weapon.skill), odef);
  }
  if (dmg < 1) dmg = 1;
  hmonThrownHit(ctx, mon, dmg, missile, shot, silverHit ? obj : null);
  if (applied) return false; // the polearm stays in her hands
  // projectiles other than magic stones sometimes disappear when thrown
  if (shouldMulchMissile(ctx, obj, false)) {
    if (mon.c.pos && (uShops(ctx).length > 0 || obj.c.item?.unpaid))
      checkShopObj(ctx, obj, mon.c.pos.x, mon.c.pos.y, true);
    ctx.remove(objId);
    return true;
  }
  return false;
}

/**
 * The hero's venom hits a monster: blinding venom wakes it, angers it and blinds it for
 * rn1(25, 21) more turns ("The venom blinds the jackal!", "Splash!" when she is blind or it
 * cannot be blinded); acid venom burns it for dmgval() unless it resists acid.
 * ref: src/uhitm.c hmon_hitmon_misc_obj() BLINDING_VENOM, ACID_VENOM
 */
function venomHit(ctx: Ctx, mon: Entity, obj: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  const hero = heroEntity(ctx);
  if (obj.def === BLINDING_VENOM) {
    m.asleep = false;
    if (canBlnd(ctx, hero, mon, 'spit', obj)) {
      if (hasProp(hero, P.BLINDED)) msg(ctx, 'throw.venom_splash');
      else
        msg(ctx, mcansee(ctx, mon.id) ? 'throw.venom_blinds' : 'throw.venom_blinds_further', {
          mon: monNam(ctx, mon),
        });
      setmangry(ctx, mon.id);
      const dmg = ctx.rng.rn2(25) + 21; // rn1(25, 21)
      setMblinded(ctx, mon.id, Math.min(127, mblinded(ctx, mon.id) + dmg));
    } else {
      msg(ctx, 'throw.venom_splash');
      setmangry(ctx, mon.id);
    }
    return;
  }
  // acid venom
  const mdef = ctx.defs.monster(mon.def);
  let dmg = 0;
  if (mdef.resists.includes('acid')) msg(ctx, 'throw.venom_harmless', { mon: monNam(ctx, mon) });
  else {
    msg(ctx, 'throw.venom_burns', { mon: monNam(ctx, mon) });
    dmg = dmgval(ctx.rng, obj, ctx.defs.object(obj.def), mdef);
  }
  wakeup(ctx, mon.id);
  const hp = mon.c.hp;
  if (hp && dmg > 0) {
    hp.cur -= dmg;
    if (hp.cur < 1) killedByHero(ctx, mon);
  }
}

/**
 * The polymorphed hero spits venom of type `otyp` in direction `dir`: a new splash of venom flies
 * as if thrown and always breaks where it lands ("Splash!"). ref: src/polyself.c dospit() (mksobj(),
 * `spe = 1` "yours", throwit())
 */
export function spitVenom(ctx: Ctx, otyp: DefId, dir: Dir): void {
  const otmp = mksobj(ctx, ctx.defs.object(otyp), { quantity: 1 });
  throwit(ctx, otmp, dir, { i: 1, n: 1 });
}

// ---------------------------------------------------------------------------------------------
// the flight

/**
 * Flies the (detached) object from the hero in direction `dir`, hits what is in the way and
 * leaves it on the floor. ref: src/dothrow.c throwit(), src/zap.c bhit(), src/dothrow.c hitfloor()
 */
function throwit(ctx: Ctx, objId: EntityId, dir: Dir, shot: Shot): void {
  const hero = heroEntity(ctx);
  const pos = hero.c.pos;
  const obj = ctx.state.entities[String(objId)];
  const it = obj?.c.item;
  const level = pos ? ctx.state.levels[pos.level] : undefined;
  if (!pos || !obj || !it || !level) return;
  const odef = ctx.defs.object(obj.def);
  let { x: dx, y: dy } = DIRS[dir];
  let dz = 0;

  const uwep = heroWielded(ctx);
  const uwdef = uwep ? ctx.defs.object(uwep.def) : null;
  const launched = uwdef !== null && ammoAndLauncher(odef, uwdef);

  // a cursed object may slip (or ammo misfire): it goes off in a random direction (or just drops)
  if (it.buc === 'cursed' && ctx.rng.rn2(7) === 0) {
    if (launched) {
      msg(ctx, 'throw.misfires', { item: xnameOf(ctx.state, ctx.defs, obj) });
    } else if (throwingWeapon(odef)) {
      msg(ctx, 'throw.slips', { item: xnameOf(ctx.state, ctx.defs, obj) });
    }
    if (launched || throwingWeapon(odef)) {
      dx = ctx.rng.rn2(3) - 1;
      dy = ctx.rng.rn2(3) - 1;
      if (!dx && !dy) dz = 1;
    }
  }

  // ref: throwit(): `if (u.uswallow) { mon = u.ustuck; bhitpos = mon's square }`: the object
  // goes straight at the engulfer (a guaranteed hit) and, unless used up or the engulfer died,
  // ends up inside it (swallowit())
  const sw = uswallow(ctx);
  if (sw) {
    const engulfer = ctx.state.entities[String(sw.mon)];
    if (engulfer && thitmonst(ctx, sw.mon, objId, shot)) return; // used up
    if (ctx.state.entities[String(sw.mon)]?.c.monster && isSwallowed(ctx)) {
      const o = ctx.state.entities[String(objId)];
      if (o) mpickobj(ctx, sw.mon, o);
      return;
    }
    placeOnFloor(ctx, objId, pos.level, pos.x, pos.y);
    return;
  }

  if (dz) {
    // ref: src/dothrow.c hitfloor(): "It hits the floor." (on an altar doaltarobj() instead)
    // then it lands at the hero's feet
    if (aAlign(ctx, pos.x, pos.y) !== null) doaltarobj(ctx, obj);
    else
      msg(ctx, `throw.floor${it.quantity !== 1 ? '_pl' : ''}`, {
        item: ctx.defs.itemName(ctx.state, obj),
      });
    // hero_breaks(obj, u.ux, u.uy, BRK_FROM_INV): an egg breaks on the floor
    if (obj.def === EGG && breaktest(ctx, obj)) {
      msg(ctx, 'egg.splat');
      if (uShops(ctx).length > 0 || isUnpaid(ctx.state, obj))
        checkShopObj(ctx, obj, pos.x, pos.y, true);
      breakEggs(ctx, obj, true);
      return;
    }
    // dropy() -> dropz(): sold without asking on a costly spot (stackobj() comes after)
    sellobj(ctx, obj, pos.x, pos.y, sellobjState('normal'));
    placeOnFloor(ctx, objId, pos.level, pos.x, pos.y);
    return;
  }

  // range = ACURRSTR / 2 - weight / 40, at least 1; a crossbow's range does not depend on Str
  const crossbowing = launched && odef.weapon?.skill === 'crossbow';
  const urange = Math.trunc((crossbowing ? 18 : acurrstr(hero.c.attributes?.str ?? 10)) / 2);
  let range = urange - Math.trunc(weight(ctx.defs, obj, ctx.state) / 40);
  if (range < 1) range = 1;
  if (isAmmo(odef)) {
    if (launched) {
      // shot from its launcher: one farther, or a bolt's full BOLT_LIM
      range = crossbowing ? BOLT_LIM : range + 1;
    } else if (odef.class !== 'gem') {
      // thrown by hand: half the range, and the hero says so
      range = Math.trunc(range / 2);
      msg(ctx, `throw.by_hand.${odef.weapon?.skill ?? 'bow'}`);
    }
  }

  // ref: src/zap.c bhit() for THROWN_WEAPON: a monster stops it; so does anything that is not
  // open floor (a wall, stone, a closed door), in which case it drops in the cell before.
  let x = pos.x;
  let y = pos.y;
  let hitMon: EntityId | null = null;
  const path: Pos[] = []; // the cells of the flight the hero can see
  while (range-- > 0) {
    x += dx;
    y += dy;
    if (!inBounds(level, x, y)) {
      x -= dx;
      y -= dy;
      break;
    }
    const t = ctx.defs.terrain(level.palette[level.cells[y * level.width + x] ?? 0] as DefId);
    const blocked = !t.passable || t.door === 'closed' || t.door === 'locked';
    const mid = blocked ? null : monsterIdAt(ctx, { x, y }, pos.level);
    if (blocked) {
      x -= dx;
      y -= dy;
      break;
    }
    // ref: src/zap.c bhit() tmp_at(): the cell is drawn only when the hero can see it
    if (isVisible(ctx.state, y * level.width + x)) path.push({ x, y });
    // ref: bhit(): an unseen monster that stops it on a seen square is remembered as `I`; an
    // `I` with nothing there is forgotten
    revealUnseenAt(ctx, mid === null ? null : ctx.state.entities[String(mid)], x, y);
    if (mid !== null) {
      hitMon = mid;
      break;
    }
    if (stuckInWeb(ctx, level, x, y, obj)) break;
  }
  // ref: src/dothrow.c throwit() tmp_at(DISP_FLASH, obj_to_glyph(obj)); the UI animates it first
  if (path.length > 0) ctx.emit({ type: 'projectile', g: shownId(ctx.state, obj.def), path });

  if (hitMon !== null) {
    if (thitmonst(ctx, hitMon, objId, shot)) return; // used up
  }
  // venom always breaks where it lands, even on a soft floor: breakmsg() "Splash!", breakobj()
  if (odef.class === 'venom') {
    msg(ctx, 'throw.venom_splash');
    ctx.remove(objId);
    return;
  }
  // ref: throwit(): `!IS_SOFT() && breaktest(obj)`: an egg breaks where it lands, "Splat!"
  // (breakmsg()), then breakobj() (the shop's charge first). Thrown potions and glass still land
  // whole here (DEVIATIONS.md).
  if (obj.def === EGG && breaktest(ctx, obj)) {
    msg(ctx, 'egg.splat');
    if (uShops(ctx).length > 0 || isUnpaid(ctx.state, obj)) checkShopObj(ctx, obj, x, y, true);
    breakEggs(ctx, obj, true);
    return;
  }
  // charge for items thrown out of shop; shk takes possession for items thrown into one
  if (uShops(ctx).length > 0 || isUnpaid(ctx.state, obj)) {
    placeObject(ctx, objId, pos.level, x, y);
    checkShopObj(ctx, obj, x, y, false);
    stackobj(ctx, objId);
    return;
  }
  placeOnFloor(ctx, objId, pos.level, x, y);
}

// ---------------------------------------------------------------------------------------------
// the command

/** ref: src/dothrow.c multishot_class_bonus(): the roles' bonuses (only the Valkyrie exists: none) */
const multishotClassBonus = (): number => 0;

/**
 * How many to throw or shoot at once. ref: src/dothrow.c throw_obj() "Multishot calculations":
 * only for stacks of weapons (ammo only with its launcher wielded); skilled gives +1 and expert
 * +2 (unless Dex <= 6, which allows none); a crossbow needs Str 18 to fire several; then rnd()
 * of the total (Fumbling or Dex <= 6 allow none). Not ported: confusion/stun, role and race
 * bonuses.
 */
function multishotOf(ctx: Ctx, obj: Entity, def: ObjectDef): number {
  const it = obj.c.item;
  if (!it || it.quantity <= 1 || !def.weapon || (def.class !== 'weapon' && !isAmmo(def))) return 1;
  const uwep = heroWielded(ctx);
  const uwdef = uwep ? ctx.defs.object(uwep.def) : null;
  if (isAmmo(def) ? !matchingLauncher(def, uwdef) : def.class !== 'weapon') return 1;
  const attrs = heroEntity(ctx).c.attributes;
  // poor dexterity also inhibits multishot
  const weak = heroHas(ctx.state, P.FUMBLING) || (attrs?.dex ?? 10) <= 6;
  let multishot = 1;
  const skill = skillLevel(ctx, def.weapon.skill);
  if (skill === P_EXPERT) multishot++;
  if ((skill === P_EXPERT || skill === P_SKILLED) && !weak) multishot++;
  multishot += multishotClassBonus();
  // crossbows are slow to load: high strength is necessary to shoot quickly
  if (
    multishot > 1 &&
    def.weapon.skill === 'crossbow' &&
    ammoAndLauncher(def, uwdef) &&
    acurrstr(attrs?.str ?? 10) < 18
  )
    multishot = ctx.rng.rnd(multishot);
  multishot = ctx.rng.rnd(multishot);
  return Math.min(multishot, it.quantity);
}

/** The wielded weapon is stuck to the hand. ref: src/wield.c welded(), weldmsg() */
function weldedHere(ctx: Ctx, e: Entity): boolean {
  const it = e.c.item;
  if (!it || it.equipped !== 'weapon' || it.buc !== 'cursed') return false;
  it.known.buc = true;
  return true;
}

/** Throws the object (a stack) in a direction; returns the energy used. ref: src/dothrow.c throw_obj() */
export function throwObj(ctx: Ctx, obj: Entity, dir: Dir): number {
  const it = obj.c.item;
  if (!it) return 0;
  const def = ctx.defs.object(obj.def);
  // canletgo(): worn armor stays on
  if (it.equipped !== null && it.equipped !== 'weapon') {
    msg(ctx, 'throw.worn');
    return 0;
  }
  if (weldedHere(ctx, obj)) {
    const bi = def.weapon?.bimanual === true;
    const pl = it.quantity !== 1;
    msg(ctx, `wield.welded${pl ? '_pl' : ''}${bi ? '_hands' : ''}`, {
      item: xnameOf(ctx.state, ctx.defs, obj),
    });
    return NORMAL_SPEED;
  }
  // canletgo(): a cursed loadstone cannot be thrown (no time passes)
  if (obj.def === 'nh:loadstone' && it.buc === 'cursed') {
    msg(ctx, it.quantity > 1 ? 'throw.loadstone_any' : 'throw.loadstone');
    it.known.buc = true; // set_bknown()
    return 0;
  }

  // throwing a cockatrice corpse bare-handed (a life-saved hero throws it anyway)
  bareCorpseTouch(ctx, obj, 'throw');
  if (ctx.state.gameOver) return NORMAL_SPEED;
  const n = multishotOf(ctx, obj, def);
  if (n > 1) {
    const many = { ...obj, c: { ...obj.c, item: { ...it, quantity: n } } };
    const uw = heroWielded(ctx);
    const shoots = uw !== null && ammoAndLauncher(def, ctx.defs.object(uw.def));
    msg(ctx, shoots ? 'throw.volley_shoot' : 'throw.volley', {
      n,
      item: xnameOf(ctx.state, ctx.defs, many),
    });
  }
  let current: Entity | null = obj;
  for (let i = 1; i <= n; i++) {
    if (!current) break;
    const cit: NonNullable<Entity['c']['item']> | undefined = current.c.item;
    if (!cit) break;
    // split this object off from its slot if necessary
    let id: EntityId;
    if (cit.quantity > 1) id = splitStack(ctx, current.id, 1);
    else {
      id = current.id;
      current = null;
    }
    removeFromInventory(ctx, id);
    throwit(ctx, id, dir, { i, n });
    encumberMsg(ctx);
    if (ctx.state.gameOver) break;
  }
  return NORMAL_SPEED;
}

export const heroItem = (ctx: Ctx, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

export function itemArg(action: PlayerAction): unknown {
  return action.type === 'mod' ? (action.args as { item?: unknown } | undefined)?.item : undefined;
}

export const DIRECTION_OPTIONS: PromptOption[] = DIR_LIST.map((d) => ({
  value: d,
  key: `dir.${d}`,
}));

/**
 * A polymorphed form that can't take things or has no hands can't throw: "You are physically
 * incapable of throwing or shooting anything." / "You can't throw or shoot without hands." (no
 * time). ref: src/dothrow.c ok_to_throw()
 */
function okToThrow(ctx: Ctx, noisy: boolean): boolean {
  const form = heroForm(ctx);
  if (!form) return true;
  const key = notake(form) ? 'throw.notake' : nohands(form) ? 'throw.nohands' : null;
  if (key && noisy) msg(ctx, key);
  return key === null;
}

const throwAction: ActionDef = {
  id: THROW_ID,
  labelKey: 'action.nh:throw',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    const it = e?.c.item;
    if (!e || !it || ctx.defs.object(e.def).class === 'coin' || !okToThrow(ctx, false)) return [];
    // worn armor cannot be thrown, nor a weapon known to be welded to the hand
    if (it.equipped !== null && it.equipped !== 'weapon') return [];
    if (it.equipped === 'weapon' && it.buc === 'cursed' && it.known.buc) return [];
    return [
      {
        action: { type: 'mod', action: THROW_ID, args: { item: e.id } },
        labelKey: 'action.nh:throw',
      },
    ];
  },
  // ref: src/dothrow.c dothrow(): ok_to_throw(), then getobj() and throw_obj() asks "In what direction?"
  perform(ctx, action) {
    const e = heroItem(ctx, itemArg(action));
    if (!e) return 0;
    if (!okToThrow(ctx, true)) return 0;
    if (checkCapacity(ctx)) return 0;
    ctx.ask(
      {
        id: 'throw-direction',
        kind: 'direction',
        key: 'throw.direction',
        options: DIRECTION_OPTIONS,
      },
      THROW_ID,
      { item: e.id },
    );
    return 0;
  },
  answer(ctx, value: Json, raw: Json) {
    const id = (raw as { item?: unknown } | null)?.item;
    const e = heroItem(ctx, id);
    const dir = DIR_LIST.find((d) => d === value);
    if (!e || !dir) return 0; // cancelled
    return throwObj(ctx, e, getdirImpaired(ctx, dir));
  },
};

export const THROW_ACTIONS: readonly ActionDef[] = [throwAction];
