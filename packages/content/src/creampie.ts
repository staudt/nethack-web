// Cream pies on the hero's own face: applying one (a facial) and #wipe, which takes the goop off
// a few turns at a time. ref: src/apply.c use_cream_pie(); src/do.c dowipe(), wipeoff()
//
// #wipe is offered only while her face is creamed (C also answers "Your face is already clean."
// to a clean face, which perform() still does). Not ported: gulp_blnd_check() (an engulfer
// that blinds keeps her blind: the port's blinding engulfs time out on their own), body parts
// of other forms (always "face").
import {
  NORMAL_SPEED,
  getPlayer,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Msg,
} from '@nh/core';
import { canBlnd } from './adtyping';
import { addUcreamed, setUcreamed, ucreamed } from './creamed';
import { splitStack } from './items';
import { xnameOf } from './objnam';
import {
  P,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  makeBlinded,
  setItimeout,
  timeoutLeft,
} from './props';
import { costlyAlteration } from './shk';

export const CREAM_PIE: DefId = 'nh:cream_pie';
export const WIPE_ID: DefId = 'nh:wipe';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * She pushes a cream pie into her own face: "You immerse your face in the cream pie." ("You give
 * yourself a facial." hallucinating), then unless a blindfold covers her eyes rnd(25) turns of
 * goop and blindness ("There's sticky goop all over your face.", "You can't see through all the
 * sticky goop on your face." if that blinded her); the pie is used up (paid for in a shop).
 * ref: src/apply.c use_cream_pie()
 */
export function useCreamPie(ctx: Ctx, obj: Entity): number {
  const hero = getPlayer(ctx.state);
  const wasblind = hasProp(hero, P.BLINDED);
  const wascreamed = ucreamed(ctx.state) > 0;
  const several = (obj.c.item?.quantity ?? 1) > 1;
  const pie = several ? ctx.state.entities[String(splitStack(ctx, obj.id, 1))] : obj;
  if (!pie) return 0;
  if (hasProp(hero, P.HALLUC)) say(ctx, 'pie.facial');
  else
    say(ctx, several ? 'pie.immerse_one' : 'pie.immerse', {
      item: xnameOf(ctx.state, ctx.defs, pie),
    });
  if (canBlnd(ctx, null, hero, 'weapon', pie)) {
    const blindinc = ctx.rng.rnd(25);
    addUcreamed(ctx.state, blindinc);
    makeBlinded(ctx, timeoutLeft(ctx.state, hero, P.BLINDED) + blindinc, false);
    if (!hasProp(hero, P.BLINDED) || wasblind) say(ctx, wascreamed ? 'pie.more_goop' : 'pie.goop');
    else say(ctx, 'pie.cant_see');
  }
  // useup() is appropriate, but we want costly_alteration()'s message
  costlyAlteration(ctx, pie, 'splat', null);
  ctx.remove(pie.id);
  return NORMAL_SPEED;
}

/**
 * One turn of wiping: up to 4 turns of goop and of blindness come off. "You've got the glop
 * off." when she is no longer blind (and she sees again), "Your face feels clean now." when the
 * goop is gone but she is still blind; false when she is done. ref: src/do.c wipeoff()
 */
function wipeoff(ctx: Ctx): boolean {
  const hero = getPlayer(ctx.state);
  setUcreamed(ctx.state, ucreamed(ctx.state) - Math.min(ucreamed(ctx.state), 4));
  const ldelta = Math.min(timeoutLeft(ctx.state, hero, P.BLINDED), 4);
  incrItimeout(ctx.state, hero, P.BLINDED, -ldelta);
  const hblinded = timeoutLeft(ctx.state, hero, P.BLINDED) > 0 || hasIntrinsic(hero, P.BLINDED);
  if (!hblinded) {
    say(ctx, 'wipe.glop_off');
    setUcreamed(ctx.state, 0);
    // (no gulp_blnd_check(): see the header)
    setItimeout(ctx.state, hero, P.BLINDED, 1);
    makeBlinded(ctx, 0, true);
    return false;
  }
  if (!ucreamed(ctx.state)) {
    say(ctx, 'wipe.clean_now');
    return false;
  }
  return true; // still busy
}

/** The wiping occupation has begun (the engine sets the occupation with null data first). */
const wiping = (ctx: Pick<Ctx, 'state'>): boolean =>
  ctx.state.occupation?.action.type === 'mod' &&
  ctx.state.occupation.action.action === WIPE_ID &&
  ctx.state.occupation.data !== null;

/**
 * #wipe: she wipes her face, a few turns of goop at a time ("wiping off your face"), or "Your
 * face is already clean." (a turn either way). ref: src/do.c dowipe()
 */
const wipe: ActionDef = {
  id: WIPE_ID,
  labelKey: 'action.nh:wipe',
  handles: 'mod',
  offer: (ctx, target) =>
    target.kind === 'self' && ucreamed(ctx.state) > 0
      ? [{ action: { type: 'mod', action: WIPE_ID }, labelKey: 'action.nh:wipe' }]
      : [],
  perform(ctx) {
    if (wiping(ctx)) {
      // set_occupation(wipeoff, ...): the wiping itself, from the next move on
      if (!wipeoff(ctx)) ctx.state.occupation = null;
      return NORMAL_SPEED;
    }
    if (ucreamed(ctx.state) > 0) {
      ctx.state.occupation = { action: { type: 'mod', action: WIPE_ID }, data: { wiping: true } };
      return NORMAL_SPEED;
    }
    say(ctx, 'wipe.already_clean');
    return NORMAL_SPEED;
  },
  continues: (ctx) => wiping(ctx),
};

export const WIPE_ACTIONS: readonly ActionDef[] = [wipe];
