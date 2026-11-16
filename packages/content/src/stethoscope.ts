// The stethoscope: listening to a monster, yourself, a wall, the floor or the ceiling.
// ref: src/apply.c use_stethoscope(), its_dead()
//
// One use per hero move is free, another takes the move (C's `context.stethoscope_seq` against
// `hero_seq`, here `modData.nh.stethoscopeSeq`: the turn and the hero's movement points, which
// together change with each move she makes). Not ported: Deafness, being underwater, steeds,
// mapping a corpse felt while blind; mstatusline() is the probing line zap.ts prints.
import {
  DIRS,
  DIR_LIST,
  getLevel,
  getPlayer,
  inBounds,
  itemsAt,
  contents,
  trapAt,
  NORMAL_SPEED,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type Json,
  type Msg,
  type Level,
} from '@nh/core';
import { canReachFloor } from './reach';
import { freehand } from './pray';
import { isWhirly, uswallow } from './engulfstate';
import { roleIs } from './urole';
import { confdir, uMaybeImpaired } from './hackmove';
import { P, hasProp } from './props';
import { mAt } from './wormstate';
import { canSpotMon, monNam, rndmonnam } from './perception';
import { isUndetected, setUndetected } from './hidestate';
import { mappearance, seemimic } from './mimicstate';
import { mapInvisible, unmapInvisible } from './invis';
import { mstatusline, ustatusline, ZAP_DIRECTIONS } from './zap';
import { isStronghold, cvtSdoorToDoor } from './levelflags';
import { T, isSdoorId, setTerrain, surfaceKey } from './terrain';
import { ceilingKey } from './read';
import { genderedDef } from './gender';

export const STETHOSCOPE: DefId = 'nh:stethoscope';
const CORPSE: DefId = 'nh:corpse';
const STATUE: DefId = 'nh:statue';
const STATUE_TRAP: DefId = 'nh:statue_trap';

const blind = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.BLINDED);

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

type Nh = { stethoscopeSeq?: Json };

/** C's hero_seq: the turn and the hero's movement points left (both change with each move). */
function heroSeq(ctx: Ctx): [number, number] {
  return [ctx.state.turn, getPlayer(ctx.state).c.actor?.energy ?? 0];
}

/** Whether the stethoscope was already used during this move; records this use. */
function usedThisMove(ctx: Ctx): boolean {
  const seq = heroSeq(ctx);
  let nh = ctx.state.modData['nh'] as Nh | undefined;
  if (!nh || typeof nh !== 'object') {
    nh = {};
    ctx.state.modData['nh'] = nh as Json;
  }
  const old = nh.stethoscopeSeq;
  const same = Array.isArray(old) && old[0] === seq[0] && old[1] === seq[1];
  nh.stethoscopeSeq = seq;
  return same;
}

/** The data of the stethoscope's direction question. */
export const isStethData = (data: Json): data is { steth: number } =>
  data !== null &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  typeof data['steth'] === 'number';

/**
 * Applying a stethoscope: "You have no free hand." when both are taken, else "In what
 * direction?". Takes no time. ref: src/apply.c use_stethoscope()
 */
export function useStethoscope(ctx: Ctx, obj: Entity, handler: DefId): number {
  if (!freehand(ctx)) {
    say(ctx, 'loot.no_free_hand');
    return 0;
  }
  ctx.ask(
    {
      id: 'steth-direction',
      kind: 'direction',
      key: 'zap.direction',
      options: [...ZAP_DIRECTIONS],
    },
    handler,
    { steth: obj.id },
  );
  return 0;
}

/** A direction answer as getdir() leaves it: no impairment (the caller confuses it). */
export function rawDir(value: Json): Dir | 'self' | 'up' | 'down' | undefined {
  if (value === 'self' || value === 'up' || value === 'down') return value;
  return DIR_LIST.find((d) => d === value);
}

/** An unhidden monster's name with an article ("a small mimic"), never "it". x_monnam() ARTICLE_A */
function aMonNam(ctx: Ctx, mon: Entity): string {
  if (hasProp(getPlayer(ctx.state), P.HALLUC)) return `@${rndmonnam(ctx)}`;
  if (ctx.defs.monster(mon.def).flags.includes('pname')) return `=@${mon.def}`;
  return `@${genderedDef(ctx, mon)}`;
}

/**
 * The stethoscope pointed in `value`'s direction: an engulfer's status from inside (a whirly
 * one may interfere: 1 in 3, 1 in 10 for a Healer); the floor ("The floor seems healthy
 * enough.", a corpse or statue there, the crackling of hellfire in the Castle) or the ceiling
 * (out of reach); a cursed one 1 time in 2 hears only her heartbeat; then, the direction maybe
 * confused, her own status, a monster's (revealing a hider or a mimic), a secret door or passage
 * ("You hear a hollow sound.  This must be a secret door!"), a corpse or statue, or "You hear
 * nothing special." The first use in a move is free. ref: src/apply.c use_stethoscope()
 */
export function answerStethoscope(ctx: Ctx, value: Json, data: Json): number {
  if (!isStethData(data)) return 0;
  const obj = ctx.state.entities[String(data.steth)];
  if (!obj?.c.item || obj.c.item.carriedBy !== ctx.state.playerId) return 0;
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  const interference =
    !!engulfer &&
    isWhirly(ctx.defs.monster(engulfer.def)) &&
    !ctx.rng.rn2(roleIs(ctx.state, 'healer') ? 10 : 3);
  let dir = rawDir(value);
  if (dir === undefined) return 0; // ECMD_CANCEL
  let res = usedThisMove(ctx) ? NORMAL_SPEED : 0;
  const h = getPlayer(ctx.state);
  const hp = h.c.pos;
  if (!hp) return res;
  const level = getLevel(ctx.state);
  if (engulfer && dir !== 'self') {
    mstatusline(ctx, engulfer);
    return res;
  } else if (engulfer && interference) {
    say(ctx, 'steth.interferes', { mon: monNam(ctx, engulfer) });
    mstatusline(ctx, engulfer);
    return res;
  } else if (dir === 'up' || dir === 'down') {
    if (dir === 'up' || !canReachFloor(ctx, true)) {
      // cant_reach_floor(u.ux, u.uy, (u.dz < 0), TRUE, FALSE)
      if (dir === 'up')
        say(ctx, 'dig.cant_reach_ceiling', { ceiling: `@${ceilingKey(ctx, level, hp.x, hp.y)}` });
      else
        say(ctx, 'lev.cant_reach_floor', {
          surface: canReachFloor(ctx, false)
            ? '@engr.pit_bottom'
            : surfaceKey(ctx, level, hp.x, hp.y),
        });
    } else {
      const dead = itsDead(ctx, level, hp.x, hp.y);
      if (dead === 'time') res = NORMAL_SPEED;
      else if (!dead) {
        if (isStronghold(ctx.state, level)) say(ctx, 'steth.hellfire');
        else say(ctx, 'steth.floor_healthy', { surface: surfaceKey(ctx, level, hp.x, hp.y) });
      }
    }
    return res;
  } else if (obj.c.item.buc === 'cursed' && !ctx.rng.rn2(2)) {
    say(ctx, 'steth.heart_beat');
    return res;
  }
  // confdir(FALSE)
  if (uMaybeImpaired(ctx)) dir = confdir(ctx);
  if (dir === 'self') {
    ustatusline(ctx);
    return res;
  }
  const rx = hp.x + DIRS[dir].x;
  const ry = hp.y + DIRS[dir].y;
  if (!inBounds(level, rx, ry)) {
    say(ctx, 'steth.typing');
    return 0;
  }
  const mtmp = mAt(ctx.state, level.id, rx, ry);
  if (mtmp) {
    // the stethoscope reveals the true form
    const mnm = aMonNam(ctx, mtmp);
    if (isUndetected(ctx, mtmp.id)) {
      if (!canSpotMon(ctx, mtmp)) say(ctx, 'steth.hidden_there', { mon: mnm });
      setUndetected(ctx, mtmp.id, false);
    } else {
      const ap = mappearance(ctx, mtmp.id);
      if (ap) {
        seemimic(ctx, mtmp.id);
        say(ctx, 'steth.really', { what: `@${ap.id}`, mon: mnm });
      } else if (!canSpotMon(ctx, mtmp)) say(ctx, 'steth.there', { mon: mnm });
    }
    mstatusline(ctx, mtmp);
    if (!canSpotMon(ctx, mtmp)) mapInvisible(ctx, rx, ry);
    return res;
  }
  if (unmapInvisible(ctx, rx, ry)) say(ctx, 'steth.invis_moved');
  const id = level.palette[level.cells[ry * level.width + rx] ?? 0];
  if (isSdoorId(id)) {
    say(ctx, 'steth.hollow', { what: '@steth.door' });
    setTerrain(level, rx, ry, cvtSdoorToDoor(level, id));
    return res;
  }
  if (id === T.scorr) {
    say(ctx, 'steth.hollow', { what: '@steth.passage' });
    setTerrain(level, rx, ry, T.corr);
    return res;
  }
  const dead = itsDead(ctx, level, rx, ry);
  if (dead === 'time') res = NORMAL_SPEED;
  else if (!dead) say(ctx, 'steth.nothing');
  return res;
}

/**
 * A stethoscope message for a corpse or statue at (x, y) (the uppermost of the two): while
 * hallucinating "You hear a voice say, "He's dead, Jim."" (which takes the move: 'time'); "You
 * determine that this unfortunate being is dead." ("those ... are", "mostly dead" for a Healer
 * when one of them would revive); "The newt is in fine health for a statue." ("This creature"
 * when blind; a Healer hears an "extraordinary" statue trap and a "remarkable" one with
 * contents). Out of reach (levitating): no corpses and no tiny statues. False when there is
 * neither. ref: src/apply.c its_dead()
 */
function itsDead(ctx: Ctx, level: Level, x: number, y: number): boolean | 'time' {
  const pile = itemsAt(ctx.defs, ctx.state, level.id, x, y);
  const reach = canReachFloor(ctx, true);
  const corpses = reach ? pile.filter((o) => o.def === CORPSE) : [];
  const statues = pile.filter(
    (o) =>
      o.def === STATUE &&
      (reach ||
        !o.c.item?.corpseOf ||
        !ctx.defs.isMonster(o.c.item.corpseOf) ||
        ctx.defs.monster(o.c.item.corpseOf).size !== 'tiny'),
  );
  let corpse = corpses[0];
  let statue = statues[0];
  // when both corpse and statue are present, pick the uppermost one
  if (corpse && statue) {
    if (pile.indexOf(statue) < pile.indexOf(corpse)) corpse = undefined;
    else statue = undefined;
  }
  const moreCorpses = corpses.length > 1;
  const hp = getPlayer(ctx.state).c.pos;
  const here = !!hp && hp.x === x && hp.y === y;
  if (!corpse && !statue) return false;
  if (hasProp(getPlayer(ctx.state), P.HALLUC)) {
    let who: string;
    if (!corpse) who = '@steth.jim.stoned';
    else if (corpse.c.item?.quantity === 1 && !moreCorpses) {
      // most corpses don't retain the monster's sex: the species' (he, she, it)
      const of = corpse.c.item.corpseOf;
      const f = of && ctx.defs.isMonster(of) ? ctx.defs.monster(of).flags : [];
      who = f.includes('female')
        ? '@steth.jim.she'
        : f.includes('male')
          ? '@steth.jim.he'
          : '@steth.jim.it';
    } else who = '@steth.jim.they';
    say(ctx, 'steth.jim', { who });
    return 'time';
  }
  if (corpse) {
    const one = corpse.c.item?.quantity === 1 && !moreCorpses;
    let reviver = false;
    if (roleIs(ctx.state, 'healer')) {
      const ids = new Set(corpses.slice(corpses.indexOf(corpse)).map((c) => c.id));
      reviver = ctx.state.timers.some(
        (t) => t.kind === 'nh:revive_mon' && ids.has((t.data as { id?: number } | null)?.id ?? -1),
      );
    }
    const which = one ? (here ? 'this' : 'that') : here ? 'these' : 'those';
    say(ctx, `steth.dead.${which}`, { mostly: reviver ? '@steth.mostly' : '' });
    return true;
  }
  if (!statue) return false;
  const of = statue.c.item?.corpseOf;
  const mdef = of && ctx.defs.isMonster(of) ? ctx.defs.monster(of) : null;
  let how = 'fine';
  if (roleIs(ctx.state, 'healer')) {
    if (trapAt(level, x, y)?.def === STATUE_TRAP) how = 'extraordinary';
    else if (contents(ctx.state, statue.id).length > 0) how = 'remarkable';
  }
  if (blind(ctx))
    say(ctx, 'steth.statue_blind', {
      what: `@steth.${here ? 'this' : 'that'}_${mdef?.flags.includes('humanoid') ? 'person' : 'creature'}`,
      how: `@steth.${how}`,
    });
  else
    say(ctx, 'steth.statue', {
      mon: mdef ? (mdef.flags.includes('pname') ? `=@${mdef.id}` : `@${mdef.id}`) : '@nh:statue',
      how: `@steth.${how}`,
    });
  return true;
}
