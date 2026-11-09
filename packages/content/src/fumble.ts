// Fumbling: fumble boots and gauntlets of fumbling make the hero trip every 1 to 20 turns while
// she walks. ref: src/timeout.c nh_timeout() FUMBLING, slip_or_trip(); src/allmain.c u.umoved
//
// The trip timer is the Fumbling property's timeout (HFumbling & TIMEOUT), started when the
// item goes on (dowear.ts) and restarted each time it runs out while she still fumbles. C trips
// her only when the move that ended the turn moved her (`u.umoved`): the square she acted from is
// kept in `modData.nh.fumbleFrom` while the timer runs, and `modData.nh.umoved` says she moved.
// Both are written only while she fumbles, so other games keep their state.
//
// Not ported: ice (HFumbling's FROMOUTSIDE bit, slipping and hurtling), steeds, pools (an object
// under water), Deafness (she always hears the noise), "it"/"them" for the object just named by
// "You see here" (she trips over its full name), body parts of other forms (her feet).
import {
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
import { P, hasProp, incrItimeout, setTimeoutExpiry, timeoutLeft, wornIn } from './props';
import { invWeight } from './stats';
import { touchPetrifies } from './stonestate';
import { instapetrify } from './stonetouch';
import { uInAir } from './trapstate';

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
  const otmp: Entity | undefined = p
    ? itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y)[0]
    : undefined;
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
  const h = getPlayer(ctx.state);
  if (hasProp(h, P.FUMBLING)) incrItimeout(ctx.state, h, P.FUMBLING, ctx.rng.rnd(20));
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
