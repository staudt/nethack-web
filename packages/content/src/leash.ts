// The leash: leashing an adjacent pet, pulling on it as the hero walks away, and its coming
// loose. ref: src/apply.c use_leash(), use_leash_core(), leashable(), check_leash(), um_dist();
// src/do.c canletgo() (LEASH); src/pickup.c in_container() (LEASH); src/objnam.c doname_base()
// (" (attached to ...)")
//
// The state is leashstate.ts. A leashed pet stays within reach (dogmove.ts) and follows her to
// another level when next to her (dog.ts keepdogs()). Not ported (DEVIATIONS "Roles and races
// (m22a)"): dragging a leashed pet along (dog_move()'s "incredible kludge" and next_to_u()'s
// mnexto()), so a cursed leash never holds her back from the stairs or a teleport; steeds;
// polymorph into a form the leash slips off; the conduct counters.
import {
  DIRS,
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
  type ModApi,
  type MonsterDef,
} from '@nh/core';
import {
  LEASH,
  MAXLEASHED,
  hisOf,
  leashMon,
  leashesInUse,
  mUnleash,
  numberLeashed,
  oUnleash,
  setCheckLeash,
  setLeash,
} from './leashstate';
import { uswallow } from './engulfstate';
import { canSpotMon, monNam } from './perception';
import { canseemon, mapInvisible, markedUnseen, unmapInvisible } from './invis';
import { mAt } from './wormstate';
import { breathlessMon, hasHead, nolimbs } from './mondata';
import { growl, whimper, yelp } from './dog';
import { monsterDied } from './mondeath';
import { experienceFor, gainExperience } from './hero';
import { rawDir } from './stethoscope';
import { ZAP_DIRECTIONS } from './zap';

export { LEASH };

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/mondata.h unsolid(): vortices, lights, the air elemental and the like */
const unsolid = (def: MonsterDef): boolean => def.flags.includes('unsolid');

/** ref: src/apply.c leashable() */
export function leashable(def: MonsterDef): boolean {
  return def.id !== 'nh:long_worm' && !unsolid(def) && (!nolimbs(def) || hasHead(def));
}

/** The data of the leash's direction question. */
export const isLeashData = (data: Json): data is { leash: number } =>
  data !== null &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  typeof data['leash'] === 'number';

/**
 * Applying a leash: not from inside an engulfer ("You can't leash the purple worm from
 * inside."), not a third one ("You cannot leash any more pets."), else "In what direction?".
 * ref: src/apply.c use_leash()
 */
export function useLeash(ctx: Ctx, obj: Entity, handler: DefId): number {
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  if (engulfer) {
    const held = leashMon(ctx, obj.id);
    say(
      ctx,
      held === null
        ? 'leash.from_inside'
        : held === engulfer.id
          ? 'leash.un_from_inside'
          : 'leash.un_any_inside',
      { mon: monNam(ctx, engulfer) },
    );
    return 0;
  }
  if (leashMon(ctx, obj.id) === null && numberLeashed(ctx) >= MAXLEASHED) {
    say(ctx, 'leash.no_more');
    return 0;
  }
  ctx.ask(
    {
      id: 'leash-direction',
      kind: 'direction',
      key: 'zap.direction',
      options: [...ZAP_DIRECTIONS],
    },
    handler,
    { leash: obj.id },
  );
  return 0;
}

/**
 * The leash applied toward `value` (get_adjacent_loc()): "Never mind." with no direction;
 * herself, up or down "Leash yourself?  Very funny..."; nothing there "There is no creature
 * there." (forgetting an `I`); else use_leash_core(). ref: src/apply.c use_leash()
 */
export function answerLeash(ctx: Ctx, value: Json, data: Json): number {
  if (!isLeashData(data)) return 0;
  const obj = ctx.state.entities[String(data.leash)];
  if (!obj?.c.item || obj.c.item.carriedBy !== ctx.state.playerId) return 0;
  const dir = rawDir(value);
  if (dir === undefined) {
    say(ctx, 'leash.never_mind');
    return 0;
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return 0;
  if (dir === 'self' || dir === 'up' || dir === 'down') {
    say(ctx, 'leash.yourself');
    return 0;
  }
  const level = getLevel(ctx.state);
  const x = hp.x + DIRS[dir].x;
  const y = hp.y + DIRS[dir].y;
  if (!inBounds(level, x, y)) return 0;
  const mtmp = mAt(ctx.state, level.id, x, y);
  if (!mtmp) {
    say(ctx, 'leash.no_creature');
    unmapInvisible(ctx, x, y);
    return NORMAL_SPEED;
  }
  useLeashCore(ctx, obj, mtmp, x, y, canSpotMon(ctx, mtmp));
  return NORMAL_SPEED;
}

/**
 * Leashing or unleashing the monster at (x, y): an unseen one not marked `I` "You fail to leash
 * something." (and it is marked); a wild one "The jackal cannot be leashed!" ("is not
 * leashed!"); a free leash goes on a pet that is not leashed yet, solid, with limbs or a head,
 * and not a long worm ("You slip the leash around your kitten.", waking it); a leash in use
 * comes off its own pet unless cursed ("The leash would not come off!").
 * ref: src/apply.c use_leash_core()
 */
function useLeashCore(
  ctx: Ctx,
  obj: Entity,
  mtmp: Entity,
  x: number,
  y: number,
  spotmon: boolean,
): void {
  const it = obj.c.item;
  const m = mtmp.c.monster;
  if (!it || !m) return;
  const held = leashMon(ctx, obj.id);
  const def = ctx.defs.monster(mtmp.def);
  const your = spotmon ? '@leash.your' : '';
  const lmon = monNam(ctx, mtmp);
  if (!spotmon && !markedUnseen(ctx, x, y)) {
    // for the unleash case, we don't verify whether this unseen monster is the creature
    // attached to the current leash
    say(ctx, held !== null ? 'leash.fail_un' : 'leash.fail');
    mapInvisible(ctx, x, y);
  } else if (!m.tame) {
    say(ctx, held === null ? 'leash.cannot_be' : 'leash.is_not', { mon: lmon });
  } else if (held === null) {
    // applying a leash which isn't currently in use
    if (leashesInUse(ctx).some(([, mon]) => mon === mtmp.id)) {
      say(ctx, 'leash.already', { mon: spotmon ? lmon : '@leash.creature' });
    } else if (unsolid(def)) {
      say(ctx, 'leash.fall_off');
    } else if (nolimbs(def) && !hasHead(def)) {
      say(ctx, 'leash.no_extremities', { mon: lmon });
    } else if (!leashable(def)) {
      const tail = mtmp.c.pos?.x !== x || mtmp.c.pos.y !== y;
      say(ctx, tail ? 'leash.wont_fit_tail' : 'leash.wont_fit', { your, mon: lmon });
    } else {
      say(ctx, 'leash.slip', { your, mon: lmon });
      setLeash(ctx, obj.id, mtmp.id);
      m.asleep = false;
    }
  } else {
    // applying a leash which is currently in use
    if (held !== mtmp.id) {
      say(ctx, 'leash.not_attached');
    } else if (it.buc === 'cursed') {
      say(ctx, 'leash.wont_come_off');
      it.known.buc = true; // set_bknown(obj, 1)
    } else {
      oUnleash(ctx, obj.id);
      say(ctx, 'leash.remove', { your, mon: lmon });
    }
  }
}

/** ref: src/apply.c um_dist(): (x, y) is more than `n` squares from the hero either way */
function umDist(ctx: Ctx, x: number, y: number, n: number): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  return !hp || Math.abs(hp.x - x) > n || Math.abs(hp.y - y) > n;
}

/**
 * The hero moved from (x, y): each leashed pet she moved away from that is more than 3 squares
 * off pulls: a cursed leash chokes a breathing pet (to death past 5 squares or when it runs out
 * of hit points: "Your leash chokes the kitten to death!", her kill; else "The kitten is choked
 * by the leash!" and it may grow less tame), an ordinary one snaps loose past 5 squares ("The
 * kitten's leash snaps loose!") or "You pull on the leash." and the pet growls, yelps or
 * whimpers. ref: src/apply.c check_leash()
 */
export function checkLeash(ctx: Ctx, x: number, y: number): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return;
  for (const [l, mid] of leashesInUse(ctx)) {
    const otmp = ctx.state.entities[String(l)];
    const mtmp = ctx.state.entities[String(mid)];
    const mp = mtmp?.c.pos;
    if (!otmp?.c.item || !mtmp?.c.monster || !mp || mp.level !== hp.level) {
      // "leash in use isn't attached to anything?"
      oUnleash(ctx, l);
      continue;
    }
    const d2 = (ax: number, ay: number): number => (ax - mp.x) ** 2 + (ay - mp.y) ** 2;
    if (d2(hp.x, hp.y) <= d2(x, y)) continue;
    if (!umDist(ctx, mp.x, mp.y, 3)) continue; // still close enough
    const def = ctx.defs.monster(mtmp.def);
    const hpm = mtmp.c.hp;
    if (otmp.c.item.buc === 'cursed' && !breathlessMon(def)) {
      let dies = umDist(ctx, mp.x, mp.y, 5);
      if (!dies && hpm) {
        hpm.cur -= ctx.rng.rnd(2);
        dies = hpm.cur <= 0;
      }
      if (dies) {
        say(ctx, 'leash.chokes_to_death', { mon: monNam(ctx, mtmp) });
        // xkilled(mtmp, XKILL_NOMSG): experience, alignment and luck as her kill
        const lvl = mtmp.c.monster.level ?? 0;
        monsterDied(ctx, mtmp.id, true);
        if (!ctx.state.entities[String(mtmp.id)]?.c.monster)
          gainExperience(ctx, ctx.state.playerId, experienceFor(def, lvl, ctx.state));
        if (ctx.state.gameOver) return;
      } else {
        say(ctx, 'leash.choked', { mon: monNam(ctx, mtmp) });
        // tameness eventually drops to 1 here (never 0)
        const m = mtmp.c.monster;
        if (m.tame && ctx.rng.rn2(m.tame)) m.tame--;
      }
    } else if (umDist(ctx, mp.x, mp.y, 5)) {
      say(ctx, 'leash.snaps', { mon: monNam(ctx, mtmp) });
      oUnleash(ctx, l);
    } else {
      say(ctx, 'leash.pull');
      if ((def.sound ?? 'silent') !== 'silent') {
        const r = ctx.rng.rn2(3);
        if (r === 0) growl(ctx, mtmp);
        else if (r === 1) yelp(ctx, mtmp);
        else whimper(ctx, mtmp);
      }
    }
  }
}

/**
 * Once a turn: a leash that left her pack (stolen, eaten, destroyed) is no longer attached
 * (o_unleash()); a pet that died lets go silently (m_detach()); one taken to another level
 * leaves it slack ("Your leash goes slack.", teleport_pet()); one no longer tame pulls free
 * ("The kitten pulls free of its leash!", m_unleash(mtmp, TRUE) where it is untamed).
 */
export function leashUpkeep(ctx: Ctx): void {
  const hp = getPlayer(ctx.state).c.pos;
  for (const [l, mid] of leashesInUse(ctx)) {
    const otmp = ctx.state.entities[String(l)];
    const mtmp = ctx.state.entities[String(mid)];
    if (otmp?.c.item?.carriedBy !== ctx.state.playerId || !mtmp?.c.monster) {
      oUnleash(ctx, l);
      continue;
    }
    if (!hp || mtmp.c.pos?.level !== hp.level) {
      say(ctx, 'leash.goes_slack');
      oUnleash(ctx, l);
    } else if (!mtmp.c.monster.tame) mUnleashFeedback(ctx, mtmp);
  }
}

/** m_unleash(mtmp, TRUE): "The kitten pulls free of its leash!" or "Your leash falls slack." */
export function mUnleashFeedback(ctx: Ctx, mtmp: Entity): void {
  mUnleash(ctx, mtmp, { seen: canseemon(ctx, mtmp), name: monNam(ctx, mtmp) });
}

export { hisOf };

export function registerLeash(api: ModApi): void {
  setCheckLeash(checkLeash);
  api.on('endOfTurn', leashUpkeep);
}
