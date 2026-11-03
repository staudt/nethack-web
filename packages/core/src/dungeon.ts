import type { DefId, LevelId } from './types/common';
import type { LevelRef } from './types/level';
import type { DungeonDef, SpecialLevelDef } from './types/mod';
import type { Rng } from './types/rng';
import type { DungeonLayout, GameState } from './types/state';

/** The dungeon used when no mod defines one: endless, no branches. */
export const DEFAULT_DUNGEON: DungeonDef = { id: 'core:dungeon', nameKey: 'core:dungeon' };

/**
 * Rolls every dungeon's size, where its branches sit and where its special levels go, root
 * first. With no ranges, no branches and no special levels nothing is drawn from `rng`.
 * ref: src/dungeon.c init_dungeon_dungeons() (num_dunlevs = rn1(range, base)),
 * init_dungeon_set_depth(), parent_dlevel(); init_dungeons() init_level(), place_level()
 */
export function rollDungeons(rng: Rng, defs: readonly DungeonDef[]): DungeonLayout[] {
  const out: DungeonLayout[] = [];
  for (const def of defs) {
    const levels = def.levels
      ? def.levels.range
        ? rng.rn2(def.levels.range) + def.levels.base
        : def.levels.base
      : null;
    const layout: DungeonLayout = {
      id: def.id,
      depthStart: 1,
      levels,
      branches: [],
      special: [],
    };
    const parent = def.entry && out.find((p) => p.id === def.entry?.from);
    if (def.entry && parent) {
      const dlevel = parentDlevel(rng, parent, def.entry.base, def.entry.range ?? 0);
      parent.branches.push({ to: def.id, dlevel });
      // a down staircase: one level below the branch level, entered at the top
      layout.depthStart = parent.depthStart + dlevel - 1 + 1;
    }
    layout.special = placeSpecials(rng, layout, def.special ?? []);
    out.push(layout);
  }
  return out;
}

/**
 * The level of `parent` a new branch leaves from: one of `range` levels from `base`, trying the
 * one after a random pick first and skipping levels that already hold a branch end.
 * ref: src/dungeon.c parent_dlevel(), level_range() (absolute, randc >= 0)
 */
function parentDlevel(rng: Rng, parent: DungeonLayout, base: number, range: number): number {
  const lmax = parent.levels ?? Infinity;
  if (base < 1 || base > lmax)
    throw new RangeError(`Branch level ${base} is outside dungeon '${parent.id}'`);
  const num = range ? (base + range - 1 > lmax ? lmax - base + 1 : range) : 1;
  // ends in the parent: its own entry (top level; the root has none) and branches made so far
  const taken = (dl: number): boolean =>
    (parent.depthStart > 1 && dl === 1) || parent.branches.some((b) => b.dlevel === dl);
  let i = rng.rn2(num);
  const j = i;
  do {
    if (++i >= num) i = 0;
  } while (taken(base + i) && i !== j);
  return base + i;
}

/**
 * The levels the special levels of one dungeon go on. Each one first rolls whether it exists
 * (`chance <= rn2(100)` leaves it out; C skips the roll in wizard mode, we never do), then they
 * are placed in order, each on a random level of its range not taken by an earlier one; when a
 * later one finds no level, the earlier choice is undone and another tried.
 * ref: src/dungeon.c init_level(), possible_places(), pick_level(), place_level(), level_range()
 */
function placeSpecials(
  rng: Rng,
  layout: DungeonLayout,
  defs: readonly SpecialLevelDef[],
): { id: DefId; dlevel: number }[] {
  const made = defs.filter((d) => !((d.chance ?? 100) <= rng.rn2(100)));
  const lmax = layout.levels ?? Infinity;
  const ranges = made.map((d) => {
    const base = d.base < 0 ? lmax + d.base + 1 : d.base;
    if (!Number.isFinite(base) || base < 1 || base > lmax)
      throw new RangeError(`Special level '${d.id}' base ${d.base} is outside '${layout.id}'`);
    const range = d.range ?? 0;
    return { base, count: range ? (base + range - 1 > lmax ? lmax - base + 1 : range) : 1 };
  });
  const placed: number[] = [];
  const place = (i: number): boolean => {
    const r = ranges[i];
    if (!r) return true;
    const map: number[] = [];
    for (let dl = r.base; dl < r.base + r.count; dl++) if (!placed.includes(dl)) map.push(dl);
    for (let n = map.length; n > 0; n--) {
      const k = rng.rn2(n);
      const dl = map[k] as number;
      placed.push(dl);
      if (place(i + 1)) return true;
      placed.pop();
      map.splice(k, 1); // this choice didn't work
    }
    return false;
  };
  if (!place(0)) throw new RangeError(`Cannot place the special levels of '${layout.id}'`);
  return made.map((d, i) => ({ id: d.id, dlevel: placed[i] as number }));
}

/** The special level on `ref`, if one was placed there. */
export function specialLevelAt(
  state: Readonly<GameState>,
  ref: LevelRef,
): { id: DefId; dlevel: number } | undefined {
  return dungeonLayout(state, ref.dungeon).special.find((s) => s.dlevel === ref.dlevel);
}

/** The root dungeon's layout (always first). */
export function rootDungeon(state: Readonly<GameState>): DungeonLayout {
  const root = state.dungeons[0];
  if (!root) throw new Error('The game has no dungeon layout');
  return root;
}

/** The layout of dungeon `id`. @throws for a dungeon not in this game's layout */
export function dungeonLayout(state: Readonly<GameState>, id: DefId): DungeonLayout {
  const d = state.dungeons.find((l) => l.id === id);
  if (!d) throw new Error(`Unknown dungeon '${id}' in this game`);
  return d;
}

/** Root dungeon levels are `dlvl<N>`, others `<dungeon>/<N>`. */
export function levelIdFor(state: Readonly<GameState>, ref: LevelRef): LevelId {
  return ref.dungeon === rootDungeon(state).id
    ? `dlvl${ref.dlevel}`
    : `${ref.dungeon}/${ref.dlevel}`;
}

/** Absolute depth of a level. ref: src/dungeon.c depth() */
export function depthOf(state: Readonly<GameState>, ref: LevelRef): number {
  return dungeonLayout(state, ref.dungeon).depthStart + ref.dlevel - 1;
}

/**
 * Which stairs a new level gets: up stairs except on a branch dungeon's top level (its branch
 * stairs lead up), down stairs except on the last level, and the branch stairs that leave from
 * or arrive on it. ref: src/mklev.c generate_stairs(), place_branch(); src/dungeon.c Is_branchlev()
 */
export function levelStairs(
  state: Readonly<GameState>,
  ref: LevelRef,
): { up: boolean; down: boolean; branch?: { to: LevelRef; dir: 'up' | 'down' } } {
  const layout = dungeonLayout(state, ref.dungeon);
  const isRoot = layout === rootDungeon(state);
  const out: ReturnType<typeof levelStairs> = {
    up: isRoot || ref.dlevel > 1,
    down: layout.levels === null || ref.dlevel < layout.levels,
  };
  const leaving = layout.branches.find((b) => b.dlevel === ref.dlevel);
  if (leaving) {
    out.branch = { to: { dungeon: leaving.to, dlevel: 1 }, dir: 'down' };
  } else if (!isRoot && ref.dlevel === 1) {
    for (const parent of state.dungeons) {
      const b = parent.branches.find((x) => x.to === ref.dungeon);
      if (b) out.branch = { to: { dungeon: parent.id, dlevel: b.dlevel }, dir: 'up' };
    }
  }
  return out;
}
