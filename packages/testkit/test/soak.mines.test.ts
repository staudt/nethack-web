import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { branchStartMod, soak } from '../src/index';

// The hero starts on the Mines staircase (branchStartMod); the bot takes branch stairs down 1
// time in 2, so every run enters the Mines and wanders there, with the stairs and branch
// invariants checked as it goes.
describe('soak in the Mines', () => {
  const deepest: number[] = [];
  // seeds re-picked when the game stream changes; 136 joined them in m24 step 3 (the quest
  // dungeon's draws at new game: of 1, 77 and 120..190 only 136, 141, 142, 146, 157, 178 and 187
  // go below the top level with them, none of those without them, where 120 still does); 120 replaced 105 in m22 step 2 (the eight kit
  // object rows: of 1, 77, 105, 116, 120, 128 and 130..138 only 120 (Mines level 3) and 133 and
  // 135 go below the top level with them, and 120 and 135 do without them); 105 replaced 97 in m21 step 5 (the Fort
  // Ludios portal's `rn2(3)` in every vault: of 98..129 only 105, 116, 120 and 128 go below the
  // top level, with and without it; 97 stays on it now); 97 replaced 32 in m21 step 1 (the Rogue level's
  // and Fort Ludios's layout draws: of 1, 32 and 77..98 only 86 and 97 go below the top level with
  // them, 77 without them, so the pair covers both); 77 replaced 71 in m19 step 2 (gnomes made with
  // the Mines' level carry a candle 1 time in 20: with that roll never succeeding 71 still
  // reaches level 3; with it, of 71..100 only 77, 94, 95 and 96 go below the top level); 71
  // replaced 26 in m19 step 1 (the 17 new object
  // rows moved the stream: of 1, 26 and 32..70 only 53 goes below the top level with them; 71
  // reaches Mines level 3 with the rows, 32 level 2 without them, so the pair covers both); 26 replaced 23 in m18 step 2 (the vampire rows
  // moved the stream: a dwarf dug the wall corner beside a Minetown door before the level's first
  // door check); 32 goes down to Mines level 2 (m16 step 4: the
  // turn's engraving scuff roll; seeds 2..31 stay on the top level now; 25 did before, since m12
  // step 6: the vault roll; 3 did before, since m12 step 5: the
  // sinks and altars of ordinary rooms; 44 did before, since m11 step 7: the new scrolls; seeds 2..43 stay on the top level now; 22 did before, since m11 step 6: the
  // new potions; 6 did before, since m11 step 5: the egg
  // and the bot's new "Sit" offer; 4 did before, since m11 step 4's gloves shuffle; 9 did before, since m11 step 1's new weapon rows shifted the weapon-class
  // picks; 5 did before, since m7f-d step 2's kicking
  // boots; 7 did before, since m7f-c step 2's new objects; 2 did before, since m7f-c step 1's room statue roll; 6 before, 11 before m7f-b step 2, 2 before
  // m7f-a step 3, 16 before m7f-a step 2, 5 before m7e step 6)
  for (const seed of [1, 77, 120, 136]) {
    test(`seed ${seed}: 2000 turns from the Mines staircase`, { timeout: 120000 }, () => {
      const r = soak([vanillaMod, branchStartMod], { seed, turns: 2000, checkEvery: 5 });
      console.log(
        `soak mines seed=${seed}: outcome=${r.outcome} turns=${r.turns} dungeons=${JSON.stringify(r.dungeons)}`,
      );
      expect(r.violations).toBeNull();
      expect(r.dungeons['nh:mines']).toBeGreaterThanOrEqual(1);
      deepest.push(r.dungeons['nh:mines'] ?? 0);
    });
  }
  test('some run went below the Mines top level', () => {
    expect(Math.max(...deepest)).toBeGreaterThanOrEqual(2);
  });
});
