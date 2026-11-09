// The soak bot among long worms: every few turns a long worm (with its rn2(5)-segment tail) is
// made near the hero while fewer than three live on her level, so the invariants (every tail
// segment belongs to a living worm on its level, linked both ways) are checked while worms crawl,
// grow, shrink, get cut in two, teleport, follow her down stairs and die.
import { WORM_TAIL, makemon, vanillaMod } from '@nh/content';
import { cellRules, getLevel, getPlayer, sortedIds, type Mod, type Pos } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

let made = 0;
let maxTail = 0;
const wormsMod: Mod = {
  id: 'testkit-worms',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // a sturdy hero, so the run outlives the worms
    api.on(
      'newGame',
      (ctx) => {
        const h = getPlayer(ctx.state);
        if (h.c.hp) h.c.hp = { cur: 3000, max: 3000 };
      },
      { priority: -100 },
    );
    api.on('endOfTurn', (ctx) => {
      if (ctx.state.turn % 5 !== 0 || ctx.state.gameOver) return;
      const hp = getPlayer(ctx.state).c.pos;
      if (!hp) return;
      let worms = 0;
      let tail = 0;
      for (const id of sortedIds(ctx.state)) {
        const e = ctx.state.entities[String(id)];
        if (e?.c.pos?.level !== hp.level) continue;
        if (e.def === 'nh:long_worm') worms++;
        if (e.def === WORM_TAIL) tail++;
      }
      maxTail = Math.max(maxTail, tail);
      if (worms >= 3) return;
      // a free floor square two or three steps from her
      const level = getLevel(ctx.state, hp.level);
      const rules = cellRules(level, ctx.defs);
      let near: Pos | null = null;
      for (const [dx, dy] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
        [3, 1],
        [-3, -1],
        [1, 3],
        [-1, -3],
      ]) {
        const x = hp.x + (dx ?? 0);
        const y = hp.y + (dy ?? 0);
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        if (!rules.passable[level.cells[y * level.width + x] ?? 0]) continue;
        near = { x, y };
        break;
      }
      if (!near) return;
      if (makemon(ctx, ctx.defs.monster('nh:long_worm'), near, { adjacentOk: true }) !== null)
        made++;
    });
  },
};

describe('long worm soak', () => {
  for (const seed of [21, 22]) {
    test(`seed ${seed}: 300 turns among long worms`, { timeout: 60000 }, () => {
      made = 0;
      maxTail = 0;
      const r = soak([vanillaMod, wormsMod], { seed, turns: 300, checkEvery: 1 });
      console.log(
        `worm soak seed=${seed}: made=${made} maxTail=${maxTail} kills=${r.kills} turns=${r.turns} outcome=${r.outcome}`,
      );
      expect(r.violations).toBeNull();
      expect(made).toBeGreaterThan(3);
      expect(maxTail).toBeGreaterThan(3);
    });
  }
});
