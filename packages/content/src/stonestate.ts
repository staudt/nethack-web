// Petrification state: the hero's Stoned timer (props.ts `P.STONED`) and its delayed killer,
// and the monster predicates the stoning code shares. A leaf (core and props only), so eat,
// pray, adtyping and the timeout in stoning.ts can all use it.
// ref: src/potion.c make_stoned(); src/eat.c fix_petrification(); src/end.c delayed_killer();
// include/mondata.h touch_petrifies(), flesh_petrifies(), resists_ston()
import {
  getPlayer,
  type ArmorSlot,
  type Ctx,
  type Entity,
  type GameState,
  type MonsterDef,
} from '@nh/core';
import { P, hasProp, setItimeout } from './props';

interface StoneData {
  /** C's delayed_killer list, by property: the killer key of the stoning in progress */
  delayedKiller?: { stoned?: string };
}

const data = (state: GameState): StoneData => {
  const md = state.modData;
  let d = md['nh'] as unknown as StoneData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
};

/** ref: include/mondata.h touch_petrifies(): cockatrices and chickatrices */
export const touchPetrifies = (def: MonsterDef): boolean =>
  def.id === 'nh:cockatrice' || def.id === 'nh:chickatrice';

/** ref: include/mondata.h flesh_petrifies(): touch_petrifies() or Medusa */
export const fleshPetrifies = (def: MonsterDef): boolean =>
  touchPetrifies(def) || def.id === 'nh:medusa';

/** ref: include/mondata.h resists_ston() (no worn sources of resistance for monsters) */
export const resistsSton = (ctx: Pick<Ctx, 'defs'>, mon: Entity): boolean =>
  ctx.defs.monster(mon.def).resists.includes('stone');

/**
 * The hero is turning to stone (Stoned): the timer is set, including its last turn (the
 * countdown in stoning.ts runs ahead of props.ts's and ends it).
 */
export const isStoned = (state: Readonly<GameState>): boolean =>
  (getPlayer(state).c.props?.[P.STONED]?.timeout ?? 0) > 0;

/** The killer of the stoning in progress (a death reason key), if any. */
export const stonedKiller = (state: GameState): string | undefined =>
  data(state).delayedKiller?.stoned;

/**
 * Starts (`xtime` > 0) or stops (0) the hero's petrification; `msg` is said when that changes it.
 * Starting records the delayed killer (a death reason key: '@nh:cockatrice'). ref:
 * src/potion.c make_stoned()
 */
export function makeStoned(
  ctx: Pick<Ctx, 'state' | 'emit'>,
  xtime: number,
  msg: string | null,
  killer: string | null,
): void {
  const old = isStoned(ctx.state);
  setItimeout(ctx.state, getPlayer(ctx.state), P.STONED, xtime);
  if ((xtime !== 0) !== old && msg) ctx.emit({ type: 'msg', key: msg });
  const d = data(ctx.state);
  if (!xtime) {
    // dealloc_killer(find_delayed_killer(STONED))
    if (d.delayedKiller) {
      delete d.delayedKiller.stoned;
      if (Object.keys(d.delayedKiller).length === 0) delete d.delayedKiller;
    }
  } else if (!old && killer) (d.delayedKiller ??= {}).stoned = killer;
}

/**
 * Cures petrification: "You feel limber!" (when hallucinating, the ruined piece of art).
 * ref: src/eat.c fix_petrification()
 */
export function fixPetrification(ctx: Pick<Ctx, 'state' | 'emit'>): void {
  const h = getPlayer(ctx.state);
  const msg = hasProp(h, P.HALLUC)
    ? (h.c.attributes?.cha ?? 10) > 15
      ? 'stone.ruined_fine_art'
      : 'stone.ruined_art'
    : 'stone.limber';
  makeStoned(ctx, 0, msg, null);
}

/**
 * The armor that keeps an attack of type `at` from touching its target (C's W_ARM* mask):
 * gloves for claws, touches and weapon blows (a wielded weapon counts as gloves), boots for
 * kicks, a helmet for butts, both cloak and gloves for hugs; none can protect a bite, sting,
 * tentacle or engulfing; 'never' for attacks that do not touch at all (gazes, breath, spells...).
 * ref: src/mhitm.c attk_protection()
 */
export function attkProtection(at: string): readonly ArmorSlot[] | 'never' {
  switch (at) {
    case 'passive':
    case 'spit':
    case 'explode':
    case 'boom':
    case 'gaze':
    case 'breath':
    case 'magic':
      return 'never';
    case 'claw':
    case 'touch':
    case 'weapon':
      return ['gloves'];
    case 'kick':
      return ['boots'];
    case 'butt':
      return ['helm'];
    case 'hug':
      return ['cloak', 'gloves'];
    default:
      return [];
  }
}
