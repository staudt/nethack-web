// Engravings: the `:` look command now; the `E` command comes with m16 step 2.
// ref: src/engrave.c; src/invent.c dolook()
//
// The state is engr.ts (a leaf) and reading it engrread.ts (a leaf for itemactions.ts); this
// module holds the commands and may import game modules, so nothing below it imports it.
import type { ActionDef, DefId } from '@nh/core';
import { dolook } from './itemactions';
import { LAST } from './priority';

export { readEngrAt, engrCanBeFelt } from './engrread';

/** The `:` command: look here. ref: src/invent.c dolook() */
export const LOOK_ID: DefId = 'nh:look';

const look: ActionDef = {
  id: LOOK_ID,
  labelKey: 'action.nh:look',
  handles: 'mod',
  // ref: src/cmd.c the "look" command (`:`); always there, so near the end of the menu
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [
          {
            action: { type: 'mod', action: LOOK_ID },
            labelKey: 'action.nh:look',
            priority: LAST + 1,
          },
        ]
      : [],
  perform: (ctx) => dolook(ctx),
};

export const ENGRAVE_ACTIONS: readonly ActionDef[] = [look];
