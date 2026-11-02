// Wands: zapping (z), immediate beams, rays with bounce and reflection, and zapping yourself.
// ref: src/zap.c dozap(), zappable(), backfire(), weffects(), zapnodir(), bhit(), bhitm(),
// bhito(), bhitpile(), zapyourself(), learnwand(), probe_monster(), resist(), dobuzz(),
// zhitm(), zhitu(), zap_hit(), bounce_dir(), zap_over_floor(), burn_floor_objects(),
// flashburn(); src/lock.c doorlock(), boxlock(), obstructed(); src/trap.c openholdingtrap(),
// closeholdingtrap(), openfallingtrap(); src/detect.c findit(), findone(); src/makemon.c
// create_critters(); src/worn.c mon_adjust_speed(); src/mhitm.c sleep_monst(), slept_monst();
// src/potion.c speed_up(); src/mhitu.c u_slow_down()
//
// Not ported (see DEVIATIONS.md): up/down zaps, engraving, breaking (applying) wands, the wands
// outside the subset, monster reflection (no monster can reflect yet), lightning blinding
// monsters, the Deaf/Half_spell_damage/steed/engulfing cases, mimics, shops,
// statues, boulders, drawbridges, the ray animation.
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  contents,
  getPlayer,
  inBounds,
  inventoryOf,
  isContainer,
  itemsAt,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type Msg,
  type ObjectDef,
  type Offer,
  type PlayerAction,
  type Pos,
  type PromptOption,
  type TerrainDef,
  type Trap,
} from '@nh/core';
import { setTerrain } from './actions';
import { destroyItems, erodeArmor } from './erode';
import { igniteItems } from './light';
import { makemon } from './generation';
import { confdir, getdirImpaired, setUstuck, uMaybeImpaired, ustuck } from './hackmove';
import { experienceFor, gainExperience } from './hero';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { checkCapacity, useupall } from './magic';
import { monsterDied } from './mondeath';
import { nonliving } from './mondata';
import { heroSees, minvent } from './mongear';
import { frozenTime, isFrozen, mspeed, paralyzeMonst, setMspeed } from './mstate';
import { wakeNearto } from './noise';
import { discover, isKnown } from './o_init';
import { doname, xnameOf } from './objnam';
import { wakeup } from './peaceful';
import { canSpotMon, monNam } from './perception';
import {
  P,
  hasExtrinsic,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  makeBlinded,
  setIntrinsic,
  setItimeout,
  timeoutLeft,
} from './props';
import { clearArea, litroom } from './read';
import { findAc, findMac } from './stats';
import { T } from './terrain';
import { TRAP, dotrap, mintrap } from './trap';
import { isMtrapped, setMtrapped, setUtrap, utrap } from './trapstate';

export const ZAP_ID: DefId = 'nh:zap';

/** The wands of the subset. ref: include/objects.h WAND() */
export const WAN = {
  light: 'nh:wand_of_light',
  secretDoor: 'nh:wand_of_secret_door_detection',
  createMonster: 'nh:wand_of_create_monster',
  nothing: 'nh:wand_of_nothing',
  striking: 'nh:wand_of_striking',
  slow: 'nh:wand_of_slow_monster',
  speed: 'nh:wand_of_speed_monster',
  opening: 'nh:wand_of_opening',
  locking: 'nh:wand_of_locking',
  probing: 'nh:wand_of_probing',
  magicMissile: 'nh:wand_of_magic_missile',
  fire: 'nh:wand_of_fire',
  cold: 'nh:wand_of_cold',
  sleep: 'nh:wand_of_sleep',
  lightning: 'nh:wand_of_lightning',
} as const;

/** ref: include/hack.h WAND_BACKFIRE_CHANCE, WAND_WREST_CHANCE; BOLT_LIM */
const WAND_BACKFIRE_CHANCE = 100;
const WAND_WREST_CHANCE = 121;

/** Ray damage types, in flash_types[] order. ref: src/zap.c ZT_MAGIC_MISSILE .. ZT_LIGHTNING */
type Ray = 'magic_missile' | 'fire' | 'cold' | 'sleep' | 'lightning';
const RAY_OF: Readonly<Record<string, Ray>> = {
  [WAN.magicMissile]: 'magic_missile',
  [WAN.fire]: 'fire',
  [WAN.cold]: 'cold',
  [WAN.sleep]: 'sleep',
  [WAN.lightning]: 'lightning',
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
const trapHere = (level: Level, x: number, y: number): Trap | undefined =>
  level.traps.find((t) => t.x === x && t.y === y);

// ---------------------------------------------------------------------------------------------
// shared helpers

/**
 * The wand's effect was observed: discover its type. ref: src/zap.c learnwand() (objects are
 * always dknown here, so only an already known type is left alone)
 */
export function learnwand(ctx: Ctx, wand: Entity): void {
  if (!isKnown(ctx.state, ctx.defs, wand.def)) discover(ctx, wand.def);
}

/** The hero kills the monster: "You kill it!", then experience. ref: src/mon.c killed(), xkilled() */
function killedByHero(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  const def = ctx.defs.monster(mon.def);
  say(ctx, nonliving(def) ? 'combat.you_destroy' : 'combat.you_kill', { mon: monNam(ctx, mon) });
  const level = m.level;
  monsterDied(ctx, mon.id, true);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * The monster's saving throw against a wand (attack level 12); `damage` is halved when it
 * resists and then taken, which may kill it. ref: src/zap.c resist() with WAND_CLASS
 */
function resist(ctx: Ctx, mon: Entity, damage: number): boolean {
  const def = ctx.defs.monster(mon.def);
  const alev = 12;
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
const resistsMagm = (ctx: Ctx, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).attacks.some((a) => a.ad === 'magm' || a.ad === 'rbre');

/** Wakes a monster without angering it (wakeup(mon, FALSE)). */
function wakeGently(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  if (m.asleep && mon.c.pos && heroSees(ctx, mon.c.pos))
    say(ctx, 'mon.wakes_up', { mon: monNam(ctx, mon) });
  m.asleep = false;
}

/**
 * ref: src/mhitm.c sleep_monst() with a wand's resist() roll: a sleep-resistant monster or one
 * that resists is unaffected; one that can move is frozen for `amt` turns.
 */
function sleepMonst(ctx: Ctx, mon: Entity, amt: number): boolean {
  if (ctx.defs.monster(mon.def).resists.includes('sleep') || resist(ctx, mon, 0)) return false;
  if (isFrozen(ctx, mon.id)) return false;
  paralyzeMonst(ctx, mon.id, amt + frozenTime(ctx, mon.id));
  return true;
}

/** ref: src/mhitm.c slept_monst(): a sleeping grabber lets go */
function sleptMonst(ctx: Ctx, mon: Entity): void {
  if (ustuck(ctx) === mon.id && isFrozen(ctx, mon.id)) {
    say(ctx, 'zap.grip_relaxes', { mon: monNam(ctx, mon) });
    setUstuck(ctx, null);
  }
}

/**
 * ref: src/worn.c mon_adjust_speed() for +1 / -1: MSLOW and MFAST cancel each other; the change
 * is told when seen (which identifies the wand).
 */
function monAdjustSpeed(ctx: Ctx, mon: Entity, adjust: 1 | -1, wand: Entity): void {
  const old = mspeed(ctx, mon.id);
  const now = adjust > 0 ? (old === 'slow' ? null : 'fast') : old === 'fast' ? null : 'slow';
  setMspeed(ctx, mon.id, now);
  const def = ctx.defs.monster(mon.def);
  if (
    now !== old &&
    def.speed > 0 &&
    !isFrozen(ctx, mon.id) &&
    !mon.c.monster?.asleep &&
    canseemon(ctx, mon)
  ) {
    // fast to slow (skipping the intermediate state) or vice versa
    const much = old !== null && now !== null ? { key: 'zap.much' } : '';
    say(ctx, adjust > 0 || now === 'fast' ? 'zap.mon_faster' : 'zap.mon_slower', {
      mon: monNam(ctx, mon),
      much,
    });
    learnwand(ctx, wand);
  }
}

/** ref: src/potion.c speed_up() */
function speedUp(ctx: Ctx, duration: number): void {
  const h = hero(ctx);
  if (timeoutLeft(ctx.state, h, P.FAST) <= 0)
    say(ctx, hasIntrinsic(h, P.FAST) ? 'zap.speed.faster' : 'zap.speed.much_faster');
  else say(ctx, 'zap.speed.legs');
  incrItimeout(ctx.state, h, P.FAST, duration);
}

/** ref: src/mhitu.c u_slow_down(): HFast = 0 (no speed boots) */
function uSlowDown(ctx: Ctx): void {
  const h = hero(ctx);
  setIntrinsic(h, P.FAST, false);
  setItimeout(ctx.state, h, P.FAST, 0);
  say(ctx, 'zap.slow_down');
}

/** ref: src/zap.c flashburn(): lightning blinds a hero who can see */
function flashburn(ctx: Ctx, duration: number): void {
  if (blind(ctx) || hero(ctx).c.helpless) return; // resists_blnd(): already blind or unaware
  say(ctx, 'zap.blinded_flash');
  makeBlinded(ctx, duration, false);
}

/** ref: ureflects(): only the amulet of reflection reflects in the subset */
function ureflects(ctx: Ctx, key: string): boolean {
  if (!hasExtrinsic(hero(ctx), P.REFLECTING)) return false;
  say(ctx, key);
  discover(ctx, 'nh:amulet_of_reflection');
  return true;
}

// ---------------------------------------------------------------------------------------------
// traps that hold or drop their victim

/** ref: src/trap.c openholdingtrap(): frees the hero or monster from a bear trap */
function openholdingtrap(ctx: Ctx, mon: Entity | null): { done: boolean; noticed: boolean } {
  if (!mon) {
    if (!utrap(ctx)) return { done: false, noticed: false };
    say(ctx, 'zap.you_released_trap', { trap: `@${TRAP.bear}` });
    setUtrap(ctx, 0, 'beartrap'); // reset_utrap()
    return { done: true, noticed: true };
  }
  const p = mon.c.pos;
  const t = p ? trapHere(levelOf(ctx), p.x, p.y) : undefined;
  if (!t || t.def !== TRAP.bear || !isMtrapped(ctx, mon.id)) return { done: false, noticed: false };
  setMtrapped(ctx, mon.id, false);
  let noticed = false;
  if (canSpotMon(ctx, mon)) {
    noticed = true;
    say(ctx, t.seen ? 'zap.mon_released_seen' : 'zap.mon_released', {
      mon: monNam(ctx, mon),
      trap: `@${t.def}`,
    });
  } else if (cansee(ctx, t.x, t.y) && t.seen) {
    noticed = true;
    say(ctx, 'zap.trap_opens', { trap: `@${t.def}` });
  }
  return { done: true, noticed };
}

/** ref: src/trap.c closeholdingtrap(): a bear trap here springs on the hero or monster */
function closeholdingtrap(ctx: Ctx, mon: Entity | null): { done: boolean; noticed: boolean } {
  const p = mon ? mon.c.pos : heroPos(ctx);
  const t = p ? trapHere(levelOf(ctx), p.x, p.y) : undefined;
  if (!t || t.def !== TRAP.bear) return { done: false, noticed: false };
  if (!mon) {
    if (utrap(ctx)) return { done: false, noticed: false };
    dotrap(ctx, t, { force: true });
    return { done: utrap(ctx) !== null, noticed: true };
  }
  if (isMtrapped(ctx, mon.id)) return { done: false, noticed: false };
  const noticed = cansee(ctx, t.x, t.y) || canSpotMon(ctx, mon);
  return { done: mintrap(ctx, mon.id, { force: true }) !== 'finished', noticed };
}

/** ref: src/trap.c openfallingtrap(trapdoor_only TRUE): a trap door (or rock trap) opens */
function openfallingtrap(ctx: Ctx, mon: Entity | null): { done: boolean; noticed: boolean } {
  const p = mon ? mon.c.pos : heroPos(ctx);
  const t = p ? trapHere(levelOf(ctx), p.x, p.y) : undefined;
  if (!t || (t.def !== TRAP.trapdoor && t.def !== TRAP.rock))
    return { done: false, noticed: false };
  if (!mon) {
    if (utrap(ctx)) return { done: false, noticed: false };
    dotrap(ctx, t, { force: true });
    return { done: utrap(ctx) !== null, noticed: true };
  }
  if (isMtrapped(ctx, mon.id)) return { done: false, noticed: false };
  const noticed = cansee(ctx, t.x, t.y) || canSpotMon(ctx, mon);
  wakeup(ctx, mon.id); // the monster is angered; mintrap doesn't handle that
  return { done: mintrap(ctx, mon.id, { force: true }) !== 'finished', noticed };
}

/** ref: src/zap.c release_hold(): the hero is held (never engulfed or sticky here) */
function releaseHold(ctx: Ctx): void {
  const id = ustuck(ctx);
  const mon = id === null ? undefined : ent(ctx, id);
  setUstuck(ctx, null);
  if (mon) say(ctx, 'zap.released_grasp', { mon: monNam(ctx, mon) });
}

// ---------------------------------------------------------------------------------------------
// probing

/** A short status line: level, HP, AC and the states we track. ref: src/insight.c mstatusline() */
function monStatus(ctx: Ctx, mon: Entity): Msg {
  const m = mon.c.monster;
  const flags: string[] = [];
  if ((m?.tame ?? 0) > 0) flags.push('tame');
  else if (m?.peaceful) flags.push('peaceful');
  if (isMtrapped(ctx, mon.id)) flags.push('trapped');
  const sp = mspeed(ctx, mon.id);
  if (sp) flags.push(sp);
  if (isFrozen(ctx, mon.id)) flags.push('cant_move');
  else if (m?.asleep) flags.push('asleep');
  return {
    key: 'zap.probe.status',
    params: {
      mon: monNam(ctx, mon),
      lvl: m?.level ?? 0,
      hp: mon.c.hp?.cur ?? 0,
      hpmax: mon.c.hp?.max ?? 0,
      ac: findMac(ctx.state, ctx.defs, mon.id),
      flags: flagChain(flags),
    },
  };
}

const flagChain = (flags: readonly string[]): Msg | '' => {
  let out: Msg | '' = '';
  for (let i = flags.length - 1; i >= 0; i--)
    out = { key: `zap.probe.flag.${flags[i] ?? ''}`, params: { rest: out } };
  return out;
};

/** ref: src/zap.c probe_monster(): the status line and what it carries */
function probeMonster(ctx: Ctx, mon: Entity): void {
  const st = monStatus(ctx, mon);
  say(ctx, st.key, st.params);
  const inv = minvent(ctx, mon.id);
  if (!inv.length) {
    say(ctx, 'zap.probe.not_carrying', { mon: monNam(ctx, mon) });
    return;
  }
  say(ctx, 'zap.probe.carrying', { mon: monNam(ctx, mon) });
  ctx.emit({
    type: 'list',
    titleKey: 'zap.probe.inventory',
    items: inv.map((o) => doname(ctx.state, ctx.defs, o)),
  });
}

/** ref: src/insight.c ustatusline() (short form) */
function ustatusline(ctx: Ctx): void {
  const h = hero(ctx);
  const flags: string[] = [];
  if (utrap(ctx)) flags.push('trapped');
  if (timeoutLeft(ctx.state, h, P.FAST) > 0) flags.push('very_fast');
  else if (hasProp(h, P.FAST)) flags.push('fast');
  say(ctx, 'zap.probe.you', {
    lvl: h.c.experience?.level ?? 1,
    hp: h.c.hp?.cur ?? 0,
    hpmax: h.c.hp?.max ?? 0,
    ac: findAc(ctx.state, ctx.defs, h.id),
    flags: flagChain(flags),
  });
}

// ---------------------------------------------------------------------------------------------
// locks: doors and boxes

/** ref: src/lock.c boxlock(): locking (Klunk!) or opening (Klick!) a box */
function boxlock(ctx: Ctx, box: Entity, wand: Entity): boolean {
  const it = box.c.item;
  if (!it) return false;
  if (wand.def === WAN.locking) {
    if (it.locked) return false; // already closed and locked
    say(ctx, 'zap.klunk');
    it.locked = true; // lock it; fix if broken
    delete it.broken;
    return true;
  }
  if (wand.def === WAN.opening) {
    if (it.locked) {
      say(ctx, 'zap.klick');
      delete it.locked;
      return true;
    }
    delete it.broken; // silently fix if broken
  }
  return false;
}

const isBox = (ctx: Ctx, e: Entity): boolean =>
  isContainer(ctx.defs, e) && ctx.defs.object(e.def).container?.box === true;

/** ref: src/zap.c boxlock_invent(): (un)lock carried boxes */
function boxlockInvent(ctx: Ctx, wand: Entity): void {
  for (const o of inventoryOf(ctx.state, ctx.state.playerId))
    if (isBox(ctx, o)) boxlock(ctx, o, wand);
}

/** ref: src/lock.c obstructed() (not quietly: the wand is always dknown) */
function obstructed(ctx: Ctx, x: number, y: number): boolean {
  const mon = monAt(ctx, x, y);
  if (mon) {
    say(ctx, 'zap.blocks_way', { mon: monNam(ctx, mon) });
    return true;
  }
  if (itemsAt(ctx.defs, ctx.state, heroPos(ctx).level, x, y).length) {
    say(ctx, 'zap.something_in_way');
    return true;
  }
  return false;
}

/**
 * A door or secret door hit by opening, locking or striking; true if something happened.
 * ref: src/lock.c doorlock(). A doorway stands for both D_NODOOR and D_BROKEN; doors are never
 * trapped; no shop doors.
 */
function doorlock(ctx: Ctx, wand: Entity, x: number, y: number): boolean {
  const level = levelOf(ctx);
  const id = cellId(level, x, y);
  if (isSdoor(id)) {
    if (wand.def !== WAN.opening && wand.def !== WAN.striking) return false;
    // door->doormask = D_CLOSED: the secret door becomes a closed (unlocked) door
    setTerrain(level, x, y, T.door_closed);
    if (cansee(ctx, x, y)) say(ctx, 'zap.door.appears');
    if (wand.def === WAN.opening) return true;
    // striking: continue door handling below
  }
  const t = terrainAt(ctx, level, x, y);
  let msg: string | null = null;
  let res = true;
  if (wand.def === WAN.locking) {
    if (obstructed(ctx, x, y)) return false;
    // traps are never in doorways here
    switch (t.door) {
      case 'closed':
        msg = 'zap.door.locks';
        break;
      case 'open':
        msg = 'zap.door.swings_shut';
        break;
      case 'doorway':
        msg = 'zap.door.assembles';
        break;
      default:
        res = false;
        break;
    }
    setTerrain(level, x, y, T.door_locked);
  } else if (wand.def === WAN.opening) {
    if (t.door === 'locked') {
      msg = 'zap.door.unlocks';
      setTerrain(level, x, y, T.door_closed);
    } else res = false;
  } else if (wand.def === WAN.striking) {
    if (t.door === 'locked' || t.door === 'closed') {
      const sawit = cansee(ctx, x, y);
      setTerrain(level, x, y, T.doorway); // D_BROKEN
      ctx.emit({ type: 'doorOpened', pos: { x, y } });
      say(ctx, sawit ? 'zap.door.crashes_open' : 'zap.door.crashing_sound');
      wakeNearto(ctx, x, y, 20);
    } else res = false;
  }
  if (msg && cansee(ctx, x, y)) say(ctx, msg);
  return res;
}

// ---------------------------------------------------------------------------------------------
// immediate wands: bhit(), bhitm(), bhito(), bhitpile()

/** ref: src/zap.c bhitm(): the monster is hit by the wand's effect */
function bhitm(ctx: Ctx, mon: Entity, wand: Entity, at: Pos): void {
  let wake = true;
  let helpful = false;
  let learn = false;
  switch (wand.def) {
    case WAN.striking:
      learn = cansee(ctx, at.x, at.y);
      if (resistsMagm(ctx, mon)) {
        say(ctx, 'zap.boing');
      } else if (ctx.rng.rnd(20) < 10 + findMac(ctx.state, ctx.defs, mon.id)) {
        const dmg = ctx.rng.d(2, 12);
        say(ctx, 'zap.wand_hit', { mon: monNam(ctx, mon), ex: exclam(dmg) });
        resist(ctx, mon, dmg);
      } else {
        say(ctx, 'zap.wand_miss', { mon: monNam(ctx, mon) });
        learn = false;
      }
      break;
    case WAN.slow:
      if (!resist(ctx, mon, 0)) monAdjustSpeed(ctx, mon, -1, wand);
      break;
    case WAN.speed:
      if (!resist(ctx, mon, 0)) monAdjustSpeed(ctx, mon, 1, wand);
      helpful = true; // wake but don't anger a peaceful target
      break;
    case WAN.locking: {
      const r = closeholdingtrap(ctx, mon);
      wake = r.done;
      learn = r.noticed;
      break;
    }
    case WAN.probing:
      wake = false;
      probeMonster(ctx, mon);
      learn = true;
      break;
    case WAN.opening: {
      wake = false; // don't want immediate counterattack
      if (ustuck(ctx) === mon.id) {
        releaseHold(ctx);
        learn = true;
        break;
      }
      const r = openholdingtrap(ctx, mon);
      learn ||= r.noticed;
      if (r.done) break;
      learn ||= openfallingtrap(ctx, mon).noticed;
      break;
    }
    case WAN.nothing:
    default:
      wake = false;
      break;
  }
  if (wake && alive(ctx, mon.id)) {
    if (helpful) wakeGently(ctx, mon);
    else wakeup(ctx, mon.id);
  }
  if (learn) learnwand(ctx, wand);
}

/** ref: src/dothrow.c breaktest(): potions and glass (not gems) break; 1% resist */
function breaktest(ctx: Ctx, e: Entity): boolean {
  const od = ctx.defs.object(e.def);
  if (ctx.rng.rn2(100) < 1) return false; // obj_resists(obj, 1, 99)
  return od.class === 'potion' || (od.material === 'glass' && od.class !== 'gem');
}

/** ref: src/zap.c bhito() for a floor object; returns 1 when it was affected */
function bhito(ctx: Ctx, obj: Entity, wand: Entity, x: number, y: number): number {
  let res = 0;
  let learn = false;
  switch (wand.def) {
    case WAN.probing:
      // only containers tell anything new (every object is dknown here)
      if (isContainer(ctx.defs, obj)) {
        const inside = contents(ctx.state, obj.id);
        if (!inside.length)
          say(ctx, 'zap.probe.empty', { item: xnameOf(ctx.state, ctx.defs, obj) });
        else
          ctx.emit({
            type: 'list',
            titleKey: 'zap.probe.contents',
            items: inside.map((o) => doname(ctx.state, ctx.defs, o)),
          });
        res = 1;
        learn = true;
      }
      break;
    case WAN.striking: {
      // hero_breaks(): something fragile breaks (heard if not seen)
      if (!breaktest(ctx, obj)) break;
      const it = obj.c.item;
      if (cansee(ctx, x, y))
        say(ctx, it && it.quantity !== 1 ? 'kick.shatter' : 'kick.shatters', {
          item: xnameOf(ctx.state, ctx.defs, obj),
        });
      else say(ctx, 'zap.hear_shatter');
      ctx.remove(obj.id);
      learn = true;
      break;
    }
    case WAN.opening:
    case WAN.locking:
      if (isBox(ctx, obj)) res = boxlock(ctx, obj, wand) ? 1 : 0;
      learn = res !== 0;
      break;
    default:
      break;
  }
  if (learn) learnwand(ctx, wand);
  return res;
}

/** ref: src/zap.c bhitpile(): every object on the square; the number affected */
function bhitpile(ctx: Ctx, wand: Entity, x: number, y: number): number {
  let hit = 0;
  for (const o of itemsAt(ctx.defs, ctx.state, heroPos(ctx).level, x, y)) {
    if (!ctx.state.entities[String(o.id)]) continue;
    hit += bhito(ctx, o, wand, x, y);
  }
  return hit;
}

/**
 * The beam of an immediate wand: rn1(8, 6) squares, each monster on the way is hit (costing 3
 * of the range), then the objects; doors are opened, locked or broken, and the beam stops at a
 * wall or closed door. ref: src/zap.c bhit() with ZAPPED_WAND, zap_map() (probing only)
 */
function bhit(ctx: Ctx, wand: Entity, dir: Dir): void {
  const level = levelOf(ctx);
  const d = DIRS[dir];
  let range = ctx.rng.rn2(8) + 6;
  let { x, y } = heroPos(ctx);
  while (range-- > 0) {
    x += d.x;
    y += d.y;
    if (!inBounds(level, x, y)) break;
    // zap_map(): probing maps the square and reveals a secret door
    if (wand.def === WAN.probing && isSdoor(cellId(level, x, y))) {
      const locked =
        cellId(level, x, y) === T.sdoor_locked_v || cellId(level, x, y) === T.sdoor_locked_h;
      setTerrain(level, x, y, locked ? T.door_locked : T.door_closed);
      if (cansee(ctx, x, y)) {
        say(ctx, 'zap.probe.sdoor');
        learnwand(ctx, wand);
      }
    }
    const typIsSdoor = isSdoor(cellId(level, x, y));
    const before = terrainAt(ctx, level, x, y);
    const mon = monAt(ctx, x, y);
    if (mon) {
      bhitm(ctx, mon, wand, { x, y });
      if (ctx.state.gameOver) return;
      range -= 3;
    }
    if (bhitpile(ctx, wand, x, y)) range--;
    if (
      (before.door !== undefined || typIsSdoor) &&
      (wand.def === WAN.opening || wand.def === WAN.locking || wand.def === WAN.striking) &&
      doorlock(ctx, wand, x, y) &&
      (cansee(ctx, x, y) || wand.def === WAN.striking)
    )
      learnwand(ctx, wand);
    // the terrain read before the door handling decides (a secret door stops the beam)
    if (!zapPos(before) || closedDoor(terrainAt(ctx, level, x, y))) break;
  }
}

// ---------------------------------------------------------------------------------------------
// directionless wands: zapnodir()

/**
 * Reveals secret doors, secret corridors and unseen traps the hero could see within BOLT_LIM.
 * ref: src/detect.c findit(), findone() (no hidden monsters, trapped doors or boxes)
 */
function findit(ctx: Ctx): number {
  const level = levelOf(ctx);
  let sdoors = 0;
  let scorrs = 0;
  let traps = 0;
  for (const i of clearArea(ctx, 8)) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    const id = cellId(level, x, y);
    if (isSdoor(id)) {
      // cvt_sdoor_to_door(): the door keeps its doormask (closed or locked)
      const locked = id === T.sdoor_locked_v || id === T.sdoor_locked_h;
      setTerrain(level, x, y, locked ? T.door_locked : T.door_closed);
      sdoors++;
    } else if (id === T.scorr) {
      setTerrain(level, x, y, T.corr);
      scorrs++;
    }
    const t = trapHere(level, x, y);
    if (t && !t.seen) {
      t.seen = true;
      traps++;
    }
  }
  const parts: Msg[] = [];
  const part = (n: number, what: string): void => {
    if (n)
      parts.push(
        n > 1 ? { key: `zap.found.${what}s`, params: { n } } : { key: `zap.found.${what}` },
      );
  };
  part(sdoors, 'sdoor');
  part(scorrs, 'scorr');
  part(traps, 'trap');
  const [a, b, c] = parts;
  if (a && b && c) say(ctx, 'zap.reveal', { what: { key: 'zap.join3', params: { a, b, c } } });
  else if (a && b) say(ctx, 'zap.reveal', { what: { key: 'zap.join2', params: { a, b } } });
  else if (a) say(ctx, 'zap.reveal', { what: a });
  else say(ctx, 'zap.find_nothing');
  return sdoors + scorrs + traps;
}

/** ref: src/makemon.c create_critters(): true when the hero sees a new monster */
function createCritters(ctx: Ctx, cnt: number): boolean {
  let known = false;
  const p = heroPos(ctx);
  while (cnt-- > 0) {
    const id = makemon(ctx, null, { x: p.x, y: p.y }, { adjacentOk: true });
    if (id === null) continue;
    const mon = ent(ctx, id);
    if (mon && canSpotMon(ctx, mon)) known = true;
  }
  return known;
}

/** ref: src/zap.c zapnodir() */
function zapnodir(ctx: Ctx, wand: Entity): void {
  let known = false;
  switch (wand.def) {
    case WAN.light:
      known = !blind(ctx);
      litroom(ctx, true, false);
      break;
    case WAN.secretDoor:
      known = true; // findit() gives feedback even when nothing is found
      findit(ctx);
      break;
    case WAN.createMonster:
      if (createCritters(ctx, ctx.rng.rn2(23) !== 0 ? 1 : ctx.rng.rn2(7) + 2)) known = true;
      break;
    default:
      break;
  }
  if (known) learnwand(ctx, wand);
}

// ---------------------------------------------------------------------------------------------
// rays: buzz()

/** ref: src/zap.c zap_hit(): does the zap hit armor class `ac`? */
function zapHit(ctx: Ctx, ac: number): boolean {
  const chance = ctx.rng.rn2(20);
  if (!chance) return ctx.rng.rnd(10) < ac; // small chance for naked target to avoid being hit
  const acv = ac >= 0 ? ac : -ctx.rng.rnd(-ac); // AC_VALUE()
  return 3 - chance < acv;
}

/**
 * ref: src/zap.c zhitm(): the ray's damage to a monster, halved when it resists; the hit points
 * are taken here. Fire burns armor (and may destroy items), cold and lightning may destroy items.
 */
function zhitm(ctx: Ctx, mon: Entity, ray: Ray, nd: number): number {
  const def = ctx.defs.monster(mon.def);
  const res = (r: string): boolean => def.resists.includes(r);
  let tmp = 0;
  switch (ray) {
    case 'magic_missile':
      if (resistsMagm(ctx, mon)) break;
      tmp = ctx.rng.d(nd, 6);
      break;
    case 'fire': {
      if (res('fire')) break;
      tmp = ctx.rng.d(nd, 6);
      const orig = tmp;
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
      tmp = ctx.rng.d(nd, 6);
      const orig = tmp;
      if (res('fire')) tmp += ctx.rng.d(nd, 3);
      if (!ctx.rng.rn2(3)) tmp += destroyItems(ctx, mon.id, 'cold', orig);
      break;
    }
    case 'sleep':
      sleepMonst(ctx, mon, ctx.rng.d(nd, 25));
      break;
    case 'lightning': {
      tmp = ctx.rng.d(nd, 6);
      const orig = tmp;
      if (res('elec')) tmp = 0; // (monsters are not blinded: no monster blindness yet)
      if (!ctx.rng.rn2(3)) tmp += destroyItems(ctx, mon.id, 'elec', orig);
      break;
    }
  }
  if (tmp > 0 && resist(ctx, mon, 0)) tmp = Math.trunc(tmp / 2);
  if (tmp < 0) tmp = 0;
  const hp = mon.c.hp;
  if (hp) hp.cur -= tmp;
  return tmp;
}

/** ref: src/zap.c zhitu(): the ray hits the hero */
function zhitu(ctx: Ctx, ray: Ray, nd: number): void {
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
  // "<flash> zapped by herself": the hero's own ricochet
  if (dam) losehp(ctx, dam, `@killer.zap.ray.${ray}`);
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
 * The hero's ray: rn1(7, 7) squares from her in direction `dir`, hitting monsters (zap_hit
 * against their AC) and the hero herself on the way back, bouncing off walls.
 * ref: src/zap.c dobuzz() for type 0..9 (hero's wand)
 */
function buzz(ctx: Ctx, ray: Ray, nd: number, dir: Dir): void {
  const level = levelOf(ctx);
  const d = { ...DIRS[dir] };
  let { x: sx, y: sy } = heroPos(ctx);
  let range = ctx.rng.rn2(7) + 7;
  while (range-- > 0) {
    const lsx = sx;
    const lsy = sy;
    sx += d.x;
    sy += d.y;
    let bounceNow = !inBounds(level, sx, sy) || cellId(level, sx, sy) === T.stone;
    if (!bounceNow) {
      range += zapOverFloor(ctx, ray, sx, sy);
      const mon = monAt(ctx, sx, sy);
      const hp = heroPos(ctx);
      if (mon) {
        if (zapHit(ctx, findMac(ctx.state, ctx.defs, mon.id))) {
          // mon_reflects(): no monster can reflect in the subset
          const couldMove = !isFrozen(ctx, mon.id);
          const tmp = zhitm(ctx, mon, ray, nd);
          if ((mon.c.hp?.cur ?? 0) < 1) {
            if (alive(ctx, mon.id)) killedByHero(ctx, mon);
          } else {
            say(ctx, 'zap.ray.hit', { ray: rayName(ray), mon: monNam(ctx, mon), ex: exclam(tmp) });
            if (couldMove && isFrozen(ctx, mon.id)) sleptMonst(ctx, mon);
            if (ray !== 'sleep') wakeup(ctx, mon.id);
          }
          range -= 2;
        } else if (canseemon(ctx, mon)) {
          say(ctx, 'zap.ray.miss', { ray: rayName(ray), mon: monNam(ctx, mon) });
        }
      } else if (hp.x === sx && hp.y === sy && range >= 0) {
        ctx.interrupt(); // nomul(0)
        if (zapHit(ctx, findAc(ctx.state, ctx.defs, ctx.state.playerId))) {
          range -= 2;
          say(ctx, 'zap.ray.hits_you', { ray: rayName(ray) });
          if (hasExtrinsic(hero(ctx), P.REFLECTING)) {
            if (!blind(ctx)) ureflects(ctx, 'zap.ray.reflects');
            else say(ctx, 'zap.ray.not_affected');
            d.x = -d.x;
            d.y = -d.y;
          } else {
            zhitu(ctx, ray, nd);
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

// ---------------------------------------------------------------------------------------------
// zapping yourself

/** Killers for zapping oneself (NO_KILLER_PREFIX in NetHack: "zapped herself with ..."). */
const SELF_KILLER: Readonly<Record<string, string>> = {
  [WAN.striking]: '@killer.zap.self.striking',
  [WAN.lightning]: '@killer.zap.self.lightning',
  [WAN.fire]: '@killer.zap.self.fire',
  [WAN.cold]: '@killer.zap.self.cold',
  [WAN.magicMissile]: '@killer.zap.self.magic_missile',
};

/** ref: src/zap.c zapyourself() with `ordinary` TRUE; returns the damage to take */
function zapyourself(ctx: Ctx, wand: Entity): number {
  const h = hero(ctx);
  let learn = false;
  let damage = 0;
  switch (wand.def) {
    case WAN.striking:
      learn = true;
      if (antimagic(ctx)) say(ctx, 'zap.boing');
      else {
        say(ctx, 'zap.self.bash');
        damage = ctx.rng.d(2, 12);
      }
      break;
    case WAN.lightning: {
      learn = true;
      const orig = ctx.rng.d(12, 6);
      if (!hasProp(h, P.SHOCK_RES)) {
        say(ctx, 'zap.self.shock');
        damage = orig;
      } else say(ctx, 'zap.self.unharmed');
      destroyItems(ctx, h.id, 'elec', orig);
      if (ctx.state.gameOver) return 0;
      flashburn(ctx, ctx.rng.rnd(100));
      break;
    }
    case WAN.fire: {
      learn = true;
      const orig = ctx.rng.d(12, 6);
      if (hasProp(h, P.FIRE_RES)) say(ctx, 'zap.self.warm');
      else {
        say(ctx, 'zap.self.afire');
        damage = orig;
      }
      erodeArmor(ctx, h.id, 'burn'); // burnarmor()
      destroyItems(ctx, h.id, 'fire', orig);
      igniteItems(ctx, h.id);
      break;
    }
    case WAN.cold: {
      learn = true;
      const orig = ctx.rng.d(12, 6);
      if (hasProp(h, P.COLD_RES)) say(ctx, 'zap.self.chill');
      else {
        say(ctx, 'zap.self.popsicle');
        damage = orig;
      }
      destroyItems(ctx, h.id, 'cold', orig);
      break;
    }
    case WAN.magicMissile:
      learn = true;
      if (antimagic(ctx)) say(ctx, 'zap.self.missiles_bounce');
      else {
        damage = ctx.rng.d(4, 6);
        say(ctx, 'zap.self.idiot');
      }
      break;
    case WAN.speed:
      // no longer gives intrinsic, but gives very fast speed instead
      speedUp(ctx, ctx.rng.rn2(25) + 50);
      learn = true;
      break;
    case WAN.sleep:
      learn = true;
      if (hasProp(h, P.SLEEP_RES)) say(ctx, 'zap.self.not_sleepy');
      else {
        say(ctx, 'zap.self.sleep_ray');
        nomulNow(ctx, ctx.rng.rnd(50), 'helpless.asleep', { key: 'eat.wake_up' }); // fall_asleep()
      }
      break;
    case WAN.slow:
      if (hasIntrinsic(h, P.FAST) || timeoutLeft(ctx.state, h, P.FAST) > 0) {
        learn = true;
        uSlowDown(ctx);
      }
      break;
    case WAN.opening:
      if (ustuck(ctx) !== null) {
        releaseHold(ctx);
        learn = true;
      }
      // invent is hit iff hero doesn't escape from a trap
      {
        const r = utrap(ctx) ? openholdingtrap(ctx, null) : { done: false, noticed: false };
        learn ||= r.noticed;
        if (!r.done) {
          boxlockInvent(ctx, wand);
          learn ||= openfallingtrap(ctx, null).noticed; // trigger previously escaped trapdoor
        }
      }
      break;
    case WAN.locking: {
      // similar logic to opening; invent is hit iff no trap triggered
      const r = utrap(ctx) ? { done: false, noticed: false } : closeholdingtrap(ctx, null);
      learn ||= r.noticed;
      if (utrap(ctx) || !r.done) boxlockInvent(ctx, wand);
      break;
    }
    case WAN.probing:
      learn = true;
      ustatusline(ctx);
      break;
    case WAN.nothing:
    default:
      break;
  }
  if (learn) learnwand(ctx, wand);
  return damage;
}

// ---------------------------------------------------------------------------------------------
// weffects() and the z command

/**
 * The effect of zapping a wand of the subset (ObjectDef.zap). `dir` is a direction, 'self' or
 * null for a directionless wand. ref: src/zap.c weffects(); zapyourself() for 'self' (with the
 * losehp() of dozap())
 */
export function weffects(ctx: Ctx, user: EntityId, item: EntityId, dir: Dir | 'self' | null): void {
  const wand = ent(ctx, item);
  if (!wand || user !== ctx.state.playerId) return; // monsters don't zap yet
  const def = ctx.defs.object(wand.def);
  const kind = def.wand?.dir ?? 'nodir';
  if (kind === 'nodir' || dir === null) {
    zapnodir(ctx, wand);
    return;
  }
  if (dir === 'self') {
    const damage = zapyourself(ctx, wand);
    if (damage && !ctx.state.gameOver)
      losehp(ctx, damage, SELF_KILLER[wand.def] ?? '@killer.zap.self.striking');
    return;
  }
  if (kind === 'immediate') {
    bhit(ctx, wand, dir);
    return;
  }
  const ray = RAY_OF[wand.def];
  if (!ray) return;
  learnwand(ctx, wand); // disclose: a ray is always seen
  buzz(ctx, ray, wand.def === WAN.magicMissile ? 2 : 6, dir);
}

/** `zap` for every wand of the subset (attached to the defs in index.ts). */
export const WAND_ZAPS: Readonly<Record<string, NonNullable<ObjectDef['zap']>>> =
  Object.fromEntries(Object.values(WAN).map((id) => [id, weffects]));

/** ref: src/zap.c zappable(): uses a charge, maybe wresting the last one */
function zappable(ctx: Ctx, wand: Entity): boolean {
  const it = wand.c.item;
  if (!it) return false;
  if (it.spe < 0 || (it.spe === 0 && ctx.rng.rn2(WAND_WREST_CHANCE))) return false;
  if (it.spe === 0) say(ctx, 'zap.wrest');
  it.spe--;
  return true;
}

/** ref: src/zap.c backfire(): the cursed wand explodes */
function backfire(ctx: Ctx, wand: Entity): void {
  const it = wand.c.item;
  say(ctx, 'zap.explodes', { item: xnameOf(ctx.state, ctx.defs, wand) });
  const dmg = ctx.rng.d((it?.spe ?? 0) + 2, 6);
  useupall(ctx, wand.id);
  losehp(ctx, dmg, '@killer.destroy.wand');
}

/** After the zap: a wand with no charges left (spe < 0) turns to dust. ref: dozap() */
function afterZap(ctx: Ctx, id: EntityId): number {
  const wand = ent(ctx, id);
  if (wand?.c.item && wand.c.item.carriedBy === ctx.state.playerId && wand.c.item.spe < 0) {
    say(ctx, 'zap.dust', { item: xnameOf(ctx.state, ctx.defs, wand) });
    useupall(ctx, id);
  }
  return NORMAL_SPEED;
}

const heroItem = (ctx: Ctx, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

function itemArg(action: PlayerAction): unknown {
  return action.type === 'mod' ? (action.args as { item?: unknown } | undefined)?.item : undefined;
}

/** The direction prompt: the eight directions and yourself ('.'); no up or down. */
const ZAP_DIRECTIONS: PromptOption[] = [
  ...DIR_LIST.map((d) => ({ value: d, key: `dir.${d}` })),
  { value: 'self', key: 'zap.dir.self' },
];

/** Calls the wand's def zap (weffects for vanilla wands). */
function doZapEffect(ctx: Ctx, wand: Entity, dir: Dir | 'self' | null): void {
  const def = ctx.defs.object(wand.def);
  if (def.zap) def.zap(ctx, ctx.state.playerId, wand.id, dir);
}

// ref: src/zap.c dozap(), the z command
const zap: ActionDef = {
  id: ZAP_ID,
  labelKey: 'action.nh:zap',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e || ctx.defs.object(e.def).class !== 'wand') return [];
    return [
      { action: { type: 'mod', action: ZAP_ID, args: { item: e.id } }, labelKey: 'action.nh:zap' },
    ];
  },
  perform(ctx, action) {
    const wand = heroItem(ctx, itemArg(action));
    if (!wand || ctx.defs.object(wand.def).class !== 'wand') return 0;
    if (checkCapacity(ctx)) return 0;
    const needDir = ctx.defs.object(wand.def).wand?.dir !== 'nodir';
    if (!zappable(ctx, wand)) {
      say(ctx, 'zap.nothing_happens');
    } else if (wand.c.item?.buc === 'cursed' && !ctx.rng.rn2(WAND_BACKFIRE_CHANCE)) {
      backfire(ctx, wand); // the wand blows up in your face!
      return NORMAL_SPEED;
    } else if (needDir) {
      // getdir(): the charge is already spent
      ctx.ask(
        { id: 'zap-direction', kind: 'direction', key: 'zap.direction', options: ZAP_DIRECTIONS },
        ZAP_ID,
        { item: wand.id },
      );
      return 0;
    } else {
      doZapEffect(ctx, wand, null);
    }
    return afterZap(ctx, wand.id);
  },
  answer(ctx, value: Json, raw: Json) {
    const id = (raw as { item?: unknown } | null)?.item;
    const wand = heroItem(ctx, id);
    if (!wand) return NORMAL_SPEED;
    const picked: Dir | 'self' | undefined =
      value === 'self' ? 'self' : DIR_LIST.find((d) => d === value);
    if (!picked) {
      // "make him pay for knowing !NODIR"
      if (!blind(ctx)) say(ctx, 'zap.glows_fades', { item: xnameOf(ctx.state, ctx.defs, wand) });
      return afterZap(ctx, wand.id);
    }
    // getdir() -> confdir(): an impaired hero zaps in a random direction, even at herself
    const dir: Dir | 'self' =
      picked === 'self'
        ? uMaybeImpaired(ctx)
          ? confdir(ctx)
          : 'self'
        : getdirImpaired(ctx, picked);
    doZapEffect(ctx, wand, dir);
    if (ctx.state.gameOver) return NORMAL_SPEED;
    return afterZap(ctx, wand.id);
  },
};

export const ZAP_ACTIONS: readonly ActionDef[] = [zap];
