import {
  cellRules,
  createEngine,
  getLevel,
  getPlayer,
  isPlainFloor,
  itemsAt,
  newMemory,
  trapAt,
  DIR_LIST,
  DIRS,
  type Ctx,
  type DefId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
  type Trap,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  P,
  T,
  TRAP,
  isFrozen,
  isMtrapped,
  maketrap,
  mfndpos,
  mintrap,
  mksobj,
  monKnowsTraps,
  setIntrinsic,
  utrap,
  vanillaMod,
} from '../src/index';
import { addMon } from './helpers';
import { quiet } from './itemHelpers';
import { monLearnsTraps, setMtrapped } from '../src/trapstate';

/** Walks east into the pet until it is not just "in the way" (1 in 7); returns the message keys. */
function walkIntoPet(state: GameState): string[] {
  for (let i = 0; i < 50; i++) {
    const k = keys(engine.step(state, { type: 'move', dir: 'e' }).events);
    if (!k.some((x) => x.startsWith('dog.in_the_way'))) return k;
  }
  return [];
}

// A probe mod: its action runs a callback with a real Ctx (no time passes).
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'probe:run',
      labelKey: 'probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);

function withCtx(state: GameState, fn: (ctx: Ctx) => void): GameEvent[] {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'probe:run' }).events;
}

const keys = (ev: GameEvent[]): string[] => ev.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

/**
 * A lit room from ASCII rows ('@' is the hero), other entities cleared, hero with 500 HP, random
 * monster generation off.
 */
function setup(rows: string[], seed = 1) {
  const { state } = engine.newGame({ seed });
  quiet(state);
  for (const id of Object.keys(state.entities))
    if (Number(id) !== state.playerId) delete state.entities[id];
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const palette: DefId[] = [T.stone, T.floor];
  const cells: number[] = [];
  let start: Pos = { x: 0, y: 0 };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const ch = rows[y]?.[x] ?? ' ';
      if (ch === '@') start = { x, y };
      cells.push(ch === '.' || ch === '@' ? 1 : 0);
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
  state.levels = { dlvl1: level };
  state.memory = { dlvl1: newMemory(level) };
  state.currentLevel = 'dlvl1';
  const hero = getPlayer(state);
  hero.c.pos = { level: 'dlvl1', x: start.x, y: start.y };
  if (hero.c.hp) hero.c.hp = { cur: 500, max: 500 };
  engine.step(state, { type: 'wait' });
  return { state, level: () => getLevel(state, 'dlvl1') };
}

const ROOM = ['.......', '.@.....', '.......'];

function place(state: GameState, def: DefId, x: number, y: number, seen = false): Trap {
  let t: Trap | null = null;
  withCtx(state, (ctx) => {
    t = maketrap(ctx, ctx.state.currentLevel, x, y, def);
    t.seen = seen;
  });
  if (!t) throw new Error('no trap');
  return t;
}

const heroHp = (s: GameState): number => getPlayer(s).c.hp?.cur ?? 0;
const heroAt = (s: GameState): Pos => {
  const p = getPlayer(s).c.pos;
  return { x: p?.x ?? -1, y: p?.y ?? -1 };
};
const floorDefs = (s: GameState, x: number, y: number): string[] =>
  itemsAt(engine.registry, s, s.currentLevel, x, y).map((o) => o.def);

/** Gives the hero an item worn in `slot`. */
function wear(state: GameState, def: DefId, slot: 'helm' | 'boots' | 'weapon'): number {
  let id = -1;
  withCtx(state, (ctx) => {
    id = mksobj(ctx, ctx.defs.object(def), { init: false, carriedBy: ctx.state.playerId });
    const it = ctx.state.entities[String(id)]?.c.item;
    if (it) it.equipped = slot;
  });
  return id;
}

/** Runs `body` on seeds 1.. until `want` holds for its result; returns that result. */
function findSeed<R>(body: (seed: number) => R, want: (r: R) => boolean, max = 200): R {
  for (let seed = 1; seed <= max; seed++) {
    const r = body(seed);
    if (want(r)) return r;
  }
  throw new Error('no seed found');
}

describe('trap defs', () => {
  test('the eleven vanilla traps are registered with ^ glyphs; holes are holes', () => {
    const ids = engine.registry.traps.map((t) => t.id);
    for (const id of Object.values(TRAP)) expect(ids).toContain(id);
    for (const t of engine.registry.traps) expect(t.glyph.ch).toBe('^');
    expect(engine.registry.trap(TRAP.hole).hole).toBe(true);
    expect(engine.registry.trap(TRAP.trapdoor).hole).toBe(true);
  });

  test('maketrap: holes are seen, squeaky boards get a note, holes a deeper destination', () => {
    const { state } = setup(ROOM);
    const h = place(state, TRAP.hole, 3, 1, true);
    expect(h.seen).toBe(true);
    expect((h.data as { dst: number }).dst).toBeGreaterThan(1);
    const sq = place(state, TRAP.squeaky, 4, 1);
    const n = (sq.data as { tnote: number }).tnote;
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(12);
  });
});

describe('dotrap: the hero', () => {
  test('arrow trap: hits (HP lost, arrow gone) or misses (arrow on the floor)', () => {
    const outcome = (seed: number) => {
      const { state } = setup(ROOM, seed);
      place(state, TRAP.arrow, 2, 1);
      const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
      const t = trapAt(getLevel(state), 2, 1);
      expect(keys(ev)).toContain('trap.arrow.shoots');
      expect(t?.seen).toBe(true);
      expect(t?.once).toBe(true);
      const lost = 500 - heroHp(state);
      const arrows = floorDefs(state, 2, 1).filter((d) => d === 'nh:arrow').length;
      // (a hit by an arrow with a negative enchantment may do no damage)
      const hit = keys(ev).includes('trap.thitu.hit');
      if (hit) expect(arrows).toBe(0);
      else expect([arrows, lost]).toEqual([1, 0]);
      return { hit, lost };
    };
    findSeed(outcome, (r) => r.hit && r.lost > 0);
    findSeed(outcome, (r) => !r.hit);
  });

  test('dart trap shoots a little dart', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.dart, 2, 1);
    const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.dart.shoots');
    const darts = floorDefs(state, 2, 1).filter((d) => d === 'nh:dart').length;
    // judged by the message: a hit with a negative enchantment may do no damage
    expect(keys(ev).includes('trap.thitu.hit') ? darts === 0 : darts === 1).toBe(true);
  });

  test('falling rock: 2d6 bareheaded, 2 with a hard helmet; the rock stays', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.rock, 2, 1);
    const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.rock.falls');
    const lost = 500 - heroHp(state);
    expect(lost).toBeGreaterThanOrEqual(2);
    expect(lost).toBeLessThanOrEqual(12);
    expect(floorDefs(state, 2, 1)).toContain('nh:rock');

    const s2 = setup(ROOM).state;
    // 2 below the cap: the 2 damage leaves her at full HP, so no regeneration hides it
    const hp2 = getPlayer(s2).c.hp;
    if (hp2) hp2.max = 498;
    wear(s2, 'nh:dwarvish_iron_helm', 'helm');
    place(s2, TRAP.rock, 2, 1);
    const ev2 = engine.step(s2, { type: 'move', dir: 'e' }).events;
    expect(keys(ev2)).toContain('trap.rock.hard_helmet');
    expect(500 - heroHp(s2)).toBe(2);
  });

  test('squeaky board squeaks and wakes monsters nearby', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.squeaky, 2, 1);
    const m = addMon(state, 'nh:jackal', 4, 1, { asleep: true });
    const mon = state.entities[String(m)];
    if (mon?.c.actor) mon.c.actor.speed = 0;
    const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
    const sq = ev.find((e) => e.type === 'msg' && e.key === 'trap.squeak.you');
    expect(sq).toBeDefined();
    expect(state.entities[String(m)]?.c.monster?.asleep).toBe(false);
  });

  test('bear trap holds the hero; diagonal moves wriggle free one turn at a time', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.bear, 2, 1);
    const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.bear.closes');
    const u = utrap({ state });
    expect(u?.n).toBeGreaterThanOrEqual(4);
    expect(u?.n).toBeLessThanOrEqual(7);
    expect(500 - heroHp(state)).toBeGreaterThanOrEqual(2);
    const n = u?.n ?? 0;
    for (let i = 1; i <= n; i++) {
      const turn = state.turn;
      const e = engine.step(state, { type: 'move', dir: 'se' }).events;
      expect(heroAt(state)).toEqual({ x: 2, y: 1 });
      expect(state.turn).toBeGreaterThan(turn); // the move is spent
      expect(keys(e)).toContain('trap.bear.caught');
      if (i === n) expect(keys(e)).toContain('trap.bear.free');
    }
    expect(utrap({ state })).toBeNull();
    engine.step(state, { type: 'move', dir: 'se' });
    expect(heroAt(state)).toEqual({ x: 3, y: 2 });
  });

  test('iron boots protect the leg from a bear trap', () => {
    const { state } = setup(ROOM);
    wear(state, 'nh:iron_shoes', 'boots');
    place(state, TRAP.bear, 2, 1);
    const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.bear.protects');
    expect(heroHp(state)).toBe(500);
    expect(utrap({ state })).not.toBeNull();
  });

  test('sleeping gas puts the hero to sleep unless she resists', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.sleepGas, 2, 1);
    const turn = state.turn;
    const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.gas.sleep');
    // asleep for rnd(25) more turns: the monsters' turns pass, then she wakes up
    expect(state.turn - turn).toBeGreaterThanOrEqual(2);
    expect(keys(ev)).toContain('eat.wake_up');

    const s2 = setup(ROOM).state;
    setIntrinsic(getPlayer(s2), P.SLEEP_RES, true);
    place(s2, TRAP.sleepGas, 2, 1);
    const turn2 = s2.turn;
    const ev2 = engine.step(s2, { type: 'move', dir: 'e' }).events;
    expect(keys(ev2)).toContain('trap.gas.enveloped');
    expect(s2.turn - turn2).toBe(1);
  });

  test('rust trap: a gush of water on the head rusts an iron helmet', () => {
    const helmEroded = findSeed(
      (seed) => {
        const { state } = setup(ROOM, seed);
        const helm = wear(state, 'nh:dwarvish_iron_helm', 'helm');
        place(state, TRAP.rust, 2, 1);
        const ev = engine.step(state, { type: 'move', dir: 'e' }).events;
        if (!keys(ev).includes('trap.rust.head')) return null;
        return state.entities[String(helm)]?.c.item?.erosion?.e1 ?? 0;
      },
      (r) => r !== null,
    );
    expect(helmEroded).toBe(1);
  });

  test('a seen trap is escaped one time in five', () => {
    const escaped = findSeed(
      (seed) => {
        const { state } = setup(ROOM, seed);
        place(state, TRAP.bear, 2, 1, true);
        engine.step(state, { type: 'move', dir: 'e' });
        const ev = engine.step(state, {
          type: 'answer',
          promptId: 'trap-confirm',
          value: true,
        }).events;
        return { ev, state };
      },
      (r) => keys(r.ev).includes('trap.escape'),
    );
    expect(utrap({ state: escaped.state })).toBeNull();
    expect(heroAt(escaped.state)).toEqual({ x: 2, y: 1 });
  });
});

describe('moving onto a seen trap', () => {
  test('asks first; no keeps the hero in place, yes steps on', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.squeaky, 2, 1, true);
    const turn = state.turn;
    const r = engine.step(state, { type: 'move', dir: 'e' });
    expect(r.prompt?.id).toBe('trap-confirm');
    expect(r.prompt?.key).toBe('trap.confirm_onto');
    expect(r.prompt?.cancellable).toBe(true);
    expect(heroAt(state)).toEqual({ x: 1, y: 1 });
    engine.step(state, { type: 'answer', promptId: 'trap-confirm', value: false });
    expect(heroAt(state)).toEqual({ x: 1, y: 1 });
    expect(state.turn).toBe(turn);
    engine.step(state, { type: 'move', dir: 'e' });
    engine.step(state, { type: 'answer', promptId: 'trap-confirm', value: true });
    expect(heroAt(state)).toEqual({ x: 2, y: 1 });
  });

  test('a bear trap or hole asks "into"', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.bear, 2, 1, true);
    expect(engine.step(state, { type: 'move', dir: 'e' }).prompt?.key).toBe('trap.confirm_into');
  });

  test('a seen trap next to the hero can be identified; no time passes', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.dart, 2, 1, true);
    const offers = engine.query(state).actionsFor({ kind: 'cell', pos: { x: 2, y: 1 } });
    const id = offers.find((o) => o.labelKey === 'action.nh:idtrap');
    expect(id).toBeDefined();
    expect(engine.query(state).describe({ x: 2, y: 1 }).trap).toBe(TRAP.dart);
    if (!id) return;
    const turn = state.turn;
    const ev = engine.step(state, id.action).events;
    expect(ev).toContainEqual({
      type: 'msg',
      key: 'trap.that_is',
      params: { trap: `@${TRAP.dart}` },
    });
    expect(state.turn).toBe(turn);
  });

  test('an unseen trap offers nothing', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.dart, 2, 1);
    const offers = engine.query(state).actionsFor({ kind: 'cell', pos: { x: 2, y: 1 } });
    expect(offers.some((o) => o.labelKey === 'action.nh:idtrap')).toBe(false);
  });
});

describe('swapping with a pet', () => {
  test("a pet caught in a bear trap can't move out of it", () => {
    const { state } = setup(ROOM);
    const m = addMon(state, 'nh:dog', 2, 1, { peaceful: true });
    const mon = state.entities[String(m)];
    if (mon?.c.monster) mon.c.monster.tame = 10;
    if (mon?.c.actor) mon.c.actor.speed = 0;
    place(state, TRAP.bear, 2, 1);
    setMtrapped({ state }, m, true);
    const ev = walkIntoPet(state);
    expect(ev).toContain('dog.cant_move_out_an');
    expect(heroAt(state)).toEqual({ x: 1, y: 1 });
    expect(trapAt(getLevel(state), 2, 1)?.seen).toBe(true);
  });
});

describe('search', () => {
  test('finds an adjacent trap and marks it seen', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.bear, 2, 1);
    const ev: GameEvent[] = [];
    for (let i = 0; i < 200 && !trapAt(getLevel(state), 2, 1)?.seen; i++)
      ev.push(...engine.step(state, { type: 'search' }).events);
    expect(trapAt(getLevel(state), 2, 1)?.seen).toBe(true);
    expect(ev).toContainEqual({
      type: 'msg',
      key: 'trap.found',
      params: { trap: `@${TRAP.bear}` },
    });
  });
});

describe('travel and running', () => {
  test('travel walks around a seen trap', () => {
    const { state } = setup(['.......', '.@.....', '.......']);
    place(state, TRAP.squeaky, 3, 1, true);
    const been: Pos[] = [];
    let r = engine.step(state, { type: 'mod', action: 'nh:travel', args: { x: 5, y: 1 } });
    been.push(heroAt(state));
    for (let i = 0; i < 20 && r.continuing; i++) {
      r = engine.step(state, { type: 'continue' });
      been.push(heroAt(state));
    }
    expect(heroAt(state)).toEqual({ x: 5, y: 1 });
    expect(been).not.toContainEqual({ x: 3, y: 1 });
  });

  test('rushing stops in front of a seen trap', () => {
    const { state } = setup(['.........']);
    getPlayer(state).c.pos = { level: 'dlvl1', x: 0, y: 0 };
    place(state, TRAP.squeaky, 4, 0, true);
    engine.stepAll(state, { type: 'mod', action: 'nh:run', args: { dir: 'e', mode: 'rush' } });
    expect(heroAt(state)).toEqual({ x: 3, y: 0 });
  });
});

describe('trap doors and holes', () => {
  /** A generated game; the hero next to a plain floor cell, which gets a trap door. */
  function generated(seed: number) {
    const { state } = engine.newGame({ seed });
    for (const id of Object.keys(state.entities)) {
      const e = state.entities[id];
      if (Number(id) !== state.playerId && e?.c.monster) delete state.entities[id];
    }
    const hp = getPlayer(state).c.hp;
    if (hp) Object.assign(hp, { cur: 500, max: 500 });
    const level = getLevel(state);
    const p = getPlayer(state).c.pos;
    if (!p) throw new Error('no pos');
    const dir = DIR_LIST.find((d) =>
      isPlainFloor(engine.registry, level, p.x + DIRS[d].x, p.y + DIRS[d].y),
    );
    if (!dir) throw new Error('no floor next to the stairs');
    return { state, dir, at: { x: p.x + DIRS[dir].x, y: p.y + DIRS[dir].y } };
  }

  test('falling through a trap door leads to its destination level, with fall damage', () => {
    const { state, dir, at } = generated(3);
    const t = place(state, TRAP.trapdoor, at.x, at.y);
    withCtx(state, (ctx) => {
      const live = trapAt(getLevel(ctx.state), t.x, t.y);
      if (live) live.data = { dst: 3 };
    });
    const ev = engine.step(state, { type: 'move', dir }).events;
    expect(keys(ev)).toContain('trap.door.opens');
    expect(keys(ev)).toContain('trap.shaft'); // two levels down
    expect(getLevel(state).depth).toBe(3);
    const lost = 500 - heroHp(state);
    expect(lost).toBeGreaterThanOrEqual(2);
    expect(lost).toBeLessThanOrEqual(12);
    const hp = getPlayer(state).c.pos;
    expect(hp && trapAt(getLevel(state), hp.x, hp.y)).toBeFalsy();
    const dl1 = state.levels['dlvl1'];
    expect(dl1 && trapAt(dl1, t.x, t.y)?.seen).toBe(true);
  });

  test("'>' on a seen hole jumps in", () => {
    const { state, at } = generated(4);
    place(state, TRAP.hole, at.x, at.y, true);
    const p = getPlayer(state).c.pos;
    if (p) Object.assign(p, at);
    const offers = engine.query(state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.labelKey === 'action.down')).toBe(true);
    const ev = engine.step(state, { type: 'mod', action: 'nh:down' }).events;
    expect(keys(ev)).not.toContain('trap.hole.gaping'); // TOOKPLUNGE: no "gaping hole"
    expect(getLevel(state).depth).toBeGreaterThan(1);
  });
});

describe('mintrap: monsters', () => {
  function monOnTrap(def: DefId, trap: DefId, seed = 1) {
    const s = setup(['.........', '.@.......', '.........'], seed);
    const m = addMon(s.state, def, 5, 1);
    place(s.state, trap, 5, 1);
    let r = '';
    const ev = withCtx(s.state, (ctx) => {
      r = mintrap(ctx, m);
    });
    return { ...s, m, r, ev };
  }

  test('a bear trap catches a medium monster, and it stays put', () => {
    const { state, m, r, ev } = monOnTrap('nh:hill_orc', TRAP.bear);
    const mon = state.entities[String(m)];
    if (mon?.c.hp) mon.c.hp.cur = 100;
    expect(r === 'caught' || r === 'killed').toBe(true);
    if (r === 'killed') return;
    expect(isMtrapped({ state }, m)).toBe(true);
    expect(keys(ev)).toContain('trap.bear.mon_caught');
    expect(trapAt(getLevel(state), 5, 1)?.seen).toBe(true);
    expect(monKnowsTraps({ state }, m, TRAP.bear)).toBe(true);
  });

  test('small monsters are not caught by bear traps', () => {
    const { state, m, r } = monOnTrap('nh:jackal', TRAP.bear);
    expect(r).toBe('finished');
    expect(isMtrapped({ state }, m)).toBe(false);
  });

  test('sleeping gas puts a monster to sleep', () => {
    const { state, m, ev } = monOnTrap('nh:jackal', TRAP.sleepGas);
    expect(isFrozen({ state }, m)).toBe(true);
    expect(keys(ev)).toContain('trap.gas.mon_sleeps');
  });

  test('an arrow trap hits or misses a monster (the arrow lands on a miss)', () => {
    const { state, m, ev } = monOnTrap('nh:hill_orc', TRAP.arrow);
    const k = keys(ev);
    expect(k.includes('trap.thitm.hit') || k.includes('trap.thitm.almost')).toBe(true);
    if (k.includes('trap.thitm.almost')) expect(floorDefs(state, 5, 1)).toContain('nh:arrow');
    expect(state.entities[String(m)] === undefined || k.length > 0).toBe(true);
  });

  test('a falling rock always lands; a squeaky board squeaks', () => {
    const a = monOnTrap('nh:hill_orc', TRAP.rock);
    expect(floorDefs(a.state, 5, 1)).toContain('nh:rock');
    const b = monOnTrap('nh:jackal', TRAP.squeaky);
    expect(keys(b.ev)).toContain('trap.squeak.mon');
  });

  test('a monster falls through a trap door and comes out when the hero gets there', () => {
    const { state, m, r, ev } = monOnTrap('nh:jackal', TRAP.trapdoor);
    expect(r).toBe('moved');
    expect(keys(ev)).toContain('trap.mon_falls_door');
    expect(state.entities[String(m)]?.c.pos).toBeUndefined();
    const dst = (trapAt(getLevel(state), 5, 1)?.data as { dst: number }).dst;
    const g = engine.newGame({ seed: 9 }).state.levels['dlvl1'];
    if (!g) throw new Error('no level');
    // a real-size level to arrive on
    state.levels[`dlvl${dst}`] = { ...g, id: `dlvl${dst}`, depth: dst, dlevel: dst };
    state.memory[`dlvl${dst}`] = newMemory(g);
    withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: dst }, 'random'));
    expect(state.entities[String(m)]?.c.pos?.level).toBe(`dlvl${dst}`);
  });

  test('a monster that knows a kind of trap does not step on one', () => {
    const { state } = setup(['...', '...', '...']);
    getPlayer(state).c.pos = { level: 'dlvl1', x: 0, y: 0 };
    const m = addMon(state, 'nh:hill_orc', 1, 1);
    place(state, TRAP.arrow, 2, 2);
    let before: Pos[] = [];
    let after: Pos[] = [];
    withCtx(state, (ctx) => {
      const level = getLevel(ctx.state);
      const cr = cellRules(level, ctx.defs);
      before = mfndpos(ctx, level, cr, m, { x: 0, y: 0 }).map((c) => ({ x: c.x, y: c.y }));
      monLearnsTraps(ctx, m, TRAP.arrow);
      after = mfndpos(ctx, level, cr, m, { x: 0, y: 0 }).map((c) => ({ x: c.x, y: c.y }));
    });
    expect(before).toContainEqual({ x: 2, y: 2 });
    expect(after).not.toContainEqual({ x: 2, y: 2 });
  });
});

describe('pits', () => {
  /** Steps east into a pit at (2, 1) (unseen); returns the events. */
  function fallIn(def: DefId, seed = 1) {
    const s = setup(ROOM, seed);
    place(s.state, def, 2, 1);
    const ev = engine.step(s.state, { type: 'move', dir: 'e' }).events;
    return { ...s, ev };
  }

  test('falling in: rnd(6) damage, caught for 2..7 tries; climbing out takes exactly that many', () => {
    const { state, ev } = fallIn(TRAP.pit);
    expect(keys(ev)).toContain('trap.pit.fall');
    expect(heroAt(state)).toEqual({ x: 2, y: 1 });
    const lost = 500 - heroHp(state);
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(6);
    const u = utrap({ state });
    expect(u?.type).toBe('pit');
    expect(u?.n).toBeGreaterThanOrEqual(2);
    expect(u?.n).toBeLessThanOrEqual(7);
    const n = u?.n ?? 0;
    for (let i = 1; i <= n; i++) {
      const turn = state.turn;
      const e = engine.step(state, { type: 'move', dir: 'e' }).events;
      expect(heroAt(state)).toEqual({ x: 2, y: 1 }); // she stays on the square
      expect(state.turn).toBeGreaterThan(turn); // the try is spent
      expect(keys(e)).toContain(i === n ? 'trap.pit.crawl_out' : 'trap.pit.still_in');
    }
    expect(utrap({ state })).toBeNull();
    engine.step(state, { type: 'move', dir: 'e' });
    expect(heroAt(state)).toEqual({ x: 3, y: 1 });
  });

  test("'<' in a pit is offered as climbing out and takes a try; kicking is refused", () => {
    const { state } = fallIn(TRAP.pit);
    const n = utrap({ state })?.n ?? 0;
    const offers = engine.query(state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.labelKey === 'action.climb_pit')).toBe(true);
    const k = engine.step(state, { type: 'mod', action: 'nh:kick' }).events;
    expect(keys(k)).toContain('kick.no_room_pit');
    expect(utrap({ state })?.n).toBe(n); // the kick took no try
    const turn = state.turn;
    engine.step(state, { type: 'mod', action: 'nh:up' });
    expect(state.turn).toBeGreaterThan(turn);
    expect(utrap({ state })?.n ?? 0).toBe(n - 1);
  });

  test('a spiked pit: rnd(10) on the spikes, poisoned 1 time in 6; iron shoes protect', () => {
    let plain = 0;
    const poisonedRun = findSeed(
      (seed) => {
        const r = fallIn(TRAP.spikedPit, seed);
        if (!keys(r.ev).includes('trap.pit.spikes_poisoned')) plain++;
        return r;
      },
      (r) => keys(r.ev).includes('trap.pit.spikes_poisoned'),
    );
    expect(plain).toBeGreaterThan(0); // not every fall is poisoned
    expect(keys(poisonedRun.ev)).toContain('trap.pit.spikes');
    for (let seed = 1; seed <= 20; seed++) {
      const { state, ev } = fallIn(TRAP.spikedPit, seed);
      expect(keys(ev)).toContain('trap.pit.spikes');
      if (keys(ev).includes('trap.pit.spikes_poisoned')) continue;
      const lost = 500 - heroHp(state);
      expect(lost).toBeGreaterThanOrEqual(1);
      expect(lost).toBeLessThanOrEqual(10);
    }
    const s = setup(ROOM);
    wear(s.state, 'nh:iron_shoes', 'boots');
    place(s.state, TRAP.spikedPit, 2, 1);
    const ev = engine.step(s.state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.pit.spikes_protect');
    expect(keys(ev)).not.toContain('trap.pit.spikes');
    expect(keys(ev)).not.toContain('trap.pit.spikes_poisoned');
    expect(500 - heroHp(s.state)).toBeLessThanOrEqual(6);
    expect(utrap({ state: s.state })?.type).toBe('pit');
  });

  test('a seen pit asks "Really step into that pit?"; one time in five it is escaped', () => {
    const { state } = setup(ROOM);
    place(state, TRAP.pit, 2, 1, true);
    const r = engine.step(state, { type: 'move', dir: 'e' });
    expect(r.prompt?.key).toBe('trap.confirm_into');
    expect(r.prompt?.params?.['trap']).toBe(`@${TRAP.pit}`);
    const escaped = findSeed(
      (seed) => {
        const s = setup(ROOM, seed);
        place(s.state, TRAP.pit, 2, 1, true);
        engine.step(s.state, { type: 'move', dir: 'e' });
        const ev = engine.step(s.state, {
          type: 'answer',
          promptId: 'trap-confirm',
          value: true,
        }).events;
        return { ev, state: s.state };
      },
      (x) => keys(x.ev).includes('trap.escape'),
    );
    expect(utrap({ state: escaped.state })).toBeNull();
    expect(heroAt(escaped.state)).toEqual({ x: 2, y: 1 });
    // teetering at the edge of a seen pit, '>' plunges in
    const ev = engine.step(escaped.state, { type: 'mod', action: 'nh:down' }).events;
    expect(keys(ev)).toContain('trap.pit.plunge');
    expect(utrap({ state: escaped.state })?.type).toBe('pit');
  });

  test('a monster falls in and is held, takes rnd(6), then climbs out', () => {
    const s = setup(['.........', '.@.......', '.........']);
    const m = addMon(s.state, 'nh:hill_orc', 5, 1, { asleep: true });
    const mon = s.state.entities[String(m)];
    if (mon?.c.hp) mon.c.hp = { cur: 100, max: 100 };
    place(s.state, TRAP.pit, 5, 1);
    let r = '';
    const ev = withCtx(s.state, (ctx) => {
      r = mintrap(ctx, m);
    });
    expect(r).toBe('caught');
    expect(keys(ev)).toContain('trap.pit.mon_falls');
    expect(isMtrapped({ state: s.state }, m)).toBe(true);
    const hp = mon?.c.hp?.cur ?? 0;
    expect(100 - hp).toBeGreaterThanOrEqual(1);
    expect(100 - hp).toBeLessThanOrEqual(6);
    let out: string[] = [];
    for (let i = 0; i < 1000 && isMtrapped({ state: s.state }, m); i++)
      out = keys(withCtx(s.state, (ctx) => void mintrap(ctx, m)));
    expect(isMtrapped({ state: s.state }, m)).toBe(false);
    expect(out).toContain('trap.pit.mon_climbs');
  });

  test('a huge monster climbs out easily at once; flyers do not fall in', () => {
    const s = setup(['.........', '.@.......', '.........']);
    const m = addMon(s.state, 'nh:ettin_mummy', 5, 1, { asleep: true });
    const mon = s.state.entities[String(m)];
    if (mon?.c.hp) mon.c.hp = { cur: 100, max: 100 };
    place(s.state, TRAP.pit, 5, 1);
    withCtx(s.state, (ctx) => void mintrap(ctx, m));
    expect(isMtrapped({ state: s.state }, m)).toBe(true);
    const ev = withCtx(s.state, (ctx) => void mintrap(ctx, m));
    expect(keys(ev)).toContain('trap.pit.mon_climbs_easily');
    expect(isMtrapped({ state: s.state }, m)).toBe(false);

    const b = addMon(s.state, 'nh:bat', 3, 2);
    place(s.state, TRAP.pit, 3, 2);
    let r = '';
    withCtx(s.state, (ctx) => {
      r = mintrap(ctx, b);
    });
    expect(r).toBe('finished');
    expect(isMtrapped({ state: s.state }, b)).toBe(false);
  });
});
