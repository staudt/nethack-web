// Rays: the bolts of a wand, and of a spell cast at the hero from anywhere on the level, with
// bounce and reflection. ref: src/zap.c dobuzz(), zhitm(), zhitu(), zap_hit(), bounce_dir(),
// zap_over_floor(), burn_floor_objects(), resist(), flashburn(); src/mhitm.c sleep_monst(),
// slept_monst()
//
// Split out of zap.ts so that code below the hero's actions (a god's lightning for an angered
// priest) can cast a ray without an import cycle; the hero's angering wakeup() is passed in.
import { mAt } from './wormstate';
import {
  DIRS,
  cellIndex,
  getPlayer,
  inBounds,
  itemsAt,
  inventoryOf,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Level,
  type Msg,
  type Pos,
  type RayStep,
  type TerrainDef,
  trapAt,
} from '@nh/core';
import { burnAwaySlime } from './slimestate';
import { uhimKey } from './gender';
import { poisoned } from './attrib';
import { acidDamage, destroyItems, erodeArmor, useOne } from './erode';
import { inAnyShop } from './eshk';
import { done } from './end';
import { setUstuck, ustuck } from './hackmove';
import { uswallow } from './engulfstate';
import { experienceFor, gainExperience } from './hero';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { monkilled, monsterDied } from './mondeath';
import { nonliving } from './mondata';
import { completelyburns } from './golem';
import { ugolemeffects } from './golemfx';
import { heroSees, monWep } from './mongear';
import { frozenTime, isFrozen, paralyzeMonst } from './mstate';
import { xnameOf } from './objnam';
import { igniteItems } from './light';
import { monNam, revealUnseenAt } from './perception';
import { P, hasProp, makeBlinded } from './props';
import { ureflects } from './reflect';
import { payForDamage, type DmgStr } from './shkpay';
import { SHOP_DOOR_COST, addDamage } from './shopdamage';
import { spellDamageBonus, spellHitBonus } from './spellcalc';
import { findAc, findMac } from './stats';
import { T, setTerrain } from './terrain';
import { setMtrapped, setUtrap, utrap } from './trapstate';
import { canseemon } from './invis';
import { M_SEEN, monReflects, monstseesu, monstunseesu } from './musestate';

/**
 * Ray damage types, in flash_types[] order. ref: src/zap.c ZT_MAGIC_MISSILE .. ZT_ACID (poison
 * gas and acid exist only as monster breath)
 */
export type Ray =
  'magic_missile' | 'fire' | 'cold' | 'sleep' | 'death' | 'lightning' | 'poison_gas' | 'acid';
/**
 * ref: include/display.h zap_color_*: HI_ZAP, CLR_ORANGE, CLR_WHITE, HI_ZAP, CLR_BLACK (drawn
 * dark gray, as objects.ts and monsters.ts do), CLR_WHITE, CLR_GREEN, CLR_YELLOW
 */
export const RAY_COLOR: Readonly<Record<Ray, string>> = {
  magic_missile: '#5555ff',
  fire: '#ff8800',
  cold: '#ffffff',
  sleep: '#5555ff',
  death: '#555555',
  lightning: '#ffffff',
  poison_gas: '#00aa00',
  acid: '#ffff55',
};

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const blind = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.BLINDED);
const ent = (ctx: Ctx, id: EntityId): Entity | undefined => ctx.state.entities[String(id)];
const alive = (ctx: Ctx, id: EntityId): boolean => ent(ctx, id)?.c.monster !== undefined;
/** ref: Antimagic. Nothing in the subset confers magic resistance yet. */
const antimagic = (ctx: Ctx): boolean => hasProp(hero(ctx), P.ANTIMAGIC);
/** ref: exclam(): "." for force <= 4, else "!" */
const exclam = (force: number): string => (force < 0 ? '?' : force <= 4 ? '.' : '!');
/** ref: src/zap.c flash_str(): "bolt of fire", or a breath's "blast of fire" (types 20..29) */
const rayName = (ray: Ray, src?: RaySource): Msg => ({
  key:
    src?.by === 'breath' || (src?.by === 'hero' && src.breath)
      ? `zap.flash.breath.${ray}`
      : `zap.flash.${ray}`,
});

function heroPos(ctx: Ctx): { level: string; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('The hero is nowhere');
  return p;
}

function levelOf(ctx: Ctx): Level {
  const l = ctx.state.levels[heroPos(ctx).level];
  if (!l) throw new Error('The hero is on no level');
  return l;
}

function terrainAt(ctx: Ctx, level: Level, x: number, y: number): TerrainDef {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  if (id === undefined) throw new Error('Unknown terrain');
  return ctx.defs.terrain(id);
}

/** ref: ZAP_POS(typ): terrain a zap passes over (closed doors included; see closedDoor) */
const zapPos = (t: TerrainDef): boolean => t.passable || t.door !== undefined;
/** ref: closed_door() */
const closedDoor = (t: TerrainDef): boolean => t.door === 'closed' || t.door === 'locked';
/** ref: IS_ROOM(typ): ROOM and above (floor, stairs); not corridors or doors */
const isRoom = (t: TerrainDef): boolean => zapPos(t) && t.door === undefined && t.id !== T.corr;
const isSdoor = (id: DefId | undefined): boolean =>
  id === T.sdoor_v || id === T.sdoor_h || id === T.sdoor_locked_v || id === T.sdoor_locked_h;
const cellId = (level: Level, x: number, y: number): DefId | undefined =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? 0];

/** The monster at (x, y) of the hero's level, or null. ref: m_at() */
function monAt(ctx: Ctx, x: number, y: number): Entity | null {
  return mAt(ctx.state, heroPos(ctx).level, x, y); // a worm's tail square holds the worm
}

const cansee = (ctx: Ctx, x: number, y: number): boolean =>
  heroSees(ctx, { level: heroPos(ctx).level, x, y });

/**
 * The hero kills the monster: "You kill it!", then experience; `nocorpse` leaves neither corpse
 * nor treasure (XKILL_NOCORPSE). ref: src/mon.c killed(), xkilled()
 */
export function killedByHero(ctx: Ctx, mon: Entity, nocorpse = false): void {
  const m = mon.c.monster;
  if (!m) return;
  const def = ctx.defs.monster(mon.def);
  say(ctx, nonliving(def) ? 'combat.you_destroy' : 'combat.you_kill', { mon: monNam(ctx, mon) });
  const level = m.level;
  monsterDied(ctx, mon.id, true, false, nocorpse);
  // life-saved: no experience
  if (!ctx.state.entities[String(mon.id)]?.c.monster)
    gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * The monster's saving throw against a wand (attack level 12), a scroll (9), a potion (6) or the
 * hero's spell (attack level = her experience level); `damage` is halved when it resists and then taken, which
 * may kill it (by the hero, or with `mUsing` by the monster's own wand: gm.m_using).
 * ref: src/zap.c resist() with WAND_CLASS, SCROLL_CLASS, POTION_CLASS or a spell
 */
export function resist(
  ctx: Ctx,
  mon: Entity,
  damage: number,
  oclass: 'wand' | 'scroll' | 'potion' | 'spell' = 'wand',
  mUsing = false,
): boolean {
  const def = ctx.defs.monster(mon.def);
  const alev =
    oclass === 'wand'
      ? 12
      : oclass === 'scroll'
        ? 9
        : oclass === 'potion'
          ? 6
          : (getPlayer(ctx.state).c.experience?.level ?? 1);
  let dlev = mon.c.monster?.level ?? 0;
  if (dlev > 50) dlev = 50;
  else if (dlev < 1) dlev = 1;
  const resisted = ctx.rng.rn2(100 + alev - dlev) < def.mr;
  if (resisted) damage = Math.trunc((damage + 1) / 2);
  if (damage) {
    const hp = mon.c.hp;
    if (hp) hp.cur -= damage;
    // a monster's own wand (gm.m_using): monkilled(mtmp, "", AD_RBRE)
    if (!hp || hp.cur < 1) {
      if (mUsing) monkilled(ctx, mon.id, true);
      else killedByHero(ctx, mon);
    }
  }
  return resisted;
}

/**
 * ref: src/mondata.c resists_magm(): gray dragons, Angels, Oracle, Yeenoghu, chromatic dragon
 * (AD_MAGM or AD_RBRE attacks), and a monster wearing an item that gives magic resistance (a
 * cloak of magic resistance; no artifacts or baby gray dragons here).
 */
export const resistsMagm = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).attacks.some((a) => a.ad === 'magm' || a.ad === 'rbre') ||
  inventoryOf(ctx.state, mon.id).some((o) => {
    const eq = o.c.item?.equipped;
    return !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.ANTIMAGIC;
  });

/**
 * ref: include/mondata.h resists_disint(): its own resistance or worn black dragon scales or scale
 * mail (`mextrinsics`, set when worn)
 */
export const resistsDisint = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).resists.includes('disint') ||
  inventoryOf(ctx.state, mon.id).some((o) => {
    const eq = o.c.item?.equipped;
    return !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.DISINT_RES;
  });

/** zhitm()'s damage when the blast disintegrates its target. ref: include/hack.h MAGIC_COOKIE */
export const MAGIC_COOKIE = 1000;

/** The monster's worn armor in `slot`. ref: src/worn.c which_armor() */
const wornBy = (ctx: Ctx, mon: Entity, slot: string): Entity | undefined =>
  inventoryOf(ctx.state, mon.id).find((o) => o.c.item?.equipped === slot);

type DisintegrateArm = (ctx: Ctx, atmp: Entity | null) => boolean;
/** seffect.ts's disintegrateArm() (seffect.ts sits above this module) */
let disintegrateArm: DisintegrateArm | null = null;
export function setDisintegrateArm(fn: DisintegrateArm): void {
  disintegrateArm = fn;
}

/** Wakes a monster without angering it (wakeup(mon, FALSE)). */
export function wakeGently(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  if (m.asleep && mon.c.pos && heroSees(ctx, mon.c.pos))
    say(ctx, 'mon.wakes_up', { mon: monNam(ctx, mon) });
  m.asleep = false;
}

/**
 * ref: src/mhitm.c sleep_monst() with a wand's, a potion's or the hero's spell's resist() roll: a
 * sleep-resistant monster or one that resists is unaffected; one that can move is frozen for
 * `amt` turns.
 */
export function sleepMonst(
  ctx: Ctx,
  mon: Entity,
  amt: number,
  oclass: 'wand' | 'potion' | 'spell' = 'wand',
): boolean {
  if (ctx.defs.monster(mon.def).resists.includes('sleep') || resist(ctx, mon, 0, oclass))
    return false;
  if (isFrozen(ctx, mon.id)) return false;
  paralyzeMonst(ctx, mon.id, amt + frozenTime(ctx, mon.id));
  return true;
}

/** ref: src/mhitm.c slept_monst(): a sleeping grabber lets go */
export function sleptMonst(ctx: Ctx, mon: Entity): void {
  if (ustuck(ctx) === mon.id && isFrozen(ctx, mon.id)) {
    say(ctx, 'zap.grip_relaxes', { mon: monNam(ctx, mon) });
    setUstuck(ctx, null);
  }
}

/** ref: src/zap.c flashburn(): lightning blinds a hero who can see */
export function flashburn(ctx: Ctx, duration: number): void {
  if (blind(ctx) || hero(ctx).c.helpless) return; // resists_blnd(): already blind or unaware
  say(ctx, 'zap.blinded_flash');
  makeBlinded(ctx, duration, false);
}

// ---------------------------------------------------------------------------------------------
// rays: buzz()

/**
 * ref: src/zap.c zap_hit(): does the zap hit armor class `ac`? `spell` is the book of the hero's
 * spell (spell_hit_bonus()), null for anything else.
 */
function zapHit(ctx: Ctx, ac: number, spell: DefId | null): boolean {
  const chance = ctx.rng.rn2(20);
  const spellBonus = spell ? spellHitBonus(ctx.state, spell) : 0;
  // small chance for naked target to avoid being hit
  if (!chance) return ctx.rng.rnd(10) < ac + spellBonus;
  const acv = ac >= 0 ? ac : -ctx.rng.rnd(-ac); // AC_VALUE()
  return 3 - chance < acv + spellBonus;
}

/**
 * ref: src/zap.c zhitm(): the ray's damage to a monster, halved when it resists; the hit points
 * are taken here. Fire burns armor (and may destroy items), cold and lightning may destroy items.
 * A hero's spell (`spellcaster`) gets the Intelligence damage bonus and resists at her level.
 * `save`: the hero's ray (`type >= 0`) gets a saving throw; a monster's spell does not. The death
 * ray kills (damage = HP + 1, no saving throw) unless the monster is nonliving, a demon or
 * resists magic; Death is not in the roster. A disintegration blast (`disint`, the death ray
 * breathed: ZT_BREATH(ZT_DEATH)) does nothing to a monster that resists disintegration, else
 * destroys its shield (put in `out.armor` for the caller), else its suit and cloak (the suit in
 * `out.armor`), else its cloak and shirt and returns MAGIC_COOKIE (a hero's blast may still be
 * halved by the saving throw, C's quirk, and then merely kills).
 */
export function zhitm(
  ctx: Ctx,
  mon: Entity,
  ray: Ray,
  nd: number,
  spellcaster: boolean,
  save: boolean,
  breath = false,
  disint = false,
  out?: { armor: Entity | null },
): number {
  const def = ctx.defs.monster(mon.def);
  const res = (r: string): boolean => def.resists.includes(r);
  const bonus = (n: number): number => (spellcaster ? spellDamageBonus(ctx.state, n) : n);
  // the hero's breath (types 20..29) and a monster's wand (-39..-30, not ZT_WAND(ZT_SLEEP)) resist
  // as her spells do: resist(mon, '\0') at her level
  const oclass = spellcaster || breath ? 'spell' : 'wand';
  let tmp = 0;
  switch (ray) {
    case 'magic_missile':
      if (resistsMagm(ctx, mon)) break;
      tmp = bonus(ctx.rng.d(nd, 6));
      break;
    case 'fire': {
      if (res('fire')) break;
      tmp = bonus(ctx.rng.d(nd, 6));
      const orig = tmp; // includes spell bonus but not monster vuln to cold
      if (res('cold')) tmp += 7;
      if (erodeArmor(ctx, mon.id, 'burn')) {
        if (!ctx.rng.rn2(3)) {
          tmp += destroyItems(ctx, mon.id, 'fire', orig);
          igniteItems(ctx, mon.id);
        }
      }
      break;
    }
    case 'cold': {
      if (res('cold')) break;
      tmp = bonus(ctx.rng.d(nd, 6));
      const orig = tmp;
      if (res('fire')) tmp += ctx.rng.d(nd, 3);
      if (!ctx.rng.rn2(3)) tmp += destroyItems(ctx, mon.id, 'cold', orig);
      break;
    }
    case 'sleep':
      sleepMonst(ctx, mon, ctx.rng.d(nd, 25), oclass);
      break;
    case 'death':
      if (disint) {
        if (resistsDisint(ctx, mon)) break; // (shieldeff)
        const shield = wornBy(ctx, mon, 'shield');
        const suit = wornBy(ctx, mon, 'body');
        if (shield) {
          if (out) out.armor = shield; // destroy shield; victim survives
        } else if (suit) {
          // destroy suit, also cloak if present
          if (out) out.armor = suit;
          const cloak = wornBy(ctx, mon, 'cloak');
          if (cloak) useOne(ctx, mon.id, cloak);
        } else {
          // no suit, victim dies; destroy cloak and shirt now in case target gets life-saved
          tmp = MAGIC_COOKIE;
          for (const slot of ['cloak', 'shirt']) {
            const o = wornBy(ctx, mon, slot);
            if (o) useOne(ctx, mon.id, o);
          }
        }
        break;
      }
      // similar to player (no vampire shapeshifters exist)
      if (nonliving(def) || def.flags.includes('demon') || resistsMagm(ctx, mon)) break;
      save = false; // so they don't get saving throws
      tmp = (mon.c.hp?.cur ?? 0) + 1;
      break;
    case 'lightning': {
      tmp = bonus(ctx.rng.d(nd, 6));
      const orig = tmp;
      if (res('elec')) tmp = 0; // (monsters are not blinded: no monster blindness yet)
      if (!ctx.rng.rn2(3)) tmp += destroyItems(ctx, mon.id, 'elec', orig);
      break;
    }
    case 'poison_gas':
      if (res('poison')) break;
      tmp = ctx.rng.d(nd, 6);
      break;
    case 'acid':
      if (res('acid')) break;
      tmp = ctx.rng.d(nd, 6);
      if (!ctx.rng.rn2(6)) acidDamage(ctx, monWep(ctx, mon.id));
      if (!ctx.rng.rn2(6)) erodeArmor(ctx, mon.id, 'corrode');
      break;
  }
  if (tmp > 0 && save && resist(ctx, mon, 0, oclass)) tmp = Math.trunc(tmp / 2);
  if (tmp < 0) tmp = 0;
  const hp = mon.c.hp;
  if (hp) hp.cur -= tmp;
  return tmp;
}

/**
 * The polymorphed hero breathes at herself: the blast hits her with no to-hit roll or message of
 * its own ("a blast of frost exhaled by herself" if it kills). ref: src/zap.c ubreatheu()
 */
export function ubreatheu(ctx: Ctx, ray: Ray, nd: number): void {
  zhitu(ctx, ray, nd, uhimKey(ctx.state, `@killer.breath.self.${ray}`), true);
}

/**
 * ref: src/zap.c zhitu(): the ray hits the hero; the monsters that see her learn whether she
 * resisted (monstseesu()/monstunseesu()). A disintegration blast (`disint`) spares her with
 * Disint_resistance, else destroys her shield, else her suit and cloak, else (her cloak and shirt
 * crumbling first) kills her. Not ported: carried items that guard against it
 * (inventory_resistance_check()), the corpseless grave (no bones).
 */
function zhitu(ctx: Ctx, ray: Ray, nd: number, killer: string, disint = false): void {
  const h = hero(ctx);
  let dam = 0;
  switch (ray) {
    case 'magic_missile':
      if (antimagic(ctx)) {
        say(ctx, 'zap.u.missiles_bounce');
        monstseesu(ctx, M_SEEN.magr);
      } else {
        dam = ctx.rng.d(nd, 6);
        monstunseesu(ctx, M_SEEN.magr);
      }
      break;
    case 'fire': {
      const orig = ctx.rng.d(nd, 6);
      if (hasProp(h, P.FIRE_RES)) {
        say(ctx, 'zap.u.not_hot');
        monstseesu(ctx, M_SEEN.fire);
        ugolemeffects(ctx, 'fire', orig);
      } else {
        dam = orig;
        monstunseesu(ctx, M_SEEN.fire);
      }
      burnAwaySlime(ctx);
      if (erodeArmor(ctx, h.id, 'burn')) {
        // "body hit"
        if (!ctx.rng.rn2(3)) destroyItems(ctx, h.id, 'fire', orig);
        if (ctx.state.gameOver) return;
        if (!ctx.rng.rn2(3)) igniteItems(ctx, h.id);
      }
      break;
    }
    case 'cold': {
      const orig = ctx.rng.d(nd, 6);
      if (hasProp(h, P.COLD_RES)) {
        say(ctx, 'zap.u.not_cold');
        monstseesu(ctx, M_SEEN.cold);
        ugolemeffects(ctx, 'cold', orig);
      } else {
        dam = orig;
        monstunseesu(ctx, M_SEEN.cold);
      }
      if (!ctx.rng.rn2(3)) destroyItems(ctx, h.id, 'cold', orig);
      break;
    }
    case 'sleep':
      if (hasProp(h, P.SLEEP_RES)) {
        say(ctx, 'zap.u.not_sleepy');
        monstseesu(ctx, M_SEEN.sleep);
      } else {
        monstunseesu(ctx, M_SEEN.sleep);
        nomulNow(ctx, ctx.rng.d(nd, 25), 'helpless.asleep', { key: 'eat.wake_up' }); // fall_asleep()
      }
      break;
    case 'death':
      if (disint) {
        if (hasProp(h, P.DISINT_RES)) {
          say(ctx, 'zap.u.not_disintegrated');
          monstseesu(ctx, M_SEEN.disint);
          break;
        }
        monstunseesu(ctx, M_SEEN.disint);
        const worn = (slot: string): Entity | null => wornBy(ctx, h, slot) ?? null;
        const uarms = worn('shield');
        const uarm = worn('body');
        if (uarms) {
          disintegrateArm?.(ctx, uarms); // destroy shield; other possessions are safe
          break;
        } else if (uarm) {
          // destroy suit; if present, cloak goes too
          const uarmc = worn('cloak');
          if (uarmc) disintegrateArm?.(ctx, uarmc);
          disintegrateArm?.(ctx, uarm);
          break;
        }
        // no shield or suit, you're dead; wipe out cloak and/or shirt in case of life-saving
        const uarmc = worn('cloak');
        if (uarmc) disintegrateArm?.(ctx, uarmc);
        const uarmu = worn('shirt');
        if (uarmu) disintegrateArm?.(ctx, uarmu);
        monstunseesu(ctx, M_SEEN.magr);
        done(ctx, killer); // KILLED_BY_AN the blast
        return; // lifesaved
      }
      // a hero is never nonliving or a demon (no polymorph)
      if (antimagic(ctx)) {
        monstseesu(ctx, M_SEEN.magr);
        say(ctx, 'zap.u.not_shocked'); // "You aren't affected."
        break;
      }
      monstunseesu(ctx, M_SEEN.magr);
      done(ctx, '@killer.ray.death'); // KILLED_BY_AN "death ray", whoever sent it
      return; // lifesaved
    case 'lightning': {
      const orig = ctx.rng.d(nd, 6);
      if (hasProp(h, P.SHOCK_RES)) {
        say(ctx, 'zap.u.not_shocked');
        monstseesu(ctx, M_SEEN.elec);
        ugolemeffects(ctx, 'elec', orig);
      } else {
        dam = orig;
        monstunseesu(ctx, M_SEEN.elec);
      }
      if (!ctx.rng.rn2(3)) destroyItems(ctx, h.id, 'elec', orig);
      break;
    }
    case 'poison_gas':
      // "blast": no "was poisoned" line (the blast of poison gas was named)
      poisoned(ctx, null, 'dex', '@killer.poisoned_blast', 15);
      break;
    case 'acid':
      if (hasProp(h, P.ACID_RES)) {
        say(ctx, 'zap.u.acid_no_hurt');
        monstseesu(ctx, M_SEEN.acid);
      } else {
        say(ctx, 'zap.u.acid_burns');
        dam = ctx.rng.d(nd, 6);
        monstunseesu(ctx, M_SEEN.acid);
      }
      // (no two-weapon combat)
      if (!ctx.rng.rn2(6)) acidDamage(ctx, monWep(ctx, h.id));
      if (!ctx.rng.rn2(6)) erodeArmor(ctx, h.id, 'corrode');
      break;
  }
  if (ctx.state.gameOver) return;
  // "<flash> zapped by herself" (the hero's own ricochet) or "a bolt of lightning"
  if (dam) losehp(ctx, dam, killer);
}

/**
 * ref: src/zap.c bounce_dir(): which way a ray bounces off (sx, sy); 1 in `bounceback` it just
 * comes back
 */
function bounceDir(
  ctx: Ctx,
  level: Level,
  sx: number,
  sy: number,
  d: { x: number; y: number },
  bounceback: number,
): void {
  if (!d.x || !d.y || (bounceback > 0 && !ctx.rng.rn2(bounceback))) {
    d.x = -d.x;
    d.y = -d.y;
    return;
  }
  const lsy = sy - d.y;
  const lsx = sx - d.x;
  const ok = (x: number, y: number): boolean => inBounds(level, x, y);
  const open = (x: number, y: number): boolean => {
    const t = terrainAt(ctx, level, x, y);
    return zapPos(t) && !closedDoor(t);
  };
  let bounce = 0;
  if (
    ok(sx, lsy) &&
    open(sx, lsy) &&
    (isRoom(terrainAt(ctx, level, sx, lsy)) ||
      (ok(sx + d.x, lsy) && zapPos(terrainAt(ctx, level, sx + d.x, lsy))))
  )
    bounce = 1;
  if (
    ok(lsx, sy) &&
    open(lsx, sy) &&
    (isRoom(terrainAt(ctx, level, lsx, sy)) ||
      (ok(lsx, sy + d.y) && zapPos(terrainAt(ctx, level, lsx, sy + d.y))))
  )
    if (!bounce || ctx.rng.rn2(2)) bounce = 2;
  switch (bounce) {
    case 0:
      d.x = -d.x;
      d.y = -d.y;
      break;
    case 1:
      d.y = -d.y;
      break;
    default:
      d.x = -d.x;
      break;
  }
}

/** Fire or cold over water, lava and ice (ice.ts, which sits above this module); the range change. */
type LiquidRay = (ctx: Ctx, level: Level, x: number, y: number, ray: 'fire' | 'cold') => number;
let liquidRay: LiquidRay | null = null;

/** ice.ts binds fireOverLiquid()/coldOverLiquid() at registration. */
export function setLiquidRay(fn: LiquidRay): void {
  liquidRay = fn;
}

/**
 * ref: src/zap.c zap_over_floor() for the hero's wand rays and for explosions (explode.ts): a
 * secret door is revealed, a closed door absorbs the ray (fire, cold and lightning destroy it),
 * fire burns a web and the scrolls and spellbooks on the floor, boils water and melts ice, cold
 * freezes water and lava (ice.ts). Returns the range change. `explodingWand`:
 * the broken wand's type (C's exploding_wand_typ, "the blast"; a wand of striking's blast
 * breaks the door), or '' for an explosion with no wand (a magical trap's: still "your bolt").
 * The monster there is not woken here (the caller does it). A shop door destroyed is damage:
 * with `shop` (the hero's ray or blast, C's type >= 0) it costs SHOP_DOOR_COST and sets
 * `shop.damaged` (the caller then calls pay_for_damage()), without it (a monster's) it is free.
 */
export function zapOverFloor(
  ctx: Ctx,
  ray: Ray,
  x: number,
  y: number,
  explodingWand?: DefId | '',
  shop?: ShopDamageFlag,
): number {
  const level = levelOf(ctx);
  const seeIt = cansee(ctx, x, y);
  const blast = explodingWand !== undefined && explodingWand !== '';
  let rangemod = 0;
  // ZT_FIRE: a web here burns ("a burning web is too flimsy to notice if you can't see it")
  if (ray === 'fire') {
    burnWeb(ctx, level, x, y, seeIt);
    // ice melts, a pool boils away, a moat steams
    rangemod += liquidRay?.(ctx, level, x, y, 'fire') ?? 0;
  } else if (ray === 'cold') rangemod += liquidRay?.(ctx, level, x, y, 'cold') ?? 0; // freezes
  const id = cellId(level, x, y);
  if (isSdoor(id)) {
    const locked = id === T.sdoor_locked_v || id === T.sdoor_locked_h;
    setTerrain(level, x, y, locked ? T.door_locked : T.door_closed);
    if (seeIt) say(ctx, blast ? 'zap.door.sdoor_blast' : 'zap.door.sdoor');
  }
  if (closedDoor(terrainAt(ctx, level, x, y))) {
    rangemod += -1000;
    const broken: Partial<Record<Ray, [string, string]>> = {
      fire: ['zap.door.consumed', 'zap.smell_smoke'],
      cold: ['zap.door.freezes', 'zap.hear_cracking'],
      lightning: ['zap.door.splinters', 'zap.hear_crackling'],
    };
    // def_case: a magical explosion from a broken wand of striking breaks the door
    const b =
      broken[ray] ??
      (explodingWand === 'nh:wand_of_striking'
        ? (['zap.door.crashes_open', 'zap.feel_cool_air'] as [string, string])
        : undefined);
    if (b) {
      // door gets broken
      if (inAnyShop(level, x, y)) {
        addDamage(ctx, x, y, shop ? SHOP_DOOR_COST : 0);
        if (shop) shop.damaged = true;
      }
      setTerrain(level, x, y, T.doorway); // D_NODOOR / D_BROKEN
      ctx.emit({ type: 'doorOpened', pos: { x, y } });
      say(ctx, seeIt ? b[0] : b[1]);
    } else if (!seeIt) say(ctx, 'zap.feel_vibrations');
    // "the door absorbs the blast" would be inaccurate for an exploding wand
    else say(ctx, blast ? 'zap.door.intact' : 'zap.door.absorbs');
  }
  if (ray === 'fire' && burnFloorObjects(ctx, x, y) && seeIt)
    say(ctx, blind(ctx) ? 'zap.whiff_smoke' : 'zap.puff_smoke');
  return rangemod;
}

/**
 * Fire over a web: "A web bursts into flames!" (when seen) and it is gone, letting go whoever it
 * held. ref: src/zap.c zap_over_floor() ZT_FIRE, src/trap.c delfloortrap() (a web is no pit, so
 * deltrap() has no conjoined pits or Sokoban to see to)
 */
function burnWeb(ctx: Ctx, level: Level, x: number, y: number, seeIt: boolean): void {
  const t = trapAt(level, x, y);
  if (t?.def !== 'nh:web') return;
  if (seeIt) say(ctx, 'zap.web_burns'); // (Norep)
  const hp = heroPos(ctx);
  const mon = monAt(ctx, x, y);
  if (hp.level === level.id && hp.x === x && hp.y === y) {
    const u = utrap(ctx);
    if (u) setUtrap(ctx, 0, u.type); // reset_utrap(TRUE)
  } else if (mon) setMtrapped(ctx, mon.id, false);
  ctx.removeTrap(level.id, { x, y });
}

/**
 * A monster's fire pillar or lightning bolt hits the floor at (x,y) (the hero's square): fire burns
 * a web and scrolls and spellbooks there. ref: src/zap.c mon_spell_hits_spot() -> zap_over_floor()
 */
export function monSpellHitsSpot(ctx: Ctx, ray: 'fire' | 'lightning', x: number, y: number): void {
  zapOverFloor(ctx, ray, x, y);
}

/**
 * Scrolls and spellbooks at (x,y) burn, each one 1 in 3; with `feedback` "A scroll labeled FOO
 * burns." / "2 scrolls labeled FOO burn."; floor items catch light. Returns how many burnt.
 * ref: src/zap.c burn_floor_objects() (no globs of green slime; no shop charge for the shop
 * goods the hero's fire burns)
 */
export function burnFloorObjects(
  ctx: Ctx,
  x: number,
  y: number,
  opts: { level?: string; feedback?: boolean } = {},
): number {
  let cnt = 0;
  const level = opts.level ?? heroPos(ctx).level;
  for (const o of itemsAt(ctx.defs, ctx.state, level, x, y)) {
    const od = ctx.defs.object(o.def);
    const it = o.c.item;
    if (!it || (od.class !== 'scroll' && od.class !== 'spellbook')) continue;
    if (o.def === 'nh:scroll_of_fire' || o.def === 'nh:spellbook_of_fireball') continue;
    if (ctx.rng.rn2(100) < 2) continue; // obj_resists(obj, 2, 100)
    const scrquan = it.quantity;
    let del = 0;
    for (let i = scrquan; i > 0; i--) if (!ctx.rng.rn2(3)) del++;
    if (!del) continue;
    // save the name before it is gone
    it.quantity = del > 1 ? 2 : 1;
    const name = opts.feedback ? xnameOf(ctx.state, ctx.defs, o) : null;
    it.quantity = scrquan;
    if (del < it.quantity) it.quantity -= del;
    else ctx.remove(o.id);
    cnt += del;
    if (name) say(ctx, del > 1 ? 'zap.floor_burn_n' : 'zap.floor_burns', { n: del, obj: name });
  }
  // this also ignites floor items, but does not change cnt because they weren't consumed
  igniteItems(ctx, { level, x, y });
  return cnt;
}

/**
 * Who sends a ray: the hero (her wand, her breath when `breath` (types 20..29: "blast of frost",
 * resisted at her level), or her spell when `spell` names its book (types 10..19):
 * the spell to-hit and damage bonuses, resisted at her level; kills are hers, and a monster it
 * hits is angered with `wakeup`, peaceful.ts's, passed in because peaceful.ts sits above this
 * module), or a monster's
 * spell (BZ_M_SPELL: a monster it kills is killed by "another monster", one it hits is only
 * woken up, and a hero it kills dies of "a bolt of lightning"), or a monster's breath
 * (BZ_M_BREATH: the same, named "blast of ...", and a hero it kills dies of "a blast of frost
 * exhaled by a winter wolf cub"), or a monster's wand (BZ_M_WAND: as a monster's spell, and
 * resisted at her level as C's `'\0'` class; `forceMiss`, buzz_force_miss(): the ray hits nothing
 * on its way, a monster's first shot with an attack wand).
 */
export type RaySource =
  | { by: 'hero'; spell?: DefId; breath?: true; wakeup: (ctx: Ctx, id: EntityId) => void }
  | { by: 'spell' }
  | { by: 'breath'; mon: EntityId }
  | { by: 'monwand'; mon: EntityId; wand: DefId; forceMiss: boolean };

/**
 * A ray of rn1(7, 7) squares starting next to `from` (on the hero's level) and heading `dir`,
 * hitting monsters (zap_hit against their AC) and the hero on the way, bouncing off walls. Zapped
 * up or down it stays on `from` for one square (it may hit the hero there and burns the floor).
 * ref: src/zap.c dobuzz() for the hero's wands (type 0..9) and spells (10..19) and monster
 * spells (-19..-10); `dx == 0 && dy == 0` for vertical bolts
 */
export function buzzFrom(
  ctx: Ctx,
  ray: Ray,
  nd: number,
  from: Pos,
  dir: Dir | 'up' | 'down',
  src: RaySource,
): void {
  const path: RayStep[] = [];
  const shop: ShopDamageFlag = { damaged: false };
  buzzSteps(ctx, ray, nd, from, dir, src, path, shop);
  if (path.length > 0) ctx.emit({ type: 'ray', kind: ray, fg: RAY_COLOR[ray], path });
  if (shop.damaged) payForDamage(ctx, rayDmgstr(ray), false);
}

/** What a ray (or blast) did to a shop door, for pay_for_damage(). */
export function rayDmgstr(ray: Ray): DmgStr {
  return ray === 'fire'
    ? 'burn away'
    : ray === 'cold'
      ? 'shatter'
      : ray === 'death'
        ? 'disintegrate'
        : 'destroy';
}

/**
 * A disintegration blast destroys the monster and what it carries: "The gnome is
 * disintegrated!" (or, wearing a life saving amulet, the plain hit), every item but disintegration
 * resistant armor, the amulet and 5 in 100 others gone; no corpse. The hero's blast kills it
 * as hers without a message. ref: src/zap.c disintegrate_mon() (no artifacts)
 */
function disintegrateMon(ctx: Ctx, mon: Entity, byHero: boolean, fltxt: Msg): void {
  const amulet = wornBy(ctx, mon, 'amulet');
  const mAmulet = amulet?.def === 'nh:amulet_of_life_saving' ? amulet : undefined; // mlifesaver()
  if (canseemon(ctx, mon)) {
    if (!mAmulet) say(ctx, 'zap.ray.mon_disintegrated', { mon: monNam(ctx, mon) });
    else say(ctx, 'zap.ray.hit', { ray: fltxt, mon: monNam(ctx, mon), ex: '!' });
  }
  for (const o of inventoryOf(ctx.state, mon.id)) {
    // oresist_disintegration(): DISINT_RES armor, obj_resists(obj, 5, 50), the amulet
    const keep =
      ctx.defs.object(o.def).prop === P.DISINT_RES || ctx.rng.rn2(100) < 5 || o === mAmulet;
    if (!keep) ctx.remove(o.id); // extract_from_minvent(), obfree()
  }
  if (!byHero) monkilled(ctx, mon.id, false, undefined, 'rbre');
  else {
    // xkilled(mon, XKILL_NOMSG | XKILL_NOCORPSE)
    const level = mon.c.monster?.level ?? 0;
    const def = ctx.defs.monster(mon.def);
    monsterDied(ctx, mon.id, true, false, true);
    if (!ctx.state.entities[String(mon.id)]?.c.monster)
      gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
  }
}

/** zap_over_floor()'s `shopdamage` output, for the hero's rays and blasts. */
export interface ShopDamageFlag {
  damaged: boolean;
}

/** The steps of {@link buzzFrom}; the cells the hero sees the ray cross go to `path` (tmp_at()). */
function buzzSteps(
  ctx: Ctx,
  ray: Ray,
  nd: number,
  from: Pos,
  dir: Dir | 'up' | 'down',
  src: RaySource,
  path: RayStep[],
  shop: ShopDamageFlag,
): void {
  // ref: dobuzz(): swallowed, the hero's ray hits the engulfer ("The bolt of fire rips into the
  // fog cloud!"); a monster's does nothing (`type < 0`)
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  // a breathed death ray disintegrates (ZT_BREATH(ZT_DEATH))
  const disint =
    ray === 'death' && (src.by === 'breath' || (src.by === 'hero' && src.breath === true));
  if (engulfer) {
    if (src.by !== 'hero') return;
    const tmp = zhitm(
      ctx,
      engulfer,
      ray,
      nd,
      src.spell !== undefined,
      true,
      src.breath === true,
      disint,
    );
    say(ctx, 'zap.ray.rips_into', {
      ray: rayName(ray, src),
      mon: monNam(ctx, engulfer),
      ex: exclam(tmp),
    });
    // using disintegration from the inside only makes a hole...
    const ehp = engulfer.c.hp;
    if (tmp === MAGIC_COOKIE && ehp) ehp.cur = 0;
    if ((engulfer.c.hp?.cur ?? 0) < 1 && alive(ctx, engulfer.id)) killedByHero(ctx, engulfer);
    return;
  }
  const level = levelOf(ctx);
  const vertical = dir === 'up' || dir === 'down';
  const d = vertical ? { x: 0, y: 0 } : { ...DIRS[dir] };
  // the hero's spell: its SPE_ type
  const spell = src.by === 'hero' ? (src.spell ?? null) : null;
  // the hero's death by this ray: "a blast of frost exhaled by a winter wolf cub" (zhitu()'s
  // death_inflicted_by(); the breather may die of its own bounced blast before it hits her)
  const breather = src.by === 'breath' ? ent(ctx, src.mon) : undefined;
  const killer =
    src.by === 'hero'
      ? uhimKey(ctx.state, src.breath ? `@killer.breath.self.${ray}` : `@killer.zap.ray.${ray}`)
      : breather
        ? `@killer.breath.${ray}.${breather.def.replace(/^.*:/, '')}`
        : `@killer.ray.${ray}`;
  // buzz_force_miss(): no zap_hit() roll, nothing is hit
  const forceMiss = src.by === 'monwand' && src.forceMiss;
  let { x: sx, y: sy } = from;
  let range = ctx.rng.rn2(7) + 7;
  if (vertical) range = 1;
  while (range-- > 0) {
    const lsx = sx;
    const lsy = sy;
    sx += d.x;
    sy += d.y;
    let bounceNow = !inBounds(level, sx, sy) || cellId(level, sx, sy) === T.stone;
    if (!bounceNow) {
      if (
        cansee(ctx, sx, sy) &&
        (zapPos(terrainAt(ctx, level, sx, sy)) ||
          (inBounds(level, lsx, lsy) && cansee(ctx, lsx, lsy)))
      )
        path.push({ x: sx, y: sy, dx: d.x, dy: d.y });
      // ref: dobuzz(): "reveal/unreveal invisible monsters before tmp_at()"
      revealUnseenAt(ctx, monAt(ctx, sx, sy), sx, sy);
      // poison gas leaves its 1x1 cloud via zap_over_floor() after the hit (skipped when
      // reflected): deferred to the end of the step, its range change unused
      let gasHit = ray === 'poison_gas';
      if (!gasHit)
        range += zapOverFloor(ctx, ray, sx, sy, undefined, src.by === 'hero' ? shop : undefined);
      const mon = monAt(ctx, sx, sy);
      const hp = heroPos(ctx);
      if (mon) {
        if (!forceMiss && zapHit(ctx, findMac(ctx.state, ctx.defs, mon.id), spell)) {
          if (monReflects(ctx, mon, null)) {
            if (cansee(ctx, sx, sy)) {
              say(ctx, 'zap.ray.hit', { ray: rayName(ray, src), mon: monNam(ctx, mon), ex: '.' });
              monReflects(ctx, mon, 'zap.ray.reflects_mon');
              gasHit = false;
            }
            d.x = -d.x;
            d.y = -d.y;
          } else {
            const couldMove = !isFrozen(ctx, mon.id);
            const out: { armor: Entity | null } = { armor: null };
            const tmp = zhitm(
              ctx,
              mon,
              ray,
              nd,
              spell !== null,
              src.by === 'hero',
              // her breath and a monster's wand resist at her level (resist()'s default class)
              (src.by === 'hero' && src.breath === true) || src.by === 'monwand',
              disint,
              out,
            );
            if (tmp === MAGIC_COOKIE) {
              disintegrateMon(ctx, mon, src.by === 'hero', rayName(ray, src));
            } else if ((mon.c.hp?.cur ?? 0) < 1) {
              if (alive(ctx, mon.id)) {
                // killed by hero: if it's fire, highly flammable monsters leave no corpse
                if (src.by === 'hero')
                  killedByHero(ctx, mon, ray === 'fire' && completelyburns(mon.def));
                else monkilled(ctx, mon.id, true); // killed by another monster (AD_RBRE)
              }
            } else {
              if (!out.armor)
                say(ctx, 'zap.ray.hit', {
                  ray: rayName(ray, src),
                  mon: monNam(ctx, mon),
                  ex: exclam(tmp),
                });
              else {
                // some armor was destroyed; no damage done
                if (canseemon(ctx, mon))
                  say(ctx, 'zap.ray.mon_armor_disintegrated', {
                    mon: monNam(ctx, mon),
                    item: xnameOf(ctx.state, ctx.defs, out.armor),
                  });
                useOne(ctx, mon.id, out.armor);
              }
              if (couldMove && isFrozen(ctx, mon.id)) sleptMonst(ctx, mon);
              if (ray !== 'sleep') {
                if (src.by === 'hero') src.wakeup(ctx, mon.id);
                else wakeGently(ctx, mon);
              }
            }
          }
          range -= 2;
        } else if (canseemon(ctx, mon)) {
          say(ctx, 'zap.ray.miss', { ray: rayName(ray, src), mon: monNam(ctx, mon) });
        }
      } else if (hp.x === sx && hp.y === sy && range >= 0) {
        ctx.interrupt(); // nomul(0)
        if (!forceMiss && zapHit(ctx, findAc(ctx.state, ctx.defs, ctx.state.playerId), null)) {
          range -= 2;
          say(ctx, 'zap.ray.hits_you', { ray: rayName(ray, src) });
          if (ureflects(ctx, null)) {
            if (!blind(ctx)) ureflects(ctx, 'zap.ray.reflects');
            else say(ctx, 'zap.ray.not_affected');
            monstseesu(ctx, M_SEEN.refl);
            d.x = -d.x;
            d.y = -d.y;
            gasHit = false;
          } else {
            zhitu(ctx, ray, nd, killer, disint);
            monstunseesu(ctx, M_SEEN.refl);
          }
        } else if (!blind(ctx)) {
          say(ctx, 'zap.ray.whizzes', { ray: rayName(ray, src) });
        } else if (ray === 'lightning') {
          say(ctx, 'zap.ray.tingles');
        }
        if (ctx.state.gameOver) return;
        if (ray === 'lightning') flashburn(ctx, ctx.rng.d(nd, 50));
      }
      if (ctx.state.gameOver) return;
      if (gasHit) zapOverFloor(ctx, ray, sx, sy, undefined, undefined);
      const t = terrainAt(ctx, level, sx, sy);
      bounceNow = !zapPos(t) || (closedDoor(t) && range >= 0);
    }
    if (bounceNow) {
      const out = !inBounds(level, sx, sy) || cellId(level, sx, sy) === T.stone;
      const bchance = out ? 10 : 75;
      if (--range > 0 && inBounds(level, lsx, lsy) && cansee(ctx, lsx, lsy))
        say(ctx, 'zap.ray.bounces', { ray: rayName(ray, src) });
      bounceDir(ctx, level, sx, sy, d, bchance);
    }
  }
}
