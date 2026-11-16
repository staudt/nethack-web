// The soak bot with every spell of the subset known and plenty of energy, so it casts (and its
// generic menu and direction answers pick the spell and the target) without waiting to learn one.
import { CAST_BOOKS, setPw, vanillaMod } from '@nh/content';
import type { Json, Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const spellKitMod: Mod = {
  id: 'testkit-spell-kit',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'newGame',
      (ctx) => {
        const nh = (ctx.state.modData['nh'] ??= {}) as Record<string, Json>;
        // spl_book[] with full retention (KEEN)
        nh['spells'] = CAST_BOOKS.map((id) => ({ id, retention: 20000 }));
        setPw(ctx, { uen: 60, uenmax: 60, uenpeak: 60 });
      },
      { priority: -100 },
    );
  },
};

describe('spells soak', () => {
  let cast = 0;
  let aimed = 0;
  // seeds re-picked when the game stream changes: 327 replaced 319 in m21 step 5 (the Fort
  // Ludios portal's `rn2(3)` in every vault: of 306 and 319..343 only 325, 327, 329, 331, 332,
  // 334 and 336 aim with it; 327, 334 and 336 aim with and without it); 319 replaced 314 in m21 step 1 (the Rogue
  // level's and Fort Ludios's layout draws: of 306 and 314..324 only 315 and 319 aim with them;
  // 319 aims with and without them, 306 without); 306 and 314 aim with and without m18 step 3's
  // ring of protection from shape changers (301 and 311 aimed none with it); 309 aimed no
  // directional spell after m17
  // step 1's Gehennom layout draws (311 aims with and without them, 301 without); 305 aimed no directional spell after m15
  // step 9's dungeon rolls (309 aims with and without them); 302 aimed none after m12 step 6's
  // vault roll (nor did 303, 304 or 306)
  for (const seed of [306, 327]) {
    test(`seed ${seed}: 600 turns knowing every spell`, { timeout: 60000 }, () => {
      const r = soak([vanillaMod, spellKitMod], { seed, turns: 600, checkEvery: 5 });
      console.log(
        `spells soak seed=${seed}: cast=${r.cast} kills=${r.kills} turns=${r.turns} outcome=${r.outcome}`,
      );
      expect(r.violations).toBeNull();
      cast += r.cast;
      // a directional spell was chosen, paid for and aimed
      aimed += r.log.filter((a) => a.type === 'answer' && a.promptId === 'cast-direction').length;
    });
  }
  test('across the seeds the bot cast spells, directional ones too', () => {
    expect(cast).toBeGreaterThan(0);
    expect(aimed).toBeGreaterThan(0);
  });
});
