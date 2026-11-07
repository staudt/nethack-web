// Rolling boulder traps: the boulder that waits on the trap's launch spot rolls across the trap
// when someone steps on it. ref: src/trap.c trapeffect_rolling_boulder_trap(), launch_obj()
// (ROLL style only: nothing else here launches objects); src/hack.c moverock() (a boulder
// pushed onto the trap rolls away)
//
// Module graph: the roll hits monsters (mthrowu.ts ohitmon()), the hero (thitu()), fills pits
// (flooreffects.ts) and teleports (rloco.ts, above trap.ts), so this module sits above trap.ts and
// hands its effects in at registration (`setTrapEffect`), as magictrap.ts does; moverock.ts gets
// the push case the same way (`setRollingPush`).
//
// Not ported: giants snatching the boulder (no giants), land mines on the way (none exist yet),
// boulders migrating to another level through a level teleporter (no object migration: the
// boulder is gone), the bones-file launch spot, deafness, steeds, water and lava.
import {
  getPlayer,
  inBounds,
  isVisible,
  cellIndex,
  shownId,
  trapAt,
  type Ctx,
  type Entity,
  type Level,
  type Msg,
  type Pos,
  type Trap,
} from '@nh/core';
import { BOULDER, boulderAt } from './boulder';
import { monsterIdAt } from './combat';
import { diggingOf, setDigging } from './digstate';
import { dmgvalSized } from './dmgval';
import { stopOccupation } from './eat';
import { boulderFlooreffects } from './flooreffects';
import { experienceFor, gainExperience } from './hero';
import { placeObject, placeOnFloor } from './items';
import { monsterDied } from './mondeath';
import { setRollingPush } from './moverock';
import { ohitmon, thitu } from './mthrowu';
import { wakeNearto } from './noise';
import { canSpotMon, monNam } from './perception';
import { P, hasProp } from './props';
import { rloco } from './rloco';
import { randomTeleportLevel } from './teleport';
import { isStwallId, terrainIdAt, T } from './terrain';
import {
  TRAP,
  cansee,
  caughtOr,
  dataOf,
  isHole,
  isPit,
  seetrap,
  setTrapEffect,
  type TrapResult,
} from './trap';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * How the boulder was set off. `known`: by the hero, on a trap she had seen (C's LAUNCH_KNOWN,
 * kept on the boulder as `otrapped`: its kills are hers); `unseen`: by a monster she does not see
 * (LAUNCH_UNSEEN: the start is heard); `monMoving`: by a monster (context.mon_moving).
 */
export interface RollStyle {
  known?: boolean;
  unseen?: boolean;
  monMoving?: boolean;
}

const sgn = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

const terrainOf = (ctx: Ctx, level: Readonly<Level>, x: number, y: number) => {
  const id = terrainIdAt(level, x, y);
  return id === undefined ? null : ctx.defs.terrain(id);
};

/** ref: closed_door() */
const closedDoor = (ctx: Ctx, level: Readonly<Level>, x: number, y: number): boolean => {
  const t = terrainOf(ctx, level, x, y);
  return t?.door === 'closed' || t?.door === 'locked';
};

const monsterAt = (ctx: Ctx, levelId: string, x: number, y: number): Entity | null => {
  const id = monsterIdAt(ctx, { x, y }, levelId);
  return id === null || id === ctx.state.playerId ? null : (ctx.state.entities[String(id)] ?? null);
};

/** xkilled(mtmp, XKILL_NOMSG): the hero's kill, without "You kill it!". ref: src/mon.c xkilled() */
function heroKills(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const level = mon.c.monster?.level ?? 0;
  monsterDied(ctx, mon.id, true);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * Rolls a boulder from (x1, y1) towards (x2, y2) on the hero's level (or from (x2, y2) back
 * towards (x1, y1) when the boulder lies there instead). Returns 0 when there was no boulder, 1
 * when it came to rest somewhere and 2 when it was used up (a monster hit stops it where it was
 * hit, a pit or hole swallows it, a teleporter sends it away).
 * ref: src/trap.c launch_obj() with style ROLL: it hits monsters (ohitmon() with a negative
 * range: a miss rolls on) and the hero (`thitu(9 + spe, dmgval())`), falls into pits and holes
 * (flooreffects()), vanishes on teleporters ("Suddenly the rolling boulder disappears!"), sets
 * another boulder in motion, crashes through closed doors and stops before walls, rock and
 * trees ("Thump!") and iron bars ("Whang!").
 */
export function launchObj(
  ctx: Ctx,
  x1In: number,
  y1In: number,
  x2In: number,
  y2In: number,
  style: RollStyle,
): 0 | 1 | 2 {
  const levelId = ctx.state.currentLevel;
  const level = ctx.state.levels[levelId];
  if (!level) return 0;
  let x1 = x1In;
  let y1 = y1In;
  let x2 = x2In;
  let y2 = y2In;
  let otmp = boulderAt(ctx, levelId, x1, y1);
  // Try the other side too, for rolling boulder traps
  if (!otmp) {
    otmp = boulderAt(ctx, levelId, x2, y2);
    if (!otmp) return 0;
    [x1, y1, x2, y2] = [x2, y2, x1, y1]; // swap 'em
  }
  let singleobj: Entity = otmp; // boulders never stack: quan is 1
  delete singleobj.c.pos; // obj_extract_self()
  // a pick-axe chopping this boulder must not think it is resuming the dig
  const dig = diggingOf(ctx);
  if (dig && dig.x === x1 && dig.y === y1) setDigging(ctx, null);

  const monMoving = style.monMoving === true;
  let known = style.known === true; // singleobj->otrapped
  let dist = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); // distmin()
  let x = x1;
  let y = y1;
  const dx = sgn(x2 - x1);
  const dy = sgn(y2 - y1);
  const hp = getPlayer(ctx.state).c.pos;
  if (style.unseen) {
    if (cansee(ctx, levelId, x1, y1)) say(ctx, 'roll.see_start');
    else if (hasProp(getPlayer(ctx.state), P.HALLUC)) say(ctx, 'roll.hear_bowling');
    else {
      const distu = hp ? (hp.x - x1) ** 2 + (hp.y - y1) ** 2 : Infinity;
      say(ctx, distu <= 4 * 4 ? 'roll.hear_nearby' : 'roll.hear_distance');
    }
  }

  // the flight on screen (tmp_at()): the squares the hero sees, shown before the next message
  let path: Pos[] = [];
  const seenAt = (px: number, py: number): boolean =>
    inBounds(level, px, py) && isVisible(ctx.state, cellIndex(level, px, py));
  const flush = (): void => {
    if (path.length === 0) return;
    ctx.emit({ type: 'projectile', g: shownId(ctx.state, BOULDER), path });
    path = [];
  };
  if (seenAt(x, y)) path.push({ x, y });

  let usedUp = false;
  const stopHere = (): void => {
    x2 = x;
    y2 = y;
  };
  while (dist-- > 0 && !usedUp) {
    if (!inBounds(level, x + dx, y + dy)) {
      stopHere(); // use current spot for final boulder placement
      break;
    }
    x += dx;
    y += dy;
    if (seenAt(x, y)) path.push({ x, y });

    const mtmp = monsterAt(ctx, levelId, x, y);
    if (mtmp) {
      // (no giants: throws_rocks() monsters snatching the boulder)
      const credit = !monMoving && known; // "don't blame hero for unknown rolling boulder trap"
      // a hit stops it: ohitmon()'s drop_throw() leaves it here (or in the pit here)
      const hit = ohitmon(ctx, mtmp.id, singleobj.id, -1, { level: levelId, x, y }, flush, {
        monMoving,
        ...(credit ? { onKill: (m: Entity) => heroKills(ctx, m) } : {}),
      });
      if (hit) {
        usedUp = true;
        break;
      }
    } else if (hp && hp.level === levelId && hp.x === x && hp.y === y) {
      const dam = dmgvalSized(ctx.rng, singleobj, ctx.defs.object(singleobj.def), false);
      ctx.interrupt(); // if (gm.multi) nomul(0)
      flush();
      if (thitu(ctx, 9 + (singleobj.c.item?.spe ?? 0), dam, singleobj, null)) stopOccupation(ctx);
    }
    // style == ROLL (down_gate(): a boulder is never shipped down a hole; flooreffects() fills it)
    const t = trapAt(level, x, y);
    if (t) {
      let stopped = false;
      switch (t.def) {
        case TRAP.levelTele:
        case TRAP.tele: {
          // 20% chance of picking current level: the trap does nothing
          if (t.def === TRAP.levelTele && randomTeleportLevel(ctx, level) === level.depth) break;
          flush();
          if (cansee(ctx, levelId, x, y)) say(ctx, 'roll.disappears');
          else say(ctx, 'roll.stop_abruptly');
          known = false;
          if (t.def === TRAP.tele) {
            placeObject(ctx, singleobj.id, levelId, x, y);
            rloco(ctx, singleobj);
          } else ctx.remove(singleobj.id); // add_to_migration(): not ported
          seetrap(t);
          usedUp = true;
          stopped = true;
          break;
        }
        default:
          if (isPit(t.def) || isHole(t.def)) {
            // the boulder won't be used up if there is a monster in the trap; stop rolling anyway
            stopHere();
            flush();
            if (boulderFlooreffects(ctx, singleobj, x2, y2, 'fall', false, monMoving))
              usedUp = true;
            dist = -1; // stop rolling immediately
            stopped = true;
          }
      }
      if (stopped) break;
    }
    // flooreffects(): nothing more for a boulder on this square (no pools or lava)
    const otmp2 = boulderAt(ctx, levelId, x, y);
    if (otmp2) {
      const fx = x + dx;
      const fy = y + dy;
      const next = inBounds(level, fx, fy) ? terrainIdAt(level, fx, fy) : undefined;
      const hits =
        !inBounds(level, fx, fy) ||
        !dist ||
        isStwallId(next) ||
        next === T.tree ||
        next === T.sdoor_h ||
        next === T.sdoor_v ||
        next === T.sdoor_locked_h ||
        next === T.sdoor_locked_v ||
        next === T.scorr; // IS_OBSTRUCTED()
      flush();
      say(
        ctx,
        !cansee(ctx, levelId, x, y)
          ? 'roll.loud_crash'
          : hits
            ? 'roll.loud_crash_hits'
            : 'roll.loud_crash_motion',
      );
      delete otmp2.c.pos; // obj_extract_self(otmp2)
      // pass off the otrapped flag to the next boulder
      placeOnFloor(ctx, singleobj.id, levelId, x, y);
      singleobj = otmp2;
      wakeNearto(ctx, x, y, 10 * 10);
    }
    if (closedDoor(ctx, level, x, y)) {
      flush();
      if (cansee(ctx, levelId, x, y)) say(ctx, 'roll.door');
      setTerrainDoorway(ctx, level, x, y);
    }
    // if about to hit something, do so now
    if (dist > 0 && inBounds(level, x + dx, y + dy)) {
      const fx = x + dx;
      const fy = y + dy;
      const typ = terrainIdAt(level, fx, fy);
      if (typ === T.iron_bars) {
        stopHere(); // object stops here
        // hits_bars(&singleobj, x2, y2, fx, fy, !rn2(20), 0): a boulder always hits and never
        // breaks; hit_bars(): "Whang!", noise 4 * 4 at the bars
        ctx.rng.rn2(20);
        flush();
        say(ctx, 'roll.whang');
        wakeNearto(ctx, fx, fy, 4 * 4);
        break;
      } else if (isStwallId(typ) || typ === T.tree) {
        stopHere(); // object stops here
        flush();
        say(ctx, 'roll.thump');
        wakeNearto(ctx, x2, y2, 16);
        break;
      }
    }
  }
  flush();
  if (!usedUp) {
    placeOnFloor(ctx, singleobj.id, levelId, x2, y2);
    return 1;
  }
  return 2;
}

/** A closed door the boulder crashes through: D_BROKEN, a doorway here. */
function setTerrainDoorway(ctx: Ctx, level: Level, x: number, y: number): void {
  const pi = level.palette.indexOf(T.doorway);
  level.cells[cellIndex(level, x, y)] = pi === -1 ? level.palette.push(T.doorway) - 1 : pi;
  ctx.emit({ type: 'doorOpened', pos: { x, y } });
}

const ends = (trap: Trap): { a: Pos; b: Pos } => {
  const d = dataOf(trap);
  return { a: d.launch ?? { x: trap.x, y: trap.y }, b: d.launch2 ?? { x: trap.x, y: trap.y } };
};

/**
 * The hero sets off a rolling boulder trap: "Click!  You trigger a rolling boulder trap!", and
 * its boulder rolls; with none, "Fortunately for you, no boulder was released." ("No boulder was
 * released." when she knew the trap). The trap stays (as in NetHack 3.7).
 * ref: src/trap.c trapeffect_rolling_boulder_trap()
 */
function rollingYou(ctx: Ctx, trap: Trap): void {
  const known = trap.seen;
  seetrap(trap); // feeltrap()
  say(ctx, 'trap.rolling.trigger');
  const { a, b } = ends(trap);
  if (!launchObj(ctx, a.x, a.y, b.x, b.y, { known }))
    say(ctx, known ? 'trap.rolling.none_known' : 'trap.rolling.none');
}

/**
 * A monster sets one off: "Click!  The jackal triggers a rolling boulder trap." ("... triggers
 * something." for an unseen trap) when the hero sees it; she sees the trap if the boulder rolled.
 * ref: src/trap.c trapeffect_rolling_boulder_trap()
 */
function rollingMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const p = mon.c.pos;
  if (!p) return 'finished';
  const inSight = cansee(ctx, p.level, p.x, p.y) && canSpotMon(ctx, mon);
  if (inSight)
    say(ctx, trap.seen ? 'trap.rolling.mon_triggers' : 'trap.rolling.mon_triggers_something', {
      mon: monNam(ctx, mon),
    });
  const { a, b } = ends(trap);
  let killed = false;
  if (launchObj(ctx, a.x, a.y, b.x, b.y, { unseen: !inSight, monMoving: true })) {
    if (inSight) seetrap(trap);
    killed = !ctx.state.entities[String(mon.id)]?.c.monster;
  }
  return caughtOr(ctx, mon, killed);
}

/**
 * The hero pushes a boulder onto a rolling boulder trap: "The boulder suddenly rolls away from
 * you!", on in her direction until one of the trap's launch spots or the map's edge.
 * ref: src/hack.c moverock() ROLLING_BOULDER_TRAP
 */
function rollingPush(ctx: Ctx, trap: Trap, from: Pos, dx: number, dy: number, what: Msg): void {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level) return;
  const { a, b } = ends(trap);
  let tox = trap.x;
  let toy = trap.y;
  while (inBounds(level, tox + dx, toy + dy)) {
    tox += dx;
    toy += dy;
    if ((tox === a.x && toy === a.y) || (tox === b.x && toy === b.y)) break;
  }
  say(ctx, 'roll.rolls_away', { what });
  seetrap(trap); // feeltrap()
  launchObj(ctx, from.x, from.y, tox, toy, { known: true });
}

export function registerRollingBoulders(): void {
  setTrapEffect(TRAP.rolling, {
    you: rollingYou,
    mon: rollingMon,
  });
  setRollingPush(rollingPush);
}
