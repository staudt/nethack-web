// m8 step 6: #quit. "Really quit without saving?", then the game ends as 'quit' through the same
// disclosure as a death, with no "Die?" in wizard mode.
import { buildSnapshot, createEngine, type GameEvent, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod, wizardMod } from '../src/index';
import { addMon, setup } from './helpers';

const QUIT = { type: 'mod', action: 'nh:quit' } as const;
const lists = (ev: GameEvent[]) =>
  ev.filter((e): e is Extract<GameEvent, { type: 'list' }> => e.type === 'list');
const statusOf = (engine: ReturnType<typeof createEngine>, state: GameState) =>
  buildSnapshot(engine.registry, state).status;

describe('#quit', () => {
  test('offered on herself, last', () => {
    const { engine, state } = setup(['@..']);
    const offers = engine.query(state).actionsFor({ kind: 'self' });
    expect(offers.at(-1)?.action).toEqual(QUIT);
  });

  test('no: the game goes on and no time passes', () => {
    const { engine, state } = setup(['@..']);
    const jackal = addMon(state, 'nh:jackal', 2, 0, { energy: 12 });
    const r = engine.step(state, QUIT);
    expect(r.prompt).toMatchObject({ id: 'quit-confirm', kind: 'yn', key: 'end.quit_confirm' });
    const turn = state.turn;
    engine.step(state, { type: 'answer', promptId: 'quit-confirm', value: false });
    expect(state.gameOver).toBeNull();
    expect(state.turn).toBe(turn);
    expect(state.entities[String(jackal)]?.c.pos).toMatchObject({ x: 2, y: 0 });
  });

  test('yes: the game ends as quit, with the disclosure lists and no killer', () => {
    const engine = createEngine([vanillaMod]);
    const { state } = engine.newGame({ seed: 3 });
    engine.step(state, QUIT);
    const ev = engine.step(state, {
      type: 'answer',
      promptId: 'quit-confirm',
      value: true,
    }).events;
    expect(state.gameOver).toMatchObject({ kind: 'quit', killer: 'quit', depth: 1 });
    expect(lists(ev).map((l) => l.ask)).toEqual(['end.ask.inventory', 'end.ask.attributes']);
    const status = statusOf(engine, state);
    expect(status['dead']).toBe('quit');
    expect(status['endHow']).toBe('quit');
  });

  test('wizard mode does not ask "Die?" for a quit', () => {
    const engine = createEngine([vanillaMod, wizardMod]);
    const { state } = engine.newGame({ seed: 3 });
    engine.step(state, QUIT);
    const r = engine.step(state, { type: 'answer', promptId: 'quit-confirm', value: true });
    expect(r.prompt).toBeNull();
    expect(state.gameOver).toMatchObject({ kind: 'quit' });
  });
});
