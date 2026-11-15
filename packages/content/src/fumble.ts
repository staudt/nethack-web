// Fumbling: fumble boots and gauntlets of fumbling make the hero trip every 1 to 20 turns while
// she walks. ref: src/timeout.c nh_timeout() FUMBLING, slip_or_trip(); src/allmain.c u.umoved;
// src/hack.c slippery_ice_fumbling()
//
// The trip timer is the Fumbling property's timeout (HFumbling & TIMEOUT), started when the
// item goes on (dowear.ts) and restarted each time it runs out while she still fumbles. C trips
// her only when the move that ended the turn moved her (`u.umoved`): the square she acted from is
// kept in `modData.nh.fumbleFrom` while the timer runs, and `modData.nh.umoved` says she moved.
// Both are written only while she fumbles, so other games keep their state.
//
// Ice: walking on it sets HFumbling's FROMOUTSIDE bit (the permanent flag here: nothing else
// gives Fumbling intrinsically) with a one-turn timeout, so she may slip at the end of the turn.
// Not ported: steeds, Deafness (she always hears the noise), "it"/"them" for the object just
// named by "You see here" (she trips over its full name), body parts of other forms (her feet),
// sliding a square on ice (no hurtle() for the hero).
import {
  getLevel,
  getPlayer,
  itemsAt,
  type Ctx,
  type Entity,
  type LevelId,
  type ModApi,
  type Msg,
} from '@nh/core';
import { wakeNearby } from './btrapped';
import { nomulNow } from './hunger';
import { nhData } from './items';
import { doname, xnameOf } from './objnam';
import {
  P,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  setIntrinsic,
  setItimeout,
  setTimeoutExpiry,
  timeoutLeft,
  wornIn,
} from './props';
import { invWeight } from './stats';
import { confdir } from './hackmove';
import { isIce, isPool } from './liquid';
import { isClinger, isFloater, isWhirlyDef } from './mondata';
import { touchPetrifies } from './stonestate';
import { instapetrify } from './stonetouch';
import { flying, levitating, uInAir } from './trapstate';
import { heroForm } from './upoly';
import { uinwater } from './uwater';

/** ref: include/weight.h WT_NOISY_INV: inv_weight() above -500 makes a lot of noise */
const WT_NOISY_INV = 500;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

type FumbleData = { fumbleFrom?: { level: LevelId; x: number; y: number }; umoved?: boolean };
const data = (ctx: Pick<Ctx, 'state'>): FumbleData => nhData(ctx) as FumbleData;

/**
 * The hero trips over what lies here, or over her own feet. ref: src/timeout.c slip_or_trip()
 * (on foot; no ice, steeds or pools)
 */
export function slipOrTrip(ctx: Ctx): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  const halluc = hasProp(h, P.HALLUC);
  const level = p ? getLevel(ctx.state, p.level) : undefined;
  // vobj_at(): what lies under water (she is not in it) is not tripped over
  const covered = !!p && !!level && isPool(ctx, level, p.x, p.y) && !uinwater(ctx);
  const otmp: Entity | undefined =
    p && !covered ? itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y)[0] : undefined;
  if (otmp && p) {
    // trip over something in particular
    const blind = hasProp(h, P.BLINDED);
    const one = (otmp.c.item?.quantity ?? 1) === 1;
    let what: Msg;
    if (!blind)
      what = halluc ? xnameOf(ctx.state, ctx.defs, otmp) : doname(ctx.state, ctx.defs, otmp);
    else {
      const rock = itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).find((o) => o.def === 'nh:rock');
      const k = !rock ? 'something' : (rock.c.item?.quantity ?? 1) === 1 ? 'a_rock' : 'some_rocks';
      what = { key: `fumble.${halluc ? 'cap.' : ''}${k}` };
    }
    if (halluc) say(ctx, `fumble.egads${blind ? '_blind' : ''}${one ? '' : '_pl'}`, { what });
    else say(ctx, blind ? 'fumble.trip_over_blind' : 'fumble.trip_over', { what });
    const pm = otmp.c.item?.corpseOf;
    if (
      !wornIn(ctx.state, h.id, 'boots') &&
      otmp.def === 'nh:corpse' &&
      pm &&
      touchPetrifies(ctx.defs.monster(pm)) &&
      !hasProp(h, P.STONE_RES)
    )
      instapetrify(ctx, `@killer.ston.tripping.${pm}`);
    return;
  }
  const onIce = !!p && !!level && isIce(ctx, level, p.x, p.y);
  if (hasIntrinsic(h, P.FUMBLING) || (onIce && !ctx.rng.rn2(3))) {
    // is fumbling from ice alone? "You slip on the ice." / "You slide off the ice."
    say(ctx, `fumble.${ctx.rng.rn2(2) ? 'slip' : 'slide'}_${onIce ? 'on' : 'off'}_ice`);
    if (!ctx.rng.rn2(10 + (h.c.attributes?.dex ?? 10))) {
      // maybe slip in a random direction, after the hero has already changed location: C
      // hurtles her one square (not back to where the move started); the hero has no hurtle()
      // here (DEVIATIONS "Water"), so only the direction is drawn
      confdir(ctx);
    }
    return;
  }
  switch (ctx.rng.rn2(4)) {
    case 1:
      say(ctx, halluc ? 'fumble.own_elbow' : 'fumble.own_feet');
      break;
    case 2:
      say(ctx, halluc ? 'fumble.banana_peel' : 'fumble.nearly_fall');
      break;
    case 3:
      say(ctx, 'fumble.flounder');
      break;
    default:
      say(ctx, 'fumble.stumble');
      break;
  }
}

/**
 * The trip timer ran out: if her last move moved her (and she is not in the air) she trips, is
 * helpless for two turns and, carrying much, makes a lot of noise; while she still fumbles the
 * timer starts again. ref: src/timeout.c nh_timeout() case FUMBLING
 */
function fumbleExpired(ctx: Ctx): void {
  const d = data(ctx);
  const moved = d.umoved === true;
  delete d.umoved;
  if (moved && !uInAir(ctx)) {
    slipOrTrip(ctx);
    if (ctx.state.gameOver) return;
    nomulNow(ctx, 2, 'helpless.fumbling', null); // nomovemsg ""
    // the more you are carrying the more likely you are to make noise when you fumble
    if (invWeight(ctx.state, ctx.defs, ctx.state.playerId) > -WT_NOISY_INV) {
      say(ctx, 'fumble.noise');
      wakeNearby(ctx);
    }
  }
  // from outside means slippery ice; don't reset counter if that's the only fumble reason
  const h = getPlayer(ctx.state);
  setIntrinsic(h, P.FUMBLING, false);
  if (hasProp(h, P.FUMBLING)) incrItimeout(ctx.state, h, P.FUMBLING, ctx.rng.rnd(20));
}

/**
 * Before a move: on ice she does not levitate over, unless snow boots, cold resistance, flight
 * or a floating, clinging or whirly form keep her steady, 1 time in 2 she will slip at the end of
 * the turn (Fumbling from outside with a one-turn timeout); off the ice that is forgotten.
 * ref: src/hack.c slippery_ice_fumbling() (no steeds)
 */
export function slipperyIceFumbling(ctx: Ctx): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  if (!p) return;
  let onIce = !levitating(ctx) && isIce(ctx, getLevel(ctx.state, p.level), p.x, p.y);
  if (onIce) {
    const boots = wornIn(ctx.state, h.id, 'boots');
    const form = heroForm(ctx);
    if (
      (boots && ctx.state.appearances[boots.def] === 'nh:snow_boots') ||
      hasProp(h, P.COLD_RES) ||
      flying(ctx) ||
      (form && (isFloater(form) || isClinger(form) || isWhirlyDef(form)))
    )
      onIce = false;
    else if (!ctx.rng.rn2(2)) {
      setIntrinsic(h, P.FUMBLING, true);
      setItimeout(ctx.state, h, P.FUMBLING, 1); // slip on next move
      // the move that follows counts for u.umoved (the trip timer was not running before it)
      data(ctx).fumbleFrom = { level: p.level, x: p.x, y: p.y };
    }
  }
  if (!onIce && hasIntrinsic(h, P.FUMBLING)) setIntrinsic(h, P.FUMBLING, false);
}

/** Registers the trip timer's end and the u.umoved bookkeeping. */
export function registerFumbling(api: ModApi): void {
  setTimeoutExpiry(P.FUMBLING, fumbleExpired);
  api.on('beforeAction', (ctx) => {
    const h = getPlayer(ctx.state);
    const d = data(ctx);
    if (timeoutLeft(ctx.state, h, P.FUMBLING) > 0 && h.c.pos)
      d.fumbleFrom = { level: h.c.pos.level, x: h.c.pos.x, y: h.c.pos.y };
    else delete d.fumbleFrom;
    delete d.umoved; // u.umoved = FALSE before each command
    return 'continue';
  });
  api.on('afterAction', (ctx) => {
    const d = data(ctx);
    const from = d.fumbleFrom;
    if (!from) return;
    delete d.fumbleFrom;
    const p = getPlayer(ctx.state).c.pos;
    if (p && (p.level !== from.level || p.x !== from.x || p.y !== from.y)) d.umoved = true;
  });
}
