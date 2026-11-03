import type { ActionDef } from '@nh/core';
import { identifyPack } from '../read';

export const WIZ_IDENTIFY = 'wiz:identify';

/**
 * #wizidentify (^I): identify the whole inventory: type, BUC, enchantment or charges, and a
 * container's contents and lock. NetHack shows the inventory as if identified, with a menu
 * entry to make that permanent; here it is made permanent at once, item by item ("a - ..."),
 * as identify_pack(0) does. Takes no time (ECMD_OK).
 * ref: src/wizcmds.c wiz_identify(), src/invent.c display_pickinv() (override_ID),
 * identify_pack()
 */
export const wizIdentify: ActionDef = {
  id: WIZ_IDENTIFY,
  labelKey: 'action.wiz:identify',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_IDENTIFY }, labelKey: 'action.wiz:identify' }]
      : [],
  perform(ctx) {
    identifyPack(ctx, 0, false);
    return 0;
  },
};
