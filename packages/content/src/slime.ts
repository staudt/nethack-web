// Sliming: the hero's countdown once a green slime's touch got her (slime_dialogue()) and its end,
// turning into a green slime (slimed_to_death()). The state (the Slimed timer and its delayed
// killer) is slimestate.ts's.
// ref: src/timeout.c slime_dialogue(), slimed_to_death(), nh_timeout() SLIMED; src/botl.c bl_slime
//
// Not ported: the hero displayed as a green slime on the last turn (mappearance), deafness,
// exercise(), light sources of a shining form, genocide ("slimicide": nothing can be genocided).
import { getPlayer, type Ctx, type ModApi, type Msg } from '@nh/core';
import { done } from './end';
import { stopOccupation } from './eat';
import { hcolor } from './hcolor';
import { uState } from './luck';
import { nolimbs } from './mondata';
import { rndmonnam } from './perception';
import { polymon } from './polyself';
import { P, hasProp, setIntrinsic, setItimeout, timeoutLeft } from './props';
import { isSlimed, makeSlimed, slimedKiller } from './slimestate';
import { isStoned, makeStoned } from './stonestate';
import { heroForm, heroFormId, upolyd } from './upoly';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const GREEN_SLIME = 'nh:green_slime';

/**
 * One turn of the hero's sliming (every other turn a line: turning a little green, oozy limbs,
 * peeling skin, turning into a green slime, become one), losing intrinsic speed, being unable to
 * keep up an occupation, a petrification stopped near the end; at the end slimed_to_death().
 * Runs ahead of props.ts's countdown (as the petrification does): the C timeout value before the
 * decrement is our turns left + 1. ref: src/timeout.c slime_dialogue(), nh_timeout()
 */
function slimeTimeout(ctx: Ctx): void {
  if (ctx.state.gameOver || uState(ctx.state).uinvulnerable || !isSlimed(ctx.state)) return;
  const h = getPlayer(ctx.state);
  const t = timeoutLeft(ctx.state, h, P.SLIMED) + 1;
  const i = Math.trunc(t / 2);
  if (t % 2 !== 0 && i >= 0 && i < 5) {
    const form = heroForm(ctx);
    switch (i) {
      case 4: // "you are turning green"
        if (!hasProp(h, P.BLINDED)) say(ctx, 'slime.dialogue.4', { color: hcolor(ctx, 'green') });
        break;
      case 3: // "limbs" -> "extremities" for a limbless form
        say(ctx, form && nolimbs(form) ? 'slime.dialogue.3.extremities' : 'slime.dialogue.3');
        break;
      case 2:
        say(ctx, 'slime.dialogue.2');
        break;
      default:
        say(ctx, `slime.dialogue.${i}`, {
          mon: `@${hasProp(h, P.HALLUC) ? rndmonnam(ctx) : GREEN_SLIME}`,
        });
        break;
    }
  }
  switch (i) {
    case 3: // limbs becoming oozy
      setIntrinsic(h, P.FAST, false); // HFast = 0L: lose intrinsic speed
      setItimeout(ctx.state, h, P.FAST, 0);
      stopOccupation(ctx); // (no tins: no Popeye())
      ctx.interrupt(); // if (multi > 0) nomul(0)
      break;
    case 1: // turning into slime: if also turning to stone, stop doing that (no message)
      if (isStoned(ctx.state)) makeStoned(ctx, 0, null, null);
      break;
    default:
      break;
  }
  if (t === 1) {
    const kptr = slimedKiller(ctx.state);
    makeSlimed(ctx, 0, null);
    slimedToDeath(ctx, kptr);
  }
}

/**
 * The countdown ran out: she becomes a green slime (polymon(), which may break her armor) and
 * dies as one (done(TURNED_SLIME): "turned to slime by a green slime", or the delayed killer's
 * absence "turned into green slime"); life saved, she stays a green slime.
 * ref: src/timeout.c slimed_to_death() (no genocide)
 */
function slimedToDeath(ctx: Ctx, kptr: string | undefined): void {
  // redundant: polymon() cures sliming when polying into green slime
  if (upolyd(ctx.state) && heroFormId(ctx.state) === GREEN_SLIME) return;
  const killer = kptr ?? '!@killer.turned_into_green_slime';
  polymon(ctx, GREEN_SLIME, false);
  done(ctx, killer, 'turned_slime'); // done_timeout(TURNED_SLIME, SLIMED)
}

/** Registers the sliming countdown (after the petrification's) and the Slime status. */
export function registerSliming(api: ModApi): void {
  api.on('endOfTurn', slimeTimeout, { priority: 1 });
  // ref: src/botl.c bl_slime: the "Slime" condition
  api.defineStatus({
    id: 'nh:slimed',
    field: 'slime',
    value: (state) => (isSlimed(state) ? 1 : null),
  });
}
