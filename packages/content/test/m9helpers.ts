// Shared setup for the m9 attack tests: a lit room, a hero with lots of HP and no worn armor,
// monsters with their real level and lots of HP, and a Ctx that records events.
import {
  getPlayer,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, plainKit } from './itemHelpers';

export const ROOM = [
  '..........',
  '..........',
  '..@.......',
  '..........',
  '..........',
  '..........',
];

export type FullCtx = Ctx & { events: GameEvent[] };

/** A Ctx with everything the attack functions touch, over a state. */
export function fullCtx(state: GameState): FullCtx {
  return Object.assign(ctxFor(state), {
    interrupt() {},
    endGame(over: NonNullable<GameState['gameOver']>) {
      state.gameOver = over;
    },
    goToLevel() {},
  }) as unknown as FullCtx;
}

export const keys = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

/** The hero (at 2,2) with a plain kit and lots of HP, no worn armor; a fresh ctx. */
export function room(seed = 1, rows: string[] = ROOM) {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const o of inventoryOf(s.state, s.state.playerId))
    if (o.c.item?.equipped && o.c.item.equipped !== 'weapon') o.c.item.equipped = null;
  s.hero.c.hp = { cur: 5000, max: 5000 };
  s.step({ type: 'wait' }); // see the room
  return { ...s, ctx: fullCtx(s.state) };
}

/** A monster of `id` at (x, y) with its real level and lots of HP. */
export function mon(state: GameState, id: string, x = 3, y = 2): Entity {
  const e = state.entities[String(addMon(state, id, x, y))]!;
  e.c.monster!.level = defs.monster(id as DefId).level;
  e.c.hp = { cur: 1000, max: 1000 };
  return e;
}

export const atk = (at: AttackDef['at'], ad: string, n = 1, d = 4): AttackDef => ({
  at,
  ad,
  n,
  d,
});

export const alive = (state: GameState, id: number): boolean =>
  state.entities[String(id)]?.c.monster !== undefined;

export const heroHp = (state: GameState): number => getPlayer(state).c.hp?.cur ?? 0;
