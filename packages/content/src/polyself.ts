// The hero's polymorph and the polymorph trap. The trap's effect on the hero and on monsters
// (newcham.ts), and the entry point `polyself()` that the wand, the spell, the potion and the
// trap call; polyself() itself is still a silent stub until step 3 builds the forms (D5/D6).
// ref: src/polyself.c polyself(); src/trap.c trapeffect_poly_trap()
//
// Not ported yet: steeds, sitting on the trap (VIASITTING).
import { getPlayer, type Ctx, type DefId, type Entity, type Msg, type Trap } from '@nh/core';
import { resist, resistsMagm } from './buzz';
import { prinv } from './itemactions';
import { levitating } from './levitation';
import { newcham } from './newcham';
import { xnameOf } from './objnam';
import { polyObj } from './polyobj';
import { P, hasProp } from './props';
import {
  TRAP,
  canseemon,
  deltrap,
  ironShoes,
  seetrap,
  setTrapEffect,
  type TrapResult,
} from './trap';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const IRON_SHOES: DefId = 'nh:iron_shoes';
const KICKING_BOOTS: DefId = 'nh:kicking_boots';

/** Iron shoes and kicking boots warp into each other. */
const warpedBoots = (boots: Entity): DefId =>
  boots.def === IRON_SHOES ? KICKING_BOOTS : IRON_SHOES;

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
 * The hero on a polymorph trap: "You step onto a polymorph trap!"; iron shoes (or kicking boots)
 * use the trap up and warp into kicking boots (or iron shoes): "Your pair of hard shoes warps
 * strangely." and the new inventory line; magic resistance or Unchanging: "You feel momentarily
 * different." and the trap stays; otherwise the trap is used up, "You feel a change coming over
 * you." and she polymorphs. ref: src/trap.c trapeffect_poly_trap() for the hero (no steed)
 */
function polyTrapYou(ctx: Ctx, trap: Trap): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  if (!p) return;
  seetrap(trap);
  // u_locomotion("step"): "float" while levitating (no Flying here)
  say(ctx, levitating(ctx) ? 'polytrap.float_onto' : 'polytrap.step_onto');
  const shoes = ironShoes(ctx, h.id);
  if (shoes) {
    deltrap(ctx, p.level, trap);
    say(ctx, 'polytrap.warps', { item: xnameOf(ctx.state, ctx.defs, shoes) });
    const boots = polyObj(ctx, shoes, warpedBoots(shoes));
    if (boots.c.item?.carriedBy === h.id) prinv(ctx, boots);
    return;
  }
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
 * A monster on a polymorph trap: its iron shoes (or kicking boots) warp into the other kind and
 * stay on; magic resistance shields it; otherwise unless it resists (a wand's saving throw) it
 * changes into a random monster ("The jackal turns into a gnome!") and the trap is seen when the
 * hero saw it. The trap stays. ref: src/trap.c trapeffect_poly_trap() for a monster
 */
function polyTrapMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const inSight = canseemon(ctx, mon);
  const shoes = ironShoes(ctx, mon.id);
  if (shoes) {
    // (taken off and put back on: the new boots stay worn)
    polyObj(ctx, shoes, warpedBoots(shoes));
  } else if (resistsMagm(ctx, mon)) {
    // shieldeff_mon(): not shown
  } else if (!resist(ctx, mon, 0, 'wand')) {
    newcham(ctx, mon, null, { msg: true });
    if (inSight) seetrap(trap);
  }
  return 'finished';
}

/** Hands the polymorph trap's effects to trap.ts. */
export function registerPolyTrap(): void {
  setTrapEffect(TRAP.poly, { you: polyTrapYou, mon: polyTrapMon });
}
