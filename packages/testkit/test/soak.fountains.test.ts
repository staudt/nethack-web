import { T, vanillaMod } from '@nh/content';
import { getLevel, getPlayer, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

/**
 * A game mod for this soak: on the first level the floor squares around the hero's start become
 * fountains, so the bot meets #quaff and #dip at fountains within a few moves.
 */
const fountainStartMod: Mod = {
  id: 'testkit-fountain-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const level = getLevel(ctx.state);
        const p = getPlayer(ctx.state).c.pos;
        if (!p) return;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = p.x + dx;
            const y = p.y + dy;
            if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
            const i = y * level.width + x;
            if (level.palette[level.cells[i] ?? -1] !== T.floor) continue;
            let pi = level.palette.indexOf(T.fountain);
            if (pi === -1) pi = level.palette.push(T.fountain) - 1;
            level.cells[i] = pi;
          }
      },
      { priority: -100 },
    );
  },
};

// Short runs (m7c step 4): the bot drinks from and dips into the fountains around its start,
// with the fountain-state invariant checked as it goes.
describe('soak at fountains', () => {
  // seeds whose bot uses a fountain within the 300 turns (re-picked in m7b step 2, m7f-a step 3,
  // m7f-b step 2, m11 steps 3, 4, 5 and 6: new objects shifted the object pools and shuffles,
  // and step 5's "Sit" offer the bot's random picks; 3 before m11 step 6, 2 before m11 step 5, 4
  // before m11 step 4, 3 before m11 step 3, 4 before m7f-b step 2, 1 before)
  for (const seed of [1, 2]) {
    test(`seed ${seed}: 300 turns among fountains`, { timeout: 60000 }, () => {
      const r = soak([vanillaMod, fountainStartMod], { seed, turns: 300, checkEvery: 1 });
      console.log(
        `soak fountains seed=${seed}: outcome=${r.outcome} turns=${r.turns} fountain=${r.fountain}`,
      );
      expect(r.violations).toBeNull();
      expect(r.fountain).toBeGreaterThan(0);
    });
  }
});
