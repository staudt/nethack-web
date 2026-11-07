// Pushing boulders. ref: src/hack.c moverock(), moverock_core(), dopush(), cannot_push(),
// cannot_push_msg(), could_move_onto_boulder()
//
// Ported subset: the hero is always a human on foot or floating (no riding, very small or giant
// forms, Passes_walls, the `m` prefix or tunneling), there are no pools, iron bars, landmines,
// teleporters or buried zombies (a rolling boulder trap rolls the boulder away: rollboulder.ts), and pushing a boulder in a shop does not
// bill it (DEVIATIONS.md "Boulders"). In Sokoban a boulder does not roll diagonally and
// squeezing past one costs Luck.
import {
  DIRS,
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  heroBlind,
  inBounds,
  inventoryOf,
  sortedIds,
  trapAt,
  type Ctx,
  type Dir,
  type Entity,
  type Level,
  type Msg,
  type Pos,
  type Trap,
} from '@nh/core';
import { P, hasProp } from './props';
import { boulderAt, feelObjects, rememberedBoulder } from './boulder';
import { boulderFlooreffects } from './flooreffects';
import { isSokoban, maybeFinishSokoban, sokobanGuilt } from './sokoban';
import { nhData } from './items';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { invWeight } from './stats';
import { T } from './terrain';
import { TRAP } from './trap';
import { isMtrapped, isPit, levitating } from './trapstate';

/**
 * A boulder pushed onto a rolling boulder trap rolls away (rollboulder.ts, which sits above
 * trap.ts and this module's importers, hands it in at registration).
 */
type RollingPush = (ctx: Ctx, trap: Trap, from: Pos, dx: number, dy: number, what: Msg) => void;
let rollingPush: RollingPush | null = null;
export function setRollingPush(fn: RollingPush): void {
  rollingPush = fn;
}

/** ref: include/weight.h WT_SQUEEZABLE_INV */
const WT_SQUEEZABLE_INV = 850;

/**
 * Whether the hero carries so little that she can squeeze onto a boulder's square.
 * ref: src/hack.c squeezeablylightinvent(): no inventory at all, or `inv_weight() <= -850`
 */
const squeezeablyLightInvent = (ctx: Ctx): boolean => {
  const hero = getPlayer(ctx.state);
  return (
    inventoryOf(ctx.state, hero.id).length === 0 ||
    invWeight(ctx.state, ctx.defs, hero.id) <= -WT_SQUEEZABLE_INV
  );
};

/**
 * Whether the hero can move onto a square holding boulders: only by carrying almost nothing.
 * ref: src/hack.c could_move_onto_boulder() (no Passes_walls, steed, giant or tiny forms)
 */
export const couldMoveOntoBoulder = (ctx: Ctx): boolean => squeezeablyLightInvent(ctx);

/**
 * Rushing and running (not the Shift run) stop in front of a boulder the hero cannot squeeze
 * onto, unless she is blind or hallucinating; travel too. Nothing is said without mention_walls.
 * ref: src/hack.c test_move() `context.run >= 2 && !(Blind || Hallucination) &&
 * !could_move_onto_boulder()`
 */
export function boulderStops(ctx: Ctx, run: number, to: Pos): boolean {
  const hero = getPlayer(ctx.state);
  return (
    run >= 2 &&
    boulderAt(ctx, ctx.state.currentLevel, to.x, to.y) !== null &&
    !heroBlind(ctx.defs, ctx.state) &&
    !hasProp(hero, P.HALLUC) &&
    !couldMoveOntoBoulder(ctx)
  );
}

/** ref: src/do_name.c surface(): "ground" in corridors, "floor" in rooms and doorways */
const surfaceKey = (level: Level, x: number, y: number): string =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? 0] === T.corr
    ? '@surface.ground'
    : '@surface.floor';

const monsterAt = (ctx: Ctx, level: Level, x: number, y: number): Entity | null => {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (
      e?.c.monster &&
      id !== ctx.state.playerId &&
      p?.level === level.id &&
      p.x === x &&
      p.y === y
    )
      return e;
  }
  return null;
};

/** ref: src/hack.c cannot_push_msg() (no steed) */
function cannotPushMsg(ctx: Ctx, what: Msg): void {
  ctx.emit({ type: 'msg', key: 'boulder.in_vain', params: { what } });
}

/**
 * The push failed: the hero squeezes onto the boulder's square if she carries almost nothing
 * ('moved'; cheating in Sokoban), else she stays ('blocked'). ref: src/hack.c cannot_push()
 * (no giant forms)
 */
function cannotPush(ctx: Ctx): 'moved' | 'blocked' {
  if (couldMoveOntoBoulder(ctx)) {
    ctx.emit({ type: 'msg', key: 'boulder.squeeze' });
    sokobanGuilt(ctx);
    return 'moved';
  }
  return 'blocked';
}

/**
 * Moves the boulder from (sx, sy) to (rx, ry), with "With great effort you move the boulder."
 * unless the hero has kept pushing this same boulder: the message comes for a different boulder
 * than the last one pushed, or after 2 turns without pushing it. ref: src/hack.c dopush()
 * (no steed, no exercise, no shop billing)
 */
function dopush(
  ctx: Ctx,
  level: Level,
  otmp: Entity,
  what: Msg,
  s: { x: number; y: number },
  r: { x: number; y: number },
): void {
  const nh = nhData(ctx);
  const moves = ctx.state.turn;
  if (nh.bldrpush?.oid !== otmp.id) nh.bldrpush = { oid: otmp.id, time: moves + 1 };
  const givemesg = moves > nh.bldrpush.time + 2 || moves < nh.bldrpush.time;
  if (givemesg) ctx.emit({ type: 'msg', key: 'boulder.push', params: { what } });
  nh.bldrpush.time = moves;
  // ref: dopush() movobj(): "Move the boulder *after* the message."
  otmp.c.pos = { level: level.id, x: r.x, y: r.y };
  if (otmp.c.item) otmp.c.item.placed = ctx.state.seq++;
  if (heroBlind(ctx.defs, ctx.state)) {
    feelObjects(ctx, level, r.x, r.y);
    feelObjects(ctx, level, s.x, s.y);
  }
}

/**
 * The hero walks into a square holding boulders, direction `dir`: each boulder there is pushed
 * one square on (the second one is "the next boulder"). 'moved' means the hero then steps onto
 * the vacated square (one move); 'blocked' means she stays and no time passes, as test_move()
 * returning FALSE. ref: src/hack.c moverock(), moverock_core()
 */
export function moverock(ctx: Ctx, dir: Dir): 'moved' | 'blocked' {
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos;
  if (!hp) return 'blocked';
  const level = getLevel(ctx.state, hp.level);
  const rules = cellRules(level, ctx.defs);
  const { x: dx, y: dy } = DIRS[dir];
  const sx = hp.x + dx;
  const sy = hp.y + dy;
  const rx = hp.x + 2 * dx; // boulder destination position
  const ry = hp.y + 2 * dy;
  let firstboulder = true;
  for (let otmp = boulderAt(ctx, level.id, sx, sy); otmp; otmp = boulderAt(ctx, level.id, sx, sy)) {
    if (heroBlind(ctx.defs, ctx.state) && !rememberedBoulder(ctx, level, sx, sy)) {
      ctx.emit({ type: 'msg', key: 'boulder.feels_like' });
      feelObjects(ctx, level, sx, sy); // map_object()
      ctx.interrupt(); // nomul(0)
      return 'blocked';
    }
    // otmp->next_boulder: xname() says "next boulder" for every boulder after the first
    const name = xnameOf(ctx.state, ctx.defs, otmp);
    const what: Msg = firstboulder ? name : { key: 'boulder.next', params: { name } };
    firstboulder = false;
    ctx.interrupt(); // nomul(0)

    // "You don't have enough leverage to push the boulder." (no squeezing past it either)
    if (levitating(ctx)) {
      if (heroBlind(ctx.defs, ctx.state)) feelObjects(ctx, level, sx, sy); // feel_location()
      ctx.emit({ type: 'msg', key: 'boulder.no_leverage', params: { what } });
      return 'blocked';
    }

    const t = inBounds(level, rx, ry) ? (level.cells[cellIndex(level, rx, ry)] ?? 0) : -1;
    const tdef = t < 0 ? null : ctx.defs.terrain(level.palette[t] ?? T.stone);
    // IS_OBSTRUCTED(): rock, walls, secret doors and corridors (no iron bars exist)
    const obstructed = !tdef || (!tdef.passable && tdef.door === undefined);
    // no diagonal push into a doorway that holds a door (doorless_door() is a doorway or a
    // broken door: no intactDoor)
    const diagonalDoor = dx !== 0 && dy !== 0 && rules.intactDoor[t] === true;
    if (obstructed || diagonalDoor || boulderAt(ctx, level.id, rx, ry)) {
      cannotPushMsg(ctx, what);
      return cannotPush(ctx);
    }
    // "KMH -- Sokoban doesn't let you push boulders diagonally"
    if (isSokoban(level) && dx !== 0 && dy !== 0) {
      if (heroBlind(ctx.defs, ctx.state)) feelObjects(ctx, level, sx, sy);
      ctx.emit({
        type: 'msg',
        key: 'boulder.wont_roll_diagonally',
        params: { what, surface: surfaceKey(level, sx, sy) },
      });
      return cannotPush(ctx);
    }
    const ttmp = trapAt(level, rx, ry);
    const mtmp = monsterAt(ctx, level, rx, ry);
    // a monster there blocks the boulder, unless it is trapped in a pit there (the boulder falls
    // in on it); no noncorporeal monster exists
    if (mtmp && !(isMtrapped(ctx, mtmp.id) && ttmp && isPit(ttmp.def))) {
      if (canSpotMon(ctx, mtmp)) {
        ctx.emit({
          type: 'msg',
          key: 'boulder.mon_other_side',
          params: { mon: monNam(ctx, mtmp) },
        });
      } else {
        ctx.emit({ type: 'msg', key: 'boulder.hear_monster', params: { what } });
      }
      // flags.verbose: "Perhaps that's why you cannot move it." (deliver_part1 is always set:
      // the monster was seen, or heard as the hero is never Deaf)
      ctx.emit({ type: 'msg', key: 'boulder.perhaps' });
      return cannotPush(ctx);
    }
    if (rules.closedDoor[t]) {
      cannotPushMsg(ctx, what);
      return cannotPush(ctx);
    }
    if (ttmp && isPit(ttmp.def)) {
      // the boulder falls into the pit; the other boulders stay where they are. "vision kludge
      // to get messages right": the pit counts as seen unless the hero is blind
      // (flooreffects() always fills a pit, so C's place_object() fallback never runs)
      boulderFlooreffects(ctx, otmp, rx, ry, 'fall', true);
      return boulderAt(ctx, level.id, sx, sy) ? 'blocked' : 'moved';
    }
    if (ttmp && (ttmp.def === TRAP.hole || ttmp.def === TRAP.trapdoor)) {
      // the boulder plugs the hole; the other boulders stay where they are
      const trapdoor = ttmp.def === TRAP.trapdoor;
      if (heroBlind(ctx.defs, ctx.state))
        ctx.emit({ type: 'msg', key: 'boulder.kerplunk', params: { what } });
      else
        ctx.emit({
          type: 'msg',
          key: trapdoor ? 'boulder.plugs_trapdoor' : 'boulder.plugs_hole',
          params: { what, surface: surfaceKey(level, rx, ry) },
        });
      ctx.removeTrap(level.id, { x: rx, y: ry }); // deltrap()
      maybeFinishSokoban(ctx, level.id);
      ctx.remove(otmp.id); // useupf(otmp, 1L); nothing is buried here (bury_objs())
      return boulderAt(ctx, level.id, sx, sy) ? 'blocked' : 'moved';
    }
    if (ttmp && ttmp.def === TRAP.rolling && rollingPush) {
      // the boulder continues until it reaches one of the trap's launch spots or the edge
      rollingPush(ctx, ttmp, { x: sx, y: sy }, dx, dy, what);
      return boulderAt(ctx, level.id, sx, sy) ? 'blocked' : 'moved';
    }
    // other traps do not affect a boulder (no landmines or teleporters)
    dopush(ctx, level, otmp, what, { x: sx, y: sy }, { x: rx, y: ry });
  }
  return 'moved';
}
