// How the hero perceives monsters and objects: blindness, telepathy, warning and hallucination.
// ref: src/display.c (canspotmon, sensemon, tp_sensemon, display_warning(), warning_of()),
// src/do_name.c rndmonnam(), src/display.c random_monster() / random_object()
import { engulferOf } from './engulfstate';
import {
  getPlayer,
  isVisible,
  type AppearanceDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type ModApi,
  type Registry,
} from '@nh/core';
import { P, hasExtrinsic, hasProp, heroHas } from './props';
import { STATUE } from './statuestate';
import {
  REMEMBERED_UNSEEN_APPEARANCE,
  cantSeeSelf,
  mapInvisible,
  monInvisible,
  monVisible,
  seeInvisible,
  unmapInvisible,
} from './invis';
import { epriOf, priestName } from './epri';
import { eshkOf, shkName } from './eshk';

/** A deterministic 32-bit mix of a few integers (for hallucinated glyphs, which use no RNG). */
function mix(...ns: number[]): number {
  let h = 0x9e3779b9;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/**
 * ref: include/display.h _tp_sensemon(): a monster with a mind is sensed by a blind telepathic
 * hero anywhere on her level, or (Unblind_telepat: a worn amulet of ESP) within
 * `u.unblind_telepat_range` = BOLT_LIM^2 per worn telepathy item (src/worn.c
 * recalc_telepat_range(); only the amulet exists here).
 */
export function telepathSenses(state: Readonly<GameState>, defs: Registry, mon: Entity): boolean {
  if (!defs.isMonster(mon.def) || !heroHas(state, P.TELEPAT)) return false;
  const hero = getPlayer(state);
  const hp = hero.c.pos;
  const mp = mon.c.pos;
  if (!mp || !hp || mp.level !== hp.level) return false;
  if (defs.monster(mon.def).flags.includes('mindless')) return false;
  if (heroHas(state, P.BLINDED)) return true;
  if (!hasExtrinsic(hero, P.TELEPAT)) return false;
  const dx = mp.x - hp.x;
  const dy = mp.y - hp.y;
  return dx * dx + dy * dy <= BOLT_LIM * BOLT_LIM; // one telepathy item
}

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/** ref: include/display.h WARNCOUNT: warning levels 0..5 */
const WARNCOUNT = 6;
/** ref: src/allmain.c `svc.context.warnlevel = 1` (never changed): level-0 monsters never warn */
const WARNLEVEL = 1;

/** The perception def that shows warning digits (not a way of spotting the monster). */
export const WARNING_PERCEPTION: DefId = 'nh:warning';

/** The legend key of a warning digit. */
export const warningGlyph = (wl: number): DefId => `nh:warning_${wl}`;

/**
 * The warning digits, as legend entries: '0'..'5' in C's colours (white, three reds, magenta,
 * bright magenta; '0' is never shown, as warnlevel is 1). Class 'rock' keeps them out of the
 * shuffled description pools. ref: src/drawing.c def_warnsyms[]
 */
export const WARNING_APPEARANCES: readonly AppearanceDef[] = [
  '#ffffff',
  '#cc3333',
  '#cc3333',
  '#cc3333',
  '#bb44bb',
  '#ff55ff',
].map((fg, wl) => ({
  id: warningGlyph(wl),
  nameKey: warningGlyph(wl),
  class: 'rock' as const,
  glyph: { ch: String(wl), fg },
}));

/**
 * The warning level (1..5) the hero feels from this monster, or null: she has Warning, it is a
 * hostile monster on her level less than 10 squares away (distance² < 100), and `m_lev / 4` is
 * at least the warning threshold. ref: include/display.h _mon_warning(); src/display.c
 * warning_of()
 */
export function warningLevel(
  state: Readonly<GameState>,
  defs: Registry,
  mon: Entity,
): number | null {
  if (!defs.isMonster(mon.def) || !heroHas(state, P.WARNING)) return null;
  const m = mon.c.monster;
  if (!m || m.peaceful) return null;
  const hp = getPlayer(state).c.pos;
  const mp = mon.c.pos;
  if (!mp || !hp || mp.level !== hp.level) return null;
  const dx = mp.x - hp.x;
  const dy = mp.y - hp.y;
  if (dx * dx + dy * dy >= 100) return null;
  const tmp = Math.trunc(m.level / 4);
  if (tmp < WARNLEVEL) return null;
  return Math.min(tmp, WARNCOUNT - 1);
}

/** The monster's cell is in her sight. */
function cellSeen(state: Readonly<GameState>, mon: Entity): boolean {
  const p = mon.c.pos;
  const level = p ? state.levels[p.level] : undefined;
  return (
    !!p && !!level && p.level === state.currentLevel && isVisible(state, p.y * level.width + p.x)
  );
}

/**
 * The warning digit shown for a monster she neither sees nor senses, or null. Hallucinating, the
 * digit is any of 1..5, from the turn and the monster (C uses the display RNG).
 * ref: src/display.c newsym() `mon_warning(mon)` branches, display_warning()
 */
export function warningShown(
  state: Readonly<GameState>,
  defs: Registry,
  mon: Entity,
): DefId | null {
  const wl = warningLevel(state, defs, mon);
  // newsym(): an invisible monster on a seen square still shows its warning digit
  if (wl === null || (cellSeen(state, mon) && monVisible({ state }, mon))) return null;
  if (telepathSenses(state, defs, mon)) return null;
  return warningGlyph(
    heroHas(state, P.HALLUC) ? ((state.turn + mon.id) % (WARNCOUNT - 1)) + 1 : wl,
  );
}

/**
 * The vanilla perception: blindness (no sight), telepathy while blind, and hallucination
 * (every creature and floor object looks like a random one, changing each turn).
 */
export function registerPerception(api: ModApi): void {
  // the engulfer's def while the hero is swallowed: the ui draws C's swallow box around her
  // (ref: src/display.c swallowed())
  api.defineStatus({
    id: 'nh:engulfed',
    field: 'engulfed',
    value: (state) => {
      const id = engulferOf(state);
      return id === null ? null : (state.entities[String(id)]?.def ?? null);
    },
  });
  for (const a of WARNING_APPEARANCES) api.defineAppearance(a);
  // first, so that its digit wins over hallucination's random monster
  api.definePerception({
    id: WARNING_PERCEPTION,
    senses: (state, defs, mon) => warningShown(state, defs, mon) !== null,
    shownAs: (state, defs, e) => (defs.isMonster(e.def) ? warningShown(state, defs, e) : null),
  });
  // invisibility: an invisible monster is not seen on a visible square unless she sees invisible
  // (mon_visible()), and an invisible hero who can't see invisible can't see herself
  // (canspotself()); `self` answers null otherwise so that later defs (a polymorph form) get a turn
  api.defineAppearance(REMEMBERED_UNSEEN_APPEARANCE);
  api.definePerception({
    id: 'nh:invisibility',
    hides: (state, _defs, mon) => monInvisible({ state }, mon) && !seeInvisible(state),
    self: (state) => (cantSeeSelf(state) ? { unseen: true } : null),
  });
  api.definePerception({
    id: 'nh:senses',
    // swallowed: "You see nothing, nothing can see you" (ref: src/vision.c vision_recalc())
    blind: (state) => heroHas(state, P.BLINDED) || engulferOf(state) !== null,
    senses: telepathSenses,
    shownAs(state, defs, e) {
      if (!heroHas(state, P.HALLUC)) return null;
      // ref: random_monster() / random_object(): any monster or object glyph; a statue is seen
      // as a random monster (display.c: "statues are seen as random monsters")
      const pool = defs.isMonster(e.def) || e.def === STATUE ? defs.monsters : defs.objects;
      return pool[mix(state.seed, state.turn, e.id) % pool.length]?.id ?? null;
    },
  });
}

/**
 * ref: src/display.h canspotmon(): seen (canseemon(): its cell is visible and mon_visible()) or
 * sensed. A warning digit is neither (sensemon() counts only warning of a monster's kind, which
 * does not exist here).
 */
export function canSpotMon(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  const p = mon.c.pos;
  const hero = getPlayer(ctx.state).c.pos;
  if (!p || p.level !== hero?.level) return false;
  const level = ctx.state.levels[p.level];
  if (level && isVisible(ctx.state, p.y * level.width + p.x) && monVisible(ctx, mon)) return true;
  return ctx.defs.perceptions.some(
    (d) => d.id !== WARNING_PERCEPTION && d.senses?.(ctx.state, ctx.defs, mon) === true,
  );
}

/**
 * A thrown or kicked object or a ray crosses (x, y) of her level holding `mon` (or nothing): on a
 * square she sees, a monster she can't spot there is remembered as `I`, and an `I` with nothing
 * there is forgotten. ref: src/zap.c bhit() THROWN_WEAPON/KICKED_WEAPON ("'I' present but no
 * monster: erase"), dobuzz() ("reveal/unreveal invisible monsters before tmp_at()")
 */
export function revealUnseenAt(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  mon: Entity | null | undefined,
  x: number,
  y: number,
): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level || x < 0 || y < 0 || x >= level.width || y >= level.height) return;
  if (!isVisible(ctx.state, y * level.width + x)) return;
  if (!mon) unmapInvisible(ctx, x, y);
  else if (!canSpotMon(ctx, mon)) mapInvisible(ctx, x, y);
}

/**
 * Like monNam(), but "someone" (humanoids that are neither animals nor mindless) or "something"
 * instead of "it" for a monster she can't see or sense; while hallucinating either, at random.
 * ref: src/do_name.c some_mon_nam() (AUGMENT_IT)
 */
export function someMonNam(ctx: Pick<Ctx, 'state' | 'defs' | 'cosmetic'>, mon: Entity): string {
  if (canSpotMon(ctx, mon)) return monNam(ctx, mon);
  const def = ctx.defs.monster(mon.def);
  const sOne = hasProp(getPlayer(ctx.state), P.HALLUC)
    ? !ctx.cosmetic.rn2(2)
    : def.flags.includes('humanoid') &&
      !def.flags.includes('animal') &&
      !def.flags.includes('mindless');
  return sOne ? '@pronoun.someone' : '@pronoun.something';
}

/** The id of a random monster for a hallucinated name. ref: src/do_name.c rndmonnam() */
export function rndmonnam(ctx: Pick<Ctx, 'defs' | 'cosmetic'>): DefId {
  const all = ctx.defs.monsters;
  return all[ctx.cosmetic.rn2(all.length)]?.id ?? 'nh:newt';
}

/**
 * A monster's name as a message param, as the hero perceives it: '@pronoun.it' when she can't see or
 * sense it (Monnam's "it"), a random monster while hallucinating, a shopkeeper's proper name
 * ('=Izchak'), else '@<def>'. Use it with the
 * `{mon|the}` / `{mon|The}` modifiers ("the newt", "It"). ref: src/do_name.c mon_nam(),
 * x_monnam()
 */
export function monNam(ctx: Pick<Ctx, 'state' | 'defs' | 'cosmetic'>, mon: Entity): string {
  // x_monnam(): `do_it = !canspotmon(mtmp) && ... && !engulfing_u(mtmp)`
  if (!canSpotMon(ctx, mon) && engulferOf(ctx.state) !== mon.id) return '@pronoun.it';
  if (hasProp(getPlayer(ctx.state), P.HALLUC)) return `@${rndmonnam(ctx)}`;
  const epri = epriOf(ctx, mon.id);
  if (epri) return priestName(epri); // "the priest of Odin"
  const eshk = eshkOf(ctx, mon.id);
  if (eshk) return shkName(eshk); // "Izchak" (ref: x_monnam() isshk)
  return `@${mon.def}`;
}
