// Locks: applying a skeleton key, lock pick or credit card to an adjacent door or to a box on the
// floor under the hero, as a multi-turn occupation that can be interrupted and resumed.
// ref: src/lock.c pick_lock(), picklock(), lock_action(), reset_pick(), maybe_reset_pick(),
// autokey(); src/allmain.c interrupt_occupation / stop_occupation()
//
// Not ported (see DEVIATIONS.md): #force, trapped doors and boxes (and the Master Key of
// Thievery's trap finding), door mimics, the Rogue bonus (the hero is a Valkyrie), shop doors,
// levitation, pits, polymorphed forms without hands, Dex exercise (no exercise system yet).
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  getPlayer,
  inventoryOf,
  isContainer,
  itemsAt,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type ModApi,
  type Msg,
  type Offer,
  type PromptOption,
  type TerrainDef,
} from '@nh/core';
import { setTerrain } from './actions';
import { monsterNearby } from './eat';
import { pruneObjKnown, setLknown } from './items';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { P, heroHas } from './props';
import { T } from './terrain';
import { HERE } from './priority';
import { KEY, PICKLOCK_ID, lockAction, lockData, xlockOf, type Xlock } from './lockstate';

export { KEY, PICKLOCK_ID };

export const LOCK_ID: DefId = 'nh:lock';

export const isLockTool = (def: string): boolean =>
  def === KEY.skeleton || def === KEY.pick || def === KEY.card;

/** ref: src/lock.c reset_pick() */
function resetPick(ctx: Ctx): void {
  if (xlockOf(ctx)) delete lockData(ctx).xlock;
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
function heroPos(ctx: Pick<Ctx, 'state'>): { level: string; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('lock: the hero has no position');
  return p;
}

const levelOf = (ctx: Pick<Ctx, 'state'>, id: string): Level | undefined => ctx.state.levels[id];
function terrainAt(ctx: Ctx, level: Level, x: number, y: number): TerrainDef | null {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return null;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  return id !== undefined ? ctx.defs.terrain(id) : null;
}

const isBox = (ctx: Pick<Ctx, 'defs'>, e: Entity): boolean =>
  isContainer(ctx.defs, e) && ctx.defs.object(e.def).container?.box === true;

/** Boxes on the floor at the hero's feet, top of the pile first. */
export function floorBoxes(ctx: Ctx): Entity[] {
  const p = heroPos(ctx);
  return itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).filter((e) => isBox(ctx, e));
}

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/**
 * The tool used to unlock without asking which (a key, else a lock pick, else a credit card when
 * `opening`). ref: src/lock.c autokey() (no quest artifacts)
 */
export function autokey(ctx: Ctx, opening: boolean): Entity | null {
  let key: Entity | null = null;
  let pick: Entity | null = null;
  let card: Entity | null = null;
  for (const o of inventoryOf(ctx.state, ctx.state.playerId)) {
    if (o.def === KEY.skeleton) key ??= o;
    else if (o.def === KEY.pick) pick ??= o;
    else if (o.def === KEY.card) card ??= o;
  }
  if (!opening) card = null;
  return key ?? pick ?? card;
}

/**
 * One turn of working on the lock; returns true while still busy.
 * ref: src/lock.c picklock() (no traps, no magic key)
 */
function picklock(ctx: Ctx): boolean {
  const x = xlockOf(ctx);
  if (!x) return false;
  const p = heroPos(ctx);
  if (x.box !== undefined) {
    const box = ctx.state.entities[String(x.box)];
    const bp = box?.c.pos;
    if (!box || !bp || bp.level !== p.level || bp.x !== p.x || bp.y !== p.y) {
      x.usedtime = 0; // you or it moved
      return false;
    }
  } else if (x.door) {
    const d = DIRS[x.door.dir];
    if (x.door.level !== p.level || p.x + d.x !== x.door.x || p.y + d.y !== x.door.y) {
      x.usedtime = 0; // you moved
      return false;
    }
    const lv = levelOf(ctx, x.door.level);
    const t = lv ? terrainAt(ctx, lv, x.door.x, x.door.y) : null;
    if (t?.door === 'doorway') {
      say(ctx, 'lock.no_door_in_doorway');
      x.usedtime = 0;
      return false;
    }
    if (t?.door === 'open') {
      say(ctx, 'lock.open_door');
      x.usedtime = 0;
      return false;
    }
  } else return false;

  if (x.usedtime++ >= 50) {
    say(ctx, 'lock.give_up', { action: lockAction(ctx, x) });
    x.usedtime = 0;
    return false;
  }
  if (ctx.rng.rn2(100) >= x.chance) return true; // still busy

  say(ctx, 'lock.succeed', { action: lockAction(ctx, x) });
  if (x.door) {
    const lv = levelOf(ctx, x.door.level);
    const t = lv ? terrainAt(ctx, lv, x.door.x, x.door.y) : null;
    if (lv)
      setTerrain(lv, x.door.x, x.door.y, t?.door === 'locked' ? T.door_closed : T.door_locked);
  } else if (x.box !== undefined) {
    const it = ctx.state.entities[String(x.box)]?.c.item;
    if (it) {
      if (it.locked) delete it.locked;
      else it.locked = true;
      setLknown(ctx, x.box, true);
    }
  }
  x.usedtime = 0;
  return false;
}

/** True while a lock is being worked on (picklock is the occupation). */
const busy = (ctx: Ctx): boolean => (xlockOf(ctx)?.usedtime ?? 0) > 0;

/** Starts the occupation and works the first turn. Returns the energy used. */
function startPicking(ctx: Ctx, x: Xlock): number {
  lockData(ctx).xlock = x;
  return occupationTurn(ctx);
}

/** set_occupation(picklock): the first move runs now, the next ones are `continue`s. */
function occupationTurn(ctx: Ctx): number {
  if (picklock(ctx)) {
    ctx.state.occupation = { action: { type: 'mod', action: PICKLOCK_ID }, data: { lock: true } };
  }
  return NORMAL_SPEED;
}

/** The chance per turn for a box. ref: pick_lock() container branch */
function boxChance(ctx: Ctx, picktyp: string, box: Entity): number {
  const dex = hero(ctx).c.attributes?.dex ?? 10; // ACURR(A_DEX)
  let ch: number;
  switch (picktyp) {
    case KEY.card:
      ch = dex; // + 20 * Role_if(PM_ROGUE)
      break;
    case KEY.pick:
      ch = 4 * dex; // + 25 * Role_if(PM_ROGUE)
      break;
    case KEY.skeleton:
      ch = 75 + dex;
      break;
    default:
      ch = 0;
  }
  if (box.c.item?.buc === 'cursed') ch = Math.trunc(ch / 2);
  return ch;
}

/** The chance per turn for a door. ref: pick_lock() door branch */
function doorChance(ctx: Ctx, picktyp: string): number {
  const dex = hero(ctx).c.attributes?.dex ?? 10; // ACURR(A_DEX)
  switch (picktyp) {
    case KEY.card:
      return 2 * dex; // + 20 * Role_if(PM_ROGUE)
    case KEY.pick:
      return 3 * dex; // + 30 * Role_if(PM_ROGUE)
    case KEY.skeleton:
      return 70 + dex;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------------------------
// pick_lock(): choosing the lock

/** PICKLOCK_LEARNED_SOMETHING costs a move; PICKLOCK_DID_NOTHING does not. */
const LEARNED = NORMAL_SPEED;
const NOTHING = 0;

const LOCK_DIRECTIONS: PromptOption[] = [
  ...DIR_LIST.map((d) => ({ value: d, key: `dir.${d}` })),
  { value: 'self', key: 'lock.dir.here' },
];

interface AskData {
  stage: 'dir' | 'box' | 'door' | 'auto';
  pick: EntityId;
  /** Boxes still to ask about (stage 'box'), the current one first. */
  boxes?: EntityId[];
  dir?: Dir;
}

/** Resuming an interrupted attempt with the same kind of tool. ref: pick_lock() */
function tryResume(ctx: Ctx, pick: Entity): number | null {
  const x = xlockOf(ctx);
  if (!x || !x.usedtime || x.picktyp !== pick.def) return null;
  say(ctx, 'lock.resume', { action: lockAction(ctx, x) });
  return occupationTurn(ctx);
}

/**
 * Applying a lock tool: resumes an interrupted attempt or asks for a direction ('self' is the
 * hero's own cell, for boxes). ref: src/lock.c pick_lock() with rx == 0
 */
export function applyLockTool(ctx: Ctx, pick: Entity): number {
  const resumed = tryResume(ctx, pick);
  if (resumed !== null) return resumed;
  const data: AskData = { stage: 'dir', pick: pick.id };
  ctx.ask(
    { id: 'lock-direction', kind: 'direction', key: 'lock.direction', options: LOCK_DIRECTIONS },
    LOCK_ID,
    data as unknown as Json,
  );
  return NOTHING;
}

/** "There is a large box here; unlock it?" for the first box of `data.boxes`. */
function askBox(ctx: Ctx, pick: Entity, data: AskData): number {
  const id = data.boxes?.[0];
  const box = id === undefined ? undefined : ctx.state.entities[String(id)];
  if (!box?.c.item) return LEARNED;
  const it = box.c.item;
  let verb: string;
  let its = false;
  if (it.broken) {
    verb = 'fix';
    its = true;
  } else if (!it.locked) verb = 'lock';
  else if (pick.def !== KEY.pick) verb = 'unlock';
  else {
    verb = 'pick';
    its = true;
  }
  setLknown(ctx, box.id, true); // otmp->lknown = 1 (before the question is formatted)
  ctx.ask(
    {
      id: 'lock-box',
      kind: 'yn',
      key: its ? 'lock.box_q_its' : 'lock.box_q_it',
      params: { box: ctx.defs.itemName(ctx.state, box), verb: { key: `lock.verb.${verb}` } },
      cancellable: true,
    },
    LOCK_ID,
    { ...data, stage: 'box' } as unknown as Json,
  );
  return NOTHING;
}

/** The hero chose this box: checks, then the occupation. ref: pick_lock() after `c == 'y'` */
function chooseBox(ctx: Ctx, pick: Entity, box: Entity): number {
  const it = box.c.item;
  if (!it) return LEARNED;
  if (it.broken) {
    say(ctx, 'lock.cant_fix', { pick: xnameOf(ctx.state, ctx.defs, pick) });
    return LEARNED;
  }
  if (pick.def === KEY.card && !it.locked) {
    // credit cards are only good for unlocking
    say(ctx, 'lock.cant_with', { pick: xnameOf(ctx.state, ctx.defs, pick) });
    return LEARNED;
  }
  return startPicking(ctx, {
    box: box.id,
    chance: boxChance(ctx, pick.def, box),
    picktyp: pick.def,
    usedtime: 0,
  });
}

/** The boxes here (the `here` choice of the direction). ref: pick_lock() u_at(cc.x, cc.y) */
function pickHere(ctx: Ctx, pick: Entity, only?: EntityId): number {
  const boxes = floorBoxes(ctx).filter((b) => only === undefined || b.id === only);
  if (boxes.length === 0) {
    say(ctx, 'lock.no_lock_here');
    return LEARNED;
  }
  return askBox(ctx, pick, { stage: 'box', pick: pick.id, boxes: boxes.map((b) => b.id) });
}

/** An adjacent door. ref: pick_lock() "not the hero's location; pick the lock in an adjacent door" */
function pickDoor(ctx: Ctx, pick: Entity, dir: Dir): number {
  const p = heroPos(ctx);
  const d = DIRS[dir];
  const x = p.x + d.x;
  const y = p.y + d.y;
  const lv = levelOf(ctx, p.level);
  if (!lv) return NOTHING;
  const mon = sortedIds(ctx.state)
    .map((id) => ctx.state.entities[String(id)])
    .find((e) => e?.c.monster && e.c.pos?.level === p.level && e.c.pos.x === x && e.c.pos.y === y);
  if (mon && canSpotMon(ctx, mon)) {
    say(ctx, 'lock.wouldnt_appreciate', { mon: monNam(ctx, mon) });
    return LEARNED;
  }
  const t = terrainAt(ctx, lv, x, y);
  // a secret door is not a door yet (IS_DOOR is false for SDOOR)
  if (!t?.door) {
    say(ctx, heroHas(ctx.state, P.BLINDED) ? 'lock.feel_no_door' : 'lock.see_no_door');
    return NOTHING;
  }
  if (t.door === 'doorway') {
    say(ctx, 'lock.no_door_in_doorway');
    return LEARNED;
  }
  if (t.door === 'open') {
    say(ctx, 'lock.open_door');
    return LEARNED;
  }
  // credit cards are only good for unlocking
  if (pick.def === KEY.card && t.door !== 'locked') {
    say(ctx, 'lock.card_cant_lock');
    return LEARNED;
  }
  ctx.ask(
    {
      id: 'lock-door',
      kind: 'yn',
      key: t.door === 'locked' ? 'lock.unlock_it' : 'lock.lock_it',
      cancellable: true,
    },
    LOCK_ID,
    { stage: 'door', pick: pick.id, dir } as unknown as Json,
  );
  return NOTHING;
}

function beginDoor(ctx: Ctx, pick: Entity, dir: Dir): number {
  const p = heroPos(ctx);
  const d = DIRS[dir];
  return startPicking(ctx, {
    door: { level: p.level, x: p.x + d.x, y: p.y + d.y, dir },
    chance: doorChance(ctx, pick.def),
    picktyp: pick.def,
    usedtime: 0,
  });
}

/**
 * #loot found this box locked and the hero carries a tool: "Unlock it with your key?"
 * ref: src/pickup.c do_loot_cont() -> pick_lock(unlocktool, ox, oy, cobj) (autounlock apply-key)
 */
export function autounlock(ctx: Ctx, pick: Entity, box: Entity): number {
  const resumed = tryResume(ctx, pick);
  if (resumed !== null) return resumed;
  ctx.ask(
    {
      id: 'lock-auto',
      kind: 'yn',
      key: 'lock.unlock_with',
      params: { pick: xnameOf(ctx.state, ctx.defs, pick) },
      cancellable: true,
    },
    LOCK_ID,
    { stage: 'auto', pick: pick.id, boxes: [box.id] } as unknown as Json,
  );
  return NOTHING;
}

/** The answers to the lock prompts (direction, box and door questions). */
function answerLock(ctx: Ctx, value: Json, raw: Json): number {
  const data = raw as unknown as AskData;
  const pick = heroItem(ctx, data.pick);
  if (!pick) return NOTHING;
  switch (data.stage) {
    case 'dir': {
      if (value === 'self') return pickHere(ctx, pick);
      const dir = DIR_LIST.find((d) => d === value);
      if (!dir) {
        say(ctx, 'lock.never_mind');
        return NOTHING;
      }
      return pickDoor(ctx, pick, dir);
    }
    case 'box': {
      const id = data.boxes?.[0];
      const box = id === undefined ? undefined : ctx.state.entities[String(id)];
      if (value === null) return NOTHING; // 'q'
      if (value === true && box) return chooseBox(ctx, pick, box);
      // 'n': try next box; none chosen: decided against all boxes
      const rest = (data.boxes ?? []).slice(1);
      if (rest.length === 0) return LEARNED;
      return askBox(ctx, pick, { ...data, boxes: rest });
    }
    case 'door':
      return value === true && data.dir ? beginDoor(ctx, pick, data.dir) : NOTHING;
    case 'auto': {
      const id = data.boxes?.[0];
      const box = id === undefined ? undefined : ctx.state.entities[String(id)];
      if (value !== true || !box) return NOTHING;
      return chooseBox(ctx, pick, box);
    }
  }
  return NOTHING;
}

// ---------------------------------------------------------------------------------------------
// actions

/**
 * Locking and unlocking without the apply menu: offered on an adjacent closed door and on each
 * box under the hero while she carries a key, lock pick or credit card (the tool autokey()
 * would choose). The questions are those of applying the tool in that direction.
 */
const lockAct: ActionDef = {
  id: LOCK_ID,
  labelKey: 'action.nh:lock',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    const pick = autokey(ctx, true);
    if (!pick) return [];
    const p = heroPos(ctx);
    const tool = xnameOf(ctx.state, ctx.defs, pick);
    if (target.kind === 'self') {
      return floorBoxes(ctx).map((b) => ({
        action: { type: 'mod', action: LOCK_ID, args: { item: pick.id, box: b.id } },
        labelKey: 'action.nh:lock_box',
        params: { box: ctx.defs.itemName(ctx.state, b), tool },
        priority: HERE,
      }));
    }
    if (target.kind !== 'cell') return [];
    const dx = target.pos.x - p.x;
    const dy = target.pos.y - p.y;
    const dir = DIR_LIST.find((d) => DIRS[d].x === dx && DIRS[d].y === dy);
    if (!dir) return [];
    // what the hero sees there: a closed door (a locked one looks the same)
    const shown = ctx.query.describe(target.pos).terrain;
    if (!shown || !ctx.defs.hasTerrain(shown) || ctx.defs.terrain(shown).door !== 'closed')
      return [];
    return [
      {
        action: { type: 'mod', action: LOCK_ID, args: { item: pick.id, dir } },
        labelKey: 'action.nh:lock_door',
        params: { tool },
      },
    ];
  },
  perform(ctx, action) {
    if (action.type !== 'mod') return NOTHING;
    const args = (action.args ?? {}) as { item?: unknown; dir?: unknown; box?: unknown };
    const pick = heroItem(ctx, args.item);
    if (!pick || !isLockTool(pick.def)) return NOTHING;
    const resumed = tryResume(ctx, pick);
    if (resumed !== null) return resumed;
    if (typeof args.box === 'number') return pickHere(ctx, pick, args.box);
    const dir = DIR_LIST.find((d) => d === args.dir);
    return dir ? pickDoor(ctx, pick, dir) : applyLockTool(ctx, pick);
  },
  answer: answerLock,
  continues: (ctx) => continuesPicking(ctx),
};

/** The occupation's next turn ('continue'). ref: src/lock.c picklock() as set_occupation() */
const picklockAction: ActionDef = {
  id: PICKLOCK_ID,
  labelKey: 'action.nh:picklock',
  handles: 'mod',
  offer: () => [],
  perform(ctx) {
    if (!busy(ctx)) return NOTHING;
    if (!picklock(ctx)) ctx.state.occupation = null;
    return NORMAL_SPEED;
  },
  continues: (ctx) => continuesPicking(ctx),
};

/**
 * Whether the occupation goes on: the lock is still being worked on and no hostile monster
 * came next to the hero (which stops it: "You stop picking the lock.").
 * ref: src/allmain.c moveloop_core() `if (go.occupation && monster_nearby()) stop_occupation()`
 */
function continuesPicking(ctx: Ctx): boolean {
  const x = xlockOf(ctx);
  if (!x || !x.usedtime || ctx.state.occupation?.action.type !== 'mod') return false;
  if (ctx.state.occupation.action.action !== PICKLOCK_ID) return false;
  if (monsterNearby(ctx)) {
    say(ctx, 'lock.stop', { action: lockAction(ctx, x) });
    ctx.interrupt();
    return false;
  }
  return true;
}

export const LOCK_ACTIONS: readonly ActionDef[] = [lockAct, picklockAction];

export function registerLock(api: ModApi): void {
  for (const a of LOCK_ACTIONS) api.defineAction(a);
  // ref: src/do.c goto_level() maybe_reset_pick(NULL): a floor box or door is left behind
  api.on('levelChange', (ctx) => {
    const x = xlockOf(ctx);
    if (!x) return;
    const box = x.box === undefined ? undefined : ctx.state.entities[String(x.box)];
    if (!box || box.c.item?.carriedBy !== ctx.state.playerId) resetPick(ctx);
  });
  // ref: src/mkobj.c obfree() maybe_reset_pick(): a deleted box ends the attempt; the lock and
  // contents knowledge of deleted objects is dropped
  api.on('endOfTurn', (ctx) => {
    const x = xlockOf(ctx);
    if (x?.box !== undefined && !ctx.state.entities[String(x.box)]) resetPick(ctx);
    pruneObjKnown(ctx);
  });
}
