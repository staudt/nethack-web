import { addToInventory, checkSpecialRoom, eshkOf, mkgold, mkshop, vanillaMod } from '@nh/content';
import { createEngine, getLevel, getPlayer, inRooms, sortedIds, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak, soakKitMod } from '../src/index';

/**
 * A game mod for this soak: the first level gets a random shop (mkshop() on its first ordinary
 * room that can be one, before the shops are stocked), and the hero starts inside it, on a
 * square with stock, with 2000 gold. The random bot walks into a one-door shop too rarely to
 * count on, and its seed would have to be re-searched each time the game's stream moves.
 * `started` tells whether it could: some first levels have no room mkshop() takes.
 */
const shopStart = { started: false };
const shopStartMod: Mod = {
  id: 'testkit-shop-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'newLevel',
      (ctx, level) => {
        if (level.depth === 1 && level.def === undefined) mkshop(ctx, level);
      },
      { priority: 100 },
    );
    // on the first placement (after the shopkeeper and the pet are made)
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        shopStart.started = false;
        const level = getLevel(ctx.state);
        const hero = getPlayer(ctx.state);
        const ids = sortedIds(ctx.state);
        const shk = ids
          .map((id) => eshkOf(ctx, id))
          .find((e) => e !== null && e.shoplevel === level.id);
        if (!shk) return;
        const at = (x: number, y: number, what: 'item' | 'monster'): boolean =>
          ids.some((id) => {
            const e = ctx.state.entities[String(id)];
            const p = e?.c.pos;
            return e?.c[what] !== undefined && p?.level === level.id && p.x === x && p.y === y;
          });
        const r = level.rooms[shk.shoproom];
        if (!r) return;
        for (let y = r.ly; y <= r.hy; y++)
          for (let x = r.lx; x <= r.hx; x++) {
            if (!inRooms(level, x, y).includes(shk.shoproom)) continue;
            if ((x === shk.shk.x && y === shk.shk.y) || at(x, y, 'monster') || !at(x, y, 'item'))
              continue;
            hero.c.pos = { level: level.id, x, y };
            addToInventory(ctx, hero.id, mkgold(ctx, 2000, hero.c.pos));
            checkSpecialRoom(ctx, false);
            shopStart.started = true;
            return;
          }
      },
      { priority: -100 },
    );
  },
};

const mods = [vanillaMod, soakKitMod, shopStartMod];

/** The first `n` seeds from 1 whose new game starts in a shop (level generation only: cheap). */
function shopSeeds(n: number): number[] {
  const engine = createEngine(mods);
  const out: number[] = [];
  for (let seed = 1; out.length < n && seed <= 100; seed++) {
    engine.newGame({ seed });
    if (shopStart.started) out.push(seed);
  }
  return out;
}

// Shopping (6b3): runs that start in a random shop on DL1 (shopStartMod; the seeds are picked
// when the test runs, so a change to the game's stream needs no re-search), pick up its goods
// and pay (`nh:pay`, 1 time in 2 while owing in a shop, at most once in 20 turns), with every
// invariant checked every third step: unpaid goods are hers (or on his floor) and on a bill, no
// charge goods lie in a shop.
describe('soak through a shop', () => {
  const seeds = shopSeeds(2);
  test('two seeds start in a shop', () => expect(seeds).toHaveLength(2));
  for (const seed of seeds) {
    test(`seed ${seed}: 3000 turns from a shop, buying and paying`, { timeout: 120000 }, () => {
      const r = soak(mods, { seed, turns: 3000, checkEvery: 3 });
      console.log(
        `soak shops seed=${seed}: outcome=${r.outcome} turns=${r.turns} deepest=${r.deepestLevel} paid=${r.paid}`,
      );
      expect(r.violations).toBeNull();
      expect(r.paid).toBeGreaterThan(0);
    });
  }
});
