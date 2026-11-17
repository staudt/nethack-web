// What protects a creature against a damage type: the artifact it wields (defends()), the
// artifacts it carries (defends_when_carried()) and dragon scales or scale mail, worn or, for an
// adult dragon, its own hide; and the artifacts that reflect or give Protection. A leaf (core,
// artistate, props' names): the attack code and the monster resistance checks ask it.
// ref: src/artifact.c defends(), defends_when_carried(), arti_reflects(), protects();
// src/mondata.c defended()
import {
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Registry,
} from '@nh/core';
import { artiOf } from './artistate';
import { P } from './props';
import { heroFormId } from './upoly';

/** The damage types each colour of dragon scales protects against. ref: defends() */
const DRAGON_DEFENDS: Readonly<Record<string, readonly string[]>> = {
  gray: ['magm'], // magic missiles => general magic resistance
  gold: ['halu'], // confers hallucination resistance
  red: ['fire'], // (gives infravision but does not prevent blindness)
  white: ['cold'], // (slows digestion but does not override Famine)
  green: ['drst', 'dise'], // drain strength => poison; blocks disease but not slime
  orange: ['slee', 'plys'], // sleep; paralysis => free action
  black: ['disn', 'drli'], // disintegration; level drain resistance
  blue: ['elec', 'slow'], // electricity == lightning; confers speed so blocks speed removal
  yellow: ['acid', 'ston'], // petrification resistance
  // silver dragon scales don't resist any particular attack type
};

/** The colours of the adult dragons (silver resists nothing in particular). */
const ADULT_DRAGONS: ReadonlySet<string> = new Set([...Object.keys(DRAGON_DEFENDS), 'silver']);

/** The colour of dragon scales or scale mail (Is_dragon_armor()), or null. */
const dragonColour = (def: DefId): string | null =>
  /^nh:([a-z]+)_dragon_scale(?:s|_mail)$/.exec(def)?.[1] ?? null;

const dragonDefends = (ad: string, colour: string | null): boolean =>
  colour !== null && (DRAGON_DEFENDS[colour]?.includes(ad) ?? false);

/**
 * The object protects its wielder or wearer against damage type `ad` (C's AD_ name lowercased:
 * 'fire', 'drli', 'magm'...): an artifact whose `defn` it is, or dragon scales (mail) of the
 * colour that resists it. ref: src/artifact.c defends()
 */
export function defends(ad: string, obj: Entity | null | undefined): boolean {
  if (!obj) return false;
  const a = artiOf(obj);
  if (a) return a.defn === ad;
  return dragonDefends(ad, dragonColour(obj.def));
}

/** A carried artifact protects against `ad` (its `cary`). ref: src/artifact.c defends_when_carried() */
export function defendsWhenCarried(ad: string, obj: Entity | null | undefined): boolean {
  return artiOf(obj)?.cary === ad;
}

/** ref: include/monst.h MON_WEP(), uwep */
const wieldedBy = (ctx: Pick<Ctx, 'state'>, who: EntityId): Entity | undefined =>
  inventoryOf(ctx.state, who).find((o) => o.c.item?.equipped === 'weapon');

/**
 * The hero or monster `who` is protected against `ad` by the artifact it wields, or by dragon
 * scales: an adult dragon is its own suit, anyone else wears them as body armor (a polymorphed
 * hero's embedded scales count no more than being the dragon).
 * ref: src/mondata.c defended()
 */
export function defended(ctx: Pick<Ctx, 'state' | 'defs'>, who: EntityId, ad: string): boolean {
  const o = wieldedBy(ctx, who);
  if (o?.c.item?.artifact !== undefined && defends(ad, o)) return true;
  const e = ctx.state.entities[String(who)];
  if (!e) return false;
  // the hero's form, or the monster's kind
  const form = who === ctx.state.playerId ? heroFormId(ctx.state) : e.c.monster ? e.def : null;
  // an adult dragon (PM_GRAY_DRAGON .. PM_YELLOW_DRAGON) is treated as wearing its scales
  const adult = form !== null ? /^nh:([a-z]+)_dragon$/.exec(form)?.[1] : undefined;
  if (adult !== undefined && ADULT_DRAGONS.has(adult)) return dragonDefends(ad, adult);
  const arm = inventoryOf(ctx.state, who).find((x) => x.c.item?.equipped === 'body');
  return arm !== undefined && dragonDefends(ad, dragonColour(arm.def));
}

/**
 * The artifact reflects for a monster: wielded or worn with SPFX_REFLECT (Dragonbane), or just
 * carried with it among its carried properties. ref: src/artifact.c arti_reflects()
 */
export function artiReflects(obj: Entity | null | undefined): boolean {
  const a = artiOf(obj);
  if (!a || !obj) return false;
  // while being worn
  if ((obj.c.item?.equipped ?? null) !== null && a.spfx.includes('reflect')) return true;
  // just being carried
  return a.cspfx.includes('reflect');
}

/**
 * The object confers Protection: worn armor or accessory of Protection, or an artifact that
 * protects when carried (cspfx), or when worn or wielded (spfx). ref: src/artifact.c protects()
 */
export function protects(defs: Registry, obj: Entity, beingWorn: boolean): boolean {
  if (beingWorn && defs.object(obj.def).prop === P.PROTECTION) return true;
  const a = artiOf(obj);
  if (!a) return false;
  return a.cspfx.includes('protect') || (beingWorn && a.spfx.includes('protect'));
}
