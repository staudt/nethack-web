// Monster item use, the leaf part that low modules can read: curing a monster's blindness.
// (Later steps add searches_for_item(), mon_reflects() and the M_SEEN memory here.)
// ref: src/muse.c mcureblindness()
import type { Ctx, Entity, Msg } from '@nh/core';
import { mcansee, unblindMonst } from './mstate';
import { monNam } from './perception';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/mondata.h haseyes(): not M1_NOEYES */
const haseyes = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean =>
  !ctx.defs.monster(mon.def).flags.includes('noeyes');

/**
 * A blinded monster can see again: "The hill orc can see again." when `verbose` and it has eyes.
 * ref: src/muse.c mcureblindness()
 */
export function mcureblindness(ctx: Ctx, mon: Entity, verbose: boolean): void {
  if (mcansee(ctx, mon.id)) return;
  unblindMonst(ctx, mon.id);
  if (verbose && haseyes(ctx, mon)) say(ctx, 'muse.can_see_again', { mon: monNam(ctx, mon) });
}
