// Random curses on the hero's inventory: an angry god's and a spellcasting monster's.
// ref: src/sit.c rndcurse()
//
// Not ported: Magicbane (no artifacts), intelligent artifacts resisting, Half_spell_damage (no
// source) and the steed's saddle.
import { getPlayer, inventoryOf, type Ctx } from '@nh/core';
import { P, hasProp } from './props';

/**
 * "You feel a malignant aura surround you." and up to 6 random items (3 with magic resistance)
 * lose their blessing or are cursed; gold is never chosen. ref: src/sit.c rndcurse()
 */
export function rndcurse(ctx: Ctx): void {
  const antimagic = hasProp(getPlayer(ctx.state), P.ANTIMAGIC); // shieldeff() is not shown
  ctx.emit({ type: 'msg', key: 'pray.malignant_aura' });
  const items = inventoryOf(ctx.state, ctx.state.playerId).filter(
    (o) => ctx.defs.object(o.def).class !== 'coin',
  );
  let cnt = ctx.rng.rnd(Math.trunc(6 / ((antimagic ? 1 : 0) + 1)));
  if (items.length === 0) return;
  for (; cnt > 0; cnt--) {
    const otmp = items[ctx.rng.rnd(items.length) - 1];
    const it = otmp?.c.item;
    if (!it || it.buc === 'cursed') continue;
    it.buc = it.buc === 'blessed' ? 'uncursed' : 'cursed';
  }
}
