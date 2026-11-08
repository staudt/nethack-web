// Monster attacks on the hero: damage and the special damage types.
// ref: src/mhitu.c hitmu(), mdamageu(), magic_negation(); src/uhitm.c mhitm_adtyping() (the
// `mdef == &gy.youmonst` branches live in adtyping.ts)
import { getPlayer, type AttackDef, type Ctx, type Entity, type Msg } from '@nh/core';
import { done } from './end';
import { mhitmAdtyping, newMhm } from './adtyping';

export { magicNegation, mgcAtkNegated } from './adtyping';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * A monster hit the hero for `n` points of damage: she dies at 0 HP.
 * ref: src/mhitu.c mdamageu() -> src/end.c done_in_by(). `killer` is the death reason (a
 * message key such as '@nh:newt').
 */
export function mdamageu(ctx: Ctx, n: number, killer: string): void {
  if (ctx.state.gameOver) return;
  const hero = getPlayer(ctx.state);
  const hp = hero.c.hp;
  if (!hp) return;
  hp.cur -= n;
  // caller might have reduced uhpmax before calling mdamageu()
  if (hp.cur > hp.max) hp.cur = hp.max;
  if (hp.cur < 1) {
    say(ctx, 'combat.you_die');
    done(ctx, killer);
  }
}

/**
 * The effect of the attack's damage type on the hero; returns the damage left to apply. The
 * "hits!" message has already been given (adtyping.ts NO_HITMSG lists the types that give none).
 * The hero may die inside (instadeath poison): check `ctx.state.gameOver` afterwards.
 * ref: src/uhitm.c mhitm_adtyping() with `mdef == &gy.youmonst` (see adtyping.ts)
 */
export function hitmuAd(ctx: Ctx, mon: Entity, atk: AttackDef, damage: number): number {
  const mhm = newMhm(damage);
  mhitmAdtyping(ctx, mon.id, atk, ctx.state.playerId, mhm);
  return mhm.damage;
}
