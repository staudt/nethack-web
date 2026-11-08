// Monster paralysis, stun, confusion, speed and the spellcasting delay. ref: include/monst.h
// mcanmove/mfrozen, mstun, mconf, mspec_used; src/mon.c m_calcdistress() (the mfrozen countdown),
// src/monmove.c dochug() (un-stunning and unconfusing), mon_regen() (the mspec_used countdown);
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
// C's `!mcansee && !mblinded`).
import {
  cellIndex,
  getPlayer,
  isVisible,
  sortedIds,
  type Ctx,
  type Entity,
  type EntityId,
  type Json,
  type ModApi,
} from '@nh/core';
import { monNam } from './perception';
import { thiefdead } from './nomul';

type Table = { [k: string]: Json };

const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

type Key = 'mfrozen' | 'mstun' | 'mconf' | 'mspeed' | 'mspecUsed' | 'mcan' | 'mblinded';

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

/** ref: canseemon(): the monster's square is in view (there is no invisibility here) */
function canseemon(ctx: Pick<Ctx, 'state'>, mon: Entity): boolean {
  const p = mon.c.pos;
  if (!p || p.level !== ctx.state.currentLevel) return false;
  const level = ctx.state.levels[p.level];
  return level !== undefined && isVisible(ctx.state, cellIndex(level, p.x, p.y));
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
];

/** Forgets the states of a monster that died or left. */
export function forgetMState(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  thiefdead(ctx, id); // ref: src/mon.c m_detach(): `if (mtmp->m_id == gs.stealmid) thiefdead()`
  for (const k of KEYS) {
    const t = table(ctx, k, false);
    if (t) delete t[String(id)];
  }
}

/**
 * The spellcasting delays and the paralysis timers count down once a turn (ref: m_calcdistress():
 * mon_regen()'s `if (mon->mspec_used) mon->mspec_used--;`, then `if (mtmp->mblinded &&
 * !--mtmp->mblinded) mtmp->mcansee = 1;` and `if (mtmp->mfrozen && !--mtmp->mfrozen)
 * mtmp->mcanmove = 1;`); entries of monsters that no longer exist go.
 */
export function registerMState(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
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
