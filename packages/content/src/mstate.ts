// Monster paralysis and stun. ref: include/monst.h mcanmove/mfrozen, mstun; src/mon.c
// m_calcdistress() (the mfrozen countdown), src/monmove.c dochug() (un-stunning)
//
// MonsterComponent is core's, so the content mod keeps them in `modData.nh`:
// `mfrozen: { [monsterId]: turns }` exists while the monster cannot move (mcanmove = 0), and
// `mstun: { [monsterId]: true }` while it is stunned.
import { sortedIds, type Ctx, type EntityId, type Json, type ModApi } from '@nh/core';

type Table = { [k: string]: Json };

const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(ctx: Pick<Ctx, 'state'>, key: 'mfrozen' | 'mstun', create: boolean): Table | null {
  const md = ctx.state.modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root[key];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root[key] = t;
  }
  return t;
}

/** `!mtmp->mcanmove`: paralyzed or asleep for a number of turns. */
export function isFrozen(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return typeof table(ctx, 'mfrozen', false)?.[String(id)] === 'number';
}

/** `mtmp->mfrozen` (0 when it can move) */
export function frozenTime(ctx: Pick<Ctx, 'state'>, id: EntityId): number {
  const v = table(ctx, 'mfrozen', false)?.[String(id)];
  return typeof v === 'number' ? v : 0;
}

/** ref: src/mhitm.c paralyze_monst(): mcanmove = 0, mfrozen = min(amt, 127) */
export function paralyzeMonst(ctx: Pick<Ctx, 'state'>, id: EntityId, amt: number): void {
  const t = table(ctx, 'mfrozen', true);
  if (t && amt > 0) t[String(id)] = Math.min(amt, 127);
}

/** `mtmp->mstun` */
export function isMStunned(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return table(ctx, 'mstun', false)?.[String(id)] === true;
}

export function setMStunned(ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void {
  if (on) {
    const t = table(ctx, 'mstun', true);
    if (t) t[String(id)] = true;
  } else {
    const t = table(ctx, 'mstun', false);
    if (t) delete t[String(id)];
  }
}

/** Forgets the states of a monster that died or left. */
export function forgetMState(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  for (const k of ['mfrozen', 'mstun'] as const) {
    const t = table(ctx, k, false);
    if (t) delete t[String(id)];
  }
}

/**
 * The paralysis timers count down once a turn (ref: m_calcdistress(): `if (mtmp->mfrozen &&
 * !--mtmp->mfrozen) mtmp->mcanmove = 1;`); entries of monsters that no longer exist go.
 */
export function registerMState(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    const t = table(ctx, 'mfrozen', false);
    if (t) {
      for (const id of sortedIds(ctx.state)) {
        const v = t[String(id)];
        if (typeof v !== 'number') continue;
        if (v - 1 <= 0) delete t[String(id)];
        else t[String(id)] = v - 1;
      }
    }
    for (const k of ['mfrozen', 'mstun'] as const) {
      const tt = table(ctx, k, false);
      if (!tt) continue;
      for (const key of Object.keys(tt).sort())
        if (!ctx.state.entities[key]?.c.monster) delete tt[key];
    }
  });
}
