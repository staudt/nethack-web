// Ending the game, and the amulet of life saving that can stop it. ref: src/end.c done(), savelife()
//
// Every death of the hero goes through `done()`, so a worn amulet of life saving can intercept
// it, and so can a mod's `beforeGameOver` hook (wizard mode).
// Not ported: the high-score "while attempting to cheat Death" reason (no score list), expelling
// from an engulfer (no engulfing), lava traps, polymorph, Unchanging.
import { getPlayer, inventoryOf, type Ctx, type Msg } from '@nh/core';
import { removeFromInventory } from './items';
import { nomul } from './nomul';
import { discover } from './o_init';
import { monNam } from './perception';
import { P, hasProp, updateWornProps } from './props';
import { hungerData, initUhunger } from './uhunger';
import { setUstuck, ustuck } from './hackmove';
import { setEndHow, type How } from './endstate';

export type { How } from './endstate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * The hero dies of `killer` (a death reason key), unless her amulet of life saving saves her
 * or a `beforeGameOver` hook (wizard mode's "Die?") keeps the game going; check
 * `ctx.state.gameOver` afterwards. ref: src/end.c done(): `if (Lifesaved && how <=
 * GENOCIDED)` ("But wait..."), then `(wizard || discover) && !paranoid_query("Die?")`, both
 * ending in savelife(how), else the game ends.
 */
export function done(ctx: Ctx, killer: string, how: How = 'died'): void {
  const hero = getPlayer(ctx.state);
  if (hasProp(hero, P.LIFESAVED)) {
    say(ctx, 'lifesave.wait');
    // assumes that only one type of item confers LifeSaved property
    discover(ctx, 'nh:amulet_of_life_saving');
    say(ctx, hasProp(hero, P.BLINDED) ? 'lifesave.warm' : 'lifesave.glow');
    if (how === 'choking') say(ctx, 'lifesave.vomit');
    say(ctx, 'lifesave.better');
    say(ctx, 'lifesave.crumbles');
    const uamul = inventoryOf(ctx.state, hero.id).find((o) => o.c.item?.equipped === 'amulet');
    if (uamul) {
      // useup(uamul): setnotworn() gives no Amulet_off() feedback
      removeFromInventory(ctx, uamul.id);
      ctx.remove(uamul.id);
      updateWornProps(ctx.state, ctx.defs, hero.id);
    }
    // adjattrib(A_CON, -1, TRUE): no message; Fixed_abil keeps it
    const a = hero.c.attributes;
    if (a && !hasProp(hero, P.FIXED_ABIL)) a.con = Math.max(3, a.con - 1);
    savelife(ctx, how);
    return;
  }
  setEndHow(ctx, how);
  ctx.endGame({
    kind: 'died',
    killer,
    turn: ctx.state.turn,
    depth: ctx.state.levels[ctx.state.currentLevel]?.depth ?? 1,
    level: hero.c.experience?.level ?? 1,
  });
  // a mod kept the game going: the hero lives on, as after "OK, so you don't die."
  if (ctx.state.gameOver === null) savelife(ctx, how);
}

/** ref: src/end.c savelife() */
function savelife(ctx: Ctx, how: How): void {
  const hero = getPlayer(ctx.state);
  const xp = hero.c.experience;
  if (xp && xp.level < 1) xp.level = 1;
  const con = hero.c.attributes?.con ?? 10;
  const givehp = 50 + 10 * Math.trunc(con / 2);
  const hp = hero.c.hp;
  if (hp) {
    const uhpmin = Math.max(xp?.level ?? 1, 10); // minuhpmax(10)
    if (hp.max < uhpmin) hp.max = uhpmin;
    hp.cur = Math.min(hp.max, givehp);
  }
  if ((hero.c.hunger?.nutrition ?? 900) < 500 || how === 'choking') initUhunger(ctx);
  // cure impending doom of sickness hero won't have time to fix: the sickness that killed her
  // has run out (`(Sick & TIMEOUT) == 1`)
  const hd = hungerData(ctx);
  if (hd.sick && hd.sick.remaining <= 1) hd.sick = null;
  // multi = -1: she can't move again during the current turn
  // (as nomulNow(): from inside a monster's move the extra energy is taken at once)
  const extra = nomul(ctx, 1, 'helpless.cheat_death', { key: 'lifesave.survived' });
  if (hero.c.actor) hero.c.actor.energy -= extra;
  const stuck = ustuck(ctx);
  if (stuck !== null) {
    const mon = ctx.state.entities[String(stuck)];
    if (mon) say(ctx, 'lifesave.released', { mon: monNam(ctx, mon) });
    setUstuck(ctx, null); // unstuck()
  }
}
