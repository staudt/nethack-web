// Jumping: the #jump command (jumping boots, a fresh spell of jumping) and the spell itself.
// ref: src/apply.c dojump(), jump(), check_jump(), is_valid_jump_pos(),
// get_valid_jump_position(), display_jump_positions(); src/dothrow.c walk_path(), hurtle_jump(),
// hurtle_step() (the jumping path); src/spell.c spelleffects() SPE_JUMPING
//
// Not ported: Knights (no such role), steeds, polymorphed forms without legs, water, lava, the
// Planes, ball and chain, Passes_walls, regions and a hero whose touch petrifies (DEVIATIONS.md
// "Jumping").
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Level,
  type Msg,
  type Pos,
} from '@nh/core';
import { WT_TOOMUCH_DIAGONAL, badRock } from './actions';
import { boulderAt } from './boulder';
import { monsterIdAt } from './combat';
import { isSwallowed } from './engulfstate';
import { askPosition, positionAnswer } from './getpos';
import { setUstuck, ustuck } from './hackmove';
import { losehp } from './hp';
import { morehungry, nutritionOf } from './hunger';
import { LEFT_SIDE, RIGHT_SIDE, legsInNoShape, setWoundedLegs } from './legs';
import { whichArmor } from './mongear';
import { isMConfused } from './mstate';
import { wakeNearto } from './noise';
import { nomul } from './nomul';
import { setmangry } from './peaceful';
import { canSpotMon, someMonNam } from './perception';
import { mapInvisible, markedUnseen } from './invis';
import { P, conflictOn, hasExtrinsic, hasProp, timeoutLeft } from './props';
import { useSkill } from './skills';
import { isSokoban } from './sokoban';
import { KEEN, knownSpells } from './spell';
import { spellSkill } from './spellcalc';
import { checkSpecialRoom } from './rooms';
import { instapetrify } from './stonetouch';
import { touchPetrifies } from './stonestate';
import { T, isObstructedId, isStwallId, terrainIdAt } from './terrain';
import { cansee, deltrap, dotrap, teleds } from './trap';
import { isHole, isPit, levitating, setUtrap, utrap } from './trapstate';
import { UNENCUMBERED, invWeight, nearCapacity, weightCap } from './stats';

export const JUMP_ID: DefId = 'nh:jump';
export const JUMPING_BOOK: DefId = 'nh:spellbook_of_jumping';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

function heroPos(ctx: Pick<Ctx, 'state'>): { level: string; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('Player has no position');
  return p;
}

/** ref: include/youprop.h Jumping (HJumping || EJumping) */
export const canJump = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.JUMPING);

/** known_spell(SPE_JUMPING) >= spe_Fresh: she knows the spell and has not begun to forget it. */
export const jumpSpellFresh = (ctx: Pick<Ctx, 'state'>): boolean =>
  (knownSpells(ctx).find((s) => s.id === JUMPING_BOOK)?.retention ?? 0) > KEEN / 10;

/** The cast of the spell of jumping, bound by cast.ts (spelleffects(SPE_JUMPING, FALSE, FALSE)). */
let jumpSpell: (ctx: Ctx) => number = () => 0;
export function setJumpSpell(fn: (ctx: Ctx) => number): void {
  jumpSpell = fn;
}

/** ref: apply.c enum jump_trajectory */
const J_ANY = 0;
const J_HORZ = 1;
const J_VERT = 2;
const J_DIAG = 3;

/** A door in a horizontal wall (lev->horizontal); our open doors say which wall they are in. */
const isOpenDoor = (id: DefId | undefined): boolean => id === T.door_open_v || id === T.door_open_h;
const isClosedDoor = (id: DefId | undefined): boolean =>
  id === T.door_closed || id === T.door_locked;
const horizontalDoor = (id: DefId | undefined): boolean => id === T.door_open_h;

/**
 * Bresenham's line from `src` to `dest`, calling `check` on each cell after the first; stops at
 * the first false. Returns where the walk ended: `dest`, or the cell before the refusing one.
 * ref: src/dothrow.c walk_path()
 */
export function walkPath(
  src: Pos,
  dest: Pos,
  check: (x: number, y: number) => boolean,
): { ok: boolean; at: Pos } {
  let dx = dest.x - src.x;
  let dy = dest.y - src.y;
  let x = src.x;
  let y = src.y;
  let prevX: number;
  let prevY: number;
  const xChange = dx < 0 ? -1 : 1;
  const yChange = dy < 0 ? -1 : 1;
  dx = Math.abs(dx);
  dy = Math.abs(dy);
  let err = 0;
  let i = 0;
  if (dx < dy) {
    while (i++ < dy) {
      prevX = x;
      prevY = y;
      y += yChange;
      err += dx << 1;
      if (err > dy) {
        x += xChange;
        err -= dy << 1;
      }
      if (!check(x, y)) return { ok: false, at: { x: prevX, y: prevY } };
    }
  } else {
    while (i++ < dx) {
      prevX = x;
      prevY = y;
      x += xChange;
      err += dy << 1;
      if (err > dx) {
        y += yChange;
        err -= dx << 1;
      }
      if (!check(x, y)) return { ok: false, at: { x: prevX, y: prevY } };
    }
  }
  return { ok: true, at: { x: dest.x, y: dest.y } };
}

/**
 * One cell of the path: walls, closed doors and boulders stop a jump; an open door stops one
 * across it or diagonally through it (not a magical one). The hero is never a giant.
 * ref: src/apply.c check_jump() (no Passes_walls)
 */
function checkJump(ctx: Ctx, level: Level, traj: number, x: number, y: number): boolean {
  const typ = terrainIdAt(level, x, y);
  if (isStwallId(typ)) return false;
  if (isClosedDoor(typ)) return false;
  if (
    isOpenDoor(typ) &&
    traj !== J_ANY &&
    // reject a diagonal jump into, out of or through an open door, and a horizontal jump
    // through a door in a horizontal wall (and vertical through vertical)
    (traj === J_DIAG || ((traj & J_HORZ) !== 0) === horizontalDoor(typ))
  )
    return false;
  return !boulderAt(ctx, level.id, x, y);
}

/**
 * Whether she may jump to (x, y): a knight's move only for a Knight's own jumping, within reach
 * (distance squared 9, or 6 + 3 per skill level for the spell), on the map, in sight, not
 * diagonally out of an open doorway, and with nothing in the way. `showmsg` says why not.
 * ref: src/apply.c is_valid_jump_pos()
 */
export function isValidJumpPos(
  ctx: Ctx,
  x: number,
  y: number,
  magic: number,
  showmsg: boolean,
): boolean {
  const u = heroPos(ctx);
  const level = getLevel(ctx.state, u.level);
  const h = hero(ctx);
  const distu = (x - u.x) ** 2 + (y - u.y) ** 2;
  // (HJumping & ~INTRINSIC): a timed jumping; only the role's intrinsic is the knight's move
  if (
    !magic &&
    timeoutLeft(ctx.state, h, P.JUMPING) === 0 &&
    !hasExtrinsic(h, P.JUMPING) &&
    distu !== 5
  ) {
    if (showmsg) say(ctx, 'jump.illegal_move');
    return false;
  }
  if (distu > (magic ? 6 + magic * 3 : 9)) {
    if (showmsg) say(ctx, 'jump.too_far');
    return false;
  }
  if (!inBounds(level, x, y)) {
    if (showmsg) say(ctx, 'jump.cannot_there');
    return false;
  }
  if (!cansee(ctx, u.level, x, y)) {
    if (showmsg) say(ctx, 'jump.cannot_see');
    return false;
  }
  const dx = x - u.x;
  const dy = y - u.y;
  let ax = Math.abs(dx);
  let ay = Math.abs(dy);
  // diag: any non-orthogonal destination is diagonal
  const diag = magic || (!dx && !dy) ? J_ANY : !dy ? J_HORZ : !dx ? J_VERT : J_DIAG;
  // traj: flattened, so a knight's move counts as horizontal or vertical
  if (ax >= 2 * ay) ay = 0;
  else if (ay >= 2 * ax) ax = 0;
  const traj = magic || (!ax && !ay) ? J_ANY : !ay ? J_HORZ : !ax ? J_VERT : J_DIAG;
  // walk_path() skips the start: a diagonal jump out of an open door is refused here
  const here = terrainIdAt(level, u.x, u.y);
  if (
    diag === J_DIAG &&
    isOpenDoor(here) &&
    (traj === J_DIAG || ((traj & J_HORZ) !== 0) === horizontalDoor(here))
  ) {
    if (showmsg) say(ctx, 'jump.diagonal_doorway');
    return false;
  }
  if (!walkPath(u, { x, y }, (px, py) => checkJump(ctx, level, traj, px, py)).ok) {
    if (showmsg) say(ctx, 'jump.obstacle');
    return false;
  }
  return true;
}

/** ref: include/rm.h ACCESSIBLE(): a door or anything walkable (no water or lava here) */
const accessible = (typ: DefId | undefined): boolean =>
  typ !== undefined && !isObstructedId(typ) && typ !== T.iron_bars;

/**
 * The cells a jump may land on, for the prompt's highlight: within four of her (not her own),
 * accessible and valid. ref: src/apply.c get_valid_jump_position(), display_jump_positions()
 */
export function validJumpPositions(ctx: Ctx, magic: number): Pos[] {
  const u = heroPos(ctx);
  const level = getLevel(ctx.state, u.level);
  const out: Pos[] = [];
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const x = u.x + dx;
      const y = u.y + dy;
      if (!dx && !dy) continue;
      if (!inBounds(level, x, y) || !accessible(terrainIdAt(level, x, y))) continue;
      if (isValidJumpPos(ctx, x, y, magic, false)) out.push({ x, y });
    }
  return out;
}

/** What the jump prompt carries to its answer. */
interface JumpData {
  /** 0: a physical jump; else the spell's skill level */
  magic: number;
  /** the spell of jumping: a forced cast (#wizcast) does not practise the school */
  spell?: { force: boolean };
}

/**
 * Jumps: the refusals of a physical jump (no Jumping: "You can't jump very far.", burdened, weak
 * or hungry, wounded legs), what holds her (engulfed, held, levitating: the spell wriggles and
 * takes the move) and "Where do you want to jump?" with the valid cells highlighted. Without
 * Jumping a fresh spell of jumping is cast instead. Returns the move's energy (0: no time), or
 * null when the prompt is up (its answer, {@link JUMP_ID}, finishes the jump).
 * ref: src/apply.c jump() (up to getpos())
 */
export function jump(ctx: Ctx, magic: number, spell?: { force: boolean }): number | null {
  const h = hero(ctx);
  // attempt the spell if the hero has no innate jumping ability
  if (!magic && !canJump(ctx) && jumpSpellFresh(ctx)) {
    const r = jumpSpell(ctx);
    return ctx.state.pendingPrompt ? null : r;
  }
  const stuck = ustuck(ctx);
  if (!magic && !canJump(ctx)) {
    say(ctx, 'jump.not_far');
    return 0;
  } else if (isSwallowed(ctx)) {
    if (magic) {
      say(ctx, 'jump.bounce');
      return NORMAL_SPEED;
    }
    say(ctx, 'jump.kidding');
    return 0;
  } else if (stuck !== null) {
    const mon = ctx.state.entities[String(stuck)];
    if (mon?.c.monster?.tame && !conflictOn(ctx.state) && !isMConfused(ctx, stuck)) {
      setUstuck(ctx, null);
      say(ctx, 'jump.pull_free', { mon: someMonNam(ctx, mon) });
      return NORMAL_SPEED;
    }
    const name = mon ? someMonNam(ctx, mon) : '@pronoun.it';
    if (magic) {
      say(ctx, 'jump.writhe', { mon: name });
      return NORMAL_SPEED;
    }
    say(ctx, 'jump.cannot_escape', { mon: name });
    return 0;
  } else if (levitating(ctx)) {
    if (magic) {
      say(ctx, 'jump.flail');
      return NORMAL_SPEED;
    }
    say(ctx, 'jump.no_traction');
    return 0;
  } else if (!magic && nearCapacity(ctx.state, ctx.defs, h.id) > UNENCUMBERED) {
    say(ctx, 'jump.too_much');
    return 0;
  } else if (!magic && (nutritionOf(ctx) <= 100 || (h.c.attributes?.str ?? 10) < 6)) {
    say(ctx, 'jump.lack_strength');
    return 0;
  } else if (!magic && hasProp(h, P.WOUNDED_LEGS)) {
    legsInNoShape(ctx, 'legs.jumping');
    return 0;
  }
  const data: JumpData = { magic, ...(spell ? { spell } : {}) };
  askPosition(ctx, 'jump.where', JUMP_ID, data as unknown as Json, {
    id: 'jump-where',
    valid: validJumpPositions(ctx, magic),
  });
  return null;
}

/**
 * One cell of the flight: trees, secret doors and iron bars hurt ("Ouch!"), as does an open
 * door entered diagonally and a squeeze between rocks with too much to carry; a monster in the
 * way is bumped (woken and angered; a cockatrice petrifies her unless body armor, a cloak or a
 * shirt covers her); in Sokoban a diagonal squeeze halts her and a pit or hole pulls her down
 * on its cell; seen traps are passed over. She moves cell by cell (shops and rooms notice).
 * Returns false when the flight stops before (x, y). ref: src/dothrow.c hurtle_jump(),
 * hurtle_step() (no Passes_walls, regions, water, lava, magic portals, vibrating squares, fire
 * traps or ball and chain)
 */
function hurtleJumpStep(
  ctx: Ctx,
  level: Level,
  range: { n: number },
  x: number,
  y: number,
): boolean {
  if (range.n === 0) return false; // the previous step wants to stop now
  const stoppingShort = range.n < 2;
  const u = heroPos(ctx);
  const typ = terrainIdAt(level, x, y);
  const diagonal = u.x - x !== 0 && u.y - y !== 0;
  const odoorDiag = isOpenDoor(typ) && diagonal;
  let why: string | null = null;
  if (isObstructedId(typ) || isClosedDoor(typ) || odoorDiag) {
    why =
      typ === T.tree
        ? 'killer.jump.tree'
        : isObstructedId(typ)
          ? 'killer.jump.wall'
          : odoorDiag
            ? 'killer.jump.door_frame'
            : 'killer.jump.closed_door';
    if (odoorDiag) say(ctx, 'jump.door_frame');
    say(ctx, 'jump.ouch');
  } else if (typ === T.iron_bars) {
    why = 'killer.jump.iron_bars';
    say(ctx, 'jump.iron_bars');
  } else if (boulderAt(ctx, level.id, x, y)) {
    why = 'killer.jump.boulder';
    say(ctx, 'jump.bump_boulder');
  } else if (diagonal && badRock(ctx, level, u.x, y) && badRock(ctx, level, x, u.y)) {
    const h = hero(ctx);
    const tooMuch =
      invWeight(ctx.state, ctx.defs, h.id) + weightCap(ctx.state, h.id) > WT_TOOMUCH_DIAGONAL;
    if (tooMuch) {
      // the hero is never a big monster
      why = 'killer.jump.crevice';
      say(ctx, 'jump.wedged');
    }
  }
  if (why) {
    losehp(ctx, ctx.rng.rnd(2 + range.n), `@${why}`);
    wakeNearto(ctx, x, y, 10);
    return false;
  }

  const monId = monsterIdAt(ctx, { x, y }, level.id);
  const mon = monId !== null ? ctx.state.entities[String(monId)] : undefined;
  if (mon?.c.monster) {
    // `!glyph_is_monster(glyph) && !glyph_is_invisible(glyph)`: she finds it
    const spotted = canSpotMon(ctx, mon);
    const known = spotted || markedUnseen(ctx, x, y);
    const name = someMonNam(ctx, mon);
    say(ctx, known ? 'jump.bump_mon' : 'jump.find_mon', { mon: name });
    mon.c.monster.asleep = false; // wakeup(mon, FALSE)
    if (!spotted) mapInvisible(ctx, x, y);
    setmangry(ctx, mon.id);
    // a bodily collision: body armor, a cloak or a shirt protects her
    const pid = ctx.state.playerId;
    if (
      touchPetrifies(ctx.defs.monster(mon.def)) &&
      !whichArmor(ctx, pid, 'shirt') &&
      !whichArmor(ctx, pid, 'body') &&
      !whichArmor(ctx, pid, 'cloak')
    )
      instapetrify(ctx, `@killer.ston.bumping.${mon.def}`);
    if (!ctx.state.gameOver) wakeNearto(ctx, x, y, 10);
    return false;
  }

  if (diagonal && isSokoban(level) && badRock(ctx, level, u.x, y) && badRock(ctx, level, x, u.y)) {
    say(ctx, 'jump.abrupt_halt');
    return false;
  }

  // u_on_newpos(): she is in the air over (x, y)
  const h = hero(ctx);
  const from = { x: u.x, y: u.y };
  h.c.pos = { level: u.level, x, y };
  ctx.emit({ type: 'moved', id: h.id, from, to: { x, y } });
  checkSpecialRoom(ctx, false, from);

  const t = trapAt(level, x, y);
  if (t && !stoppingShort) {
    if ((isPit(t.def) || isHole(t.def)) && isSokoban(level)) {
      // air currents overcome the recoil in Sokoban; jump() lands her in it
      range.n = 0;
      return true;
    }
    if (t.seen) say(ctx, 'jump.pass_over', { trap: `@${t.def}` });
  }
  range.n = Math.max(range.n - 1, 0);
  return true;
}

/**
 * The jump's answer: cancelled is no jump; an invalid spot says why; escaping a trap first (a
 * bear trap tears her leg and hurts, a pit is leapt from, a web torn apart); jumping in place
 * sets off the trap there or is no jump at all; otherwise she flies the path and lands, is
 * helpless for a turn and burns `rnd(25)` nutrition. Returns the energy used (0: no time).
 * ref: src/apply.c jump() after getpos()
 */
function jumpAnswer(ctx: Ctx, value: Json, magic: number): number {
  const cc = positionAnswer(value);
  if (!cc) return 0; // ESC
  if (!isValidJumpPos(ctx, cc.x, cc.y, magic, true)) return 0;
  const u = heroPos(ctx);
  const level = getLevel(ctx.state, u.level);
  let wastrapped = false;
  const ut = utrap(ctx);
  if (ut) {
    wastrapped = true;
    if (ut.type === 'beartrap') {
      const side = ctx.rng.rn2(3) ? LEFT_SIDE : RIGHT_SIDE;
      say(ctx, 'jump.rip_bear_trap');
      losehp(ctx, ctx.rng.rnd(10), '@killer.jump.bear_trap');
      if (ctx.state.gameOver) return NORMAL_SPEED;
      setWoundedLegs(ctx, ctx.rng.rn2(1000) + 500, side);
    } else if (ut.type === 'pit') {
      say(ctx, 'jump.leap_pit');
    } else {
      say(ctx, 'jump.tear_web');
      const web = trapAt(level, u.x, u.y);
      if (web) deltrap(ctx, u.level, web);
    }
    setUtrap(ctx, 0, ut.type); // reset_utrap(TRUE)
  }
  if (cc.x === u.x && cc.y === u.y) {
    // escaping from a trap takes precedence over jumping in place
    if (wastrapped) {
      morehungry(ctx, ctx.rng.rnd(10));
      return NORMAL_SPEED;
    }
    const t = trapAt(level, cc.x, cc.y);
    if (t) {
      say(ctx, 'jump.up_and_down');
      dotrap(ctx, t, { force: true, plunged: true });
      return NORMAL_SPEED;
    }
    // jumping in place takes no time
    say(ctx, hasProp(hero(ctx), P.HALLUC) ? 'jump.hop' : 'jump.decide_not');
    return 0;
  }
  const range = { n: Math.max(Math.abs(cc.x - u.x), Math.abs(cc.y - u.y)) };
  const end = walkPath(u, cc, (x, y) =>
    ctx.state.gameOver ? false : hurtleJumpStep(ctx, level, range, x, y),
  ).at;
  if (ctx.state.gameOver) return NORMAL_SPEED;
  // hurtle_step() left her on the last cell but did not land her there
  teleds(ctx, end.x, end.y);
  const extra = nomul(ctx, 1, 'helpless.jumping', null);
  morehungry(ctx, ctx.rng.rnd(25));
  return NORMAL_SPEED + extra;
}

/**
 * After the spell's jump: "Nothing happens." when she did not jump, then the school is
 * practised; the cast always takes the move. ref: src/spell.c spelleffects() SPE_JUMPING, use_skill()
 */
export function jumpSpellDone(ctx: Ctx, used: number, force: boolean): number {
  if (used === 0) say(ctx, 'zap.nothing_happens');
  if (!force && !ctx.state.gameOver)
    useSkill(ctx, spellSkill(JUMPING_BOOK), ctx.defs.object(JUMPING_BOOK).spellbook?.level ?? 1);
  return Math.max(used, NORMAL_SPEED);
}

/**
 * `#jump`: offered on the hero while she can jump (jumping boots) or knows the spell of jumping
 * freshly; also the answer of every jump's position prompt. ref: src/apply.c dojump();
 * src/cmd.c there_cmd_menu_self() offers "Jump" when Jumping
 */
export const jumpAction: ActionDef = {
  id: JUMP_ID,
  labelKey: 'action.nh:jump',
  handles: 'mod',
  offer: (ctx, target) =>
    target.kind === 'self' && (canJump(ctx) || jumpSpellFresh(ctx))
      ? [{ action: { type: 'mod', action: JUMP_ID }, labelKey: 'action.nh:jump' }]
      : [],
  perform: (ctx) => jump(ctx, 0) ?? 0,
  answer(ctx, value, raw) {
    const data = raw as unknown as JumpData;
    const used = jumpAnswer(ctx, value, data.magic);
    return data.spell ? jumpSpellDone(ctx, used, data.spell.force) : used;
  },
};
