import type { ActionDef } from '@nh/core';
import { encumberMsg } from '../itemactions';
import { answerWish, askWish, type WishData } from '../wish';

export const WIZ_WISH = 'wiz:wish';

/**
 * #wizwish (^W): wish for an object, as often as wanted, with wizard mode's freedom from the
 * normal wish limits. Takes no time (ECMD_OK). flags.verbose is off for it, so there is no
 * "You may wish for an object." first.
 * ref: src/wizcmds.c wiz_wish(), src/zap.c makewish()
 */
export const wizWish: ActionDef = {
  id: WIZ_WISH,
  labelKey: 'action.wiz:wish',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_WISH }, labelKey: 'action.wiz:wish' }]
      : [],
  perform(ctx) {
    askWish(ctx, WIZ_WISH, { tries: 0, wizard: true });
    return 0;
  },
  answer(ctx, value, raw) {
    const data = raw as unknown as WishData | null;
    answerWish(ctx, WIZ_WISH, value, data ?? { tries: 0, wizard: true });
    encumberMsg(ctx);
    return 0;
  },
};
