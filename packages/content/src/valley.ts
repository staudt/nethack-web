// The Valley of the Dead: Gehennom's first level, with the temple of Moloch, three graveyards,
// the corpses of adventurers, undead and traps. ref: dat/valley.lua
//
// Translation notes (DEVIATIONS.md "The Valley of the Dead (m17)"): pure LevelDef data. The map's
// 'B' squares are NetHack's invisible boundaries (CROSSWALL), which stop the flood fill of an
// irregular region and become floor once the regions are laid out (sp_lev.c
// remove_boundary_syms()); here they are floor from the start, and the three irregular morgues are
// the rectangles their flood fills cover (so the second also takes in the boundary square at
// (15,18) and the floor behind it). The temple is C's (`filled = 2`: typed, not stocked); its shrine
// altar of Moloch gets its priest as any temple's shrine does (create_altar(): priestini()). The
// morgues are stocked by zoo.ts and make the level a graveyard (graveyard.ts). The flags
// ("mazelevel", "noteleport", "hardfloor", "nommap", "temperate") and the non-diggable map are
// levelflags.ts entries. "V" is an empty class until vampires exist, so those three are random
// monsters (as des.monster() makes for a class with nothing to pick), and the valkyries' corpses
// are human (no valkyrie row: its id is the hero's role's).
import type { DefId, LevelContent, LevelDef } from '@nh/core';
import { TEMPLE } from './epri';
import { GEHENNOM_SPECIALS } from './levelflags';
import { MORGUE } from './zoo';

/** ref: dat/valley.lua des.map() ('B': a boundary, floor once the regions are made) */
const RAW: readonly string[] = [
  '----------------------------------------------------------------------------',
  '|...S.|..|.....|  |.....-|      |................|   |...............| |...|',
  '|---|.|.--.---.|  |......--- ----..........-----.-----....---........---.-.|',
  '|   |.|.|..| |.| --........| |.............|   |.......---| |-...........--|',
  '|   |...S..| |.| |.......-----.......------|   |--------..---......------- |',
  '|----------- |.| |-......| |....|...-- |...-----................----       |',
  '|.....S....---.| |.......| |....|...|  |..............-----------          |',
  '|.....|.|......| |.....--- |......---  |....---.......|                    |',
  '|.....|.|------| |....--   --....-- |-------- ----....---------------      |',
  '|.....|--......---BBB-|     |...--  |.......|    |..................|      |',
  '|..........||........-|    --...|   |.......|    |...||.............|      |',
  '|.....|...-||-........------....|   |.......---- |...||.............--     |',
  '|.....|--......---...........--------..........| |.......---------...--    |',
  '|.....| |------| |--.......--|   |..B......----- -----....| |.|  |....---  |',
  '|.....| |......--| ------..| |----..B......|       |.--------.-- |-.....---|',
  '|------ |........|  |.|....| |.....----BBBB---------...........---.........|',
  '|       |........|  |...|..| |.....|  |-.............--------...........---|',
  '|       --.....-----------.| |....-----.....----------     |.........----  |',
  '|        |..|..B...........| |.|..........|.|              |.|........|    |',
  '----------------------------------------------------------------------------',
];

const MAP = RAW.map((row) => row.replaceAll('B', '.'));

const corpse = (montype: string): LevelContent => ({
  kind: 'object',
  id: 'nh:corpse',
  montype: montype as DefId,
});
const obj = (cls: string): LevelContent => ({ kind: 'object', class: cls });
const trap = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'trap', id: id as DefId }
    : { kind: 'trap', id: id as DefId, x, y };
const mon = (id: string): LevelContent => ({ kind: 'monster', id: id as DefId });
const cls = (c: string): LevelContent => ({ kind: 'monster', class: c });

/** ref: dat/valley.lua */
export const VALLEY: LevelDef = {
  id: GEHENNOM_SPECIALS.valley,
  // des.level_init({ style = "solidfill", fg = " " })
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: MAP },
  // Make the path somewhat unpredictable. If you get "lucky", you may have to go through all
  // three graveyards. (A 'B' boundary is floor.)
  edits: [
    {
      percent: 50,
      set: [
        { char: '-', line: [50, 8, 53, 8] },
        { char: '.', line: [40, 8, 43, 8] },
      ],
    },
    {
      percent: 50,
      set: [
        { char: '|', at: [27, 12] },
        { char: '.', line: [27, 3, 29, 3] },
        { char: '-', at: [28, 2] },
      ],
    },
    {
      percent: 50,
      set: [
        { char: '|', line: [16, 10, 16, 11] },
        { char: '.', line: [9, 13, 14, 13] },
      ],
    },
  ],
  regions: [
    // The shrine to Moloch (filled = 2: the room kind only)
    { area: [1, 6, 5, 14], lit: true, type: TEMPLE, filled: false },
    // The Morgues (irregular: the rectangles of their flood fills from {19,01}, {09,14}, {37,09})
    { area: [18, 1, 26, 8], lit: false, type: MORGUE, filled: true },
    { area: [9, 14, 16, 18], lit: false, type: MORGUE, filled: true },
    { area: [37, 9, 46, 14], lit: false, type: MORGUE, filled: true },
  ],
  stairs: {
    down: { x: 1, y: 1 },
    // Branch location: des.levregion({ type="branch", region={66,17,66,17} })
    branch: { x: 66, y: 17 },
  },
  teleportRegions: [{ area: [58, 9, 72, 18], dir: 'down' }],
  // Secret Doors
  doors: [
    { x: 4, y: 1, state: 'locked' },
    { x: 8, y: 4, state: 'locked' },
    { x: 6, y: 6, state: 'locked' },
  ],
  // The altar of Moloch.
  features: [{ kind: 'altar', x: 3, y: 10, align: 'noalign', shrine: true }],
  contents: [
    // **LOTS** of dead bodies (all human). note: no priest(esse)s or monks - maybe Moloch has a
    // *special* fate reserved for members of *those* classes.
    corpse('nh:archeologist'),
    corpse('nh:archeologist'),
    corpse('nh:barbarian'),
    corpse('nh:barbarian'),
    corpse('nh:caveman'),
    corpse('nh:caveman'), // "cavewoman" (corpses have no sex here)
    corpse('nh:healer'),
    corpse('nh:healer'),
    corpse('nh:knight'),
    corpse('nh:knight'),
    corpse('nh:ranger'),
    corpse('nh:ranger'),
    corpse('nh:rogue'),
    corpse('nh:rogue'),
    corpse('nh:samurai'),
    corpse('nh:samurai'),
    corpse('nh:tourist'),
    corpse('nh:tourist'),
    corpse('nh:human'), // "valkyrie"
    corpse('nh:human'), // "valkyrie"
    corpse('nh:wizard'),
    corpse('nh:wizard'),
    // Some random weapons and armor.
    obj('armor'),
    obj('armor'),
    obj('armor'),
    obj('armor'),
    obj('weapon'),
    obj('weapon'),
    obj('weapon'),
    obj('weapon'),
    // Some random loot.
    { kind: 'object', id: 'nh:ruby' },
    obj('gem'),
    obj('gem'),
    obj('potion'),
    obj('potion'),
    obj('potion'),
    obj('scroll'),
    obj('scroll'),
    obj('scroll'),
    obj('wand'),
    obj('wand'),
    obj('ring'),
    obj('ring'),
    obj('spellbook'),
    obj('spellbook'),
    obj('tool'),
    obj('tool'),
    obj('tool'),
    // (Not so) Random traps.
    trap('nh:spiked_pit', 5, 2),
    trap('nh:spiked_pit', 14, 5),
    trap('nh:sleeping_gas_trap', 3, 1),
    trap('nh:squeaky_board', 21, 12),
    trap('nh:squeaky_board'),
    trap('nh:dart_trap', 60, 1),
    trap('nh:dart_trap', 26, 17),
    trap('nh:anti_magic_field'),
    trap('nh:anti_magic_field'),
    trap('nh:magic_trap'),
    trap('nh:magic_trap'),
    // Random monsters. The ghosts.
    ...Array.from({ length: 6 }, () => mon('nh:ghost')),
    // Add a few bats for atmosphere.
    ...Array.from({ length: 3 }, () => mon('nh:vampire_bat')),
    // And a lich for good measure.
    cls('L'),
    // Some undead nasties for good measure
    // "V" x 3: a random monster until vampires exist (core refuses a class with no monster)
    { kind: 'monster', count: 3 },
    cls('Z'),
    cls('Z'),
    cls('Z'),
    cls('Z'),
    cls('M'),
    cls('M'),
    cls('M'),
    cls('M'),
  ],
};
