import { vanillaMod } from '@nh/content';
import {
  ALIGNMENTS,
  GENDERS,
  characterChoices,
  createEngine,
  createRng,
  inventoryOf,
  okAlign,
  okGend,
  seedRng,
  type Character,
} from '@nh/core';
import { expect, test } from 'vitest';
import { checkInvariants, soak } from '../../src/index';

// Soak seeds are spread over several test files so vitest can run them on parallel workers.

/** One 2000-turn 80x21 soak test per seed. */
export function seedSoaks(seeds: readonly number[]): void {
  for (const seed of seeds) {
    test(`seed ${seed}: 2000 turns at 80x21`, { timeout: 120000 }, () => {
      const r = soak([vanillaMod], { seed, turns: 2000, width: 80, height: 21, checkEvery: 10 });
      console.log(
        `soak 80x21 seed=${seed}: outcome=${r.outcome} actions=${r.actions} turns=${r.turns} ` +
          `deepest=${r.deepestLevel} kills=${r.kills} explored=${r.cellsExplored}`,
      );
      expect(r.violations).toBeNull();
      // The bot never quits (#quit is filtered out of its offers).
      expect(r.outcome).not.toBe('quit');
      // Death is an outcome, not a failure.
      if (r.outcome === 'playing') expect(r.turns).toBeGreaterThanOrEqual(2000);
    });
  }
}

/** One 2000-turn item soak per seed, then a check that the bot used items across them. */
export function itemSoaks(seeds: readonly number[]): void {
  const totals = { pickedUp: 0, eaten: 0, quaffed: 0, read: 0, thrown: 0, kills: 0 };
  for (const seed of seeds) {
    test(`seed ${seed}: 2000 turns with item invariants`, { timeout: 60000 }, () => {
      const r = soak([vanillaMod], { seed, turns: 2000, checkEvery: 5 });
      expect(r.violations).toBeNull();
      totals.pickedUp += r.pickedUp;
      totals.eaten += r.eaten;
      totals.quaffed += r.quaffed;
      totals.read += r.read;
      totals.thrown += r.thrown;
      totals.kills += r.kills;
    });
  }
  test('across the seeds the bot picked up, ate and threw things', () => {
    expect(totals.pickedUp).toBeGreaterThan(0);
    expect(totals.eaten).toBeGreaterThan(0);
    expect(totals.thrown).toBeGreaterThan(0);
  });
}

const rolesEngine = createEngine([vanillaMod]);

/**
 * Every role (menu order, C's roles[]) with each race it allows, 28 pairs, numbered from seed
 * 2201 in that order; each pair's gender and alignment are drawn from what it allows with an
 * RNG seeded by its game seed.
 */
export function roleRaceCharacters(): { c: Character; seed: number }[] {
  const choices = characterChoices(rolesEngine.registry);
  const out: { c: Character; seed: number }[] = [];
  let seed = 2200;
  for (const role of choices.roles)
    for (const race of role.races) {
      seed++;
      const rng = createRng(seedRng(seed));
      const pair = { role: role.id, race };
      const genders = GENDERS.filter((gender) => okGend(choices, { ...pair, gender }));
      const aligns = ALIGNMENTS.filter((align) => okAlign(choices, { ...pair, align }));
      const gender = genders[rng.rn2(genders.length)];
      const align = aligns[rng.rn2(aligns.length)];
      if (gender === undefined || align === undefined) throw new Error(`no character ${seed}`);
      out.push({ c: { ...pair, gender, align }, seed });
    }
  return out;
}

const describeCharacter = (c: Character): string =>
  `${['chaotic', 'neutral', 'lawful'][c.align + 1]} ${c.gender} ` +
  `${c.race.replace('nh:race_', '')} ${c.role.replace('nh:role_', '')}`;

/**
 * One soak per character of `roleRaceCharacters()` whose role is in `roles` (role keys): the new
 * game is that character with a kit and no broken invariant, then `turns` turns of the bot with
 * the invariants (the character's checks among them) every 5 actions. Death is an outcome.
 */
export function roleSoaks(roles: readonly string[], turns: number): void {
  for (const { c, seed } of roleRaceCharacters()) {
    if (!roles.includes(c.role.replace('nh:role_', ''))) continue;
    test(`seed ${seed}: ${describeCharacter(c)}, ${turns} turns`, { timeout: 120000 }, () => {
      const { state } = rolesEngine.newGame({ seed, character: c });
      expect(state.entities[String(state.playerId)]?.c.player).toEqual(c);
      expect(inventoryOf(state, state.playerId).length).toBeGreaterThan(0);
      expect(checkInvariants(state, rolesEngine.registry)).toEqual([]);
      const r = soak([vanillaMod], { seed, character: c, turns, checkEvery: 5 });
      console.log(
        `soak ${describeCharacter(c)} seed=${seed}: outcome=${r.outcome} turns=${r.turns} ` +
          `deepest=${r.deepestLevel} kills=${r.kills} cast=${r.cast}`,
      );
      expect(r.violations).toBeNull();
      expect(r.outcome).not.toBe('quit');
      if (r.outcome === 'playing') expect(r.turns).toBeGreaterThanOrEqual(turns);
    });
  }
}
