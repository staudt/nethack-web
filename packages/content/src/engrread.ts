// Reading the engraving under the hero. ref: src/engrave.c read_engr_at(), engr_can_be_felt()
//
// A leaf over engr.ts and reach.ts so itemactions.ts lookHere() (pickup(1), look_here()) can
// read engravings without reaching the `E` command's module (engrave.ts re-exports it).
// Not kept: `eread`, `erevealed` and the remembered text (no engraving symbol on the map:
// DEVIATIONS.md "Engravings").
import { getPlayer, type Ctx } from '@nh/core';
import { engrAt, type Engr } from './engr';
import { isIce } from './liquid';
import { P, heroHas } from './props';
import { canReachFloor } from './reach';
import { surfaceKey } from './terrain';

/** ref: include/global.h BUFSZ less `sizeof "You feel the words: \"\"."` */
const MAXELEN = 256 - 24;

/** Engraved, burned and headstone text can be felt. ref: src/engrave.c engr_can_be_felt() */
export const engrCanBeFelt = (e: Engr): boolean =>
  e.type === 'engrave' || e.type === 'headstone' || e.type === 'burn';

/** `context.run > 0`: she is running or travelling. */
const running = (ctx: Pick<Ctx, 'state'>): boolean => {
  const occ = ctx.state.occupation?.action;
  return occ?.type === 'mod' && (occ.action === 'nh:run' || occ.action === 'nh:travel');
};

/**
 * Tells what is written at (x, y) on the hero's level: dust and frost, graffiti and blood need
 * sight; engraved, burned (melted into ice) and headstone text are also felt when she can reach
 * the floor. Then "You read: "...". " or "You feel the words: "...".", without the final "."
 * when the text still ends in its own `.`, `!` or `?`. A read stops a run.
 * ref: src/engrave.c read_engr_at()
 */
export function readEngrAt(ctx: Ctx, x: number, y: number): void {
  const pos = getPlayer(ctx.state).c.pos;
  const level = pos ? ctx.state.levels[pos.level] : undefined;
  if (!level) return;
  const e = engrAt(ctx, level, x, y);
  if (!e || !e.text) return;
  const blind = heroHas(ctx.state, P.BLINDED);
  const surface = surfaceKey(ctx, level, x, y);
  const say = (key: string, params?: Record<string, string>): void =>
    ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });
  let sensed = false;
  switch (e.type) {
    case 'dust':
      if (!blind) {
        sensed = true;
        say(isIce(ctx, level, x, y) ? 'engr.here_frost' : 'engr.here_dust');
      }
      break;
    case 'engrave':
    case 'headstone':
      if (!blind || canReachFloor(ctx, true)) {
        sensed = true;
        say('engr.here_engraved', { surface });
      }
      break;
    case 'burn':
      if (!blind || canReachFloor(ctx, true)) {
        sensed = true;
        say(isIce(ctx, level, x, y) ? 'engr.here_melted' : 'engr.here_burned', { surface });
      }
      break;
    case 'mark':
      if (!blind) {
        sensed = true;
        say('engr.here_graffiti', { surface });
      }
      break;
    case 'blood':
      // "It's a message!  Scrawled in blood!" "What's it say?" "It says... `See you next
      // Wednesday.'" -- Thriller
      if (!blind) {
        sensed = true;
        say('engr.here_blood');
      }
      break;
  }
  if (!sensed) return;
  let et = e.text;
  if (et.length > MAXELEN) et = et.slice(0, MAXELEN);
  const elen = et.length;
  const off = e.off ?? 0;
  const last = et.charAt(elen - 1);
  // only skip if punctuation is original, not degraded char
  const endpunct =
    elen < 2 || !(e.pristine.charAt(off + elen - 1) === last && '.!?'.includes(last)) ? '.' : '';
  // the text is data, not a key: quoted, it never starts with '@' or '='
  say(blind ? 'engr.you_feel' : 'engr.you_read', { text: `"${et}"${endpunct}` });
  if (running(ctx)) ctx.interrupt();
}
