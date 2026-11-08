// Imps and other vile monsters curse the hero. ref: src/wizard.c cuss(); the lines are
// dat/quest.lua questtext demon_cuss, delivered by src/questpgr.c com_pager() (a random entry of
// the array)
import type { Ctx, Entity } from '@nh/core';
import { wakeNearto } from './noise';
import { monNam } from './perception';

/** ref: dat/quest.lua demon_cuss: how many lines it has */
export const DEMON_CUSS_LINES = 27;

/**
 * A monster's "extra emotional attack": it casts aspersions on her ancestry one time in five,
 * else says one of the demon_cuss lines; nearby monsters wake. ref: src/wizard.c cuss() (no
 * Wizard of Yendor or minions exist here, so only the last branch with `!rn2(5)`; the hero is
 * never Deaf)
 */
export function cuss(ctx: Ctx, mon: Entity): void {
  if (!ctx.rng.rn2(5))
    ctx.emit({ type: 'msg', key: 'cuss.aspersions', params: { mon: monNam(ctx, mon) } });
  else {
    // com_pager(): `nelems = rn2(nelems) + 1`
    const n = ctx.rng.rn2(DEMON_CUSS_LINES) + 1;
    ctx.emit({ type: 'msg', key: `cuss.demon.${n}` });
  }
  const p = mon.c.pos;
  if (p) wakeNearto(ctx, p.x, p.y, 5 * 5);
}
