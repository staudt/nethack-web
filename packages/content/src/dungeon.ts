// The dungeons and their branches, and the levels that fill them. ref: dat/dungeon.lua
import type { DefId, DungeonDef, LevelDef } from '@nh/core';
import { MINEND_FIXUPS, MINEND_VARIANTS } from './minesend';
import { MINETOWN_VARIANTS } from './minetown';
import { MINETN_1, ORCTOWN_FIXUP } from './orctown';
import { ORACLE_LEVEL } from './oracle';
import { SOKOBAN_VARIANTS } from './sokoban';
import type { SpLevFixup } from './sp_lev';
import { SOKOBAN_PRIZE_FIXUPS } from './sokoprize';

/**
 * The filler level of the Gnomish Mines: a joined, walled cave of gnomes, dwarves and gems.
 * NetHack first does a solidfill of stone (whose random lighting draws one rn2(2)) and then the
 * mines init; the mines init alone makes the same map, so the extra roll is not drawn. Lighting
 * is a coin flip (lit omitted). `percent(50) and "h" or "G"` is two independent 50% entries (see
 * DEVIATIONS.md).
 * ref: dat/minefill.lua
 */
export const MINEFILL: LevelDef = {
  id: 'nh:minefill',
  init: { style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, walled: true },
  contents: [
    { kind: 'object', class: 'gem', count: { min: 2, max: 5 } }, // des.object("*")
    { kind: 'object', class: 'tool' }, // des.object("(")
    { kind: 'object', count: { min: 2, max: 4 } }, // des.object()
    { kind: 'object', id: 'nh:boulder', percent: 75, count: { min: 1, max: 2 } },
    { kind: 'monster', id: 'nh:gnome', count: { min: 6, max: 8 } },
    { kind: 'monster', id: 'nh:gnome_lord' },
    { kind: 'monster', id: 'nh:dwarf', count: 2 },
    { kind: 'monster', class: 'G', count: 2 },
    { kind: 'monster', class: 'h', percent: 50 }, // percent(50) and "h"
    { kind: 'monster', class: 'G', percent: 50 }, // ... or "G"
    { kind: 'trap', count: 6 },
  ],
};

export const LEVELS: readonly LevelDef[] = [
  MINEFILL,
  ...MINETOWN_VARIANTS,
  ...MINEND_VARIANTS,
  ORACLE_LEVEL,
  ...SOKOBAN_VARIANTS.flat(),
];

/** The special levels' fixups, by LevelDef id (registerSpLev). ref: src/mkmaze.c fixup_special() */
export const SPLEV_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  ...MINEND_FIXUPS,
  [MINETN_1.id]: ORCTOWN_FIXUP,
  ...SOKOBAN_PRIZE_FIXUPS,
};

/**
 * The Dungeons of Doom. NetHack gives it `rn1(5, 25)` levels with the Castle at the bottom;
 * without the Castle this port keeps it endless (see DEVIATIONS.md and `DUNGEON_BOTTOM`). Its
 * one special level so far is the Oracle on DL5-9 (oracle.ts).
 * The Gnomish Mines: 8-9 levels entered by branch stairs down from DL2-4, with Minetown on its
 * level 3 or 4 (one of seven variants, see minetown.ts) and Mines' End (one of three, see
 * minesend.ts) on its last level, which has no down stairs; the other levels are filler.
 * Sokoban: 4 levels above the main dungeon, entered by branch stairs up from the level below the
 * Oracle onto its bottom level (`entry = -1`), whose depth is the Oracle's; each level is one of
 * two variants (sokoban.ts), so it has no filler. Its "mazelike" flag and neutral alignment are
 * not modelled.
 * ref: dat/dungeon.lua (oracle: base 5, range 5; "The Gnomish Mines": base 8, range 2; branch base 2, range 3;
 * minetn: base 3, range 2, nlevels 7, flags "town"; minend: base -1, nlevels 3; "Sokoban": base 4,
 * entry -1, soko1..soko4 at base 1..4, nlevels 2 each; its branch: chainlevel "oracle", base 1,
 * direction "up")
 */
export const DUNGEONS: readonly DungeonDef[] = [
  {
    id: 'nh:main',
    nameKey: 'nh:main',
    special: [
      { id: 'nh:oracle', nameKey: 'nh:oracle', base: 5, range: 5, variants: [ORACLE_LEVEL.id] },
    ],
  },
  {
    id: 'nh:mines',
    nameKey: 'nh:mines',
    levels: { base: 8, range: 2 },
    entry: { from: 'nh:main', base: 2, range: 3 },
    filler: 'nh:minefill',
    special: [
      {
        id: 'nh:minetown',
        nameKey: 'nh:minetown',
        base: 3,
        range: 2,
        variants: MINETOWN_VARIANTS.map((l) => l.id),
        town: true,
      },
      {
        id: 'nh:minesend',
        nameKey: 'nh:minesend',
        base: -1,
        variants: MINEND_VARIANTS.map((l) => l.id),
      },
    ],
  },
  {
    id: 'nh:sokoban',
    nameKey: 'nh:sokoban',
    levels: { base: 4 },
    entryLevel: -1,
    entry: { from: 'nh:main', chain: 'nh:oracle', base: 1, dir: 'up' },
    special: SOKOBAN_VARIANTS.map(([a, b], i) => ({
      id: `nh:soko${String(i + 1)}`,
      nameKey: `nh:soko${String(i + 1)}`,
      base: i + 1,
      variants: [a.id, b.id],
    })),
  },
];
