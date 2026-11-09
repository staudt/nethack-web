// What a mimic is pretending to be (C's `mtmp->m_ap_type`, `mtmp->mappearance` and the
// MCORPSENM of a corpse, statue, egg or altar shape) and the legend key the hero is shown for
// it. A leaf over core so that perception.ts (the `nh:mimicry` perception), the attack, search,
// kick, door and movement paths, and mimic.ts (set_mimic_sym(), which needs mkobj) share it.
// The disguise lives in `modData.nh.mappear: { [monsterId]: MAppear }` and goes with the
// monster (mstate.ts KEYS: forgetMState()); a clone never starts disguised.
// generation.ts and hide.ts call set_mimic_sym() through the late binding here (mimic.ts sits
// above mkobj.ts, which imports generation.ts).
// ref: include/monst.h m_ap_type, mappearance; src/mon.c seemimic(); src/display.c
// display_monster() (the M_AP_* cases)
import type {
  AppearanceDef,
  Ctx,
  DefId,
  Entity,
  EntityId,
  GameState,
  Json,
  Registry,
} from '@nh/core';
import { STATUE, statueAppearanceId } from './statuestate';

/**
 * A disguise: an object type (M_AP_OBJECT; `corpseOf` is the shape of a corpse, statue, figurine,
 * egg or tin, MCORPSENM), a piece of furniture (M_AP_FURNITURE: a terrain def such as a closed
 * door, stairs, an altar of an alignment, or the display-only grave), or a monster (M_AP_MONSTER).
 */
export type MAppear =
  | { type: 'object'; id: DefId; corpseOf?: DefId }
  | { type: 'furniture'; id: DefId }
  | { type: 'monster'; id: DefId };

/** ref: include/objects.h STRANGE_OBJECT: shown as `]` (a mimic's "strange object") */
export const STRANGE_OBJECT: DefId = 'nh:strange_object';
/** ref: include/defsym.h S_grave: shown only (no grave terrain exists here) */
export const GRAVE: DefId = 'nh:grave';

/**
 * The display-only legend keys of disguises the port has no def for: the strange object
 * (ILLOBJ_CLASS `]`, CLR_BLACK drawn dark gray as objects.ts does) and the grave (`|`,
 * CLR_WHITE). Class 'rock' keeps them out of the shuffled description pools.
 * ref: include/objects.h OBJECT(OBJ("strange object", ...)); include/defsym.h S_grave
 */
export const MIMIC_APPEARANCES: readonly AppearanceDef[] = [
  { id: STRANGE_OBJECT, nameKey: STRANGE_OBJECT, class: 'rock', glyph: { ch: ']', fg: '#555555' } },
  { id: GRAVE, nameKey: GRAVE, class: 'rock', glyph: { ch: '|', fg: '#ffffff' } },
];

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(state: Readonly<GameState>, create: boolean): Table | null {
  const md = (state as GameState).modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root['mappear'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root['mappear'] = t;
  }
  return t;
}

const isMAppear = (v: unknown): v is MAppear =>
  isObj(v) &&
  (v['type'] === 'object' || v['type'] === 'furniture' || v['type'] === 'monster') &&
  typeof v['id'] === 'string';

/** The monster's disguise, or null (M_AP_NOTHING). */
export function mappearance(ctx: Pick<Ctx, 'state'>, id: EntityId): MAppear | null {
  const v = table(ctx.state, false)?.[String(id)];
  return isMAppear(v) ? v : null;
}

/** Sets (or with null clears) the monster's disguise. */
export function setMappearance(ctx: Pick<Ctx, 'state'>, id: EntityId, ap: MAppear | null): void {
  if (ap) {
    const t = table(ctx.state, true);
    if (t) t[String(id)] = { ...ap } as Json;
  } else {
    const t = table(ctx.state, false);
    if (t) delete t[String(id)];
  }
}

/** `M_AP_TYPE(mtmp)`: 'object', 'furniture', 'monster' or null. */
export const mApType = (ctx: Pick<Ctx, 'state'>, id: EntityId): MAppear['type'] | null =>
  mappearance(ctx, id)?.type ?? null;

/** `M_AP_TYPE(mtmp) == M_AP_FURNITURE || M_AP_TYPE(mtmp) == M_AP_OBJECT` */
export function apAsThing(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  const t = mApType(ctx, id);
  return t === 'object' || t === 'furniture';
}

/** ref: include/display.h is_door_mappear(): posing as a closed door */
export const isDoorMappear = (ctx: Pick<Ctx, 'state'>, id: EntityId): boolean => {
  const ap = mappearance(ctx, id);
  return ap?.type === 'furniture' && ap.id === 'nh:door_closed';
};

/**
 * The mimic stops pretending: M_AP_NOTHING. Its square is redrawn with the next vision update
 * (newsym()). ref: src/mon.c seemimic() (disguises block no light here: DEVIATIONS.md "Mimics")
 */
export function seemimic(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  setMappearance(ctx, id, null);
}

/**
 * The legend key a disguise is drawn as, or null without one: an object's shown id (its
 * description while unidentified; a statue as the statue of its monster, C's statue glyphs), the
 * strange object, a furniture's terrain def or the grave, a monster's def. Sensing the mimic and
 * hallucination are the perception's (perception.ts). ref: src/display.c display_monster()
 */
export function mimicShownAs(state: Readonly<GameState>, defs: Registry, e: Entity): DefId | null {
  const v = table(state, false)?.[String(e.id)];
  if (!isMAppear(v)) return null;
  if (v.type !== 'object') return v.id;
  if (v.id === STATUE && v.corpseOf !== undefined) {
    const id = statueAppearanceId(v.corpseOf);
    if (defs.isAppearance(id)) return id;
  }
  return state.appearances[v.id] ?? v.id;
}

type SetMimicSym = (ctx: Ctx, id: EntityId, inMklev: boolean) => void;
let setMimicSymImpl: SetMimicSym | null = null;

/** mimic.ts registers set_mimic_sym() (it sits above mkobj.ts and generation.ts). */
export function registerSetMimicSym(fn: SetMimicSym): void {
  setMimicSymImpl = fn;
}

/**
 * Picks the mimic's disguise for where it stands. `inMklev` is gi.in_mklev (the throwaway
 * object of a class disguise is made as during level creation). ref: src/makemon.c
 * set_mimic_sym()
 */
export function setMimicSym(ctx: Ctx, id: EntityId, inMklev = false): void {
  if (!setMimicSymImpl) throw new Error('setMimicSym: mimic.ts has not registered set_mimic_sym()');
  setMimicSymImpl(ctx, id, inMklev);
}
