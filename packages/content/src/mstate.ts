// Monster paralysis, stun, confusion, speed and the spellcasting delay. ref: include/monst.h
// mcanmove/mfrozen, mstun, mconf, mspec_used; src/mon.c m_calcdistress() (the mfrozen countdown),
// src/monmove.c dochug() (un-stunning and unconfusing), mon_regen() (HP and the mspec_used
// countdown);
// src/worn.c mon_adjust_speed(); src/wizard.c aggravate()
//
// MonsterComponent is core's, so the content mod keeps them in `modData.nh`:
// `mfrozen: { [monsterId]: turns }` exists while the monster cannot move (mcanmove = 0), and
// `mstun: { [monsterId]: true }` while it is stunned, `mconf: { [monsterId]: true }` while it is
// confused, `mspeed: { [monsterId]: 'slow' | 'fast' }`
// while its speed is adjusted (permspeed MSLOW/MFAST; no speed boots, so mspeed = permspeed),
// `mspecUsed: { [monsterId]: turns }` while it cannot cast (or use another special ability),
// `mcan: { [monsterId]: true }` once it is cancelled (ref: zap.c cancel_monst(); never undone),
// `mblinded: { [monsterId]: turns }` while it cannot see (mcansee = 0; 0 turns is permanent,
// C's `!mcansee && !mblinded`), `minvis` (invis.ts), `mux: { [monsterId]: [x, y] }` (mux/muy, kept
// by apparxy.ts setApparxy() while the monster cannot see the hero).
import {
  getPlayer,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type Json,
  type ModApi,
} from '@nh/core';
import { canseemon } from './invis';
import { monNam } from './perception';
import { thiefdead } from './nomul';

type Table = { [k: string]: Json };

const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

type Key =
  | 'mfrozen'
  | 'mstun'
  | 'mconf'
  | 'mspeed'
  | 'mspecUsed'
  | 'mcan'
  | 'mblinded'
  | 'minvis'
  | 'mux'
  | 'mundetected'
  | 'mappear';

function table(ctx: Pick<Ctx, 'state'>, key: Key, create: boolean): Table | null {
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

/** `mtmp->mfrozen = 0; mtmp->mcanmove = 1;` */
export function unfreezeMonst(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const t = table(ctx, 'mfrozen', false);
  if (t) delete t[String(id)];
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

/** `mtmp->mux, mtmp->muy` as kept between moves, or null. */
export function storedMux(ctx: Pick<Ctx, 'state'>, id: EntityId): { x: number; y: number } | null {
  const v = table(ctx, 'mux', false)?.[String(id)];
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? { x: v[0], y: v[1] }
    : null;
}

export function setStoredMux(
  ctx: Pick<Ctx, 'state'>,
  id: EntityId,
  p: { x: number; y: number } | null,
): void {
  if (p) {
    const t = table(ctx, 'mux', true);
    if (t) t[String(id)] = [p.x, p.y];
  } else {
    const t = table(ctx, 'mux', false);
    if (t) delete t[String(id)];
  }
}

/** `mtmp->mconf` */
export function isMConfused(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return table(ctx, 'mconf', false)?.[String(id)] === true;
}

export function setMConfused(ctx: Pick<Ctx, 'state'>, id: EntityId, on: boolean): void {
  if (on) {
    const t = table(ctx, 'mconf', true);
    if (t) t[String(id)] = true;
  } else {
    const t = table(ctx, 'mconf', false);
    if (t) delete t[String(id)];
  }
}

/** A monster's speed adjustment (mspeed): MSLOW, MFAST or normal (null). */
export type MSpeed = 'slow' | 'fast' | null;

export function mspeed(ctx: Pick<Ctx, 'state'>, id: EntityId): MSpeed {
  const v = table(ctx, 'mspeed', false)?.[String(id)];
  return v === 'slow' || v === 'fast' ? v : null;
}

export function setMspeed(ctx: Pick<Ctx, 'state'>, id: EntityId, v: MSpeed): void {
  if (v) {
    const t = table(ctx, 'mspeed', true);
    if (t) t[String(id)] = v;
  } else {
    const t = table(ctx, 'mspeed', false);
    if (t) delete t[String(id)];
  }
}

/**
 * ref: src/worn.c mon_adjust_speed() for +1 / -1: MSLOW and MFAST cancel each other; the change
 * is told when seen, and `seen` runs then (a wand's learnwand()). -3 is petrification: intrinsic
 * speed is taken away (normal speed is not reduced) and "<mon> is slowing down." is told.
 */
export function monAdjustSpeed(
  ctx: Ctx,
  mon: Entity,
  adjust: 1 | -1 | -3,
  seen: () => void = () => undefined,
): void {
  const old = mspeed(ctx, mon.id);
  const petrify = adjust === -3;
  const now = petrify
    ? old === 'fast'
      ? null
      : old
    : adjust > 0
      ? old === 'slow'
        ? null
        : 'fast'
      : old === 'fast'
        ? null
        : 'slow';
  setMspeed(ctx, mon.id, now);
  const def = ctx.defs.monster(mon.def);
  if (petrify) {
    if (def.speed > 0 && !isFrozen(ctx, mon.id) && !mon.c.monster?.asleep && canseemon(ctx, mon))
      ctx.emit({ type: 'msg', key: 'stone.mon_slowing', params: { mon: monNam(ctx, mon) } });
    return;
  }
  if (
    now !== old &&
    def.speed > 0 &&
    !isFrozen(ctx, mon.id) &&
    !mon.c.monster?.asleep &&
    canseemon(ctx, mon)
  ) {
    // fast to slow (skipping the intermediate state) or vice versa
    const much = old !== null && now !== null ? { key: 'zap.much' } : '';
    ctx.emit({
      type: 'msg',
      key: adjust > 0 || now === 'fast' ? 'zap.mon_faster' : 'zap.mon_slower',
      params: { mon: monNam(ctx, mon), much },
    });
    seen();
  }
}

/** `mtmp->mspec_used`: turns before it can cast a spell again (0 when it can). */
export function mspecUsed(ctx: Pick<Ctx, 'state'>, id: EntityId): number {
  const v = table(ctx, 'mspecUsed', false)?.[String(id)];
  return typeof v === 'number' ? v : 0;
}

export function setMspecUsed(ctx: Pick<Ctx, 'state'>, id: EntityId, n: number): void {
  if (n > 0) {
    const t = table(ctx, 'mspecUsed', true);
    if (t) t[String(id)] = n;
  } else {
    const t = table(ctx, 'mspecUsed', false);
    if (t) delete t[String(id)];
  }
}

/** `mtmp->mcan`: the monster has been cancelled (no special attacks, spells or passives). */
export function isCancelled(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return table(ctx, 'mcan', false)?.[String(id)] === true;
}

/** `mtmp->mcan = 1` */
export function setCancelled(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const t = table(ctx, 'mcan', true);
  if (t) t[String(id)] = true;
}

/** `mtmp->mcansee`: the monster can see (it is not blinded). */
export function mcansee(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return typeof table(ctx, 'mblinded', false)?.[String(id)] !== 'number';
}

/** `mtmp->mblinded`: turns of blindness left (0 when it can see, or when blind for good). */
export function mblinded(ctx: Pick<Ctx, 'state'>, id: EntityId): number {
  const v = table(ctx, 'mblinded', false)?.[String(id)];
  return typeof v === 'number' ? v : 0;
}

/**
 * `mcansee = 0, mblinded = turns` (at most 127, C's 7-bit field); 0 turns blinds it for good.
 * ref: src/uhitm.c mhitm_ad_blnd()
 */
export function setMblinded(ctx: Pick<Ctx, 'state'>, id: EntityId, turns: number): void {
  const t = table(ctx, 'mblinded', true);
  if (t) t[String(id)] = Math.max(0, Math.min(turns, 127));
}

/** `mcansee = 1, mblinded = 0` */
export function unblindMonst(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const t = table(ctx, 'mblinded', false);
  if (t) delete t[String(id)];
}

/**
 * Wakes the monsters of the hero's level; a paralysed one moves again 1 time in 5. No Wizard's
 * Tower and no monster strategies here. ref: src/wizard.c aggravate()
 */
export function aggravate(ctx: Ctx): void {
  const level = getPlayer(ctx.state).c.pos?.level;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const m = e?.c.monster;
    if (!e || !m || e.c.pos?.level !== level) continue;
    m.asleep = false;
    if (isFrozen(ctx, id) && !ctx.rng.rn2(5)) unfreezeMonst(ctx, id);
  }
}

const KEYS: readonly Key[] = [
  'mfrozen',
  'mstun',
  'mconf',
  'mspeed',
  'mspecUsed',
  'mcan',
  'mblinded',
  'minvis', // invis.ts
  'mux', // apparxy.ts
  'mundetected', // hidestate.ts
  'mappear', // mimicstate.ts
];

/** Forgets the states of a monster that died or left. */
/** clone_mon()'s `*m2 = *mon`: the clone starts with the original's conditions. */
export function copyMState(ctx: Pick<Ctx, 'state'>, from: EntityId, to: EntityId): void {
  for (const k of KEYS) {
    if (k === 'mundetected') continue; // ref: src/makemon.c clone_mon(): `m2->mundetected = 0`
    if (k === 'mappear') continue; // only puddings are cloned, never a disguised mimic
    const t = table(ctx, k, false);
    const v = t?.[String(from)];
    if (t && v !== undefined) t[String(to)] = v;
  }
}

export function forgetMState(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  thiefdead(ctx, id); // ref: src/mon.c m_detach(): `if (mtmp->m_id == gs.stealmid) thiefdead()`
  for (const k of KEYS) {
    const t = table(ctx, k, false);
    if (t) delete t[String(id)];
  }
}

/** ref: include/mondata.h regenerates(): M1_REGEN */
const regenerates = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).flags.includes('regen');

/** ref: src/mon.c healmon(mon, amt, 0): HP go up by `amt`, never past the maximum */
function healmon(mon: Entity, amt: number): void {
  const hp = mon.c.hp;
  if (!hp || amt <= 0) return;
  hp.cur = Math.min(hp.cur + amt, hp.max);
}

/**
 * Monster hit point regeneration, once a turn for the monsters on the hero's level: 1 HP on the
 * turns divisible by 20, every turn for a regenerator (imps, quasits, vampire bats...). C's
 * `moves` is the turn that is ending (mcalcdistress() runs before `moves++`; this hook runs
 * after the port's turn counter went up). ref: src/monmove.c mon_regen() (its mspec_used
 * countdown is below; no meating digestion: `digest_meal` is FALSE here), called from
 * src/mon.c m_calcdistress() (no minliquid() check for immobile monsters)
 */
export function monRegen(ctx: Pick<Ctx, 'state' | 'defs'>, id: EntityId): void {
  const mon = ctx.state.entities[String(id)];
  if (!mon?.c.monster) return;
  if ((ctx.state.turn - 1) % 20 === 0 || regenerates(ctx, mon)) healmon(mon, 1);
}

/**
 * Hit points a monster left behind on another level regained meanwhile: `imv` turns, or
 * `imv / 20` for a non-regenerator. ref: src/dog.c mon_catchup_elapsed_time() "recover lost hit
 * points"
 */
export function catchUpRegen(ctx: Pick<Ctx, 'defs'>, mon: Entity, imv: number): void {
  healmon(mon, regenerates(ctx, mon) ? imv : Math.trunc(imv / 20));
}

/** were_change(): were.ts registers it at load (it sits far above this leaf) */
let wereChangeHook: ((ctx: Ctx, mon: Entity) => void) | null = null;
export function setWereChange(fn: (ctx: Ctx, mon: Entity) => void): void {
  wereChangeHook = fn;
}

/**
 * The spellcasting delays and the paralysis timers count down once a turn (ref: m_calcdistress():
 * mon_regen()'s `if (mon->mspec_used) mon->mspec_used--;`, then `if (mtmp->mblinded &&
 * !--mtmp->mblinded) mtmp->mcansee = 1;` and `if (mtmp->mfrozen && !--mtmp->mfrozen)
 * mtmp->mcanmove = 1;`); entries of monsters that no longer exist go.
 */
export function registerMState(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    for (const id of sortedIds(ctx.state)) {
      const e = ctx.state.entities[String(id)];
      if (!e?.c.monster || e.c.pos?.level !== ctx.state.currentLevel) continue;
      monRegen(ctx, id);
      // possibly polymorph lycanthropes (no shapechangers: decide_to_shapeshift() is 7f)
      wereChangeHook?.(ctx, e);
    }
    const su = table(ctx, 'mspecUsed', false);
    if (su) {
      for (const key of Object.keys(su).sort()) {
        const v = su[key];
        if (typeof v !== 'number' || v - 1 <= 0) delete su[key];
        else su[key] = v - 1;
      }
    }
    const bl = table(ctx, 'mblinded', false);
    if (bl) {
      for (const id of sortedIds(ctx.state)) {
        const v = bl[String(id)];
        if (typeof v !== 'number' || v === 0) continue; // 0: blind for good
        if (v - 1 <= 0) delete bl[String(id)];
        else bl[String(id)] = v - 1;
      }
    }
    const t = table(ctx, 'mfrozen', false);
    if (t) {
      for (const id of sortedIds(ctx.state)) {
        const v = t[String(id)];
        if (typeof v !== 'number') continue;
        if (v - 1 <= 0) delete t[String(id)];
        else t[String(id)] = v - 1;
      }
    }
    for (const k of KEYS) {
      const tt = table(ctx, k, false);
      if (!tt) continue;
      for (const key of Object.keys(tt).sort())
        if (!ctx.state.entities[key]?.c.monster) delete tt[key];
    }
  });
}
