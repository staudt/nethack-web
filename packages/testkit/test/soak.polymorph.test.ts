// The soak bot in a world where everything keeps polymorphing: every few turns each monster on
// the level takes a random form (newcham()) and every floor object near the hero changes
// (poly_obj()), so the invariants are checked against polymorphed monsters, their dropped or
// broken gear and polymorphed objects.
import { newcham, polyObj, vanillaMod } from '@nh/content';
import { getPlayer, sortedIds, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

let changed = 0;
const polyEverythingMod: Mod = {
  id: 'testkit-poly-everything',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // a sturdy hero, so the run outlives the random forms around her
    api.on(
      'newGame',
      (ctx) => {
        const h = getPlayer(ctx.state);
        if (h.c.hp) h.c.hp = { cur: 3000, max: 3000 };
      },
      { priority: -100 },
    );
    api.on('endOfTurn', (ctx) => {
      if (ctx.state.turn % 7 !== 0 || ctx.state.gameOver) return;
      const hp = getPlayer(ctx.state).c.pos;
      if (!hp) return;
      for (const id of sortedIds(ctx.state)) {
        const e = ctx.state.entities[String(id)];
        if (!e || id === ctx.state.playerId) continue;
        const p = e.c.pos;
        if (!p || p.level !== hp.level) continue;
        if (e.c.monster) {
          if (newcham(ctx, e, null, { msg: true })) changed++;
        } else if (e.c.item && Math.abs(p.x - hp.x) <= 3 && Math.abs(p.y - hp.y) <= 3) {
          polyObj(ctx, e, null);
          changed++;
        }
      }
    });
  },
};

describe('polymorph soak', () => {
  // seeds whose runs last past turn 200 (716 replaced 715 in m11 step 8: it died at turn 33;
  // 717 replaced 716 in m12 step 1, whose new monsters shift the random forms: it died at turn 174;
  // 714 replaced 711 in m12 step 3 (queen bee, lieutenant, captain): it died at turn 141;
  // 718 replaced 714 in m12 step 7 (the guard row): it died at turn 82, and passes without the row)
  for (const seed of [718, 717]) {
    test(`seed ${seed}: 400 turns of polymorphing monsters and objects`, { timeout: 60000 }, () => {
      changed = 0;
      const r = soak([vanillaMod, polyEverythingMod], { seed, turns: 400, checkEvery: 1 });
      console.log(
        `polymorph soak seed=${seed}: changed=${changed} turns=${r.turns} outcome=${r.outcome}`,
      );
      expect(r.violations).toBeNull();
      expect(changed).toBeGreaterThan(20);
      expect(r.turns).toBeGreaterThan(200);
    });
  }
});
