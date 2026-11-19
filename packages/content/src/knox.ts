// Fort Ludios: the one level of its branch, reached by a magic portal hidden in a vault: a fort
// in a moat with its throne room (Croesus on the throne), treasury, barracks, welcoming zoo,
// corner towers of gems, soldiers, dragons and eels. ref: dat/knox.lua; src/mkmaze.c
// fixup_special(); src/dungeon.c fixup_level_locations() (the floating knox entrance)
//
// Translation notes (see DEVIATIONS.md "Fort Ludios"): the map, the doors, the lit and unlit
// regions, the typed rooms and the teleport regions are LevelDef data; "mazelevel",
// "noteleport" and the non_diggable area are levelflags.ts entries. The fixup runs the script's
// random parts in its order: Croesus and his throne, the fort's secret entry, the treasury's
// gold and traps (selection_iterate()'s column order), the vault entrance, then the monsters
// and the gems; it records the monster-generation exclusions (MadeLevelFlags.mongenExclude),
// joins the walls and draws the branch levregion's one cell (place_lregion()'s two `rn1(1, x)`)
// as fixup_special() does. The rooms are filled after it (zoo.ts), in room order as
// lspo_finalize_level() does: the court (its ruler cannot stand on the throne Croesus holds),
// the zoo, the barracks. The treasury ("ordinary", not irregular) makes no Room in C either; the
// arrival chamber makes none here (as Medusa's). The irregular zoo and barracks are flood fills
// in C; a Room is a rectangle here, so each is the rectangles its flood fill covers, each a room
// of its own. As C marks the branch's main-dungeon end bogus until a vault's portal re-inserts
// it, the branch (a portal branch) has stairs at neither end: the portal back to the vault goes
// on the branch spot (src/mklev.c place_branch()).
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect } from '@nh/core';
import { VANILLA_TERRAIN, levelDefRect, wallifyLevel } from '@nh/core';
import { mkgold } from './items';
import { KNOX, setMadeLevelFlags } from './levelflags';
import { knoxSource } from './knoxstate';
import { MAGIC_PORTAL, portalData } from './portal';
import { percent, ter } from './selection';
import { makeContents, mapToLevel, orientDoors, placeLregion, type SpLevFixup } from './sp_lev';
import { setTerrain } from './terrain';
import { maketrap } from './trap';
import { BARRACKS, COURT, ZOO } from './zoo';

const MAP: readonly string[] = [
  '----------------------------------------------------------------------------',
  '| |........|...............................................................|',
  '| |........|.................................................------------..|',
  '| --S----S--.................................................|..........|..|',
  '|   #   |........}}}}}}}....................}}}}}}}..........|..........|..|',
  '|   #   |........}-----}....................}-----}..........--+--+--...|..|',
  '|   # ---........}|...|}}}}}}}}}}}}}}}}}}}}}}|...|}.................|...|..|',
  '|   # |..........}---S------------------------S---}.................|...|..|',
  '|   # |..........}}}|...............|..........|}}}.................+...|..|',
  '| --S----..........}|...............S..........|}...................|...|..|',
  '| |.....|..........}|...............|......\\...S}...................|...|..|',
  '| |.....+........}}}|...............|..........|}}}.................+...|..|',
  '| |.....|........}---S------------------------S---}.................|...|..|',
  '| |.....|........}|...|}}}}}}}}}}}}}}}}}}}}}}|...|}.................|...|..|',
  '| |..-S----......}-----}....................}-----}..........--+--+--...|..|',
  '| |..|....|......}}}}}}}....................}}}}}}}..........|..........|..|',
  '| |..|....|..................................................|..........|..|',
  '| -----------................................................------------..|',
  '|           |..............................................................|',
  '----------------------------------------------------------------------------',
];

const lit = (area: LevelRect) => ({ area, lit: true });
const unlit = (area: LevelRect) => ({ area, lit: false });

/** des.levregion({ region = {08,16,08,16}, type="branch" }): the portal arrival point. */
const BRANCH_SPOT: LevelRect = [8, 16, 8, 16];

/** ref: dat/knox.lua */
export const KNOX_LEVEL: LevelDef = {
  id: KNOX,
  // des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:stone' },
  map: { rows: [...MAP] },
  // accessible via ^V in wizard mode; arrive near the portal
  teleportRegions: [
    { area: [6, 15, 9, 16], dir: 'up' },
    { area: [6, 15, 9, 16], dir: 'down' },
  ],
  regions: [
    // Throne room, with Croesus on the throne (filled after him)
    { area: [37, 8, 46, 11], lit: true, type: COURT, filled: true },
    // The Vault: an "ordinary" region, so only lit (room_not_needed)
    lit([21, 8, 35, 11]),
    // Corner towers
    lit([19, 6, 21, 6]),
    lit([46, 6, 48, 6]),
    lit([19, 13, 21, 13]),
    lit([46, 13, 48, 13]),
    // A welcoming committee (irregular: its flood fill from {03,10} also takes the two columns
    // below the region)
    { area: [3, 10, 7, 13], lit: true, type: ZOO, filled: true },
    { area: [3, 14, 4, 16], lit: true, type: ZOO, filled: true },
    // arrival chamber (an arrival room in C: no Room here)
    unlit([6, 15, 9, 16]),
    // Force left and top walls of the arrival chamber to be unlit
    unlit([5, 14, 5, 17]),
    unlit([5, 14, 9, 14]),
    // Barracks (irregular: its flood fill from {62,03} runs down the east side to the south
    // wing)
    { area: [62, 3, 71, 4], lit: true, type: BARRACKS, filled: true },
    { area: [69, 5, 71, 14], lit: true, type: BARRACKS, filled: true },
    { area: [62, 15, 71, 16], lit: true, type: BARRACKS, filled: true },
  ],
  doors: [
    { x: 6, y: 14, state: 'closed' },
    { x: 9, y: 3, state: 'closed' },
    { x: 63, y: 5, state: 'open' },
    { x: 66, y: 5, state: 'open' },
    { x: 68, y: 8, state: 'open' },
    { x: 8, y: 11, state: 'locked' },
    { x: 68, y: 11, state: 'open' },
    { x: 63, y: 14, state: 'closed' },
    { x: 66, y: 14, state: 'closed' },
    { x: 4, y: 3, state: 'closed' },
    { x: 4, y: 9, state: 'closed' },
  ],
};

const monAt = (id: string, x: number, y: number): LevelContent => ({
  kind: 'monster',
  id: id as DefId,
  x,
  y,
});
const objAt = (id: string, x: number, y: number): LevelContent => ({
  kind: 'object',
  id: id as DefId,
  x,
  y,
});
const trapAt = (id: string, x: number, y: number): LevelContent => ({
  kind: 'trap',
  id: id as DefId,
  x,
  y,
});

/**
 * des.monster(), des.object() at fixed spots after the regions and doors: the soldiers guarding
 * the fort, the stone giant ("possible source of a boulder"), four dragons guarding each side,
 * eels in the moat and the corner rooms' treasures.
 */
const GARRISON: readonly LevelContent[] = [
  ...(
    [
      [12, 14],
      [12, 13],
      [11, 10],
      [13, 2],
      [14, 3],
      [20, 2],
      [30, 2],
      [40, 2],
      [30, 16],
      [32, 16],
      [40, 16],
      [54, 16],
      [54, 14],
      [54, 13],
      [57, 10],
      [57, 9],
    ] as const
  ).map(([x, y]) => monAt('nh:soldier', x, y)),
  monAt('nh:lieutenant', 15, 8),
  monAt('nh:stone_giant', 3, 1),
  { kind: 'monster', class: 'D', x: 18, y: 9 },
  { kind: 'monster', class: 'D', x: 49, y: 10 },
  { kind: 'monster', class: 'D', x: 33, y: 5 },
  { kind: 'monster', class: 'D', x: 33, y: 14 },
  monAt('nh:giant_eel', 17, 8),
  monAt('nh:giant_eel', 17, 11),
  monAt('nh:giant_eel', 48, 8),
  monAt('nh:giant_eel', 48, 11),
  ...(
    [
      ['nh:diamond', 19, 6],
      ['nh:diamond', 20, 6],
      ['nh:diamond', 21, 6],
      ['nh:emerald', 19, 13],
      ['nh:emerald', 20, 13],
      ['nh:emerald', 21, 13],
      ['nh:ruby', 46, 6],
      ['nh:ruby', 47, 6],
      ['nh:ruby', 48, 6],
      ['nh:amethyst', 46, 13],
      ['nh:amethyst', 47, 13],
      ['nh:amethyst', 48, 13],
    ] as const
  ).map(([id, x, y]) => objAt(id, x, y)),
];

/** "Monsters are not allowed to spawn in the vault and treasuries" (map-relative). */
const EXCLUSIONS: readonly LevelRect[] = [
  [21, 8, 35, 11],
  [19, 6, 21, 6],
  [19, 13, 21, 13],
  [46, 6, 48, 6],
  [46, 13, 48, 13],
];

/** des.terrain(x, y, ch) at a map spot. */
function desTerrain(level: Level, def: LevelDef, x: number, y: number, ch: string): void {
  const p = mapToLevel(def, level, x, y);
  setTerrain(level, p.x, p.y, ter(ch));
}

/**
 * The treasury: on each square of (21..35, 8..11), column by column, `600 + math.random(0, 300)`
 * gold, then 1 time in 3 a trap: a spiked pit 1 time in 3, else a land mine.
 * ref: dat/knox.lua treasure_spot(); dat/nhlib.lua math.random(m, n) = m + rn2(n - m + 1)
 */
function treasury(ctx: Ctx, level: Level, def: LevelDef): void {
  for (let x = 21; x <= 35; x++)
    for (let y = 8; y <= 11; y++) {
      const p = mapToLevel(def, level, x, y);
      mkgold(ctx, 600 + ctx.rng.rn2(301), { level: level.id, x: p.x, y: p.y });
      if (ctx.rng.rn2(3) === 0) {
        const kind = ctx.rng.rn2(3) === 0 ? 'nh:spiked_pit' : 'nh:landmine';
        makeContents(ctx, level, def, [trapAt(kind, x, y)]);
      }
    }
}

/**
 * The branch levregion (fixup_special()'s place_lregion() of its one cell: two `rn1(1, x)`):
 * Ludios has no stairs back to the main dungeon (a portal branch), but a magic portal to the
 * vault that holds the other end (place_branch()'s BR_PORTAL: mkportal()).
 * ref: src/mklev.c place_branch(); src/mkmaze.c mkportal()
 */
function placeBranch(ctx: Ctx, level: Level, def: LevelDef): void {
  const area = levelDefRect(def, level.width, level.height, BRANCH_SPOT, 'map', 'knox branch');
  const p = placeLregion(ctx, level, area, null);
  // place_branch(): the portal back to the vault, once a vault has its end (else mkKnoxPortal()
  // adds it when one does)
  const source = knoxSource(ctx.state);
  if (!p || !source) return;
  const t = maketrap(ctx, level.id, p.x, p.y, MAGIC_PORTAL, { inMklev: true });
  t.data = portalData(source);
}

export const KNOX_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    // 50% chance each to move throne and/or fort's entry secret door up one row
    if (percent(ctx, 50))
      makeContents(ctx, level, def, [{ ...monAt('nh:croesus', 43, 10), peaceful: false }]);
    else {
      makeContents(ctx, level, def, [{ ...monAt('nh:croesus', 43, 9), peaceful: false }]);
      desTerrain(level, def, 43, 9, '\\');
      desTerrain(level, def, 43, 10, '.');
    }
    if (percent(ctx, 50)) {
      desTerrain(level, def, 47, 9, 'S');
      desTerrain(level, def, 47, 10, '|');
    }
    treasury(ctx, level, def);
    // Vault entrance also varies
    if (percent(ctx, 50)) {
      desTerrain(level, def, 36, 9, '|');
      desTerrain(level, def, 36, 10, 'S');
    }
    // Monsters are not allowed to spawn in the vault and treasuries
    setMadeLevelFlags(ctx, level.id, {
      mongenExclude: EXCLUSIONS.map((r) => {
        const [x1, y1, x2, y2] = levelDefRect(def, level.width, level.height, r, 'map', 'knox');
        return [x1, y1, x2, y2];
      }),
    });
    makeContents(ctx, level, def, GARRISON);
    // lspo_finalize_level(): link_doors_rooms() (the moved secret doors face their walls),
    // wallification(), then fixup_special()'s level regions
    orientDoors(ctx, level);
    wallifyLevel(level, VANILLA_TERRAIN);
    placeBranch(ctx, level, def);
  },
};
