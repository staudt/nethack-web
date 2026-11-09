// Hit point loss that can kill the hero. ref: src/hack.c losehp(), src/attrib.c losestr()
import { getPlayer, type Ctx } from '@nh/core';
import { done, type How } from './end';
import { P, hasProp } from './props';
import { rawAttr, setRawAttr } from './attrstate';
import { rehumanize, upolyd } from './upoly';

/**
 * Loses hit points, dying if they run out. While polymorphed `c.hp` is the form's (u.mh): it
 * running out returns her to her own form instead (rehumanize(), which kills her when Unchanging).
 * ref: src/hack.c losehp() (no maybe_wail())
 */
export function losehp(ctx: Ctx, n: number, killer: string): void {
  const h = getPlayer(ctx.state);
  const hp = h.c.hp;
  if (!hp) return;
  if (upolyd(ctx.state)) {
    hp.cur -= n;
    if (hp.max < hp.cur) hp.max = hp.cur;
    ctx.interrupt(); // end_running()
    if (hp.cur < 1) rehumanize(ctx);
    return;
  }
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
  const waspolyd = upolyd(ctx.state);
  if (dmg) {
    losehp(ctx, dmg, killer);
    // still polymorphed: the form's maximum, never below 1; not polymorphed now and not
    // rehumanized by the damage: her own (the port's minimum is 1, not minuhpmax(1))
    const hp = h.c.hp;
    if (hp && (upolyd(ctx.state) || !waspolyd) && hp.max > 1) {
      hp.max = Math.max(hp.max - dmg, 1);
      if (hp.cur > hp.max) hp.cur = hp.max;
    }
  }
  // adjattrib(A_STR, -num, 1): sustain ability keeps it; not when the damage rehumanized her
  if (num > 0 && (upolyd(ctx.state) || !waspolyd) && !hasProp(h, P.FIXED_ABIL))
    setRawAttr(ctx, 'str', Math.max(3, rawAttr(ctx.state, 'str') - num));
}
