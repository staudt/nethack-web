// The hero touching artifacts: the blast of an artifact that will not have her ("You are
// blasted by Stormbringer's power!"), the ones that evade her grasp, and checking what she holds,
// wears or carries again after her alignment or form changed (retouch_equipment()), with the
// silver her form may hate. Above artifact.ts (the verdict) and hp.ts; below itemactions.ts and
// dowear.ts, so taking an item off and dropping it are late-bound (setRetouchHooks(), registered
// by steal.ts, which sits above both), and so is reversing an #invoke (setInvokeReverse(),
// registered by invoke.ts).
// ref: src/artifact.c touch_artifact(), retouch_object(), untouchable(), retouch_equipment()
import { getPlayer, inventoryOf, type Ctx, type Entity, type EntityId, type Msg } from '@nh/core';
import { aAlign } from './align';
import { baneApplies, monTouchArtifact, touchVerdict } from './artifact';
import { artiOf, bareArtifactName } from './artistate';
import { losehp } from './hp';
import { objIsPname, theXname, xnameOf } from './objnam';
import { P, hasInvoked, hasProp, maybeHalfPhys } from './props';
import { formHatesSilver } from './silver';
import { surfaceKey } from './terrain';
import { levitating } from './trapstate';
import { ulycn } from './werestate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** What retouch_object() needs from the modules above it. */
export interface RetouchHooks {
  /** remove_worn_item(): the worn or wielded item comes off */
  removeWornItem(ctx: Ctx, obj: Entity): void;
  /** dropx(): out of the inventory onto the floor (or into the engulfer) */
  dropx(ctx: Ctx, obj: Entity): void;
}

let hooks: RetouchHooks | null = null;

/** Registers remove_worn_item() and dropx() (steal.ts, at load). */
export function setRetouchHooks(h: RetouchHooks): void {
  hooks = h;
}

/** arti_invoke() turning an invoked power off again (invoke.ts, at load). */
let invokeReverse: ((ctx: Ctx, obj: Entity) => void) | null = null;

/** Registers the reversal of a toggled #invoke power (invoke.ts). */
export function setInvokeReverse(fn: (ctx: Ctx, obj: Entity) => void): void {
  invokeReverse = fn;
}

/**
 * The hero hates silver: her form does, or she is a lycanthrope. ref: include/youprop.h
 * Hate_silver
 */
const hateSilver = (ctx: Pick<Ctx, 'state' | 'defs'>): boolean =>
  formHatesSilver(ctx) || ulycn(ctx.state) !== null;

const isSilver = (ctx: Pick<Ctx, 'defs'>, obj: Entity): boolean =>
  ctx.defs.object(obj.def).material === 'silver';

/**
 * the(xname(obj)) as a param for `{item|the}` or `{item|the_s}`: the artifact's bare name once
 * it is known.
 */
export function theParam(ctx: Pick<Ctx, 'state' | 'defs'>, obj: Entity): Msg | string {
  const a = artiOf(obj);
  return a && objIsPname(ctx.state, ctx.defs, obj)
    ? `=${bareArtifactName(a)}`
    : xnameOf(ctx.state, ctx.defs, obj);
}

/**
 * The hero tries to touch (pick up, wield, apply) the object. An artifact that is self-willed
 * and of another role or race, or restricted to another alignment (or while her alignment record
 * is negative), or made to slay her kind, blasts her (`d(Antimagic ? 2 : 4, self-willed ? 10 :
 * 4)`, plus half the silver bonus for a silver hater; a merely restricted one 1 time in 4); a
 * self-willed one of the wrong class and alignment then evades her grasp, or is beyond her
 * control when she already holds it. `blasted` says whether she was hurt (touch_blasted).
 * ref: src/artifact.c touch_artifact() for the hero
 */
function touchHero(ctx: Ctx, obj: Entity): { ok: boolean; blasted: boolean } {
  const a = artiOf(obj);
  if (!a) return { ok: true, blasted: false };
  const hero = getPlayer(ctx.state);
  const { badclass, badalign, selfWilled } = touchVerdict(ctx, a, hero.id);
  let blasted = false;
  if (((badclass || badalign) && selfWilled) || (badalign && !ctx.rng.rn2(4))) {
    say(ctx, 'arti.blasted', { item: theParam(ctx, obj) });
    blasted = true;
    let dmg = ctx.rng.d(hasProp(hero, P.ANTIMAGIC) ? 2 : 4, selfWilled ? 10 : 4);
    // add half (maybe quarter) of the usual silver damage bonus
    if (isSilver(ctx, obj) && hateSilver(ctx)) dmg += maybeHalfPhys(ctx.state, ctx.rng.rnd(10));
    losehp(ctx, dmg, `@killer.touching_artifact|=${a.name}`); // magic damage, not physical
  }
  // can pick it up unless you're totally non-synch'd with the artifact
  if (badclass && badalign && selfWilled) {
    const carried = obj.c.item?.carriedBy === hero.id;
    say(ctx, carried ? 'arti.beyond_control' : 'arti.evades', {
      item: theXname(ctx.state, ctx.defs, obj),
    });
    return { ok: false, blasted };
  }
  return { ok: true, blasted };
}

/**
 * The hero or monster `who` tries to touch (pick up or wield) the object: false when it
 * refuses (see touchHero(); a monster is never blasted, it just refuses).
 * ref: src/artifact.c touch_artifact()
 */
export function touchArtifact(ctx: Ctx, obj: Entity, who: EntityId): boolean {
  if (who !== ctx.state.playerId) return monTouchArtifact(ctx, obj, who);
  return touchHero(ctx, obj).ok;
}

/**
 * The hero wields, applies or invokes a carried object, or it is checked again after her form
 * or alignment changed: true when she can handle it. Otherwise ("evades your grasp" or "You
 * can't handle your silver saber anymore!", hurt unless the touch already blasted her: half
 * the usual 1d20 for silver, 1d10 for an artifact made to slay her kind) a worn or wielded one
 * comes off and, with `loseit`, it falls to the floor. ref: src/artifact.c retouch_object() (no
 * Bell of Opening; levitating, it is dropped as on the floor, not hitfloor())
 */
export function retouchObject(ctx: Ctx, obj: Entity, loseit: boolean): boolean {
  const hero = getPlayer(ctx.state);
  const t = touchHero(ctx, obj);
  if (ctx.state.gameOver) return false;
  if (t.ok) {
    const a = artiOf(obj);
    const ag = isSilver(ctx, obj) && hateSilver(ctx);
    const bane = a !== null && baneApplies(ctx, a, hero.id);
    // nothing else to do if hero can successfully handle this object
    if (!ag && !bane) return true;
    // hero can't handle this object, but didn't get touch_artifact()'s "<obj> evades your
    // grasp|control" message; give an alternate one
    say(ctx, obj.c.item?.equipped ? 'arti.cant_handle_anymore' : 'arti.cant_handle', {
      item: { key: 'arti.your', params: { item: xnameOf(ctx.state, ctx.defs, obj) } },
    });
    // also inflict damage unless touch_artifact() already did so
    if (!t.blasted) {
      // killer_xname(): an artifact's bare name; this game's silver ring or wand named so
      let what = a ? `=${bareArtifactName(a)}` : `@${obj.def}`;
      const cls = ctx.defs.object(obj.def).class;
      if (ag && !a && !bane && cls === 'ring') what = '@arti.silver_ring';
      else if (ag && !a && !bane && cls === 'wand') what = '@arti.silver_wand';
      // damage is somewhat arbitrary; half the usual 1d20 physical for silver, 1d10 magical
      // for <foo>bane, potentially both
      let dmg = 0;
      if (ag) dmg += maybeHalfPhys(ctx.state, ctx.rng.rnd(10));
      if (bane) dmg += ctx.rng.rnd(10);
      losehp(ctx, dmg, `@killer.handling|${what}`);
      if (ctx.state.gameOver) return false;
    }
  }
  const carried = (): boolean => obj.c.item?.carriedBy === hero.id;
  // removing a worn item might result in loss of levitation, dropping the hero onto a
  // polymorph trap or into water or lava and potentially dropping or destroying the item
  if (obj.c.item?.equipped) hooks?.removeWornItem(ctx, obj);
  // if we still have it and caller wants us to drop it, do so now
  if (loseit && carried() && ctx.state.entities[String(obj.id)]) {
    const pos = hero.c.pos;
    if (pos && !levitating(ctx) && aAlign(ctx, pos.x, pos.y) === null) {
      const level = ctx.state.levels[pos.level];
      say(ctx, 'arti.falls_to', {
        item: theXname(ctx.state, ctx.defs, obj),
        surface: level ? surfaceKey(ctx, level, pos.x, pos.y) : '@surface.floor',
      });
    }
    hooks?.dropx(ctx, obj);
  }
  return false;
}

/** The #invoke powers that toggle a property (C's `inv_prop <= LAST_PROP`). */
export const TOGGLED_POWERS: Readonly<Record<string, string>> = {
  conflict: P.CONFLICT,
  levitation: P.LEVITATION,
  invis: P.INVIS,
};

/**
 * The hero's form or alignment changed: a worn or wielded item, an artifact that gives
 * something while carried, or one whose #invoke power is on, undergoes the touch test; one that
 * fails comes off and maybe is dropped, and its invoked power is turned off.
 * ref: src/artifact.c untouchable() (no lit tools, leashes or containers: none is silver or an
 * artifact here)
 */
function untouchable(ctx: Ctx, obj: Entity, dropUntouchable: boolean): boolean {
  const slot = obj.c.item?.equipped ?? null;
  const beingworn = slot !== null; // (there is no quiver slot)
  const a = artiOf(obj);
  const carryeffect = a !== null && (a.cary !== null || a.cspfx.length > 0);
  const prop = a?.invoke ? TOGGLED_POWERS[a.invoke] : undefined;
  const invoked = prop !== undefined && hasInvoked(getPlayer(ctx.state), prop);
  if (beingworn || carryeffect || invoked) {
    if (!retouchObject(ctx, obj, dropUntouchable)) {
      // reverse #invoke (dropped too: C turns it off as it leaves her pack, freeinv_core())
      if (invoked && prop !== undefined && hasInvoked(getPlayer(ctx.state), prop))
        invokeReverse?.(ctx, obj);
      return true;
    }
  }
  return false;
}

/**
 * Checks everything in use (mostly worn) for touchability: the wielded weapon first, then the
 * rest of the inventory. `dropflag` 0 drops nothing, 1 every untouchable item, 2 the weapon
 * only. A ring coming off under cursed gloves uncurses them (C's "temporary? hack").
 * ref: src/artifact.c retouch_equipment() (no two-weapon combat, steeds or selftouch())
 */
export function retouchEquipment(ctx: Ctx, dropflag: 0 | 1 | 2): void {
  const hero = getPlayer(ctx.state);
  const worn = (slot: string): Entity | undefined =>
    inventoryOf(ctx.state, hero.id).find((o) => o.c.item?.equipped === slot);
  const hadRings = (worn('ringL') ? 1 : 0) + (worn('ringR') ? 1 : 0);
  const uwep = worn('weapon');
  if (uwep) untouchable(ctx, uwep, dropflag > 0);
  for (const o of inventoryOf(ctx.state, hero.id)) {
    if (ctx.state.gameOver) return;
    if (o.id === uwep?.id || o.c.item?.carriedBy !== hero.id) continue;
    untouchable(ctx, o, dropflag === 1);
  }
  const gloves = worn('gloves');
  const rings = (worn('ringL') ? 1 : 0) + (worn('ringR') ? 1 : 0);
  if (hadRings !== rings && gloves?.c.item?.buc === 'cursed') gloves.c.item.buc = 'uncursed';
}
