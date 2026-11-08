// The hero's polymorph. Step 1 of 7f-d: the polymorph trap's effect on the hero and the entry
// point `polyself()` that the wand, the spell, the potion and the trap call; polyself() itself is
// still a silent stub until step 3 builds the forms (D5/D6).
// ref: src/polyself.c polyself(); src/trap.c trapeffect_poly_trap()
//
// Not ported yet: the iron shoes branch of the polymorph trap (3.7: they warp into kicking boots,
// which do not exist here), steeds, sitting on the trap (VIASITTING).
import { getPlayer, type Ctx, type Entity, type Msg, type Trap } from '@nh/core';
import { levitating } from './levitation';
import { P, hasProp } from './props';
import { TRAP, deltrap, seetrap, setTrapEffect, type TrapResult } from './trap';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** polyself()'s flags. ref: include/hack.h POLY_CONTROLLED, POLY_MONSTER, POLY_REVERT, POLY_LOW_CTRL */
export interface PolyFlags {
  controlled?: true;
  low?: true;
}

/**
 * The hero polymorphs. ref: src/polyself.c polyself() -- a silent stub until 7f-d step 3 (the
 * callers' own lines are C's: the potion's "You feel a little strange.", the trap's "You feel a
 * change coming over you.").
 */
export function polyself(_ctx: Ctx, _flags: PolyFlags = {}): void {
  // 7f-d step 3
}

/**
 * The hero on a polymorph trap: "You step onto a polymorph trap!"; magic resistance or
 * Unchanging: "You feel momentarily different." and the trap stays; otherwise the trap is used
 * up, "You feel a change coming over you." and she polymorphs.
 * ref: src/trap.c trapeffect_poly_trap() for the hero (no steed, no iron shoes branch)
 */
function polyTrapYou(ctx: Ctx, trap: Trap): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  if (!p) return;
  seetrap(trap);
  // u_locomotion("step"): "float" while levitating (no Flying here)
  say(ctx, levitating(ctx) ? 'polytrap.float_onto' : 'polytrap.step_onto');
  if (hasProp(h, P.ANTIMAGIC) || hasProp(h, P.UNCHANGING)) {
    // shieldeff() is not shown; trap did nothing; don't remove it --KAA
    say(ctx, 'polytrap.momentarily_different');
    return;
  }
  deltrap(ctx, p.level, trap); // delete trap before polymorph
  say(ctx, 'polytrap.change_coming');
  polyself(ctx);
}

/**
 * A monster on a polymorph trap. ref: src/trap.c trapeffect_poly_trap() for a monster -- 7f-d
 * step 2 (newcham()); until then nothing happens.
 */
function polyTrapMon(_ctx: Ctx, _mon: Entity, _trap: Trap): TrapResult {
  return 'finished';
}

/** Hands the polymorph trap's effects to trap.ts. */
export function registerPolyTrap(): void {
  setTrapEffect(TRAP.poly, { you: polyTrapYou, mon: polyTrapMon });
}
