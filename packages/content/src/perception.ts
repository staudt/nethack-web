// How the hero perceives monsters and objects: blindness, telepathy and hallucination.
// ref: src/display.c (canspotmon, sensemon, tp_sensemon), src/do_name.c rndmonnam(),
// src/display.c random_monster() / random_object()
import {
  getPlayer,
  isVisible,
  senses,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type ModApi,
  type Registry,
} from '@nh/core';
import { P, hasExtrinsic, hasProp, heroHas } from './props';

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

/**
 * The vanilla perception: blindness (no sight), telepathy while blind, and hallucination
 * (every creature and floor object looks like a random one, changing each turn).
 */
export function registerPerception(api: ModApi): void {
  api.definePerception({
    id: 'nh:senses',
    blind: (state) => heroHas(state, P.BLINDED),
    senses: telepathSenses,
    shownAs(state, defs, e) {
      if (!heroHas(state, P.HALLUC)) return null;
      // ref: random_monster() / random_object(): any monster or object glyph
      const pool = defs.isMonster(e.def) ? defs.monsters : defs.objects;
      return pool[mix(state.seed, state.turn, e.id) % pool.length]?.id ?? null;
    },
  });
}

/** ref: src/display.h canspotmon(): seen (its cell is visible) or sensed. */
export function canSpotMon(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  const p = mon.c.pos;
  const hero = getPlayer(ctx.state).c.pos;
  if (!p || p.level !== hero?.level) return false;
  const level = ctx.state.levels[p.level];
  if (level && isVisible(ctx.state, p.y * level.width + p.x)) return true;
  return senses(ctx.defs, ctx.state, mon);
}

/** The id of a random monster for a hallucinated name. ref: src/do_name.c rndmonnam() */
function rndmonnam(ctx: Pick<Ctx, 'defs' | 'cosmetic'>): DefId {
  const all = ctx.defs.monsters;
  return all[ctx.cosmetic.rn2(all.length)]?.id ?? 'nh:newt';
}

/**
 * A monster's name as a message param, as the hero perceives it: '@pronoun.it' when she can't see or
 * sense it (Monnam's "it"), a random monster while hallucinating, else '@<def>'. Use it with the
 * `{mon|the}` / `{mon|The}` modifiers ("the newt", "It"). ref: src/do_name.c mon_nam(),
 * x_monnam()
 */
export function monNam(ctx: Pick<Ctx, 'state' | 'defs' | 'cosmetic'>, mon: Entity): string {
  if (!canSpotMon(ctx, mon)) return '@pronoun.it';
  if (hasProp(getPlayer(ctx.state), P.HALLUC)) return `@${rndmonnam(ctx)}`;
  return `@${mon.def}`;
}
