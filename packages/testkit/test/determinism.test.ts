import { vanillaMod } from '@nh/content';
import { createEngine, createHost, stateHash, type FromCore, type ToCore } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { recordGame, runReplay, soak, soakKitMod } from '../src/index';
import { randomActions } from './helpers/actions';

const SEED = 20240609;
const W = 80;
const H = 21;
const allActions = randomActions(400, 99);
/** The random script may get the hero killed; only actions up to the game's end are applied. */
const actions = (() => {
  const engine = createEngine([vanillaMod]);
  const { state } = engine.newGame({ seed: SEED, width: W, height: H });
  let n = 0;
  while (n < allActions.length && !state.gameOver) engine.step(state, allActions[n++] as never);
  return allActions.slice(0, n);
})();

function directHash(): string {
  const engine = createEngine([vanillaMod]);
  const { state } = engine.newGame({ seed: SEED, width: W, height: H });
  for (const a of actions) engine.step(state, a);
  return stateHash(state);
}

/** A host behind a simulated worker boundary: every message is structuredClone'd both ways. */
function workerHost(): { send(m: ToCore): FromCore[] } {
  let out: FromCore[] = [];
  const host = createHost([vanillaMod], (m) => out.push(structuredClone(m)));
  return {
    send(m) {
      out = [];
      host.handle(structuredClone(m));
      return out;
    },
  };
}

function hashOf(h: ReturnType<typeof workerHost>): string {
  const r = h.send({ t: 'hash' });
  const m = r[0];
  if (m?.t !== 'hash') throw new Error(`expected hash, got ${JSON.stringify(m)}`);
  return m.hash;
}

describe('determinism', () => {
  test('same seed and actions: engine twice and via the worker message path', () => {
    const a = directHash();
    const b = directHash();
    const host = workerHost();
    host.send({ t: 'new', seed: SEED, width: W, height: H });
    for (const action of actions) {
      const r = host.send({ t: 'act', action });
      expect(r.some((m) => m.t === 'error')).toBe(false);
    }
    expect(a).toBe(b);
    expect(hashOf(host)).toBe(a);
  });

  test('save mid-way, load in a fresh host, continue: same final hash', () => {
    const expected = directHash();
    const host = workerHost();
    host.send({ t: 'new', seed: SEED, width: W, height: H });
    const half = Math.trunc(actions.length / 2);
    for (const action of actions.slice(0, half)) host.send({ t: 'act', action });
    const saved = host.send({ t: 'save' })[0];
    if (saved?.t !== 'saved') throw new Error('no save');
    const midHash = hashOf(host);

    const fresh = workerHost();
    const loaded = fresh.send({ t: 'load', save: saved.save });
    expect(loaded[0]?.t).toBe('view');
    expect(hashOf(fresh)).toBe(midHash);
    for (const action of actions.slice(half)) {
      expect(fresh.send({ t: 'act', action }).some((m) => m.t === 'error')).toBe(false);
    }
    expect(hashOf(fresh)).toBe(expected);
  });
});

describe('determinism of a soak with kicks, fires and text answers', () => {
  const MODS = [vanillaMod, soakKitMod];
  // a seed whose run kicks, fires and answers counts (re-picked when the game stream changes)
  // 20261041 before m11 step 5 and 20261039 before m11 step 3 (their runs stopped firing)
  const SOAK_SEED = 20261042;
  const run = soak(MODS, { seed: SOAK_SEED, turns: 400, botSeed: 7, width: W, height: H });

  test('the run exercised kicks, fires and count answers', () => {
    expect(run.violations).toBeNull();
    expect(run.kicks).toBeGreaterThan(0);
    expect(run.fired).toBeGreaterThan(0);
    expect(run.countAnswers).toBeGreaterThan(0);
    expect(run.log.some((a) => a.type === 'answer' && typeof a.value === 'string')).toBe(true);
  });

  test('replays to the same hash, direct and through the worker host', () => {
    const rec = recordGame(MODS, { seed: SOAK_SEED, width: W, height: H }, run.log);
    expect(rec.hash).toBe(run.finalHash);
    expect(runReplay(MODS, rec).hash).toBe(run.finalHash);

    let out: FromCore[] = [];
    const host = createHost(MODS, (m) => out.push(structuredClone(m)));
    const send = (m: ToCore): FromCore[] => {
      out = [];
      host.handle(structuredClone(m));
      return out;
    };
    send({ t: 'new', seed: SOAK_SEED, width: W, height: H });
    for (const action of run.log) {
      expect(send({ t: 'act', action }).some((m) => m.t === 'error')).toBe(false);
    }
    const h = send({ t: 'hash' })[0];
    expect(h?.t === 'hash' ? h.hash : null).toBe(run.finalHash);
  });
});
