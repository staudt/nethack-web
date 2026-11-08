import { readFileSync } from 'node:fs';
import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { recordGame, runReplay, soak, soakKitMod } from '../src/index';

interface Golden {
  seed: number;
  botSeed: number;
  turns: number;
  actions: number;
  hash: string;
}

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'),
) as Golden;

const CHANGED_MESSAGE =
  'Golden replay changed. If this change in game behavior is intended, update packages/testkit/test/fixtures/golden.json in the same commit and explain why in the commit message.';

/** The kit mod gives the bot a bow, arrows and darts, so the pinned run fires and throws. */
// The bot seed is picked so the run lasts the full `turns` (golden.json has no comments): bot
// seed 7 died at turn 76 after m7f-c step 1, praying twice too soon (C's angrygods() with
// ugangr 2 and Luck -6 has maxanger 12, so 1 in 4 is god_zaps_you(): faithful); bot seed 13
// died at turn 254 after m7f-c step 2 from a tainted kitten corpse. Bot seed 4 plays all 400
// turns (on dungeon level 1 since m7f-d step 1; level 2 before). Re-pick it the same way if a
// stream shift ends the run early again.
const MODS = [vanillaMod, soakKitMod];

describe('golden replay', () => {
  test('a soak run reproduces the pinned action count and final hash', { timeout: 60000 }, () => {
    const soaked = soak(MODS, {
      seed: golden.seed,
      turns: golden.turns,
      botSeed: golden.botSeed,
      checkEvery: 50,
    });
    expect(soaked.violations).toBeNull();

    const recorded = recordGame(MODS, { seed: golden.seed, width: 80, height: 21 }, soaked.log);
    expect(soaked.actions, CHANGED_MESSAGE).toBe(golden.actions);
    expect(recorded.hash, CHANGED_MESSAGE).toBe(golden.hash);
    expect(soaked.finalHash, CHANGED_MESSAGE).toBe(golden.hash);

    const replayed = runReplay(MODS, recorded);
    expect(replayed.hash, CHANGED_MESSAGE).toBe(golden.hash);
  });
});
