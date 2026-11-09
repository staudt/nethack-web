// Eggs hitting things: a monster hit with an egg (thrown or in hand), and eggs breaking.
// ref: src/uhitm.c hmon_hitmon_misc_obj() EGG; src/dothrow.c breakobj() EGG, breakmsg() EGG
//
// Not ported: the pyrolisk egg's fiery explosion (it splats like any egg; see DEVIATIONS.md),
// exercise(A_WIS, FALSE) for a plain splat, munstone() (monsters do not cure themselves).
import type { Ctx, Entity, Msg } from '@nh/core';
import { EGG, killEgg, staleEgg } from './eggstate';
import { changeLuck } from './luck';
import { useupall } from './magic';
import { monNam } from './perception';
import { placeOnFloor } from './items';
import { resistsSton, touchPetrifies } from './stonestate';
import { minstapetrify } from './stoning';

const say = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: breakobj() EGG / hmon EGG: breaking (or hitting with) her own eggs is bad luck */
function ownEggsLuck(ctx: Ctx, egg: Entity): void {
  const it = egg.c.item;
  if (it?.spe && it.corpseOf) changeLuck(ctx, -Math.min(it.quantity, 5));
}

/**
 * Eggs break where they land ("Splat!" is said by the caller's breakmsg()): the hero breaking
 * her own eggs loses Luck; then they are gone. ref: src/dothrow.c breakobj() EGG
 */
export function breakEggs(ctx: Ctx, egg: Entity, heroCaused: boolean): void {
  if (heroCaused) ownEggsLuck(ctx, egg);
  killEgg(ctx, egg.id);
  ctx.remove(egg.id);
}

/**
 * The hero hits a monster with eggs (`thrown`: one thrown egg; else the wielded stack): 1 point
 * of damage and no damage bonus, the message is always given and the eggs are used up. A
 * cockatrice egg turns the monster to stone ("Splat!  You hit the jackal with a petrifying
 * egg!"); an egg hitting a cockatrice turns to stone itself ("The egg isn't alive any more...":
 * a rock, left where the monster is when thrown). Returns 'stoned' when hmon() returns there
 * (the monster did not resist), else 'hit' (the 1 point is dealt by the caller).
 * ref: src/uhitm.c hmon_hitmon_misc_obj() EGG
 */
export function hitWithEgg(ctx: Ctx, mon: Entity, egg: Entity, thrown: boolean): 'stoned' | 'hit' {
  const it = egg.c.item;
  if (!it || egg.def !== EGG) return 'hit';
  const cnt = it.quantity;
  const useupEggs = (): void => {
    killEgg(ctx, egg.id);
    if (thrown) ctx.remove(egg.id);
    else useupall(ctx, egg.id);
  };
  ownEggsLuck(ctx, egg);
  const of = it.corpseOf && ctx.defs.isMonster(it.corpseOf) ? ctx.defs.monster(it.corpseOf) : null;
  const known = it.known.spe;
  const name = monNam(ctx, mon);
  if (of && touchPetrifies(of)) {
    say(ctx, 'egg.splat_petrify', {
      mon: name,
      eggs: known
        ? { key: `egg.the_mon${cnt !== 1 ? '.plural' : ''}`, params: { mon: `@${of.id}` } }
        : { key: cnt > 1 ? 'egg.some_petrifying' : 'egg.a_petrifying' },
    });
    it.known.spe = true; // (not much point...)
    useupEggs();
    minstapetrify(ctx, mon, true);
    if (resistsSton(ctx, mon)) return 'hit';
    return 'stoned';
  }
  // ordinary egg(s)
  say(ctx, 'egg.hit_with', {
    mon: name,
    eggs:
      of && known
        ? { key: `egg.the_mon${cnt !== 1 ? '.plural' : ''}`, params: { mon: `@${of.id}` } }
        : { key: cnt > 1 ? 'egg.some' : 'egg.an' },
  });
  if (touchPetrifies(ctx.defs.monster(mon.def)) && !staleEgg(ctx.state, it)) {
    say(ctx, cnt === 1 ? 'egg.not_alive' : 'egg.not_alive.plural');
    killEgg(ctx, egg.id);
    egg.def = 'nh:rock';
    it.spe = 0;
    it.known = { buc: false, spe: false };
    delete it.corpseOf;
    const p = mon.c.pos;
    if (thrown && p) placeOnFloor(ctx, egg.id, p.level, p.x, p.y);
  } else {
    say(ctx, 'egg.splat');
    useupEggs();
  }
  return 'hit';
}
