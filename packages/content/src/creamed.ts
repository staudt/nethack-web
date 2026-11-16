// Cream on the hero's face (C's u.ucreamed): how many of her turns of blindness are the goop of
// a cream pie, which #wipe takes off and which keeps blinding venom and engulfers from her eyes.
// Kept as the turn it runs out (`modData.nh.ucreamedUntil`), as the property timeouts are, so it
// counts down by one each turn with no hook (ref: src/timeout.c nh_timeout() `u.ucreamed--`).
// Absent means a clean face. A leaf module (core only).
import type { GameState, Json } from '@nh/core';

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** u.ucreamed: the turns of goop left on her face (0: clean). */
export function ucreamed(state: Readonly<GameState>): number {
  const nh = state.modData['nh'];
  const until = isObj(nh) ? nh['ucreamedUntil'] : undefined;
  return typeof until === 'number' ? Math.max(0, until - state.turn) : 0;
}

/** Sets u.ucreamed to `n` turns (0 cleans her face). */
export function setUcreamed(state: GameState, n: number): void {
  let nh = state.modData['nh'];
  if (!isObj(nh)) {
    if (n <= 0) return;
    nh = {};
    state.modData['nh'] = nh;
  }
  if (n <= 0) delete nh['ucreamedUntil'];
  else nh['ucreamedUntil'] = state.turn + n;
}

/** u.ucreamed += n */
export const addUcreamed = (state: GameState, n: number): void =>
  setUcreamed(state, ucreamed(state) + n);
