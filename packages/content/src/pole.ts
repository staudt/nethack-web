// Applying a polearm or lance at a spot two squares away (#apply, and `f` with one wielded).
// ref: src/apply.c calc_pole_range(), find_poleable_mon(), get_valid_polearm_position(),
// display_polearm_positions(), use_pole(); src/dothrow.c dofire() (the wielded polearm)
//
// The hit itself is dothrow.ts thitmonst()'s HMON_APPLIED path. Not ported: steeds and
// jousting (lances apply like polearms), Snickersnee, mimics and hiders (attack_checks()),
// engravings (u_wipe_engr()), the confusing touch (u.umconf) on an applied hit, conduct; the
// queued re-apply after wielding is the next move's occupation, as for the pick-axe.
import {
  NORMAL_SPEED,
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  inventoryOf,
  isVisible,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type Msg,
  type Pos,
} from '@nh/core';
import { couldseeAt } from './apparxy';
import { BOULDER, boulderAt } from './boulder';
import { monsterIdAt } from './combat';
import { thitmonst } from './dothrow';
import { isSwallowed } from './engulfstate';
import { askPosition, positionAnswer } from './getpos';
import { gethungry } from './hunger';
import { markedUnseen, unmapInvisible } from './invis';
import { wieldTool } from './itemactions';
import { wakeNearto } from './noise';
import { askReallyAttack, attackChecksUnseen, needsAttackConfirm } from './peaceful';
import { canSpotMon } from './perception';
import { P, hasProp } from './props';
import { activateStatueTrap } from './statue';
import { rememberedStatue, statueAt } from './statuestate';
import { P_BASIC, P_SKILLED, isPole, skillLevel } from './skills';
import { T } from './terrain';
import { TRAP } from './trap';

export const POLE_ID: DefId = 'nh:pole';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

function heroPos(ctx: Pick<Ctx, 'state'>): { level: string; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('Player has no position');
  return p;
}

const uwep = (ctx: Pick<Ctx, 'state'>): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null;

// ---------------------------------------------------------------------------------------------
// context.polearm.hitmon: the monster last hit, the next use's default target

interface PoleState {
  /** context.polearm.hitmon */
  poleHitmon?: EntityId;
}

const poleState = (state: Ctx['state']): PoleState => {
  const d = state.modData['nh'] as unknown as PoleState | undefined;
  return typeof d === 'object' && d !== null ? d : {};
};

function setHitmon(ctx: Pick<Ctx, 'state'>, id: EntityId | null): void {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as PoleState | undefined;
  if (id === null) {
    if (typeof d === 'object' && d !== null) delete d.poleHitmon;
    return;
  }
  if (typeof d !== 'object' || d === null) {
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  d.poleHitmon = id;
}

// ---------------------------------------------------------------------------------------------
// reach

/** The squared distances a pole reaches. */
export interface PoleRange {
  min: number;
  max: number;
}

/**
 * The pole's reach is always 2 steps: unskilled and basic orthogonal only (4..4), skilled adds
 * the knight's jump (4..5), expert the diagonal (4..8). ref: src/apply.c calc_pole_range()
 */
export function polearmRange(ctx: Pick<Ctx, 'state' | 'defs'>): PoleRange {
  const w = uwep(ctx);
  const skill = w ? ctx.defs.object(w.def).weapon?.skill : undefined;
  const lev = skill ? skillLevel(ctx, skill) : 0;
  return { min: 4, max: !skill || lev <= P_BASIC ? 4 : lev === P_SKILLED ? 5 : 8 };
}

const distu = (ctx: Pick<Ctx, 'state'>, x: number, y: number): number => {
  const u = heroPos(ctx);
  return (x - u.x) ** 2 + (y - u.y) ** 2;
};

/** cansee(x, y) on the hero's level. */
const canseeAt = (ctx: Pick<Ctx, 'state'>, level: Level, x: number, y: number): boolean =>
  inBounds(level, x, y) && isVisible(ctx.state, cellIndex(level, x, y));

/** The monster at (x, y) when the map shows it there (glyph_is_monster()). */
function shownMonster(ctx: Ctx, level: Level, x: number, y: number): Entity | null {
  const id = monsterIdAt(ctx, { x, y }, level.id);
  const mon = id !== null ? ctx.state.entities[String(id)] : undefined;
  return mon && canSpotMon(ctx, mon) ? mon : null;
}

/** glyph_is_statue(glyph_at(x, y)): a statue shown, with no monster or `I` over it. */
const shownStatue = (ctx: Ctx, level: Level, x: number, y: number): boolean =>
  shownMonster(ctx, level, x, y) === null &&
  !markedUnseen(ctx, x, y) &&
  rememberedStatue(ctx.state, level.id, cellIndex(level, x, y));

/** glyph_is_poleable(): a monster, the remembered `I` or a statue is shown there. */
const poleable = (ctx: Ctx, level: Level, x: number, y: number): boolean =>
  shownMonster(ctx, level, x, y) !== null ||
  markedUnseen(ctx, x, y) ||
  shownStatue(ctx, level, x, y);

/** ref: src/apply.c get_valid_polearm_position() */
function validPolePos(ctx: Ctx, level: Level, range: PoleRange, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return false;
  const d = distu(ctx, x, y);
  return (
    d >= range.min &&
    d <= range.max &&
    (canseeAt(ctx, level, x, y) || (couldseeAt(ctx, x, y) && poleable(ctx, level, x, y)))
  );
}

/** The cells the cursor highlights. ref: src/apply.c display_polearm_positions() */
export function validPolePositions(ctx: Ctx): Pos[] {
  const level = getLevel(ctx.state);
  const u = heroPos(ctx);
  const range = polearmRange(ctx);
  const out: Pos[] = [];
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++)
      if (validPolePos(ctx, level, range, u.x + dx, u.y + dy))
        out.push({ x: u.x + dx, y: u.y + dy });
  return out;
}

/**
 * The one target in reach, if there is exactly one: a shown monster (not a pet, nor a peaceful
 * one, unless she is confused, stunned or hallucinating), the `I`, or (impaired) a statue.
 * ref: src/apply.c find_poleable_mon()
 */
function findPoleableMon(ctx: Ctx, level: Level, range: PoleRange): Pos | null {
  const h = hero(ctx);
  const impaired = hasProp(h, P.CONFUSION) || hasProp(h, P.STUNNED) || hasProp(h, P.HALLUC);
  const u = heroPos(ctx);
  const rt = Math.floor(Math.sqrt(range.max)); // isqrt()
  let found: Pos | null = null;
  for (let x = Math.max(u.x - rt, 1); x <= Math.min(u.x + rt, level.width - 1); ++x)
    for (let y = Math.max(u.y - rt, 0); y <= Math.min(u.y + rt, level.height - 1); ++y) {
      if (!validPolePos(ctx, level, range, x, y)) continue;
      const mon = shownMonster(ctx, level, x, y);
      // (flags.confirm is always on)
      if (!impaired && mon && (mon.c.monster?.tame || mon.c.monster?.peaceful)) continue;
      if (poleable(ctx, level, x, y) && (!shownStatue(ctx, level, x, y) || impaired)) {
        if (found) return null; // more than one candidate location
        found = { x, y };
      }
    }
  return found;
}

// ---------------------------------------------------------------------------------------------
// using it

interface PoleData {
  item: EntityId;
  /** `f`: no prompt (use_pole(obj, TRUE)) */
  autohit?: boolean;
  /** the "Really attack?" question's spot */
  confirm?: { x: number; y: number };
}

/** Furniture (IS_FURNITURE()): stairs, fountains, sinks and altars here. */
function isFurniture(ctx: Ctx, level: Level, x: number, y: number): boolean {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  if (!id) return false;
  const t = ctx.defs.terrain(id);
  return t.stairs !== undefined || id === T.fountain || id === T.sink || id.startsWith('nh:altar_');
}

/**
 * Applies the polearm (or lance) `obj`: refused while swallowed; an unwielded one is wielded
 * first (that takes the move, the spot is asked on the next); then "Where do you want to hit?"
 * with the reachable cells highlighted and the cursor on the only target in reach (or the
 * monster hit last). `autohit` (`f`) skips the question and hits that target. Returns the
 * energy used (0 while the prompt is up).
 * ref: src/apply.c use_pole() up to getpos()
 */
export function usePole(ctx: Ctx, obj: Entity, autohit: boolean): number {
  if (isSwallowed(ctx)) {
    say(ctx, 'pole.no_room');
    return 0;
  }
  if (uwep(ctx)?.id !== obj.id) {
    if (!wieldTool(ctx, obj, 'swing')) return 0;
    // we're now wielding it: the next move applies it (C queues doapply)
    ctx.state.occupation = {
      action: { type: 'mod', action: POLE_ID, args: { item: obj.id } },
      data: null,
    };
    return NORMAL_SPEED;
  }
  const level = getLevel(ctx.state);
  const range = polearmRange(ctx);
  const u = heroPos(ctx);
  let cc: Pos = { x: u.x, y: u.y };
  const found = findPoleableMon(ctx, level, range);
  if (found) cc = found;
  else {
    const hid = poleState(ctx.state).poleHitmon;
    const hitm = hid !== undefined ? ctx.state.entities[String(hid)] : undefined;
    const hp = hitm?.c.pos;
    if (hitm?.c.monster && hp?.level === level.id && canSpotMon(ctx, hitm)) {
      const d = distu(ctx, hp.x, hp.y);
      if (d <= range.max && d >= range.min) cc = { x: hp.x, y: hp.y };
    }
  }
  if (autohit) return poleAt(ctx, obj, cc, true, false);
  const data: PoleData = { item: obj.id };
  askPosition(ctx, 'pole.where', POLE_ID, data as unknown as Json, {
    id: 'pole-spot',
    start: cc,
    valid: validPolePositions(ctx),
  });
  return 0;
}

/**
 * The blow at `cc`: "Too far!", "Too close!" ("Don't know what to hit." for `f` with no
 * target), an unseen spot that shows nothing ("You won't hit anything if you can't see that
 * spot.") or one she could not see ("You can't reach that spot from here.") cost nothing. A
 * monster there is attacked (attack_checks(): the unseen one is found, a peaceful one asks
 * "Really attack?"; overexertion) through thitmonst(); a statue (its trap set off) or a boulder
 * is "Thump!", rock or furniture "You uselessly attack ...", else "You miss; there is no one
 * there to hit.". ref: src/apply.c use_pole() after getpos()
 */
function poleAt(ctx: Ctx, obj: Entity, cc: Pos, autohit: boolean, confirmed: boolean): number {
  const level = getLevel(ctx.state);
  const range = polearmRange(ctx);
  const u = heroPos(ctx);
  const d = distu(ctx, cc.x, cc.y);
  if (d > range.max) {
    say(ctx, 'pole.too_far');
    return 0;
  } else if (d < range.min) {
    say(ctx, autohit && cc.x === u.x && cc.y === u.y ? 'pole.dont_know' : 'pole.too_close');
    return 0;
  } else if (!canseeAt(ctx, level, cc.x, cc.y) && !poleable(ctx, level, cc.x, cc.y)) {
    say(ctx, 'pole.cant_see');
    return 0;
  } else if (!couldseeAt(ctx, cc.x, cc.y)) {
    say(ctx, 'pole.cant_reach');
    return 0;
  }

  setHitmon(ctx, null);
  const monId = monsterIdAt(ctx, cc, level.id);
  const mon = monId !== null ? ctx.state.entities[String(monId)] : undefined;
  if (monId !== null && mon) {
    // attack_checks(): an unseen monster is found ("Wait!"), which takes the move
    if (attackChecksUnseen(ctx, mon, cc.x, cc.y)) return NORMAL_SPEED;
    if (!confirmed && needsAttackConfirm(ctx, monId)) {
      const data: PoleData = { item: obj.id, confirm: { x: cc.x, y: cc.y } };
      askReallyAttack(ctx, monId, POLE_ID, data as unknown as Json);
      return 0;
    }
    // overexertion(): burn nutrition; maybe pass out
    gethungry(ctx);
    if (hero(ctx).c.helpless || ctx.state.gameOver) return NORMAL_SPEED;
    setHitmon(ctx, monId);
    thitmonst(ctx, monId, obj.id, { i: 1, n: 1 }, true);
  } else if (shownStatue(ctx, level, cc.x, cc.y) && statueAt(ctx, level.id, cc.x, cc.y)) {
    const t = trapAt(level, cc.x, cc.y);
    if (t?.def === TRAP.statue && activateStatueTrap(ctx, level.id, t, false)) {
      // feedback has been given by animate_statue()
    } else {
      // "Since statues look like monsters now, we say something different from 'you miss'"
      say(ctx, 'pole.thump_statue');
      wakeNearto(ctx, cc.x, cc.y, 25);
    }
  } else {
    // no monster here and no statue seen or remembered here
    unmapInvisible(ctx, cc.x, cc.y);
    const i = cellIndex(level, cc.x, cc.y);
    const t = level.cells[i] ?? 0;
    const rules = cellRules(level, ctx.defs);
    const id = level.palette[t];
    if (
      ctx.state.objectMemory[level.id]?.[String(i)] === BOULDER &&
      boulderAt(ctx, level.id, cc.x, cc.y)
    ) {
      say(ctx, 'pole.thump_boulder');
      wakeNearto(ctx, cc.x, cc.y, 25);
    } else if (!(rules.passable[t] || rules.closedDoor[t]) || isFurniture(ctx, level, cc.x, cc.y)) {
      // "similar to 'F'orcefight with a melee weapon"
      if (!id || id === T.stone || id === T.scorr) say(ctx, 'pole.useless_stone');
      else say(ctx, 'pole.useless', { what: `@${ctx.defs.terrain(id).nameKey}` });
    } else {
      say(ctx, 'pole.miss_nobody');
    }
  }
  return NORMAL_SPEED;
}

/** The hero's item `id` if it is a polearm or lance she carries. */
function heroPole(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId && isPole(ctx.defs.object(e.def)) ? e : null;
}

/**
 * `nh:pole`: the second move of applying an unwielded pole, and the answers of the spot prompt
 * and of "Really attack?". Offered through Apply (and Fire), never on its own.
 */
export const poleAction: ActionDef = {
  id: POLE_ID,
  labelKey: 'action.nh:apply',
  handles: 'mod',
  offer: () => [],
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    const obj = heroPole(ctx, (action.args as { item?: unknown } | undefined)?.item);
    return obj ? usePole(ctx, obj, false) : 0;
  },
  answer(ctx, value, raw) {
    const data = raw as unknown as PoleData;
    const obj = heroPole(ctx, data.item);
    // the pole must still be wielded (getpos() keeps the game still; this is a safety net)
    if (!obj || uwep(ctx)?.id !== obj.id) return 0;
    if (data.confirm) {
      if (value !== true) return 0; // "Really attack?" no: no time
      return poleAt(ctx, obj, data.confirm, false, true);
    }
    const cc = positionAnswer(value);
    if (!cc) return 0; // ESC
    return poleAt(ctx, obj, cc, false, false);
  },
};

/** Whether `e` is the hero's wielded polearm or lance (for `f`). */
export const wieldedPole = (ctx: Ctx, e: Entity): boolean =>
  uwep(ctx)?.id === e.id && isPole(ctx.defs.object(e.def));
