// Rays: the bolts of a wand, and of a spell cast at the hero from anywhere on the level, with
// bounce and reflection. ref: src/zap.c dobuzz(), zhitm(), zhitu(), zap_hit(), bounce_dir(),
// zap_over_floor(), burn_floor_objects(), resist(), flashburn(); src/mhitm.c sleep_monst(),
// slept_monst()
//
// Split out of zap.ts so that code below the hero's actions (a god's lightning for an angered
// priest) can cast a ray without an import cycle; the hero's angering wakeup() is passed in.
import {
  DIRS,
  cellIndex,
  getPlayer,
  inBounds,
  itemsAt,
  sortedIds,
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
} from '@nh/core';
import { destroyItems, erodeArmor } from './erode';
import { setUstuck, ustuck } from './hackmove';
import { experienceFor, gainExperience } from './hero';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { monkilled, monsterDied } from './mondeath';
import { nonliving } from './mondata';
import { heroSees } from './mongear';
import { frozenTime, isFrozen, paralyzeMonst } from './mstate';
import { discover } from './o_init';
import { igniteItems } from './light';
import { monNam } from './perception';
import { P, hasExtrinsic, hasProp, makeBlinded } from './props';
import { spellDamageBonus, spellHitBonus } from './spellcalc';
import { findAc, findMac } from './stats';
import { T, setTerrain } from './terrain';

/** Ray damage types, in flash_types[] order. ref: src/zap.c ZT_MAGIC_MISSILE .. ZT_LIGHTNING */
export type Ray = 'magic_missile' | 'fire' | 'cold' | 'sleep' | 'lightning';
/** ref: include/display.h zap_color_*: HI_ZAP, CLR_ORANGE, CLR_WHITE, HI_ZAP, CLR_WHITE */
export const RAY_COLOR: Readonly<Record<Ray, string>> = {
  magic_missile: '#5555ff',
  fire: '#ff8800',
  cold: '#ffffff',
  sleep: '#5555ff',
  lightning: '#ffffff',
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
const rayName = (ray: Ray): Msg => ({ key: `zap.flash.${ray}` });

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
  const lv = heroPos(ctx).level;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && p && p.level === lv && p.x === x && p.y === y) return e;
  }
  return null;
}

const cansee = (ctx: Ctx, x: number, y: number): boolean =>
  heroSees(ctx, { level: heroPos(ctx).level, x, y });
const canseemon = (ctx: Ctx, mon: Entity): boolean =>
  !!mon.c.pos && cansee(ctx, mon.c.pos.x, mon.c.pos.y);

/** The hero kills the monster: "You kill it!", then experience. ref: src/mon.c killed(), xkilled() */
export function killedByHero(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  const def = ctx.defs.monster(mon.def);
  say(ctx, nonliving(def) ? 'combat.you_destroy' : 'combat.you_kill', { mon: monNam(ctx, mon) });
  const level = m.level;
  monsterDied(ctx, mon.id, true);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * The monster's saving throw against a wand (attack level 12) or the hero's spell (attack level
 * = her experience level); `damage` is halved when it resists and then taken, which may kill
 * it. ref: src/zap.c resist() with WAND_CLASS or a spell
 */
export function resist(
  ctx: Ctx,
  mon: Entity,
  damage: number,
  oclass: 'wand' | 'spell' = 'wand',
): boolean {
  const def = ctx.defs.monster(mon.def);
  const alev = oclass === 'wand' ? 12 : (getPlayer(ctx.state).c.experience?.level ?? 1);
  let dlev = mon.c.monster?.level ?? 0;
  if (dlev > 50) dlev = 50;
  else if (dlev < 1) dlev = 1;
  const resisted = ctx.rng.rn2(100 + alev - dlev) < def.mr;
  if (resisted) damage = Math.trunc((damage + 1) / 2);
  if (damage) {
    const hp = mon.c.hp;
    if (hp) hp.cur -= damage;
    if (!hp || hp.cur < 1) killedByHero(ctx, mon);
  }
  return resisted;
}

/**
 * ref: src/mondata.c resists_magm(): gray dragons, Angels, Oracle, Yeenoghu, chromatic dragon
 * (AD_MAGM or AD_RBRE attacks); no monster wears magic resistance in the subset.
 */
export const resistsMagm = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).attacks.some((a) => a.ad === 'magm' || a.ad === 'rbre');

/** Wakes a monster without angering it (wakeup(mon, FALSE)). */
export function wakeGently(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  if (m.asleep && mon.c.pos && heroSees(ctx, mon.c.pos))
    say(ctx, 'mon.wakes_up', { mon: monNam(ctx, mon) });
  m.asleep = false;
}

/**
 * ref: src/mhitm.c sleep_monst() with a wand's or the hero's spell's resist() roll: a
 * sleep-resistant monster or one that resists is unaffected; one that can move is frozen for
 * `amt` turns.
 */
export function sleepMonst(
  ctx: Ctx,
  mon: Entity,
  amt: number,
  oclass: 'wand' | 'spell' = 'wand',
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

/** ref: ureflects(): only the amulet of reflection reflects in the subset */
export function ureflects(ctx: Ctx, key: string): boolean {
  if (!hasExtrinsic(hero(ctx), P.REFLECTING)) return false;
  say(ctx, key);
  discover(ctx, 'nh:amulet_of_reflection');
  return true;
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
 */
function zhitm(ctx: Ctx, mon: Entity, ray: Ray, nd: number, spellcaster: boolean): number {
  const def = ctx.defs.monster(mon.def);
  const res = (r: string): boolean => def.resists.includes(r);
  const bonus = (n: number): number => (spellcaster ? spellDamageBonus(ctx.state, n) : n);
  const oclass = spellcaster ? 'spell' : 'wand';
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
    case 'lightning': {
      tmp = bonus(ctx.rng.d(nd, 6));
      const orig = tmp;
      if (res('elec')) tmp = 0; // (monsters are not blinded: no monster blindness yet)
      if (!ctx.rng.rn2(3)) tmp += destroyItems(ctx, mon.id, 'elec', orig);
      break;
    }
  }
  if (tmp > 0 && resist(ctx, mon, 0, oclass)) tmp = Math.trunc(tmp / 2);
  if (tmp < 0) tmp = 0;
  const hp = mon.c.hp;
  if (hp) hp.cur -= tmp;
  return tmp;
}

/** ref: src/zap.c zhitu(): the ray hits the hero */
function zhitu(ctx: Ctx, ray: Ray, nd: number, killer: string): void {
  const h = hero(ctx);
  let dam = 0;
  switch (ray) {
    case 'magic_missile':
      if (antimagic(ctx)) say(ctx, 'zap.u.missiles_bounce');
      else dam = ctx.rng.d(nd, 6);
      break;
    case 'fire': {
      const orig = ctx.rng.d(nd, 6);
      if (hasProp(h, P.FIRE_RES)) say(ctx, 'zap.u.not_hot');
      else dam = orig;
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
      if (hasProp(h, P.COLD_RES)) say(ctx, 'zap.u.not_cold');
      else dam = orig;
      if (!ctx.rng.rn2(3)) destroyItems(ctx, h.id, 'cold', orig);
      break;
    }
    case 'sleep':
      if (hasProp(h, P.SLEEP_RES)) say(ctx, 'zap.u.not_sleepy');
      else nomulNow(ctx, ctx.rng.d(nd, 25), 'helpless.asleep', { key: 'eat.wake_up' }); // fall_asleep()
      break;
    case 'lightning': {
      const orig = ctx.rng.d(nd, 6);
      if (hasProp(h, P.SHOCK_RES)) say(ctx, 'zap.u.not_shocked');
      else dam = orig;
      if (!ctx.rng.rn2(3)) destroyItems(ctx, h.id, 'elec', orig);
      break;
    }
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

/**
 * ref: src/zap.c zap_over_floor() for the hero's wand rays: a secret door is revealed, a closed
 * door absorbs the ray (fire, cold and lightning destroy it), fire burns scrolls and spellbooks
 * on the floor. Returns the range change.
 */
function zapOverFloor(ctx: Ctx, ray: Ray, x: number, y: number): number {
  const level = levelOf(ctx);
  const seeIt = cansee(ctx, x, y);
  let rangemod = 0;
  const id = cellId(level, x, y);
  if (isSdoor(id)) {
    const locked = id === T.sdoor_locked_v || id === T.sdoor_locked_h;
    setTerrain(level, x, y, locked ? T.door_locked : T.door_closed);
    if (seeIt) say(ctx, 'zap.door.sdoor');
  }
  if (closedDoor(terrainAt(ctx, level, x, y))) {
    rangemod = -1000;
    const broken: Partial<Record<Ray, [string, string]>> = {
      fire: ['zap.door.consumed', 'zap.smell_smoke'],
      cold: ['zap.door.freezes', 'zap.hear_cracking'],
      lightning: ['zap.door.splinters', 'zap.hear_crackling'],
    };
    const b = broken[ray];
    if (b) {
      setTerrain(level, x, y, T.doorway); // D_NODOOR / D_BROKEN
      ctx.emit({ type: 'doorOpened', pos: { x, y } });
      say(ctx, seeIt ? b[0] : b[1]);
    } else say(ctx, seeIt ? 'zap.door.absorbs' : 'zap.feel_vibrations');
  }
  if (ray === 'fire' && burnFloorObjects(ctx, x, y) && seeIt)
    say(ctx, blind(ctx) ? 'zap.whiff_smoke' : 'zap.puff_smoke');
  return rangemod;
}

/**
 * A monster's fire pillar or lightning bolt hits the floor at (x,y) (the hero's square): fire burns
 * scrolls and spellbooks there. ref: src/zap.c mon_spell_hits_spot() -> zap_over_floor()
 */
export function monSpellHitsSpot(ctx: Ctx, ray: 'fire' | 'lightning', x: number, y: number): void {
  zapOverFloor(ctx, ray, x, y);
}

/** ref: src/zap.c burn_floor_objects() without feedback: each scroll or book burns 1 in 3 */
function burnFloorObjects(ctx: Ctx, x: number, y: number): number {
  let cnt = 0;
  const level = heroPos(ctx).level;
  for (const o of itemsAt(ctx.defs, ctx.state, level, x, y)) {
    const od = ctx.defs.object(o.def);
    const it = o.c.item;
    if (!it || (od.class !== 'scroll' && od.class !== 'spellbook')) continue;
    if (o.def === 'nh:scroll_of_fire' || o.def === 'nh:spellbook_of_fireball') continue;
    if (ctx.rng.rn2(100) < 2) continue; // obj_resists(obj, 2, 100)
    let del = 0;
    for (let i = it.quantity; i > 0; i--) if (!ctx.rng.rn2(3)) del++;
    if (!del) continue;
    if (del < it.quantity) it.quantity -= del;
    else ctx.remove(o.id);
    cnt += del;
  }
  // this also ignites floor items, but does not change cnt because they weren't consumed
  igniteItems(ctx, { level, x, y });
  return cnt;
}

/**
 * Who sends a ray: the hero (her wand, or her spell when `spell` names its book (types 10..19):
 * the spell to-hit and damage bonuses, resisted at her level; kills are hers, and a monster it
 * hits is angered with `wakeup`, peaceful.ts's, passed in because peaceful.ts sits above this
 * module), or a monster's
 * spell (BZ_M_SPELL: a monster it kills is killed by "another monster", one it hits is only
 * woken up, and a hero it kills dies of "a bolt of lightning").
 */
export type RaySource =
  { by: 'hero'; spell?: DefId; wakeup: (ctx: Ctx, id: EntityId) => void } | { by: 'spell' };

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
  buzzSteps(ctx, ray, nd, from, dir, src, path);
  if (path.length > 0) ctx.emit({ type: 'ray', kind: ray, fg: RAY_COLOR[ray], path });
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
): void {
  const level = levelOf(ctx);
  const vertical = dir === 'up' || dir === 'down';
  const d = vertical ? { x: 0, y: 0 } : { ...DIRS[dir] };
  // the hero's spell: its SPE_ type
  const spell = src.by === 'hero' ? (src.spell ?? null) : null;
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
      range += zapOverFloor(ctx, ray, sx, sy);
      const mon = monAt(ctx, sx, sy);
      const hp = heroPos(ctx);
      if (mon) {
        if (zapHit(ctx, findMac(ctx.state, ctx.defs, mon.id), spell)) {
          // mon_reflects(): no monster can reflect in the subset
          const couldMove = !isFrozen(ctx, mon.id);
          const tmp = zhitm(ctx, mon, ray, nd, spell !== null);
          if ((mon.c.hp?.cur ?? 0) < 1) {
            if (alive(ctx, mon.id)) {
              if (src.by === 'hero') killedByHero(ctx, mon);
              else monkilled(ctx, mon.id, true); // killed by another monster
            }
          } else {
            say(ctx, 'zap.ray.hit', { ray: rayName(ray), mon: monNam(ctx, mon), ex: exclam(tmp) });
            if (couldMove && isFrozen(ctx, mon.id)) sleptMonst(ctx, mon);
            if (ray !== 'sleep') {
              if (src.by === 'hero') src.wakeup(ctx, mon.id);
              else wakeGently(ctx, mon);
            }
          }
          range -= 2;
        } else if (canseemon(ctx, mon)) {
          say(ctx, 'zap.ray.miss', { ray: rayName(ray), mon: monNam(ctx, mon) });
        }
      } else if (hp.x === sx && hp.y === sy && range >= 0) {
        ctx.interrupt(); // nomul(0)
        if (zapHit(ctx, findAc(ctx.state, ctx.defs, ctx.state.playerId), null)) {
          range -= 2;
          say(ctx, 'zap.ray.hits_you', { ray: rayName(ray) });
          if (hasExtrinsic(hero(ctx), P.REFLECTING)) {
            if (!blind(ctx)) ureflects(ctx, 'zap.ray.reflects');
            else say(ctx, 'zap.ray.not_affected');
            d.x = -d.x;
            d.y = -d.y;
          } else {
            zhitu(
              ctx,
              ray,
              nd,
              src.by === 'hero' ? `@killer.zap.ray.${ray}` : `@killer.ray.${ray}`,
            );
          }
        } else if (!blind(ctx)) {
          say(ctx, 'zap.ray.whizzes', { ray: rayName(ray) });
        } else if (ray === 'lightning') {
          say(ctx, 'zap.ray.tingles');
        }
        if (ctx.state.gameOver) return;
        if (ray === 'lightning') flashburn(ctx, ctx.rng.d(nd, 50));
      }
      if (ctx.state.gameOver) return;
      const t = terrainAt(ctx, level, sx, sy);
      bounceNow = !zapPos(t) || (closedDoor(t) && range >= 0);
    }
    if (bounceNow) {
      const out = !inBounds(level, sx, sy) || cellId(level, sx, sy) === T.stone;
      const bchance = out ? 10 : 75;
      if (--range > 0 && inBounds(level, lsx, lsy) && cansee(ctx, lsx, lsy))
        say(ctx, 'zap.ray.bounces', { ray: rayName(ray) });
      bounceDir(ctx, level, sx, sy, d, bchance);
    }
  }
}
