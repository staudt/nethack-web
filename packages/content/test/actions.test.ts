import {
  DIR_LIST,
  createEngine,
  getLevel,
  getPlayer,
  newMemory,
  type DefId,
  type Dir,
  type GameEvent,
  type GameState,
  type Level,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, messagesEn, vanillaMod } from '../src/index';

const CHARS: Record<string, DefId> = {
  ' ': T.stone,
  '|': T.vwall,
  '-': T.hwall,
  '.': T.floor,
  '+': T.door_closed,
  X: T.door_locked,
  o: T.door_open_v,
  O: T.door_open_h,
  d: T.doorway,
};

/** Builds a level from ASCII rows (all lit). '@' marks the player's start (floor). */
function setup(rows: string[]): {
  state: GameState;
  step: (a: Parameters<Engine['step']>[1]) => GameEvent[];
} {
  const engine = createEngine([vanillaMod]);
  const { state } = engine.newGame({ seed: 1 });
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const palette: DefId[] = [T.stone, T.floor];
  const cells: number[] = [];
  let start: Pos = { x: 0, y: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ch = rows[y]?.[x] ?? ' ';
      if (ch === '@') {
        start = { x, y };
        ch = '.';
      }
      const id = CHARS[ch] ?? T.stone;
      let i = palette.indexOf(id);
      if (i === -1) i = palette.push(id) - 1;
      cells.push(i);
    }
  }
  const level: Level = {
    id: 'dlvl1',
    depth: 1,
    dungeon: 'nh:main',
    dlevel: 1,
    width,
    height,
    palette,
    cells,
    lit: cells.map(() => 1),
    rooms: [],
    traps: [],
    branch: null,
    up: null,
    down: null,
  };
  state.levels['dlvl1'] = level;
  state.memory['dlvl1'] = newMemory(level);
  // the generated level's creatures and objects would land on the small map: remove them
  for (const e of Object.values(state.entities))
    if (e && e.id !== state.playerId && e.c.pos?.level === 'dlvl1') {
      for (const o of Object.values(state.entities))
        if (o?.c.item?.carriedBy === e.id) delete state.entities[String(o.id)];
      delete state.entities[String(e.id)];
    }
  const pos = getPlayer(state).c.pos;
  if (!pos) throw new Error('no pos');
  pos.x = start.x;
  pos.y = start.y;
  // Re-sync vision by taking one no-op... the first step recomputes it.
  return { state, step: (a) => engine.step(state, a).events };
}
type Engine = ReturnType<typeof createEngine>;

const posOf = (s: GameState): Pos => {
  const p = getPlayer(s).c.pos;
  return { x: p?.x ?? -1, y: p?.y ?? -1 };
};
const terrainAt = (s: GameState, x: number, y: number): string => {
  const l = getLevel(s);
  return l.palette[l.cells[y * l.width + x] ?? 0] ?? '?';
};

describe('nh:move', () => {
  test('moves, emits moved, advances the turn', () => {
    const { state, step } = setup(['...', '.@.', '...']);
    const turn = state.turn;
    const ev = step({ type: 'move', dir: 'e' });
    expect(posOf(state)).toEqual({ x: 2, y: 1 });
    expect(ev).toContainEqual({
      type: 'moved',
      id: state.playerId,
      from: { x: 1, y: 1 },
      to: { x: 2, y: 1 },
    });
    expect(state.turn).toBe(turn + 1);
  });

  test('into a wall: no time, blocked event', () => {
    const { state, step } = setup(['.|', '@|']);
    const turn = state.turn;
    const ev = step({ type: 'move', dir: 'e' });
    expect(posOf(state)).toEqual({ x: 0, y: 1 });
    expect(state.turn).toBe(turn);
    expect(ev).toEqual([{ type: 'blocked', pos: { x: 1, y: 1 }, terrain: T.vwall }]);
  });

  test('out of bounds: no time, no event', () => {
    const { state, step } = setup(['@']);
    const turn = state.turn;
    expect(step({ type: 'move', dir: 'n' })).toEqual([]);
    expect(state.turn).toBe(turn);
  });

  test('diagonal into an open door is blocked', () => {
    const s2 = setup(['...', '.o.', '@..']);
    const ev = s2.step({ type: 'move', dir: 'ne' });
    expect(posOf(s2.state)).toEqual({ x: 0, y: 2 });
    expect(ev).toEqual([{ type: 'blocked', pos: { x: 1, y: 1 }, terrain: T.door_open_v }]);
  });

  test('diagonal out of an open door is blocked', () => {
    const { state, step } = setup(['...', '.@.', '...']);
    const l = getLevel(state);
    l.palette.push(T.door_open_h);
    l.cells[1 * l.width + 1] = l.palette.length - 1;
    const ev = step({ type: 'move', dir: 'se' });
    expect(posOf(state)).toEqual({ x: 1, y: 1 });
    expect(ev[0]?.type).toBe('blocked');
  });

  test('diagonal through a doorway is fine, both in and out', () => {
    const { state, step } = setup(['@..', '.d.', '...']);
    step({ type: 'move', dir: 'se' });
    expect(posOf(state)).toEqual({ x: 1, y: 1 });
    step({ type: 'move', dir: 'se' });
    expect(posOf(state)).toEqual({ x: 2, y: 2 });
  });

  test('closed door in a vertical wall opens as door_open_v', () => {
    const { state, step } = setup(['.|.', '@+.', '.|.']);
    // door at (1,1) with walls N and S
    const turn = state.turn;
    const ev = step({ type: 'move', dir: 'e' });
    expect(terrainAt(state, 1, 1)).toBe(T.door_open_v);
    expect(posOf(state)).toEqual({ x: 0, y: 1 });
    expect(ev).toEqual([
      { type: 'doorOpened', pos: { x: 1, y: 1 } },
      { type: 'msg', key: 'door.opens' },
      { type: 'turnEnded', turn: turn + 1 },
    ]);
    expect(state.turn).toBe(turn + 1);
    expect(messagesEn['door.opens']).toBeDefined();
    // now the player can walk through
    step({ type: 'move', dir: 'e' });
    expect(posOf(state)).toEqual({ x: 1, y: 1 });
  });

  test('a locked door says so, takes no time and stays locked', () => {
    const { state, step } = setup(['.|.', '@X.', '.|.']);
    const turn = state.turn;
    const ev = step({ type: 'move', dir: 'e' });
    expect(ev).toEqual([{ type: 'msg', key: 'door.locked' }]);
    expect(state.turn).toBe(turn);
    expect(terrainAt(state, 1, 1)).toBe(T.door_locked);
    expect(posOf(state)).toEqual({ x: 0, y: 1 });
    expect(messagesEn['door.locked']).toBe('This door is locked.');
  });

  test('closed door in a horizontal wall opens as door_open_h', () => {
    const { state, step } = setup(['.@.', '-+-', '...']);
    step({ type: 'move', dir: 's' });
    expect(terrainAt(state, 1, 1)).toBe(T.door_open_h);
    expect(posOf(state)).toEqual({ x: 1, y: 0 });
  });

  test('door at the level edge counts out of bounds as not passable', () => {
    const { state, step } = setup(['@+']);
    step({ type: 'move', dir: 'e' });
    expect(terrainAt(state, 1, 0)).toBe(T.door_open_v);
  });

  test('palette is appended to, never reordered', () => {
    const { state, step } = setup(['.|.', '@+.', '.|.']);
    const before = [...getLevel(state).palette];
    step({ type: 'move', dir: 'e' });
    expect(getLevel(state).palette.slice(0, before.length)).toEqual(before);
    expect(getLevel(state).palette).toHaveLength(before.length + 1);
  });

  test('opening reuses an existing palette entry', () => {
    const { state, step } = setup(['.|.', '@+o', '.|.']);
    const len = getLevel(state).palette.length;
    step({ type: 'move', dir: 'e' });
    expect(getLevel(state).palette).toHaveLength(len);
  });
});

describe('nh:wait / nh:search', () => {
  test('wait costs a turn, no events', () => {
    const { state, step } = setup(['@']);
    const turn = state.turn;
    expect(step({ type: 'wait' })).toEqual([{ type: 'turnEnded', turn: turn + 1 }]);
    expect(state.turn).toBe(turn + 1);
  });
  test('search costs a turn and emits searched', () => {
    const { state, step } = setup(['@']);
    const turn = state.turn;
    expect(step({ type: 'search' })).toEqual([
      { type: 'searched' },
      { type: 'turnEnded', turn: turn + 1 },
    ]);
    expect(state.turn).toBe(turn + 1);
  });
});

describe('offers', () => {
  const engine = createEngine([vanillaMod]);
  const queryFor = (rows: string[]) => {
    const { state } = setup(rows);
    return { state, q: engine.query(state) };
  };

  test('self offers wait and search with source nh', () => {
    const { q } = queryFor(['@']);
    // plus run (asks a direction) and the item actions that apply anywhere: drop several (the kit), swap weapons (the kit has an alternate) and discoveries, then kick, call, pray and enhance, and quit last
    expect(q.actionsFor({ kind: 'self' })).toEqual([
      { action: { type: 'wait' }, labelKey: 'action.wait', source: 'nh' },
      { action: { type: 'search' }, labelKey: 'action.search', source: 'nh' },
      { action: { type: 'mod', action: 'nh:run' }, labelKey: 'action.run', source: 'nh' },
      {
        action: { type: 'mod', action: 'nh:drop_many' },
        labelKey: 'action.nh:drop_many',
        source: 'nh',
      },
      {
        action: { type: 'mod', action: 'nh:swap_weapon' },
        labelKey: 'action.nh:swap_weapon',
        source: 'nh',
      },
      {
        action: { type: 'mod', action: 'nh:discoveries' },
        labelKey: 'action.nh:discoveries',
        source: 'nh',
      },
      { action: { type: 'mod', action: 'nh:kick' }, labelKey: 'action.nh:kick', source: 'nh' },
      { action: { type: 'mod', action: 'nh:chat' }, labelKey: 'action.nh:chat', source: 'nh' },
      { action: { type: 'mod', action: 'nh:call' }, labelKey: 'action.nh:call', source: 'nh' },
      { action: { type: 'mod', action: 'nh:pray' }, labelKey: 'action.nh:pray', source: 'nh' },
      { action: { type: 'mod', action: 'nh:spells' }, labelKey: 'action.nh:spells', source: 'nh' },
      {
        action: { type: 'mod', action: 'nh:enhance' },
        labelKey: 'action.nh:enhance',
        source: 'nh',
      },
      // #quit, always last
      {
        action: { type: 'mod', action: 'nh:quit' },
        labelKey: 'action.nh:quit',
        priority: -100,
        source: 'nh',
      },
    ]);
  });

  test('player entity maps to self', () => {
    const { state, q } = queryFor(['@']);
    expect(q.actionsFor({ kind: 'entity', id: state.playerId })).toEqual(
      q.actionsFor({ kind: 'self' }),
    );
  });

  test('each walkable adjacent cell offers a move', () => {
    const { q } = queryFor(['...', '.@.', '...']);
    const offered: Dir[] = [];
    for (const dir of DIR_LIST) {
      const d = {
        n: [0, -1],
        ne: [1, -1],
        e: [1, 0],
        se: [1, 1],
        s: [0, 1],
        sw: [-1, 1],
        w: [-1, 0],
        nw: [-1, -1],
      }[dir];
      const offers = q.actionsFor({
        kind: 'cell',
        pos: { x: 1 + (d?.[0] ?? 0), y: 1 + (d?.[1] ?? 0) },
      });
      expect(offers).toEqual([
        {
          action: { type: 'move', dir },
          labelKey: 'action.move',
          params: { dir: `@dir.${dir}` },
          source: 'nh',
        },
      ]);
      expect(messagesEn[`dir.${dir}`]).toBeDefined();
      offered.push(dir);
    }
    expect(offered).toHaveLength(8);
  });

  test('closed doors are offered; walls, far cells, own cell and entities are not', () => {
    const { state, q } = queryFor(['.|.', '@+.', '...']);
    // unseen (no vision yet), the door is walked into, which opens it
    expect(q.actionsFor({ kind: 'cell', pos: { x: 1, y: 1 } }).map((o) => o.action)).toEqual([
      { type: 'move', dir: 'e' },
    ]);
    engine.step(state, { type: 'search' });
    // a door is opened (or kicked), never walked into from a tap
    expect(q.actionsFor({ kind: 'cell', pos: { x: 1, y: 1 } }).map((o) => o.action)).toEqual([
      { type: 'mod', action: 'nh:open', args: { dir: 'e' } },
      { type: 'mod', action: 'nh:kick', args: { dir: 'e' } },
      { type: 'mod', action: 'nh:untrap', args: { dir: 'e' } },
    ]);
    expect(q.actionsFor({ kind: 'cell', pos: { x: 1, y: 0 } })).toEqual([]);
    // a far cell offers travel (and running) but never a single move
    expect(
      q.actionsFor({ kind: 'cell', pos: { x: 2, y: 2 } }).filter((o) => o.action.type === 'move'),
    ).toEqual([]);
    expect(q.actionsFor({ kind: 'cell', pos: { x: 0, y: 1 } })).toEqual([]);
    expect(q.actionsFor({ kind: 'entity', id: 999 })).toEqual([]);
  });

  test('a door is opened from any side, diagonals too; a locked one says so and takes no time', () => {
    const { state, step } = setup(['X..', '.+.', '..@']);
    step({ type: 'search' });
    const q = engine.query(state);
    const ids = (pos: Pos) =>
      q
        .actionsFor({ kind: 'cell', pos })
        .map((o) => (o.action.type === 'mod' ? o.action.action : o.action.type));
    expect(ids({ x: 1, y: 1 })).toEqual(['nh:open', 'nh:kick', 'nh:untrap']);
    const turn = state.turn;
    const keys = (ev: GameEvent[]) => ev.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
    expect(keys(step({ type: 'mod', action: 'nh:open', args: { dir: 'nw' } }))).toEqual([
      'door.opens',
    ]);
    expect([T.door_open_v, T.door_open_h]).toContain(
      getLevel(state).palette[getLevel(state).cells[1 * 3 + 1]!],
    );
    expect(state.turn).toBe(turn + 1);
    // the locked door, seen from next to it: it looks closed, so it is offered the same way
    getPlayer(state).c.pos = { level: 'dlvl1', x: 1, y: 0 };
    step({ type: 'search' });
    expect(ids({ x: 0, y: 0 })).toEqual(['nh:open', 'nh:kick', 'nh:untrap']);
    const before = state.turn;
    expect(keys(step({ type: 'mod', action: 'nh:open', args: { dir: 'w' } }))).toEqual([
      'door.locked',
    ]);
    expect(state.turn).toBe(before);
    expect(getLevel(state).palette[getLevel(state).cells[0]!]).toBe(T.door_locked);
  });

  test('what the place suggests comes first: stairs, pick up, loot, eat here', () => {
    const { state, step } = setup(['...', '.@.', '...']);
    const level = getLevel(state);
    let si = level.palette.indexOf(T.stairs_down);
    if (si === -1) si = level.palette.push(T.stairs_down) - 1;
    level.cells[1 * 3 + 1] = si;
    const at = getPlayer(state).c.pos!;
    for (const def of ['nh:apple', 'nh:large_box']) {
      const id = state.nextEntityId++;
      state.entities[String(id)] = {
        id,
        def: def as DefId,
        c: {
          pos: { level: at.level, x: at.x, y: at.y },
          item: {
            quantity: 1,
            buc: 'uncursed',
            spe: 0,
            known: { buc: false, spe: false },
            carriedBy: null,
            letter: null,
            equipped: null,
            placed: state.seq++,
            age: 1,
          },
        },
      };
    }
    step({ type: 'search' });
    const ids = engine
      .query(state)
      .actionsFor({ kind: 'self' })
      .map((o) => (o.action.type === 'mod' ? o.action.action : o.action.type));
    expect(ids.slice(0, 4)).toEqual(['nh:down', 'nh:pickup', 'nh:loot', 'nh:eat']);
    expect(ids[4]).toBe('wait');
  });

  test('diagonal into an open door is not offered', () => {
    const { q } = queryFor(['...', '.o.', '@..']);
    expect(q.actionsFor({ kind: 'cell', pos: { x: 1, y: 1 } })).toEqual([]);
  });
});
