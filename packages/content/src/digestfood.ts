// An animal engulfer eating what the hero drops inside it: corpses and the meat objects stone to
// flesh makes go at once, a cockatrice corpse turning it to stone and a wraith corpse making it
// grow. Late-bound into itemactions.ts's drop (it sits below stoning.ts and mhitm.ts).
// ref: src/do.c engulfer_digests_food()
//
// Not ported: polymorphing corpses (newcham(): 7f-d; no such monster in the roster yet), globs
// and green slime (no globs), the nurse's healing (no nurse).
import type { Ctx, Entity } from '@nh/core';
import { digests } from './engulfstate';
import { setEngulferDigestsFood } from './itemactions';
import { growUp } from './mhitm';
import { xnameOf } from './objnam';
import { minstapetrify } from './stoning';
import { petrifyingCorpse } from './stonetouch';

/** ref: engulfer_digests_food(): "corpse, glob, or meat <item> but not other types of food" */
const DIGESTED: readonly string[] = [
  'nh:corpse',
  'nh:meatball',
  'nh:enormous_meatball',
  'nh:meat_ring',
  'nh:meat_stick',
];

/**
 * The hero dropped `obj` (out of her inventory) inside `engulfer`: an animal swallower eats a
 * corpse or meat at once ("The jackal corpse is instantly digested!"), with the corpse's effect.
 * Returns true when it was used up. ref: src/do.c engulfer_digests_food()
 */
export function engulferDigestsFood(ctx: Ctx, engulfer: Entity, obj: Entity): boolean {
  if (!digests(ctx.defs.monster(engulfer.def)) || !DIGESTED.includes(obj.def)) return false;
  const corpse = obj.def === 'nh:corpse';
  const couldPetrify = corpse && petrifyingCorpse(ctx, obj);
  const couldGrow = corpse && obj.c.item?.corpseOf === 'nh:wraith';
  // see or feel the effect
  ctx.emit({
    type: 'msg',
    key: (obj.c.item?.quantity ?? 1) !== 1 ? 'drop.digested_pl' : 'drop.digested',
    params: { item: xnameOf(ctx.state, ctx.defs, obj) },
  });
  if (couldPetrify) minstapetrify(ctx, engulfer, true);
  else if (couldGrow) growUp(ctx, engulfer.id, null);
  ctx.remove(obj.id); // always used up
  return true;
}

export function registerDigestFood(): void {
  setEngulferDigestsFood(engulferDigestsFood);
}
