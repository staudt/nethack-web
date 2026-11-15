import { P, setIntrinsic, vanillaMod } from '@nh/content';
import { getPlayer, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const GEHENNOM = 'nh:gehennom';

/**
 * A game mod for this soak: at new game the hero goes to the up stairs of Gehennom's first
 * ordinary level (hellfill.lua's: lava caves, mazes of bars or lava, cold mazes, caverns, with
 * prefabs), fire resistant and levitating so she can wander over its lava, sturdy enough to meet
 * its monsters for a while.
 */
const gehennomStartMod: Mod = {
  id: 'testkit-gehennom-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const d = ctx.state.dungeons.find((x) => x.id === GEHENNOM);
        if (!d) return;
        const taken = new Set(d.special.map((s) => s.dlevel));
        let dlevel = 2;
        while (taken.has(dlevel)) dlevel++;
        ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'up');
        const hero = getPlayer(ctx.state);
        setIntrinsic(hero, P.FIRE_RES, true);
        setIntrinsic(hero, P.LEVITATION, true);
        hero.c.hp = { cur: 400, max: 400 };
      },
      { priority: -100 },
    );
  },
};

// The hero starts on an ordinary Gehennom level (gehennomStartMod) and the bot plays there, with
// every invariant checked as it goes.
describe('soak in Gehennom', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    test(`seed ${seed}: 300 turns on a hellfill level`, { timeout: 120000 }, () => {
      const r = soak([vanillaMod, gehennomStartMod], { seed, turns: 300, checkEvery: 5 });
      console.log(
        `soak gehennom seed=${seed}: outcome=${r.outcome} turns=${r.turns} dungeons=${JSON.stringify(r.dungeons)}`,
      );
      expect(r.violations).toBeNull();
      expect(r.dungeons[GEHENNOM]).toBeGreaterThanOrEqual(2);
    });
  }
});
