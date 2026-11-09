// How the game ended, for the end-of-game summary: done(), the escape and (later) #quit write it
// just before ctx.endGame(). A leaf (core only), so end.ts can import it without a cycle.
// ref: src/end.c done(how), really_done(how)
import type { Ctx, GameState, Json } from '@nh/core';
/** How the hero died, for the parts of done() that care. ref: include/hack.h DIED, CHOKING ... */
export type How = 'died' | 'choking' | 'poisoning' | 'starving' | 'stoning' | 'turned_slime';

/** C's `how` for the ends the port has. ref: include/hack.h DIED ... ESCAPED */
export type EndHow = How | 'escaped' | 'quit';

interface EndData {
  endHow?: EndHow;
}

/** Records how the game is ending (`modData.nh.endHow`). */
export function setEndHow(ctx: Ctx, how: EndHow): void {
  const nh = (ctx.state.modData['nh'] ??= {}) as unknown as EndData;
  nh.endHow = how;
  ctx.state.modData['nh'] = nh as unknown as Json;
}

/** How the game ended; 'died' when nothing recorded it (an older game over). */
export function endHow(state: Readonly<GameState>): EndHow {
  const nh = state.modData['nh'] as EndData | undefined;
  return nh?.endHow ?? 'died';
}
