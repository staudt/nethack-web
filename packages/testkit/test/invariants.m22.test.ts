// m22 step 10: the character invariants (the starting role, race, gender and alignment go
// together; no skill above its maximum), shown to catch a broken state.
import { vanillaMod } from '@nh/content';
import { createEngine, type DefId, type Json } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const engine = createEngine([vanillaMod]);
const character = {
  role: 'nh:role_samurai' as DefId,
  race: 'nh:race_human' as DefId,
  gender: 'male' as const,
  align: 1 as const,
};

describe('m22 invariants', () => {
  test('a character her role does not allow is reported', () => {
    const { state } = engine.newGame({ seed: 3, character });
    expect(checkInvariants(state, engine.registry)).toEqual([]);
    const pc = state.entities[String(state.playerId)]!.c.player!;
    pc.race = 'nh:race_elf' as DefId;
    expect(checkInvariants(state, engine.registry).join('\n')).toMatch(
      /hero: character nh:role_samurai nh:race_elf male 1 is not allowed by her role/,
    );
    pc.race = 'nh:race_human' as DefId;
    pc.align = -1;
    expect(checkInvariants(state, engine.registry).join('\n')).toMatch(/is not allowed/);
  });

  test('a skill above its maximum is reported, a restricted one at Unskilled too', () => {
    const { state } = engine.newGame({ seed: 3, character });
    const nh = state.modData['nh'] as Record<string, Json>;
    const skills = nh['skills'] as Record<string, number>;
    const max = nh['skillMax'] as Record<string, number>;
    // the Samurai's long sword starts Basic with an Expert maximum
    expect(skills['long_sword']).toBe(2);
    expect(max['long_sword']).toBe(4);
    skills['long_sword'] = 5;
    expect(checkInvariants(state, engine.registry).join('\n')).toMatch(
      /skill long_sword: level 5 above its maximum 4/,
    );
    skills['long_sword'] = 2;
    // a skill the Samurai's table leaves out is restricted (maximum 0)
    expect(max['unicorn_horn']).toBeUndefined();
    skills['unicorn_horn'] = 1;
    expect(checkInvariants(state, engine.registry).join('\n')).toMatch(
      /skill unicorn_horn: level 1 above its maximum 0/,
    );
  });
});
