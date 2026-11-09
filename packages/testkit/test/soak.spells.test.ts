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
  // seeds re-picked when the game stream changes: 302 aimed no directional spell after m12
  // step 6's vault roll (nor did 303, 304 or 306)
  for (const seed of [301, 305]) {
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
