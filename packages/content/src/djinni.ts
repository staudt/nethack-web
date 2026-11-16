// Bottle occupants for the hero: the djinni from a smoky potion or a magic lamp, with its five
// outcomes (a wish, a pet, a peaceful djinni, one that vanishes and a hostile one), and the
// ghost from a milky potion. The monsters' side is muse.ts's precheck(); the draw is bottle.ts's.
// ref: src/potion.c djinni_from_bottle(), ghost_from_bottle(), mongrantswish(), dodrink()
import {
  NORMAL_SPEED,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
} from '@nh/core';
import { DJINNI, GHOST, MILKY, SMOKY, objdescrIs, occupantDraw } from './bottle';
import { tamedog } from './dog';
import { makemon } from './generation';
import { useup } from './magic';
import { mongone } from './mondeath';
import { nomul } from './nomul';
import { canSpotMon, monNam, rndmonnam } from './perception';
import { P, hasProp } from './props';
import { answerWish, askWish, type WishData } from './wish';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const blind = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.BLINDED);

/** A djinni's wish in progress (the prompt's data): told apart from a fountain's wish. */
export interface DjinniWishData extends WishData {
  djinni: true;
}

export const isDjinniWish = (data: Json): boolean =>
  typeof data === 'object' && data !== null && (data as { djinni?: unknown }).djinni === true;

/**
 * The djinni comes out of `obj` (a smoky potion or a magic lamp) next to the hero and speaks;
 * what it does depends on the object's BUC: 0 a wish, 1 tame, 2 peaceful, 3 vanishes, 4 hostile,
 * with blessed 80/5/5/5/5%, uncursed 20% each and cursed 5/5/5/5/80%. The wish removes the
 * djinni first (mongrantswish()) and leaves the prompt pending for `action` (true then; its
 * answer is answerDjinniWish()). ref: src/potion.c djinni_from_bottle(), mongrantswish()
 */
export function djinniFromBottle(ctx: Ctx, obj: Entity, action: DefId): boolean {
  const p = getPlayer(ctx.state).c.pos;
  const id = p ? makemon(ctx, ctx.defs.monster(DJINNI), p, { adjacentOk: true }) : null;
  const mtmp = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !mtmp?.c.monster) {
    say(ctx, 'djinni.empty');
    return false;
  }
  if (!blind(ctx)) {
    say(ctx, 'djinni.emerges', { mon: monNam(ctx, mtmp) });
    say(ctx, 'djinni.speaks', { mon: monNam(ctx, mtmp) });
  } else {
    say(ctx, 'djinni.acrid');
    say(ctx, 'djinni.something_speaks');
  }
  let chance = ctx.rng.rn2(5);
  const buc = obj.c.item?.buc;
  if (buc === 'blessed') chance = chance === 4 ? ctx.rng.rnd(4) : 0;
  else if (buc === 'cursed') chance = chance === 0 ? ctx.rng.rn2(4) : 4;
  // 0,1,2,3,4:  b=80%,5,5,5,5; nc=20%,20,20,20,20; c=5%,5,5,5,80
  const m = mtmp.c.monster;
  switch (chance) {
    case 0: {
      say(ctx, 'djinni.debt');
      // give a wish and discard the monster: it leaves first, in case the wish proves fatal
      mongone(ctx, id);
      const data: DjinniWishData = { tries: 0, wizard: false, djinni: true };
      askWish(ctx, action, data);
      return true;
    }
    case 1:
      say(ctx, 'djinni.thanks');
      tamedog(ctx, id, null, false, () => undefined);
      break;
    case 2:
      say(ctx, 'djinni.freed');
      m.peaceful = true; // set_malign(): derived from the peacefulness here
      break;
    case 3:
      say(ctx, 'djinni.about_time');
      if (canSpotMon(ctx, mtmp)) say(ctx, 'djinni.vanishes', { mon: monNam(ctx, mtmp) });
      mongone(ctx, id);
      break;
    default:
      say(ctx, 'djinni.disturbed');
      m.peaceful = false;
      break;
  }
  return false;
}

/**
 * The answer to a djinni's wish prompt: the wish (asked again for an unknown name). Returns the
 * time taken: 0 while the prompt is asked again.
 */
export function answerDjinniWish(ctx: Ctx, action: DefId, value: Json, raw: Json): number {
  answerWish(ctx, action, value, raw as unknown as DjinniWishData);
  return ctx.state.pendingPrompt ? 0 : NORMAL_SPEED;
}

/**
 * A ghost comes out of a milky potion next to the hero: "As you open the bottle, an enormous
 * ghost emerges!" and she is frightened to death, helpless for 3 moves (not when blind: she only
 * learns that something emerges). Returns the extra energy of the helpless moves.
 * ref: src/potion.c ghost_from_bottle()
 */
export function ghostFromBottle(ctx: Ctx): number {
  const p = getPlayer(ctx.state).c.pos;
  const id = p ? makemon(ctx, ctx.defs.monster(GHOST), p, { adjacentOk: true }) : null;
  if (id === null) {
    say(ctx, 'ghost.empty');
    return 0;
  }
  if (blind(ctx)) {
    say(ctx, 'ghost.emerges_blind');
    return 0;
  }
  const halluc = hasProp(getPlayer(ctx.state), P.HALLUC);
  say(ctx, 'ghost.emerges', { mon: `@${halluc ? rndmonnam(ctx) : GHOST}` });
  say(ctx, 'ghost.frightened'); // flags.verbose
  return nomul(ctx, 3, 'helpless.frightened', { key: 'ghost.composure' });
}

/**
 * The hero opens a potion: a milky one may hold a ghost, a smoky one a djinni (each 1 in
 * 13 + 2 * born, never once the kind is gone); then the potion is used up instead of drunk.
 * Returns the time taken (0 while the djinni's wish is asked), or null when the bottle held no
 * occupant and the potion is drunk as usual. The potion is used up before a wish is answered
 * (NetHack keeps it `in_use` until after the wish). ref: src/potion.c dodrink()
 */
export function bottleOccupant(ctx: Ctx, potion: Entity, action: DefId): number | null {
  if (objdescrIs(ctx.state, potion.def, MILKY) && occupantDraw(ctx, GHOST)) {
    const extra = ghostFromBottle(ctx);
    useup(ctx, potion.id);
    return NORMAL_SPEED + extra;
  }
  if (objdescrIs(ctx.state, potion.def, SMOKY) && occupantDraw(ctx, DJINNI)) {
    const pending = djinniFromBottle(ctx, potion, action);
    useup(ctx, potion.id);
    return pending ? 0 : NORMAL_SPEED;
  }
  return null;
}
