// Medusa's island: NetHack 5.0's four variants, as LevelDefs plus fixups.
// ref: dat/medusa-1.lua .. dat/medusa-4.lua; src/mkmaze.c fixup_special() (Is_medusa_level)
//
// Translation notes (see DEVIATIONS.md "Medusa's island"): maps, lit and unlit regions, stairs,
// doors, teleport regions, the branch and up-stairs levregions and the contents are LevelDef
// data; the non_diggable areas and the "noteleport", "mazelevel" and "shortsighted" flags are
// levelflags.ts entries. The "ordinary" room regions (the arrival rooms and the irregular rooms
// the scripts define only so that fixup_special() finds a first room) make no Room here: they are
// lit or unlit areas, and the fixup takes its statue room from {@link FIRST_ROOM}. The fixups make
// Perseus's statue (a statue of a human, unnamed: the knight row (m17) and object names (m20)
// came later and the fixup was not switched) with its contents by
// percent, and medusa-3/4's random choice of Medusa's room (place:rndcoord(), drawn after core
// has built the level), which moves the down stairs there. Every statue without a monster is a
// petrified monster (sp_lev.ts createObject()).
import type { Ctx, DefId, Level, LevelContent, LevelDef, LevelRect, Pos } from '@nh/core';
import { levelDifficulty } from './levdiff';
import { polyWhenStoned } from './golem';
import { mksobjFull, rndmonnum } from './mkobj';
import {
  addToStatue,
  deleteContents,
  makeContents,
  mapToLevel,
  rndcoord,
  type SpLevFixup,
} from './sp_lev';
import { mkcorpstat } from './statue';
import { STATUE, setHistoric } from './statuestate';
import { goodposNone } from './teleport';
import { T, setTerrain, terrainIdAt } from './terrain';
import { isGenocided } from './vanquished';
import { mkTtObject } from './zoo';

const MAP_1: readonly string[] = [
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}.}}}}}..}}}}}......}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}....}}}...}}}}}',
  '}...}}.....}}}}}....}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}...............}',
  '}....}}}}}}}}}}....}}}..}}}}}}}}}}}.......}}}}}}}}}}}}}}}}..}}.....}}}...}}',
  '}....}}}}}}}}.....}}}}..}}}}}}.................}}}}}}}}}}}.}}}}.....}}...}}',
  '}....}}}}}}}}}}}}.}}}}.}}}}}}.-----------------.}}}}}}}}}}}}}}}}}.........}',
  '}....}}}}}}}}}}}}}}}}}}.}}}...|...............S...}}}}}}}}}}}}}}}}}}}....}}',
  '}.....}.}}....}}}}}}}}}.}}....--------+--------....}}}}}}..}}}}}}}}}}}...}}',
  '}......}}}}..}}}}}}}}}}}}}........|.......|........}}}}}....}}}}}}}}}}}}}}}',
  '}.....}}}}}}}}}}}}}}}}}}}}........|.......|........}}}}}...}}}}}}}}}.}}}}}}',
  '}.....}}}}}}}}}}}}}}}}}}}}....--------+--------....}}}}}}.}.}}}}}}}}}}}}}}}',
  '}......}}}}}}}}}}}}}}}}}}}}...S...............|...}}}}}}}}}}}}}}}}}.}}}}}}}',
  '}.......}}}}}}}..}}}}}}}}}}}}.-----------------.}}}}}}}}}}}}}}}}}....}}}}}}',
  '}........}}.}}....}}}}}}}}}}}}.................}}}}}..}}}}}}}}}.......}}}}}',
  '}.......}}}}}}}......}}}}}}}}}}}}}}.......}}}}}}}}}.....}}}}}}...}}..}}}}}}',
  '}.....}}}}}}}}}}}.....}}}}}}}}}}}}}}}}}}}}}}.}}}}}}}..}}}}}}}}}}....}}}}}}}',
  '}}..}}}}}}}}}}}}}....}}}}}}}}}}}}}}}}}}}}}}...}}..}}}}}}}.}}.}}}}..}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
];
const MAP_2: readonly string[] = [
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}------}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}-------}}}}}}}}--------------}',
  '}|....|}}}}}}}}}..}.}}..}}}}}}}}}}}}}..}}}}}}-.....--}}}}}}}|............|}',
  '}|....|.}}}}}}}}}}}.}...}}..}}}}}}}}}}}}}}}}}---......}}}}}.|............|}',
  '}S....|.}}}}}}---}}}}}}}}}}}}}}}}}}}}}}}}}}---...|..-}}}}}}.S..----------|}',
  '}|....|.}}}}}}-...}}}}}}}}}.}}...}.}}}}.}}}......----}}}}}}.|............|}',
  '}|....|.}}}}}}-....--}}}}}}}}}}}}}}}}}}}}}}----...--}}}}}}}.|..--------+-|}',
  '}|....|.}}}}}}}......}}}}...}}}}}}.}}}}}}}}}}}---..---}}}}}.|..|..S...|..|}',
  '}|....|.}}}}}}-....-}}}}}}}------}}}}}}}}}}}}}}-...|.-}}}}}.|..|..|...|..|}',
  '}|....|.}}}}}}}}}---}}}}}}}........}}}}}}}}}}---.|....}}}}}.|..|..|...|..|}',
  '}|....|.}}}}}}}}}}}}}}}}}}-....|...-}}}}}}}}--...----.}}}}}.|..|..|...|..|}',
  '}|....|.}}}}}}..}}}}}}}}}}---..--------}}}}}-..---}}}}}}}}}.|..|..-------|}',
  '}|...}|...}}}.}}}}}}...}}}}}--..........}}}}..--}}}}}}}}}}}.|..|.........|}',
  '}|...}S...}}.}}}}}}}}}}}}}}}-..--------}}}}}}}}}}}}}}...}}}.|..--------..S}',
  '}|...}|...}}}}}}}..}}}}}}----..|....-}}}}}}}}}}}}}}}}}..}}}.|............|}',
  '}|....|}}}}}....}}}}..}}.-.......----}}......}}}}}}.......}}|............|}',
  '}------}}}}}}}}}}}}}}}}}}---------}}}}}}}}}}}}}}}}}}}}}}}}}}--------------}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
];
const MAP_3: readonly string[] = [
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}.}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}T..T.}}}}}}}}}}}}}}}}}}}}..}}}}}}}}.}}}...}}}}}}}.}}}}}......}}}}}}}',
  '}}}}}}.......T.}}}}}}}}}}}..}}}}..T.}}}}}}...T...T..}}...T..}}..-----..}}}}}',
  '}}}...-----....}}}}}}}}}}.T..}}}}}...}}}}}.....T..}}}}}......T..|...|.T..}}}',
  '}}}.T.|...|...T.}}}}}}}.T......}}}}..T..}}.}}}.}}...}}}}}.T.....+...|...}}}}',
  '}}}}..|...|.}}.}}}}}.....}}}T.}}}}.....}}}}}}.T}}}}}}}}}}}}}..T.|...|.}}}}}}',
  '}}}}}.|...|.}}}}}}..T..}}}}}}}}}}}}}T.}}}}}}}}..}}}}}}}}}}}.....-----.}}}}}}',
  '}}}}}.--+--..}}}}}}...}}}}}}}}}}}}}}}}}}}T.}}}}}}}}}}}}}}}}.T.}........}}}}}',
  '}}}}}.......}}}}}}..}}}}}}}}}.}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.}}}.}}.T.}}}}}}',
  '}}.T...T...}}}}T}}}}}}}}}}}....}}}}}}}}}}T}}}}}.T}}...}}}}}}}}}}}}}}...}}}}}',
  '}}}...T}}}}}}}..}}}}}}}}}}}.T...}}}}}}}}.T.}.T.....T....}}}}}}}}}}}}}.}}}}}}',
  '}}}}}}}}}}}}}}}....}}}}}}}...}}.}}}}}}}}}}............T..}}}}}.T.}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}..T..}}}}}}}}}}}}}}..}}}}}..------+--...T.}}}....}}}}}}}}}}}',
  '}}}}.}..}}}}}}}.T.....}}}}}}}}}}}..T.}}}}.T.|...|...|....}}}}}.}}}}}...}}}}}',
  '}}}.T.}...}..}}}}T.T.}}}}}}.}}}}}}}....}}...|...+...|.}}}}}}}}}}}}}..T...}}}',
  '}}}}..}}}.....}}...}}}}}}}...}}}}}}}}}}}}}T.|...|...|}}}}}}}}}}}....T..}}}}}',
  '}}}}}..}}}.T..}}}.}}}}}}}}.T..}}}}}}}}}}}}}}---S-----}}}}}}}}}}}}}....}}}}}}',
  '}}}}}}}}}}}..}}}}}}}}}}}}}}}.}}}}}}}}}}}}}}}}}T..T}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
];
const MAP_4: readonly string[] = [
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}}}}}}}}}}}}}........}}}}}}}}}}}}}}}}}}}}}}}..}}}.....}}}}}}}}}}}----|}}}}}',
  '}}}}}}..----------F-.....}}}}}}}}}}}}}}}}..---...}}}}....T.}}}}}}}....|}}}}}',
  '}}}.....|...F......S}}}}....}}}}}}}...}}.....|}}.}}}}}}}......}}}}|......}}}',
  '}}}.....+...|..{...|}}}}}}}}}}}}.....}}}}|...|}}}}}}}}}}}.}}}}}}}}----.}}}}}',
  '}}......|...|......|}}}}}}}}}......}}}}}}|.......}}}}}}}}}}}}}..}}}}}...}}}}',
  '}}|-+--F|-+--....|F|-|}}}}}....}}}....}}}-----}}.....}}}}}}}......}}}}.}}}}}',
  '}}|...}}|...|....|}}}|}}}}}}}..}}}}}}}}}}}}}}}}}}}}....}}}}}}}}....T.}}}}}}}',
  '}}|...}}F...+....F}}}}}}}..}}}}}}}}}}}}}}...}}}}}}}}}}}}}}}}}}}}}}....}}..}}',
  '}}|...}}|...|....|}}}|}....}}}}}}....}}}...}}}}}...}}}}}}}}}}}}}}}}}.....}}}',
  '}}--+--F|-+--....-F|-|....}}}}}}}}}}.T...}}}}....---}}}}}}}}}}}}}}}}}}}}}}}}',
  '}}......|...|......|}}}}}.}}}}}}}}}....}}}}}}}.....|}}}}}}}}}.}}}}}}}}}}}}}}',
  '}}}}....+...|..{...|.}}}}}}}}}}}}}}}}}}}}}}}}}}.|..|}}}}}}}......}}}}...}}}}',
  '}}}}}}..|...F......|...}}}}}}}}}}..---}}}}}}}}}}--.-}}}}}....}}}}}}....}}}}}',
  '}}}}}}}}-----S----F|....}}}}}}}}}|...|}}}}}}}}}}}}...}}}}}}...}}}}}}..}}}}}}',
  '}}}}}}}}}..............T...}}}}}.|.......}}}}}}}}}}}}}}..}...}.}}}}....}}}}}',
  '}}}}}}}}}}....}}}}...}...}}}}}.......|.}}}}}}}}}}}}}}.......}}}}}}}}}...}}}}',
  '}}}}}}}}}}..}}}}}}}}}}.}}}}}}}}}}-..--.}}}}}}}}..}}}}}}..T...}}}..}}}}}}}}}}',
  '}}}}}}}}}...}}}}}}}}}}}}}}}}}}}}}}}...}}}}}}}....}}}}}}}.}}}..}}}...}}}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.}}}}}}....}}}}}}}}}}}}}}}}}}}...}}}}}}',
  '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
];

/** des.level_init({ style = "solidfill", fg = " " }) (lit omitted: the coin flip is drawn) */
const STONE = { style: 'solidfill', fg: 'nh:stone' } as const;

const lit = (area: LevelRect) => ({ area, lit: true });
const unlit = (area: LevelRect) => ({ area, lit: false });

const monAt = (id: string, x: number, y: number, asleep = false): LevelContent => ({
  kind: 'monster',
  id: id as DefId,
  x,
  y,
  ...(asleep ? { asleep: true as const } : {}),
});
const mon = (id: string, count = 1): LevelContent => ({ kind: 'monster', id: id as DefId, count });
const cls = (c: string, count = 1): LevelContent => ({ kind: 'monster', class: c, count });
/** des.object({ id = "statue", contents = 0 }): a petrified monster on Medusa's level */
const STATUE_AT = (x: number, y: number): LevelContent => ({ kind: 'object', id: STATUE, x, y });
const statues = (count: number): LevelContent => ({ kind: 'object', id: STATUE, count });
const objects = (count: number): LevelContent => ({ kind: 'object', count });
const traps = (count: number): LevelContent => ({ kind: 'trap', count });
const trapAt = (id: string, x: number, y: number): LevelContent => ({
  kind: 'trap',
  id: id as DefId,
  x,
  y,
});

/** ref: dat/medusa-1.lua: Medusa's temple on an island, the up stairs on another */
export const MEDUSA_1: LevelDef = {
  id: 'nh:medusa-1',
  init: STONE,
  map: { rows: [...MAP_1] },
  regions: [
    lit([0, 0, 74, 19]),
    unlit([31, 7, 45, 7]),
    unlit([35, 9, 41, 10]), // the arrival room (type "ordinary", lit = 0)
    unlit([31, 12, 45, 12]),
  ],
  // down to up stairs island, up to Medusa's island
  teleportRegions: [
    { area: [1, 1, 5, 17], dir: 'down' },
    { area: [26, 4, 50, 15], dir: 'up' },
  ],
  stairs: {
    up: { x: 5, y: 14 },
    down: { x: 36, y: 10 },
    // not allowed inside Medusa's building; {01,00,79,20} cut at the map (place_lregion() clamps
    // it at the level, and the stone outside the map is no place for stairs)
    branch: { region: [1, 0, 74, 19], exclude: [30, 6, 46, 13] },
  },
  doors: [
    { x: 46, y: 7, state: 'closed' },
    { x: 38, y: 8, state: 'locked' },
    { x: 38, y: 11, state: 'locked' },
    { x: 30, y: 12, state: 'closed' },
  ],
  contents: [
    // (Perseus's statue first: the fixup)
    statues(7),
    objects(8),
    traps(5),
    trapAt('nh:squeaky_board', 38, 7),
    trapAt('nh:squeaky_board', 38, 12),
    monAt('nh:medusa', 36, 10, true),
    monAt('nh:giant_eel', 11, 6),
    monAt('nh:giant_eel', 23, 13),
    monAt('nh:giant_eel', 29, 2),
    monAt('nh:jellyfish', 3, 2),
    monAt('nh:jellyfish', 0, 8),
    monAt('nh:jellyfish', 4, 18),
    monAt('nh:water_troll', 51, 3),
    monAt('nh:water_troll', 64, 11),
    { kind: 'monster', class: 'S', x: 38, y: 7 },
    { kind: 'monster', class: 'S', x: 38, y: 12 },
    { kind: 'monster', count: 10 },
  ],
};

/** ref: dat/medusa-2.lua: Medusa's building with a statue garden, a titan on the up stairs isle */
export const MEDUSA_2: LevelDef = {
  id: 'nh:medusa-2',
  init: STONE,
  map: { rows: [...MAP_2] },
  regions: [
    lit([0, 0, 74, 19]),
    unlit([2, 3, 5, 16]),
    unlit([61, 3, 72, 16]), // the first room (type "ordinary", irregular, lit = 0)
    unlit([71, 8, 72, 11]),
    lit([67, 8, 69, 11]), // the arrival room (type "ordinary", lit = 1)
  ],
  teleportRegions: [
    { area: [2, 3, 5, 16], dir: 'down' },
    { area: [61, 3, 72, 16], dir: 'up' },
  ],
  stairs: {
    up: { x: 4, y: 9 },
    down: { x: 68, y: 10 },
    // not allowed on Medusa's island; {01,00,79,20} cut at the map as medusa-1's
    branch: { region: [1, 0, 74, 19], exclude: [59, 1, 73, 17] },
  },
  doors: [{ x: 71, y: 7, state: 'locked' }],
  contents: [
    // (Perseus's statue first: the fixup)
    STATUE_AT(64, 8),
    STATUE_AT(65, 8),
    STATUE_AT(64, 9),
    STATUE_AT(65, 9),
    STATUE_AT(64, 10),
    STATUE_AT(65, 10),
    STATUE_AT(64, 11),
    STATUE_AT(65, 11),
    { kind: 'object', id: 'nh:boulder', x: 4, y: 4 },
    { kind: 'object', class: 'wand', x: 52, y: 9 },
    { kind: 'object', id: 'nh:boulder', x: 52, y: 9 },
    objects(6),
    trapAt('nh:magic_trap', 3, 12),
    traps(4),
    monAt('nh:medusa', 68, 10, true),
    monAt('nh:gremlin', 2, 14),
    monAt('nh:titan', 2, 5),
    monAt('nh:electric_eel', 10, 13),
    monAt('nh:electric_eel', 11, 13),
    monAt('nh:electric_eel', 10, 14),
    monAt('nh:electric_eel', 11, 14),
    monAt('nh:electric_eel', 10, 15),
    monAt('nh:electric_eel', 11, 15),
    monAt('nh:jellyfish', 1, 1),
    monAt('nh:jellyfish', 0, 8),
    monAt('nh:jellyfish', 4, 19),
    monAt('nh:stone_golem', 64, 8, true),
    monAt('nh:stone_golem', 65, 8, true),
    monAt('nh:stone_golem', 64, 9, true),
    monAt('nh:stone_golem', 65, 9, true),
    monAt('nh:cobra', 64, 10, true),
    monAt('nh:cobra', 65, 10, true),
    // des.monster("A", 72, 08)
    { kind: 'monster', class: 'A', x: 72, y: 8 },
    monAt('nh:yellow_light', 72, 11, true),
    ...(
      [
        [17, 7],
        [28, 11],
        [32, 13],
        [49, 9],
        [48, 7],
        [65, 3],
        [70, 4],
        [70, 15],
        [65, 16],
      ] as const
    ).map(([x, y]): LevelContent => ({ kind: 'monster', x, y })),
    { kind: 'monster', count: 4 },
  ],
};

/**
 * ref: dat/medusa-3.lua: ravens nesting in the trees; Medusa, the down stairs and Perseus in one
 * of three rooms, a statue in another and a fountain in the third (the fixup's)
 */
export const MEDUSA_3: LevelDef = {
  id: 'nh:medusa-3',
  init: STONE,
  map: { rows: [...MAP_3] },
  regions: [
    lit([0, 0, 74, 19]),
    { area: [49, 14, 51, 16] }, // the first room (type "ordinary", lit = -1, arrival_room)
    unlit([7, 5, 9, 7]),
    unlit([65, 4, 67, 6]),
    unlit([45, 14, 47, 16]),
  ],
  // all places are accessible also with jumping, so no up region
  teleportRegions: [{ area: [33, 2, 38, 7], dir: 'down' }],
  stairs: {
    up: { region: [32, 1, 39, 7] },
    down: { x: 8, y: 6 }, // moved to Medusa's spot by the fixup
  },
  doors: [
    { x: 8, y: 8, state: 'locked' },
    { x: 64, y: 5, state: 'locked' },
    { x: 50, y: 13, state: 'random' },
    { x: 48, y: 15, state: 'locked' },
  ],
  // (the contents are the fixup's: they need Medusa's spot)
};

/**
 * ref: dat/medusa-4.lua: Medusa rules slithery monsters from her palace, a yellow dragon nesting
 * in the backyard; Medusa, the down stairs and Perseus in one of four rooms, a statue in another
 */
export const MEDUSA_4: LevelDef = {
  id: 'nh:medusa-4',
  init: STONE,
  map: { rows: [...MAP_4] },
  regions: [
    lit([0, 0, 74, 19]),
    lit([13, 3, 18, 13]), // the first room (type "ordinary", irregular, lit = 1)
  ],
  teleportRegions: [
    { area: [64, 1, 74, 17], dir: 'down' },
    { area: [2, 2, 18, 13], dir: 'up' },
  ],
  stairs: {
    up: { region: [67, 1, 74, 20] },
    down: { x: 4, y: 8 }, // moved to Medusa's spot by the fixup
    branch: { region: [27, 0, 75, 20] }, // {27,00,79,20} cut at the map as medusa-1's
  },
  doors: [
    { x: 4, y: 6, state: 'locked' },
    { x: 4, y: 10, state: 'locked' },
    { x: 8, y: 4, state: 'locked' },
    { x: 8, y: 12, state: 'locked' },
    { x: 10, y: 6, state: 'locked' },
    { x: 10, y: 10, state: 'locked' },
    { x: 12, y: 8, state: 'locked' },
  ],
  // (the contents are the fixup's: they need Medusa's spot)
};

/** The four variants, `rnd(4)` (ref: dat/dungeon.lua medusa nlevels 4). */
export const MEDUSA_VARIANTS: readonly LevelDef[] = [MEDUSA_1, MEDUSA_2, MEDUSA_3, MEDUSA_4];

/**
 * "the first room defined on the medusa level", map-relative, where fixup_special() puts its
 * statues (an irregular room's bounds are its region's).
 */
export const FIRST_ROOM: Readonly<Record<DefId, LevelRect>> = {
  [MEDUSA_1.id]: [35, 9, 41, 10],
  [MEDUSA_2.id]: [61, 3, 72, 16],
  [MEDUSA_3.id]: [49, 14, 51, 16],
  [MEDUSA_4.id]: [13, 3, 18, 13],
};

// ---------------------------------------------------------------------------------------------
// The fixups.

/**
 * ref: include/monsters.h PM_KNIGHT: a human stands in (zoo.ts too); written before the knight
 * row existed (m17 step 2), and not switched since
 */
const HUMAN: DefId = 'nh:human';

/** ref: nhlib.lua percent() */
const percent = (ctx: Pick<Ctx, 'rng'>, n: number): boolean => ctx.rng.rn2(100) < n;

/**
 * des.object({ id = "statue", buc = "uncursed", montype = "knight", historic = 1, male = 1,
 * name = "Perseus", contents = ... }): an uncursed historic statue (of a human here) holding,
 * each by its percent, a cursed +0 shield of reflection, +0 levitation boots, a blessed +2
 * scimitar and a sack. ref: src/sp_lev.c create_object() (SP_OBJ_CONTAINER, SP_OBJ_CONTENT)
 */
function perseus(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  at: Pos,
  chance: readonly [shield: number, boots: number, scimitar: number, sack: number],
): void {
  const p = mapToLevel(def, level, at.x, at.y);
  const gen = { level: level.id, inMklev: true };
  const statue = mksobjFull(
    ctx,
    ctx.defs.object(STATUE),
    { at: { level: level.id, x: p.x, y: p.y }, corpseOf: HUMAN },
    gen,
  );
  const sit = ctx.state.entities[String(statue)]?.c.item;
  if (sit) sit.buc = 'uncursed';
  setHistoric(ctx, statue, true);
  deleteContents(ctx, statue);
  const inside = (id: string, buc?: 'cursed' | 'blessed', spe?: number): void => {
    const o = mksobjFull(ctx, ctx.defs.object(id as DefId), { init: true }, gen);
    const it = ctx.state.entities[String(o)]?.c.item;
    if (it && buc) it.buc = buc;
    if (it && spe !== undefined) it.spe = spe;
    addToStatue(ctx, statue, o);
  };
  if (percent(ctx, chance[0])) inside('nh:shield_of_reflection', 'cursed', 0);
  if (percent(ctx, chance[1])) inside('nh:levitation_boots', undefined, 0);
  if (percent(ctx, chance[2])) inside('nh:scimitar', 'blessed', 2);
  if (percent(ctx, chance[3])) inside('nh:sack');
}

/** The down stairs core put on the LevelDef's spot go to `to` (des.stair("down", medloc)). */
function moveDownStairs(level: Level, to: Pos): void {
  const from = level.down;
  if (!from || (from.x === to.x && from.y === to.y)) return;
  setTerrain(level, from.x, from.y, T.floor);
  setTerrain(level, to.x, to.y, T.stairs_down);
  level.down = { ...to };
}

/** A stone resister or a golem that stoning would turn into a stone golem. */
function stoneproof(ctx: Ctx, mon: DefId): boolean {
  const d = ctx.defs.monster(mon);
  return d.resists.includes('stone') || polyWhenStoned(d, isGenocided(ctx.state, 'nh:stone_golem'));
}

/** set_corpsenm(otmp, rndmonnum()) until the statue's monster could be stoned (99 tries). */
function rerollStoneproof(ctx: Ctx, level: Level, statue: number): void {
  const it = ctx.state.entities[String(statue)]?.c.item;
  if (!it) return;
  let tryct = 0;
  while (++tryct < 100 && it.corpseOf !== undefined && stoneproof(ctx, it.corpseOf))
    it.corpseOf = rndmonnum(ctx, levelDifficulty(ctx, level)).id;
}

/**
 * fixup_special()'s Medusa statues, in the first room: rnd(4) tries at a random spot of it that
 * is a good position, each a player-monster statue (mk_tt_object()) re-rolled while its monster
 * resists stoning; then one more at a random spot, a player-monster statue or (half the time) an
 * uninitialised statue of a random monster ("Medusa statues don't contain books"), re-rolled
 * likewise. ref: src/mkmaze.c fixup_special() Is_medusa_level
 */
export function medusaStatues(ctx: Ctx, level: Level, def: LevelDef): void {
  const r = FIRST_ROOM[def.id];
  if (!r) return;
  const a = mapToLevel(def, level, r[0], r[1]);
  const b = mapToLevel(def, level, r[2], r[3]);
  const somex = (): number => a.x + ctx.rng.rn2(b.x - a.x + 1); // rn1(hx - lx + 1, lx)
  const somey = (): number => a.y + ctx.rng.rn2(b.y - a.y + 1);
  for (let tryct = ctx.rng.rnd(4); tryct; tryct--) {
    const x = somex();
    const y = somey();
    if (goodposNone(ctx, level, x, y)) {
      const otmp = mkTtObject(ctx, 'nh:statue', { level: level.id, x, y }, true);
      rerollStoneproof(ctx, level, otmp);
    }
  }
  const x = somex();
  const y = somey();
  const at = { level: level.id, x, y };
  const otmp = ctx.rng.rn2(2)
    ? mkTtObject(ctx, 'nh:statue', at, true)
    : mkcorpstat(ctx, null, at, { inMklev: true }); // CORPSTAT_NONE
  rerollStoneproof(ctx, level, otmp);
}

/** medusa-1 and medusa-2: Perseus's statue comes first among the objects. */
const perseusFixup = (at: Pos, chance: Parameters<typeof perseus>[4]): SpLevFixup => ({
  before(ctx, level, def) {
    perseus(ctx, level, def, at, chance);
  },
  after: medusaStatues,
});

/**
 * medusa-3: the three rooms' spots give Medusa's (with the down stairs and Perseus), a statue's
 * and the fountain's; then the script's objects, traps and monsters in its order.
 */
const MEDUSA_3_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const place = [
      { x: 8, y: 6 },
      { x: 66, y: 5 },
      { x: 46, y: 15 },
    ];
    const medloc = rndcoord(ctx, place);
    const altloc = rndcoord(ctx, place);
    const othloc = rndcoord(ctx, place);
    moveDownStairs(level, mapToLevel(def, level, medloc.x, medloc.y));
    const f = mapToLevel(def, level, othloc.x, othloc.y);
    if (terrainIdAt(level, f.x, f.y) === T.floor) setTerrain(level, f.x, f.y, T.fountain);
    perseus(ctx, level, def, medloc, [75, 25, 50, 50]);
    makeContents(ctx, level, def, [
      STATUE_AT(altloc.x, altloc.y),
      statues(6),
      objects(8),
      { kind: 'object', id: 'nh:scroll_of_blank_paper', x: 48, y: 18 },
      { kind: 'object', id: 'nh:scroll_of_blank_paper', x: 48, y: 18 },
      { kind: 'trap', id: 'nh:rust_trap' },
      { kind: 'trap', id: 'nh:rust_trap' },
      { kind: 'trap', id: 'nh:squeaky_board' },
      { kind: 'trap', id: 'nh:squeaky_board' },
      traps(1),
      // Medusa before the others, so that they can't steal her spot on the down stairs
      monAt('nh:medusa', medloc.x, medloc.y, true),
      mon('nh:giant_eel', 2),
      mon('nh:jellyfish', 2),
      mon('nh:wood_nymph', 2),
      mon('nh:water_nymph', 2),
      { kind: 'monster', id: 'nh:raven', count: 30, peaceful: false },
    ]);
  },
  after: medusaStatues,
};

/**
 * medusa-4: two of the four rooms' spots give Medusa's (with the down stairs and Perseus) and a
 * statue's; then the script's crystal ball, objects, traps and monsters in its order.
 */
const MEDUSA_4_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    const place = [
      { x: 4, y: 8 },
      { x: 10, y: 4 },
      { x: 10, y: 8 },
      { x: 10, y: 12 },
    ];
    const medloc = rndcoord(ctx, place);
    const altloc = rndcoord(ctx, place);
    moveDownStairs(level, mapToLevel(def, level, medloc.x, medloc.y));
    makeContents(ctx, level, def, [{ kind: 'object', id: 'nh:crystal_ball', x: 7, y: 8 }]);
    perseus(ctx, level, def, medloc, [75, 25, 50, 50]);
    const egg: LevelContent = {
      kind: 'object',
      id: 'nh:egg',
      x: 5,
      y: 4,
      montype: 'nh:yellow_dragon',
    };
    makeContents(ctx, level, def, [
      STATUE_AT(altloc.x, altloc.y),
      statues(6),
      objects(8),
      traps(7),
      monAt('nh:medusa', medloc.x, medloc.y, true),
      monAt('nh:kraken', 7, 7),
      // the nesting dragon
      monAt('nh:yellow_dragon', 5, 4, true),
      { ...monAt('nh:baby_yellow_dragon', 4, 4, true), percent: 50 },
      { ...monAt('nh:baby_yellow_dragon', 4, 5, true), percent: 25 },
      egg,
      { ...egg, percent: 50 },
      { ...egg, percent: 25 },
      mon('nh:giant_eel', 2),
      mon('nh:jellyfish', 2),
      cls('S', 14),
      ...Array.from({ length: 4 }, () => [
        mon('nh:black_naga_hatchling'),
        mon('nh:black_naga'),
      ]).flat(),
    ]);
  },
  after: medusaStatues,
};

/** The Medusa levels' fixups, by LevelDef id (registerSpLev). */
export const MEDUSA_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [MEDUSA_1.id]: perseusFixup({ x: 36, y: 10 }, [75, 25, 50, 50]),
  [MEDUSA_2.id]: perseusFixup({ x: 68, y: 10 }, [25, 75, 50, 50]),
  [MEDUSA_3.id]: MEDUSA_3_FIXUP,
  [MEDUSA_4.id]: MEDUSA_4_FIXUP,
};
