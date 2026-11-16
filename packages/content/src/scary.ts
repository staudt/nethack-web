// Squares that scare monsters: a scroll of scare monster on the floor, an altar for vampires, an
// Elbereth engraving under the hero (or her displaced image) or a level-made one guarding objects.
// A leaf over the floor objects, the engravings and the level, imported by monster movement and
// teleport.
// ref: src/monmove.c onscary()
//
// Not ported: minions and the Riders (none exist),
// the endgame (none), goodpos_onscary() for new monsters and enexto() (GP_CHECKSCARY: only
// rloc_pos_ok() checks).
import {
  cellIndex,
  getLevel,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type Level,
  type Pos,
} from '@nh/core';
import { altarAlign } from './aligntyp';
import { isVampshifter } from './chamstate';
import { engravingsOn, sengrAt } from './engr';
import { epriOf, inhistemple } from './epri';
import { eshkOf, inhishop } from './eshk';
import { inHell } from './levelflags';
import { mcansee, storedMux } from './mstate';
import { P, heroHas } from './props';
import { egdOf } from './vaultstate';
import { isWiz } from './wizstate';

export const SCR_SCARE_MONSTER: DefId = 'nh:scroll_of_scare_monster';

const MINOTAUR: DefId = 'nh:minotaur';

/** Directly resistant to any scaring (is_lminion(), the Angel, the Riders; Rodney: iswiz). */
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

const ELBERETH = 'Elbereth';

/**
 * Whether anything on `level` may scare a monster: `cells` (scareCells()) is not empty or some
 * engraving reads "Elbereth". Callers that test many squares skip onscary() when it is false.
 */
export function anyScare(ctx: Pick<Ctx, 'state'>, level: Level, cells: Set<number>): boolean {
  if (cells.size > 0) return true;
  return engravingsOn(ctx, level).some(
    ({ e }) => e.type !== 'headstone' && e.text.toLowerCase() === 'elbereth',
  );
}

/**
 * An altar may scare this monster (a vampire, or a vampire shapeshifter in any form), so callers
 * that skip onscary() when anyScare() is false must ask it anyway.
 */
export const altarScares = (ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).glyph.ch === 'V' || isVampshifter(ctx, mon);

/** vobj_at(x, y): some object lies on the floor there. */
function objAt(ctx: Pick<Ctx, 'state'>, level: Level, x: number, y: number): boolean {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.item && p?.level === level.id && p.x === x && p.y === y) return true;
  }
  return false;
}

const isAltarAt = (ctx: Pick<Ctx, 'state'>, level: Level, x: number, y: number): boolean =>
  altarAlign(level.palette[level.cells[cellIndex(level, x, y)] ?? 0] ?? 'nh:stone') !== null;

/**
 * Whether (x, y) of the monster's level scares it: a scroll of scare monster lying there, or an
 * altar for a vampire (or a vampire shapeshifter); humans (S_HUMAN) and uniques ignore both, a shopkeeper in her shop and a
 * priest in his temple are never scared. Then a finished "Elbereth" (any case, not a headstone)
 * when the hero stands on it, or she is Displaced and the monster thinks she is there (`mux`,
 * C's mtmp->mux/muy: by default the kept guess, else her square), or it guards objects lying
 * there; shopkeepers (anywhere), vault guards, blind and peaceful monsters and minotaurs ignore
 * it, and it has no power in Gehennom. `level` is the monster's own by default, and `cells` may
 * pass scareCells() of it for repeated calls.
 * ref: src/monmove.c onscary() (magical scares only)
 */
export function onscary(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  x: number,
  y: number,
  mon: Entity,
  opts: { level?: Level; cells?: Set<number>; mux?: Pos } = {},
): boolean {
  const def = ctx.defs.monster(mon.def);
  // creatures who are directly resistant to any type of scaring
  if (isWiz(ctx, mon.id) || RESISTS_ALL.includes(def.id)) return false;
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
  // should this still be true for defiled/molochian altars?
  if (isAltarAt(ctx, level, x, y) && altarScares(ctx, mon)) return true;
  // the scare monster scroll doesn't have any of the below restrictions
  if ((opts.cells ?? scareCells(ctx, level)).has(cellIndex(level, x, y))) return true;
  // Creatures who don't (or can't) fear a written Elbereth: shopkeepers (even if poly'd into
  // non-human), vault guards (also even if poly'd), blind or peaceful monsters, minotaurs; it
  // only protects the hero on it (or her displaced image) or objects a level-made one guards;
  // "the influence of the Valar only reaches so far" (not in Gehennom)
  const ep = sengrAt(ctx, ELBERETH, level, x, y, true);
  if (!ep) return false;
  const hp = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  const onLevel = hp?.level === level.id;
  const mux = opts.mux ?? storedMux(ctx, mon.id) ?? hp;
  if (!(
    (onLevel && hp.x === x && hp.y === y) ||
    (onLevel && heroHas(ctx.state, P.DISPLACED) && mux?.x === x && mux.y === y) ||
    (ep.guard === true && objAt(ctx, level, x, y))
  ))
    return false;
  return !(
    eshkOf(ctx, mon.id) !== null ||
    egdOf(ctx.state, mon.id) !== null ||
    !mcansee(ctx, mon.id) ||
    mon.c.monster?.peaceful === true ||
    def.id === MINOTAUR ||
    inHell(ctx.state, level)
  );
}
