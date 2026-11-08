// Statue state: which statues are historic (obj->spe & CORPSTAT_HISTORIC: the Oracle's centaurs,
// the Grotto's gnome king, a wished-for "historic statue"), and how a statue looks (the monster it
// shows, C 3.6+'s statue glyphs). The core item has no such field, so the flag lives in
// `modData.nh.historic` by item id (the `otrapped` pattern). A leaf module (core types only):
// objnam.ts reads it, statue.ts sets it.
// ref: include/obj.h CORPSTAT_HISTORIC; include/display.h obj_to_glyph() (GLYPH_STATUE_OFF)
import { itemsAt } from '@nh/core';
import type {
  AppearanceDef,
  Ctx,
  DefId,
  Entity,
  EntityId,
  GameState,
  LevelId,
  MonsterDef,
  Registry,
} from '@nh/core';

/** ref: include/objects.h STATUE */
export const STATUE: DefId = 'nh:statue';

interface StatueData {
  /** Historic statues, by item id. */
  historic?: Record<string, true>;
}

const read = (state: Readonly<GameState>): StatueData | undefined =>
  state.modData['nh'] as unknown as StatueData | undefined;

function data(ctx: Pick<Ctx, 'state'>): StatueData {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as StatueData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

/** sobj_at(STATUE, x, y): the topmost statue there, or null. */
export function statueAt(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: LevelId,
  x: number,
  y: number,
): Entity | null {
  return itemsAt(ctx.defs, ctx.state, level, x, y).find((e) => e.def === STATUE) ?? null;
}

/** glyph_is_statue(): the hero's map shows a statue at (x, y) (the remembered top object). */
export function rememberedStatue(state: Readonly<GameState>, level: LevelId, i: number): boolean {
  const id = state.objectMemory[level]?.[String(i)];
  return id !== undefined && (id === STATUE || id.startsWith('nh:statue-'));
}

/** `obj->spe & CORPSTAT_HISTORIC` */
export const isHistoric = (state: Readonly<GameState>, id: EntityId): boolean =>
  read(state)?.historic?.[String(id)] === true;

/** Sets or clears the historic flag. */
export function setHistoric(ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void {
  const d = data(ctx);
  if (on) (d.historic ??= {})[String(id)] = true;
  else if (d.historic) {
    delete d.historic[String(id)];
    if (Object.keys(d.historic).length === 0) delete d.historic;
  }
}

/** Drops the flags of statues that no longer exist or are no longer statues. */
export function pruneHistoric(ctx: Pick<Ctx, 'state'>): void {
  const t = read(ctx.state)?.historic;
  if (!t) return;
  for (const k of Object.keys(t).sort()) if (ctx.state.entities[k]?.def !== STATUE) delete t[k];
  if (Object.keys(t).length === 0) delete data(ctx).historic;
}

/** The legend key of a statue of `mon` (one per vanilla monster). */
export const statueAppearanceId = (mon: DefId): DefId =>
  `nh:statue-${mon.slice(mon.indexOf(':') + 1)}`;

/**
 * One appearance per vanilla monster: its letter in the statue's colour (C's obj_color(STATUE),
 * CLR_WHITE), so a statue is told from the live monster. Class 'rock' keeps them out of the
 * shuffled description pools. ref: src/display.c map_glyphinfo() GLYPH_STATUE_*_OFF
 */
export function statueAppearances(monsters: readonly MonsterDef[], fg: string): AppearanceDef[] {
  return monsters
    .filter((m) => m.id.startsWith('nh:'))
    .map((m) => ({
      id: statueAppearanceId(m.id),
      nameKey: STATUE,
      class: 'rock' as const,
      glyph: { ch: m.glyph.ch, fg },
    }));
}

/**
 * The statue's `ObjectDef.appearanceOf`: drawn as the monster it shows (C 3.6+ statue glyphs),
 * or as the plain statue when the monster has no statue appearance (another mod's monster).
 */
export function statueAppearanceOf(
  _state: Readonly<GameState>,
  defs: Registry,
  item: Entity,
): DefId | null {
  const mon = item.c.item?.corpseOf;
  if (!mon) return null;
  const id = statueAppearanceId(mon);
  return mon.startsWith('nh:') && defs.isAppearance(id) ? id : null;
}
