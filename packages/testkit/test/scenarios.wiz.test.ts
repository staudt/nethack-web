// Wizard mode scenarios: level teleport into the Mines and back, through the offered action and
// its two menus, replayed as plain PlayerActions.
import { WIZ_LEVELPORT, vanillaMod, wizardMod } from '@nh/content';
import {
  createEngine,
  getLevel,
  getPlayer,
  isPlainFloor,
  stateHash,
  type DefId,
  type GameState,
  type Json,
  type PlayerAction,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const engine = createEngine([vanillaMod, wizardMod]);

/** Takes the offered self action, then answers each menu with the option whose value matches. */
function levelport(state: GameState, log: PlayerAction[], dungeon: DefId, dlevel: number): void {
  const offer = engine
    .query(state)
    .actionsFor({ kind: 'self' })
    .find((o) => o.action.type === 'mod' && o.action.action === WIZ_LEVELPORT);
  if (!offer) throw new Error('wiz:levelport is not offered');
  const act = (a: PlayerAction): void => {
    log.push(a);
    engine.step(state, a);
  };
  act(offer.action);
  for (const want of [dungeon, dlevel] as Json[]) {
    const p = state.pendingPrompt?.prompt;
    const opt = p?.options?.find((o) => o.value === want);
    if (!p || !opt) throw new Error(`no option ${JSON.stringify(want)}`);
    act({ type: 'answer', promptId: p.id, value: opt.value });
  }
}

const onFloor = (state: GameState): boolean => {
  const p = getPlayer(state).c.pos;
  return !!p && isPlainFloor(engine.registry, getLevel(state), p.x, p.y);
};

describe('wizard level teleport', () => {
  test('into the Mines bottom and back to DL1, replayed to the same state', () => {
    const { state } = engine.newGame({ seed: 11 });
    const log: PlayerAction[] = [];
    const mines = state.dungeons.find((d) => d.id === 'nh:mines');
    const bottom = mines?.levels ?? 0;
    expect(bottom).toBeGreaterThan(1);
    const turn = state.turn;

    levelport(state, log, 'nh:mines', bottom);
    expect([getLevel(state).dungeon, getLevel(state).dlevel]).toEqual(['nh:mines', bottom]);
    expect(onFloor(state)).toBe(true);
    expect(checkInvariants(state, engine.registry)).toEqual([]);

    levelport(state, log, 'nh:main', 1);
    expect([getLevel(state).dungeon, getLevel(state).dlevel]).toEqual(['nh:main', 1]);
    expect(onFloor(state)).toBe(true);
    expect(checkInvariants(state, engine.registry)).toEqual([]);
    expect(state.turn).toBe(turn);

    const again = engine.newGame({ seed: 11 }).state;
    for (const a of JSON.parse(JSON.stringify(log)) as PlayerAction[]) engine.step(again, a);
    expect(stateHash(again)).toBe(stateHash(state));
  });
});
