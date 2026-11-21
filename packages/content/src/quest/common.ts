// What the quest level files (quest/<code>.ts) share: shorthands for their contents lists, the
// leader's custom inventory, the quest artifact on the goal level, objects with a quantity, BUC or
// spinach, up stairs a script puts off its map and stairs it puts at random after its own
// terrain, the home level's branch levregion, altars of the hero's alignment or against it,
// irregular regions' lighting, des.wallify() and random engravings. Imported by the quest level
// files only.
// ref: src/sp_lev.c create_monster(), create_object(), create_altar(), lspo_region(),
// l_create_stairway(), lspo_wallify(), lspo_engraving(); src/mkmap.c flood_fill_rm();
// src/mkmaze.c fixup_special()
import {
  levelDefArea,
  trapAt,
  VANILLA_TERRAIN,
  wallifyLevel,
  type Buc,
  type Ctx,
  type DefId,
  type EntityId,
  type Level,
  type LevelContent,
  type LevelDef,
  type Pos,
} from '@nh/core';
import { altarOf, type Aligntyp } from '../aligntyp';
import { onameItem } from '../artistate';
import { ualignBase } from '../luck';
import { minvent, mDoWear } from '../mongear';
import { templePriests } from '../priest';
import {
  createMonster,
  createObject,
  desEngraving,
  desLevregion,
  desStair,
  dry,
  getLocation,
  mapToLevel,
  randomDrySpot,
} from '../sp_lev';
import { mpickobj } from '../steal';
import { T, setTerrain, terrainIdAt } from '../terrain';

/** des.monster(id) or des.monster(id, x, y). */
export const mon = (id: string, x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined
    ? { kind: 'monster', id: id as DefId }
    : { kind: 'monster', id: id as DefId, x, y };
/** des.monster({ id, x, y, peaceful = 0 }). */
export const hostile = (id: string, x?: number, y?: number): LevelContent => ({
  ...mon(id, x, y),
  peaceful: false,
});
/** des.monster(class) or des.monster({ class, peaceful }). */
export const cls = (c: string, peaceful?: boolean): LevelContent =>
  peaceful === undefined ? { kind: 'monster', class: c } : { kind: 'monster', class: c, peaceful };
/** des.object() or des.object({ x, y }). */
export const obj = (x?: number, y?: number): LevelContent =>
  x === undefined || y === undefined ? { kind: 'object' } : { kind: 'object', x, y };
/** des.trap(), des.trap(id) or des.trap(id, x, y). */
export const trap = (id?: DefId, x?: number, y?: number): LevelContent => ({
  kind: 'trap',
  ...(id !== undefined ? { id } : {}),
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
});
/** `n` copies of one entry. */
export const times = (n: number, c: LevelContent): LevelContent[] =>
  Array.from({ length: n }, () => c);

/** What a des.object() of a custom inventory may say besides its id and `spe`. */
export interface InvOpts {
  buc?: Buc;
  /** oname() (ONAME_LEVEL_DEF): an artifact's name makes it that artifact. */
  name?: string;
}

/**
 * des.monster({ id, coord, inventory = function() des.object({ id, spe, buc, name })... end }):
 * made with its species' inventory, which a custom inventory discards (no special objects to
 * drop: a leader carries none), then each des.object() is made (at a random spot, as
 * create_object() does), given its spe, BUC and name, and given to it, and it puts on what it can
 * wear. ref: src/sp_lev.c lspo_monster(), create_monster() (discard_minvent()), create_object()
 * (invent_carrying_monster), spo_end_moninvent()
 */
export function monWithInventory(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  id: DefId,
  x: number,
  y: number,
  items: readonly (readonly [DefId, number] | readonly [DefId, number, InvOpts])[],
): EntityId | null {
  const m = createMonster(ctx, level, mon(id, x, y), def);
  if (m === null) return null;
  for (const o of minvent(ctx, m)) ctx.remove(o.id);
  for (const [oid, spe, opts] of items) giveObject(ctx, level, def, m, oid, spe, opts ?? {});
  mDoWear(ctx, m, true);
  return m;
}

/** One des.object({ id, spe, buc, name }) of a custom inventory. */
function giveObject(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  monId: EntityId,
  id: DefId,
  spe: number,
  opts: InvOpts,
): void {
  const o = createObject(ctx, level, { kind: 'object', id }, def);
  const e = o === null ? undefined : ctx.state.entities[String(o)];
  if (!e?.c.item) return;
  e.c.item.spe = spe;
  if (opts.buc !== undefined) e.c.item.buc = opts.buc;
  if (opts.name !== undefined) onameItem(ctx, id, e.c.item, opts.name, 'lvldef');
  mpickobj(ctx, monId, e);
}

/**
 * des.object({ id, coord, quantity, buc, montype = "spinach" }) at a Level spot: `quantity` for
 * an object that stacks, `buc`, and a tin of spinach (spe 1, no monster: the port's way of
 * saying TIN_SPINACH). ref: src/sp_lev.c lspo_object(), create_object()
 */
export function objectAt(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  id: DefId,
  p: Pos,
  opts: { quantity?: number; buc?: Buc; spinach?: true } = {},
): EntityId | null {
  const o = createObject(ctx, level, { kind: 'object', id, x: p.x, y: p.y, coords: 'level' }, def);
  const it = o === null ? undefined : ctx.state.entities[String(o)]?.c.item;
  if (!it) return o;
  if (opts.spinach) {
    it.spe = 1;
    delete it.corpseOf;
  }
  if (opts.buc !== undefined) it.buc = opts.buc;
  if (opts.quantity !== undefined) it.quantity = opts.quantity;
  return o;
}

/**
 * des.object({ id, x, y, buc = "blessed", spe, name }): the quest artifact on the goal level,
 * named through oname() (ONAME_LEVEL_DEF). ref: src/sp_lev.c create_object()
 */
export function questArtifact(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  base: DefId,
  x: number,
  y: number,
  spe: number,
  name: string,
): void {
  const o = createObject(ctx, level, { kind: 'object', id: base, x, y }, def);
  const it = o === null ? undefined : ctx.state.entities[String(o)]?.c.item;
  if (!it) return;
  it.spe = spe;
  it.buc = 'blessed';
  onameItem(ctx, base, it, name, 'lvldef');
}

/**
 * Up stairs the script puts off its map: core put them on `placeholder` (map floor), which goes
 * back to floor until the fixup makes them where the script has them (desStair()).
 */
export function liftUpPlaceholder(
  level: Level,
  def: LevelDef,
  placeholder: { x: number; y: number },
): void {
  const ph = mapToLevel(def, level, placeholder.x, placeholder.y);
  setTerrain(level, ph.x, ph.y, T.floor);
  level.up = null;
}

/**
 * des.stair(dir) with no spot, for a script that lays out its own terrain after core put the
 * stairs (they went on placeholders the fixup lifted): a random DRY spot of floor, corridor or
 * ice (good_stair_loc()) inside `def`'s map block, any trap there removed, then the stairs if the
 * dungeon gives the level such stairs (the spot is drawn either way). ref: src/sp_lev.c
 * l_create_stairway(), good_stair_loc(), get_location()
 */
export function stairAtRandom(ctx: Ctx, level: Level, def: LevelDef, dir: 'up' | 'down'): void {
  const p = getLocation(ctx, level, def, (q) => {
    const id = terrainIdAt(level, q.x, q.y);
    return (id === T.floor || id === T.corr || id === T.ice) && dry(ctx, level, q);
  });
  if (!p) return;
  if (trapAt(level, p.x, p.y)) ctx.removeTrap(level.id, p);
  desStair(ctx, level, dir, p);
}

/**
 * des.levregion({ region = {x,y,x,y}, type = "branch" }) as fixup_special() places it once the
 * level is done: on the home level, the magic portal back to the main dungeon.
 */
export function branchAt(ctx: Ctx, level: Level, def: LevelDef, x: number, y: number): void {
  const a = mapToLevel(def, level, x, y);
  desLevregion(ctx, level, 'branch', [a.x, a.y, a.x, a.y], null);
}

/** ref: src/sp_lev.c noncoalignment(): one of the two other alignments (`rn2(2)`). */
export function noncoalignment(ctx: Pick<Ctx, 'rng'>, al: number): Aligntyp {
  const k = ctx.rng.rn2(2);
  if (al === 0) return k ? -1 : 1;
  return k ? (-al as Aligntyp) : 0;
}

/**
 * des.altar({ x, y, align, type }) with an alignment worked out by the fixup ("coaligned": the
 * hero's original one, "noncoaligned": noncoalignment(), or nhlib's shuffled `align[]`); a
 * `shrine` in a temple gets its priest now (priestini(), as create_altar() makes him with the
 * altar). ref: src/sp_lev.c create_altar(), sp_amask_to_amask()
 */
export function altarAt(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  x: number,
  y: number,
  al: Aligntyp,
  shrine = false,
): void {
  const p = mapToLevel(def, level, x, y);
  setTerrain(level, p.x, p.y, altarOf(al));
  if (!shrine) return;
  if (!level.shrines?.some((s) => s.x === p.x && s.y === p.y))
    (level.shrines ??= []).push({ x: p.x, y: p.y });
  templePriests(ctx, level);
}

/** The hero's original alignment as an altar's (sp_amask_to_amask() AM_SPLEV_CO). */
export const coaligned = (ctx: Pick<Ctx, 'state'>): Aligntyp => ualignBase(ctx.state) as Aligntyp;

/**
 * The lighting of an untyped irregular region, des.region({ region = {x,y,..}, lit, type =
 * "ordinary", irregular = 1 }): the cells of the map's character at x,y joined to it (diagonals
 * too, flood_fill_rm()), read from the script's rows, where 'B' (an invisible boundary,
 * CROSSWALL until the regions are laid out) stops the fill. No room is made for it (DEVIATIONS
 * "Quest levels (m24b)"). ref: src/sp_lev.c lspo_region() (irregular); src/mkmap.c
 * flood_fill_rm()
 */
export function lightIrregular(
  level: Level,
  def: LevelDef,
  rows: readonly string[],
  x: number,
  y: number,
  lit: boolean,
): void {
  const at = (cx: number, cy: number): string | undefined => rows[cy]?.[cx];
  const ch = at(x, y);
  if (ch === undefined) return;
  const seen = new Set<string>([`${String(x)},${String(y)}`]);
  const stack: [number, number][] = [[x, y]];
  const light = (cx: number, cy: number): void => {
    const p = mapToLevel(def, level, cx, cy);
    level.lit[p.y * level.width + p.x] = lit ? 1 : 0;
  };
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    light(cx, cy);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = at(cx + dx, cy + dy);
        // a lit room's walls and doors are lit with it (its edge)
        if (lit && n !== undefined && '-|+S'.includes(n)) light(cx + dx, cy + dy);
        const k = `${String(cx + dx)},${String(cy + dy)}`;
        if (seen.has(k) || n !== ch) continue;
        seen.add(k);
        stack.push([cx + dx, cy + dy]);
      }
  }
}

/** A map's rows with its 'B' boundaries as floor (core maps have no 'B'; remove_boundary_syms()). */
export const unbounded = (rows: readonly string[]): string[] =>
  rows.map((r) => r.replaceAll('B', '.'));

/**
 * des.wallify(): stone next to open ground becomes wall, from one cell before the map block to
 * two after it (xstart - 1 .. xstart + xsize + 1). ref: src/sp_lev.c lspo_wallify(),
 * wallify_map()
 */
export function wallifyMap(level: Level, def: LevelDef): void {
  const a = levelDefArea(def, level.width, level.height);
  wallifyLevel(level, VANILLA_TERRAIN, [a.x - 1, a.y - 1, a.x + a.w + 1, a.y + a.h + 1]);
}

/**
 * des.engraving({ type, text }) at a random DRY spot of the map. ref: src/sp_lev.c
 * lspo_engraving()
 */
export function engraveRandom(
  ctx: Ctx,
  level: Level,
  def: LevelDef,
  type: 'engrave' | 'dust' | 'burn',
  text: string,
): void {
  const p = randomDrySpot(ctx, level, def);
  if (!p) return;
  const o = mapToLevel(def, level, 0, 0);
  desEngraving(ctx, level, def, { x: p.x - o.x, y: p.y - o.y }, type, text);
}
