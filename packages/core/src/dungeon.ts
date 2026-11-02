import type { DefId, LevelId } from './types/common';
import type { LevelRef } from './types/level';
import type { DungeonDef } from './types/mod';
import type { Rng } from './types/rng';
import type { DungeonLayout, GameState } from './types/state';

/** The dungeon used when no mod defines one: endless, no branches. */
export const DEFAULT_DUNGEON: DungeonDef = { id: 'core:dungeon', nameKey: 'core:dungeon' };

/**
 * Rolls every dungeon's size and where its branches sit, root first. With no ranges and no
 * branches nothing is drawn from `rng`.
 * ref: src/dungeon.c init_dungeon_dungeons() (num_dunlevs = rn1(range, base)),
 * init_dungeon_set_depth(), parent_dlevel()
 */
export function rollDungeons(rng: Rng, defs: readonly DungeonDef[]): DungeonLayout[] {
  const out: DungeonLayout[] = [];
  for (const def of defs) {
    const levels = def.levels
      ? def.levels.range
        ? rng.rn2(def.levels.range) + def.levels.base
        : def.levels.base
      : null;
    const layout: DungeonLayout = { id: def.id, depthStart: 1, levels, branches: [] };
    const parent = out.find((p) => p.id !== def.id && branchDef(defs, p.id, def.id));
    if (parent) {
      const b = branchDef(defs, parent.id, def.id) as NonNullable<ReturnType<typeof branchDef>>;
      const dlevel = parentDlevel(rng, parent, b.base, b.range ?? 0);
      parent.branches.push({ to: def.id, dlevel });
      // a down staircase: one level below the branch level, entered at the top
      layout.depthStart = parent.depthStart + dlevel - 1 + 1;
    }
    out.push(layout);
  }
  return out;
}

const branchDef = (defs: readonly DungeonDef[], from: DefId, to: DefId) =>
  defs.find((d) => d.id === from)?.branches?.find((b) => b.to === to);

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
