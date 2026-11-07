// Orcish Town: Frontier Town after the orcs came, Minetown variant 1, and the orcs who left with
// its booty. ref: dat/minetn-1.lua; src/mkmaze.c fixup_special(), stolen_booty(),
// migrate_orc(), shiny_orc_stuff()
//
// Translation notes (see DEVIATIONS.md "Orcish Town"): the iron bars (`F`) are drawn as walls in
// the map, so that core's wallification joins the walls to them as NetHack's iswall() does, and
// the `before` fixup then turns them into `nh:iron_bars`. `replace_terrain` is expanded into one
// `edits` entry per `|` cell of each region. The teleport region is left out (no teleporting);
// the 10-19 rocks and their boulders are made. The corpses, candles, lamp, wands and
// the orc horde are the `after` fixup, in lua order. stolen_booty() makes the gang without its
// name and without the booty items that wait for orcs on the levels below.
import type { Ctx, DefId, Entity, Level, LevelDef, Pos, TerrainEdit } from '@nh/core';
import { cellIndex, dungeonLayout, levelIdFor, VANILLA_TERRAIN, wallifyLevel } from '@nh/core';
import { setCorpsenm } from './corpses';
import { makemon } from './generation';
import { addToInventory } from './items';
import { migrateToLevel } from './migrate';
import { mkobj, mksobjCorpse, mksobjFull } from './mkobj';
import { mkmonmoney } from './mongear';
import { mapToLevel, randomDrySpot, shuffle, type SpLevFixup } from './sp_lev';
import { setTerrain, T } from './terrain';

type Spot = readonly [x: number, y: number];

/** The lua map, with `F` for the iron bars. */
const LUA_MAP: readonly string[] = [
  '.....................................',
  '.----------------F------------------.',
  '.|.................................|.',
  '.|.-------------......------------.|.',
  '.|.|...|...|...|......|..|...|...|.|.',
  '.F.|...|...|...|......|..|...|...|.|.',
  '.|.|...|...|...|......|..|...|...|.F.',
  '.|.|...|...|----......------------.|.',
  '.|.---------.......................|.',
  '.|.................................|.',
  '.|.---------.....--...--...........|.',
  '.|.|...|...|----.|.....|.---------.|.',
  '.|.|...|...|...|.|.....|.|..|....|.|.',
  '.|.|...|...|...|.|.....|.|..|....|.|.',
  '.|.|...|...|...|.|.....|.|..|....|.|.',
  '.|.-------------.-------.---------.|.',
  '.|.................................F.',
  '.-----------F------------F----------.',
  '.....................................',
];

/** The map-relative spots of the iron bars. */
export const ORCTOWN_BARS: readonly Spot[] = LUA_MAP.flatMap((row, y) =>
  [...row].flatMap((ch, x): Spot[] => (ch === 'F' ? [[x, y]] : [])),
);

/** An `F` drawn as the wall it stands in: '-' between horizontal walls, else '|'. */
const MAP_ROWS: string[] = LUA_MAP.map((row) =>
  row.replace(/F/g, (_f, x: number) => (row[x - 1] === '-' || row[x + 1] === '-' ? '-' : '|')),
);

/**
 * des.replace_terrain({ region, fromterrain = "|", toterrain = ".", chance }): each `|` of the
 * region becomes floor `chance`% of the time, x outer and y inner as lspo_replace_terrain() walks.
 */
function replaceTerrain(x1: number, y1: number, x2: number, y2: number, chance: number) {
  const out: TerrainEdit[] = [];
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      if (LUA_MAP[y]?.[x] === '|') out.push({ percent: chance, set: [{ char: '.', at: [x, y] }] });
  return out;
}

/** "Orcish Town". ref: dat/minetn-1.lua */
export const MINETN_1: LevelDef = {
  id: 'nh:minetn-1',
  init: { style: 'mines', fg: 'nh:floor', smoothed: true, joined: true, walled: true },
  map: { rows: MAP_ROWS },
  // knock a few holes in the shop interior walls
  edits: [
    ...replaceTerrain(7, 4, 11, 6, 18),
    ...replaceTerrain(25, 4, 29, 6, 18),
    ...replaceTerrain(7, 12, 11, 14, 18),
    ...replaceTerrain(28, 12, 28, 14, 33),
  ],
  // the teleport region is left out (no teleporting)
  regions: [{ area: [1, 1, 35, 17], lit: true }],
  doors: [
    [5, 8],
    [9, 8],
    [13, 7],
    [22, 5],
    [27, 7],
    [31, 7],
    [5, 10],
    [9, 10],
    [15, 13],
    [25, 13],
    [31, 11],
  ].map(([x, y]) => ({ x: x ?? 0, y: y ?? 0, state: 'random' as const })),
  // the altar's defiled; useful for BUC but never coaligned (no temple room: no priest)
  features: [
    { kind: 'fountain', x: 16, y: 9 },
    { kind: 'fountain', x: 25, y: 9 },
    { kind: 'altar', x: 20, y: 13, align: 'noalign', shrine: true },
  ],
  // lua levregions with region_islev (NetHack x - 1 here; the down region counted from the
  // right edge and both to the second-last row) and map-relative excludes
  stairs: {
    up: { region: [0, 3, 20, -2], coords: 'level', exclude: [0, 1, 36, 17] },
    down: { region: [-24, 3, -6, -2], coords: 'level', exclude: [0, 1, 36, 17] },
  },
};

/** One spot each in most shops (`place`, shuffled). */
const PLACES: readonly Spot[] = [
  [5, 4],
  [9, 5],
  [13, 4],
  [26, 4],
  [31, 5],
  [30, 14],
  [5, 14],
  [10, 13],
  [26, 14],
  [27, 13],
];

/** ref: nhlua math.random(min, max) */
const random = (ctx: Pick<Ctx, 'rng'>, min: number, max: number): number =>
  min + ctx.rng.rn2(max - min + 1);
/** ref: nhlib.lua percent() */
const percent = (ctx: Pick<Ctx, 'rng'>, n: number): boolean => ctx.rng.rn2(100) < n;

/**
 * des.object({ id, coord, ... }) at a map spot, or at a random DRY spot of the map without one;
 * null when there is no room. ref: src/sp_lev.c create_object()
 */
function objectAt(ctx: Ctx, level: Level, def: LevelDef, id: string, at?: Spot): Entity | null {
  const p = at ? mapToLevel(def, level, at[0], at[1]) : randomDrySpot(ctx, level, def);
  if (!p) return null;
  const odef = ctx.defs.object(`nh:${id}`);
  const where = { at: { level: level.id, x: p.x, y: p.y } };
  const gen = { level: level.id, inMklev: true };
  const e =
    odef.id === 'nh:corpse'
      ? mksobjCorpse(ctx, odef, where, gen)
      : mksobjFull(ctx, odef, where, gen);
  return ctx.state.entities[String(e)] ?? null;
}

/** des.object({ id = "corpse", montype, coord }) ref: create_object() set_corpsenm() */
function corpseAt(ctx: Ctx, level: Level, def: LevelDef, montype: string, at?: Spot): void {
  const e = objectAt(ctx, level, def, 'corpse', at);
  if (e) setCorpsenm(ctx, e.id, `nh:${montype}`, true);
}

/**
 * des.monster({ id, coord, peaceful = 0 }): an occupied spot moves to a close one.
 * ref: src/sp_lev.c create_monster()
 */
function hostileAt(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  id: string,
  p: Pos | null,
): Entity | null {
  const at = p ?? randomDrySpot(ctx, level, def);
  if (!at) return null;
  const m = makemon(ctx, ctx.defs.monster(`nh:${id}`), at, { level: level.id, adjacentOk: true });
  const e = m === null ? undefined : ctx.state.entities[String(m)];
  if (!e?.c.monster) return null;
  e.c.monster.peaceful = false; // malign follows (luck.ts)
  return e;
}

/**
 * selection.floodfill(x, y): the cells joined to x,y (no diagonals) with its terrain, in the
 * column order selection_rndcoord() counts them (x outer, y inner).
 * ref: src/selvar.c selection_floodfill(); src/sp_lev.c floodfillchk_match_under()
 */
function floodfill(level: Level, start: Pos): Pos[] {
  const typ = level.cells[cellIndex(level, start.x, start.y)];
  const seen = new Set<number>([cellIndex(level, start.x, start.y)]);
  const stack: Pos[] = [start];
  const out: Pos[] = [];
  while (stack.length > 0) {
    const p = stack.pop() as Pos;
    out.push(p);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
      const i = cellIndex(level, x, y);
      if (seen.has(i) || level.cells[i] !== typ) continue;
      seen.add(i);
      stack.push({ x, y });
    }
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}

/** selection:rndcoord(removeit). ref: src/selvar.c selection_rndcoord() */
function rndcoord(ctx: Pick<Ctx, 'rng'>, sel: Pos[], removeit: boolean): Pos | null {
  if (sel.length === 0) return null;
  const c = ctx.rng.rn2(sel.length);
  const p = sel[c] as Pos;
  if (removeit) sel.splice(c, 1);
  return p;
}

/** The ring types that look "shiny" this game. ref: src/objnam.c shiny_obj() */
function shinyRing(ctx: Ctx): DefId | null {
  // rnd_otyp_by_namedesc("shiny", RING_CLASS, 0); a ring the hero called "shiny" is not matched
  const list = ctx.defs.objects.filter(
    (o) => o.class === 'ring' && ctx.state.appearances[o.id] === 'nh:shiny_ring',
  );
  const maxprob = list.reduce((a, o) => a + o.prob, 0);
  if (list.length === 0 || maxprob === 0) return null;
  let prob = ctx.rng.rn2(maxprob);
  let i = 0;
  for (; i < list.length - 1; i++) if ((prob -= (list[i] as { prob: number }).prob) < 0) break;
  return list[i]?.id ?? null;
}

/** Gold, a gem and perhaps a shiny ring for an orc of the gang. ref: src/mkmaze.c shiny_orc_stuff() */
function shinyOrcStuff(ctx: Ctx, level: Level, mon: Entity): void {
  const isCaptain = mon.def === 'nh:orc_captain';
  const goldprob = isCaptain ? 600 : 300;
  const gemprob = goldprob / 4;
  if (ctx.rng.rn2(1000) < goldprob) mkmonmoney(ctx, mon.id, 1 + ctx.rng.rnd(goldprob));
  if (ctx.rng.rn2(1000) < gemprob) {
    const g = mkobj(ctx, 'gem', { artif: false, level: level.id });
    if (g !== null) {
      if (ctx.state.entities[String(g)]?.def === 'nh:rock') ctx.remove(g);
      else addToInventory(ctx, mon.id, g);
    }
  }
  if (isCaptain || !ctx.rng.rn2(8)) {
    const otyp = shinyRing(ctx);
    if (otyp !== null) mksobjFull(ctx, ctx.defs.object(otyp), { artif: false, carriedBy: mon.id });
  }
}

/**
 * The orc goes to a deeper level of this dungeon: the leader to the bottom (one level up 1 time
 * in 40), the others anywhere below. ref: src/mkmaze.c migrate_orc()
 */
function migrateOrc(ctx: Ctx, level: Level, mon: Entity, leader: boolean): void {
  const cur = level.dlevel;
  const max = dungeonLayout(ctx.state, level.dungeon).levels ?? cur + 1;
  let nlev: number;
  if (leader) {
    nlev = max;
    if (!ctx.rng.rn2(40)) nlev--;
  } else {
    nlev = ctx.rng.rn2(max - cur + 1) + cur;
    if (nlev === cur) nlev++;
    if (nlev > max) nlev = max;
  }
  migrateToLevel(ctx, mon, levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: nlev }));
}

/** The orcs of each kind that join the gang: PM_ORC .. PM_ORC_SHAMAN in monsters.h order. */
const GANG = ['orc', 'hill_orc', 'mordor_orc', 'uruk_hai', 'orc_shaman'] as const;

/**
 * The orcs who sacked the town left with its booty: their leader waits at the bottom of the
 * Mines and 5 to 14 more on the levels between. Not ported: the gang's name (and naming the
 * town's own orcs after it) and the booty items. ref: src/mkmaze.c stolen_booty()
 */
export function stolenBooty(ctx: Ctx, level: Level): void {
  const make = (id: string): Entity | null => {
    const m = makemon(ctx, ctx.defs.monster(`nh:${id}`), null, { level: level.id });
    return m === null ? null : (ctx.state.entities[String(m)] ?? null);
  };
  const leader = make('orc_captain');
  if (leader?.c.monster) {
    leader.c.monster.peaceful = false;
    shinyOrcStuff(ctx, level, leader);
    migrateOrc(ctx, level, leader, true);
  }
  const cnt = ctx.rng.rn2(10) + 5;
  for (let i = 0; i < cnt; i++) {
    const mon = make(GANG[ctx.rng.rn2(GANG.length)] as string);
    if (!mon) continue;
    shinyOrcStuff(ctx, level, mon);
    migrateOrc(ctx, level, mon, false);
  }
}

export const ORCTOWN_FIXUP: SpLevFixup = {
  /**
   * des.wallify() (the map block and one more cell around it, run here while the bars are
   * still walls, as iswall() counts iron bars) and then the bars themselves.
   * ref: src/sp_lev.c lspo_wallify(), wallify_map(); src/mkmaze.c iswall()
   */
  before(_ctx, level, def) {
    const tl = mapToLevel(def, level, 0, 0);
    const w = MAP_ROWS[0]?.length ?? 0;
    const h = MAP_ROWS.length;
    wallifyLevel(level, VANILLA_TERRAIN, [tl.x - 1, tl.y - 1, tl.x + w + 1, tl.y + h + 1]);
    for (const [x, y] of ORCTOWN_BARS) {
      const p = mapToLevel(def, level, x, y);
      setTerrain(level, p.x, p.y, T.iron_bars);
    }
  },
  after(ctx, level, def) {
    const place = [...PLACES];
    shuffle(ctx, place);
    const p = (n: number): Spot => place[n - 1] as Spot; // lua is 1-based

    // scatter some bodies
    corpseAt(ctx, level, def, 'aligned_cleric', [20, 12]);
    for (let n = 1; n <= 5; n++) corpseAt(ctx, level, def, 'shopkeeper', p(n));
    for (let n = 0; n < 4; n++) corpseAt(ctx, level, def, 'watchman');
    corpseAt(ctx, level, def, 'watch_captain');

    // Rubble!
    const rubble = random(ctx, 10, 19);
    for (let i = 0; i < rubble; i++) {
      if (percent(ctx, 90)) objectAt(ctx, level, def, 'boulder');
      objectAt(ctx, level, def, 'rock');
    }

    // seven candles or more, since there is no Izchak; the quantity is rolled first (lua)
    const candles = (id: string, n: number, min: number, max: number): void => {
      const quantity = random(ctx, min, max);
      const it = objectAt(ctx, level, def, id, p(n))?.c.item;
      if (it) it.quantity = quantity;
    };
    candles('wax_candle', 4, 1, 2);
    candles('wax_candle', 1, 2, 4);
    candles('wax_candle', 2, 1, 2);
    candles('tallow_candle', 3, 1, 3);
    candles('tallow_candle', 2, 1, 2);
    candles('tallow_candle', 4, 1, 2);

    // a lamp next to one corpse, and some empty wands
    objectAt(ctx, level, def, 'oil_lamp', p(2));
    const emptyWand = (id: string, n: number): void => {
      const it = objectAt(ctx, level, def, id, p(n))?.c.item;
      if (!it) return;
      it.spe = 0;
      it.buc = 'uncursed';
    };
    emptyWand('wand_of_striking', 1);
    emptyWand('wand_of_striking', 3);
    emptyWand('wand_of_striking', 4);
    emptyWand('wand_of_magic_missile', 4);
    emptyWand('wand_of_magic_missile', 5);

    // the Orcish Army
    const inside = floodfill(level, mapToLevel(def, level, 18, 8));
    const tl = mapToLevel(def, level, 0, 0);
    const nearTemple = inside.filter(
      (q) => q.x >= tl.x + 17 && q.x <= tl.x + 23 && q.y >= tl.y + 8 && q.y <= tl.y + 14,
    );
    const army = random(ctx, 5, 15);
    for (let i = 0; i < army; i++) {
      const id = percent(ctx, 50) ? 'orc_captain' : percent(ctx, 80) ? 'uruk_hai' : 'mordor_orc';
      hostileAt(ctx, level, def, id, rndcoord(ctx, inside, true));
    }
    // shamans can be hanging out in/near the temple; one of them is higher level
    const shamans = random(ctx, 1, 6);
    for (let i = 1; i <= shamans; i++) {
      const at = rndcoord(ctx, nearTemple, false);
      const m = hostileAt(ctx, level, def, 'orc_shaman', at)?.c.monster;
      if (m && i === 1) m.level = Math.min(Math.max(m.level + 3, 0), 49); // m_lev_adj = 3
    }
    // these are not such a big deal to run into outside the bars
    const rabble = random(ctx, 10, 19);
    for (let i = 0; i < rabble; i++)
      hostileAt(ctx, level, def, percent(ctx, 90) ? 'hill_orc' : 'goblin', null);

    // ref: src/mkmaze.c fixup_special(): `u.uz.dnum == mines_dnum && ransacked`
    stolenBooty(ctx, level);
  },
};
