// Monster item use, the leaf part that low modules can read: curing a monster's blindness, the
// monsters' memory of the hero's resistances (M_SEEN_*: which attack wands not to zap at her) and
// whether a monster has zapped an attack wand before (its first shot always misses).
// And whether a monster reflects (mon_reflects()). (Step 7 adds searches_for_item() here.)
// ref: src/muse.c mcureblindness(), mon_reflects(); src/mondata.c monstseesu(), monstunseesu();
// include/monst.h M_SEEN_*, m_seenres(), mwandexp
import {
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type EntityId,
  type Entity,
  type Msg,
} from '@nh/core';
import { mCanSeeU } from './apparxy';
import { uswallow } from './engulfstate';
import { hasWandExp, mcansee, seenResOf, setSeenRes, setWandExp, unblindMonst } from './mstate';
import { discover } from './o_init';
import { monNam } from './perception';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/mondata.h haseyes(): not M1_NOEYES */
const haseyes = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean =>
  !ctx.defs.monster(mon.def).flags.includes('noeyes');

/**
 * A blinded monster can see again: "The hill orc can see again." when `verbose` and it has eyes.
 * ref: src/muse.c mcureblindness()
 */
export function mcureblindness(ctx: Ctx, mon: Entity, verbose: boolean): void {
  if (mcansee(ctx, mon.id)) return;
  unblindMonst(ctx, mon.id);
  if (verbose && haseyes(ctx, mon)) say(ctx, 'muse.can_see_again', { mon: monNam(ctx, mon) });
}

/** The hero's resistances a monster may have seen. ref: include/monst.h M_SEEN_* */
export const M_SEEN = {
  magr: 0x1,
  fire: 0x2,
  cold: 0x4,
  sleep: 0x8,
  disint: 0x10,
  elec: 0x20,
  poison: 0x40,
  acid: 0x80,
  refl: 0x100,
} as const;

/** Whether the monster has seen the hero resist (any of) `bits`. ref: m_seenres() */
export const mSeenres = (ctx: Pick<Ctx, 'state'>, id: EntityId, bits: number): boolean =>
  (seenResOf(ctx, id) & bits) !== 0;

/**
 * Every monster of her level that could see her (m_canseeu(): its own blindness does not
 * matter) learns (`set`) or forgets that she resists `bits`; nothing while she is swallowed.
 */
function seesu(ctx: Pick<Ctx, 'state' | 'defs'>, bits: number, set: boolean): void {
  if (bits === 0 || uswallow(ctx)) return;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    if (!mon?.c.monster || !mCanSeeU(ctx, mon)) continue;
    const cur = seenResOf(ctx, id);
    setSeenRes(ctx, id, set ? cur | bits : cur & ~bits);
  }
}

/** Monsters in her line of sight see her resist `bits`. ref: src/mondata.c monstseesu() */
export const monstseesu = (ctx: Pick<Ctx, 'state' | 'defs'>, bits: number): void =>
  seesu(ctx, bits, true);

/** Monsters in her line of sight see her not resist `bits`. ref: src/mondata.c monstunseesu() */
export const monstunseesu = (ctx: Pick<Ctx, 'state' | 'defs'>, bits: number): void =>
  seesu(ctx, bits, false);

/** `mtmp->mwandexp`: it has zapped an attack wand (its first shot always misses). */
export const mwandexp = (ctx: Pick<Ctx, 'state'>, id: EntityId): boolean => hasWandExp(ctx, id);

export const setMwandexp = (ctx: Pick<Ctx, 'state'>, id: EntityId): void => setWandExp(ctx, id);

const SHIELD_OF_REFLECTION: DefId = 'nh:shield_of_reflection';
const AMULET_OF_REFLECTION: DefId = 'nh:amulet_of_reflection';

/**
 * Whether the monster reflects: a worn shield of reflection, then a worn amulet of reflection.
 * When it does and `key` is given, says it with `mon` (the monster) and `what` ("shield",
 * "amulet") added to `params`, and learns the shield or amulet ("But it reflects from the hill
 * orc's shield!"). ref: src/muse.c mon_reflects() (no artifact weapons, silver dragon scales or
 * silver and chromatic dragons in this port)
 */
export function monReflects(
  ctx: Ctx,
  mon: Entity,
  key: string | null,
  params: Msg['params'] = {},
): boolean {
  const worn = (slot: string): Entity | undefined =>
    inventoryOf(ctx.state, mon.id).find((o) => o.c.item?.equipped === slot);
  let what: 'shield' | 'amulet';
  let learn: DefId;
  if (worn('shield')?.def === SHIELD_OF_REFLECTION) {
    what = 'shield';
    learn = SHIELD_OF_REFLECTION;
  } else if (worn('amulet')?.def === AMULET_OF_REFLECTION) {
    what = 'amulet';
    learn = AMULET_OF_REFLECTION;
  } else return false;
  if (key) {
    say(ctx, key, { ...params, mon: monNam(ctx, mon), what: { key: `muse.reflect.what.${what}` } });
    discover(ctx, learn);
  }
  return true;
}
