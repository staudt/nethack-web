// Unicorns and the unicorn horn: applying a horn (its curing, or a cursed one's harm) and a
// unicorn catching a gem the hero throws at it. (Peaceful co-aligned unicorns are makemon()'s,
// their keeping out of her lines mfndpos()'s and m_move()'s, the guilt of killing one
// xkilled()'s, the horn on the corpse make_corpse()'s.)
// ref: src/apply.c use_unicorn_horn(); src/dothrow.c thitmonst() GEM_CLASS branch, gem_accept()
//
// Not ported (see DEVIATIONS.md "Unicorns"): deafness (a cursed horn's seventh effect says
// "Nothing seems to happen."; deafness is never a trouble to fix), cream on the face
// (u.ucreamed), pets and monsters using horns, a polymorphed hero's own horn.
import { getPlayer, type Ctx, type Entity, type Msg } from '@nh/core';
import { uShops } from './eshk';
import { uswallow } from './engulfstate';
import { hungerData, makeSick, makeVomiting, vomit } from './hunger';
import { SICK_ALL, SICK_NONVOMITABLE } from './uhunger';
import { nhData } from './items';
import { changeLuck, uState } from './luck';
import { isKnown } from './o_init';
import { monNam } from './perception';
import { isUnpaid } from './price';
import {
  P,
  hasFromForm,
  hasIntrinsic,
  heroHas,
  makeBlinded,
  makeConfused,
  makeHallucinated,
  makeStunned,
  timeoutLeft,
} from './props';
import { checkShopObj } from './shk';
import { mpickobj } from './steal';
import { teleRestrict } from './teleport';
import { rlocMon } from './trap';

export const UNICORN_HORN = 'nh:unicorn_horn';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: rn1(x, y) */
const rn1 = (ctx: Ctx, x: number, y: number): number => ctx.rng.rn2(x) + y;

type Trouble = 'sick' | 'blinded' | 'halluc' | 'vomiting' | 'confusion' | 'stunned';

/**
 * TimedTrouble(HFoo): the property is held on a timer only (no permanent or form-given part; a
 * worn blindfold is EBlinded, not HBlinded). ref: src/apply.c use_unicorn_horn()
 */
function timedOnly(ctx: Ctx, name: string): boolean {
  const hero = getPlayer(ctx.state);
  return (
    timeoutLeft(ctx.state, hero, name) > 0 && !hasIntrinsic(hero, name) && !hasFromForm(hero, name)
  );
}

/** ref: src/rnd.c shuffle_int_array() */
function shuffle<T>(ctx: Ctx, a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const iswap = ctx.rng.rn2(i + 1);
    if (iswap === i) continue;
    const t = a[i] as T;
    a[i] = a[iswap] as T;
    a[iswap] = t;
  }
}

/**
 * Applying a unicorn horn. A cursed one does harm for rn1(90, 10) turns, one of seven ways
 * (`rn2(13) / 2`: sickness, blindness, confusion, stun, vomiting, hallucination, deafness, the
 * last half as likely). Otherwise it fixes some of the hero's timed troubles (sickness,
 * blindness not from an engulfer's blinding, hallucination, vomiting, confusion, stun) in a
 * random order: `rn2(d(2, blessed ? 4 : 2))` of them, at most all.
 * ref: src/apply.c use_unicorn_horn()
 */
export function useUnicornHorn(ctx: Ctx, obj: Entity): void {
  const hero = getPlayer(ctx.state);
  if (obj.c.item?.buc === 'cursed') {
    const lcount = rn1(ctx, 90, 10);
    // case 6 is half as likely as the others
    switch (Math.trunc(ctx.rng.rn2(13) / 2)) {
      case 0: {
        const sick = hungerData(ctx).sick;
        const con = hero.c.attributes?.con ?? 10;
        const xtime = sick ? Math.trunc(sick.remaining / 3) + 1 : rn1(ctx, con, 20);
        makeSick(ctx, xtime, `@${UNICORN_HORN}`, true, SICK_NONVOMITABLE);
        break;
      }
      case 1:
        makeBlinded(ctx, timeoutLeft(ctx.state, hero, P.BLINDED) + lcount, true);
        break;
      case 2:
        if (!heroHas(ctx.state, P.CONFUSION))
          say(ctx, heroHas(ctx.state, P.HALLUC) ? 'unicorn.feel_trippy' : 'unicorn.feel_confused');
        makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + lcount, true);
        break;
      case 3:
        makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + lcount, true);
        break;
      case 4:
        if (hungerData(ctx).vomiting > 0) vomit(ctx);
        else makeVomiting(ctx, 14, false);
        break;
      case 5:
        makeHallucinated(ctx, timeoutLeft(ctx.state, hero, P.HALLUC) + lcount, true);
        break;
      default:
        // make_deaf(): deafness is not modelled (DEVIATIONS.md "Unicorns")
        say(ctx, 'apply.nothing_seems');
        break;
    }
    return;
  }

  // collect property troubles
  const troubles: Trouble[] = [];
  if (hungerData(ctx).sick) troubles.push('sick');
  // blindness from an engulfer's blinding engulf stays (no cream: u.ucreamed is 0)
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  const blindEngulf =
    engulfer !== undefined &&
    ctx.defs.monster(engulfer.def).attacks.some((a) => a.at === 'engulf' && a.ad === 'blnd');
  if (timedOnly(ctx, P.BLINDED) && !blindEngulf) troubles.push('blinded');
  if (timedOnly(ctx, P.HALLUC)) troubles.push('halluc');
  if (hungerData(ctx).vomiting > 0) troubles.push('vomiting');
  if (timedOnly(ctx, P.CONFUSION)) troubles.push('confusion');
  if (timedOnly(ctx, P.STUNNED)) troubles.push('stunned');

  if (troubles.length === 0) {
    say(ctx, 'unicorn.nothing_happens');
    return;
  } else if (troubles.length > 1) shuffle(ctx, troubles);

  let valLimit = ctx.rng.rn2(ctx.rng.d(2, obj.c.item?.buc === 'blessed' ? 4 : 2));
  if (valLimit > troubles.length) valLimit = troubles.length;

  // fix [some of] the troubles
  let didProp = 0;
  for (let val = 0; val < valLimit; val++) {
    switch (troubles[val]) {
      case 'sick':
        makeSick(ctx, 0, '', true, SICK_ALL);
        break;
      case 'blinded':
        makeBlinded(ctx, 0, true); // make_blinded((long) u.ucreamed, TRUE)
        break;
      case 'halluc':
        makeHallucinated(ctx, 0, true);
        break;
      case 'vomiting':
        makeVomiting(ctx, 0, true);
        break;
      case 'confusion':
        makeConfused(ctx, 0, true);
        break;
      case 'stunned':
        makeStunned(ctx, 0, true);
        break;
    }
    didProp++;
  }
  if (!didProp) say(ctx, 'apply.nothing_seems');
}

/** A thrown gem a unicorn reacts to: GEM_CLASS but not a rock or gray stone, not slung. */
export function gemForUnicorn(ctx: Ctx, obj: Entity, slinging: boolean): boolean {
  const od = ctx.defs.object(obj.def);
  return od.class === 'gem' && od.material !== 'mineral' && !slinging;
}

/**
 * A unicorn catches a gem the hero threw at it: it becomes peaceful, takes a real gem (Luck: +5,
 * +2 or +1 by what she knows of it when it is co-aligned; a random -3..3 or -1..1 when not) and
 * a glass whose worth she does not know ("graciously", no Luck), turns away known or named glass
 * ("is not interested in your junk"), then teleports away. Returns whether it kept the gem.
 * ref: src/dothrow.c gem_accept() (no individual object names: only #call names count)
 */
export function gemAccept(ctx: Ctx, mon: Entity, obj: Entity): boolean {
  const def = ctx.defs.monster(mon.def);
  const od = ctx.defs.object(obj.def);
  const isBuddy = Math.sign(def.alignment) === Math.sign(uState(ctx.state).alignType);
  const isGem = od.material === 'gemstone';
  const name = monNam(ctx, mon);
  const m = mon.c.monster;
  if (m) m.peaceful = true; // (mavenge is not kept)

  let key: string;
  let take = true;
  if (isKnown(ctx.state, ctx.defs, od)) {
    // object properly identified
    if (isGem) {
      key = isBuddy ? 'unicorn.gratefully' : 'unicorn.hesitatingly';
      changeLuck(ctx, isBuddy ? 5 : ctx.rng.rn2(7) - 3);
    } else {
      key = 'unicorn.not_interested';
      take = false;
    }
  } else if (nhData(ctx).called?.[od.id] !== undefined) {
    // making guesses
    if (isGem) {
      key = isBuddy ? 'unicorn.gratefully' : 'unicorn.hesitatingly';
      changeLuck(ctx, isBuddy ? 2 : ctx.rng.rn2(3) - 1);
    } else {
      key = 'unicorn.not_interested';
      take = false;
    }
  } else if (isGem) {
    // value completely unknown to @
    key = isBuddy ? 'unicorn.gratefully' : 'unicorn.hesitatingly';
    changeLuck(ctx, isBuddy ? 1 : ctx.rng.rn2(3) - 1);
  } else key = 'unicorn.graciously';

  if (take) {
    const p = mon.c.pos;
    if (p && (uShops(ctx).length > 0 || isUnpaid(ctx.state, obj)))
      checkShopObj(ctx, obj, p.x, p.y, true);
    mpickobj(ctx, mon.id, obj);
  }
  if (!heroHas(ctx.state, P.BLINDED)) say(ctx, key, { mon: name });
  if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
  return take;
}
