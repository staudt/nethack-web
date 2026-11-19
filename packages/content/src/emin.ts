// A minion's god (EMIN): the Angels, a god's summoned servants and roaming priests. A minion is
// an ordinary monster with an entry in `modData.nh.emin` (keyed by entity id): `isminion` is
// "has an entry", and forgetMonster() drops it when the monster dies.
// ref: include/mextra.h struct emin; include/monst.h is_lminion(); src/minion.c newemin()
import type { Ctx, EntityId, GameState, Json } from '@nh/core';
import { A_LAWFUL, A_NONE, type Aligntyp } from './aligntyp';

/** ref: include/mextra.h struct emin */
export interface Emin {
  minAlign: Aligntyp;
  /** Hostile to a hero of its god, or peaceful to one of another. */
  renegade: boolean;
  /**
   * The malign fixed at birth when set_malign() is not called again (summon_minion(): "player
   * was naughty"); absent, it is computed from the minion's god and present peacefulness.
   */
  malign?: number;
}

type Table = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Table =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

function table(state: Readonly<GameState>, create: boolean): Table | null {
  const md = state.modData as Table;
  let nh = md['nh'];
  if (!isObj(nh)) {
    if (!create) return null;
    nh = {};
    md['nh'] = nh;
  }
  let t = nh['emin'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    nh['emin'] = t;
  }
  return t;
}

/** The minion's god, or null for any other monster (ref: EMIN(mon) with mon->isminion). */
export function emin(state: Readonly<GameState>, id: EntityId): Emin | null {
  const e = table(state, false)?.[String(id)];
  return isObj(e) ? (e as unknown as Emin) : null;
}

/** Makes monster `id` a minion of `e.minAlign`. ref: src/minion.c newemin(), `isminion = 1` */
export function setEmin(ctx: Pick<Ctx, 'state'>, id: EntityId, e: Emin): void {
  const t = table(ctx.state, true);
  if (t) t[String(id)] = { ...e } as unknown as Json;
}

/** It is no minion any more. ref: src/minion.c free_emin(), `isminion = 0` */
export function clearEmin(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const t = table(ctx.state, false);
  if (t) delete t[String(id)];
}

/** ref: include/monst.h `mtmp->isminion` */
export const isMinion = (state: Readonly<GameState>, id: EntityId): boolean =>
  emin(state, id) !== null;

/**
 * A minion kind (M2_MINION) whose god is lawful: its emin's when it has one, else its kind's
 * alignment (a priest's shrine's is not asked here: no aligned cleric is a minion kind).
 * ref: include/monst.h is_lminion() (is_minion(data) && mon_aligntyp(mon) == A_LAWFUL)
 */
export function isLminion(
  state: Readonly<GameState>,
  id: EntityId,
  def: { flags: readonly string[]; alignment: number },
): boolean {
  if (!def.flags.includes('minion')) return false;
  const e = emin(state, id);
  const a = e ? e.minAlign : def.alignment;
  return a !== A_NONE && a >= A_LAWFUL;
}
