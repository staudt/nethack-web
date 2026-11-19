// Carrying the Amulet of Yendor, once a turn: worn or wielded it hints at the level's magic
// portal. (m23 step 6 adds the Wizard's wake, intervene() and resurrect().)
// ref: src/wizard.c amulet(); src/allmain.c moveloop_core() `if (u.uhave.amulet) amulet();`
import { getLevel, getPlayer, type Ctx, type ModApi } from '@nh/core';
import { theXname } from './objnam';
import { findPortal } from './portal';
import { wornIn } from './props';
import { AMULET_OF_YENDOR, uHave } from './uhave';

/**
 * amulet(): the Amulet worn (or else wielded) feels hot within 3 squares of the level's magic
 * portal, very warm within 8 and warm within 12 (squared distances 9, 64, 144), 1 time in 15.
 * ref: src/wizard.c amulet() (the portal hints)
 */
export function amulet(ctx: Ctx): void {
  const hero = getPlayer(ctx.state);
  const worn = wornIn(ctx.state, hero.id, 'amulet');
  const wielded = wornIn(ctx.state, hero.id, 'weapon');
  const amu =
    worn?.def === AMULET_OF_YENDOR ? worn : wielded?.def === AMULET_OF_YENDOR ? wielded : null;
  if (!amu || ctx.rng.rn2(15)) return;
  const pos = hero.c.pos;
  const portal = pos ? findPortal(getLevel(ctx.state, pos.level)) : null;
  if (!pos || !portal) return;
  const du = (pos.x - portal.x) ** 2 + (pos.y - portal.y) ** 2;
  const key =
    du <= 9 ? 'amulet.hot' : du <= 64 ? 'amulet.very_warm' : du <= 144 ? 'amulet.warm' : null;
  // else, the amulet feels normal
  if (key) ctx.emit({ type: 'msg', key, params: { item: theXname(ctx.state, ctx.defs, amu) } });
}

/** amulet() once a turn while she carries the Amulet, after invault() (priority -10). */
export function registerHarass(api: ModApi): void {
  api.on(
    'endOfTurn',
    (ctx) => {
      if (uHave(ctx.state, 'amulet')) amulet(ctx);
    },
    { priority: -10.5 },
  );
}
