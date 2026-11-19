// The level's difficulty for monster and object generation, traps and gold: the depth of the
// hero's level, adjusted. A leaf (core, levelflags.ts and uhave.ts only): items.ts, mkobj.ts,
// generation.ts and the level makers import it.
// ref: src/dungeon.c level_difficulty(), deepest_lev_reached(), builds_up()
import {
  dungeonLayout,
  getPlayer,
  type Ctx,
  type GameState,
  type Level,
  type LevelRef,
} from '@nh/core';
import { GEHENNOM, GEHENNOM_SPECIALS, inEndgame } from './levelflags';
import { uHave } from './uhave';

/**
 * The depth of the deepest level she has reached (levels exist once visited). `noquest` leaves
 * out the Quest (the score list's "max level"; there is no Quest yet, so it changes nothing).
 * 0 before any level exists. ref: src/dungeon.c deepest_lev_reached()
 */
export function deepestLevReached(state: Readonly<GameState>, noquest: boolean): number {
  void noquest; // no Quest dungeon (m24)
  let ret = 0;
  for (const lv of Object.values(state.levels)) if (lv.depth > ret) ret = lv.depth;
  return ret;
}

/**
 * Whether `level`'s dungeon is entered at its last level and built upward (Sokoban, Vlad's
 * Tower); a single-level branch builds up when its branch leads up to it.
 * ref: src/dungeon.c builds_up()
 */
function buildsUp(state: Readonly<GameState>, level: LevelRef): boolean {
  const d = dungeonLayout(state, level.dungeon);
  if (d.levels !== 1) return d.levels !== null && (d.entry ?? 1) === d.levels;
  for (const p of state.dungeons)
    for (const b of p.branches) if (b.to === level.dungeon) return b.dir === 'up';
  return false;
}

/**
 * context.made_amulet (luck.ts UState `madeAmulet`, read raw: luck.ts sits above this leaf).
 * Until the real Amulet exists she cannot carry it, so level_difficulty() (asked for every
 * monster and object made) skips the inventory scan.
 */
export function amuletMade(state: Readonly<GameState>): boolean {
  const nh = state.modData['nh'];
  const u = nh !== null && typeof nh === 'object' && !Array.isArray(nh) ? nh['u'] : undefined;
  return u !== null && typeof u === 'object' && !Array.isArray(u) && u['madeAmulet'] === true;
}

/** The depth of Moloch's Sanctum (Gehennom's last level); null in a game without it. */
function sanctumDepth(state: Readonly<GameState>): number | null {
  const d = state.dungeons.find((x) => x.id === GEHENNOM);
  const sp = d?.special.find((s) => s.id === GEHENNOM_SPECIALS.sanctum);
  return d && sp ? d.depthStart + sp.dlevel - 1 : null;
}

/**
 * level_difficulty(): on the Planes the Sanctum's depth plus half her experience level; while she
 * carries the Amulet the deepest level she has reached; else the depth of `level` (the hero's
 * by default: C always uses u.uz, which is the level being made during level creation), two
 * more per level climbed into a dungeon that builds upward (Sokoban, Vlad's Tower). A worn ring
 * of aggravate monster (EAggravate_monster) doubles it, 50 past 25.
 * ref: src/dungeon.c level_difficulty()
 */
export function levelDifficulty(ctx: Pick<Ctx, 'state'>, level?: Readonly<Level>): number {
  const { state } = ctx;
  const lev = level ?? state.levels[state.currentLevel];
  if (!lev) return 1;
  const hero = getPlayer(state);
  let res: number;
  const sanctum = inEndgame(state, lev) ? sanctumDepth(state) : null;
  if (sanctum !== null) res = sanctum + Math.trunc((hero.c.experience?.level ?? 1) / 2);
  else if (amuletMade(state) && uHave(state, 'amulet')) res = deepestLevReached(state, false);
  else {
    res = lev.depth;
    // in a builds-up branch the harder to reach levels count as deeper: the extra effort of going
    // down to the entrance and then up to the level
    if (buildsUp(state, lev)) {
      const entryLev = dungeonLayout(state, lev.dungeon).entry ?? 1;
      res += 2 * (entryLev - lev.dlevel + 1);
    }
  }
  // ring of aggravate monster: EAggravate_monster is a worn item's or an invoked artifact's (the
  // raw props keys of props.ts, which sits above this leaf)
  const props = hero.c.props;
  if (
    props?.['aggravate_monster:worn'] !== undefined ||
    props?.['aggravate_monster:invoked'] !== undefined
  )
    res = res > 25 ? 50 : res * 2;
  return res;
}
