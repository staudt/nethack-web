// The dungeons and their branches, and the levels that fill them. ref: dat/dungeon.lua
import type { DefId, DungeonDef, LevelDef, SpecialLevelDef } from '@nh/core';
import { ASMODEUS, ASMODEUS_FIXUP } from './asmodeus';
import { BAALZ, BAALZ_FIXUP } from './baalz';
import { BIGROOM_FIXUPS, BIGROOM_VARIANTS } from './bigroom';
import { CASTLE_FIXUP, CASTLE_LEVEL } from './castle';
import { GEHENNOM, GEHENNOM_SPECIALS as G } from './levelflags';
import { HELLFILL, HELLFILL_FIXUP } from './hellfill';
import { JUIBLEX, JUIBLEX_FIXUP } from './juiblex';
import { MAZEFILL, MAZEFILL_FIXUP } from './mazefill';
import { MEDUSA_FIXUPS, MEDUSA_VARIANTS } from './medusa';
import { MINEND_FIXUPS, MINEND_VARIANTS } from './minesend';
import { MINETOWN_VARIANTS } from './minetown';
import { MINETN_1, ORCTOWN_FIXUP } from './orctown';
import { ORACLE_LEVEL } from './oracle';
import { SOKOBAN_VARIANTS } from './sokoban';
import type { SpLevFixup } from './sp_lev';
import { SOKOBAN_PRIZE_FIXUPS } from './sokoprize';
import { VALLEY } from './valley';

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

/**
 * Gehennom's filler, and the stand-in of each of its special levels until that level's own
 * LevelDef lands: hellfill.lua's level (hellfill.ts). ref: dat/dungeon.lua lvlfill = "hellfill"
 */
export const GEHENNOM_FILLER: DefId = HELLFILL.id;

/**
 * Gehennom's special levels in dungeon.lua's order, each built as GEHENNOM_FILLER until its own
 * LevelDef lands (the Valley's is valley.ts, Juiblex's swamp juiblex.ts, Baalzebub's and
 * Asmodeus's lairs baalz.ts and asmodeus.ts; one variant: no `rnd()` draw). The Sanctum is placed
 * but never reached (no invocation: see
 * levelflags.ts dngBottom()). ref: dat/dungeon.lua "Gehennom" levels (valley base 1; sanctum
 * base -1; juiblex base 4, range 4; baalz base 6, range 4; asmodeus base 2, range 6; wizard1 base
 * 11, range 6; wizard2 chainlevel "wizard1", base 1; wizard3 chainlevel "wizard1", base 2; orcus
 * base 10, range 6; fakewiz1 and fakewiz2 base -6, range 4)
 */
const GEHENNOM_SPECIAL: SpecialLevelDef[] = [
  { id: G.valley, nameKey: 'level.valley', base: 1, variants: [VALLEY.id] },
  { id: G.sanctum, nameKey: 'level.sanctum', base: -1 },
  { id: G.juiblex, nameKey: 'level.juiblex', base: 4, range: 4, variants: [JUIBLEX.id] },
  { id: G.baalz, nameKey: 'level.baalz', base: 6, range: 4, variants: [BAALZ.id] },
  { id: G.asmodeus, nameKey: 'level.asmodeus', base: 2, range: 6, variants: [ASMODEUS.id] },
  { id: G.wizard1, nameKey: 'level.wizard1', base: 11, range: 6 },
  { id: G.wizard2, nameKey: 'level.wizard2', chain: G.wizard1, base: 1 },
  { id: G.wizard3, nameKey: 'level.wizard3', chain: G.wizard1, base: 2 },
  { id: G.orcus, nameKey: 'level.orcus', base: 10, range: 6 },
  { id: G.fakewiz1, nameKey: 'level.fakewiz1', base: -6, range: 4 },
  { id: G.fakewiz2, nameKey: 'level.fakewiz2', base: -6, range: 4 },
].map((sp) => ({ variants: [GEHENNOM_FILLER], ...sp }));

export const LEVELS: readonly LevelDef[] = [
  MINEFILL,
  MAZEFILL,
  ...MINETOWN_VARIANTS,
  ...MINEND_VARIANTS,
  ORACLE_LEVEL,
  ...SOKOBAN_VARIANTS.flat(),
  ...BIGROOM_VARIANTS,
  ...MEDUSA_VARIANTS,
  CASTLE_LEVEL,
  VALLEY,
  HELLFILL,
  JUIBLEX,
  BAALZ,
  ASMODEUS,
];

/** The special levels' fixups, by LevelDef id (registerSpLev). ref: src/mkmaze.c fixup_special() */
export const SPLEV_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [MAZEFILL.id]: MAZEFILL_FIXUP,
  ...MINEND_FIXUPS,
  [MINETN_1.id]: ORCTOWN_FIXUP,
  ...SOKOBAN_PRIZE_FIXUPS,
  ...BIGROOM_FIXUPS,
  ...MEDUSA_FIXUPS,
  [CASTLE_LEVEL.id]: CASTLE_FIXUP,
  [HELLFILL.id]: HELLFILL_FIXUP,
  [JUIBLEX.id]: JUIBLEX_FIXUP,
  [BAALZ.id]: BAALZ_FIXUP,
  [ASMODEUS.id]: ASMODEUS_FIXUP,
};

/**
 * The Dungeons of Doom: `rn1(5, 25)` levels. Its special levels in dungeon.lua's order (the rogue
 * level is left out and draws nothing): the Oracle on DL5-9 (oracle.ts), the big room on DL10-12
 * in 40% of games (one of 13 variants, bigroom.ts), Medusa's island 1-4 levels above the bottom
 * (one of 4, medusa.ts) and the Castle on the last level (castle.ts). Below Medusa its ordinary
 * levels are mazes 4 times in 5 (`nh:mazefill`, mazefill.ts).
 * Gehennom: `rn1(5, 20)` levels below the Castle, chained to it with no stairs at the Castle's
 * end ("no_down"): the Castle's trap doors and level teleports lead in, and its entry level's up
 * stairs lead back to the Castle's `up` teleport region. Its eleven special levels are placed
 * (GEHENNOM_SPECIAL); the Valley of the Dead and the three demon lairs are built (valley.ts,
 * juiblex.ts, baalz.ts, asmodeus.ts), the others as the filler until their own step; every other level is hellfill.lua's (hellfill.ts). Vlad's Tower is left out
 * and draws nothing (ROADMAP).
 * It comes second, as in dungeon.lua, so its rolls come before the Mines'.
 * The Gnomish Mines: 8-9 levels entered by branch stairs down from DL2-4, with Minetown on its
 * level 3 or 4 (one of seven variants, see minetown.ts) and Mines' End (one of three, see
 * minesend.ts) on its last level, which has no down stairs; the other levels are filler.
 * Sokoban: 4 levels above the main dungeon, entered by branch stairs up from the level below the
 * Oracle onto its bottom level (`entry = -1`), whose depth is the Oracle's; each level is one of
 * two variants (sokoban.ts), so it has no filler. Its "mazelike" flag and neutral alignment are
 * not modelled.
 * ref: dat/dungeon.lua ("The Dungeons of Doom": base 25, range 5; oracle: base 5, range 5;
 * bigrm: base 10, range 3, chance 40, nlevels 13; medusa: base -5, range 4, nlevels 4; castle:
 * base -1; "Gehennom": base 20, range 5, its branch: chainlevel "castle", base 0, branchtype
 * "no_down"; "The Gnomish Mines": base 8, range 2; branch base 2, range 3; minetn: base 3, range 2,
 * nlevels 7, flags "town"; minend: base -1, nlevels 3; "Sokoban": base 4, entry -1, soko1..soko4
 * at base 1..4, nlevels 2 each; its branch: chainlevel "oracle", base 1, direction "up")
 */
export const DUNGEONS: readonly DungeonDef[] = [
  {
    id: 'nh:main',
    nameKey: 'nh:main',
    levels: { base: 25, range: 5 },
    special: [
      { id: 'nh:oracle', nameKey: 'nh:oracle', base: 5, range: 5, variants: [ORACLE_LEVEL.id] },
      {
        id: 'nh:bigroom',
        nameKey: 'nh:bigroom',
        base: 10,
        range: 3,
        chance: 40,
        variants: BIGROOM_VARIANTS.map((l) => l.id),
      },
      {
        id: 'nh:medusa',
        nameKey: 'nh:medusa',
        base: -5,
        range: 4,
        variants: MEDUSA_VARIANTS.map((l) => l.id),
      },
      { id: CASTLE_LEVEL.id, nameKey: CASTLE_LEVEL.id, base: -1, variants: [CASTLE_LEVEL.id] },
    ],
    // ref: src/mklev.c makelevel(): `rn2(5) && depth > depth(&medusa_level)` makes a maze
    mazeFiller: { below: 'nh:medusa', def: MAZEFILL.id, roomsOneIn: 5 },
  },
  {
    id: GEHENNOM,
    nameKey: GEHENNOM,
    levels: { base: 20, range: 5 },
    entry: { from: 'nh:main', chain: CASTLE_LEVEL.id, base: 0, stairs: 'child' },
    // ref: dat/dungeon.lua Gehennom's lvlfill = "hellfill"; src/mklev.c makelevel()
    filler: GEHENNOM_FILLER,
    special: GEHENNOM_SPECIAL,
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
