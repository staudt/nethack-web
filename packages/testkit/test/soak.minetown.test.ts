import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { soak, specialStartMod } from '../src/index';

// The hero starts on Minetown's up stairs (specialStartMod) and the bot plays there among the
// Watch, the temple and the shops, with every invariant (stairs reachable, the special level
// matching the layout and a town) checked as it goes, on the vanilla size and a bigger map. An
// experience level 1 hero among Minetown's hostile dwarves often dies early; a run that ends is
// still checked to its last step.
describe('soak in Minetown', () => {
  for (const [seed, width, height] of [
    [1, 80, 21],
    [2, 80, 21],
    [7, 80, 21],
    [8, 80, 21],
    [3, 120, 40],
    [4, 120, 40],
  ] as const) {
    test(
      `seed ${seed}: 1000 turns from Minetown at ${width}x${height}`,
      { timeout: 120000 },
      () => {
        const r = soak([vanillaMod, specialStartMod], {
          seed,
          turns: 1000,
          width,
          height,
          checkEvery: 5,
        });
        console.log(
          `soak minetown seed=${seed}: outcome=${r.outcome} turns=${r.turns} special=${r.specialLevels.join(',')} dungeons=${JSON.stringify(r.dungeons)}`,
        );
        expect(r.violations).toBeNull();
        expect(r.specialLevels).toContain('nh:minetown');
      },
    );
  }
});
