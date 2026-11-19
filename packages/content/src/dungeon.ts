// The dungeons and their branches, and the levels that fill them. ref: dat/dungeon.lua
import type { DefId, DungeonDef, LevelDef, SpecialLevelDef } from '@nh/core';
import { ASMODEUS, ASMODEUS_FIXUP } from './asmodeus';
import { BAALZ, BAALZ_FIXUP } from './baalz';
import { BIGROOM_FIXUPS, BIGROOM_VARIANTS } from './bigroom';
import { CASTLE_FIXUP, CASTLE_LEVEL } from './castle';
import { FAKEWIZ1, FAKEWIZ1_FIXUP, FAKEWIZ2, FAKEWIZ2_FIXUP } from './fakewiz';
import {
  GEHENNOM,
  GEHENNOM_SPECIALS as G,
  KNOX,
  LUDIOS,
  PLANES,
  PLANE_LEVELS,
  QGOAL,
  QLOCATE,
  QSTART,
  QUEST,
  TOWER_LEVELS,
  VLAD,
} from './levelflags';
import {
  QUEST_FIXUPS,
  QUEST_LEVEL_DEFS,
  QUEST_ROLE_FILLER,
  QUEST_ROLE_VARIANTS,
  QUEST_STANDIN,
} from './quest/index';
import { HELLFILL, HELLFILL_FIXUP } from './hellfill';
import { JUIBLEX, JUIBLEX_FIXUP } from './juiblex';
import { KNOX_FIXUP, KNOX_LEVEL } from './knox';
import { MAZEFILL, MAZEFILL_FIXUP } from './mazefill';
import { MEDUSA_FIXUPS, MEDUSA_VARIANTS } from './medusa';
import { MINEND_FIXUPS, MINEND_VARIANTS } from './minesend';
import { MINETOWN_VARIANTS } from './minetown';
import { MINETN_1, ORCTOWN_FIXUP } from './orctown';
import { ORACLE_LEVEL } from './oracle';
import { ORCUS_TOWN, ORCUS_TOWN_FIXUP } from './orcus';
import { PLANE_FIXUPS, PLANE_LEVEL_DEFS, PLANE_STANDIN } from './planes';
import { ROGUE_FIXUP, ROGUE_LEVEL } from './rogue';
import { SOKOBAN_VARIANTS } from './sokoban';
import type { SpLevFixup } from './sp_lev';
import { SOKOBAN_PRIZE_FIXUPS } from './sokoprize';
import { SANCTUM, SANCTUM_FIXUP } from './sanctum';
import { TOWER_FIXUPS, VLAD_TOWER } from './tower';
import { VALLEY } from './valley';
import { WIZARD1, WIZARD1_FIXUP, WIZARD2, WIZARD2_FIXUP, WIZARD3, WIZARD3_FIXUP } from './wiztower';

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

/** Gehennom's filler: hellfill.lua's level (hellfill.ts). ref: dat/dungeon.lua lvlfill = "hellfill" */
export const GEHENNOM_FILLER: DefId = HELLFILL.id;

/**
 * Gehennom's special levels in dungeon.lua's order, each built from its own LevelDef (the Valley's
 * is valley.ts, Juiblex's swamp juiblex.ts, Baalzebub's and Asmodeus's lairs baalz.ts and
 * asmodeus.ts, Orcus Town orcus.ts, the Wizard's Tower wiztower.ts, the fake towers fakewiz.ts,
 * the Sanctum sanctum.ts, reached only in wizard mode until the invocation: see levelflags.ts
 * dngBottom(); one variant: no `rnd()` draw). ref: dat/dungeon.lua "Gehennom" levels (valley base 1; sanctum
 * base -1; juiblex base 4, range 4; baalz base 6, range 4; asmodeus base 2, range 6; wizard1 base
 * 11, range 6; wizard2 chainlevel "wizard1", base 1; wizard3 chainlevel "wizard1", base 2; orcus
 * base 10, range 6; fakewiz1 and fakewiz2 base -6, range 4)
 */
const GEHENNOM_SPECIAL: SpecialLevelDef[] = [
  { id: G.valley, nameKey: 'level.valley', base: 1, variants: [VALLEY.id] },
  { id: G.sanctum, nameKey: 'level.sanctum', base: -1, variants: [SANCTUM.id] },
  { id: G.juiblex, nameKey: 'level.juiblex', base: 4, range: 4, variants: [JUIBLEX.id] },
  { id: G.baalz, nameKey: 'level.baalz', base: 6, range: 4, variants: [BAALZ.id] },
  { id: G.asmodeus, nameKey: 'level.asmodeus', base: 2, range: 6, variants: [ASMODEUS.id] },
  { id: G.wizard1, nameKey: 'level.wizard1', base: 11, range: 6, variants: [WIZARD1.id] },
  {
    id: G.wizard2,
    nameKey: 'level.wizard2',
    chain: G.wizard1,
    base: 1,
    variants: [WIZARD2.id],
  },
  {
    id: G.wizard3,
    nameKey: 'level.wizard3',
    chain: G.wizard1,
    base: 2,
    variants: [WIZARD3.id],
  },
  { id: G.orcus, nameKey: 'level.orcus', base: 10, range: 6, variants: [ORCUS_TOWN.id] },
  { id: G.fakewiz1, nameKey: 'level.fakewiz1', base: -6, range: 4, variants: [FAKEWIZ1.id] },
  { id: G.fakewiz2, nameKey: 'level.fakewiz2', base: -6, range: 4, variants: [FAKEWIZ2.id] },
];

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
  ORCUS_TOWN,
  WIZARD1,
  WIZARD2,
  WIZARD3,
  FAKEWIZ1,
  FAKEWIZ2,
  ROGUE_LEVEL,
  KNOX_LEVEL,
  ...VLAD_TOWER,
  PLANE_STANDIN,
  ...PLANE_LEVEL_DEFS,
  SANCTUM,
  ...QUEST_LEVEL_DEFS,
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
  [ORCUS_TOWN.id]: ORCUS_TOWN_FIXUP,
  [WIZARD1.id]: WIZARD1_FIXUP,
  [WIZARD2.id]: WIZARD2_FIXUP,
  [WIZARD3.id]: WIZARD3_FIXUP,
  [FAKEWIZ1.id]: FAKEWIZ1_FIXUP,
  [FAKEWIZ2.id]: FAKEWIZ2_FIXUP,
  [ROGUE_LEVEL.id]: ROGUE_FIXUP,
  [KNOX_LEVEL.id]: KNOX_FIXUP,
  ...TOWER_FIXUPS,
  [SANCTUM.id]: SANCTUM_FIXUP,
  ...PLANE_FIXUPS,
  ...QUEST_FIXUPS,
};

/**
 * The Dungeons of Doom: `rn1(5, 25)` levels. Its special levels in dungeon.lua's order: the Rogue
 * level on DL15-18 (rogue.ts), the Oracle on DL5-9 (oracle.ts), the big room on DL10-12
 * in 40% of games (one of 13 variants, bigroom.ts), Medusa's island 1-4 levels above the bottom
 * (one of 4, medusa.ts) and the Castle on the last level (castle.ts). Below Medusa its ordinary
 * levels are mazes 4 times in 5 (`nh:mazefill`, mazefill.ts).
 * Gehennom: `rn1(5, 20)` levels below the Castle, chained to it with no stairs at the Castle's
 * end ("no_down"): the Castle's trap doors and level teleports lead in, and its entry level's up
 * stairs lead back to the Castle's `up` teleport region. Its eleven special levels are placed
 * (GEHENNOM_SPECIAL); the Valley of the Dead, the three demon lairs, Orcus Town, the Wizard's
 * Tower and the fake towers are built (valley.ts, juiblex.ts, baalz.ts, asmodeus.ts, orcus.ts,
 * wiztower.ts, fakewiz.ts, sanctum.ts); every other level is hellfill.lua's
 * (hellfill.ts). Vlad's Tower's branch leaves from one of its levels 9-13.
 * It comes second, as in dungeon.lua, so its rolls come before the Mines'.
 * The Gnomish Mines: 8-9 levels entered by branch stairs down from DL2-4, with Minetown on its
 * level 3 or 4 (one of seven variants, see minetown.ts) and Mines' End (one of three, see
 * minesend.ts) on its last level, which has no down stairs; the other levels are filler.
 * Sokoban: 4 levels above the main dungeon, entered by branch stairs up from the level below the
 * Oracle onto its bottom level (`entry = -1`), whose depth is the Oracle's; each level is one of
 * two variants (sokoban.ts), so it has no filler. Its "mazelike" flag and neutral alignment are
 * not modelled.
 * The Quest (m24): 5-6 levels behind a magic portal 6-7 levels below the Oracle, at the depth of
 * the portal's level ("portals stay on the same depth"), with the home level first, the locate
 * level third and the goal level last; the hero's role picks their LevelDefs and the fillers
 * above and below the locate level (quest/index.ts; a role not ported yet gets the stand-in and
 * no portal). Its portals are branchportal.ts's. It comes after the Mines and before Sokoban, as
 * in dungeon.lua.
 * Fort Ludios: one level (knox.ts), its branch rolled on DL18-21 of the main dungeon, which gives
 * its depth (18-21: a portal branch) but no stairs at either end: C makes the main dungeon's end
 * a floating one until a vault's magic portal is placed (the knox kludge of
 * fixup_level_locations()). It comes after Sokoban, as in dungeon.lua.
 * Vlad's Tower: three levels (tower.ts) entered at the bottom by branch stairs up from Gehennom's
 * level 9-13 and climbed by ladders.
 * The Elemental Planes: six levels above DL1 (Astral -4 .. Earth 0, the dummy level 1), entered
 * on Earth (`entryLevel` -2). C's branch is "no_down" upwards (BR_NO_END2: stairs on DL1, none on
 * Earth): DL1's up stairs, which leave the dungeon, are that staircase, so here the branch adds
 * no stairs on DL1 (`stairs: 'child'`) and each plane's fixup lifts every stair core makes
 * (planes.ts). DL1's up stairs lead to Earth with the Amulet (endgame.ts).
 * Both come after Fort Ludios in dungeon.lua's order (the Tutorial after them is left out); core
 * rolls each dungeon after its parent's children (registry orderDungeons()), so the Planes' rolls
 * (a child of the main dungeon) come before Vlad's (a child of Gehennom), the other way round in
 * C.
 * ref: dat/dungeon.lua ("The Dungeons of Doom": base 25, range 5; oracle: base 5, range 5;
 * bigrm: base 10, range 3, chance 40, nlevels 13; medusa: base -5, range 4, nlevels 4; castle:
 * base -1; "Gehennom": base 20, range 5, its branch: chainlevel "castle", base 0, branchtype
 * "no_down"; "The Gnomish Mines": base 8, range 2; branch base 2, range 3; minetn: base 3, range 2,
 * nlevels 7, flags "town"; minend: base -1, nlevels 3; "The Quest": base 5, range 2, x-strt base 1,
 * x-loca base 3, x-goal base -1; its branch: chainlevel "oracle", base 6, range 2, branchtype
 * "portal"; "Sokoban": base 4, entry -1, soko1..soko4
 * at base 1..4, nlevels 2 each; its branch: chainlevel "oracle", base 1, direction "up"; rogue: base
 * 15, range 4; "Fort Ludios": base 1, knox base -1; its branch: base 18, range 4, branchtype
 * "portal"; "Vlad's Tower": base 3, entry -1, tower1..tower3 at base 1..3; its branch in
 * Gehennom: base 9, range 5, direction "up"; "The Elemental Planes": base 6, entry -2, astral,
 * water, fire, air, earth, dummy at base 1..6; its branch: base 1, branchtype "no_down", direction
 * "up"); src/dungeon.c fixup_level_locations(), correct_branch_type()
 */
export const DUNGEONS: readonly DungeonDef[] = [
  {
    id: 'nh:main',
    nameKey: 'nh:main',
    levels: { base: 25, range: 5 },
    special: [
      { id: 'nh:rogue', nameKey: 'level.rogue', base: 15, range: 4, variants: [ROGUE_LEVEL.id] },
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
    id: QUEST,
    nameKey: QUEST,
    levels: { base: 5, range: 2 },
    entry: { from: 'nh:main', chain: 'nh:oracle', base: 6, range: 2, stairs: 'portal' },
    // a role whose levels are not ported yet: the stand-in everywhere (plan Q10)
    filler: QUEST_STANDIN.id,
    special: [
      {
        id: QSTART,
        nameKey: 'level.qstart',
        base: 1,
        variants: [QUEST_STANDIN.id],
        roleVariants: QUEST_ROLE_VARIANTS.strt,
      },
      {
        id: QLOCATE,
        nameKey: 'level.qlocate',
        base: 3,
        variants: [QUEST_STANDIN.id],
        roleVariants: QUEST_ROLE_VARIANTS.loca,
      },
      {
        id: QGOAL,
        nameKey: 'level.qgoal',
        base: -1,
        variants: [QUEST_STANDIN.id],
        roleVariants: QUEST_ROLE_VARIANTS.goal,
      },
    ],
    roleFiller: { split: QLOCATE, byRole: QUEST_ROLE_FILLER },
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
  {
    id: LUDIOS,
    nameKey: LUDIOS,
    levels: { base: 1 },
    // branchtype "portal": stairs at neither end, a vault's portal and the fort's (knox.ts)
    entry: { from: 'nh:main', base: 18, range: 4, stairs: 'portal' },
    special: [{ id: KNOX, nameKey: 'level.knox', base: -1, variants: [KNOX_LEVEL.id] }],
  },
  {
    id: VLAD,
    nameKey: VLAD,
    levels: { base: 3 },
    entryLevel: -1,
    entry: { from: GEHENNOM, base: 9, range: 5, dir: 'up' },
    special: (['tower1', 'tower2', 'tower3'] as const).map((k, i) => ({
      id: TOWER_LEVELS[k],
      nameKey: `level.${k}`,
      base: i + 1,
      variants: [TOWER_LEVELS[k]],
    })),
  },
  {
    id: PLANES,
    nameKey: PLANES,
    levels: { base: 6 },
    entryLevel: -2,
    entry: { from: 'nh:main', base: 1, dir: 'up', stairs: 'child' },
    special: (['astral', 'water', 'fire', 'air', 'earth', 'dummy'] as const).map((k, i) => ({
      id: PLANE_LEVELS[k],
      nameKey: `level.plane_${k}`,
      base: i + 1,
      // Earth, Air, Fire, Water (planes.ts) and Astral (astral.ts) are built; the dummy level
      // is the stand-in
      variants: [PLANE_LEVEL_DEFS.find((d) => d.id === PLANE_LEVELS[k])?.id ?? PLANE_STANDIN.id],
    })),
  },
];
