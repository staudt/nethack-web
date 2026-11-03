// A level under construction for buildLevel: terrain read and written by LevelTerrain key, the
// key groups NetHack's typ macros test, and feature placement.
import type { Level } from '../types/level';
import type { DefId } from '../types/common';
import type { FeatureDef, LevelDef } from '../types/mod';
import type { Rng } from '../types/rng';
import type { GenOptions } from './generate';
import { MK } from './mkmap';
import type { LevelTerrain } from './terrain';

export type Key = keyof LevelTerrain;

export const WALL_KEYS: readonly Key[] = [
  'vwall',
  'hwall',
  'tlcorn',
  'trcorn',
  'blcorn',
  'brcorn',
  'crwall',
  'tuwall',
  'tdwall',
  'tlwall',
  'trwall',
];
/** IS_DOOR(): doors in any state, doorways included. */
export const DOOR_KEYS: readonly Key[] = [
  'doorway',
  'door_open_v',
  'door_open_h',
  'door_closed',
  'door_locked',
];
export const SDOOR_KEYS: readonly Key[] = [
  'sdoor_v',
  'sdoor_h',
  'sdoor_locked_v',
  'sdoor_locked_h',
];
/** IS_FURNITURE(): stairs, fountains, sinks, altars. */
export const FURNITURE_KEYS: readonly Key[] = [
  'stairs_up',
  'stairs_down',
  'fountain',
  'sink',
  'altar_lawful',
  'altar_neutral',
  'altar_chaotic',
  'altar_unaligned',
];
/** IS_OBSTRUCTED() (typ < POOL): stone, walls, trees, secret doors and corridors. */
export const OBSTRUCTED_KEYS: readonly Key[] = [
  'stone',
  ...WALL_KEYS,
  'tree',
  ...SDOOR_KEYS,
  'scorr',
];
/** MK kind of each wall key, for wallifyKinds(). */
export const WALL_MK: Partial<Record<Key, number>> = {
  vwall: MK.VWALL,
  hwall: MK.HWALL,
  tlcorn: MK.TLCORN,
  trcorn: MK.TRCORN,
  blcorn: MK.BLCORN,
  brcorn: MK.BRCORN,
  crwall: MK.CRWALL,
  tuwall: MK.TUWALL,
  tdwall: MK.TDWALL,
  tlwall: MK.TLWALL,
  trwall: MK.TRWALL,
};
export const MK_WALL: Key[] = [];
for (const k of WALL_KEYS) MK_WALL[WALL_MK[k] as number] = k;

/** A level under construction, read and written by terrain key. */
export interface Builder {
  rng: Rng;
  level: Level;
  def: LevelDef;
  opts: GenOptions;
  /** Terrain key of cell `i`; undefined for a terrain outside LevelTerrain (from `init`). */
  key(i: number): Key | undefined;
  /** Sets cell `i` to terrain key `k`, adding it to the palette when needed. */
  put(i: number, k: Key): void;
}

export function makeBuilder(rng: Rng, level: Level, def: LevelDef, opts: GenOptions): Builder {
  const keyOfId = new Map<DefId, Key>();
  for (const k of Object.keys(opts.terrain).sort() as Key[]) keyOfId.set(opts.terrain[k], k);
  return {
    rng,
    level,
    def,
    opts,
    key(i) {
      const id = level.palette[level.cells[i] ?? -1];
      return id === undefined ? undefined : keyOfId.get(id);
    },
    put(i, k) {
      const id = opts.terrain[k];
      let p = level.palette.indexOf(id);
      if (p === -1) p = level.palette.push(id) - 1;
      level.cells[i] = p;
    },
  };
}

export const has = (keys: readonly Key[], k: Key | undefined): boolean =>
  k !== undefined && keys.includes(k);

const ALTAR_BY_ALIGN: Record<string, Key> = {
  lawful: 'altar_lawful',
  neutral: 'altar_neutral',
  chaotic: 'altar_chaotic',
  noalign: 'altar_unaligned',
};
/** induced_align() without a level or dungeon alignment: rn2(3) - 1 (A_CHAOTIC..A_LAWFUL). */
const RND_ALTAR: readonly Key[] = ['altar_chaotic', 'altar_neutral', 'altar_lawful'];

/**
 * Feature `f` on cell `i`: a fountain, sink or tree does nothing on stairs or another feature
 * (sel_set_feature()); an altar only refuses stairs (set_levltyp()), and a `shrine` one is
 * added to `Level.shrines`. ref: src/sp_lev.c
 * lspo_feature(), create_altar(), sp_amask_to_amask(); src/dungeon.c induced_align()
 */
export function setFeature(b: Builder, i: number, f: FeatureDef): void {
  const old = b.key(i);
  if (f.kind !== 'altar') {
    if (!has(FURNITURE_KEYS, old)) b.put(i, f.kind);
    return;
  }
  if (old === 'stairs_up' || old === 'stairs_down') return;
  const align = f.align ?? 'random';
  b.put(i, align === 'random' ? (RND_ALTAR[b.rng.rn2(3)] as Key) : (ALTAR_BY_ALIGN[align] as Key));
  // AM_SHRINE: recorded for every shrine altar; the mod that owns the temple decides what
  // a shrine outside a temple room means (C gives it no AM_SHRINE)
  const { level } = b;
  const x = i % level.width;
  const y = Math.trunc(i / level.width);
  if (f.shrine === true && !level.shrines?.some((p) => p.x === x && p.y === y))
    (level.shrines ??= []).push({ x, y });
}
