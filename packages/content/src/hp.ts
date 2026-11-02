// Hit point loss that can kill the hero. ref: src/hack.c losehp(), src/attrib.c losestr()
import { getPlayer, type Ctx } from '@nh/core';
import { done, type How } from './end';
import { P, hasProp } from './props';

/** Loses hit points, dying if they run out. ref: src/hack.c losehp() */
export function losehp(ctx: Ctx, n: number, killer: string): void {
  const h = getPlayer(ctx.state);
  const hp = h.c.hp;
  if (!hp) return;
  hp.cur -= n;
  if (hp.cur > hp.max) hp.max = hp.cur;
  ctx.interrupt(); // end_running()
  if (hp.cur < 1) die(ctx, killer);
}

/** "You die..." then done(), which a worn amulet of life saving may stop. */
export function die(ctx: Ctx, killer: string, how: How = 'died'): void {
  ctx.emit({ type: 'msg', key: 'combat.you_die' });
  done(ctx, killer, how);
}

/** ref: src/attrib.c losestr(): strength points, then HP once it would drop below 3 */
export function losestr(ctx: Ctx, num: number, killer: string): void {
  const h = getPlayer(ctx.state);
  const a = h.c.attributes;
  if (!a) return;
  let ustr = a.str - num;
  let dmg = 0;
  while (ustr < 3) {
    ustr++;
    num--;
    dmg += 3 + ctx.rng.rn2(4); // rn1(4, 3)
  }
  if (dmg) {
    losehp(ctx, dmg, killer);
    const hp = h.c.hp;
    if (hp && hp.max > 1) hp.max = Math.max(hp.max - dmg, 1);
  }
  // adjattrib(A_STR, -num, 1): sustain ability keeps it
  if (num > 0 && !hasProp(h, P.FIXED_ABIL)) a.str = Math.max(3, a.str - num);
}
