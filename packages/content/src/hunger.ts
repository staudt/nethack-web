// Hunger: nutrition burn, hunger states, fainting, starvation and sickness.
// ref: src/eat.c gethungry(), newuhs(), lesshungry(), morehungry(), src/allmain.c moveloop_core
import {
  getPlayer,
  inventoryOf,
  type Ctx,
  type Entity,
  type HungerState,
  type ModApi,
  type Msg,
} from '@nh/core';
import { nhData } from './items';
import { SICK_ALL, SICK_NONVOMITABLE, SICK_VOMITABLE, hungerData, type Sick } from './uhunger';
import { done } from './end';
import { uState } from './luck';
import { nomul } from './nomul';
import { nearCapacity } from './stats';
import { CHARGED_RINGS } from './objects';
import { P, hasProp, wornIn } from './props';

export type { HungerData, Sick, Victual } from './uhunger';
export { SICK_ALL, SICK_NONVOMITABLE, SICK_VOMITABLE } from './uhunger';
export { hungerData, initUhunger } from './uhunger';

/** Hunger states in u.uhs order. ref: include/you.h */
const HS_ORDER: readonly HungerState[] = [
  'satiated',
  'not_hungry',
  'hungry',
  'weak',
  'fainting',
  'fainted',
  'starved',
];
const rank = (s: HungerState): number => HS_ORDER.indexOf(s);
const WEAK = rank('weak');

const sgn = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** The hero's nutrition (u.uhunger). */
export function nutritionOf(ctx: Pick<Ctx, 'state'>): number {
  return getPlayer(ctx.state).c.hunger?.nutrition ?? 0;
}

/** Whether the hero cannot act (multi < 0). */
export const isHelpless = (ctx: Pick<Ctx, 'state'>): boolean =>
  getPlayer(ctx.state).c.helpless !== undefined;

/**
 * Makes the hero helpless from outside an action (a hook or a timer): the extra energy that
 * `nomul` returns is taken from the hero's energy at once.
 */
export function nomulNow(
  ctx: Ctx,
  turns: number,
  reasonKey: string,
  finish: Msg | null,
  after?: string,
): void {
  const extra = nomul(ctx, turns, reasonKey, finish, after);
  const actor = getPlayer(ctx.state).c.actor;
  if (actor) actor.energy -= extra;
}

/** ref: src/eat.c gethungry() */
export function gethungry(ctx: Ctx): void {
  const hero = getPlayer(ctx.state);
  const h = hero.c.hunger;
  if (!h || ctx.state.gameOver) return;
  if (uState(ctx.state).uinvulnerable) return; // you don't feel hungrier while praying
  // Unaware: fainted or knocked out by rotten food. Sleep and unconsciousness slow the burn.
  const unaware =
    hero.c.helpless !== undefined &&
    (hero.c.helpless.reasonKey === 'helpless.fainted' ||
      hero.c.helpless.reasonKey === 'helpless.rotten_food');
  // The hero is human: carnivorous and herbivorous.
  if ((!unaware || ctx.rng.rn2(10) === 0) && !hasProp(hero, P.SLOW_DIGESTION)) h.nutrition--;
  // 5.0: the trigger is randomized instead of (moves % 20).
  const accessorytime = ctx.rng.rn2(20);
  if (accessorytime % 2) {
    // Regeneration uses up food (no artifacts); so does being Stressed or worse.
    if (hasProp(hero, P.REGENERATION)) h.nutrition--;
    if (nearCapacity(ctx.state, ctx.defs, hero.id) > 1) h.nutrition--;
  } else {
    if (hasProp(hero, P.HUNGER)) h.nutrition--;
    // Conflict uses up food too (no artifacts here)
    if (hasProp(hero, P.CONFLICT)) h.nutrition--;
    // (no meat rings, no Amulet of Yendor)
    const uleft = wornIn(ctx.state, hero.id, 'ringL');
    const uright = wornIn(ctx.state, hero.id, 'ringR');
    const uamul = wornIn(ctx.state, hero.id, 'amulet');
    // +0 charged rings don't do anything, so don't affect hunger, except a +0 ring of protection
    // that is the only source of Protection
    const otherProtection = (ring: Entity): Entity[] =>
      inventoryOf(ctx.state, hero.id).filter(
        (o) =>
          o.id !== ring.id &&
          o.c.item?.equipped !== null &&
          o.c.item?.equipped !== 'weapon' &&
          ctx.defs.object(o.def).prop === P.PROTECTION,
      );
    const burns = (ring: Entity, isLeft: boolean): boolean => {
      if (ring.c.item?.spe || !CHARGED_RINGS.has(ring.def)) return true;
      if (ring.def !== 'nh:ring_of_protection') return false;
      const others = otherProtection(ring);
      if (others.length === 0) return true;
      // the left ring also burns when the only other source is a +0 right ring of protection
      return (
        isLeft &&
        others.length === 1 &&
        others[0]?.id === uright?.id &&
        uright?.def === 'nh:ring_of_protection' &&
        !uright.c.item?.spe
      );
    };
    switch (accessorytime) {
      case 0:
        // Slow digestion from something other than a ring (worn armor) burns food here
        if (
          hasProp(hero, P.SLOW_DIGESTION) &&
          uright?.def !== 'nh:ring_of_slow_digestion' &&
          uleft?.def !== 'nh:ring_of_slow_digestion'
        )
          h.nutrition--;
        break;
      case 4:
        if (uleft && burns(uleft, true)) h.nutrition--;
        break;
      case 8:
        if (uamul && uamul.def !== 'nh:fake_amulet_of_yendor') h.nutrition--;
        break;
      case 12:
        if (uright && burns(uright, false)) h.nutrition--;
        break;
      default:
        break;
    }
  }
  newuhs(ctx, true, hungerData(ctx).victual?.eating === true);
}

/** ref: src/eat.c morehungry(): called after vomiting and feats of magic */
export function morehungry(ctx: Ctx, num: number): void {
  const h = getPlayer(ctx.state).c.hunger;
  if (!h) return;
  h.nutrition -= num;
  newuhs(ctx, true);
}

/** The choking routine of a meal; see eat.ts. */
export type ChokeFn = (ctx: Ctx) => void;

/**
 * ref: src/eat.c lesshungry(). `eating` is `occupation == eatfood || force_save_hs`; `choke` is
 * the choking routine of the meal (called with the piece) when the stomach bursts.
 */
export function lesshungry(ctx: Ctx, num: number, eating = false, choke?: ChokeFn): void {
  const h = getPlayer(ctx.state).c.hunger;
  if (!h) return;
  const hd = hungerData(ctx);
  const v = hd.victual;
  h.nutrition += num;
  if (h.nutrition >= 2000) {
    if (!eating || v?.canchoke) {
      choke?.(ctx);
      return;
    }
  } else if (
    h.nutrition >= 1500 &&
    !hasProp(getPlayer(ctx.state), P.HUNGER) &&
    (!v?.eating || !v.fullwarn)
  ) {
    // Have lesshungry() report when you're nearly full so all eating warns about choking.
    ctx.emit({ type: 'msg', key: 'eat.hard_time' });
    nhData(ctx).nomovemsg = { key: 'eat.finally_finished' };
    if (!v?.eating) {
      // multi = -2
      nomulNow(ctx, 2, 'helpless.stuffed', { key: 'eat.finally_finished' });
    } else {
      v.fullwarn = true;
      // The paranoid "Continue eating?" confirmation is off by default.
    }
  }
  newuhs(ctx, false, eating);
}

/**
 * Computes and comments on the (new?) hunger status. `eating` is `occupation == eatfood ||
 * force_save_hs`: while eating the state passes silently and the whole meal is judged at its
 * end. ref: src/eat.c newuhs()
 */
export function newuhs(ctx: Ctx, incr: boolean, eating = false): void {
  const hero = getPlayer(ctx.state);
  const h = hero.c.hunger;
  if (!h) return;
  const hd = hungerData(ctx);
  const n = h.nutrition;
  let newhs: HungerState =
    n > 1000
      ? 'satiated'
      : n > 150
        ? 'not_hungry'
        : n > 50
          ? 'hungry'
          : n > 0
            ? 'weak'
            : 'fainting';

  if (eating) {
    if (hd.savedHs === null) hd.savedHs = h.state;
    h.state = newhs;
    return;
  }
  if (hd.savedHs !== null) {
    h.state = hd.savedHs;
    hd.savedHs = null;
  }

  if (newhs === 'fainting') {
    // uhunger is likely to be negative at this point
    const div10 = sgn(n) * Math.trunc((Math.abs(n) + 5) / 10);
    if (h.state === 'fainted') newhs = 'fainted';
    if (rank(h.state) <= WEAK || ctx.rng.rn2(20 - div10) >= 19) {
      if (h.state !== 'fainted' && !isHelpless(ctx)) {
        const duration = 10 - div10;
        // stop what you're doing, then faint
        ctx.interrupt();
        ctx.emit({ type: 'msg', key: 'hunger.faint' });
        nomulNow(ctx, duration, 'helpless.fainted', { key: 'hunger.regain' });
        newhs = 'fainted';
      }
    } else if (n < -(100 + 10 * (hero.c.attributes?.con ?? 10))) {
      h.state = 'starved';
      ctx.emit({ type: 'msg', key: 'hunger.starve' });
      done(ctx, '@killer.starvation', 'starving');
      return;
    }
  }

  if (newhs !== h.state) {
    const a = hero.c.attributes;
    if (rank(newhs) >= WEAK && rank(h.state) < WEAK) {
      // ATEMP(A_STR) = -1: a temporary loss, never below the minimum of 3
      if (a && hd.strLoss === 0 && a.str > 3) {
        a.str -= 1;
        hd.strLoss = 1;
      }
    } else if (rank(newhs) < WEAK && rank(h.state) >= WEAK) {
      if (a && hd.strLoss > 0) a.str += hd.strLoss;
      hd.strLoss = 0;
    }
    switch (newhs) {
      case 'hungry':
        ctx.emit({
          type: 'msg',
          key: !incr ? 'hunger.hungry_now' : n < 145 ? 'hunger.hungry' : 'hunger.hungry_begin',
        });
        if (incr) ctx.interrupt(); // stop_occupation(), end_running()
        break;
      case 'weak':
        if (incr && hero.c.player?.role === 'nh:valkyrie')
          ctx.emit({ type: 'msg', key: 'hunger.needs_food', params: { role: '@role.valkyrie' } });
        else
          ctx.emit({
            type: 'msg',
            key: !incr ? 'hunger.weak_still' : n < 45 ? 'hunger.weak' : 'hunger.weak_begin',
          });
        if (incr) ctx.interrupt();
        break;
      default:
        break;
    }
    h.state = newhs;
  }
}

// ---------------------------------------------------------------------------------------------
// sickness (food poisoning)

/**
 * Makes the hero deathly sick for `xtime` more turns, or (0) cures the `type` bits of her
 * sickness ("You feel somewhat better." when only part of it goes). `killer` is a message key
 * naming the cause of death. `type` defaults to SICK_VOMITABLE when making her sick (food
 * poisoning) and SICK_ALL when curing. ref: src/potion.c make_sick() (no Sick_resistance exists)
 */
export function makeSick(
  ctx: Ctx,
  xtime: number,
  killer: string,
  talk = true,
  type: number = xtime > 0 ? SICK_VOMITABLE : SICK_ALL,
): void {
  const hd = hungerData(ctx);
  const old = hd.sick?.remaining ?? 0;
  if (xtime > 0) {
    if (old === 0) ctx.emit({ type: 'msg', key: 'sick.deathly' });
    else if (talk)
      ctx.emit({
        type: 'msg',
        key: xtime <= Math.trunc(old / 2) ? 'sick.much_worse' : 'sick.worse',
      });
    const t = (hd.sick ? sickType(hd.sick) : 0) | type;
    // the type is kept only when it is not plain food poisoning (a missing field reads so)
    hd.sick = { remaining: xtime, killer, ...(t !== SICK_VOMITABLE ? { type: t } : {}) };
  } else if (hd.sick && old > 0 && type & sickType(hd.sick)) {
    const left = sickType(hd.sick) & ~type;
    if (left) {
      // only partly cured
      if (talk) ctx.emit({ type: 'msg', key: 'sick.somewhat_better' });
      const { type: _gone, ...rest } = hd.sick;
      hd.sick = { ...rest, remaining: old * 2, ...(left !== SICK_VOMITABLE ? { type: left } : {}) }; // approximation
    } else {
      hd.sick = null;
      if (talk) ctx.emit({ type: 'msg', key: 'sick.cured' });
    }
  }
}

/** u.usick_type of a sickness (a missing field is food poisoning). */
export const sickType = (sick: Sick): number => sick.type ?? SICK_VOMITABLE;

/** Whether the hero is sick. ref: Sick */
export const isSick = (ctx: Pick<Ctx, 'state'>): boolean => hungerData(ctx).sick !== null;

/** Counts the illness down. ref: src/timeout.c nh_timeout() SICK, sickness_dialogue() */
function sicknessTimeout(ctx: Ctx): void {
  const hd = hungerData(ctx);
  const sick = hd.sick;
  if (!sick || ctx.state.gameOver) return;
  const j = sick.remaining;
  const i = Math.trunc(j / 2);
  if (i > 0 && i <= 3 && j % 2 !== 0) {
    ctx.emit({ type: 'msg', key: `sick.text.${3 - i}` });
  }
  sick.remaining -= 1;
  if (sick.remaining > 0) return;
  // hero might be able to bounce back from food poisoning, but not other forms of illness
  const hero = getPlayer(ctx.state);
  const con = hero.c.attributes?.con ?? 10;
  if ((sickType(sick) & SICK_NONVOMITABLE) === 0 && ctx.rng.rn2(100) < con) {
    ctx.emit({ type: 'msg', key: 'sick.recovered' });
    hd.sick = null;
    // adjattrib(A_CON, -1, 1): sustain ability keeps it
    if (hero.c.attributes && !hasProp(hero, P.FIXED_ABIL))
      hero.c.attributes.con = Math.max(3, hero.c.attributes.con - 1);
    return;
  }
  ctx.emit({ type: 'msg', key: 'sick.die' });
  done(ctx, sick.killer, 'poisoning');
}

/** ref: src/potion.c make_vomiting() */
export function makeVomiting(ctx: Ctx, xtime: number, talk: boolean): void {
  const hd = hungerData(ctx);
  const old = hd.vomiting;
  hd.vomiting = xtime;
  if (xtime === 0 && old > 0 && talk) ctx.emit({ type: 'msg', key: 'vomit.less_nauseated' });
}

/**
 * The countdown before vomiting. ref: src/timeout.c vomiting_dialogue(). Not ported: the
 * confusion and stun it causes (those statuses do not exist yet).
 */
function vomitingTimeout(ctx: Ctx): void {
  const hd = hungerData(ctx);
  if (hd.vomiting <= 0 || ctx.state.gameOver) return;
  const v = hd.vomiting - 1; // nhtimeout() has not decremented it for this turn yet
  switch (v) {
    case 14:
    case 11:
    case 8:
    case 5:
    case 2:
      ctx.emit({ type: 'msg', key: `vomit.text.${v}` });
      break;
    case 0: {
      ctx.interrupt();
      morehungry(ctx, 20);
      const h = getPlayer(ctx.state).c.hunger;
      if (h && rank(h.state) < rank('fainting')) ctx.emit({ type: 'msg', key: 'vomit.vomit' });
      vomit(ctx);
      break;
    }
    default:
      break;
  }
  hd.vomiting -= 1;
}

/** ref: src/eat.c vomit(): cures food poisoning and leaves the hero helpless for 2 turns. */
export function vomit(ctx: Ctx): void {
  if (isSick(ctx)) makeSick(ctx, 0, '', true, SICK_VOMITABLE); // make_sick(0L, 0, TRUE, SICK_VOMITABLE)
  if (!isHelpless(ctx)) nomulNow(ctx, 2, 'helpless.vomiting', { key: 'eat.can_move_again' });
}

// ---------------------------------------------------------------------------------------------

const STATUS_NAMES: Partial<Record<HungerState, string>> = {
  satiated: 'satiated',
  hungry: 'hungry',
  weak: 'weak',
  fainting: 'fainting',
  fainted: 'fainted',
};

/** Registers the hunger status, the starting nutrition and the per-turn hooks. */
export function registerHunger(api: ModApi): void {
  api.defineStatus({
    id: 'nh:hunger',
    field: 'hunger',
    value(state) {
      const hero = state.entities[String(state.playerId)];
      const hs = hero?.c.hunger?.state;
      return hs ? (STATUS_NAMES[hs] ?? null) : null;
    },
  });
  // ref: src/u_init.c u_init(): u.uhunger = 900; u.uhs = NOT_HUNGRY
  api.on('newGame', (ctx, heroId) => {
    const hero = ctx.state.entities[String(heroId)];
    if (hero) hero.c.hunger = { nutrition: 900, state: 'not_hungry' };
  });
  api.on('endOfTurn', (ctx) => {
    const hero = getPlayer(ctx.state);
    const h = hero.c.hunger;
    if (!h || ctx.state.gameOver) return;
    // ref: src/eat.c unfaint(): the faint is over once the helplessness ended
    if (h.state === 'fainted' && !isHelpless(ctx)) h.state = 'fainting';
    sicknessTimeout(ctx);
    vomitingTimeout(ctx);
    if (ctx.state.gameOver) return;
    // ref: src/allmain.c moveloop_core(): once per turn
    gethungry(ctx);
  });
}
