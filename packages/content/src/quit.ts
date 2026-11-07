// #quit: give up the game. ref: src/end.c done2(), done(QUIT)
//
// Ported: the "Really quit without saving?" question (paranoid_query(ParanoidQuit), a yn whose
// default is no), then done(QUIT): no life saving or "Die?" (both are only for deaths), the
// game ends with how QUIT and no killer.
// Not ported: the tutorial question (no tutorial), wizard mode's "Dump core?" ynq, the SIGINT
// handling, and "quit while already on Charon's boat" (a hero at 0 hit points never gets to act).
import { getPlayer, type ActionDef, type DefId } from '@nh/core';
import { setEndHow } from './endstate';
import { LAST } from './priority';

export const QUIT_ID: DefId = 'nh:quit';

const quit: ActionDef = {
  id: QUIT_ID,
  labelKey: 'action.nh:quit',
  handles: 'mod',
  // ref: src/cmd.c the "quit" extended command; offered last, it is never what the place suggests
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: QUIT_ID }, labelKey: 'action.nh:quit', priority: LAST }]
      : [],
  perform(ctx) {
    ctx.ask(
      { id: 'quit-confirm', kind: 'yn', key: 'end.quit_confirm', cancellable: true },
      QUIT_ID,
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    // anything but 'y' returns ECMD_OK: no message, no time
    if (value !== true) return 0;
    setEndHow(ctx, 'quit');
    ctx.endGame({
      kind: 'quit',
      killer: 'quit',
      turn: ctx.state.turn,
      depth: ctx.state.levels[ctx.state.currentLevel]?.depth ?? 1,
      level: getPlayer(ctx.state).c.experience?.level ?? 1,
    });
    return 0;
  },
};

export const QUIT_ACTIONS: readonly ActionDef[] = [quit];
