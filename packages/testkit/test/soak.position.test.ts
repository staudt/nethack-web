// The soak bot answers position prompts: a test mod offers a self action that asks for a cell
// (with valid cells on odd turns, without on even ones), and the bot answers each one with a
// valid cell, else a cell she sees, else a cancel; the engine refuses any other answer.
import { askPosition, positionAnswer, vanillaMod } from '@nh/content';
import { NORMAL_SPEED, getPlayer, type Json, type Mod, type Pos } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const ASK = 'tkpos:ask';
/** What the answers were, counted by the test mod. */
const seen = { valid: 0, other: 0, none: 0 };

const positionMod: Mod = {
  id: 'tkpos',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.defineAction({
      id: ASK,
      labelKey: ASK,
      handles: 'mod',
      offer: (_ctx, target) =>
        target.kind === 'self' ? [{ action: { type: 'mod', action: ASK }, labelKey: ASK }] : [],
      perform(ctx) {
        const p = getPlayer(ctx.state).c.pos;
        const valid: Pos[] =
          p && ctx.state.turn % 2 === 1
            ? [
                { x: p.x + 1, y: p.y },
                { x: p.x, y: p.y },
              ]
            : [];
        askPosition(ctx, ASK, ASK, { valid: valid as unknown as Json }, { id: ASK, valid });
        return 0;
      },
      answer(ctx, value, data) {
        const cc = positionAnswer(value);
        const valid = (data as unknown as { valid: Pos[] }).valid;
        if (!cc) seen.none++;
        else if (valid.some((v) => v.x === cc.x && v.y === cc.y)) seen.valid++;
        else {
          if (valid.length > 0) throw new Error('answered outside the valid cells');
          seen.other++;
        }
        return NORMAL_SPEED;
      },
    });
  },
};

describe('position prompts in the soak', () => {
  test('the bot answers them with valid cells, else cells she sees', { timeout: 60000 }, () => {
    const r = soak([vanillaMod, positionMod], { seed: 41, turns: 400, checkEvery: 10 });
    expect(r.violations).toBeNull();
    expect(r.positionAnswers).toBeGreaterThan(0);
    const asked = r.log.filter((a) => a.type === 'answer' && a.promptId === ASK);
    expect(asked.length).toBe(r.positionAnswers);
    // both kinds were asked and answered with a cell: a valid one, or one she sees
    expect(seen.valid).toBeGreaterThan(0);
    expect(seen.other).toBeGreaterThan(0);
    expect(seen.valid + seen.other + seen.none).toBe(asked.length);
  });
});
