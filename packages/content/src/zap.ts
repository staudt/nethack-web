// Wands: zapping (z), immediate beams, rays with bounce and reflection, and zapping yourself;
// the directional spells (force bolt, sleep, healing) go through the same code with a spell
// source (C's pseudo spellbook object). ref: src/zap.c dozap(), zappable(), backfire(), weffects(), zapnodir(), bhit(), bhitm(),
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
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { checkCapacity, useupall } from './magic';
import { heroSees, minvent } from './mongear';
import { isFrozen, mspeed, setMspeed } from './mstate';
import { wakeNearto } from './noise';
import { discover, isKnown } from './o_init';
import { doname, xnameOf } from './objnam';
import { wakeup } from './peaceful';
import { buzzFrom, flashburn, resist, resistsMagm, wakeGently, type Ray } from './buzz';
import { adjalign, uState } from './luck';
import { healup } from './potion';
import { canSpotMon, monNam } from './perception';
import {
  P,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  setIntrinsic,
  setItimeout,
  timeoutLeft,
} from './props';
import { clearArea, litroom } from './read';
import { SPELL_INFO, spellDamageBonus } from './spellcalc';
import { findAc, findMac } from './stats';
import { T } from './terrain';
import { TRAP, dotrap, mintrap } from './trap';
import { isMtrapped, setMtrapped, setUtrap, utrap } from './trapstate';
import { checkUnpaid } from './shk';

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

/** The directional spells that zap like wands. ref: include/objects.h SPELL() */
export const SPE = {
  forceBolt: 'nh:spellbook_of_force_bolt',
  sleep: 'nh:spellbook_of_sleep',
  healing: 'nh:spellbook_of_healing',
} as const;

/**
 * What is zapped: a wand entity, or a spell (C's pseudo spellbook object: `blessed` when the
 * hero is Skilled in healing, never cursed). The wand code takes it in place of the wand.
 */
export type ZapSource =
  { kind: 'wand'; item: Entity } | { kind: 'spell'; otyp: DefId; blessed: boolean };

/** The object type zapped (otmp->otyp). */
const otypOf = (src: ZapSource): DefId => (src.kind === 'wand' ? src.item.def : src.otyp);

/** ref: include/hack.h WAND_BACKFIRE_CHANCE, WAND_WREST_CHANCE; BOLT_LIM */
const WAND_BACKFIRE_CHANCE = 100;
const WAND_WREST_CHANCE = 121;

const RAY_OF: Readonly<Record<string, Ray>> = {
  [WAN.magicMissile]: 'magic_missile',
  [WAN.fire]: 'fire',
  [WAN.cold]: 'cold',
  [WAN.sleep]: 'sleep',
  [WAN.lightning]: 'lightning',
  [SPE.sleep]: 'sleep',
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

/** learnwand() for a source: spells are suppressed, so casting never discovers a book. */
function learn(ctx: Ctx, src: ZapSource): void {
  if (src.kind === 'wand') learnwand(ctx, src.item);
}

/**
 * ref: src/worn.c mon_adjust_speed() for +1 / -1: MSLOW and MFAST cancel each other; the change
 * is told when seen (which identifies the wand).
 */
function monAdjustSpeed(ctx: Ctx, mon: Entity, adjust: 1 | -1, src: ZapSource): void {
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
    learn(ctx, src);
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
function boxlock(ctx: Ctx, box: Entity, otyp: DefId): boolean {
  const it = box.c.item;
  if (!it) return false;
  if (otyp === WAN.locking) {
    if (it.locked) return false; // already closed and locked
    say(ctx, 'zap.klunk');
    it.locked = true; // lock it; fix if broken
    delete it.broken;
    return true;
  }
  if (otyp === WAN.opening) {
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
function boxlockInvent(ctx: Ctx, otyp: DefId): void {
  for (const o of inventoryOf(ctx.state, ctx.state.playerId))
    if (isBox(ctx, o)) boxlock(ctx, o, otyp);
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
function doorlock(ctx: Ctx, otyp: DefId, x: number, y: number): boolean {
  const level = levelOf(ctx);
  const id = cellId(level, x, y);
  const striking = otyp === WAN.striking || otyp === SPE.forceBolt;
  if (isSdoor(id)) {
    if (otyp !== WAN.opening && !striking) return false;
    // door->doormask = D_CLOSED: the secret door becomes a closed (unlocked) door
    setTerrain(level, x, y, T.door_closed);
    if (cansee(ctx, x, y)) say(ctx, 'zap.door.appears');
    if (otyp === WAN.opening) return true;
    // striking: continue door handling below
  }
  const t = terrainAt(ctx, level, x, y);
  let msg: string | null = null;
  let res = true;
  if (otyp === WAN.locking) {
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
  } else if (otyp === WAN.opening) {
    if (t.door === 'locked') {
      msg = 'zap.door.unlocks';
      setTerrain(level, x, y, T.door_closed);
    } else res = false;
  } else if (striking) {
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

/**
 * ref: src/zap.c bhitm(): the monster is hit by the wand's or spell's effect. No Pestilence or
 * monster blindness exist (healing never hurts and cures no blindness).
 */
function bhitm(ctx: Ctx, mon: Entity, src: ZapSource, at: Pos): void {
  let wake = true;
  let helpful = false;
  let learnIt = false;
  const otyp = otypOf(src);
  const oclass = src.kind;
  switch (otyp) {
    case WAN.striking:
    case SPE.forceBolt:
      learnIt = cansee(ctx, at.x, at.y);
      if (resistsMagm(ctx, mon)) {
        say(ctx, 'zap.boing');
      } else if (ctx.rng.rnd(20) < 10 + findMac(ctx.state, ctx.defs, mon.id)) {
        let dmg = ctx.rng.d(2, 12);
        if (otyp === SPE.forceBolt) dmg = spellDamageBonus(ctx.state, dmg);
        say(ctx, oclass === 'wand' ? 'zap.wand_hit' : 'zap.spell_hit', {
          mon: monNam(ctx, mon),
          ex: exclam(dmg),
        });
        resist(ctx, mon, dmg, oclass);
      } else {
        say(ctx, oclass === 'wand' ? 'zap.wand_miss' : 'zap.spell_miss', {
          mon: monNam(ctx, mon),
        });
        learnIt = false;
      }
      break;
    case SPE.healing: {
      const healamt = ctx.rng.d(6, 4);
      wake = false; // wakeup() makes the target angry
      // healmon(mtmp, healamt, 0)
      const hp = mon.c.hp;
      if (hp) hp.cur = hp.cur + healamt > hp.max ? hp.max : hp.cur + healamt;
      // a blessed (Skilled) spell would cure the monster's blindness: no monster blindness yet
      if (canseemon(ctx, mon)) say(ctx, 'zap.looks_better', { mon: monNam(ctx, mon) });
      const m = mon.c.monster;
      if ((m?.tame ?? 0) > 0 || m?.peaceful) adjalign(ctx, Math.sign(uState(ctx.state).alignType));
      break;
    }
    case WAN.slow:
      if (!resist(ctx, mon, 0)) monAdjustSpeed(ctx, mon, -1, src);
      break;
    case WAN.speed:
      if (!resist(ctx, mon, 0)) monAdjustSpeed(ctx, mon, 1, src);
      helpful = true; // wake but don't anger a peaceful target
      break;
    case WAN.locking: {
      const r = closeholdingtrap(ctx, mon);
      wake = r.done;
      learnIt = r.noticed;
      break;
    }
    case WAN.probing:
      wake = false;
      probeMonster(ctx, mon);
      learnIt = true;
      break;
    case WAN.opening: {
      wake = false; // don't want immediate counterattack
      if (ustuck(ctx) === mon.id) {
        releaseHold(ctx);
        learnIt = true;
        break;
      }
      const r = openholdingtrap(ctx, mon);
      learnIt ||= r.noticed;
      if (r.done) break;
      learnIt ||= openfallingtrap(ctx, mon).noticed;
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
  if (learnIt) learn(ctx, src);
}

/** ref: src/dothrow.c breaktest(): potions and glass (not gems) break; 1% resist */
function breaktest(ctx: Ctx, e: Entity): boolean {
  const od = ctx.defs.object(e.def);
  if (ctx.rng.rn2(100) < 1) return false; // obj_resists(obj, 1, 99)
  return od.class === 'potion' || (od.material === 'glass' && od.class !== 'gem');
}

/** ref: src/zap.c bhito() for a floor object; returns 1 when it was affected */
function bhito(ctx: Ctx, obj: Entity, src: ZapSource, x: number, y: number): number {
  let res = 0;
  let learnIt = false;
  const otyp = otypOf(src);
  switch (otyp) {
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
        learnIt = true;
      }
      break;
    case WAN.striking:
    case SPE.forceBolt: {
      // hero_breaks(): something fragile breaks (heard if not seen)
      if (!breaktest(ctx, obj)) break;
      const it = obj.c.item;
      if (cansee(ctx, x, y))
        say(ctx, it && it.quantity !== 1 ? 'kick.shatter' : 'kick.shatters', {
          item: xnameOf(ctx.state, ctx.defs, obj),
        });
      else say(ctx, 'zap.hear_shatter');
      ctx.remove(obj.id);
      learnIt = true;
      break;
    }
    case WAN.opening:
    case WAN.locking:
      if (isBox(ctx, obj)) res = boxlock(ctx, obj, otyp) ? 1 : 0;
      learnIt = res !== 0;
      break;
    default:
      break;
  }
  if (learnIt) learn(ctx, src);
  return res;
}

/** ref: src/zap.c bhitpile(): every object on the square; the number affected */
function bhitpile(ctx: Ctx, src: ZapSource, x: number, y: number): number {
  let hit = 0;
  for (const o of itemsAt(ctx.defs, ctx.state, heroPos(ctx).level, x, y)) {
    if (!ctx.state.entities[String(o.id)]) continue;
    hit += bhito(ctx, o, src, x, y);
  }
  return hit;
}

/**
 * The beam of an immediate wand: rn1(8, 6) squares, each monster on the way is hit (costing 3
 * of the range), then the objects; doors are opened, locked or broken, and the beam stops at a
 * wall or closed door. ref: src/zap.c bhit() with ZAPPED_WAND, zap_map() (probing only)
 */
function bhit(ctx: Ctx, src: ZapSource, dir: Dir): void {
  const level = levelOf(ctx);
  const otyp = otypOf(src);
  const d = DIRS[dir];
  let range = ctx.rng.rn2(8) + 6;
  let { x, y } = heroPos(ctx);
  while (range-- > 0) {
    x += d.x;
    y += d.y;
    if (!inBounds(level, x, y)) break;
    // zap_map(): probing maps the square and reveals a secret door
    if (otyp === WAN.probing && isSdoor(cellId(level, x, y))) {
      const locked =
        cellId(level, x, y) === T.sdoor_locked_v || cellId(level, x, y) === T.sdoor_locked_h;
      setTerrain(level, x, y, locked ? T.door_locked : T.door_closed);
      if (cansee(ctx, x, y)) {
        say(ctx, 'zap.probe.sdoor');
        learn(ctx, src);
      }
    }
    const typIsSdoor = isSdoor(cellId(level, x, y));
    const before = terrainAt(ctx, level, x, y);
    const mon = monAt(ctx, x, y);
    if (mon) {
      bhitm(ctx, mon, src, { x, y });
      if (ctx.state.gameOver) return;
      range -= 3;
    }
    if (bhitpile(ctx, src, x, y)) range--;
    if (
      (before.door !== undefined || typIsSdoor) &&
      (otyp === WAN.opening ||
        otyp === WAN.locking ||
        otyp === WAN.striking ||
        otyp === SPE.forceBolt) &&
      doorlock(ctx, otyp, x, y) &&
      (cansee(ctx, x, y) || otyp === WAN.striking)
    )
      learn(ctx, src);
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
function zapnodir(ctx: Ctx, src: ZapSource): void {
  let known = false;
  switch (otypOf(src)) {
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
  if (known) learn(ctx, src);
}

/**
 * The hero's wand or spell ray from her square. ref: src/zap.c ubuzz() for type 0..9 and
 * 10..19 (`spell`: the book)
 */
function buzz(ctx: Ctx, ray: Ray, nd: number, dir: Dir, spell: DefId | null): void {
  buzzFrom(
    ctx,
    ray,
    nd,
    heroPos(ctx),
    dir,
    spell ? { by: 'hero', spell, wakeup } : { by: 'hero', wakeup },
  );
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
function zapyourself(ctx: Ctx, src: ZapSource): number {
  const h = hero(ctx);
  let learnIt = false;
  let damage = 0;
  const otyp = otypOf(src);
  switch (otyp) {
    case WAN.striking:
    case SPE.forceBolt:
      learnIt = true;
      if (antimagic(ctx)) say(ctx, 'zap.boing');
      else {
        say(ctx, 'zap.self.bash');
        damage = ctx.rng.d(2, 12);
      }
      break;
    case WAN.lightning: {
      learnIt = true;
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
      learnIt = true;
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
      learnIt = true;
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
      learnIt = true;
      if (antimagic(ctx)) say(ctx, 'zap.self.missiles_bounce');
      else {
        damage = ctx.rng.d(4, 6);
        say(ctx, 'zap.self.idiot');
      }
      break;
    case WAN.speed:
      // no longer gives intrinsic, but gives very fast speed instead
      speedUp(ctx, ctx.rng.rn2(25) + 50);
      learnIt = true;
      break;
    case WAN.sleep:
    case SPE.sleep:
      learnIt = true;
      if (hasProp(h, P.SLEEP_RES)) say(ctx, 'zap.self.not_sleepy');
      else {
        say(ctx, 'zap.self.sleep_ray');
        nomulNow(ctx, ctx.rng.rnd(50), 'helpless.asleep', { key: 'eat.wake_up' }); // fall_asleep()
      }
      break;
    case SPE.healing:
      learnIt = true; // (no effect for spells...)
      healup(ctx, ctx.rng.d(6, 4), 0, false, src.kind === 'spell' && src.blessed);
      say(ctx, 'zap.self.feel_better');
      break;
    case WAN.slow:
      if (hasIntrinsic(h, P.FAST) || timeoutLeft(ctx.state, h, P.FAST) > 0) {
        learnIt = true;
        uSlowDown(ctx);
      }
      break;
    case WAN.opening:
      if (ustuck(ctx) !== null) {
        releaseHold(ctx);
        learnIt = true;
      }
      // invent is hit iff hero doesn't escape from a trap
      {
        const r = utrap(ctx) ? openholdingtrap(ctx, null) : { done: false, noticed: false };
        learnIt ||= r.noticed;
        if (!r.done) {
          boxlockInvent(ctx, otyp);
          learnIt ||= openfallingtrap(ctx, null).noticed; // trigger previously escaped trapdoor
        }
      }
      break;
    case WAN.locking: {
      // similar logic to opening; invent is hit iff no trap triggered
      const r = utrap(ctx) ? { done: false, noticed: false } : closeholdingtrap(ctx, null);
      learnIt ||= r.noticed;
      if (utrap(ctx) || !r.done) boxlockInvent(ctx, otyp);
      break;
    }
    case WAN.probing:
      learnIt = true;
      ustatusline(ctx);
      break;
    case WAN.nothing:
    default:
      break;
  }
  if (learnIt) learn(ctx, src);
  return damage;
}

// ---------------------------------------------------------------------------------------------
// weffects() and the z command

/**
 * The effect of zapping a wand or casting a directional spell. `dir` is a direction, 'self' or
 * null for a directionless one. ref: src/zap.c weffects(); zapyourself() for 'self' (with the
 * losehp() of dozap() and spelleffects(): "zapped herself with a spell"); a spell's ray has
 * `u.ulevel / 2 + 1` dice
 */
export function weffectsFrom(ctx: Ctx, src: ZapSource, dir: Dir | 'self' | null): void {
  const otyp = otypOf(src);
  const kind =
    src.kind === 'wand'
      ? (ctx.defs.object(otyp).wand?.dir ?? 'nodir')
      : (SPELL_INFO[otyp]?.dir ?? 'nodir');
  if (kind === 'nodir' || dir === null) {
    zapnodir(ctx, src);
    return;
  }
  if (dir === 'self') {
    const damage = zapyourself(ctx, src);
    if (damage && !ctx.state.gameOver)
      losehp(
        ctx,
        damage,
        src.kind === 'spell'
          ? '@killer.zap.self.spell'
          : (SELF_KILLER[otyp] ?? '@killer.zap.self.striking'),
      );
    return;
  }
  if (kind === 'immediate') {
    bhit(ctx, src, dir);
    return;
  }
  const ray = RAY_OF[otyp];
  if (!ray) return;
  learn(ctx, src); // disclose: a ray is always seen
  if (src.kind === 'spell')
    buzz(ctx, ray, Math.trunc((hero(ctx).c.experience?.level ?? 1) / 2) + 1, dir, otyp);
  else buzz(ctx, ray, otyp === WAN.magicMissile ? 2 : 6, dir, null);
}

/**
 * The effect of zapping a wand of the subset (ObjectDef.zap): {@link weffectsFrom} with the wand.
 */
export function weffects(ctx: Ctx, user: EntityId, item: EntityId, dir: Dir | 'self' | null): void {
  const wand = ent(ctx, item);
  if (!wand || user !== ctx.state.playerId) return; // monsters don't zap yet
  weffectsFrom(ctx, { kind: 'wand', item: wand }, dir);
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
export const ZAP_DIRECTIONS: readonly PromptOption[] = [
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
    checkUnpaid(ctx, wand); // ref: dozap(): check_unpaid(obj), a usage fee in a shop
    const needDir = ctx.defs.object(wand.def).wand?.dir !== 'nodir';
    if (!zappable(ctx, wand)) {
      say(ctx, 'zap.nothing_happens');
    } else if (wand.c.item?.buc === 'cursed' && !ctx.rng.rn2(WAND_BACKFIRE_CHANCE)) {
      backfire(ctx, wand); // the wand blows up in your face!
      return NORMAL_SPEED;
    } else if (needDir) {
      // getdir(): the charge is already spent
      ctx.ask(
        {
          id: 'zap-direction',
          kind: 'direction',
          key: 'zap.direction',
          options: [...ZAP_DIRECTIONS],
        },
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
