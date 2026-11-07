// The score: `u.urexp` (four times each experience gain plus the score bonuses) and the final
// points really_done() adds at the end. A leaf (core and leaves only): hero.ts, read.ts,
// potion.ts, zap.ts and magic.ts import it, never the reverse.
// ref: src/exper.c more_experienced(); src/end.c really_done() "calculate score",
// get_valuables(); src/vault.c hidden_gold(); src/dungeon.c deepest_lev_reached()
import {
  contents,
  inventoryOf,
  type Ctx,
  type Entity,
  type GameState,
  type Json,
  type Registry,
} from '@nh/core';
import { endHow } from './endstate';
import { GLASS_GEMS, REAL_GEMS } from './gem';

interface ScoreData {
  /** u.urexp: the score so far (absent = 0) */
  urexp?: number;
}

const nhOf = (state: Readonly<GameState>): ScoreData | undefined => {
  const nh = state.modData['nh'];
  return typeof nh === 'object' && nh !== null && !Array.isArray(nh)
    ? (nh as unknown as ScoreData)
    : undefined;
};

/** The score so far, `u.urexp`. */
export function urexp(state: Readonly<GameState>): number {
  return nhOf(state)?.urexp ?? 0;
}

/**
 * The score part of more_experienced(): `u.urexp += 4 * exp + rexp`. The experience points
 * themselves (`u.uexp`) are the caller's (hero.ts gainExperience()). ref: src/exper.c
 * more_experienced() (no wraparound cap: numbers here never get near it)
 */
export function moreExperienced(ctx: Pick<Ctx, 'state'>, exp: number, rexp: number): void {
  const inc = 4 * exp + rexp;
  if (inc === 0) return;
  const md = ctx.state.modData;
  if (!nhOf(ctx.state)) md['nh'] = {};
  const nh = md['nh'] as unknown as ScoreData;
  nh.urexp = (nh.urexp ?? 0) + inc;
  md['nh'] = nh as unknown as Json;
}

/** Gold in the containers she carries, nested ones too. ref: src/vault.c hidden_gold(TRUE) */
function goldIn(state: Readonly<GameState>, defs: Registry, list: readonly Entity[]): number {
  let n = 0;
  for (const e of list) {
    const od = defs.object(e.def);
    if (od.class === 'coin') n += e.c.item?.quantity ?? 0;
    else if (od.container) n += goldIn(state, defs, contents(state, e.id));
  }
  return n;
}

/**
 * Gold carried, containers included: really_done()'s `umoney` (money_cnt() + hidden_gold()),
 * shown in "and N pieces of gold".
 */
export function finalGold(state: Readonly<GameState>, defs: Registry): number {
  return goldIn(state, defs, inventoryOf(state, state.playerId));
}

/** The deepest level reached: levels exist once visited. ref: deepest_lev_reached(FALSE) */
export function deepestLevel(state: Readonly<GameState>): number {
  let deepest = 1;
  for (const lv of Object.values(state.levels)) deepest = Math.max(deepest, lv.depth);
  return deepest;
}

/**
 * Amulets and gems (real ones and glass, not gray stones or rocks) she carries, containers
 * included, at their base cost. No artifacts exist. ref: src/end.c get_valuables()
 */
function valuables(state: Readonly<GameState>, defs: Registry, list: readonly Entity[]): number {
  let n = 0;
  for (const e of list) {
    const od = defs.object(e.def);
    if (od.container) n += valuables(state, defs, contents(state, e.id));
    else if (od.class === 'amulet' || REAL_GEMS.includes(e.def) || GLASS_GEMS.includes(e.def))
      n += (e.c.item?.quantity ?? 1) * od.cost;
  }
  return n;
}

/**
 * The final score: `u.urexp` plus the net gold gain (less a tenth unless she escaped or quit),
 * 50 per level below the first and 1000 per level past 20 (at most 10); an escape adds the
 * valuables. The starting gold (`u.umoney0`) is 0: the Valkyrie starts with none.
 * ref: src/end.c really_done() "calculate score" (`how < PANICKED`), the ESCAPED branch.
 * Not ported: the ascension bonus, artifact_score(), the escaping pets' hit points.
 */
export function finalScore(state: Readonly<GameState>, defs: Registry): number {
  const how = endHow(state);
  const deepest = deepestLevel(state);
  let tmp = Math.max(0, finalGold(state, defs)); // net gain over u.umoney0 = 0
  if (how !== 'escaped' && how !== 'quit') tmp -= Math.trunc(tmp / 10);
  tmp += 50 * (deepest - 1);
  if (deepest > 20) tmp += 1000 * (deepest > 30 ? 10 : deepest - 20);
  let score = urexp(state) + tmp;
  if (how === 'escaped') score += valuables(state, defs, inventoryOf(state, state.playerId));
  return score;
}
