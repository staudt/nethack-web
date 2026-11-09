// Sliming state: the hero's Slimed timer (props.ts `P.SLIMED`) and its delayed killer, and
// burn_away_slime() for every fire that touches her. A leaf (core and props only), so the fire
// sources (explode, zap, buzz, mcastu, the fire trap), prayer, polyself and the countdown in
// slime.ts can all use it.
// ref: src/potion.c make_slimed(); src/timeout.c burn_away_slime(); src/end.c delayed_killer();
// include/mondata.h slimeproof()
import { getPlayer, type Ctx, type GameState, type MonsterDef } from '@nh/core';
import { flaming } from './engulfstate';
import { noncorporeal } from './mondata';
import { P, setItimeout } from './props';

interface SlimeData {
  /** C's delayed_killer list, by property (stonestate.ts keeps `stoned` in the same record) */
  delayedKiller?: { slimed?: string };
}

const data = (state: GameState): SlimeData => {
  const md = state.modData;
  let d = md['nh'] as unknown as SlimeData | undefined;
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
};

/**
 * ref: include/mondata.h slimeproof(): green slimes, flaming monsters and noncorporeal ones
 * (a fire elemental, a flaming sphere, a ghost) can't be turned into slime.
 */
export const slimeproof = (def: MonsterDef): boolean =>
  def.id === 'nh:green_slime' || flaming(def) || noncorporeal(def);

/** The hero is turning into green slime (Slimed), including the countdown's last turn. */
export const isSlimed = (state: Readonly<GameState>): boolean =>
  (getPlayer(state).c.props?.[P.SLIMED]?.timeout ?? 0) > 0;

/** The killer of the sliming in progress (a death reason key), if any. */
export const slimedKiller = (state: GameState): string | undefined =>
  data(state).delayedKiller?.slimed;

/**
 * Starts (`xtime` > 0) or stops (0) the hero's sliming; `msg` is said when that changes it. A
 * `killer` (a death reason key: '@nh:green_slime') is recorded when it starts: C's
 * delayed_killer(SLIMED, ...), which its callers make right after make_slimed().
 * ref: src/potion.c make_slimed() (the late mimic-a-green-slime display is not ported)
 */
export function makeSlimed(
  ctx: Pick<Ctx, 'state' | 'emit'>,
  xtime: number,
  msg: string | null,
  killer: string | null = null,
): void {
  const old = isSlimed(ctx.state);
  setItimeout(ctx.state, getPlayer(ctx.state), P.SLIMED, xtime);
  if ((xtime !== 0) !== old && msg) ctx.emit({ type: 'msg', key: msg });
  const d = data(ctx.state);
  if (!xtime) {
    // dealloc_killer(find_delayed_killer(SLIMED))
    if (d.delayedKiller) {
      delete d.delayedKiller.slimed;
      if (Object.keys(d.delayedKiller).length === 0) delete d.delayedKiller;
    }
  } else if (killer) (d.delayedKiller ??= {}).slimed = killer;
}

/** Fire burns the slime off: "The slime that covers you is burned away!" ref: src/timeout.c */
export function burnAwaySlime(ctx: Pick<Ctx, 'state' | 'emit'>): void {
  if (isSlimed(ctx.state)) makeSlimed(ctx, 0, 'slime.burned_away');
}
