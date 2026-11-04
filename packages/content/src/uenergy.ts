// The hero's spell energy (Pw): u.uen, u.uenmax and u.uenpeak, kept in `modData.nh.pw`.
// ref: include/you.h struct you uen, uenmax, uenpeak; src/u_init.c u_init()
//
// A leaf module (core only): hero.ts writes it at newGame and level gain, regenerates it each turn,
// and the corpse buzz (givit.ts) and casting read and change it.
import type { Ctx, GameState, Json } from '@nh/core';

/** u.uen (current), u.uenmax (maximum), u.uenpeak (highest maximum ever). */
export interface Pw {
  uen: number;
  uenmax: number;
  uenpeak: number;
}

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The hero's energy; all 0 before newGame wrote it. */
export function pwOf(state: Readonly<GameState>): Pw {
  const nh = state.modData['nh'];
  const pw = isObj(nh) ? nh['pw'] : undefined;
  if (!isObj(pw)) return { uen: 0, uenmax: 0, uenpeak: 0 };
  const num = (k: keyof Pw): number => {
    const v = pw[k];
    return typeof v === 'number' ? v : 0;
  };
  return { uen: num('uen'), uenmax: num('uenmax'), uenpeak: num('uenpeak') };
}

/** Changes the hero's energy fields. */
export function setPw(ctx: Pick<Ctx, 'state'>, patch: Partial<Pw>): void {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (!isObj(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  const next: Pw = { ...pwOf(ctx.state), ...patch };
  nh['pw'] = { uen: next.uen, uenmax: next.uenmax, uenpeak: next.uenpeak };
}
