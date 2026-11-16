import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { randomActions } from './helpers/actions';
import { recordGame, runReplay } from '../src/index';

describe('replay', () => {
  // A seed whose hero survives this random walk (the walk doesn't fight back or answer prompts,
  // such as the one for stepping onto a seen trap) with and without m16 step 6's graffiti roll;
  // 5 before m16 step 6 (it met a seen trap), 3 before m15 step 9 (it met a seen trap), 2 before
  // m12 step 6 (its hero died), 1 before m11 step 8 (it met a seen trap).
  const opts = { seed: 4, width: 80, height: 21 };
  const actions = randomActions(300, 7);

  test('record then replay gives the same hash', () => {
    const rec = recordGame([vanillaMod], opts, actions);
    const out = runReplay([vanillaMod], rec);
    expect(out.hash).toBe(rec.hash);
    expect(rec.actions).toHaveLength(300);
    expect(out.state.turn).toBeGreaterThan(1);
  });

  test('the replay records the character and replays it (m22 step 8)', () => {
    const character = { role: 'nh:role_samurai', race: 'nh:race_human' } as const;
    const rec = recordGame([vanillaMod], { ...opts, character }, actions.slice(0, 60));
    expect(rec.character).toEqual({ ...character, gender: 'male', align: 1 });
    const out = runReplay([vanillaMod], rec);
    expect(out.hash).toBe(rec.hash);
    expect(out.state.entities[String(out.state.playerId)]?.def).toBe('nh:role_samurai');
    // the default character replays to another game
    const def = recordGame([vanillaMod], opts, actions.slice(0, 60));
    expect(def.character.role).toBe('nh:role_valkyrie');
    expect(def.hash).not.toBe(rec.hash);
  });

  test('changing an action changes the hash', () => {
    const rec = recordGame([vanillaMod], opts, actions);
    // Random walks can converge on the same corner, so compare a mid-game prefix for a swap
    // and the full game for an extra turn-consuming action.
    const prefix = { ...rec, actions: rec.actions.slice(0, 20) };
    const swapped = { ...prefix, actions: prefix.actions.map((a) => ({ ...a })) };
    swapped.actions[11] = { type: 'wait' }; // original is a northward move
    expect(runReplay([vanillaMod], swapped).hash).not.toBe(runReplay([vanillaMod], prefix).hash);

    const extra = { ...rec, actions: [...rec.actions] };
    extra.actions.splice(150, 0, { type: 'wait' });
    expect(runReplay([vanillaMod], extra).hash).not.toBe(rec.hash);
  });

  test('mod mismatch throws', () => {
    const rec = recordGame([vanillaMod], opts, []);
    rec.mods = [{ id: 'nh', version: '9.9.9' }];
    expect(() => runReplay([vanillaMod], rec)).toThrow(/mod mismatch/);
    rec.mods = [];
    expect(() => runReplay([vanillaMod], rec)).toThrow(/mod mismatch/);
  });
});
