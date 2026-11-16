// Applying a towel (wiping her hands, her face, the cursed outcomes) and slippery fingers each
// turn: glibr() drops the rings and the weapon that slip; the Slippery status condition.
// ref: src/apply.c use_towel(); src/do_wear.c glibr(); src/allmain.c moveloop_core() (glibr()
// before nh_timeout()); src/botl.c bl_slippery
//
// Not ported: two-weapon combat (no off-hand weapon to slip first), handedness (the hero is
// right-handed), gulp_blnd_check() (see creampie.ts), body parts of other forms (always "hands",
// "face", "fingers").
import { NORMAL_SPEED, getPlayer, type Ctx, type Entity, type ModApi, type Msg } from '@nh/core';
import { addUcreamed, setUcreamed, ucreamed } from './creamed';
import {
  dryATowel,
  fingersOrGloves,
  glibTimeout,
  glovesSimpleName,
  isGlib,
  isWetTowel,
  makeGlib,
  uarmg,
} from './glib';
import { dropx, isSword, welded } from './itemactions';
import { blindfOff, ringOffQuiet } from './jewelry';
import { nolimbs } from './mondata';
import { freehand } from './pray';
import {
  P,
  hasIntrinsic,
  incrItimeout,
  makeBlinded,
  setItimeout,
  timeoutLeft,
  wornIn,
} from './props';
import { heroForm } from './upoly';
import { weaponDescr } from './web';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const worn = (ctx: Ctx, slot: string): Entity | null => wornIn(ctx.state, ctx.state.playerId, slot);

/**
 * Applying a towel: no free hand or wearing it takes no time; a cursed one 1 time in 3 greases
 * her hands ("Your hands get slimy!") and 1 in 3 puts gunk on her face ("Yecch!") or pushes her
 * eyewear crooked or off; otherwise it wipes the grease off her hands, else the cream off her
 * face ("You've got the glop off."), else "Your face and hands are already clean." Each use
 * dries a wet towel a little. ref: src/apply.c use_towel()
 */
export function useTowel(ctx: Ctx, obj: Entity): number {
  const it = obj.c.item;
  if (!it) return 0;
  const dryingFeedback = it.equipped === 'weapon';
  const dry = (): void => {
    if (isWetTowel(obj)) dryATowel(ctx, obj, -1, dryingFeedback);
  };
  const hero = getPlayer(ctx.state);
  if (!freehand(ctx)) {
    say(ctx, 'towel.no_free_hand');
    return 0;
  }
  if (it.equipped === 'blindfold') {
    say(ctx, 'towel.wearing');
    return 0;
  }
  if (it.buc === 'cursed') {
    switch (ctx.rng.rn2(3)) {
      case 2: {
        const old = glibTimeout(ctx.state);
        makeGlib(ctx, old + 3 + ctx.rng.rn2(10)); // + 3..12: rn1(10, 3)
        say(ctx, old ? 'towel.filthier' : 'towel.slimy');
        dry();
        return NORMAL_SPEED;
      }
      case 1: {
        const ublindf = worn(ctx, 'blindfold');
        if (!ublindf) {
          const old = ucreamed(ctx.state);
          addUcreamed(ctx.state, 3 + ctx.rng.rn2(10)); // rn1(10, 3)
          say(ctx, old ? 'towel.gunk_more' : 'towel.gunk_now');
          makeBlinded(
            ctx,
            timeoutLeft(ctx.state, hero, P.BLINDED) + ucreamed(ctx.state) - old,
            true,
          );
        } else {
          const what =
            ublindf.def === 'nh:lenses'
              ? '@towel.what.lenses'
              : obj.def === ublindf.def
                ? '@towel.what.other_towel'
                : '@towel.what.blindfold';
          if (ublindf.c.item?.buc === 'cursed') {
            say(ctx, 'towel.push', {
              what,
              how: ctx.rng.rn2(2) ? '@towel.cock_eyed' : '@towel.crooked',
            });
          } else {
            say(ctx, 'towel.push_off', { what });
            blindfOff(ctx, ublindf);
            dropx(ctx, ublindf);
          }
        }
        dry();
        return NORMAL_SPEED;
      }
      default:
        break;
    }
  }
  if (isGlib(ctx.state)) {
    makeGlib(ctx, 0);
    const gloves = uarmg(ctx);
    say(ctx, 'towel.wipe_off', {
      what: gloves ? glovesSimpleName(ctx, gloves) : { key: 'towel.hands' },
    });
    dry();
    return NORMAL_SPEED;
  }
  const cream = ucreamed(ctx.state);
  if (cream) {
    incrItimeout(ctx.state, hero, P.BLINDED, -cream);
    setUcreamed(ctx.state, 0);
    // Blinded: the timed or permanent part, not a blindfold
    if (timeoutLeft(ctx.state, hero, P.BLINDED) === 0 && !hasIntrinsic(hero, P.BLINDED)) {
      say(ctx, 'wipe.glop_off');
      // (no gulp_blnd_check(): see the header)
      setItimeout(ctx.state, hero, P.BLINDED, 1);
      makeBlinded(ctx, 0, true);
    } else {
      say(ctx, 'wipe.clean_now');
    }
    dry();
    return NORMAL_SPEED;
  }
  say(ctx, 'towel.already_clean');
  return 0;
}

/**
 * Slippery fingers, once a turn: unless she wears gloves, her uncursed rings slip off and are
 * dropped ("Your ring slips off your finger."); her wielded weapon (not a tethered aklys, not
 * welded) slips from her hand and is dropped. The hero is right-handed, so a welded two-hander
 * only keeps the right ring on. ref: src/do_wear.c glibr()
 */
export function glibr(ctx: Ctx): void {
  if (ctx.state.gameOver || !isGlib(ctx.state)) return;
  const uleft = worn(ctx, 'ringL');
  const uright = worn(ctx, 'ringR');
  const uwep0 = worn(ctx, 'weapon');
  const bimanual = uwep0 ? ctx.defs.object(uwep0.def).weapon?.bimanual === true : false;
  // C evaluates welded() (which reveals the curse) in both tests: `!(welded(uwep) && ULEFTY)`
  const leftfall =
    uleft !== null && uleft.c.item?.buc !== 'cursed' && (!uwep0 || (welded(ctx, uwep0), true)); // ULEFTY is false
  const rightfall =
    uright !== null &&
    uright.c.item?.buc !== 'cursed' &&
    (!uwep0 || !welded(ctx, uwep0) || !bimanual);
  let xfl = 0;
  const form = heroForm(ctx);
  if (!uarmg(ctx) && (leftfall || rightfall) && !(form && nolimbs(form))) {
    // changed so cursed rings don't fall off, GAN 10/30/86
    say(ctx, leftfall && rightfall ? 'glib.rings_slip' : 'glib.ring_slips', {
      fingers: fingersOrGloves(ctx, false),
    });
    xfl++;
    for (const ring of [leftfall ? uleft : null, rightfall ? uright : null]) {
      if (!ring) continue;
      ringOffQuiet(ctx, ring);
      dropx(ctx, ring);
    }
  }
  const uwep = worn(ctx, 'weapon');
  if (uwep?.c.item && uwep.def !== 'nh:aklys' && !welded(ctx, uwep)) {
    const def = ctx.defs.object(uwep.def);
    const what = isSword(def) ? '@polyarm.sword' : weaponDescr(ctx, uwep);
    // wielding several rations: "your food slips", never "foods"
    const pl = uwep.c.item.quantity > 1 && what !== '@web.class.food';
    say(ctx, `glib.wep_slip${pl ? '_pl' : ''}${xfl ? '_also' : ''}`, {
      whose: what.startsWith('@nh:corpse') ? '@towel.the' : '@towel.your',
      what,
      hand: def.weapon?.bimanual ? '@towel.hands' : '@towel.hand',
    });
    uwep.c.item.equipped = null; // setuwep(NULL)
    dropx(ctx, uwep);
  }
}

/** Registers glibr() (ahead of the timeouts, as moveloop_core()) and the Slippery condition. */
export function registerTowel(api: ModApi): void {
  api.on('endOfTurn', glibr, { priority: 2 });
  // ref: src/botl.c bl_slippery (5.0's "Slippery" condition)
  api.defineStatus({
    id: 'nh:glib',
    field: 'glib',
    value: (state) => (isGlib(state) ? 1 : null),
  });
}
