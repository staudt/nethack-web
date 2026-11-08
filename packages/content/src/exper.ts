// Losing experience levels (level drain): a wraith's touch, a barrow wight's blade, an angry god,
// a fire trap that leaves too few hit points, wizard mode's #levelchange.
// ref: src/exper.c losexp(); src/mondata.c resists_drli() for the hero
import { getPlayer, type Ctx } from '@nh/core';
import { done } from './end';
import { levelIncrements, newuexp, setUlevelmax, ulevelmax } from './hero';
import { adjabil } from './props';
import { pwOf, setPw } from './uenergy';
import { ulycn } from './werestate';

/** The `drainer` of wizard mode's #levelchange: never fatal, not resisted. */
export const LEVELCHANGE = '#levelchange';

/**
 * Whether the hero resists level drain: a lycanthrope does (is_were() for the hero in human
 * form). ref: src/mondata.c resists_drli() with `mon == &youmonst` (no Drain_resistance from
 * artifacts or polymorph: 7f)
 */
export const resistsDrliHero = (ctx: Pick<Ctx, 'state'>): boolean => ulycn(ctx.state) !== null;

/**
 * The hero loses an experience level: "Goodbye level 4.", the intrinsics and weapon-skill slot of
 * that level, the hit points and energy it gave (u.uhpinc[], u.ueninc[]: never below the
 * life-saving minimum, nor above the old maximum), and the experience points down to just below
 * the new level. At level 1 a `drainer` (a death reason key) kills her ("killed by life
 * drainage"); with none (divine anger, a fire trap) she only loses all her experience points.
 * ref: src/exper.c losexp() (no livelog, sounds or polymorphed hit points: 7f)
 */
export function losexp(ctx: Ctx, drainer: string | null): void {
  // override life-drain resistance when handling an explicit wizard mode request to reduce
  // level; never fatal though
  if (drainer === LEVELCHANGE) drainer = null;
  else if (resistsDrliHero(ctx)) return;
  const hero = getPlayer(ctx.state);
  const xp = hero.c.experience;
  const hp = hero.c.hp;
  if (!xp || !hp) return;
  // "Goodbye level 1." is fatal; divine anger (no drainer) at level 1 says nothing
  if (xp.level > 1 || drainer)
    ctx.emit({ type: 'msg', key: 'exp.goodbye', params: { level: xp.level } });
  const levelBefore = xp.level;
  if (xp.level > 1) {
    // a lost level is remembered so it can be welcomed back (u.ulevelmax)
    setUlevelmax(ctx, ulevelmax(ctx, xp.level), xp.level - 1);
    xp.level -= 1;
    adjabil(ctx, hero.id, xp.level + 1, xp.level); // remove intrinsic abilities
  } else {
    if (drainer) {
      done(ctx, drainer);
      if (ctx.state.gameOver !== null) return;
    }
    // no drainer or lifesaved
    xp.points = 0;
  }
  const pw = pwOf(ctx.state);
  const inc = levelIncrements(ctx, xp.level, hp.max, pw.uenmax, levelBefore);
  const olduhpmax = hp.max;
  const uhpmin = Math.max(xp.level, 10); // minuhpmax(10): same minimum as life-saving uses
  hp.max -= inc.hp;
  if (hp.max < uhpmin) hp.max = uhpmin;
  // uhpmax might try to go up if it was reduced before by other means: not allowed
  if (hp.max > olduhpmax) hp.max = olduhpmax;
  hp.cur -= inc.hp;
  if (hp.cur < 1) hp.cur = 1;
  else if (hp.cur > hp.max) hp.cur = hp.max;
  const uenmax = Math.max(pw.uenmax - inc.en, 0);
  let uen = pw.uen - inc.en;
  if (uen < 0) uen = 0;
  else if (uen > uenmax) uen = uenmax;
  setPw(ctx, { uenmax, uen });
  if (xp.points > 0) xp.points = newuexp(xp.level) - 1;
}
