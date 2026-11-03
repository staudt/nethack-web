// Alignment values and altar alignments: the leaf of align.ts, for modules below it (the
// priest's table, monster names). ref: include/align.h
import type { DefId } from '@nh/core';
import { T } from './terrain';

/** ref: include/align.h A_NONE, A_CHAOTIC, A_NEUTRAL, A_LAWFUL */
export const A_NONE = -128;
export const A_CHAOTIC = -1;
export const A_NEUTRAL = 0;
export const A_LAWFUL = 1;
export type Aligntyp = -1 | 0 | 1 | typeof A_NONE;

/** ref: include/align.h ALGN_SINNED, ALGN_DEVOUT (alignment record thresholds) */
export const ALGN_SINNED = -4;
export const ALGN_DEVOUT = 14;

const ALTARS: Readonly<Record<string, Aligntyp>> = {
  [T.altar_lawful]: A_LAWFUL,
  [T.altar_neutral]: A_NEUTRAL,
  [T.altar_chaotic]: A_CHAOTIC,
  [T.altar_unaligned]: A_NONE,
};

/** The alignment of an altar terrain, or null for any other terrain. ref: Amask2align() */
export function altarAlign(terrain: DefId): Aligntyp | null {
  return ALTARS[terrain] ?? null;
}
