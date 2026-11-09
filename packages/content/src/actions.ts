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
  type DefId,
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
import { escapeFromStickyMon, impairedDir, ustuck } from './hackmove';
import { digests, engulfingU, isSwallowed, uswallow } from './engulfstate';
import { lookHere } from './itemactions';
import { askReallyAttack, attackChecksUnseen, needsAttackConfirm } from './peaceful';
import { mapInvisible, markedUnseen, unmapInvisible } from './invis';
import { monflee } from './monflee';
import { isFrozen } from './mstate';
import { canSpotMon, monNam } from './perception';
import { epriOf } from './epri';
import { eshkOf } from './eshk';
import { P, hasProp } from './props';
import { T, setTerrain, surfaceKey } from './terrain';
import { luckOf } from './luck';
import {
  TRAP,
  climbPit,
  findTrapAt,
  intoTrap,
  plunge,
  seenHoleHere,
  spotTrap,
  trapToConfirm,
  trapmove,
} from './trap';
import { isMtrapped, isPit, levitating, setMtrapped, uInPit, uLocomotion } from './trapstate';
import { floatingAbove, resumeLevitation } from './levitation';
import { HERE } from './priority';
import { checkSpecialRoom } from './rooms';
import { BOULDER, boulderAt, feelObjects, rememberedBoulder, sokobanBoulder } from './boulder';
import { STATUE, rememberedStatue, statueAt } from './statuestate';
import { isSokoban } from './sokoban';
import { moverock } from './moverock';
import { invWeight, weightCap } from './stats';
import { setEndHow } from './endstate';
import { doorTrapped } from './btrapstate';
import { bTrapped, blowDoor } from './btrapped';
import { SHOP_DOOR_COST } from './shopdamage';
import { fightWeb } from './web';
import { nohands } from './mondata';
import { heroForm } from './upoly';

/** The `_float`/`_fly` suffix of a u_locomotion() message, '' when she steps. */
const uLoco = (ctx: Ctx): string => {
  const l = uLocomotion(ctx);
  return l ? `_${l}` : '';
};

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
 * The hero opens the closed door at `at`: "The door opens.", and a trapped one blows up
 * ("KABOOM!!  The door was booby-trapped!") leaving an empty doorway.
 * ref: src/lock.c doopen_indir() (the door always opens: see DEVIATIONS, Doors)
 */
function openDoor(ctx: Ctx, level: Level, at: Pos): void {
  const trapped = doorTrapped(ctx, level.id, at.x, at.y);
  openDoorAt(ctx, level, at);
  ctx.emit({ type: 'doorOpened', pos: at });
  ctx.emit({ type: 'msg', key: 'door.opens' });
  if (trapped) {
    blowDoor(ctx, level, at.x, at.y, SHOP_DOOR_COST);
    bTrapped(ctx, 'door');
  }
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
 * The hero moves (or swings a pick) into a monster. A safemon is not attacked: 1 time in 7 it is
 * in the way ("You stop.  Your little dog is in the way!", a pet flees), one that cannot move
 * "doesn't seem to move!", otherwise null (the caller goes on: swapping places, digging). Any
 * other monster is attacked, after "Really attack?" for a peaceful one in view (answered by
 * `handler` with `{ victim }`). Returns the energy used.
 * ref: src/uhitm.c do_attack(), attack_checks()
 */
export function doAttack(ctx: Ctx, vmon: Entity, handler: DefId): number | null {
  if (isSafemon(ctx, vmon)) {
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
    return null;
  }
  // ref: src/uhitm.c attack_checks(): "Wait!  There's something there you can't see!"
  const at = vmon.c.pos;
  if (at && attackChecksUnseen(ctx, vmon, at.x, at.y)) {
    ctx.interrupt(); // domove(): nomul(0) before attacking a monster that is not safe
    return NORMAL_SPEED;
  }
  // ref: src/uhitm.c attack_checks(): "Really attack the dwarf?" for a peaceful monster in view
  if (needsAttackConfirm(ctx, vmon.id)) {
    askReallyAttack(ctx, vmon.id, handler, { victim: vmon.id });
    return 0;
  }
  return heroAttack(ctx, vmon.id);
}

/**
 * Nothing to fight at `to` (a forced fight, or walking into a remembered `I` with no monster
 * there): the `I` goes, and "You harmlessly attack a boulder." (the hero learns it is there:
 * map_object()), "You harmlessly attack the wall." or "You attack thin air.". The move is spent.
 * ref: src/hack.c domove_fight_empty()
 */
function fightEmpty(ctx: Ctx, level: Level, to: Pos): number {
  const inb = inBounds(level, to.x, to.y);
  let boulder = inb ? boulderAt(ctx, level.id, to.x, to.y) : null;
  // if a statue is displayed at the target location, the hero is attacking it
  if (inb && rememberedStatue(ctx.state, level.id, cellIndex(level, to.x, to.y)))
    boulder = statueAt(ctx, level.id, to.x, to.y);
  unmapInvisible(ctx, to.x, to.y); // "about to become known empty -- remove 'I' if present"
  if (boulder) {
    feelObjects(ctx, level, to.x, to.y);
    ctx.emit({
      type: 'msg',
      key: 'fight.harmless_obj',
      // ansimpleoname(): "a boulder", "a statue" (no monster: minimal_xname())
      params: { what: { key: ctx.defs.object(boulder.def).nameKey } },
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
 * While swallowed every move attacks the engulfer (no stun or confusion roll, no escape roll);
 * null when she is not swallowed. ref: src/hack.c domove_core(): `if (u.uswallow) { u.dx = u.dy
 * = 0; x = u.ustuck->mx, y = u.ustuck->my; mtmp = u.ustuck; }` then do_attack()
 */
function attackEngulfer(ctx: Ctx): number | null {
  const sw = uswallow(ctx);
  const mon = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  if (!mon) return null;
  const cost = doAttack(ctx, mon, 'nh:move') ?? heroAttack(ctx, mon.id);
  ctx.interrupt(); // no running or travelling on inside it
  return cost;
}

/**
 * The hero cannot take the stairs while held or swallowed: "You are engulfed, and cannot go
 * down." (the move is spent). ref: src/do.c u_stuck_cannot_go() (no sticky hero: no polymorph)
 */
function uStuckCannotGo(ctx: Ctx, updn: 'up' | 'down'): boolean {
  const id = ustuck(ctx);
  if (id === null) return false;
  const mon = ctx.state.entities[String(id)];
  const sw = uswallow(ctx);
  ctx.emit({
    type: 'msg',
    key: 'stairs.stuck',
    params: {
      how: {
        key: !sw
          ? 'stairs.stuck.held'
          : mon && digests(ctx.defs.monster(mon.def))
            ? 'stairs.stuck.swallowed'
            : 'stairs.stuck.engulfed',
      },
      dir: { key: `stairs.stuck.${updn}` },
    },
  });
  return true;
}

/**
 * Fight: attack whatever is in that direction, even a pet or a peaceful monster (still asking
 * "Really attack?" for a peaceful one), or a seen web there (cut or punch through it).
 * ref: src/cmd.c the F prefix (context.forcefight), src/hack.c domove_fight_web(),
 * domove_fight_empty()
 */
const fight: ActionDef = {
  id: 'nh:fight',
  labelKey: 'action.nh:fight',
  handles: 'mod',
  offer(ctx, target) {
    // swallowed: her own square offers to attack the engulfer (any direction does)
    const sw = uswallow(ctx);
    if (sw) {
      const mon = ctx.state.entities[String(sw.mon)];
      return target.kind === 'self' && mon
        ? [
            {
              action: { type: 'mod', action: 'nh:fight', args: { dir: 'n' } },
              labelKey: 'action.attack',
              params: { target: `@${mon.def}` },
              priority: HERE,
            },
          ]
        : [];
    }
    if (target.kind !== 'cell') return [];
    const dir = dirTo(playerAt(ctx), target.pos);
    if (!dir) return [];
    const seen = ctx.query.describe(target.pos).entities.find((e) => ctx.defs.isMonster(e.def));
    // a remembered, unseen monster: fight it (walking into the `I` does the same)
    if (!seen && markedUnseen(ctx, target.pos.x, target.pos.y))
      return [
        {
          action: { type: 'mod', action: 'nh:fight', args: { dir } },
          labelKey: 'action.nh:fight',
          params: { target: '@pronoun.it' },
        },
      ];
    // a boulder the hero knows of: "You harmlessly attack a boulder." (walking pushes it); a
    // statue: "You harmlessly attack a statue." (walking steps onto it)
    const lvl = getLevel(ctx.state);
    const statueShown =
      inBounds(lvl, target.pos.x, target.pos.y) &&
      rememberedStatue(ctx.state, lvl.id, cellIndex(lvl, target.pos.x, target.pos.y));
    if (!seen && (statueShown || rememberedBoulder(ctx, lvl, target.pos.x, target.pos.y)))
      return [
        {
          action: { type: 'mod', action: 'nh:fight', args: { dir } },
          labelKey: 'action.nh:fight',
          params: { target: `@${statueShown ? STATUE : BOULDER}` },
        },
      ];
    // a seen web: cut through it (walking would step into it)
    const web = seen ? undefined : trapAt(getLevel(ctx.state), target.pos.x, target.pos.y);
    if (web?.def === TRAP.web && web.seen)
      return [
        {
          action: { type: 'mod', action: 'nh:fight', args: { dir } },
          labelKey: 'action.nh:fight',
          params: { target: `@${TRAP.web}` },
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
    const swallowed = attackEngulfer(ctx);
    if (swallowed !== null) return swallowed;
    const dir = impairedDir(ctx, want);
    if (dir === null) return NORMAL_SPEED;
    const from = playerAt(ctx);
    const to = { x: from.x + DIRS[dir].x, y: from.y + DIRS[dir].y };
    const level = getLevel(ctx.state);
    const victim = monsterIdAt(ctx, to, level.id);
    if (victim === null) {
      // ref: domove_fight_web()
      if (fightWeb(ctx, level, to.x, to.y)) {
        ctx.interrupt();
        return NORMAL_SPEED;
      }
      return fightEmpty(ctx, level, to);
    }
    if (needsAttackConfirm(ctx, victim)) {
      askReallyAttack(ctx, victim, 'nh:move', { victim });
      return 0;
    }
    const cost = heroAttack(ctx, victim);
    // ref: src/uhitm.c do_attack() atk_done: a forced fight at a monster she can't spot that
    // lives on leaves the `I` where she struck
    const vmon = ctx.state.entities[String(victim)];
    if (
      vmon?.c.monster &&
      !canSpotMon(ctx, vmon) &&
      !markedUnseen(ctx, to.x, to.y) &&
      !engulfingU(ctx, victim)
    )
      mapInvisible(ctx, to.x, to.y);
    return cost;
  },
};

const move: ActionDef = {
  id: 'nh:move',
  labelKey: 'action.move',
  handles: 'move',
  offer(ctx, target) {
    if (target.kind !== 'cell' || isSwallowed(ctx)) return [];
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
    // walking into a remembered `I` fights it: `nh:fight` offers that
    if (markedUnseen(ctx, target.pos.x, target.pos.y)) return [];
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
    const swallowed = attackEngulfer(ctx);
    if (swallowed !== null) return swallowed;
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
    if (vmon) {
      const cost = doAttack(ctx, vmon, 'nh:move');
      if (cost !== null) return cost;
    } else if (markedUnseen(ctx, to.x, to.y)) {
      // ref: src/hack.c domove_fight_empty(): "remembered an 'I' && didn't use a move command"
      return fightEmpty(ctx, level, to);
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
export const WT_TOOMUCH_DIAGONAL = 600;

/**
 * Rock or wall the hero cannot pass (IS_OBSTRUCTED(), out of the map counts too); boulders count
 * only in Sokoban. ref: src/hack.c bad_rock() for a hero who cannot tunnel
 */
export function badRock(ctx: Ctx, level: Level, x: number, y: number): boolean {
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
          key: `${intoTrap(t.def) ? 'trap.confirm_into' : 'trap.confirm_onto'}${uLoco(ctx)}`,
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
  // ref: domove(): `if (u.utrap) { if (!trapmove(x, y, trap)) return; }` -- the move is spent;
  // once free, reset_utrap(TRUE) "might resume levitation". The trap at the destination lets her
  // step from a pit into the next one (3.6's domove(); 3.7 passes NULL: DEVIATIONS)
  const wasLevitating = levitating(ctx);
  if (!trapmove(ctx, dir, trapAt(level, to.x, to.y))) {
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
      const amt =
        invWeight(ctx.state, ctx.defs, player.id) + weightCap(ctx.state, ctx.defs, player.id);
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
      spotTrap(ctx, from);
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
      if (noHandsToOpen(ctx)) return 0;
      openDoor(ctx, level, to);
      return NORMAL_SPEED;
    }
    case 'lockedDoor': {
      // ref: src/hack.c test_move() closed_door(): locked, so no time passes
      if (noHandsToOpen(ctx)) return 0;
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
/**
 * "You can't open anything -- you have no hands!" for a polymorphed form without hands (no
 * time). ref: src/lock.c doopen_indir()
 */
function noHandsToOpen(ctx: Ctx): boolean {
  const form = heroForm(ctx);
  if (!form || !nohands(form)) return false;
  ctx.emit({ type: 'msg', key: 'door.nohands' });
  return true;
}

const open: ActionDef = {
  id: 'nh:open',
  labelKey: 'action.open',
  handles: 'mod',
  offer(ctx, target) {
    if (target.kind !== 'cell') return [];
    const dir = dirTo(playerAt(ctx), target.pos);
    if (!dir) return [];
    const form = heroForm(ctx);
    if (form && nohands(form)) return [];
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
    if (noHandsToOpen(ctx)) return 0;
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
    openDoor(ctx, level, to);
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
    dosearch0(ctx, false);
    return NORMAL_SPEED;
  },
};

/**
 * An explicit search finds a monster next to her that she can't spot: "You feel an unseen
 * monster!" and the `I`. 1 when found (the search ends there), -1 when the `I` already marks it
 * (the square is skipped), 0 otherwise. ref: src/detect.c mfind0() (no mimics, hiders or
 * warning; no Wis exercise)
 */
function mfind0(ctx: Ctx, mon: Entity, x: number, y: number): number {
  if (canSpotMon(ctx, mon)) return 0;
  // "Found invisible monster in square which already has 'I' in it."
  if (markedUnseen(ctx, x, y)) return -1;
  mapInvisible(ctx, x, y);
  ctx.emit({ type: 'msg', key: 'search.unseen_monster' });
  return 1;
}

/**
 * Searches the 3x3 around the hero (explicitly, or automatically each turn with Searching:
 * `aflag`). ref: src/detect.c dosearch0(): x outer, y inner. Hidden monsters and mimics are not
 * implemented; there is no lenses/artifact bonus (fund = 0). Luck counts.
 */
function dosearch0(ctx: Ctx, aflag: boolean): void {
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
        // ref: dosearch0(): an explicit search finds an unseen monster (mfind0()), or forgets an
        // `I` with nothing there ("see if an invisible monster has moved"; blind, feel_location()
        // does the same)
        const mid = aflag ? null : monsterIdAt(ctx, { x, y }, level.id);
        const mon = mid === null ? undefined : ctx.state.entities[String(mid)];
        if (mon) {
          const found = mfind0(ctx, mon, x, y);
          if (found === -1) continue;
          if (found > 0) return;
        } else if (!aflag) unmapInvisible(ctx, x, y);
        // ref: dosearch0(): `(trap = t_at(x, y)) && !trap->tseen && !rnl(8)` -> find_trap()
        // a statue trap goes off instead of being found, and the search ends
        if (findTrapAt(ctx, level, x, y, () => rnl(ctx.rng, 8, luckOf(ctx.state))) === 'statue')
          return;
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
    dosearch0(ctx, true);
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
    if (uStuckCannotGo(ctx, 'down')) return NORMAL_SPEED;
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
    if (uStuckCannotGo(ctx, 'up')) return NORMAL_SPEED;
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
