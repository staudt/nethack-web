// Monsters eating objects off the floor after a move: rust monsters and rock moles eat metal,
// gelatinous cubes eat organic objects and engulf the rest, purple worms and ghouls eat corpses.
// ref: src/mon.c meatmetal(), meatobj(), meatcorpse(), m_consume_obj(), meatbox(); called from
// src/monmove.c m_move() postmov
//
// Not ported (DEVIATIONS.md "Armed humanoids, trolls and eaters (m10)"): mon_givit() (monsters'
// intrinsics are not modelled), growing up, polymorph food and healing corpses (none of those
// objects or corpses exist), poisoned objects, artifacts, the hero's ball and chain, the
// "YUM YUM" scroll's "Yum!", Rider corpses.
import { vegan as veganDef } from './mondata';
import {
  contents,
  itemsAt,
  takeOut,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { setMeating } from './dog';
import { mksobj, splitStack, weight } from './items';
import { isMetallic, isRustprone } from './material';
import { heroSees } from './mongear';
import { isFrozen, mcansee, setMStunned, unblindMonst } from './mstate';
import { doname } from './objnam';
import { canSpotMon, monNam } from './perception';
import { mpickobj } from './steal';
import { fleshPetrifies, resistsSton, touchPetrifies } from './stonestate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/objclass.h is_organic(): material up to wood */
const ORGANIC = new Set(['liquid', 'wax', 'veggy', 'flesh', 'paper', 'cloth', 'leather', 'wood']);

/** ref: include/mondata.h vegan() */
function vegan(ctx: Ctx, mon: DefId): boolean {
  return ctx.defs.isMonster(mon) && veganDef(ctx.defs.monster(mon));
}

/** ref: include/mondata.h corpse_eater() (no piranha in the roster) */
const corpseEater = (id: string): boolean =>
  id === 'nh:purple_worm' || id === 'nh:baby_purple_worm' || id === 'nh:ghoul';

/** ref: src/zap.c obj_resists(otmp, 5, 95) for an object that is not an artifact */
const objResists = (ctx: Ctx): boolean => ctx.rng.rn2(100) < 5;

const name = (ctx: Ctx, o: Entity): string => doname(ctx.state, ctx.defs, o) as never;

/** The floor objects under the monster, top first. */
function objsUnder(ctx: Ctx, mon: Entity): Entity[] {
  const p = mon.c.pos;
  return p ? itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y) : [];
}

/**
 * The monster consumes the object: a non-pet heals up to its weight in HP, a gelatinous cube
 * engulfs an eaten container's contents, and the object is gone. ref: src/mon.c m_consume_obj()
 */
function mConsumeObj(ctx: Ctx, mon: Entity, obj: Entity): void {
  const hp = mon.c.hp;
  if (!mon.c.monster?.tame && hp && hp.cur < hp.max)
    hp.cur = Math.min(hp.max, hp.cur + ctx.defs.object(obj.def).weight);
  // ref: meatbox(): only gelatinous cubes eat containers (organic boxes); the contents go in
  for (const c of contents(ctx.state, obj.id)) {
    takeOut(ctx.state, c.id);
    mpickobj(ctx, mon.id, c);
  }
  const eyes = obj.def === 'nh:carrot';
  ctx.remove(obj.id); // delobj(): munch
  if (eyes && !mcansee(ctx, mon.id)) unblindMonst(ctx, mon.id);
}

/**
 * Maybe eats a metal object on its square: 0 nothing, 1 ate something (2, died, cannot happen
 * here). A rust monster eats only rustprone objects and spits out rustproofed ones, stunned.
 * ref: src/mon.c meatmetal()
 */
export function meatmetal(ctx: Ctx, mon: Entity): 0 | 1 {
  if (mon.c.monster?.tame) return 0; // pets eat in dogmove.ts
  const rust = mon.def === 'nh:rust_monster';
  const pos = mon.c.pos;
  if (!pos) return 0;
  for (const otmp of objsUnder(ctx, mon)) {
    const od = ctx.defs.object(otmp.def);
    // don't eat indigestible/choking/inappropriate objects
    if (
      (rust && !isRustprone(od)) ||
      otmp.def === 'nh:amulet_of_strangulation' ||
      otmp.def === 'nh:ring_of_slow_digestion'
    )
      continue;
    if (!isMetallic(od) || objResists(ctx)) continue;
    const it = otmp.c.item;
    if (rust && it?.erodeproof) {
      const vis = heroSees(ctx, pos) && canSpotMon(ctx, mon);
      if (vis) say(ctx, 'meat.eats', { mon: monNam(ctx, mon), item: name(ctx, otmp) });
      // the object's rustproofing is gone now
      delete it.erodeproof;
      setMStunned(ctx, mon.id, true);
      if (vis) say(ctx, 'meat.spits', { mon: monNam(ctx, mon), item: name(ctx, otmp) });
    } else {
      if (heroSees(ctx, pos))
        say(ctx, 'meat.eats', { mon: monNam(ctx, mon), item: name(ctx, otmp) });
      else say(ctx, 'meat.hear_crunch');
      setMeating(ctx, mon.id, Math.trunc(weight(ctx.defs, otmp, ctx.state) / 2) + 1);
      mConsumeObj(ctx, mon, otmp);
      // left behind a pile?
      if (ctx.rng.rnd(25) < 3)
        mksobj(ctx, ctx.defs.object('nh:rock'), { at: { level: pos.level, x: pos.x, y: pos.y } });
      return 1;
    }
  }
  return 0;
}

/**
 * A gelatinous cube eats the organic objects on its square and engulfs the others into its
 * inventory (not boulders, statues or a scroll of scare monster; not a petrifying corpse unless
 * it resists). 0 nothing happened, 1 something did. ref: src/mon.c meatobj()
 */
export function meatobj(ctx: Ctx, mon: Entity): 0 | 1 {
  if (mon.c.monster?.tame) return 0;
  const pos = mon.c.pos;
  if (!pos) return 0;
  let count = 0;
  let ecount = 0;
  let first: string | null = null;
  for (const otmp of objsUnder(ctx, mon)) {
    if (!ctx.state.entities[String(otmp.id)]) continue;
    const od = ctx.defs.object(otmp.def);
    const corpsenm = otmp.c.item?.corpseOf;
    const cm = corpsenm && ctx.defs.isMonster(corpsenm) ? ctx.defs.monster(corpsenm) : null;
    // untouchable (or inaccessible) items
    if (
      (otmp.def === 'nh:corpse' && cm && touchPetrifies(cm) && !resistsSton(ctx, mon)) ||
      od.class === 'rock' ||
      otmp.def === 'nh:scroll_of_scare_monster'
    )
      continue;
    if (
      !ORGANIC.has(od.material) ||
      objResists(ctx) ||
      otmp.def === 'nh:amulet_of_strangulation' ||
      otmp.def === 'nh:ring_of_slow_digestion' ||
      (od.class === 'food' && cm && fleshPetrifies(cm) && !resistsSton(ctx, mon))
    ) {
      // engulf
      ++ecount;
      if (ecount === 1) first = name(ctx, otmp);
      mpickobj(ctx, mon.id, otmp); // slurp
    } else {
      // devour
      ++count;
      if (heroSees(ctx, pos))
        say(ctx, 'meat.eats', { mon: monNam(ctx, mon), item: name(ctx, otmp) });
      else say(ctx, 'meat.hear_slurp');
      mConsumeObj(ctx, mon, otmp);
    }
  }
  if (ecount > 0) {
    if (heroSees(ctx, pos))
      say(ctx, ecount === 1 ? 'meat.engulfs' : 'meat.engulfs_several', {
        mon: monNam(ctx, mon),
        item: first ?? '',
      });
    else say(ctx, ecount === 1 ? 'meat.hear_slurp' : 'meat.hear_slurps');
  }
  return count > 0 || ecount > 0 ? 1 : 0;
}

/**
 * A corpse eater eats one corpse (not a vegan or, unless it resists, a petrifying one) off its
 * square: 0 nothing eaten, 1 ate a corpse. ref: src/mon.c meatcorpse()
 */
export function meatcorpse(ctx: Ctx, mon: Entity): 0 | 1 {
  if (mon.c.monster?.tame) return 0;
  const pos = mon.c.pos;
  if (!pos) return 0;
  for (const o of objsUnder(ctx, mon)) {
    const m = o.def === 'nh:corpse' ? o.c.item?.corpseOf : undefined;
    if (!m || !ctx.defs.isMonster(m)) continue;
    if (vegan(ctx, m) || (fleshPetrifies(ctx.defs.monster(m)) && !resistsSton(ctx, mon))) continue;
    let otmp = o;
    if ((o.c.item?.quantity ?? 1) > 1) {
      const one = ctx.state.entities[String(splitStack(ctx, o.id, 1))];
      if (one) otmp = one;
    }
    if (heroSees(ctx, pos) && canSpotMon(ctx, mon))
      say(ctx, 'meat.eats', { mon: monNam(ctx, mon), item: name(ctx, otmp) });
    else say(ctx, 'meat.hear_masticate');
    mConsumeObj(ctx, mon, otmp);
    return 1;
  }
  return 0;
}

/**
 * The eating step of postmov(), for a monster that moved or is done, standing on objects and
 * able to move. True when it died (never, here: nothing it eats can kill it).
 * ref: src/monmove.c m_move() postmov
 */
export function monEatsHere(ctx: Ctx, id: EntityId): boolean {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster || !mon.c.pos || isFrozen(ctx, id)) return false;
  if (objsUnder(ctx, mon).length === 0) return false;
  const def = ctx.defs.monster(mon.def);
  if (def.flags.includes('metallivore')) meatmetal(ctx, mon);
  if (mon.def === 'nh:gelatinous_cube') meatobj(ctx, mon);
  if (corpseEater(mon.def)) meatcorpse(ctx, mon);
  return !ctx.state.entities[String(id)]?.c.monster;
}
