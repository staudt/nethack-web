import { NORMAL_SPEED, type ActionDef, type Ctx } from '@nh/core';
import { morehungry } from '../hunger';
import { answerTeleport, askTeleport } from '../trap';

export const WIZ_TELEPORT = 'wiz:teleport';

/** dotele()'s ending: the teleport costs 100 nutrition and takes the move. */
function afterTele(ctx: Ctx): number {
  if (!ctx.state.gameOver) morehungry(ctx, 100);
  return NORMAL_SPEED;
}

/**
 * Wizard mode's ^T (#teleport without the `m` prefix): dotele(TRUE), which ignores the level's
 * no-teleport flag, the intrinsic, the energy and hunger checks, and is always controlled: "Where
 * do you want to be teleported?" and the position cursor. A spot she cannot land on is "Sorry..."
 * and a random teleport; cancelling leaves her where she is. Either way it uses 100 nutrition and
 * the move. Not ported: dotele()'s known teleportation trap or level teleporter underfoot, the
 * Amulet's and the Wizard's Tower's "You feel disoriented for a moment." (neither exists yet) and
 * the `m` prefix menu of teleport modes.
 * ref: src/teleport.c dotelecmd(), dotele(break_the_rules), tele(), scrolltele()
 */
export const wizTeleport: ActionDef = {
  id: WIZ_TELEPORT,
  labelKey: 'action.wiz:teleport',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_TELEPORT }, labelKey: 'action.wiz:teleport' }]
      : [],
  perform(ctx) {
    if (askTeleport(ctx, WIZ_TELEPORT, null)) return 0; // the move is spent on the answer
    return afterTele(ctx);
  },
  answer(ctx, value) {
    answerTeleport(ctx, value);
    return afterTele(ctx);
  },
};
