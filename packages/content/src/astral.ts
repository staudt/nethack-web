// The Astral Plane: the top of the endgame, with a high temple for each of the three gods (their
// altars shuffled each game), Moloch's horde and the aligned horde of clerics and Angels, and
// maybe the two opened wings of the bottom-centre round rooms with their extra Angels.
// ref: dat/astral.lua
//
// Translation notes (DEVIATIONS.md "The Astral Plane and ascension (m23 step 8)"): the LevelDef
// is the script's map, regions, doors and monsters; the fixup does what the format cannot say,
// in the script's order before the contents: nhlib.lua's shuffled `align[]` (drawn before the
// script, so first here), the two 60% wings (des.terrain, des.wallify, the flood-filled hall and
// its Angels and random monsters), then the three high altars with their high priests (C's
// create_altar() makes each priest with its altar, so they come after the wings and before the
// hordes, as the script orders them). The lit courts' irregular regions are their rectangles,
// lit only (no rooms). The Riders are made where the script makes them, each on one of the three
// `place` spots (`place:rndcoord(1)`, drawn just before it is made): the fixup's `contents`
// makes the list itself and puts each Rider after its marked entry. The aligned horde's
// peacefulness is a placeholder the script itself explains: final_level() re-aligns it on her
// first arrival (priest.ts resetHostility()). The flags ("mazelevel", "noteleport", "hardfloor",
// "nommap", "shortsighted", "solidify", the non-diggable and non-passwall map) are levelflags.ts
// entries; the arrival lines endgame.ts's.
import {
  cellIndex,
  levelDefArea,
  VANILLA_TERRAIN,
  wallifyLevel,
  type Ctx,
  type DefId,
  type Level,
  type LevelContent,
  type LevelDef,
  type Pos,
  type RegionDef,
} from '@nh/core';
import { TEMPLE } from './epri';
import { PLANE_LEVELS } from './levelflags';
import { templePriests } from './priest';
import { percent, selArea, selFloodfill, selRndcoord, setSel, type Sel } from './selection';
import { makeContents, mapToLevel, rndcoord, shuffle } from './sp_lev';
import { T, setTerrain } from './terrain';

/** ref: dat/astral.lua des.map() */
const MAP: readonly string[] = [
  '                              ---------------                              ',
  '                              |.............|                              ',
  '                              |..---------..|                              ',
  '                              |..|.......|..|                              ',
  '---------------               |..|.......|..|               ---------------',
  '|.............|               |..|.......|..|               |.............|',
  '|..---------..-|   |-------|  |..|.......|..|  |-------|   |-..---------..|',
  '|..|.......|...-| |-.......-| |..|.......|..| |-.......-| |-...|.......|..|',
  '|..|.......|....-|-.........-||..----+----..||-.........-|-....|.......|..|',
  '|..|.......+.....+...........||.............||...........+.....+.......|..|',
  '|..|.......|....-|-.........-|--|.........|--|-.........-|-....|.......|..|',
  '|..|.......|...-| |-.......-|   -|---+---|-   |-.......-| |-...|.......|..|',
  '|..---------..-|   |---+---|    |-.......-|    |---+---|   |-..---------..|',
  '|.............|      |...|-----|-.........-|-----|...|      |.............|',
  '---------------      |.........|...........|.........|      ---------------',
  '                     -------...|-.........-|...-------                     ',
  '                           |....|-.......-|....|                           ',
  '                           ---...|---+---|...---                           ',
  '                             |...............|                             ',
  '                             -----------------                             ',
];

type Align = 'lawful' | 'neutral' | 'chaotic' | 'noalign';

const monAt = (
  id: string,
  x: number,
  y: number,
  align: Align,
  peaceful: boolean,
): LevelContent => ({
  kind: 'monster',
  id: id as DefId,
  x,
  y,
  align,
  peaceful,
});
const cleric = (x: number, y: number, align: Align, peaceful = false) =>
  monAt('nh:aligned_cleric', x, y, align, peaceful);
const angel = (x: number, y: number, align: Align, peaceful = false) =>
  monAt('nh:angel', x, y, align, peaceful);
const cls = (c: string): LevelContent => ({ kind: 'monster', class: c, peaceful: false });

// The entries after which the script makes each Rider (des.monster({ id = "Pestilence", coord =
// place:rndcoord(1), peaceful = 0 }) and the others).
const PESTILENCE_AFTER = angel(20, 10, 'noalign');
const DEATH_AFTER = angel(37, 13, 'noalign');
const FAMINE_AFTER = angel(54, 10, 'noalign');
const RIDER_AFTER: ReadonlyMap<LevelContent, DefId> = new Map([
  [PESTILENCE_AFTER, 'nh:pestilence' as DefId],
  [DEATH_AFTER, 'nh:death' as DefId],
  [FAMINE_AFTER, 'nh:famine' as DefId],
]);

/** The Riders' spots (`place`: selection.new(), place:set()), map-relative. */
const RIDER_SPOTS: readonly Pos[] = [
  { x: 23, y: 9 },
  { x: 37, y: 14 },
  { x: 51, y: 9 },
];

/** The three temples' insides (des.region type "temple", filled = 2), map-relative. */
const TEMPLES: readonly [number, number, number, number][] = [
  [4, 7, 10, 11],
  [34, 3, 40, 7],
  [64, 7, 70, 11],
];

/** The three high altars (des.altar type "sanctum"), map-relative, in the script's order. */
export const ASTRAL_ALTARS: readonly (readonly [number, number])[] = [
  [7, 9],
  [37, 5],
  [67, 9],
];

/** ref: dat/astral.lua */
export const ASTRAL: LevelDef = {
  id: PLANE_LEVELS.astral,
  // des.level_init({ style = "solidfill", fg = " " })
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...MAP] },
  // the planes have no stairs: core's are put at fixed spots and lifted by the fixup
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 1, y: 0, coords: 'level' },
    branch: { x: 2, y: 0, coords: 'level' },
  },
  // Where the player will land on arrival
  teleportRegions: [{ area: [29, 15, 45, 15], exclude: [30, 15, 44, 15] }],
  regions: [
    // Lit courts (irregular: their rectangles, lit only)
    { area: [1, 5, 16, 14], lit: true },
    { area: [31, 1, 44, 10], lit: true },
    { area: [61, 5, 74, 14], lit: true },
    // A Sanctum for each alignment; the shrines' alignments are shuffled for each game (the
    // altars are the fixup's)
    ...TEMPLES.map(([x1, y1, x2, y2]): RegionDef => ({
      area: [x1, y1, x2, y2],
      lit: true,
      type: TEMPLE,
      filled: false,
    })),
  ],
  doors: [
    { x: 11, y: 9, state: 'closed' },
    { x: 17, y: 9, state: 'closed' },
    { x: 23, y: 12, state: 'locked' },
    { x: 37, y: 8, state: 'locked' },
    { x: 37, y: 11, state: 'closed' },
    { x: 37, y: 17, state: 'closed' },
    { x: 51, y: 12, state: 'locked' },
    { x: 57, y: 9, state: 'locked' },
    { x: 63, y: 9, state: 'closed' },
  ],
  contents: [
    // Moloch's horde
    // West round room
    cleric(18, 9, 'noalign'),
    cleric(19, 8, 'noalign'),
    cleric(19, 9, 'noalign'),
    cleric(19, 10, 'noalign'),
    angel(20, 9, 'noalign'),
    PESTILENCE_AFTER,
    // (Pestilence at place:rndcoord(1): astralContents())
    // South-central round room
    cleric(36, 12, 'noalign'),
    cleric(37, 12, 'noalign'),
    cleric(38, 12, 'noalign'),
    cleric(36, 13, 'noalign'),
    angel(38, 13, 'noalign'),
    DEATH_AFTER,
    // (Death at place:rndcoord(1): astralContents())
    // East round room
    cleric(56, 9, 'noalign'),
    cleric(55, 8, 'noalign'),
    cleric(55, 9, 'noalign'),
    cleric(55, 10, 'noalign'),
    angel(54, 9, 'noalign'),
    FAMINE_AFTER,
    // (Famine at place:rndcoord(1): astralContents())
    //
    // The aligned horde: "We do not know in advance the alignment of the player. The mpeaceful
    // bit will need resetting when the level is created. The setting here is but a place
    // holder."
    //
    // West court
    cleric(12, 7, 'chaotic'),
    cleric(13, 7, 'chaotic', true),
    cleric(14, 7, 'lawful'),
    cleric(12, 11, 'lawful', true),
    cleric(13, 11, 'neutral'),
    cleric(14, 11, 'neutral', true),
    angel(11, 5, 'chaotic'),
    angel(12, 5, 'chaotic', true),
    angel(13, 5, 'lawful'),
    angel(11, 13, 'lawful', true),
    angel(12, 13, 'neutral'),
    angel(13, 13, 'neutral', true),
    // Central court
    cleric(32, 9, 'chaotic'),
    cleric(33, 9, 'chaotic', true),
    cleric(34, 9, 'lawful'),
    cleric(40, 9, 'lawful', true),
    cleric(41, 9, 'neutral'),
    cleric(42, 9, 'neutral', true),
    angel(31, 8, 'chaotic'),
    angel(32, 8, 'chaotic', true),
    angel(31, 9, 'lawful'),
    angel(42, 8, 'lawful', true),
    angel(43, 8, 'neutral'),
    angel(43, 9, 'neutral', true),
    // East court
    cleric(60, 7, 'chaotic'),
    cleric(61, 7, 'chaotic', true),
    cleric(62, 7, 'lawful'),
    cleric(60, 11, 'lawful', true),
    cleric(61, 11, 'neutral'),
    cleric(62, 11, 'neutral', true),
    angel(61, 5, 'chaotic'),
    angel(62, 5, 'chaotic', true),
    angel(63, 5, 'lawful'),
    angel(61, 13, 'lawful', true),
    angel(62, 13, 'neutral'),
    angel(63, 13, 'neutral', true),
    //
    // Assorted nasties
    cls('L'),
    cls('L'),
    cls('L'),
    cls('V'),
    cls('V'),
    cls('V'),
    cls('D'),
    cls('D'),
    cls('D'),
  ],
};

/** The altar terrain of each des.altar `align`. */
const ALTAR_OF: Readonly<Record<'lawful' | 'neutral' | 'chaotic', DefId>> = {
  lawful: T.altar_lawful,
  neutral: T.altar_neutral,
  chaotic: T.altar_chaotic,
};

/**
 * Each wing of the bottom-centre round rooms: the area opened into a big room, the spot closed
 * off for the flood fill (so that the hall does not cover the entry area) and the flood fill's
 * start, map-relative. ref: dat/astral.lua
 */
const WINGS: readonly {
  area: [number, number, number, number];
  close: [number, number];
  fill: [number, number];
}[] = [
  { area: [17, 14, 30, 18], close: [33, 18], fill: [30, 16] },
  { area: [44, 14, 57, 18], close: [41, 18], fill: [44, 16] },
];

/**
 * "chance to alter above map and turn the wings of the bottom-center into a pair of big (5x15)
 * rooms": each wing 60% of the time, with 4-9 hostile Angels of no god in its hall, each with a
 * 50% chance of a random hostile monster. ref: dat/astral.lua
 */
function openWings(ctx: Ctx, level: Level, def: LevelDef): void {
  const a = levelDefArea(def, level.width, level.height);
  const at = (x: number, y: number) => mapToLevel(def, level, x, y);
  for (const w of WINGS) {
    if (!percent(ctx, 60)) continue;
    const p1 = at(w.area[0], w.area[1]);
    const p2 = at(w.area[2], w.area[3]);
    setSel(level, selArea(level, p1.x, p1.y, p2.x, p2.y), '.');
    // des.wallify(): from one cell before the map block to two after it (xstart - 1 ..
    // xstart + xsize + 1)
    wallifyLevel(level, VANILLA_TERRAIN, [a.x - 1, a.y - 1, a.x + a.w + 1, a.y + a.h + 1]);
    // temporarily close off the area to be filled so that it doesn't cover the entry area
    const c = at(w.close[0], w.close[1]);
    setTerrain(level, c.x, c.y, T.vwall);
    const f = at(w.fill[0], w.fill[1]);
    const hall: Sel = selFloodfill(level, f.x, f.y);
    // re-connect the opened wing with the rest of the map
    setTerrain(level, c.x, c.y, T.floor);
    // extra monsters; was [6 + 3d4] when both wings were opened up at once
    const n = 4 + ctx.rng.rn2(6); // math.random(4, 9)
    const take = () => {
      const p = selRndcoord(ctx.rng, level, hall);
      if (p) hall[cellIndex(level, p.x, p.y)] = false;
      return p;
    };
    for (let j = 0; j < n; j++) {
      const p = take();
      if (p) makeContents(ctx, level, def, [{ ...angel(p.x, p.y, 'noalign'), coords: 'level' }]);
      if (percent(ctx, 50)) {
        const q = take();
        if (q)
          makeContents(ctx, level, def, [
            { kind: 'monster', x: q.x, y: q.y, coords: 'level', peaceful: false },
          ]);
      }
    }
  }
}

/**
 * The Astral Plane's fixup, before the contents (planes.ts lifts the stairs first): the shuffled
 * alignments, the wings, then the three high altars with their high priests.
 * ref: dat/nhlib.lua `align`, shuffle(); dat/astral.lua; src/sp_lev.c create_altar(),
 * priestini()
 */
export function astralBefore(ctx: Ctx, level: Level, def: LevelDef): void {
  const align: ('lawful' | 'neutral' | 'chaotic')[] = ['lawful', 'neutral', 'chaotic'];
  shuffle(ctx, align);
  openWings(ctx, level, def);
  for (const [k, [x, y]] of ASTRAL_ALTARS.entries()) {
    const p = mapToLevel(def, level, x, y);
    setTerrain(level, p.x, p.y, ALTAR_OF[align[k] ?? 'lawful']);
    if (!level.shrines?.some((s) => s.x === p.x && s.y === p.y))
      (level.shrines ??= []).push({ x: p.x, y: p.y });
  }
  templePriests(ctx, level); // priestini() for each, a high priest at a high altar
}

/**
 * The Astral Plane's contents in the script's order, with each Rider made right after its round
 * room's horde on one of the `place` spots still free (`place:rndcoord(1)`, drawn first).
 * ref: dat/astral.lua
 */
export function astralContents(ctx: Ctx, level: Level, def: LevelDef): void {
  const place = RIDER_SPOTS.map((p) => ({ ...p }));
  for (const c of def.contents ?? []) {
    makeContents(ctx, level, def, [c]);
    const rider = RIDER_AFTER.get(c);
    if (rider === undefined) continue;
    const p = rndcoord(ctx, place);
    makeContents(ctx, level, def, [
      { kind: 'monster', id: rider, x: p.x, y: p.y, peaceful: false },
    ]);
  }
}
