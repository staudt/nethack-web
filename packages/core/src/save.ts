import type { ModRef } from './types/common';
import type { Registry } from './types/mod';
import type { Replay, SaveFile } from './types/protocol';
import type { DungeonLayout, GameState } from './types/state';

export const SAVE_FORMAT = 'nh-ts';
export const SAVE_VERSION = 7 as const;

export function serializeSave(state: GameState, replay: Replay): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    mods: state.mods,
    state,
    replay,
  };
  return JSON.stringify(file);
}

const modList = (mods: readonly ModRef[]): string =>
  mods.map((m) => `${m.id}@${m.version}`).join(', ') || '(none)';

/** Parses a save and checks that it was made with exactly the loaded game mods. */
export function parseSave(text: string, registry: Registry): { state: GameState; replay: Replay } {
  let file: Partial<SaveFile>;
  try {
    file = JSON.parse(text) as Partial<SaveFile>;
  } catch (e) {
    throw new Error(`Save is not valid JSON: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }
  if (typeof file !== 'object' || file === null || file.format !== SAVE_FORMAT)
    throw new Error(`Not a ${SAVE_FORMAT} save file`);
  // Older saves only lack fields that start empty: v4 added `occupation`, v5 `monsterMemory`,
  // v6 `Level.traps`. v7 added the dungeon layout: an old game has only the root dungeon (no
  // branches, no rolled bottom) and all its levels are in it.
  const old = file.version as number | undefined;
  if ((old === 3 || old === 4 || old === 5 || old === 6) && file.state) {
    const st = file.state as {
      occupation?: unknown;
      monsterMemory?: unknown;
      dungeons?: DungeonLayout[];
      levels?: Record<
        string,
        { traps?: unknown; depth: number; dungeon?: string; dlevel?: number }
      >;
      version: number;
    };
    const root = registry.dungeons[0];
    st.occupation ??= null;
    st.monsterMemory ??= {};
    if (root) st.dungeons ??= [{ id: root.id, depthStart: 1, levels: null, branches: [] }];
    for (const level of Object.values(st.levels ?? {})) {
      level.traps ??= [];
      if (root) level.dungeon ??= root.id;
      level.dlevel ??= level.depth;
    }
    st.version = SAVE_VERSION;
    file.version = SAVE_VERSION;
  }
  if (file.version !== SAVE_VERSION)
    throw new Error(`Unsupported save version ${String(file.version)} (expected ${SAVE_VERSION})`);
  if (!file.state || !file.replay || !Array.isArray(file.mods))
    throw new Error('Save file is missing state, replay or mods');
  const saved = modList(file.mods);
  const loaded = modList(registry.mods);
  if (saved !== loaded)
    throw new Error(`Save was made with mods [${saved}] but the game has [${loaded}] loaded`);
  return { state: file.state, replay: file.replay };
}
