// Ladders: `<` and `>` on a ladder lead to the level above or below in the same dungeon and
// arrive on the ladder there that leads back (the Wizard's Tower's: wizard1's down to wizard2's
// up, wizard2's down to wizard3's up). A ladder is a terrain whose `stairs` direction the up and
// down offers already read, so it is stairs to every rule that asks for stairs.
// ref: src/sp_lev.c l_create_stairway() (des.ladder()); src/do.c goto_level() (at_ladder,
// stairway_find_from(), u_on_newpos()); src/dog.c mon_arrive() (MIGR_LADDER_UP/DOWN)
import {
  cellIndex,
  levelDefPos,
  levelIdFor,
  specialLevelAt,
  type Ctx,
  type DefId,
  type Level,
  type LevelDef,
  type LevelRef,
  type Pos,
} from '@nh/core';
import { T } from './terrain';

/** Whether terrain `id` is a ladder (up or down). ref: levl[x][y].typ == LADDER */
export const isLadder = (id: DefId | undefined): boolean =>
  id === T.ladder_up || id === T.ladder_down;

/**
 * The des.ladder() spots of the levels that have ladders, map-relative, by LevelDef id: their
 * fixups put the ladders there, and the hero bound for one of these levels not yet made arrives
 * there. ref: dat/wizard1.lua, wizard2.lua, wizard3.lua, tower1.lua, tower2.lua, tower3.lua
 * des.ladder()
 */
export const LADDER_SPOTS: Readonly<
  Record<DefId, { up?: readonly [number, number]; down?: readonly [number, number] }>
> = {
  'nh:wizard1': { down: [6, 5] },
  'nh:wizard2': { up: [12, 1], down: [14, 11] },
  'nh:wizard3': { up: [11, 7] },
  'nh:tower1': { down: [11, 5] },
  'nh:tower2': { up: [11, 5], down: [3, 7] },
  'nh:tower3': { up: [5, 7] },
};

/** The first cell of `level` (in column order) with terrain `id`, or null. */
export function findTerrain(level: Readonly<Level>, id: DefId): Pos | null {
  const k = level.palette.indexOf(id);
  if (k === -1) return null;
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++)
      if (level.cells[cellIndex(level, x, y)] === k) return { x, y };
  return null;
}

/**
 * The LevelDef level `to` will be built from when it is a special level with one variant (the
 * Wizard's Tower and the fake towers are), else null.
 */
export function plannedLevelDef(ctx: Pick<Ctx, 'state' | 'defs'>, to: LevelRef): LevelDef | null {
  const sp = specialLevelAt(ctx.state, to);
  if (!sp) return null;
  const v = ctx.defs.dungeon(to.dungeon).special?.find((s) => s.id === sp.id)?.variants;
  const id = v?.length === 1 ? v[0] : undefined;
  return id === undefined ? null : ctx.defs.level(id);
}

/**
 * A fixed spot of the LevelDef level `to` will be built from (map-relative `spot`), in Level
 * coordinates of a level the size of the hero's, or null when `to` has no such LevelDef.
 */
export function plannedSpot(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  to: LevelRef,
  spots: Readonly<Record<DefId, readonly [number, number] | undefined>>,
): Pos | null {
  const def = plannedLevelDef(ctx, to);
  const spot = def ? spots[def.id] : undefined;
  const cur = ctx.state.levels[ctx.state.currentLevel];
  if (!def || !spot || !cur) return null;
  return levelDefPos(def, cur.width, cur.height, spot[0], spot[1], undefined, `${def.id} spot`);
}

/**
 * Where the hero (who climbed `up` or down a ladder) arrives on level `to`: on its ladder that
 * leads back, found on a level already made or taken from the LevelDef of one to be made; null
 * when it has none (C's u_on_upstairs()/u_on_dnstairs() fallback).
 * ref: src/do.c goto_level() stairway_find_from(&u.uz0, at_ladder)
 */
export function ladderArrival(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  to: LevelRef,
  up: boolean,
): Pos | null {
  const level = ctx.state.levels[levelIdFor(ctx.state, to)];
  if (level) return findTerrain(level, up ? T.ladder_down : T.ladder_up);
  const spots: Record<DefId, readonly [number, number] | undefined> = {};
  for (const id of Object.keys(LADDER_SPOTS).sort() as DefId[])
    spots[id] = LADDER_SPOTS[id]?.[up ? 'down' : 'up'];
  return plannedSpot(ctx, to, spots);
}

/**
 * The first stairs (not a ladder) leading up (`up`) or down, branch stairs first as in C's
 * stairway list; null when there are none. ref: src/stairs.c stairway_find_type_dir(FALSE, up)
 */
export function stairwayDir(level: Readonly<Level>, up: boolean): { x: number; y: number } | null {
  const b = level.branch;
  if (b && (b.dir === 'up') === up) return b.pos;
  return up ? level.up : level.down;
}

/**
 * The stairs a monster heals on: down ones (`forward`) or up ones (up and down swap in a dungeon
 * built upward, Sokoban), else the branch stairs, else the other stairs; null when the level has
 * none (no ladders yet). Branch stairs going the wanted way are found first, as C's stairway list
 * holds them in front of the level's own stairs. (Here, a leaf, for covetous.ts and kops.ts.) ref: src/wizard.c choose_stairs();
 * src/stairs.c stairway_find_type_dir(); src/dungeon.c builds_up()
 */
export function chooseStairs(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  levelId: string,
  forward: boolean,
): { x: number; y: number } | null {
  const level = ctx.state.levels[levelId];
  if (!level) return null;
  const up = buildsUp(ctx, levelId) ? forward : !forward;
  const find = (dirUp: boolean): { x: number; y: number } | null => stairwayDir(level, dirUp);
  // no stairs: a ladder that way; then branch stairs, then the other way
  const ladder = (dirUp: boolean): { x: number; y: number } | null =>
    findTerrain(level, dirUp ? T.ladder_up : T.ladder_down);
  return find(up) ?? ladder(up) ?? level.branch?.pos ?? find(!up) ?? ladder(!up);
}

/**
 * The dungeon is entered at its last level (Sokoban): its levels build upward.
 * ref: src/dungeon.c builds_up() (no single-level branches)
 */
function buildsUp(ctx: Pick<Ctx, 'state'>, levelId: string): boolean {
  const level = ctx.state.levels[levelId];
  const d = level ? ctx.state.dungeons.find((x) => x.id === level.dungeon) : undefined;
  if (!d || d.levels === null || d.levels <= 1) return false;
  return (d.entry ?? 1) === d.levels;
}
