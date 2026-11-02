// The dungeons and their branches, and the levels that fill them. ref: dat/dungeon.lua
import type { DungeonDef, LevelDef } from '@nh/core';

/**
 * The filler level of the Gnomish Mines: a joined, walled cave of gnomes, dwarves and gems.
 * NetHack first does a solidfill of stone (whose random lighting draws one rn2(2)) and then the
 * mines init; the mines init alone makes the same map, so the extra roll is not drawn. Lighting
 * is a coin flip (lit omitted). Boulders do not exist yet, and `percent(50) and "h" or "G"` is two
 * independent 50% entries (see DEVIATIONS.md).
 * ref: dat/minefill.lua
 */
export const MINEFILL: LevelDef = {
  id: 'nh:minefill',
  init: { style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, walled: true },
  contents: [
    { kind: 'object', class: 'gem', count: { min: 2, max: 5 } }, // des.object("*")
    { kind: 'object', class: 'tool' }, // des.object("(")
    { kind: 'object', count: { min: 2, max: 4 } }, // des.object()
    // percent(75): des.object("boulder") x math.random(1, 2) -- no boulders yet
    { kind: 'monster', id: 'nh:gnome', count: { min: 6, max: 8 } },
    { kind: 'monster', id: 'nh:gnome_lord' },
    { kind: 'monster', id: 'nh:dwarf', count: 2 },
    { kind: 'monster', class: 'G', count: 2 },
    { kind: 'monster', class: 'h', percent: 50 }, // percent(50) and "h"
    { kind: 'monster', class: 'G', percent: 50 }, // ... or "G"
    { kind: 'trap', count: 6 },
  ],
};

export const LEVELS: readonly LevelDef[] = [MINEFILL];

/**
 * The Dungeons of Doom. NetHack gives it `rn1(5, 25)` levels with the Castle at the bottom;
 * without the Castle this port keeps it endless (see DEVIATIONS.md and `DUNGEON_BOTTOM`).
 * The Gnomish Mines: 8-9 levels entered by branch stairs down from DL2-4. Minetown and Mines'
 * End are not made, so every level is filler and the last one has no down stairs.
 * ref: dat/dungeon.lua ("The Gnomish Mines": base 8, range 2; branch base 2, range 3)
 */
export const DUNGEONS: readonly DungeonDef[] = [
  { id: 'nh:main', nameKey: 'nh:main' },
  {
    id: 'nh:mines',
    nameKey: 'nh:mines',
    levels: { base: 8, range: 2 },
    entry: { from: 'nh:main', base: 2, range: 3 },
    filler: 'nh:minefill',
  },
];
