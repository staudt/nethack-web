// The Valkyrie's quest: the Norn's besieged hall on the ice (home), the lava field of the fire
// giants (locate), Lord Surtur's fortress in the lava (goal) and the mines-style fillers above and
// below the locate level. ref: dat/Val-strt.lua, Val-loca.lua, Val-goal.lua, Val-fila.lua,
// Val-filb.lua
//
// Translation notes (DEVIATIONS.md "The quest"): maps, lit regions, fixed stairs, the fountain,
// the doors and the contents are LevelDef data; "mazelevel", "noteleport", "hardfloor",
// "icedpools" and the non-diggable areas are levelflags.ts entries. A level script's
// des.level_init({ style = "solidfill" }) before its mines-style init is not drawn (as
// minefill's). Val-strt's random lava pools come before its map in the script: the fixup draws
// them first and lays them where the map keeps the fill ('x'). The Norn's custom inventory, the
// Orb of Fate (blessed, +5, named through onameItem()) and the goal level's drawbridges and lava
// replacement are fixups, in the script's order; the branch levregion is placed last, as
// fixup_special() does, and makes the portal back to the main dungeon.
import type { DefId, EntityId, Level, LevelContent, LevelDef, LevelRect } from '@nh/core';
import { onameItem } from '../artistate';
import { createDrawbridge } from '../dbridge';
import { minvent, mDoWear } from '../mongear';
import {
  percent,
  replaceTerrain,
  selArea,
  selGrow,
  selNew,
  selOr,
  selSetRandom,
  setSel,
} from '../selection';
import {
  createMonster,
  createObject,
  desLevregion,
  desStair,
  makeContents,
  mapToLevel,
  type SpLevFixup,
} from '../sp_lev';
import { mpickobj } from '../steal';
import { T, setTerrain } from '../terrain';
import { TRAP } from '../trap';

const mon = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', id: id as DefId }
    : { kind: 'monster', id: id as DefId, x, y };
const hostile = (id: string, x?: number, y?: number): LevelContent => ({
  ...mon(id, x, y),
  peaceful: false,
});
const cls = (c: string, peaceful?: boolean): LevelContent =>
  peaceful === undefined ? { kind: 'monster', class: c } : { kind: 'monster', class: c, peaceful };
const obj = (): LevelContent => ({ kind: 'object' });
const trap = (id?: DefId, x?: number, y?: number): LevelContent => ({
  kind: 'trap',
  ...(id !== undefined ? { id } : {}),
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
const times = (n: number, c: LevelContent): LevelContent[] => Array.from({ length: n }, () => c);

const NORN = 'nh:norn';
const FIRE_ANT = 'nh:fire_ant';
const FIRE_GIANT = 'nh:fire_giant';
const WARRIOR = 'nh:warrior';

// ---------------------------------------------------------------------------------------------
// Val-strt: the home level

const STRT_MAP: readonly string[] = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxxxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..{..xxxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.....xxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..xxxxxxxxxxxxxxxxxxx',
  'xxxxxxxx.....xxxxxxxxxxxxx|----------------|xxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxx',
  'xxxxxxx..xxx...xxxxxxxxxxx|................|xxxxxxxxxx..xxxxxxxxxxxxxxxxxxxx',
  'xxxxxx..xxxxxx......xxxxx.|................|.xxxxxxxxx.xxxxxxxxxxxxxxxxxxxxx',
  'xxxxx..xxxxxxxxxxxx.......+................+...xxxxxxx.xxxxxxxxxxxxxxxxxxxxx',
  'xxxx..xxxxxxxxx.....xxxxx.|................|.x...xxxxx.xxxxxxxxxxxxxxxxxxxxx',
  'xxx..xxxxxxxxx..xxxxxxxxxx|................|xxxx.......xxxxxxxxxxxxxxxxxxxxx',
  'xxxx..xxxxxxx..xxxxxxxxxxx|----------------|xxxxxxxxxx...xxxxxxxxxxxxxxxxxxx',
  'xxxxxx..xxxx..xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxxxxxxxxxxxxxxxx',
  'xxxxxxx......xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxxxxxxxxxxxxxx',
  'xxxxxxxxx...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...x......xxxxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.........xxxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.......xxxxxx',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
];

/** Portal arrival point: des.levregion({ region = {66,17,66,17}, type="branch" }). */
const STRT_BRANCH: LevelRect = [66, 17, 66, 17];

/** ref: dat/Val-strt.lua: the Norn's hall, besieged on the ice */
export const VAL_STRT: LevelDef = {
  id: 'nh:val-strt',
  // des.level_init({ style = "solidfill", fg = "I" }) (lit omitted: the coin flip is drawn)
  init: { style: 'solidfill', fg: 'nh:ice' },
  map: { rows: [...STRT_MAP] },
  // Dungeon Description
  regions: [{ area: [0, 0, 75, 19], lit: true }],
  stairs: { down: { x: 18, y: 1 } },
  features: [{ kind: 'fountain', x: 53, y: 2 }],
  doors: [
    { x: 26, y: 10, state: 'locked' },
    { x: 43, y: 10, state: 'locked' },
  ],
  // after the Norn (the fixup makes her with her inventory first)
  contents: [
    // The treasure of the Norn
    { kind: 'object', id: 'nh:chest', x: 36, y: 10 },
    // valkyrie guards for the audience chamber
    ...(
      [
        [27, 8],
        [27, 9],
        [27, 11],
        [27, 12],
        [42, 8],
        [42, 9],
        [42, 11],
        [42, 12],
      ] as const
    ).map(([x, y]) => mon(WARRIOR, x, y)),
    // Random traps
    ...times(6, trap(TRAP.fire)),
    // Monsters on siege duty.
    ...(
      [
        [4, 12],
        [8, 8],
        [14, 4],
        [17, 11],
        [24, 10],
        [45, 10],
        [54, 2],
        [55, 7],
        [58, 14],
        [63, 17],
      ] as const
    ).map(([x, y]) => mon(FIRE_ANT, x, y)),
    hostile(FIRE_GIANT, 18, 1),
    hostile(FIRE_GIANT, 10, 16),
  ],
};

/**
 * The lava pools ringed by water, drawn before the map: 13 random spots, three more grown west,
 * north and in a random direction; the ring is the pools grown every way. They are laid where the
 * map keeps the fill ('x') and outside the map, so the map's own cells stay as in the script
 * (des.map() covers them afterwards). ref: dat/Val-strt.lua; src/nhlsel.c l_selection_setpoint()
 */
function strtPools(
  ctx: Parameters<NonNullable<SpLevFixup['before']>>[0],
  level: Level,
  def: LevelDef,
): void {
  let pools = selNew(level);
  // random locations
  for (let i = 1; i <= 13; i++) pools = selSetRandom(ctx.rng, level, pools);
  // some bigger ones
  pools = selOr(pools, selGrow(level, selSetRandom(ctx.rng, level, selNew(level)), 'west'));
  pools = selOr(pools, selGrow(level, selSetRandom(ctx.rng, level, selNew(level)), 'north'));
  pools = selOr(
    pools,
    selGrow(level, selSetRandom(ctx.rng, level, selNew(level)), 'random', ctx.rng),
  );
  // Lava pools surrounded by water: only where the map keeps the fill
  const origin = mapToLevel(def, level, 0, 0);
  const kept = selNew(level).map((_, i) => {
    const x = i % level.width;
    const y = Math.trunc(i / level.width);
    const ch = STRT_MAP[y - origin.y]?.[x - origin.x];
    return ch === undefined || ch === 'x';
  });
  const keep = (s: boolean[]): boolean[] => s.map((v, i) => v && kept[i] === true);
  setSel(level, keep(selGrow(level, pools, 'all')), 'P');
  setSel(level, keep(pools), 'L', { litLava: true });
}

/**
 * des.monster({ id = "Norn", coord = {35, 10}, inventory = ... }): made with her species'
 * inventory, which a custom inventory discards (no special objects to drop: she carries none),
 * then each des.object() is made (at a random spot, as create_object() does) and given to her,
 * and she puts on what she can wear. ref: src/sp_lev.c lspo_monster(), create_monster()
 * (discard_minvent()), create_object() (invent_carrying_monster), spo_end_moninvent()
 */
function nornWithInventory(
  ctx: Parameters<NonNullable<SpLevFixup['contents']>>[0],
  level: Level,
  def: LevelDef,
): void {
  const norn = createMonster(ctx, level, mon(NORN, 35, 10), def);
  if (norn === null) return;
  for (const o of minvent(ctx, norn)) ctx.remove(o.id);
  for (const [id, spe] of [
    ['nh:banded_mail', 5],
    ['nh:long_sword', 4],
  ] as const)
    giveObject(ctx, level, def, norn, id, spe);
  mDoWear(ctx, norn, true);
}

/** One des.object({ id, spe }) of a custom inventory. */
function giveObject(
  ctx: Parameters<NonNullable<SpLevFixup['contents']>>[0],
  level: Level,
  def: LevelDef,
  monId: EntityId,
  id: DefId,
  spe: number,
): void {
  const o = createObject(ctx, level, { kind: 'object', id }, def);
  const e = o === null ? undefined : ctx.state.entities[String(o)];
  if (!e?.c.item) return;
  e.c.item.spe = spe;
  mpickobj(ctx, monId, e);
}

const STRT_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    strtPools(ctx, level, def);
  },
  contents(ctx, level, def) {
    nornWithInventory(ctx, level, def);
    makeContents(ctx, level, def, def.contents ?? []);
  },
  after(ctx, level, def) {
    // fixup_special(): the branch levregion, a portal back to the main dungeon
    const a = mapToLevel(def, level, STRT_BRANCH[0], STRT_BRANCH[1]);
    desLevregion(ctx, level, 'branch', [a.x, a.y, a.x, a.y], null);
  },
};

// ---------------------------------------------------------------------------------------------
// Val-loca: the locate level

const LOCA_MAP: readonly string[] = [
  'PPPPxxxx                      xxxxPPPPPx',
  'PLPxxx                          xPPLLLPP',
  'PPP    .......................    PPPLLP',
  'xx   ............................   PPPP',
  'x  ...............................  xxxx',
  '  .................................   xx',
  '....................................   x',
  '  ...................................   ',
  'x  ..................................  x',
  'xx   ..............................   PP',
  'xPPP  ..........................     PLP',
  'xPLLP                             xxPLLP',
  'xPPPPxx                         xxxxPPPP',
];

/** des.stair("up", 48,14), off the map; a placeholder on the map's floor until the fixup. */
const LOCA_UP = { x: 48, y: 14 } as const;
const LOCA_UP_PLACEHOLDER = { x: 7, y: 2 } as const;

/**
 * Up stairs the script puts off its map: core put them on `placeholder` (map floor), which goes
 * back to floor until the fixup makes them where the script has them (desStair()).
 */
function liftUpPlaceholder(
  level: Level,
  def: LevelDef,
  placeholder: { x: number; y: number },
): void {
  const ph = mapToLevel(def, level, placeholder.x, placeholder.y);
  setTerrain(level, ph.x, ph.y, T.floor);
  level.up = null;
}

const LOCA_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftUpPlaceholder(level, def, LOCA_UP_PLACEHOLDER);
    desStair(ctx, level, 'up', mapToLevel(def, level, LOCA_UP.x, LOCA_UP.y));
  },
};

/** ref: dat/Val-loca.lua */
export const VAL_LOCA: LevelDef = {
  id: 'nh:val-loca',
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:ice',
    smoothed: true,
    joined: false,
    lit: true,
    walled: false,
  },
  map: { rows: [...LOCA_MAP] },
  regions: [{ area: [0, 0, 39, 12], lit: true }],
  // the up stairs lie off the map (map-relative 48,14): core first puts them on map floor
  stairs: { up: { ...LOCA_UP_PLACEHOLDER }, down: { x: 20, y: 6 } },
  contents: [
    ...times(15, obj()),
    ...times(4, trap(TRAP.fire)),
    ...times(2, trap()),
    ...times(17, mon(FIRE_ANT)),
    cls('a'),
    cls('H', false),
    ...times(7, hostile(FIRE_GIANT)),
    cls('H', false),
  ],
};

// ---------------------------------------------------------------------------------------------
// Val-goal: Lord Surtur's fortress

const GOAL_MAP: readonly string[] = [
  'xxxxxx.....................xxxxxxxx',
  'xxxxx.......LLLLL.LLLLL......xxxxxx',
  'xxxx......LLLLLLLLLLLLLLL......xxxx',
  'xxxx.....LLL|---------|LLL.....xxxx',
  'xxxx....LL|--.........--|LL.....xxx',
  'x......LL|-...LLLLLLL...-|LL.....xx',
  '.......LL|...LL.....LL...|LL......x',
  '......LL|-..LL.......LL..-|LL......',
  '......LL|.................|LL......',
  '......LL|-..LL.......LL..-|LL......',
  '.......LL|...LL.....LL...|LL.......',
  'xx.....LL|-...LLLLLLL...-|LL......x',
  'xxx.....LL|--.........--|LL.....xxx',
  'xxxx.....LLL|---------|LLL...xxxxxx',
  'xxxxx.....LLLLLLLLLLLLLLL...xxxxxxx',
  'xxxxxx......LLLLL.LLLLL.....xxxxxxx',
  'xxxxxxxxx..................xxxxxxxx',
];

/** The script's up stairs, "intentionally" off the map; core first puts them on map floor. */
const GOAL_UP = { x: 45, y: 10 } as const;
const GOAL_UP_PLACEHOLDER = { x: 6, y: 0 } as const;

/** ref: dat/Val-goal.lua */
export const VAL_GOAL: LevelDef = {
  id: 'nh:val-goal',
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:lava',
    smoothed: true,
    joined: true,
    lit: true,
    walled: false,
  },
  map: { rows: [...GOAL_MAP] },
  regions: [{ area: [0, 0, 34, 16], lit: true }],
  // a placeholder on map floor: the fixup moves them where the script has them, after the lava
  // around that spot is thinned out
  stairs: { up: { ...GOAL_UP_PLACEHOLDER } },
  // after the Orb of Fate (the fixup makes it first)
  contents: [
    ...times(14, obj()),
    // Traps
    trap(TRAP.squeaky, 13, 8),
    trap(TRAP.squeaky, 21, 8),
    // Random traps
    ...times(4, trap(TRAP.fire)),
    trap(TRAP.squeaky),
    ...times(2, trap()),
    // Random monsters.
    mon('nh:lord_surtur', 17, 8),
    ...times(4, mon(FIRE_ANT)),
    ...times(2, cls('a')),
    ...([6, 7, 8, 9, 10] as const).map((y) => hostile(FIRE_GIANT, 10, y)),
    ...([6, 7, 8, 9, 10] as const).map((y) => hostile(FIRE_GIANT, 24, y)),
    ...times(2, hostile(FIRE_GIANT)),
    cls('H', false),
  ],
};

const GOAL_FIXUP: SpLevFixup = {
  before(ctx, level, def) {
    liftUpPlaceholder(level, def, GOAL_UP_PLACEHOLDER);
    // if the stairs are surrounded by lava, maybe give some room
    const a = mapToLevel(def, level, 44, 9);
    const b = mapToLevel(def, level, 46, 11);
    replaceTerrain(ctx, level, selArea(level, a.x, a.y, b.x, b.y), 'L', '.', 50);
    desStair(ctx, level, 'up', mapToLevel(def, level, GOAL_UP.x, GOAL_UP.y));
    // Drawbridges; northern one opens from the south (portcullis) to further north (lowered
    // span), southern one from the north to further south
    const n = mapToLevel(def, level, 17, 2);
    createDrawbridge(ctx, level, n.x, n.y, 'south', ctx.rng.rn2(2) === 0);
    const s = mapToLevel(def, level, 17, 14);
    if (percent(ctx, 75)) createDrawbridge(ctx, level, s.x, s.y, 'north', true);
    else createDrawbridge(ctx, level, s.x, s.y, 'north', ctx.rng.rn2(2) === 0);
  },
  contents(ctx, level, def) {
    // des.object({ id = "crystal ball", x=17, y=08, buc="blessed", spe=5,
    // name="The Orb of Fate" })
    const o = createObject(ctx, level, { kind: 'object', id: 'nh:crystal_ball', x: 17, y: 8 }, def);
    const it = o === null ? undefined : ctx.state.entities[String(o)]?.c.item;
    if (it) {
      it.spe = 5;
      it.buc = 'blessed';
      onameItem(ctx, 'nh:crystal_ball', it, 'The Orb of Fate', 'lvldef');
    }
    makeContents(ctx, level, def, def.contents ?? []);
  },
};

// ---------------------------------------------------------------------------------------------
// the fillers

/** ref: dat/Val-fila.lua: between the home and the locate level */
export const VAL_FILA: LevelDef = {
  id: 'nh:val-fila',
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:ice',
    smoothed: true,
    joined: true,
    lit: true,
    walled: false,
  },
  contents: [
    ...times(9, obj()),
    ...times(5, mon(FIRE_ANT)),
    cls('a'),
    hostile(FIRE_GIANT),
    ...times(7, trap()),
  ],
};

/** ref: dat/Val-filb.lua: between the locate and the goal level */
export const VAL_FILB: LevelDef = {
  id: 'nh:val-filb',
  init: {
    style: 'mines',
    fg: 'nh:floor',
    bg: 'nh:lava',
    smoothed: true,
    joined: true,
    lit: true,
    walled: false,
  },
  contents: [
    ...times(11, obj()),
    ...times(3, mon(FIRE_ANT)),
    cls('a'),
    ...times(3, hostile(FIRE_GIANT)),
    ...times(5, trap(TRAP.fire)),
    ...times(2, trap()),
  ],
};

/** The Valkyrie's five levels. */
export const VAL_LEVELS: readonly LevelDef[] = [VAL_STRT, VAL_LOCA, VAL_GOAL, VAL_FILA, VAL_FILB];

/** Their fixups, by LevelDef id. */
export const VAL_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  [VAL_STRT.id]: STRT_FIXUP,
  [VAL_LOCA.id]: LOCA_FIXUP,
  [VAL_GOAL.id]: GOAL_FIXUP,
};
