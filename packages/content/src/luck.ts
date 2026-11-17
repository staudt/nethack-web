// Luck and the alignment record. ref: src/attrib.c change_luck(), adjalign(); src/timeout.c
// nh_timeout() (Luck times out); src/makemon.c set_malign(); src/mon.c xkilled() (the penalties)
//
// The hero's `u.uluck`, `u.ualign` and the prayer counters live in `modData.nh.u`. `u.moreluck`
// (the luckstone bonus) is worked out from the inventory on every read (gem.ts moreluck()); the
// stored field stays 0. The alignment comes from the role and race at new game (align.ts
// uInitAlign()); Luck times out toward 0 unless a luckstone holds it (no full moon or Friday
// 13th: no clock).
import {
  getPlayer,
  type Ctx,
  type Entity,
  type GameState,
  type Json,
  type ModApi,
  type MonsterDef,
} from '@nh/core';
import { P, setIntrinsic, heroHas, wornIn } from './props';
import { A_NONE } from './aligntyp';
import { luckTimeout, moreluck } from './gem';
import { isMplayer, isUnicorn } from './mondata';
import { roleIs } from './urole';

/** ref: include/you.h LUCKMIN, LUCKMAX */
export const LUCKMIN = -10;
export const LUCKMAX = 10;

/**
 * The alignment the stored state defaults to: A_NEUTRAL, the default Valkyrie's (and the only
 * one games saved before m22 had). ref: include/align.h A_NEUTRAL
 */
export const HERO_ALIGN_TYPE = 0;

/** The parts of NetHack's `struct you` that Luck, alignment and prayer use. */
export interface UState {
  /** u.uluck */
  luck: number;
  /** Unused, always 0: u.moreluck is derived from the inventory (gem.ts moreluck()). */
  moreluck: number;
  /** u.ualign.type: -1 chaotic, 0 neutral, 1 lawful */
  alignType: number;
  /** u.ualign.record */
  alignRecord: number;
  /**
   * u.ualignbase[A_ORIGINAL], written only when not neutral: absent = HERO_ALIGN_TYPE (every
   * game saved before m22 was a neutral Valkyrie)
   */
  alignBase?: number;
  /**
   * u.ualignbase[A_CURRENT]: the alignment she was converted to on an altar (uchangealign()
   * A_CG_CONVERT), written only then: absent = the original one (`alignBase`)
   */
  alignCur?: number;
  /** u.ugifts: the artifacts (and crowning's spellbooks) the gods gave her (absent = 0) */
  ugifts?: number;
  /**
   * u.uevent.uhand_of_elbereth: crowned as the Hand of Elbereth (1, lawful), the Envoy of
   * Balance (2, neutral) or the Glory of Arioch (3, chaotic); absent = never crowned
   */
  uhandOfElbereth?: 1 | 2 | 3;
  /** u.ualign.abuse */
  alignAbuse: number;
  /** u.ugangr: god anger */
  ugangr: number;
  /** u.ublesscnt: prayer timeout (300 at the start) */
  ublesscnt: number;
  /** u.ublessed: divine protection */
  ublessed: number;
  /** u.ucleansed: the turn a temple donation last cleansed the alignment record (absent = 0) */
  ucleansed?: number;
  /** u.uinvulnerable: in the midst of a successful prayer */
  uinvulnerable?: boolean;
  /**
   * The direction of Cleaver's next swing (hitum_cleave()'s static `clockwise`; absent = false):
   * the swings alternate.
   */
  cleaveCw?: boolean;
  /**
   * gw.warn_obj_cnt: how many monsters on her level the wielded artifact warned her of when last
   * counted (see_monsters(); absent = 0), for Sting's glow.
   */
  warnObjCnt?: number;
  /** The Sunsword shining in her hand (C's lamplit on uwep), or null/absent. */
  sunLit?: number | null;
}

const DEFAULTS: UState = {
  luck: 0,
  moreluck: 0,
  alignType: HERO_ALIGN_TYPE,
  alignRecord: 0,
  alignAbuse: 0,
  ugangr: 0,
  ublesscnt: 300,
  ublessed: 0,
};

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Reads the hero's state (defaults when never written). */
export function uState(state: Readonly<GameState>): UState {
  const nh = state.modData['nh'];
  const u = isObj(nh) ? nh['u'] : undefined;
  return isObj(u) ? { ...DEFAULTS, ...(u as unknown as Partial<UState>) } : { ...DEFAULTS };
}

/** Changes the hero's state. */
export function setU(ctx: Pick<Ctx, 'state'>, patch: Partial<UState>): void {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (!isObj(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  nh['u'] = { ...uState(ctx.state), ...patch } as unknown as Json;
}

/** The hero's original alignment, u.ualignbase[A_ORIGINAL]. */
export const ualignBase = (state: Readonly<GameState>): number =>
  uState(state).alignBase ?? HERO_ALIGN_TYPE;

/**
 * The alignment she now belongs to, u.ualignbase[A_CURRENT]: the original one until an altar
 * converts her (a helm of opposite alignment taken off returns her to it).
 */
export const ualignCur = (state: Readonly<GameState>): number =>
  uState(state).alignCur ?? ualignBase(state);

/** ref: include/you.h `#define Luck (u.uluck + u.moreluck)`, with u.moreluck from set_moreluck() */
export const luckOf = (state: Readonly<GameState>): number => uState(state).luck + moreluck(state);

/** ref: src/attrib.c change_luck() */
export function changeLuck(ctx: Pick<Ctx, 'state'>, n: number): void {
  let luck = uState(ctx.state).luck + n;
  if (luck < 0 && luck < LUCKMIN) luck = LUCKMIN;
  if (luck > 0 && luck > LUCKMAX) luck = LUCKMAX;
  setU(ctx, { luck });
}

/** ref: include/align.h `ALIGNLIM (10L + (moves / 200L))` */
export const alignLim = (state: Readonly<GameState>): number => 10 + Math.trunc(state.turn / 200);

/**
 * Eating meat: a Monk feels guilty (-1 alignment). The vegetarian conduct itself is not counted
 * (no conducts). ref: src/eat.c violated_vegetarian()
 */
export function violatedVegetarian(ctx: Pick<Ctx, 'state' | 'emit'>): void {
  if (roleIs(ctx.state, 'monk')) {
    ctx.emit({ type: 'msg', key: 'eat.guilty' });
    adjalign(ctx, -1);
  }
}

/** ref: src/attrib.c adjalign() */
export function adjalign(ctx: Pick<Ctx, 'state'>, n: number): void {
  const u = uState(ctx.state);
  const newalign = u.alignRecord + n;
  if (n < 0) {
    const patch: Partial<UState> = {};
    if (newalign < u.alignRecord) patch.alignRecord = newalign;
    if (u.alignAbuse - n > u.alignAbuse) patch.alignAbuse = u.alignAbuse - n; // no Erinyes
    setU(ctx, patch);
  } else if (newalign > u.alignRecord) {
    setU(ctx, { alignRecord: Math.min(newalign, alignLim(ctx.state)) });
  }
}

/**
 * How good (negative) or bad (positive) killing this monster is for the hero's alignment.
 * ref: src/makemon.c set_malign(), computed from the monster's present peacefulness (NetHack
 * recomputes it whenever that changes). `mal` is the monster's own alignment: its def's, or for
 * a temple priest his shrine's times 5 (A_NONE stays A_NONE). No minions or quest leaders exist.
 */
export function malign(
  def: MonsterDef,
  peaceful: boolean,
  heroType: number,
  mal: number = def.alignment,
): number {
  const coaligned = Math.sign(mal) === Math.sign(heroType);
  const absmal = Math.abs(mal);
  if (mal === A_NONE) return peaceful ? 0 : 20; // really hostile
  if (def.flags.includes('peaceful'))
    return peaceful ? -3 * Math.max(5, absmal) : 3 * Math.max(5, absmal);
  if (def.flags.includes('hostile')) return coaligned ? 0 : Math.max(5, absmal);
  if (coaligned) return peaceful ? -3 * Math.max(3, absmal) : Math.max(3, absmal);
  return absmal;
}

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/** A temple priest's part in xkilled(): his shrine's alignment and whether it is the hero's. */
export interface KilledPriest {
  shralign: number;
  coaligned: boolean;
}

/**
 * The hero killed `mon` (called before it is removed): murder, killing peacefuls and pets cost
 * Luck, and the alignment record moves by the monster's malign; killing a temple priest
 * (`priest`) costs 2 points of alignment and divine protection when he was the hero's own, and
 * earns 2 otherwise. ref: src/mon.c xkilled() "Punish bad behavior" and "adjust alignment
 * points"; a co-aligned unicorn costs 5 Luck (no quest monsters)
 */
export function xkilledPenalties(ctx: Ctx, mon: Entity, priest: KilledPriest | null = null): void {
  const m = mon.c.monster;
  if (!m) return;
  const def = ctx.defs.monster(mon.def);
  const u = uState(ctx.state);
  // ref: set_malign(): a priest's alignment is his shrine's, times 5 unless A_NONE
  const mal = priest ? (priest.shralign === A_NONE ? A_NONE : priest.shralign * 5) : def.alignment;
  // murder: an always-peaceful-ish human (not a player monster, not a plain "human": it is rare
  // and most likely a resurrected corpse or animated statue), unless the hero is chaotic; her
  // own race does not matter
  if (
    def.flags.includes('human') &&
    !def.flags.includes('hostile') &&
    !isMplayer(def) &&
    def.id !== 'nh:human' &&
    malign(def, m.peaceful, u.alignType, mal) <= 0 &&
    u.alignType !== -1
  ) {
    setIntrinsic(getPlayer(ctx.state), P.TELEPAT, false);
    changeLuck(ctx, -2);
    say(ctx, 'luck.murderer');
  }
  const tame = (m.tame ?? 0) > 0;
  if ((m.peaceful && ctx.rng.rn2(2) === 0) || tame) changeLuck(ctx, -1);
  // ref: xkilled(): a unicorn of the hero's alignment
  if (isUnicorn(def) && Math.sign(u.alignType) === Math.sign(def.alignment)) {
    changeLuck(ctx, -5);
    say(ctx, 'unicorn.guilty');
  }
  if (priest) {
    adjalign(ctx, priest.coaligned ? -2 : 2);
    // cancel divine protection for killing your priest
    if (priest.coaligned) setU(ctx, { ublessed: 0 });
    // (the aligned cleric's own alignment is 0, never A_NONE: no "BIG bonus")
  } else if (tame) {
    adjalign(ctx, -15); // bad!!
    say(ctx, heroHas(ctx.state, P.HALLUC) ? 'luck.applause' : 'luck.thunder');
  } else if (m.peaceful) adjalign(ctx, -5);
  adjalign(ctx, malign(def, m.peaceful, u.alignType, mal));
}

/**
 * Luck times out toward 0 every 600 turns (300 while the god is angry). Cursed luckstones stop
 * bad Luck from timing out, blessed ones good Luck, uncursed ones both.
 * An Archeologist wearing a fedora times out toward 1.
 * ref: src/timeout.c nh_timeout() (no Amulet, full moon or Friday 13th)
 */
export function registerLuck(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    const u = uState(ctx.state);
    // an Archeologist's fedora (no full moon, Friday 13th or quest leader)
    const fedora =
      roleIs(ctx.state, 'archeologist') &&
      wornIn(ctx.state, ctx.state.playerId, 'helm')?.def === 'nh:fedora';
    const baseluck = fedora ? 1 : 0;
    if (u.luck !== baseluck && ctx.state.turn % (u.ugangr ? 300 : 600) === 0) {
      const { nostone, timeLuck } = luckTimeout(ctx.state);
      if (u.luck > baseluck && (nostone || timeLuck < 0)) setU(ctx, { luck: u.luck - 1 });
      else if (u.luck < baseluck && (nostone || timeLuck > 0)) setU(ctx, { luck: u.luck + 1 });
    }
  });
}
