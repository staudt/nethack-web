// Wands: zapping (z), immediate beams, rays with bounce and reflection, and zapping yourself;
// the directional spells (force bolt, sleep, healing) go through the same code with a spell
// source (C's pseudo spellbook object). ref: src/zap.c dozap(), zappable(), backfire(), weffects(), zapnodir(), bhit(), bhitm(),
// bhito(), bhitpile(), zapyourself(), learnwand(), probe_monster(), cancel_monst(), cancel_item(),
// resist(), dobuzz(), zhitm(), zhitu(), zap_hit(), bounce_dir(), zap_over_floor(), burn_floor_objects(),
// flashburn(); src/lock.c doorlock(), boxlock(), obstructed(); src/trap.c openholdingtrap(),
// closeholdingtrap(), openfallingtrap(); src/detect.c findit(), findone(); src/makemon.c
// create_critters(); src/mhitm.c sleep_monst(), slept_monst();
// src/potion.c speed_up(); src/mhitu.c u_slow_down() (mon_adjust_speed() is in mstate.ts)
//
// Teleportation: monsters (u_teleport_mon()), objects (rloco.ts) and the zapper (tele()); the
// wand of stasis stops it on the level for a while (teleport.ts setStasis()).
// Digging (dig.ts zapDig()) and zapping up or down (zap_updown(): probing, opening, locking and
// striking at what is under her, then the objects there; rays hit her own square).
// Wishing (makewish() through wish.ts; the prompt's answer comes back to the zap action), the
// death ray (buzz.ts), cancellation of monsters (`mcan`, mstate.ts), objects and the hero
// (cancel_monst(), cancel_item()). Undead turning hurts undead and revives corpses (revive.ts
// revive(), unturnDead()); enlightenment shows the attribute list (enlightenment.ts).
//
// Not ported (see DEVIATIONS.md): engraving, breaking (applying) wands, the wands
// outside the subset, monster reflection (no monster can reflect yet), lightning blinding
// monsters, the Deaf/Half_spell_damage/steed/engulfing cases, mimics, shops,
// drawbridges, the ray animation. Striking and force bolt break statues
// (statue.ts breakStatue()) or set off a statue trap under them; probing lists what a statue
// holds. Stone to flesh (stoneflesh.ts) turns stone objects to meat and statues to monsters,
// cures her stoning and hits her pack when cast at herself (no golems or mimics to affect).
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  cellRules,
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
import { breaktest } from './material';
import { setTerrain } from './actions';
import { doorTrapped } from './btrapstate';
import { blowDoor, mbTrapped, unaware } from './btrapped';
import { BOULDER, blockersOf, fractureRock } from './boulder';
import { activateStatueTrap, breakStatue } from './statue';
import { stoneToFleshObj } from './stoneflesh';
import { STATUE } from './statuestate';
import { clearPath } from './clearpath';
import { destroyItems, erodeArmor } from './erode';
import { igniteItems } from './light';
import { makemon } from './generation';
import { mRespond } from './mrespond';
import { confdir, getdirImpaired, setUstuck, uMaybeImpaired, ustuck } from './hackmove';
import { digests, engulfingU, isSwallowed, uswallow } from './engulfstate';
import { expels } from './engulf';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { checkCapacity, useupall } from './magic';
import { heroSees, minvent } from './mongear';
import { isCancelled, isFrozen, monAdjustSpeed, mspeed, setCancelled } from './mstate';
import { wakeNearto } from './noise';
import { discover, isKnown } from './o_init';
import { moreExperienced } from './urexp';
import { doname, xnameOf } from './objnam';
import { wakeup } from './peaceful';
import {
  buzzFrom,
  flashburn,
  resist,
  resistsMagm,
  sleepMonst,
  sleptMonst,
  wakeGently,
  type Ray,
} from './buzz';
import { explode } from './explode';
import { eshkOf, inAnyShop } from './eshk';
import { setmangry } from './peaceful';
import { adjalign, uState } from './luck';
import { polyself } from './polyself';
import { healup } from './potion';
import { canSpotMon, monNam, rndmonnam } from './perception';
import { P, hasIntrinsic, hasProp, incrItimeout, timeoutLeft, uSlowDown, wornIn } from './props';
import { ceilingKey, clearArea, litroom } from './read';
import { rockOnHead, surfaceKey, zapDig } from './dig';
import { SPELL_INFO, spellDamageBonus } from './spellcalc';
import { findAc, findMac } from './stats';
import { T } from './terrain';
import { rloco } from './rloco';
import { rewardUntrap } from './untrap';
import { TRAP, dotrap, isMagicalTrap, mintrap, tele, teleControlled, uTeleportMon } from './trap';
import { setStasis } from './teleport';
import { isMtrapped, levitating, setMtrapped, setUtrap, utrap } from './trapstate';
import { fixPetrification, isStoned } from './stonestate';
import { merged } from './items';
import { checkUnpaid, costlyAlteration } from './shk';
import { payForDamage } from './shkpay';
import { SHOP_DOOR_COST, addDamage, addShopDamage } from './shopdamage';
import { askWish, answerWish, type WishData } from './wish';
import { luckOf } from './luck';
import { abon, acurrClamp, addAbon, type Attr } from './attrib';
import { BLANK_PAPER } from './spell';
import { done } from './end';
import { monflee } from './monflee';
import { cxnameSingular, revive, unturnDead } from './revive';
import { doEnlightenmentEffect } from './enlightenment';
import {
  canseemon,
  heroInvisBlocked,
  heroInvisible,
  knownInvisible,
  mapInvisible,
  markedUnseen,
  monInvisible,
  selfInvisMessage,
  setMinvis,
  unmapInvisible,
} from './invis';

export const ZAP_ID: DefId = 'nh:zap';

/** The wands of the subset. ref: include/objects.h WAND() */
export const WAN = {
  light: 'nh:wand_of_light',
  secretDoor: 'nh:wand_of_secret_door_detection',
  enlightenment: 'nh:wand_of_enlightenment',
  createMonster: 'nh:wand_of_create_monster',
  wishing: 'nh:wand_of_wishing',
  stasis: 'nh:wand_of_stasis',
  nothing: 'nh:wand_of_nothing',
  striking: 'nh:wand_of_striking',
  makeInvisible: 'nh:wand_of_make_invisible',
  slow: 'nh:wand_of_slow_monster',
  speed: 'nh:wand_of_speed_monster',
  undeadTurning: 'nh:wand_of_undead_turning',
  polymorph: 'nh:wand_of_polymorph',
  cancellation: 'nh:wand_of_cancellation',
  teleportation: 'nh:wand_of_teleportation',
  opening: 'nh:wand_of_opening',
  locking: 'nh:wand_of_locking',
  probing: 'nh:wand_of_probing',
  digging: 'nh:wand_of_digging',
  magicMissile: 'nh:wand_of_magic_missile',
  fire: 'nh:wand_of_fire',
  cold: 'nh:wand_of_cold',
  sleep: 'nh:wand_of_sleep',
  death: 'nh:wand_of_death',
  lightning: 'nh:wand_of_lightning',
} as const;

/** The directional spells that zap like wands. ref: include/objects.h SPELL() */
export const SPE = {
  forceBolt: 'nh:spellbook_of_force_bolt',
  sleep: 'nh:spellbook_of_sleep',
  healing: 'nh:spellbook_of_healing',
  stoneToFlesh: 'nh:spellbook_of_stone_to_flesh',
  polymorph: 'nh:spellbook_of_polymorph',
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
  [WAN.death]: 'death',
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
/** The objects at (x, y) of the hero's level. */
const itemsHere = (ctx: Ctx, x: number, y: number): Entity[] =>
  itemsAt(ctx.defs, ctx.state, heroPos(ctx).level, x, y);
const CORPSE: DefId = 'nh:corpse';
/**
 * Corpses left by undead the current zap destroyed: the same zap does not revive them.
 * ref: context.bypasses, obj->bypass (cleared when each zap starts; never part of the state)
 */
const bypassed = new Set<EntityId>();
/** A new zap (or a wand breaking) starts: no corpse is bypassed. ref: clear_bypasses() */
export function clearBypasses(): void {
  bypassed.clear();
}
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
 * learn(), with 10 points of score when the wand's type was unknown: zapnodir()'s `known` and
 * weffects()' `disclose` with `was_unkn`. ref: src/zap.c zapnodir(), weffects()
 */
function learnScored(ctx: Ctx, src: ZapSource): void {
  if (src.kind === 'wand' && !isKnown(ctx.state, ctx.defs, src.item.def))
    moreExperienced(ctx, 0, 10);
  learn(ctx, src);
}

/** ref: src/potion.c speed_up() */
function speedUp(ctx: Ctx, duration: number): void {
  const h = hero(ctx);
  if (timeoutLeft(ctx.state, h, P.FAST) <= 0)
    say(ctx, hasIntrinsic(h, P.FAST) ? 'zap.speed.faster' : 'zap.speed.much_faster');
  else say(ctx, 'zap.speed.legs');
  incrItimeout(ctx.state, h, P.FAST, duration);
}

// ---------------------------------------------------------------------------------------------
// traps that hold or drop their victim

/**
 * ref: src/trap.c openholdingtrap(): frees the hero from a bear trap, web or pit, a monster from a
 * bear trap or web (an adjacent one may be grateful, 1 in 2: reward_untrap())
 */
function openholdingtrap(ctx: Ctx, mon: Entity | null): { done: boolean; noticed: boolean } {
  if (!mon) {
    const u = utrap(ctx);
    if (!u) return { done: false, noticed: false };
    // defsyms[S_web], [S_pit] or [S_bear_trap].explanation: "pit" even for a spiked pit
    say(ctx, 'zap.you_released_trap', {
      trap: `@${u.type === 'web' ? TRAP.web : u.type === 'pit' ? TRAP.pit : TRAP.bear}`,
    });
    setUtrap(ctx, 0, u.type); // reset_utrap()
    return { done: true, noticed: true };
  }
  const p = mon.c.pos;
  const t = p ? trapHere(levelOf(ctx), p.x, p.y) : undefined;
  if (!t || (t.def !== TRAP.bear && t.def !== TRAP.web) || !isMtrapped(ctx, mon.id))
    return { done: false, noticed: false };
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
    say(ctx, t.def === TRAP.web ? 'zap.something_released' : 'zap.trap_opens', {
      trap: `@${t.def}`,
    });
  }
  // might pacify monster if adjacent
  const hp = heroPos(ctx);
  if (ctx.rng.rn2(2) && p && Math.max(Math.abs(p.x - hp.x), Math.abs(p.y - hp.y)) <= 1)
    rewardUntrap(ctx, t, mon);
  return { done: true, noticed };
}

/** ref: src/trap.c closeholdingtrap(): a bear trap or web here catches the hero or monster */
function closeholdingtrap(ctx: Ctx, mon: Entity | null): { done: boolean; noticed: boolean } {
  const p = mon ? mon.c.pos : heroPos(ctx);
  const t = p ? trapHere(levelOf(ctx), p.x, p.y) : undefined;
  if (!t || (t.def !== TRAP.bear && t.def !== TRAP.web)) return { done: false, noticed: false };
  if (!mon) {
    if (utrap(ctx)) return { done: false, noticed: false };
    dotrap(ctx, t, { force: true });
    return { done: utrap(ctx) !== null, noticed: true };
  }
  if (isMtrapped(ctx, mon.id)) return { done: false, noticed: false };
  const noticed = cansee(ctx, t.x, t.y) || canSpotMon(ctx, mon);
  return { done: mintrap(ctx, mon.id, { force: true }) !== 'finished', noticed };
}

/**
 * ref: src/trap.c openfallingtrap(): a trap door (or rock trap) opens; with `trapdoorOnly` false
 * (a down zap) a hole or pit goes off too
 */
function openfallingtrap(
  ctx: Ctx,
  mon: Entity | null,
  trapdoorOnly = true,
): { done: boolean; noticed: boolean } {
  const p = mon ? mon.c.pos : heroPos(ctx);
  const t = p ? trapHere(levelOf(ctx), p.x, p.y) : undefined;
  if (
    !t ||
    (t.def !== TRAP.trapdoor &&
      t.def !== TRAP.rock &&
      (trapdoorOnly || (t.def !== TRAP.hole && t.def !== TRAP.pit && t.def !== TRAP.spikedPit)))
  )
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

/**
 * ref: src/zap.c release_hold(): an engulfer opens up ("The purple worm opens its mouth!" for a
 * digester) and lets her out; a holder lets go (the hero is never sticky here)
 */
export function releaseHold(ctx: Ctx): void {
  const id = ustuck(ctx);
  const mon = id === null ? undefined : ent(ctx, id);
  if (mon && isSwallowed(ctx)) {
    if (digests(ctx.defs.monster(mon.def))) {
      if (!hasProp(hero(ctx), P.BLINDED)) say(ctx, 'zap.opens_mouth', { mon: monNam(ctx, mon) });
      else say(ctx, 'zap.rush_of_air');
    }
    // gives "you get regurgitated" or "you get expelled from <mon>"
    expels(ctx, mon, true);
    return;
  }
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
  if (monInvisible(ctx, mon)) flags.push('invisible');
  if (isCancelled(ctx, mon.id)) flags.push('cancelled');
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
  if (heroInvisible(ctx.state)) flags.push('invisible');
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
 * ref: src/lock.c doorlock(). A doorway stands for both D_NODOOR and D_BROKEN; a trapped door
 * struck blows up (mb_trapped() on a monster in it); a shop door destroyed is damage to repair
 * (`add_damage(x, y, 0L)`). 'broken': struck open (D_BROKEN), which bhit() charges for.
 */
function doorlock(ctx: Ctx, otyp: DefId, x: number, y: number): boolean | 'broken' {
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
  let res: boolean | 'broken' = true;
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
    if ((t.door === 'locked' || t.door === 'closed') && doorTrapped(ctx, level.id, x, y)) {
      const mon = monAt(ctx, x, y);
      const sawit = mon ? canseemon(ctx, mon) : cansee(ctx, x, y);
      blowDoor(ctx, level, x, y, 0); // D_NODOOR; door was destroyed
      const seeit = mon ? canseemon(ctx, mon) : cansee(ctx, x, y);
      if (mon)
        mbTrapped(ctx, mon, sawit || seeit); // its own wake_nearto()
      else {
        // flags.verbose
        if ((sawit || seeit) && !unaware(ctx)) say(ctx, 'btrap.see_door_explode');
        else {
          const hp = getPlayer(ctx.state).c.pos;
          const d2 = hp ? (hp.x - x) ** 2 + (hp.y - y) ** 2 : 0;
          say(ctx, d2 > 7 * 7 ? 'btrap.hear_distant' : 'btrap.hear_nearby');
        }
        wakeNearto(ctx, x, y, 40); // loudness 40
      }
    } else if (t.door === 'locked' || t.door === 'closed') {
      const sawit = cansee(ctx, x, y);
      addShopDamage(ctx, x, y, 0); // door was destroyed
      setTerrain(level, x, y, T.doorway); // D_BROKEN
      res = 'broken';
      ctx.emit({ type: 'doorOpened', pos: { x, y } });
      say(ctx, sawit ? 'zap.door.crashes_open' : 'zap.door.crashing_sound');
      wakeNearto(ctx, x, y, 20);
    } else res = false;
  }
  if (msg && cansee(ctx, x, y)) say(ctx, msg);
  return res;
}

// ---------------------------------------------------------------------------------------------
// broken wands (breakwand.ts): the charges, the flash, magical traps blowing up

/** The wand's charges (a spell has none). */
const speOf = (src: ZapSource): number => (src.kind === 'wand' ? (src.item.c.item?.spe ?? 0) : 0);

/**
 * A broken wand of light flashes at the monster: a sleeper with eyes wakes ("The flash awakens
 * X."), one that can see is blinded (only the message: monster blindness is not modelled),
 * angered, and may flee when within dist2 9; true when the hero noticed something.
 * ref: src/uhitm.c flash_hits_mon() (no mimics, gremlins or Sunsword), src/mondata.c
 * resists_blnd()
 */
function flashHitsMon(ctx: Ctx, mon: Entity): boolean {
  const m = mon.c.monster;
  const p = mon.c.pos;
  if (!m || !p) return false;
  const def = ctx.defs.monster(mon.def);
  const useeit = canseemon(ctx, mon);
  const haseyes = !def.flags.includes('noeyes');
  if (m.asleep && haseyes) {
    m.asleep = false;
    if (!useeit) return false;
    say(ctx, 'zap.flash_awakens', { mon: monNam(ctx, mon) });
    return true;
  }
  if (def.glyph.ch === 'y') return false; // S_LIGHT
  const resistsBlnd =
    !haseyes ||
    m.asleep === true ||
    def.attacks.some((a) => a.ad === 'blnd' && (a.at === 'explode' || a.at === 'gaze'));
  if (resistsBlnd) {
    if (useeit) {
      const level = levelOf(ctx);
      say(ctx, level.lit[cellIndex(level, p.x, p.y)] ? 'zap.flash_shines' : 'zap.illuminated', {
        mon: monNam(ctx, mon),
      });
    }
    return false;
  }
  const hp = heroPos(ctx);
  const tmp = (hp.x - p.x) ** 2 + (hp.y - p.y) ** 2;
  if (useeit) say(ctx, 'zap.blinded_by_flash', { mon: monNam(ctx, mon) });
  if (alive(ctx, mon.id)) {
    setmangry(ctx, mon.id); // !context.mon_moving
    if (tmp < 9 && !eshkOf(ctx, mon.id) && ctx.rng.rn2(4))
      monflee(ctx, mon.id, ctx.rng.rn2(4) ? ctx.rng.rnd(100) : 0, false, true);
    // mcansee = 0, mblinded = ...: monster blindness is not modelled
  }
  return useeit;
}

/**
 * A cancellation beam hits a magical trap: it explodes (`20 + d(3, 6)`, a magical blast she
 * gets the blame for) and is gone; the wand is learned when she saw it. ref: src/zap.c
 * maybe_explode_trap() (no magic portals or vibrating squares: undestroyable_trap())
 */
function maybeExplodeTrap(ctx: Ctx, src: ZapSource, x: number, y: number): void {
  if (otypOf(src) !== WAN.cancellation) return; // (no spell of cancellation yet)
  const level = levelOf(ctx);
  const ttmp = trapHere(level, x, y);
  if (!ttmp || !isMagicalTrap(ttmp.def)) return;
  const seeit = cansee(ctx, x, y);
  // note: this explosion mustn't destroy the wand
  explode(ctx, x, y, { trap: true, by: 'hero' }, 20 + ctx.rng.d(3, 6), 'magical');
  if (ctx.state.gameOver) return;
  ctx.removeTrap(level.id, { x, y }); // deltrap()
  if (seeit) learn(ctx, src);
}

// ---------------------------------------------------------------------------------------------
// immediate wands: bhit(), bhitm(), bhito(), bhitpile()

/**
 * ref: src/zap.c bhitm(): the monster is hit by the wand's or spell's effect. No Pestilence or
 * monster blindness exist (healing never hurts and cures no blindness).
 */
export function bhitm(ctx: Ctx, mon: Entity, src: ZapSource, at: Pos): void {
  let wake = true;
  let helpful = false;
  let learnIt = false;
  let revealInvis = false;
  const otyp = otypOf(src);
  const oclass = src.kind;
  switch (otyp) {
    case WAN.striking:
    case SPE.forceBolt:
      revealInvis = true;
      learnIt = cansee(ctx, at.x, at.y);
      if (resistsMagm(ctx, mon)) {
        say(ctx, 'zap.boing');
      } else if (isSwallowed(ctx) || ctx.rng.rnd(20) < 10 + findMac(ctx.state, ctx.defs, mon.id)) {
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
      revealInvis = true;
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
    case WAN.makeInvisible: {
      const oldinvis = monInvisible(ctx, mon);
      const couldsee = canseemon(ctx, mon);
      // format the monster's name before altering its visibility
      const nam = monNam(ctx, mon);
      setMinvis(ctx, mon, false);
      if (!oldinvis && knownInvisible(ctx, mon)) {
        say(ctx, 'zap.turns_transparent', { mon: nam });
        revealInvis = true;
        learnIt = true;
      } else if (couldsee && !canseemon(ctx, mon)) {
        // the same message as a teleported monster ending up out of sight: ambiguous
        say(ctx, 'tele.mon_vanishes', { mon: nam });
      }
      break;
    }
    case WAN.slow:
      if (!resist(ctx, mon, 0)) monAdjustSpeed(ctx, mon, -1, () => learn(ctx, src));
      break;
    case WAN.speed:
      if (!resist(ctx, mon, 0)) monAdjustSpeed(ctx, mon, 1, () => learn(ctx, src));
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
      revealInvis = true;
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
    case WAN.cancellation:
      cancelMonst(ctx, mon, src, true, false);
      break;
    case WAN.undeadTurning: {
      wake = false;
      if (unturnDead(ctx, mon)) wake = true;
      const mdat = ctx.defs.monster(mon.def);
      if (mdat.flags.includes('undead')) {
        // (no vampshifters; no Knight's quest artifact doubling; no turn undead spell yet)
        revealInvis = true;
        wake = true;
        const dmg = ctx.rng.rnd(8);
        // context.bypasses: a corpse it leaves is not revived by this same zap
        const before = new Set(itemsHere(ctx, at.x, at.y).map((o) => o.id));
        const resisted = resist(ctx, mon, dmg, oclass);
        for (const o of itemsHere(ctx, at.x, at.y)) if (!before.has(o.id)) bypassed.add(o.id);
        if (!resisted && alive(ctx, mon.id)) monflee(ctx, mon.id, 0, false, true);
      }
      break;
    }
    case WAN.teleportation:
      // the wand is known if the monster is seen where it lands (or stays)
      revealInvis = !uTeleportMon(ctx, mon, true);
      learnIt = canSpotMon(ctx, mon);
      break;
    case WAN.light: // (broken wand)
      if (flashHitsMon(ctx, mon)) {
        learnIt = true;
        revealInvis = true;
      }
      break;
    case WAN.sleep: {
      // (broken wand) wakeup() doesn't rouse victims of temporary sleep, so `wake` stays
      const spe = src.kind === 'wand' ? (src.item.c.item?.spe ?? 0) : 0;
      revealInvis = true;
      if (sleepMonst(ctx, mon, ctx.rng.d(1 + spe, 12), 'wand')) sleptMonst(ctx, mon);
      if (!blind(ctx)) learnIt = true;
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
    mRespond(ctx, mon);
  }
  // reveal_invis: a monster she can't spot on a square she sees, hit by something noticeable,
  // is remembered as `I` (never the engulfer: `if (engulfing_u(mtmp)) reveal_invis = FALSE`)
  if (revealInvis && alive(ctx, mon.id) && !engulfingU(ctx, mon.id)) {
    if (cansee(ctx, at.x, at.y) && !canSpotMon(ctx, mon)) mapInvisible(ctx, at.x, at.y);
  }
  if (learnIt) learn(ctx, src);
}

/** ref: src/zap.c bhito() for a floor object; returns 1 when it was affected */
function bhito(ctx: Ctx, obj: Entity, src: ZapSource, x: number, y: number): number {
  let res = 0;
  let learnIt = false;
  const otyp = otypOf(src);
  switch (otyp) {
    case WAN.probing:
      // only containers and statues tell anything new (every object is dknown here)
      if (isContainer(ctx.defs, obj) || obj.def === STATUE) {
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
      // the boulder falls apart (seen or heard: no deafness, so the wand is always learned)
      if (obj.def === BOULDER) {
        say(ctx, cansee(ctx, x, y) ? 'zap.boulder_falls_apart' : 'zap.hear_crumbling');
        fractureRock(ctx, obj, true);
        learnIt = true;
        res = 1;
        break;
      }
      if (obj.def === STATUE) {
        // "The statue shatters." (a hallucinating hero sees a random monster shatter)
        if (breakStatue(ctx, obj)) {
          if (!cansee(ctx, x, y)) say(ctx, 'zap.hear_crumbling');
          else if (hasProp(getPlayer(ctx.state), P.HALLUC))
            say(ctx, 'zap.mon_shatters', { mon: `@${rndmonnam(ctx)}` });
          else say(ctx, 'statue.shatters');
        }
        learnIt = true;
        res = 1;
        break;
      }
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
    case WAN.cancellation:
      cancelItem(ctx, obj);
      res = 1;
      break;
    case WAN.teleportation:
      rloco(ctx, obj);
      res = 1;
      break;
    case SPE.stoneToFlesh:
      res = stoneToFleshObj(ctx, obj);
      break;
    case WAN.undeadTurning: {
      // eggs: nothing hatches yet (revive_egg() not ported)
      if (obj.def !== CORPSE || bypassed.has(obj.id)) break;
      const corpsname = cxnameSingular(ctx, obj);
      // get corpse's location before revive() uses it up
      const r = revive(ctx, obj, true);
      if (!r) break; // no monster implies corpse was left intact
      res = 1;
      if (cansee(ctx, x, y)) {
        if (canSpotMon(ctx, r.mon)) {
          const tame = (r.mon.c.monster?.tame ?? 0) > 0;
          say(ctx, tame ? 'zap.resurrected_tame' : 'zap.resurrected', {
            mon: monNam(ctx, r.mon),
          });
          learnIt = true;
        } else {
          // saw corpse but don't see monster: placed at a different spot
          say(ctx, 'zap.corpse_disappears', { corpse: corpsname });
        }
      } else {
        // couldn't see corpse's location (no Healer to hear it revive)
        if (canSpotMon(ctx, r.mon)) say(ctx, 'zap.mon_appears', { mon: monNam(ctx, r.mon) });
      }
      break;
    }
    default:
      break;
  }
  if (learnIt) learn(ctx, src);
  return res;
}

/** ref: src/zap.c bhitpile(): every object on the square; the number affected */
export function bhitpile(ctx: Ctx, src: ZapSource, x: number, y: number): number {
  let hit = 0;
  const otyp = otypOf(src);
  if (otyp === WAN.striking || otyp === SPE.forceBolt) {
    // a statue trap there brings its statue to life before the pile is hit
    const levelId = heroPos(ctx).level;
    const t = trapHere(levelOf(ctx), x, y);
    if (t?.def === TRAP.statue && activateStatueTrap(ctx, levelId, t, true)) learn(ctx, src);
  }
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
  let shopdoor = false;
  while (range-- > 0) {
    x += d.x;
    y += d.y;
    if (!inBounds(level, x, y)) break;
    // zap_map(): cancellation blows up a magical trap
    maybeExplodeTrap(ctx, src, x, y);
    if (ctx.state.gameOver) return;
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
    } else if (otyp === WAN.probing && markedUnseen(ctx, x, y)) {
      // ref: bhit(): probing past a remembered `I` with nothing there forgets it
      unmapInvisible(ctx, x, y);
    }
    if (bhitpile(ctx, src, x, y)) range--;
    if (
      (before.door !== undefined || typIsSdoor) &&
      (otyp === WAN.opening ||
        otyp === WAN.locking ||
        otyp === WAN.striking ||
        otyp === SPE.forceBolt)
    ) {
      const res = doorlock(ctx, otyp, x, y);
      if (res && (cansee(ctx, x, y) || otyp === WAN.striking)) learn(ctx, src);
      if (res === 'broken' && inAnyShop(level, x, y)) {
        shopdoor = true;
        addDamage(ctx, x, y, SHOP_DOOR_COST);
      }
    }
    // the terrain read before the door handling decides (a secret door stops the beam)
    if (!zapPos(before) || closedDoor(terrainAt(ctx, level, x, y))) break;
  }
  if (shopdoor) payForDamage(ctx, 'destroy', false);
}

/** ref: include/rm.h IS_FURNITURE(): stairs, fountains, sinks and altars here */
function isFurniture(ctx: Ctx, level: Level, x: number, y: number): boolean {
  const t = terrainAt(ctx, level, x, y);
  return (
    t.stairs !== undefined || t.id === T.fountain || t.id === T.sink || t.id.startsWith('nh:altar_')
  );
}

/**
 * An immediate wand or spell zapped up or down; true when the hero learns what it is. Probing
 * probes the ceiling or the floor and the objects on it; opening down frees her from a bear trap
 * or pit, or sets off the trap door, hole or pit she stands on; locking down springs a bear
 * trap on her or turns a hole into a trap door; striking up dislodges a rock (2 times in 3),
 * down shatters a trap door into a hole she may fall through. Then a down zap hits the objects
 * under her (teleportation sends them away); stone to flesh bleeds from the ceiling or pools at
 * her feet when nothing lies there. ref: src/zap.c zap_updown() (no drawbridges,
 * engravings, quest stairs or hiding under objects)
 */
function zapUpdown(ctx: Ctx, src: ZapSource, dir: 'up' | 'down'): boolean {
  const otyp = otypOf(src);
  const level = levelOf(ctx);
  const { x, y } = heroPos(ctx);
  const ttmp = trapHere(level, x, y);
  const ceiling = (): Msg => ({ key: ceilingKey(ctx, level, x, y) });
  let disclose = false;
  switch (otyp) {
    case WAN.probing: {
      let ptmp = 0;
      if (dir === 'up') say(ctx, 'zap.probe_up', { ceiling: ceiling() });
      else {
        ptmp += bhitpile(ctx, src, x, y);
        // zap_map() has nothing to map under her; display_binventory(): nothing is buried
        if (isFurniture(ctx, level, x, y)) say(ctx, 'zap.probe_beneath_it');
        else say(ctx, 'zap.probe_beneath', { surface: surfaceKey(ctx, level, x, y) });
      }
      if (!ptmp) say(ctx, 'zap.probe_nothing');
      return true; // its own bhitpile
    }
    case WAN.opening:
      // down releases her from a bear trap or pit, or sets off a trap door, hole or pit
      if (dir === 'down') {
        if (utrap(ctx)) disclose = openholdingtrap(ctx, null).noticed || disclose;
        else disclose = openfallingtrap(ctx, null, false).noticed || disclose;
      }
      break;
    case SPE.stoneToFlesh:
      // (no air or water levels, no engravings)
      if (dir === 'up') say(ctx, 'zap.stf.blood_drips');
      else if (itemsHere(ctx, x, y).length === 0)
        say(ctx, levitating(ctx) ? 'zap.stf.blood_pools_beneath' : 'zap.stf.blood_pools');
      break;
    case WAN.striking:
    case SPE.forceBolt:
    case WAN.locking: {
      const striking = otyp !== WAN.locking;
      if (striking && dir === 'up' && ctx.rng.rn2(3)) {
        // similar to zap_dig()
        say(ctx, 'zap.rock_dislodged', { ceiling: ceiling() });
        rockOnHead(ctx, level, x, y);
      } else if (dir === 'down' && ttmp) {
        let held = false;
        if (!striking) {
          const r = closeholdingtrap(ctx, null);
          disclose = r.noticed || disclose;
          held = r.done; // now stuck in a bear trap
        }
        if (held) {
          // nothing more
        } else if (striking && ttmp.def === TRAP.trapdoor) {
          // striking transforms a trap door into a hole
          if (blind(ctx) && !ttmp.seen) say(ctx, 'zap.trapdoor_something_shatters');
          else if (!ttmp.seen) say(ctx, 'zap.trapdoor_found_shatters');
          else {
            say(ctx, 'zap.trapdoor_shatters');
            disclose = true;
          }
          ttmp.def = TRAP.hole;
          ttmp.seen = true;
          dotrap(ctx, ttmp); // might fall down the hole
        } else if (!striking && ttmp.def === TRAP.hole) {
          // locking transforms a hole into a trap door; she won't fall now
          ttmp.def = TRAP.trapdoor;
          if (blind(ctx) || !ttmp.seen) say(ctx, 'zap.dust_swirls');
          else {
            say(ctx, 'zap.trapdoor_appears');
            disclose = true;
          }
        }
      }
      break;
    }
    default:
      break;
  }
  // down: the objects at <x,y> of wherever she is now, as C does after a fall
  if (dir === 'down' && !ctx.state.gameOver) {
    bhitpile(ctx, src, x, y);
    // zap_map(): cancellation blows up the magical trap under her
    if (!ctx.state.gameOver) maybeExplodeTrap(ctx, src, x, y);
  }
  return disclose;
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
    // ("shouldn't successful 'find' reveal and activate statue traps?")
    if (t && !t.seen && t.def !== TRAP.statue) {
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
    case WAN.stasis:
      // no immediately obvious effect, and no message so that it isn't distinguishable from other
      // NODIR wands that produce no message; for multiple zaps, keep the longest duration
      setStasis(ctx, heroPos(ctx).level, ctx.state.turn + ctx.rng.rn2(21) + 10); // rn1(21, 10)
      break;
    case WAN.createMonster:
      if (createCritters(ctx, ctx.rng.rn2(23) !== 0 ? 1 : ctx.rng.rn2(7) + 2)) known = true;
      break;
    case WAN.wishing:
      if (luckOf(ctx.state) + ctx.rng.rn2(5) < 0) {
        say(ctx, 'zap.unfortunately');
        break;
      }
      // the wand of wishing asks what to wish for, so it always becomes discovered (objects are
      // always dknown here); makewish(): the answer comes back to the zap action's answer()
      known = true;
      if (src.kind === 'wand') {
        const data: ZapWishData = { tries: 0, wizard: false, wand: src.item.id };
        askWish(ctx, ZAP_ID, data);
      }
      break;
    case WAN.enlightenment:
      known = true; // objects are always dknown here
      // do_enlightenment_effect() always describes enlightenment
      doEnlightenmentEffect(ctx);
      break;
    default:
      break;
  }
  if (known) learnScored(ctx, src);
}

/** The wish in progress from a wand of wishing, with the wand to check for dust after it. */
interface ZapWishData extends WishData {
  wand: EntityId;
}

// ---------------------------------------------------------------------------------------------
// cancellation

/** The attribute bonus of a worn ring that cancel_item() takes away. ref: cancel_item() */
const RING_ATTR: Readonly<Record<string, Attr>> = {
  'nh:ring_of_gain_strength': 'str',
  'nh:ring_of_gain_constitution': 'con',
  'nh:ring_of_adornment': 'cha',
};

/**
 * Cancels an object: a worn ring's attribute bonus goes, a magic object (or an enchanted weapon,
 * armor or weapon-tool) loses its enchantment or charges (spe 0, or -1 "cancelled" for a wand),
 * scrolls become blank paper, spellbooks blank spellbooks, potions water (see invisible fruit
 * juice when it exists), and it is neither blessed nor cursed; a shop makes her pay for altering
 * its goods. ref: src/zap.c cancel_item() (no gauntlets of dexterity, helms of brilliance,
 * crystal balls, magic lamps, the Candelabrum, novels, potions of acid or sickness, or revive
 * timers in the subset; their cases are kept where they cost nothing), src/mkobj.c unbless(),
 * uncurse()
 */
export function cancelItem(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  const otyp = obj.def;
  const def = ctx.defs.object(otyp);
  const carried = it.carriedBy === ctx.state.playerId;
  // costly_alteration(): carried shop goods are billed, floor goods in a shop too
  const alter = (how: 'cancel' | 'uncurse' | 'unbless'): void => {
    if (carried) costlyAlteration(ctx, obj, how, null);
    else if (it.carriedBy === null && it.containedIn === undefined && obj.c.pos)
      costlyAlteration(ctx, obj, how, obj.c.pos);
  };
  if (carried) {
    // handle items being worn by hero
    const which = RING_ATTR[otyp];
    const a = hero(ctx).c.attributes;
    if (which && a && (it.equipped === 'ringL' || it.equipped === 'ringR')) {
      const base = a[which] - abon(ctx.state, which);
      addAbon(ctx, which, -it.spe);
      a[which] = acurrClamp(which, base + abon(ctx.state, which));
    }
  }
  // cancelled item might not be in hero's possession but cancellation is presumed to be
  // instigated by hero
  const weptool = def.class === 'tool' && def.weapon !== undefined;
  if (
    def.magic ||
    (it.spe && (def.class === 'armor' || def.class === 'weapon' || weptool)) ||
    otyp === 'nh:potion_of_acid' ||
    otyp === 'nh:potion_of_sickness' ||
    (otyp === POT_WATER && it.buc !== 'uncursed')
  ) {
    const cancelledSpe = def.class === 'wand' || otyp === 'nh:crystal_ball' ? -1 : 0;
    if (
      it.spe !== cancelledSpe &&
      otyp !== WAN.cancellation && // can't cancel cancellation
      otyp !== 'nh:magic_lamp' && // cancelling doesn't remove djinni
      otyp !== 'nh:candelabrum_of_invocation'
    ) {
      alter('cancel');
      it.spe = cancelledSpe;
    }
    switch (def.class) {
      case 'scroll':
        alter('cancel');
        obj.def = 'nh:scroll_of_blank_paper';
        it.spe = 0;
        break;
      case 'spellbook':
        if (otyp !== 'nh:spellbook_of_cancellation' && otyp !== 'nh:book_of_the_dead') {
          alter('cancel');
          obj.def = BLANK_PAPER;
        }
        break;
      case 'potion':
        alter(otyp !== POT_WATER ? 'cancel' : it.buc === 'cursed' ? 'uncurse' : 'unbless');
        if (
          (otyp === 'nh:potion_of_sickness' || otyp === 'nh:potion_of_see_invisible') &&
          ctx.defs.isObject('nh:potion_of_fruit_juice')
        )
          obj.def = 'nh:potion_of_fruit_juice';
        else obj.def = POT_WATER;
        break;
      default:
        break;
    }
  }
  // unbless(), uncurse(): Luck and weights follow from the state
  it.buc = 'uncursed';
}

/** ref: include/objects.h POT_WATER */
const POT_WATER: DefId = 'nh:potion_of_water';

/**
 * Cancels a monster, or the hero: it resists (resist() against the wand's class; the hero only
 * with magic resistance when someone else cancels her), else the inventory is cancelled first
 * when it zapped itself (`selfCancel`), and a monster is marked `mcan`. True when it did not
 * resist. ref: src/zap.c cancel_monst() (no polymorphed hero, shapeshifters, mimics or clay
 * golems)
 */
export function cancelMonst(
  ctx: Ctx,
  mdef: Entity | 'hero',
  src: ZapSource,
  youattack: boolean,
  selfCancel: boolean,
): boolean {
  const youdefend = mdef === 'hero';
  if (youdefend ? !youattack && antimagic(ctx) : resist(ctx, mdef, 0, src.kind)) return false;
  if (selfCancel) {
    // 1st cancel inventory (AC follows from find_ac())
    const owner = youdefend ? ctx.state.playerId : mdef.id;
    for (const o of inventoryOf(ctx.state, owner)) cancelItem(ctx, o);
  }
  // now handle special cases
  if (!youdefend) setCancelled(ctx, mdef.id);
  return true;
}

/**
 * The hero's wand or spell ray from her square. ref: src/zap.c ubuzz() for type 0..9 and
 * 10..19 (`spell`: the book)
 */
function buzz(ctx: Ctx, ray: Ray, nd: number, dir: Dir | 'up' | 'down', spell: DefId | null): void {
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

/**
 * ref: src/zap.c zapyourself(); `ordinary` false for a broken wand (striking hits for
 * `d(1 + spe, 6)` without "You bash yourself!", sleep says "You fall asleep!", light flashes).
 * Returns the damage to take.
 */
export function zapyourself(ctx: Ctx, src: ZapSource, ordinary = true): number {
  const h = hero(ctx);
  let learnIt = false;
  let damage = 0;
  const otyp = otypOf(src);
  switch (otyp) {
    case WAN.striking:
    case SPE.forceBolt:
      learnIt = true;
      if (antimagic(ctx)) say(ctx, 'zap.boing');
      else if (ordinary) {
        say(ctx, 'zap.self.bash');
        damage = ctx.rng.d(2, 12);
      } else damage = ctx.rng.d(1 + speOf(src), 6);
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
        say(ctx, ordinary ? 'zap.self.sleep_ray' : 'zap.self.fall_asleep');
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
    case WAN.makeInvisible: {
      // test before changing HInvis
      const msg = !heroInvisible(ctx.state) && !blind(ctx) && !heroInvisBlocked(ctx.state);
      if (heroInvisBlocked(ctx.state)) {
        // a mummy wrapping absorbs it and protects her
        const wrap = wornIn(ctx.state, h.id, 'cloak');
        if (wrap) say(ctx, 'zap.self.itchy', { item: xnameOf(ctx.state, ctx.defs, wrap) });
        break;
      }
      incrItimeout(ctx.state, h, P.INVIS, ctx.rng.rn2(15) + 31); // rn1(15, 31)
      if (msg) {
        learnIt = true;
        selfInvisMessage(ctx);
      }
      break;
    }
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
    case WAN.cancellation:
      cancelMonst(ctx, 'hero', src, true, true);
      break;
    case WAN.polymorph:
    case SPE.polymorph:
      if (!hasProp(h, P.UNCHANGING)) {
        learnIt = true;
        polyself(ctx);
      }
      break;
    case WAN.undeadTurning:
      learnIt = true;
      // unturn_you(): her carried corpses (a hero is never undead: no polymorph)
      unturnDead(ctx, 'hero');
      say(ctx, 'zap.self.shudder');
      break;
    case WAN.death:
      // a hero is never nonliving or a demon (no polymorph)
      say(ctx, 'zap.self.irradiate');
      say(ctx, 'zap.self.you_die');
      // they might survive with an amulet of life saving
      learn(ctx, src);
      done(ctx, '@killer.zap.self.death');
      return 0;
    case WAN.teleportation: {
      const was = { ...heroPos(ctx) };
      tele(ctx); // controlled: the cell is asked for after the zap
      // learned with control, or when she lands out of sight of where she was, or 4 or more
      // squares away
      const now = heroPos(ctx);
      const level = levelOf(ctx);
      const sight = clearPath(
        level,
        cellRules(level, ctx.defs).opaque,
        now.x,
        now.y,
        was.x,
        was.y,
        blockersOf(ctx, level.id),
      );
      if (teleControlled(ctx) || !sight || (now.x - was.x) ** 2 + (now.y - was.y) ** 2 >= 16)
        learnIt = true;
      break;
    }
    case WAN.light: {
      // (broken wand) lightdamage() hurts only a gremlin: no polymorph
      const dmg = ctx.rng.d(speOf(src), 25) + ctx.rng.rnd(25);
      if (!blind(ctx) && !h.c.helpless) learnIt = true; // flashburn() blinded her
      flashburn(ctx, dmg);
      break;
    }
    case SPE.stoneToFlesh: {
      // (no stone golem form)
      if (isStoned(ctx.state)) {
        learnIt = true;
        fixPetrification(ctx); // saved!
      }
      // but at a cost..
      const { x, y } = heroPos(ctx);
      for (const o of inventoryOf(ctx.state, h.id)) {
        if (!ent(ctx, o.id)) continue;
        if (bhito(ctx, o, src, x, y)) learnIt = true;
      }
      // it is possible that we can now merge some inventory (not worn items)
      let didmerge: boolean;
      do {
        didmerge = false;
        const inv = inventoryOf(ctx.state, h.id);
        for (let i = 0; !didmerge && i < inv.length; i++) {
          const a = inv[i];
          if (!a?.c.item || a.c.item.equipped !== null) continue;
          for (let j = i + 1; j < inv.length; j++) {
            const b = inv[j];
            if (b && merged(ctx, a, b)) {
              didmerge = true;
              break;
            }
          }
        }
      } while (didmerge);
      break;
    }
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
 * The effect of zapping a wand or casting a directional spell. `dir` is a direction, 'self',
 * 'up', 'down' or null for a directionless one. ref: src/zap.c weffects(); zapyourself() for
 * 'self' (with the losehp() of dozap() and spelleffects(): "zapped herself with a spell");
 * zap_updown() for an immediate one up or down; a spell's ray has `u.ulevel / 2 + 1` dice
 */
export function weffectsFrom(ctx: Ctx, src: ZapSource, dir: ZapDir | null): void {
  bypassed.clear();
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
    // ref: weffects(): `if (u.uswallow) (void) bhitm(u.ustuck, obj)`
    const sw = uswallow(ctx);
    const engulfer = sw ? ent(ctx, sw.mon) : undefined;
    if (engulfer?.c.pos) bhitm(ctx, engulfer, src, { x: engulfer.c.pos.x, y: engulfer.c.pos.y });
    else if (dir === 'up' || dir === 'down') {
      if (zapUpdown(ctx, src, dir)) learnScored(ctx, src);
    } else bhit(ctx, src, dir);
    return;
  }
  if (otyp === WAN.digging) {
    zapDig(ctx, dir);
    learnScored(ctx, src); // disclose
    return;
  }
  const ray = RAY_OF[otyp];
  if (!ray) return;
  learnScored(ctx, src); // disclose: a ray is always seen
  if (src.kind === 'spell')
    buzz(ctx, ray, Math.trunc((hero(ctx).c.experience?.level ?? 1) / 2) + 1, dir, otyp);
  else buzz(ctx, ray, otyp === WAN.magicMissile ? 2 : 6, dir, null);
}

/**
 * The effect of zapping a wand of the subset (ObjectDef.zap): {@link weffectsFrom} with the wand.
 */
export function weffects(ctx: Ctx, user: EntityId, item: EntityId, dir: ZapDir | null): void {
  const wand = ent(ctx, item);
  if (!wand || user !== ctx.state.playerId) return; // monsters don't zap yet
  weffectsFrom(ctx, { kind: 'wand', item: wand }, dir);
}

/** `zap` for every wand of the subset (attached to the defs in index.ts). */
export const WAND_ZAPS: Readonly<Record<string, NonNullable<ObjectDef['zap']>>> =
  Object.fromEntries(Object.values(WAN).map((id) => [id, weffects]));

/** ref: src/zap.c zappable(): uses a charge, maybe wresting the last one */
export function zappable(ctx: Ctx, wand: Entity): boolean {
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

/** A zap's direction: one of the eight, at herself ('.'), up ('<') or down ('>'). */
export type ZapDir = Dir | 'self' | 'up' | 'down';

/** The direction prompt of another mod's wand (ObjectDef.zap knows no up or down). */
const FLAT_DIRECTIONS: readonly PromptOption[] = [
  ...DIR_LIST.map((d) => ({ value: d, key: `dir.${d}` })),
  { value: 'self', key: 'zap.dir.self' },
];

/** The direction prompt: the eight directions, yourself ('.'), up ('<') and down ('>'). */
export const ZAP_DIRECTIONS: readonly PromptOption[] = [
  ...FLAT_DIRECTIONS,
  { value: 'up', key: 'zap.dir.up' },
  { value: 'down', key: 'zap.dir.down' },
];

/**
 * The answer to the direction prompt, impaired: a stunned (or 1 time in 5 confused) hero zaps a
 * random way, even when aiming at herself, but never when aiming up or down. Undefined when
 * the answer is no direction. ref: src/cmd.c getdir() `!u.dz && (Stunned || (Confusion &&
 * !rn2(5)))` -> confdir()
 */
export function zapDirOf(ctx: Ctx, value: Json): ZapDir | undefined {
  if (value === 'up' || value === 'down') return value;
  if (value === 'self') return uMaybeImpaired(ctx) ? confdir(ctx) : 'self';
  const d = DIR_LIST.find((x) => x === value);
  return d === undefined ? undefined : getdirImpaired(ctx, d);
}

/** Vanilla wands zap through weffects(), which knows up and down. */
const zapsUpDown = (ctx: Ctx, wand: Entity): boolean => ctx.defs.object(wand.def).zap === weffects;

/** Calls the wand's def zap (weffects for vanilla wands, which also take up and down). */
function doZapEffect(ctx: Ctx, wand: Entity, dir: ZapDir | null): void {
  const def = ctx.defs.object(wand.def);
  if (dir === 'up' || dir === 'down') {
    if (zapsUpDown(ctx, wand)) weffectsFrom(ctx, { kind: 'wand', item: wand }, dir);
    return;
  }
  if (def.zap) def.zap(ctx, ctx.state.playerId, wand.id, dir);
}

const isWishData = (raw: Json): raw is Json & ZapWishData =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) && typeof raw['wand'] === 'number';

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
          options: [...(zapsUpDown(ctx, wand) ? ZAP_DIRECTIONS : FLAT_DIRECTIONS)],
        },
        ZAP_ID,
        { item: wand.id },
      );
      return 0;
    } else {
      doZapEffect(ctx, wand, null);
      // a wand of wishing's prompt: the move is spent when it is answered
      if (ctx.state.pendingPrompt) return 0;
    }
    return afterZap(ctx, wand.id);
  },
  answer(ctx, value: Json, raw: Json) {
    if (isWishData(raw)) {
      answerWish(ctx, ZAP_ID, value, raw);
      if (ctx.state.pendingPrompt) return 0;
      if (ctx.state.gameOver) return NORMAL_SPEED;
      return afterZap(ctx, raw.wand);
    }
    const id = (raw as { item?: unknown } | null)?.item;
    const wand = heroItem(ctx, id);
    if (!wand) return NORMAL_SPEED;
    // getdir() -> confdir(): an impaired hero zaps in a random direction, even at herself
    const upDown = value === 'up' || value === 'down';
    const dir = upDown && !zapsUpDown(ctx, wand) ? undefined : zapDirOf(ctx, value);
    if (dir === undefined) {
      // "make him pay for knowing !NODIR"
      if (!blind(ctx)) say(ctx, 'zap.glows_fades', { item: xnameOf(ctx.state, ctx.defs, wand) });
      return afterZap(ctx, wand.id);
    }
    doZapEffect(ctx, wand, dir);
    if (ctx.state.gameOver) return NORMAL_SPEED;
    return afterZap(ctx, wand.id);
  },
};

export const ZAP_ACTIONS: readonly ActionDef[] = [zap];
