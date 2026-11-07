import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  cellRules,
  checkStep,
  getLevel,
  getPlayer,
  inBounds,
  type ActionDef,
  type Offer,
  type Ctx,
  type ModApi,
  type Dir,
  type Entity,
  type Level,
  type PlayerAction,
  type Pos,
  type TerrainDef,
  rnl,
  trapAt,
} from '@nh/core';
import { heroAttack, monsterIdAt } from './combat';
import { escapeFromStickyMon, impairedDir } from './hackmove';
import { lookHere } from './itemactions';
import { askReallyAttack, needsAttackConfirm } from './peaceful';
import { monflee } from './monflee';
import { isFrozen } from './mstate';
import { canSpotMon, monNam } from './perception';
import { epriOf } from './epri';
import { eshkOf } from './eshk';
import { P, hasProp } from './props';
import { T, setTerrain, surfaceKey } from './terrain';
import { luckOf } from './luck';
import {
  climbPit,
  findTrapAt,
  intoTrap,
  plunge,
  seenHoleHere,
  spotTrap,
  trapToConfirm,
  trapmove,
} from './trap';
import { isMtrapped, isPit, levitating, setMtrapped, uInPit } from './trapstate';
import { floatingAbove, resumeLevitation } from './levitation';
import { HERE } from './priority';
import { checkSpecialRoom } from './rooms';
import { BOULDER, boulderAt, feelObjects, rememberedBoulder, sokobanBoulder } from './boulder';
import { isSokoban } from './sokoban';
import { xnameOf } from './objnam';
import { moverock } from './moverock';
import { invWeight, weightCap } from './stats';
import { setEndHow } from './endstate';

function playerAt(ctx: Ctx): Pos {
  const pos = getPlayer(ctx.state).c.pos;
  if (!pos) throw new Error('Player has no position');
  return { x: pos.x, y: pos.y };
}

/** The direction from `from` to an adjacent cell, or null if not adjacent (or the same cell). */
function dirTo(from: Pos, to: Pos): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return null;
  return DIR_LIST.find((d) => DIRS[d].x === dx && DIRS[d].y === dy) ?? null;
}

/**
 * Turns the closed door at `at` into the open door matching its wall orientation: a door in a
 * vertical wall has rock/wall to its north and south.
 * ref: src/lock.c doopen_indir(), src/monmove.c postmov() (D_ISOPEN)
 */
export function openDoorAt(ctx: Ctx, level: Level, at: Pos): void {
  const passableAt = (x: number, y: number): boolean => {
    if (!inBounds(level, x, y)) return false;
    const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
    return id !== undefined && ctx.defs.terrain(id).passable;
  };
  const vertical = !passableAt(at.x, at.y - 1) && !passableAt(at.x, at.y + 1);
  setTerrain(level, at.x, at.y, vertical ? T.door_open_v : T.door_open_h);
}

/**
 * A monster the hero won't attack by walking into it: peaceful (pets are too), seen, and she is
 * not confused, hallucinating or stunned. ref: include/display.h is_safemon() (safe_dog on)
 */
export function isSafemon(ctx: Ctx, mon: Entity): boolean {
  const hero = getPlayer(ctx.state);
  return (
    mon.c.monster?.peaceful === true &&
    canSpotMon(ctx, mon) &&
    !hasProp(hero, P.CONFUSION) &&
    !hasProp(hero, P.HALLUC) &&
    !hasProp(hero, P.STUNNED)
  );
}

/**
 * The hero and the pet (or peaceful monster) trade squares, unless it can't fit or a trap is
 * in the way. ref: src/hack.c domove_swap_with_pet() (no boulders or pits yet)
 */
function swapWithPet(ctx: Ctx, mon: Entity, from: Pos, to: Pos, dir: Dir): number {
  const tame = (mon.c.monster?.tame ?? 0) > 0;
  const def = ctx.defs.monster(mon.def);
  const hero = getPlayer(ctx.state);
  const level = getLevel(ctx.state);
  const rules = cellRules(level, ctx.defs);
  const diagonal = DIRS[dir].x !== 0 && DIRS[dir].y !== 0;
  const badRock = (x: number, y: number): boolean => {
    if (!inBounds(level, x, y)) return true;
    if (sokobanBoulder(ctx, level, x, y)) return true; // bad_rock(): Sokoban boulders
    const t = level.cells[cellIndex(level, x, y)] ?? 0;
    return !rules.passable[t] && !rules.closedDoor[t];
  };
  const stop = (key: string): number => {
    ctx.emit({ type: 'msg', key, params: { mon: `@${mon.def}` } });
    ctx.interrupt(); // nomul(0)
    return 0; // didn't move after all
  };
  if (diagonal && def.id === 'nh:grid_bug') return stop('dog.cant_diagonal');
  if (
    diagonal &&
    badRock(to.x, from.y) &&
    badRock(from.x, to.y) &&
    (def.size === 'large' || def.size === 'huge' || def.size === 'gigantic')
  )
    return stop('dog.wont_fit');
  // ref: domove_swap_with_pet(): a peaceful monster caught in a trap can't move out of it, and
  // won't be displaced onto a trapped square
  const trapped = isMtrapped(ctx, mon.id) ? trapAt(level, to.x, to.y) : undefined;
  if (!trapped) setMtrapped(ctx, mon.id, false);
  else {
    const named = { mon: `@${mon.def}`, trap: `@${trapped.def}` };
    const key = trapped.seen ? 'dog.cant_move_out' : 'dog.cant_move_out_an';
    trapped.seen = true; // feeltrap()
    ctx.emit({ type: 'msg', key, params: named });
    ctx.interrupt();
    return 0;
  }
  // ref: domove_swap_with_pet(): a peaceful monster won't be displaced onto a trapped square,
  // and temple priests and shopkeepers not at all (mundisplaceable())
  const undisplaceable = epriOf(ctx, mon.id) !== null || eshkOf(ctx, mon.id) !== null;
  if (trapAt(level, from.x, from.y) || undisplaceable) {
    if (tame) return stop('dog.doesnt_want_swap');
    ctx.emit({
      type: 'msg',
      key: 'dog.doesnt_want_swap_peaceful',
      params: { mon: monNam(ctx, mon) },
    });
    ctx.interrupt(); // nomul(0)
    return 0;
  }
  const mp = mon.c.pos;
  const hp = hero.c.pos;
  if (!mp || !hp) return 0;
  mp.x = from.x;
  mp.y = from.y;
  hp.x = to.x;
  hp.y = to.y;
  ctx.emit({ type: 'moved', id: hero.id, from, to });
  ctx.emit({ type: 'moved', id: mon.id, from: to, to: from });
  ctx.emit({
    type: 'msg',
    key: tame ? 'dog.swap' : 'dog.swap_peaceful',
    params: { mon: `@${mon.def}` },
  });
  checkSpecialRoom(ctx, false, from); // ref: src/hack.c spoteffects()
  lookHere(ctx);
  spotTrap(ctx);
  return NORMAL_SPEED;
}

/**
 * Fight: attack whatever is in that direction, even a pet or a peaceful monster (still asking
 * "Really attack?" for a peaceful one). ref: src/cmd.c the F prefix (context.forcefight),
 * src/hack.c domove_fight_empty()
 */
const fight: ActionDef = {
  id: 'nh:fight',
  labelKey: 'action.nh:fight',
  handles: 'mod',
  offer(ctx, target) {
    if (target.kind !== 'cell') return [];
    const dir = dirTo(playerAt(ctx), target.pos);
    if (!dir) return [];
    const seen = ctx.query.describe(target.pos).entities.find((e) => ctx.defs.isMonster(e.def));
    // a boulder the hero knows of: "You harmlessly attack a boulder." (walking pushes it)
    if (!seen && rememberedBoulder(ctx, getLevel(ctx.state), target.pos.x, target.pos.y))
      return [
        {
          action: { type: 'mod', action: 'nh:fight', args: { dir } },
          labelKey: 'action.nh:fight',
          params: { target: `@${BOULDER}` },
        },
      ];
    if (!seen) return [];
    const mon = ctx.state.entities[String(seen.id)];
    // only worth a separate entry where walking would not attack
    if (!mon || !isSafemon(ctx, mon)) return [];
    return [
      {
        action: { type: 'mod', action: 'nh:fight', args: { dir } },
        labelKey: 'action.nh:fight',
        params: { target: `@${seen.def}` },
      },
    ];
  },
  perform(ctx, action) {
    const raw = action.type === 'mod' ? (action.args as { dir?: unknown } | undefined)?.dir : null;
    const want = DIR_LIST.find((d) => d === raw);
    if (!want) return 0;
    const dir = impairedDir(ctx, want);
    if (dir === null) return NORMAL_SPEED;
    const from = playerAt(ctx);
    const to = { x: from.x + DIRS[dir].x, y: from.y + DIRS[dir].y };
    const level = getLevel(ctx.state);
    const victim = monsterIdAt(ctx, to, level.id);
    if (victim === null) {
      // ref: domove_fight_empty(): "You harmlessly attack a boulder." (the hero learns it is
      // there: map_object()), "You attack thin air." / "You harmlessly attack the wall."
      const boulder = inBounds(level, to.x, to.y) ? boulderAt(ctx, level.id, to.x, to.y) : null;
      if (boulder) {
        feelObjects(ctx, level, to.x, to.y);
        ctx.emit({
          type: 'msg',
          key: 'fight.harmless_obj',
          params: { what: xnameOf(ctx.state, ctx.defs, boulder) },
        });
        ctx.interrupt();
        return NORMAL_SPEED;
      }
      const solid =
        !inBounds(level, to.x, to.y) ||
        !cellRules(level, ctx.defs).passable[level.cells[cellIndex(level, to.x, to.y)] ?? 0];
      if (solid) {
        const id = inBounds(level, to.x, to.y)
          ? level.palette[level.cells[cellIndex(level, to.x, to.y)] ?? 0]
          : undefined;
        ctx.emit({
          type: 'msg',
          key: 'fight.harmless',
          params: { what: `@${id ? ctx.defs.terrain(id).nameKey : 'nh:stone'}` },
        });
      } else ctx.emit({ type: 'msg', key: 'fight.thin_air' });
      ctx.interrupt();
      return NORMAL_SPEED;
    }
    if (needsAttackConfirm(ctx, victim)) {
      askReallyAttack(ctx, victim, 'nh:move', { victim });
      return 0;
    }
    return heroAttack(ctx, victim);
  },
};

const move: ActionDef = {
  id: 'nh:move',
  labelKey: 'action.move',
  handles: 'move',
  offer(ctx, target) {
    if (target.kind !== 'cell') return [];
    const from = playerAt(ctx);
    const dir = dirTo(from, target.pos);
    if (!dir) return [];
    const level = getLevel(ctx.state);
    // A visible monster there turns the move into an attack (allowed diagonally through doors),
    // or a swap of places with a pet or peaceful monster (is_safemon); `nh:fight` offers the
    // attack on those.
    const seen = ctx.query.describe(target.pos).entities.find((e) => ctx.defs.isMonster(e.def));
    if (seen) {
      const mon = ctx.state.entities[String(seen.id)];
      return [
        {
          action: { type: 'move', dir },
          labelKey: mon && isSafemon(ctx, mon) ? 'action.swap' : 'action.attack',
          params: { target: `@${seen.def}` },
        },
      ];
    }
    // a door the hero knows gets `nh:open` (and kick) instead, so a tap never bumps into it
    // unasked; one she doesn't know (blind) she walks into, which opens it
    const check = checkStep(level, cellRules(level, ctx.defs), from, dir);
    const known = ctx.query.describe(target.pos).terrain === T.door_closed;
    if (!check.ok && (check.reason !== 'closedDoor' || known)) return [];
    // walking into a boulder the hero knows of pushes it
    const offer: Offer = rememberedBoulder(ctx, level, target.pos.x, target.pos.y)
      ? { action: { type: 'move', dir }, labelKey: 'action.push' }
      : { action: { type: 'move', dir }, labelKey: 'action.move', params: { dir: `@dir.${dir}` } };
    return [offer];
  },
  perform(ctx, action: PlayerAction) {
    if (action.type !== 'move') throw new Error('nh:move can only perform move actions');
    const player = getPlayer(ctx.state);
    const pos = player.c.pos;
    if (!pos) throw new Error('Player has no position');
    const level = getLevel(ctx.state, pos.level);
    const from = { x: pos.x, y: pos.y };
    // ref: src/hack.c domove_core(): impaired_movement() picks a random direction when stunned
    // (and the move is lost if none is found), then escape_from_sticky_mon()
    const dir = impairedDir(ctx, action.dir);
    if (dir === null) return NORMAL_SPEED;
    const d = DIRS[dir];
    const to = { x: from.x + d.x, y: from.y + d.y };
    if (inBounds(level, to.x, to.y) && escapeFromStickyMon(ctx, to)) return NORMAL_SPEED;
    // ref: src/hack.c domove(): a monster at the target is attacked before test_move() is
    // consulted, so attacks work diagonally through doorways. (domove_core's "don't attack if
    // running" check belongs to travel/run, which is a different action.)
    const victim = monsterIdAt(ctx, to, pos.level);
    const vmon = victim === null ? undefined : ctx.state.entities[String(victim)];
    if (vmon && isSafemon(ctx, vmon)) {
      // ref: src/uhitm.c do_attack(): walking into a pet or peaceful monster you can see does
      // not attack it; 1 time in 7 it is in the way, and one that can't move doesn't
      const tame = (vmon.c.monster?.tame ?? 0) > 0;
      const named = { mon: `@${vmon.def}` };
      if (ctx.rng.rn2(7) === 0) {
        if (tame) monflee(ctx, vmon.id, ctx.rng.rnd(6), false, false);
        ctx.emit({
          type: 'msg',
          key: tame ? 'dog.in_the_way' : 'dog.in_the_way_peaceful',
          params: named,
        });
        ctx.interrupt(); // end_running()
        return NORMAL_SPEED;
      }
      const vdef = ctx.defs.monster(vmon.def);
      if (
        vmon.c.monster?.asleep ||
        isFrozen(ctx, vmon.id) ||
        (vdef.speed === 0 && ctx.rng.rn2(6) !== 0)
      ) {
        ctx.emit({ type: 'msg', key: 'dog.doesnt_move', params: { mon: monNam(ctx, vmon) } });
        ctx.interrupt();
        return NORMAL_SPEED;
      }
    } else if (victim !== null) {
      // ref: src/uhitm.c attack_checks(): "Really attack the dwarf?" for a peaceful monster in view
      if (needsAttackConfirm(ctx, victim)) {
        askReallyAttack(ctx, victim, 'nh:move', { victim });
        return 0;
      }
      return heroAttack(ctx, victim);
    }
    return walk(ctx, dir, false);
  },
  // The answer to "Really attack?" (yes attacks) or "Really step onto that trap?" (yes steps);
  // anything else costs nothing (context.move = 0).
  answer(ctx, value, raw) {
    const data = raw as { victim?: unknown; trapDir?: unknown } | null;
    if (value !== true) return 0;
    const trapDir = DIR_LIST.find((d) => d === data?.trapDir);
    if (trapDir) return walk(ctx, trapDir, true);
    const victim = data?.victim;
    if (typeof victim !== 'number') return 0;
    if (!ctx.state.entities[String(victim)]?.c.monster) return 0;
    return heroAttack(ctx, victim);
  },
};

/** ref: include/weight.h WT_TOOMUCH_DIAGONAL */
const WT_TOOMUCH_DIAGONAL = 600;

/**
 * Rock or wall the hero cannot pass (IS_OBSTRUCTED(), out of the map counts too); boulders count
 * only in Sokoban. ref: src/hack.c bad_rock() for a hero who cannot tunnel
 */
function badRock(ctx: Ctx, level: Level, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return true;
  if (sokobanBoulder(ctx, level, x, y)) return true;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  if (id === undefined) return true;
  const t = ctx.defs.terrain(id);
  return !t.passable && t.door === undefined;
}

/**
 * The hero steps in direction `dir` (no attack): the confirmation for a seen trap, escaping a
 * bear trap, swapping with a pet, then test_move(). `confirmed` is set once "Really step onto
 * that bear trap?" was answered yes. ref: src/hack.c domove_core() avoid_trap_andor_region(),
 * trapmove(), test_move(), spoteffects()
 */
function walk(ctx: Ctx, dir: Dir, confirmed: boolean): number {
  const player = getPlayer(ctx.state);
  const pos = player.c.pos;
  if (!pos) throw new Error('Player has no position');
  const level = getLevel(ctx.state, pos.level);
  const from = { x: pos.x, y: pos.y };
  const to = { x: from.x + DIRS[dir].x, y: from.y + DIRS[dir].y };
  const check = checkStep(level, cellRules(level, ctx.defs), from, dir);
  if (!confirmed && check.ok) {
    // ref: avoid_trap_andor_region(): paranoid_confirm:trap is on by default
    const t = trapToConfirm(ctx, to);
    if (t) {
      ctx.ask(
        {
          id: 'trap-confirm',
          kind: 'yn',
          // "Really float into..." while levitating (u_locomotion("step"))
          key: `${intoTrap(t.def) ? 'trap.confirm_into' : 'trap.confirm_onto'}${levitating(ctx) ? '_float' : ''}`,
          params: { trap: `@${t.def}` },
          cancellable: true,
        },
        'nh:move',
        { trapDir: dir },
      );
      ctx.interrupt(); // nomul(0)
      return 0;
    }
  }
  // ref: domove_core(): `if (u.utrap) { if (!trapmove(x, y, NULL)) return; }` -- the move is spent;
  // once free, reset_utrap(TRUE) "might resume levitation"
  const wasLevitating = levitating(ctx);
  if (!trapmove(ctx, dir)) {
    resumeLevitation(ctx, wasLevitating);
    ctx.interrupt();
    return NORMAL_SPEED;
  }
  if (check.ok) {
    // ref: src/hack.c test_move(): a diagonal squeeze between rock, walls or Sokoban boulders
    // when carrying more than 600 (cant_squeeze_thru() case 2), or at all in Sokoban (case 3;
    // the hero is never too big)
    const diagonal = DIRS[dir].x !== 0 && DIRS[dir].y !== 0;
    if (diagonal && badRock(ctx, level, from.x, to.y) && badRock(ctx, level, to.x, from.y)) {
      const amt = invWeight(ctx.state, ctx.defs, player.id) + weightCap(ctx.state, player.id);
      const key =
        amt > WT_TOOMUCH_DIAGONAL
          ? 'move.carrying_too_much'
          : isSokoban(level)
            ? 'move.cannot_pass'
            : null;
      if (key) {
        ctx.emit({ type: 'msg', key });
        ctx.interrupt();
        return 0;
      }
    }
    // ref: test_move(): `if (sobj_at(BOULDER, x, y) ...) moverock() < 0 -> return FALSE`: a
    // boulder that won't move keeps the hero in place and takes no time
    if (boulderAt(ctx, level.id, to.x, to.y) && moverock(ctx, dir) === 'blocked') {
      ctx.interrupt();
      return 0;
    }
  }
  const victim = monsterIdAt(ctx, to, pos.level);
  const vmon = victim === null ? undefined : ctx.state.entities[String(victim)];
  // test_move() still applies: no swapping diagonally through a doorway
  if (vmon && isSafemon(ctx, vmon) && check.ok) return swapWithPet(ctx, vmon, from, to, dir);
  if (check.ok) {
    // ref: src/hack.c domove()
    pos.x = to.x;
    pos.y = to.y;
    ctx.emit({ type: 'moved', id: player.id, from, to });
    checkSpecialRoom(ctx, false, from); // ref: src/hack.c spoteffects() (before the pickup and trap)
    // ref: spoteffects(): "If not a pit, pickup before triggering trap. If pit, trigger trap
    // before pickup."
    const t = trapAt(level, to.x, to.y);
    if (t && isPit(t.def)) {
      spotTrap(ctx);
      if (!ctx.state.gameOver) lookHere(ctx);
    } else {
      lookHere(ctx); // ref: src/hack.c spoteffects() -> pickup(1) -> check_here()
      spotTrap(ctx); // ref: spoteffects() -> dotrap()
    }
    return NORMAL_SPEED;
  }
  switch (check.reason) {
    case 'closedDoor': {
      // ref: src/hack.c test_move() flags.autoopen -> src/lock.c doopen_indir()
      openDoorAt(ctx, level, to);
      ctx.emit({ type: 'doorOpened', pos: to });
      ctx.emit({ type: 'msg', key: 'door.opens' });
      return NORMAL_SPEED;
    }
    case 'lockedDoor': {
      // ref: src/hack.c test_move() closed_door(): locked, so no time passes
      ctx.emit({ type: 'msg', key: 'door.locked' });
      return 0;
    }
    case 'blocked':
    case 'diagonalDoor': {
      // ref: src/hack.c domove() context.move = 0; nothing is printed without mention_walls
      const id = level.palette[level.cells[cellIndex(level, to.x, to.y)] ?? 0];
      if (id !== undefined) ctx.emit({ type: 'blocked', pos: to, terrain: id });
      return 0;
    }
    case 'bounds':
      return 0;
  }
}

/**
 * Open an adjacent door the hero knows as closed, in any of the eight directions. A locked one
 * says so and takes no time; opening never sticks (see DEVIATIONS: Doors).
 * ref: src/lock.c doopen(), doopen_indir()
 */
const open: ActionDef = {
  id: 'nh:open',
  labelKey: 'action.open',
  handles: 'mod',
  offer(ctx, target) {
    if (target.kind !== 'cell') return [];
    const dir = dirTo(playerAt(ctx), target.pos);
    if (!dir) return [];
    // what the hero knows: a locked door looks closed
    if (ctx.query.describe(target.pos).terrain !== T.door_closed) return [];
    return [
      {
        action: { type: 'mod', action: 'nh:open', args: { dir } },
        labelKey: 'action.open',
        priority: HERE,
      },
    ];
  },
  perform(ctx, action) {
    const raw = action.type === 'mod' ? (action.args as { dir?: unknown } | undefined)?.dir : null;
    const dir = DIR_LIST.find((d) => d === raw);
    if (!dir) return 0;
    // ref: src/lock.c doopen_indir(): "You can't reach over the edge of the pit.", no time
    if (uInPit(ctx)) {
      ctx.emit({ type: 'msg', key: 'trap.pit.cant_reach' });
      return 0;
    }
    const from = playerAt(ctx);
    const to = { x: from.x + DIRS[dir].x, y: from.y + DIRS[dir].y };
    const level = getLevel(ctx.state);
    const id = inBounds(level, to.x, to.y)
      ? level.palette[level.cells[cellIndex(level, to.x, to.y)] ?? 0]
      : undefined;
    const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
    if (door === 'locked') {
      ctx.emit({ type: 'msg', key: 'door.locked' });
      return 0;
    }
    if (door !== 'closed') {
      const key =
        door === undefined
          ? 'door.none'
          : door === 'doorway'
            ? 'door.no_door'
            : 'door.already_open';
      ctx.emit({ type: 'msg', key });
      return 0;
    }
    openDoorAt(ctx, level, to);
    ctx.emit({ type: 'doorOpened', pos: to });
    ctx.emit({ type: 'msg', key: 'door.opens' });
    return NORMAL_SPEED;
  },
};

const wait: ActionDef = {
  id: 'nh:wait',
  labelKey: 'action.wait',
  handles: 'wait',
  offer: (_ctx, target) =>
    target.kind === 'self' ? [{ action: { type: 'wait' }, labelKey: 'action.wait' }] : [],
  // ref: src/cmd.c donull()
  perform: () => NORMAL_SPEED,
};

/** Terrain def under the hero. */
function terrainUnderHero(ctx: Ctx): TerrainDef {
  const pos = playerAt(ctx);
  const level = getLevel(ctx.state);
  const id = level.palette[level.cells[cellIndex(level, pos.x, pos.y)] ?? 0];
  if (id === undefined) throw new Error('Hero stands on unknown terrain');
  return ctx.defs.terrain(id);
}

/** The branch stairs the hero stands on, if any. ref: src/stairs.c stairway_at() (tolev in another dungeon) */
function branchUnderHero(ctx: Ctx): Level['branch'] {
  const pos = playerAt(ctx);
  const b = getLevel(ctx.state).branch;
  return b && b.pos.x === pos.x && b.pos.y === pos.y ? b : null;
}

export { setTerrain };

const search: ActionDef = {
  id: 'nh:search',
  labelKey: 'action.search',
  handles: 'search',
  offer: (_ctx, target) =>
    target.kind === 'self' ? [{ action: { type: 'search' }, labelKey: 'action.search' }] : [],
  perform(ctx) {
    ctx.emit({ type: 'searched' });
    dosearch0(ctx);
    return NORMAL_SPEED;
  },
};

/**
 * Searches the 3x3 around the hero (explicitly, or automatically each turn with Searching).
 * ref: src/detect.c dosearch0(): x outer, y inner. Hidden monsters are not implemented; there is
 * no lenses/artifact bonus (fund = 0). Luck counts.
 */
function dosearch0(ctx: Ctx): void {
  const here = playerAt(ctx);
  const level = getLevel(ctx.state);
  for (let x = here.x - 1; x <= here.x + 1; x++) {
    for (let y = here.y - 1; y <= here.y + 1; y++) {
      if (!inBounds(level, x, y) || (x === here.x && y === here.y)) continue;
      const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
      const locked = id === T.sdoor_locked_v || id === T.sdoor_locked_h;
      if (id === T.sdoor_v || id === T.sdoor_h || locked) {
        if (rnl(ctx.rng, 7, luckOf(ctx.state)) !== 0) continue;
        // ref: cvt_sdoor_to_door(): the door keeps its doormask (closed or locked)
        setTerrain(level, x, y, locked ? T.door_locked : T.door_closed);
        ctx.emit({ type: 'msg', key: 'search.found_door' });
      } else if (id === T.scorr) {
        if (rnl(ctx.rng, 7, luckOf(ctx.state)) !== 0) continue;
        setTerrain(level, x, y, T.corr);
        ctx.emit({ type: 'msg', key: 'search.found_passage' });
      } else {
        // ref: dosearch0(): `(trap = t_at(x, y)) && !trap->tseen && !rnl(8)` -> find_trap()
        findTrapAt(ctx, level, x, y, () => rnl(ctx.rng, 8, luckOf(ctx.state)));
      }
    }
  }
}

/**
 * Searching (a ring of searching) searches every turn while the hero can act.
 * ref: src/allmain.c moveloop_core(): `if (Searching && multi >= 0) (void) dosearch0(1);`
 */
export function registerAutosearch(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    const hero = getPlayer(ctx.state);
    if (ctx.state.gameOver || hero.c.helpless || !hasProp(hero, P.SEARCHING)) return;
    dosearch0(ctx);
  });
}

// ref: src/do.c dodown()
const down: ActionDef = {
  id: 'nh:down',
  labelKey: 'action.down',
  handles: 'mod',
  offer: (ctx, target) =>
    target.kind === 'self' && (terrainUnderHero(ctx).stairs === 'down' || seenHoleHere(ctx))
      ? [{ action: { type: 'mod', action: 'nh:down' }, labelKey: 'action.down', priority: HERE }]
      : [],
  perform(ctx) {
    // ref: dodown(): `HLevitation || ELevitation` (even when a bear trap blocks it): "You are
    // floating high above the stairs.", no time
    if (hasProp(getPlayer(ctx.state), P.LEVITATION)) {
      const p = playerAt(ctx);
      const stairs = terrainUnderHero(ctx).stairs === 'down';
      floatingAbove(
        ctx,
        stairs ? '@surface.stairs' : surfaceKey(ctx, getLevel(ctx.state), p.x, p.y),
      );
      return 0;
    }
    // ref: dodown(): on a seen trap door or hole, `uescaped_shaft()` -> dotrap(TOOKPLUNGE)
    const hole = terrainUnderHero(ctx).stairs === 'down' ? null : seenHoleHere(ctx);
    if (hole) return plunge(ctx, hole);
    if (terrainUnderHero(ctx).stairs !== 'down') {
      ctx.emit({ type: 'msg', key: 'stairs.cant_down' });
      return 0;
    }
    // Branch stairs lead to the branch stairs of the other dungeon (ref: goto_level() u_on_sstairs()).
    const branch = branchUnderHero(ctx);
    if (branch) {
      ctx.goToLevel(branch.to, 'branch');
      return NORMAL_SPEED;
    }
    // Arrive on the up stairs of the next level (ref: goto_level() u_on_newpos(xupstair)).
    const level = getLevel(ctx.state);
    ctx.goToLevel({ dungeon: level.dungeon, dlevel: level.dlevel + 1 }, 'up');
    return NORMAL_SPEED;
  },
};

// ref: src/do.c doup()
const up: ActionDef = {
  id: 'nh:up',
  labelKey: 'action.up',
  handles: 'mod',
  offer: (ctx, target) =>
    target.kind !== 'self'
      ? []
      : uInPit(ctx)
        ? [
            {
              action: { type: 'mod', action: 'nh:up' },
              labelKey: 'action.climb_pit',
              priority: HERE,
            },
          ]
        : terrainUnderHero(ctx).stairs === 'up'
          ? [{ action: { type: 'mod', action: 'nh:up' }, labelKey: 'action.up', priority: HERE }]
          : [],
  perform(ctx) {
    // ref: doup(): "up" to get out of a pit... climb_pit(), ECMD_TIME
    if (uInPit(ctx)) {
      climbPit(ctx);
      return NORMAL_SPEED;
    }
    if (terrainUnderHero(ctx).stairs !== 'up') {
      ctx.emit({ type: 'msg', key: 'stairs.cant_up' });
      return 0;
    }
    const branch = branchUnderHero(ctx);
    if (branch) {
      ctx.goToLevel(branch.to, 'branch');
      return NORMAL_SPEED;
    }
    const level = getLevel(ctx.state);
    if (level.dlevel > 1) {
      ctx.goToLevel({ dungeon: level.dungeon, dlevel: level.dlevel - 1 }, 'down');
      return NORMAL_SPEED;
    }
    // ref: doup(): ledger_no == 1 -> y_n("Beware, there will be no return!  Still climb?")
    ctx.ask(
      { id: 'leave-dungeon', kind: 'yn', key: 'stairs.leave_confirm', cancellable: true },
      'nh:up',
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    // Anything but 'y' returns ECMD_OK: no message, no time.
    if (value !== true) return 0;
    // ref: src/do.c doup() -> prev_level() -> done(ESCAPED)
    setEndHow(ctx, 'escaped');
    ctx.endGame({
      kind: 'escaped',
      killer: 'escaped',
      turn: ctx.state.turn,
      depth: 1,
      level: getPlayer(ctx.state).c.experience?.level ?? 1,
    });
    return 0;
  },
};

export const ACTIONS: readonly ActionDef[] = [move, fight, open, wait, search, down, up];
