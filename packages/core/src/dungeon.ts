import type { DefId, LevelId } from './types/common';
import type { LevelRef } from './types/level';
import type { DungeonDef, DungeonEntryDef, SpecialLevelDef } from './types/mod';
import type { Rng } from './types/rng';
import type { DungeonLayout, GameState } from './types/state';

/** The dungeon used when no mod defines one: endless, no branches. */
export const DEFAULT_DUNGEON: DungeonDef = { id: 'core:dungeon', nameKey: 'core:dungeon' };

/**
 * Rolls every dungeon's size, where its branches sit and where its special levels go, root
 * first. With no ranges, no branches and no special levels nothing is drawn from `rng`.
 * ref: src/dungeon.c init_dungeon_dungeons() (num_dunlevs = rn1(range, base)),
 * init_dungeon_set_entry(), init_dungeon_set_depth(), parent_dlevel(); init_dungeons()
 * init_level(), place_level()
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
      const entry = entryLevel(def, levels);
      if (entry !== 1) layout.entry = entry;
      const dlevel = parentDlevel(rng, parent, out[0] === parent, def.entry);
      const up = def.entry.dir === 'up';
      parent.branches.push(up ? { to: def.id, dlevel, dir: 'up' } : { to: def.id, dlevel });
      // ref: init_dungeon_set_depth(): the branch level's depth, one up or down the stairs,
      // less the levels above the entry level
      const from = parent.depthStart + dlevel - 1;
      layout.depthStart = from + (up ? -1 : 1) - (entry - 1);
    }
    layout.special = placeSpecials(rng, layout, def.special ?? []);
    out.push(layout);
  }
  return out;
}

/** The level a dungeon's branch stairs arrive on. ref: src/dungeon.c init_dungeon_set_entry() */
function entryLevel(def: DungeonDef, levels: number | null): number {
  const e = def.entryLevel ?? 0;
  if (e < 0) {
    if (levels === null)
      throw new RangeError(`Dungeon '${def.id}' counts its entry from a bottom it lacks`);
    return Math.max(1, levels + e + 1);
  }
  if (e > 0) return levels === null ? e : Math.min(e, levels);
  return 1;
}

/**
 * The level of `parent` a new branch leaves from: one of `range` levels from `base` (counted
 * from the `chain` special level when there is one), trying the one after a random pick first
 * and skipping levels that already hold a branch end.
 * ref: src/dungeon.c parent_dlevel(), level_range() (randc >= 0)
 */
function parentDlevel(
  rng: Rng,
  parent: DungeonLayout,
  isRoot: boolean,
  entry: DungeonEntryDef,
): number {
  const lmax = parent.levels ?? Infinity;
  let base = entry.base;
  if (entry.chain !== undefined) {
    const at = parent.special.find((s) => s.id === entry.chain);
    if (!at) throw new RangeError(`Branch chain level '${entry.chain}' is not in '${parent.id}'`);
    base += at.dlevel;
  }
  if (base < 1 || base > lmax)
    throw new RangeError(`Branch level ${base} is outside dungeon '${parent.id}'`);
  const range = entry.range ?? 0;
  const num = range ? (base + range - 1 > lmax ? lmax - base + 1 : range) : 1;
  // ends in the parent: its own entry level (the root has none) and branches made so far
  const taken = (dl: number): boolean =>
    (!isRoot && dl === (parent.entry ?? 1)) || parent.branches.some((b) => b.dlevel === dl);
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
 * Which stairs a new level gets: up stairs except on a branch dungeon's top level, down stairs
 * except on the last level, and the branch stairs that leave from it (leading the branch's way,
 * to the child's entry level) or arrive on it (on the child's entry level, leading back the other
 * way). ref: src/mklev.c generate_stairs(), place_branch(); src/dungeon.c Is_branchlev()
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
    const child = dungeonLayout(state, leaving.to);
    out.branch = {
      to: { dungeon: leaving.to, dlevel: child.entry ?? 1 },
      dir: leaving.dir ?? 'down',
    };
  } else if (!isRoot && ref.dlevel === (layout.entry ?? 1)) {
    for (const parent of state.dungeons) {
      const b = parent.branches.find((x) => x.to === ref.dungeon);
      if (b)
        out.branch = {
          to: { dungeon: parent.id, dlevel: b.dlevel },
          dir: b.dir === 'up' ? 'down' : 'up',
        };
    }
  }
  return out;
}
