// Silver and the creatures it harms: the hero's Hate_silver, and "The silver sears ...!" in its
// three directions (the hero's blows and missiles, monsters' weapons and missiles at the hero,
// monsters' weapons at monsters). The extra d20 itself is in dmgval.ts.
// ref: include/youprop.h Hate_silver; src/mondata.c mon_hates_silver(); src/weapon.c
// special_dmgval(); src/uhitm.c hmon_hitmon_msg_silver(), mhitm_ad_phys(); src/mhitm.c
// hitmm(); src/mthrowu.c ohitmon(), thitu()
import type { Ctx, Entity, Msg } from '@nh/core';
import { amorphous, hatesSilver, noncorporeal } from './mondata';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { wornIn } from './props';
import { heroForm } from './upoly';
import { ulycn } from './werestate';

type SCtx = Pick<Ctx, 'state' | 'defs' | 'cosmetic' | 'emit'>;

/** The object is made of silver (`objects[otyp].oc_material == SILVER`). */
export const isSilver = (ctx: Pick<Ctx, 'defs'>, obj: Entity): boolean =>
  ctx.defs.object(obj.def).material === 'silver';

/**
 * mon_hates_silver(&youmonst): the hero's polymorphed form hates silver (her own race never
 * does). This is what dmgval() checks for the extra damage. ref: src/mondata.c mon_hates_silver()
 */
export function formHatesSilver(ctx: Pick<Ctx, 'state' | 'defs'>): boolean {
  const form = heroForm(ctx);
  return form !== null && hatesSilver(form);
}

/**
 * Hate_silver: a lycanthrope, or a form that hates silver. It gives the "sears your flesh"
 * messages and enlightenment's line. ref: include/youprop.h Hate_silver
 */
export const heroHatesSilver = (ctx: Pick<Ctx, 'state' | 'defs'>): boolean =>
  ulycn(ctx.state) !== null || formHatesSilver(ctx);

/** "the imp's flesh", or "the imp" for a noncorporeal or amorphous monster. */
function whom(ctx: SCtx, mon: Entity): Msg | string {
  const name = monNam(ctx, mon);
  const def = ctx.defs.monster(mon.def);
  return noncorporeal(def) || amorphous(def)
    ? name
    : { key: 'silver.flesh', params: { mon: name } };
}

/**
 * The hero's bare-handed blow: with no gloves, a worn silver ring (the left one first) adds
 * `rnd(20)` once against a silver-hater, however many rings are silver. Returns the bonus.
 * ref: src/weapon.c special_dmgval() (W_ARMG | W_RINGL | W_RINGR; no blessed gloves bonus)
 */
export function silverRingBonus(ctx: Pick<Ctx, 'state' | 'defs' | 'rng'>, mon: Entity): number {
  const pid = ctx.state.playerId;
  if (wornIn(ctx.state, pid, 'gloves') !== null) return 0; // no silver gloves exist
  if (!hatesSilver(ctx.defs.monster(mon.def))) return 0;
  const silver = (slot: string): boolean => {
    const r = wornIn(ctx.state, pid, slot);
    return r !== null && isSilver(ctx, r);
  };
  return silver('ringL') || silver('ringR') ? ctx.rng.rnd(20) : 0;
}

/**
 * The hero's silver hit a silver-hater: "Your silver saber sears the imp's flesh!" (a ring:
 * "Your silver ring sears ..."), "Its flesh is seared!" when she cannot spot it.
 * ref: src/uhitm.c hmon_hitmon_msg_silver()
 */
export function silverSearsMon(ctx: SCtx, mon: Entity, obj: Entity | null): void {
  if (!canSpotMon(ctx, mon)) {
    const def = ctx.defs.monster(mon.def);
    const flesh = !noncorporeal(def) && !amorphous(def);
    ctx.emit({
      type: 'msg',
      key: flesh ? 'silver.seared_flesh' : 'silver.seared',
      params: { mon: monNam(ctx, mon) },
    });
    return;
  }
  if (!obj) {
    ctx.emit({ type: 'msg', key: 'silver.ring_sears', params: { whom: whom(ctx, mon) } });
    return;
  }
  // "silver " is added unless the name says it already (only our silver_* weapons do)
  const named = obj.def.includes('silver');
  const plural = (obj.c.item?.quantity ?? 1) > 1;
  ctx.emit({
    type: 'msg',
    key: `silver.${named ? 'your' : 'your_silver'}${plural ? '_plural' : ''}`,
    params: { obj: xnameOf(ctx.state, ctx.defs, obj), whom: whom(ctx, mon) },
  });
}

/**
 * A monster's silver missile hit a silver-hating monster in view: "The silver sears the imp's
 * flesh!" (the unseen "Its flesh is seared!" goes with ohitmon()'s unseen "is hit" line, which is
 * not ported). ref: src/mthrowu.c ohitmon()
 */
export const silverSearsByMissile = (ctx: SCtx, mon: Entity): void =>
  ctx.emit({ type: 'msg', key: 'silver.sears', params: { whom: whom(ctx, mon) } });

/** "The silver sears your flesh!" ref: src/mthrowu.c thitu(), src/uhitm.c mhitm_ad_phys() */
export const silverSearsYou = (ctx: Pick<Ctx, 'emit'>): void =>
  ctx.emit({ type: 'msg', key: 'silver.sears_you' });

/**
 * A monster's silver weapon hit a silver-hating monster: "The soldier's silver saber sears the
 * imp's flesh!". ref: src/mhitm.c hitmm()
 */
export function silverSearsMm(ctx: SCtx, magr: Entity, mdef: Entity, mwep: Entity): void {
  ctx.emit({
    type: 'msg',
    key: 'silver.mm_sears',
    params: {
      magr: monNam(ctx, magr),
      weapon: xnameOf(ctx.state, ctx.defs, mwep),
      whom: whom(ctx, mdef),
    },
  });
}
