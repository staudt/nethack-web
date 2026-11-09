// Derived hero/monster numbers from carried items: AC, gold, encumbrance and movement.
import {
  NORMAL_SPEED,
  inventoryOf,
  type Ctx,
  type EntityId,
  type GameState,
  type ModApi,
  type Registry,
} from '@nh/core';
import { weight } from './items';
import { armBonus } from './material';
import { P, hasProp } from './props';
import { MZ_HUMAN, WT_HUMAN, msize, strongmonst } from './mondata';
import { flying, levitating } from './trapstate';
import { uState } from './luck';
import { uspellOf } from './uenergy';
import { heroForm } from './upoly';

/** ref: include/you.h AC_MAX */
const AC_MAX = 99;
/** The hero's base AC in her own form: the human race monster. ref: src/do_wear.c find_ac() */
const HUMAN_AC = 10;

const clampAc = (ac: number): number => Math.max(-AC_MAX, Math.min(AC_MAX, ac));

/**
 * Armor class of an entity from its worn armor. ref: src/do_wear.c find_ac() (hero) and
 * src/worn.c find_mac() (monsters). ARM_BONUS = armor ac bonus + spe - erosion (capped at the ac bonus); the hero's
 * divine protection (`u.ublessed` with intrinsic Protection), the hero's rings of protection
 * and her spell protection (`u.uspellprot`) count. Not ported: amulet of guarding.
 */
export function findAc(state: Readonly<GameState>, defs: Registry, id: EntityId): number {
  const e = state.entities[String(id)];
  if (!e) return HUMAN_AC;
  // ref: find_ac(): `uac = mons[u.umonnum].ac`, the base armor class of her current form
  let ac =
    id === state.playerId
      ? (heroForm({ state, defs })?.ac ?? HUMAN_AC)
      : defs.isMonster(e.def)
        ? defs.monster(e.def).ac
        : HUMAN_AC;
  for (const o of inventoryOf(state, id)) {
    const it = o.c.item;
    if (!it || it.equipped === null || it.equipped === 'weapon') continue;
    const odef = defs.object(o.def);
    if (odef.armor) ac -= armBonus(odef, o);
  }
  // ref: find_ac(): rings of protection subtract their enchantment
  if (id === state.playerId) {
    for (const o of inventoryOf(state, id)) {
      const slot = o.c.item?.equipped;
      if ((slot === 'ringL' || slot === 'ringR') && o.def === 'nh:ring_of_protection')
        ac -= o.c.item?.spe ?? 0;
    }
  }
  // ref: find_ac(): `if (HProtection & INTRINSIC) uac -= u.ublessed;`
  if (id === state.playerId && e.c.props?.['protection']?.intrinsic) ac -= uState(state).ublessed;
  // ref: find_ac(): `uac -= u.uspellprot;`
  if (id === state.playerId) ac -= uspellOf(state).uspellprot;
  return clampAc(ac);
}

/** ref: src/worn.c find_mac() */
export function findMac(state: Readonly<GameState>, defs: Registry, monsterId: EntityId): number {
  return findAc(state, defs, monsterId);
}

/** Gold the entity carries. ref: src/hack.c money_cnt() */
export function moneyCount(state: Readonly<GameState>, defs: Registry, id: EntityId): number {
  let n = 0;
  for (const o of inventoryOf(state, id)) {
    if (defs.object(o.def).class === 'coin') n += o.c.item?.quantity ?? 0;
  }
  return n;
}

/** ref: include/hack.h enum encumbrance_types */
export const UNENCUMBERED = 0;
export const OVERLOADED = 5;
export const ENCUMBRANCE_NAMES = [
  null,
  'burdened',
  'stressed',
  'strained',
  'overtaxed',
  'overloaded',
] as const;

/** ref: include/weight.h */
const WT_WEIGHTCAP_STRCON = 25;
const WT_WEIGHTCAP_SPARE = 50;
const MAX_CARR_CAP = 1000;
/** ref: include/weight.h WT_WOUNDEDLEG_REDUCT */
const WT_WOUNDEDLEG_REDUCT = 100;

/** Strength as a 3..25 value: 18/xx and above are folded. ref: src/attrib.c acurrstr() */
export function acurrstr(str: number): number {
  if (str <= 18) return Math.max(str, 3);
  if (str <= 121) return 19 + Math.trunc(str / 50);
  return Math.min(str, 125) - 100;
}

/**
 * Carrying capacity: 25 * (Str + Con) + 50, at most 1000. A polymorphed hero carries as her form
 * does (as can_carry()): a nymph the most, a form without a corpse weight by its size, a weak or
 * heavy form by its weight against a human's; floating she carries the most; wounded legs lower
 * it unless she flies. ref: src/hack.c weight_cap() (no steeds, no air level)
 */
export function weightCap(state: Readonly<GameState>, defs: Registry, id: EntityId): number {
  if (id === state.playerId && levitating({ state })) return MAX_CARR_CAP;
  const a = state.entities[String(id)]?.c.attributes;
  let carrcap =
    WT_WEIGHTCAP_STRCON * (acurrstr(a?.str ?? 10) + (a?.con ?? 10)) + WT_WEIGHTCAP_SPARE;
  const form = id === state.playerId ? heroForm({ state, defs }) : null;
  if (form) {
    // consistent with can_carry() in mon.c
    if (form.glyph.ch === 'n') carrcap = MAX_CARR_CAP;
    else if (!form.weight) carrcap = Math.trunc((carrcap * msize(form)) / MZ_HUMAN);
    else if (!strongmonst(form) || form.weight > WT_HUMAN)
      carrcap = Math.trunc((carrcap * form.weight) / WT_HUMAN);
  }
  let cap = Math.min(carrcap, MAX_CARR_CAP);
  // wounded legs reduce the capacity (WT_WOUNDEDLEG_REDUCT per leg; only the right leg is ever
  // wounded here), unless she flies
  if (
    hasProp(state.entities[String(id)], P.WOUNDED_LEGS) &&
    !(id === state.playerId && flying({ state }))
  )
    cap -= WT_WOUNDEDLEG_REDUCT;
  return Math.max(cap, 1);
}

/** Weight carried minus capacity (negative when below). ref: src/hack.c inv_weight() */
export function invWeight(state: Readonly<GameState>, defs: Registry, id: EntityId): number {
  let wt = 0;
  for (const o of inventoryOf(state, id)) {
    const it = o.c.item;
    if (!it) continue;
    // gold is (quan + 50) / 100 without weight()'s minimum of 1
    wt +=
      defs.object(o.def).class === 'coin'
        ? Math.trunc((it.quantity + 50) / 100)
        : weight(defs, o, state);
  }
  return wt - weightCap(state, defs, id);
}

/**
 * 0 when unencumbered, else 1..5 (Burdened .. Overloaded). ref: src/hack.c calc_capacity() /
 * near_capacity(); `xtra` is extra weight about to be picked up.
 */
export function calcCapacity(
  state: Readonly<GameState>,
  defs: Registry,
  id: EntityId,
  xtra = 0,
): number {
  const wt = invWeight(state, defs, id) + xtra;
  if (wt <= 0) return UNENCUMBERED;
  const wc = weightCap(state, defs, id);
  if (wc <= 1) return OVERLOADED;
  return Math.min(Math.trunc((wt * 2) / wc) + 1, OVERLOADED);
}

/** ref: src/hack.c near_capacity() */
export const nearCapacity = (state: Readonly<GameState>, defs: Registry, id: EntityId): number =>
  calcCapacity(state, defs, id, 0);

/**
 * Movement the hero gains per turn. ref: src/allmain.c u_calc_moveamt(): the base speed (her
 * form's while polymorphed), a free
 * action on 2 turns in 3 when Very_fast (a timed Fast) or on 1 turn in 3 when intrinsically Fast
 * (the Valkyrie at experience level 7, ref: src/attrib.c val_abil { 7, HFast }), then reduced by
 * encumbrance.
 */
export function heroMovement(ctx: Ctx, hero: EntityId): number {
  const e = ctx.state.entities[String(hero)];
  // youmonst.data->mmove: a polymorphed hero moves at her form's speed (0 for a mold: turns pass
  // until the form ends)
  const form = hero === ctx.state.playerId ? heroForm(ctx) : null;
  let moveamt = form ? form.speed : (e?.c.actor?.speed ?? 12);
  const fast = e?.c.props?.[P.FAST];
  if (fast && fast.timeout > 0) {
    // Very_fast: gain a free action on 2/3 of turns
    if (ctx.rng.rn2(3) !== 0) moveamt += NORMAL_SPEED;
  } else if (fast?.intrinsic) {
    // Fast (intrinsic): gain a free action on 1/3 of turns
    if (ctx.rng.rn2(3) === 0) moveamt += NORMAL_SPEED;
  }
  switch (nearCapacity(ctx.state, ctx.defs, hero)) {
    case 1:
      moveamt -= Math.trunc(moveamt / 4);
      break;
    case 2:
      moveamt -= Math.trunc(moveamt / 2);
      break;
    case 3:
      moveamt -= Math.trunc((moveamt * 3) / 4);
      break;
    case 4:
      moveamt -= Math.trunc((moveamt * 7) / 8);
      break;
    default:
      break;
  }
  return Math.max(moveamt, 0);
}

/** Registers the AC, gold and encumbrance status fields. ref: src/botl.c */
export function registerStats(api: ModApi): void {
  api.defineStatus({
    id: 'nh:ac',
    field: 'ac',
    value(state, defs) {
      const hero = state.entities[String(state.playerId)];
      if (!hero) return null;
      return findAc(state, defs, hero.id);
    },
  });
  api.defineStatus({
    id: 'nh:gold',
    field: 'gold',
    value: (state, defs) => moneyCount(state, defs, state.playerId),
  });
  api.defineStatus({
    id: 'nh:encumbrance',
    field: 'encumbrance',
    value(state, defs) {
      const hero = state.entities[String(state.playerId)];
      if (!hero?.c.attributes) return null;
      return ENCUMBRANCE_NAMES[nearCapacity(state, defs, hero.id)] ?? null;
    },
  });
}
