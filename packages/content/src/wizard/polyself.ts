import type { ActionDef } from '@nh/core';
import { polyself } from '../polyself';

export const WIZ_POLYSELF = 'wiz:polyself';

/**
 * #polyself: the hero polymorphs under forced control ("Become what kind of monster? [type the
 * name]"; Escape is "Never mind."), with no system shock and no 1-in-5 new human. Takes no time
 * (ECMD_OK). ref: src/wizcmds.c wiz_polyself(), src/polyself.c polyself(POLY_CONTROLLED)
 */
export const wizPolyself: ActionDef = {
  id: WIZ_POLYSELF,
  labelKey: 'action.wiz:polyself',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_POLYSELF }, labelKey: 'action.wiz:polyself' }]
      : [],
  perform(ctx) {
    polyself(ctx, { controlled: true });
    return 0;
  },
};
