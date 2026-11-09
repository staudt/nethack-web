// Squares that scare monsters: a scroll of scare monster on the floor, an altar for vampires.
// A leaf over the floor objects and the level, imported by monster movement and teleport.
// ref: src/monmove.c onscary()
//
// Not ported: Elbereth (no engravings), the Wizard of Yendor, minions and the Riders (none
// exist), vampire shapeshifters, a displaced image carrying the scare to another square,
// goodpos_onscary() for new monsters and enexto() (GP_CHECKSCARY: only rloc_pos_ok() checks).
import {
  cellIndex,
  getLevel,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type Level,
} from '@nh/core';
import { altarAlign } from './aligntyp';
import { epriOf, inhistemple } from './epri';
import { eshkOf, inhishop } from './eshk';

export const SCR_SCARE_MONSTER: DefId = 'nh:scroll_of_scare_monster';

/** Directly resistant to any scaring (is_lminion(), the Angel, the Riders). */
const RESISTS_ALL: readonly DefId[] = ['nh:angel', 'nh:death', 'nh:pestilence', 'nh:famine'];

/** Cell indices of `level` holding a scroll of scare monster on the floor. */
export function scareCells(ctx: Pick<Ctx, 'state'>, level: Level): Set<number> {
  const out = new Set<number>();
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.def === SCR_SCARE_MONSTER && e.c.item && p?.level === level.id)
      out.add(cellIndex(level, p.x, p.y));
  }
  return out;
}

const isAltarAt = (ctx: Pick<Ctx, 'state'>, level: Level, x: number, y: number): boolean =>
  altarAlign(level.palette[level.cells[cellIndex(level, x, y)] ?? 0] ?? 'nh:stone') !== null;

/**
 * Whether (x, y) of the monster's level scares it: a scroll of scare monster lying there, or an
 * altar for a vampire; humans (S_HUMAN) and uniques ignore both, a shopkeeper in her shop and a
 * priest in his temple are never scared. `level` is the monster's own by default, and `cells`
 * may pass scareCells() of it for repeated calls.
 * ref: src/monmove.c onscary() (magical scares only)
 */
export function onscary(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  x: number,
  y: number,
  mon: Entity,
  opts: { level?: Level; cells?: Set<number> } = {},
): boolean {
  const def = ctx.defs.monster(mon.def);
  // creatures who are directly resistant to any type of scaring
  if (RESISTS_ALL.includes(def.id)) return false;
  // creatures who are directly resistant to magical scaring: humans etc., uniques
  if (def.glyph.ch === '@' || def.genFlags.includes('uniq')) return false;
  // shopkeepers inside their own shop, priests inside their own temple
  if (
    (eshkOf(ctx, mon.id) && inhishop(ctx, mon.id)) ||
    (epriOf(ctx, mon.id) && inhistemple(ctx, mon.id))
  )
    return false;
  const level = opts.level ?? getLevel(ctx.state, mon.c.pos?.level);
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  if (isAltarAt(ctx, level, x, y) && def.glyph.ch === 'V') return true;
  // the scare monster scroll doesn't have any of the below restrictions
  return (opts.cells ?? scareCells(ctx, level)).has(cellIndex(level, x, y));
}
