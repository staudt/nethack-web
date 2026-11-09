// Milestone 7b step 7: Sokoban's rules (no diagonal pushes or squeezes, inescapable pits and
// holes, luck penalties, the rules lifted once the last pit or hole is gone), the treasure zoo
// and the prize. ref: src/hack.c moverock_core(), cannot_push(), bad_rock(), cant_squeeze_thru(),
// test_move(); src/trap.c sokoban_guilt(), maybe_finish_sokoban(), dotrap(), mintrap();
// src/zap.c fracture_rock(); src/read.c seffect_earth(); src/mkroom.c fill_zoo();
// src/hack.c check_special_room(); dat/soko*.lua
import { describe, expect, test } from 'vitest';
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Json,
  type Level,
  type Mod,
  type PlayerAction,
  type Pos,
} from '@nh/core';
import { BOULDER, P, WAN, mintrap, mksobj, setIntrinsic, uState, vanillaMod } from '../src/index';
import { setTerrain } from '../src/terrain';
import { mapToLevel } from '../src/sp_lev';
import { ZOO } from '../src/zoo';
import { makemon } from '../src/generation';
import { heroAt, mapSetup, travelTo } from './maps';
import { levelSetup, obj, plainKit, quiet, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'sk',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'sk:run',
      labelKey: 'sk',
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
const defs = engine.registry;

function run(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'sk:run' });
}

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const keys = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
const move = (dir: string): PlayerAction => ({ type: 'move', dir }) as PlayerAction;
const luck = (state: GameState): number => uState(state).luck;

/** Steps once; returns the events and how many turns passed. */
function act(state: GameState, a: PlayerAction): { events: GameEvent[]; turns: number } {
  const t0 = state.turn;
  const { events } = engine.step(state, a);
  return { events, turns: state.turn - t0 };
}

const entitiesOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.pos?.level === level.id);
const bouldersAt = (state: GameState, level: Level, p: Pos): number =>
  itemsAt(defs, state, level.id, p.x, p.y).filter((e) => e.def === BOULDER).length;

/**
 * A new game (seeds from `from`) whose Sokoban level `n` (1 = top) is built from `variant`; the
 * hero is sent there alone (the pet is left behind) and random monster generation is off.
 */
function sokoVariant(variant: string, n: number, from = 1): { state: GameState; level: Level } {
  for (let seed = from; seed < from + 80; seed++) {
    const { state } = engine.newGame({ seed });
    for (const e of entitiesOn(state, getLevel(state)))
      if ((e.c.monster?.tame ?? 0) > 0) Object.assign(e.c.pos!, { x: 0, y: 0 });
    quiet(state);
    run(state, (ctx) =>
      ctx.goToLevel({ dungeon: 'nh:sokoban', dlevel: n }, n === 1 ? 'down' : 'up'),
    );
    const level = getLevel(state);
    if (level.def === `nh:${variant}`) return { state, level };
  }
  throw new Error(`no ${variant} within 80 seeds`);
}

/** Map coordinates of the level's LevelDef to level coordinates. */
const mapAt = (level: Level, x: number, y: number): Pos =>
  mapToLevel(defs.level(level.def!), level, x, y);
const placeHero = (state: GameState, p: Pos): void => {
  Object.assign(getPlayer(state).c.pos!, { x: p.x, y: p.y });
};

/** A small test map with Sokoban's rules switched on (or not). */
function sokoMap(rows: string[], soko = true): ReturnType<typeof mapSetup> {
  const m = mapSetup(rows);
  if (soko) m.level.sokoban = true;
  return m;
}
const boulder = (m: ReturnType<typeof mapSetup>, x: number, y: number): number =>
  mksobj(m.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x, y } });
/** Average strength and constitution: her kit is too heavy to squeeze onto a boulder. */
const average = (state: GameState): void => {
  getPlayer(state).c.attributes = { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 };
};
/** A seen trap at (x, y). */
const pit = (m: ReturnType<typeof mapSetup>, x: number, y: number, def: DefId): void => {
  m.level.traps.push({ def, x, y, seen: true });
};
const empty = (state: GameState): void => {
  for (const e of inventoryOf(state, state.playerId)) delete state.entities[String(e.id)];
};

describe('the first boulder into the first pit of each entry level', () => {
  // the moves from the arrival spot (the branch stairs) and the pit filled, in map coordinates
  const SOLUTIONS: Record<string, { moves: string; pit: [number, number]; end: [number, number] }> =
    {
      // ref: dat/soko4-1.lua: (9,3) twice east, (10,4) down into the lower room, round to
      // (10,9), (9,9) west, then (8,10) west twice into the pit at (6,10)
      'soko4-1': { moves: 'n e e e e s s s se s sw w s w w', pit: [6, 10], end: [7, 10] },
      // ref: dat/soko4-2.lua: (5,2) down, (6,2) east four times, (9,5) and (9,6) down,
      // (8,8) down, then (7,8) west twice into the pit at (5,8)
      'soko4-2': { moves: 'e e s e e e e s s s s sw s w w', pit: [5, 8], end: [6, 8] },
    };
  for (const [variant, sol] of Object.entries(SOLUTIONS)) {
    test(variant, () => {
      const { state, level } = sokoVariant(variant, 4);
      placeHero(state, level.branch!.pos); // she arrives on the branch stairs
      const pit = mapAt(level, ...sol.pit);
      expect(level.traps.find((t) => t.x === pit.x && t.y === pit.y)?.def).toBe('nh:pit');
      const pits = level.traps.length;
      let all: GameEvent[] = [];
      for (const d of sol.moves.split(' ')) {
        const r = act(state, move(d));
        expect(r.turns, `${variant} ${d}`).toBe(1);
        all = [...all, ...r.events];
      }
      expect(heroAt(state)).toEqual(mapAt(level, ...sol.end));
      // the last push rolls the boulder over the rolling boulder trap next to the pit (C 3.7's
      // moverock()): it rolls away into the pit (heard: the boulder pushed beside her hid the
      // pit); her last step is onto the empty trap
      expect(texts(all)).toContain('The boulder suddenly rolls away from you!');
      expect(texts(all)).toContain('You hear a boulder fall.');
      expect(level.traps.some((t) => t.x === pit.x && t.y === pit.y)).toBe(false);
      expect(level.traps).toHaveLength(pits - 1);
      expect(bouldersAt(state, level, pit)).toBe(0);
      expect(level.traps.some((t) => t.def === 'nh:rolling_boulder_trap')).toBe(true);
      expect(level.sokoban).toBe(true); // other pits remain
      expect(luck(state)).toBe(0);
    });
  }
});

describe('no diagonal pushes or squeezes in Sokoban', () => {
  const ROOM = ['--------', '|......|', '|.@....|', '|......|', '|......|', '--------'];

  test('a diagonal push is refused with no time and no luck change', () => {
    const m = sokoMap(ROOM);
    average(m.state);
    boulder(m, 3, 3);
    const r = act(m.state, move('se'));
    expect(texts(r.events)).toEqual(["The boulder won't roll diagonally on this floor."]);
    expect(r.turns).toBe(0);
    expect(heroAt(m.state)).toEqual({ x: 2, y: 2 });
    expect(bouldersAt(m.state, m.level, { x: 3, y: 3 })).toBe(1);
    expect(luck(m.state)).toBe(0);
    // off Sokoban it rolls
    const off = sokoMap(ROOM, false);
    average(off.state);
    boulder(off, 3, 3);
    expect(act(off.state, move('se')).turns).toBe(1);
    expect(bouldersAt(off.state, off.level, { x: 4, y: 4 })).toBe(1);
  });

  test('carrying almost nothing, she squeezes onto it instead, for a point of Luck', () => {
    const m = sokoMap(ROOM);
    empty(m.state);
    boulder(m, 3, 3);
    const r = act(m.state, move('se'));
    expect(texts(r.events).slice(0, 2)).toEqual([
      "The boulder won't roll diagonally on this floor.",
      'However, you can squeeze yourself into a small opening.',
    ]);
    expect(heroAt(m.state)).toEqual({ x: 3, y: 3 });
    expect(bouldersAt(m.state, m.level, { x: 3, y: 3 })).toBe(1);
    expect(luck(m.state)).toBe(-1);
  });

  test('a diagonal squeeze between a boulder and a wall is refused', () => {
    const rows = ['-------', '|.-...|', '|.@...|', '|.....|', '-------'];
    const m = sokoMap(rows);
    boulder(m, 3, 2);
    const r = act(m.state, move('ne'));
    expect(texts(r.events)).toEqual(['You cannot pass that way.']);
    expect(r.turns).toBe(0);
    expect(heroAt(m.state)).toEqual({ x: 2, y: 2 });
    // off Sokoban a boulder is no rock: she goes through
    const off = sokoMap(rows, false);
    boulder(off, 3, 2);
    act(off.state, move('ne'));
    expect(heroAt(off.state)).toEqual({ x: 3, y: 1 });
  });

  test('travel never plans through a Sokoban boulder: it goes around', () => {
    const rows = ['-------', '|@....|', '|.---.|', '|.....|', '-------'];
    const m = sokoMap(rows);
    average(m.state);
    boulder(m, 2, 1);
    engine.stepAll(m.state, travelTo(4, 1));
    expect(heroAt(m.state)).toEqual({ x: 4, y: 1 });
    expect(bouldersAt(m.state, m.level, { x: 2, y: 1 })).toBe(1);
  });
});

describe('Sokoban luck penalties', () => {
  test('squeezing past a boulder that will not move costs a point of Luck', () => {
    for (const soko of [true, false]) {
      const m = sokoMap(['-----', '|...|', '|@..|', '|...|', '-----'], soko);
      empty(m.state);
      boulder(m, 2, 2);
      boulder(m, 3, 2);
      const r = act(m.state, move('e'));
      expect(keys(r.events)).toContain('boulder.squeeze');
      expect(heroAt(m.state)).toEqual({ x: 2, y: 2 });
      expect(luck(m.state)).toBe(soko ? -1 : 0);
    }
  });

  test('breaking a boulder with a wand of striking costs a point of Luck', () => {
    for (const soko of [true, false]) {
      const s = levelSetup(['.......', '.@.....', '.......']);
      plainKit(s.state);
      if (soko) getLevel(s.state).sokoban = true;
      const b = mksobj(s.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 3, y: 1 } });
      s.step({ type: 'wait' });
      const w = s.carry(WAN.striking);
      s.state.entities[String(w)]!.c.item!.spe = 5;
      s.mod('nh:zap', { item: w });
      const p = s.state.pendingPrompt?.prompt;
      engine.step(s.state, { type: 'answer', promptId: p!.id, value: 'e' as Json });
      expect(s.state.entities[String(b)]?.def).toBe('nh:rock');
      expect(luck(s.state)).toBe(soko ? -1 : 0);
    }
  });

  test('reading a scroll of earth costs a point of Luck', () => {
    for (const soko of [true, false]) {
      const m = sokoMap(['---------', '|.......|', '|...@...|', '|.......|', '---------'], soko);
      const id = mksobj(m.ctx, obj('nh:scroll_of_earth'), {
        init: false,
        carriedBy: m.state.playerId,
      });
      m.state.entities[String(id)]!.c.item!.buc = 'blessed';
      engine.step(m.state, {
        type: 'mod',
        action: 'nh:read',
        args: { item: id },
      } as unknown as PlayerAction);
      expect(bouldersAt(m.state, m.level, { x: 3, y: 1 })).toBe(1);
      expect(luck(m.state)).toBe(soko ? -1 : 0);
    }
  });
});

describe('solving a level', () => {
  test('filling the last pit lifts the rules: diagonal pushes work again', () => {
    const m = sokoMap(['--------', '|......|', '|.@....|', '|......|', '|......|', '--------']);
    pit(m, 4, 2, 'nh:pit' as DefId);
    boulder(m, 3, 2);
    expect(texts(act(m.state, move('e')).events)).toContain('The boulder fills a pit.');
    expect(m.level.traps).toHaveLength(0);
    expect(m.level.sokoban).toBeUndefined();
    boulder(m, 4, 3);
    expect(act(m.state, move('se')).turns).toBe(1);
    expect(bouldersAt(m.state, m.level, { x: 5, y: 4 })).toBe(1);
  });

  test('a spiked pit does not keep a level unsolved, a hole does', () => {
    for (const other of ['nh:spiked_pit', 'nh:hole']) {
      const m = sokoMap(['--------', '|......|', '|.@....|', '|......|', '--------']);
      pit(m, 4, 2, 'nh:pit' as DefId);
      pit(m, 6, 1, other as DefId);
      boulder(m, 3, 2);
      act(m.state, move('e'));
      expect(m.level.traps).toHaveLength(1);
      expect(m.level.sokoban).toBe(other === 'nh:hole' ? true : undefined);
    }
  });
});

describe('inescapable pits and holes', () => {
  test('a seen hole on soko2 always takes her down (100 tries)', () => {
    for (const variant of ['soko2-1', 'soko2-2']) {
      const { state, level } = sokoVariant(variant, 2);
      // the rolling boulder trap (it releases nothing in Sokoban) is just west of the first hole
      const hole = level.traps
        .filter((t) => t.def === 'nh:hole')
        .sort((a, b) => a.x - b.x || a.y - b.y)[0]!;
      expect(hole.def).toBe('nh:hole');
      expect(hole.seen).toBe(true);
      placeHero(state, { x: hole.x - 1, y: hole.y });
      getPlayer(state).c.hp = { cur: 10000, max: 10000 };
      const base = JSON.stringify(state);
      let escapes = 0;
      for (const soko of [true, false]) {
        for (let i = 0; i < 100; i++) {
          const s = JSON.parse(base) as GameState;
          if (!soko) delete s.levels[level.id]!.sokoban;
          run(s, (ctx) => {
            for (let k = 0; k < i; k++) ctx.rng.rn2(2); // a different stream each time
          });
          engine.step(s, move('e'));
          const r = engine.step(s, { type: 'answer', promptId: 'trap-confirm', value: true });
          if (soko) {
            expect(keys(r.events)).toContain('trap.air_currents');
            expect(texts(r.events)).toContain('Air currents pull you down into a hole!');
            expect(getLevel(s).id).not.toBe(level.id);
          } else if (keys(r.events).includes('trap.escape')) escapes++;
        }
      }
      expect(escapes).toBeGreaterThan(0); // the 1-in-5 escape off Sokoban
    }
  });

  test('a flying monster is dragged into a Sokoban pit', () => {
    for (const soko of [true, false]) {
      const m = sokoMap(['------', '|@...|', '------'], soko);
      pit(m, 3, 1, 'nh:pit' as DefId);
      const id = m.state.nextEntityId++;
      m.state.entities[String(id)] = {
        id,
        def: 'nh:giant_bat',
        c: {
          pos: { level: 'dlvl1', x: 3, y: 1 },
          actor: { energy: 0, speed: 0 },
          hp: { cur: 100, max: 100 },
          monster: { level: 2, peaceful: false, asleep: false, lastHero: null },
        },
      };
      let res = '';
      run(m.state, (ctx) => {
        res = mintrap(ctx, id);
      });
      expect(res).toBe(soko ? 'caught' : 'finished');
    }
  });
});

describe('random monsters in Sokoban', () => {
  test('a random spot is never a trap square on a level with the rules', () => {
    for (const soko of [true, false]) {
      const spots = new Set<string>();
      for (let seed = 1; seed <= 20; seed++) {
        const m = sokoMap(['------', '|....|', '------'], soko);
        pit(m, 2, 1, 'nh:pit' as DefId);
        pit(m, 3, 1, 'nh:hole' as DefId);
        let id: number | null = null;
        run(m.state, (ctx) => {
          for (let k = 0; k < seed; k++) ctx.rng.rn2(2); // a different stream each time
          id = makemon(ctx, null, null, { level: 'dlvl1', nogroup: true });
        });
        const p = id === null ? undefined : m.state.entities[String(id)]?.c.pos;
        if (p) spots.add(`${String(p.x)},${String(p.y)}`);
      }
      if (soko) expect([...spots].every((p) => p === '1,1' || p === '4,1')).toBe(true);
      else expect([...spots].some((p) => p === '2,1' || p === '3,1')).toBe(true);
    }
  });
});

describe('the treasure zoo and the prize', () => {
  const PRIZE: Record<string, { spots: [number, number][]; door: [number, number] }> = {
    'soko1-1': {
      spots: [
        [16, 11],
        [16, 13],
        [16, 15],
      ],
      door: [17, 15],
    },
    'soko1-2': {
      spots: [
        [16, 10],
        [16, 12],
        [16, 14],
      ],
      door: [17, 14],
    },
  };
  const PRIZES = ['nh:bag_of_holding', 'nh:amulet_of_reflection'];

  for (const [variant, { spots, door }] of Object.entries(PRIZE)) {
    test(`${variant}: a not-cursed prize at one of its spots, both kinds seen`, () => {
      const kinds = new Set<string>();
      let from = 1;
      for (let i = 0; i < 24; i++) {
        const { state, level } = sokoVariant(variant, 1, from);
        from = state.seed + 1;
        const at = spots.map(([x, y]) => mapAt(level, x, y));
        // (a random object elsewhere may be one of the kinds too: seed 31's second bag)
        const prizes = entitiesOn(state, level).filter(
          (e) => PRIZES.includes(e.def) && at.some((q) => q.x === e.c.pos!.x && q.y === e.c.pos!.y),
        );
        expect(prizes).toHaveLength(1);
        const p = prizes[0]!;
        expect(p.c.item?.buc).not.toBe('cursed');
        kinds.add(p.def);
      }
      expect([...kinds].sort()).toEqual([...PRIZES].sort());
    });

    test(`${variant}: sleeping monsters on gold, the welcome once`, () => {
      // a level whose two boulder mimics (awake, not zoo monsters) both landed outside the zoo
      const inRoom = (r: Level['rooms'][number], p: Pos): boolean =>
        p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy;
      let found = sokoVariant(variant, 1);
      while (
        entitiesOn(found.state, found.level).some(
          (e) =>
            e.def === 'nh:giant_mimic' &&
            inRoom(
              found.level.rooms.find((r) => r.type === ZOO)!,
              e.c.pos!,
            ),
        )
      )
        found = sokoVariant(variant, 1, found.state.seed + 1);
      const { state, level } = found;
      const zi = level.rooms.findIndex((r) => r.type === ZOO);
      const zoo = level.rooms[zi]!;
      expect(zoo.hx - zoo.lx).toBe(4);
      expect(zoo.hy - zoo.ly).toBe(6);
      const d = mapAt(level, ...door);
      const things = entitiesOn(state, level);
      let filled = 0;
      for (let x = zoo.lx; x <= zoo.hx; x++)
        for (let y = zoo.ly; y <= zoo.hy; y++) {
          const here = things.filter((e) => e.c.pos!.x === x && e.c.pos!.y === y);
          const mon = here.find((e) => e.c.monster);
          const gold = here.find((e) => e.def === 'nh:gold_piece');
          if (Math.max(Math.abs(x - d.x), Math.abs(y - d.y)) <= 1) {
            // next to the first door: left empty
            expect(mon).toBeUndefined();
            expect(gold).toBeUndefined();
            continue;
          }
          expect(mon?.c.monster?.asleep).toBe(true);
          expect(gold?.c.item?.quantity ?? 0).toBeGreaterThanOrEqual(10);
          filled++;
        }
      expect(filled).toBe(35 - 3);
      // walk in through the first door: the welcome, once; a stealthy hero wakes nobody
      const inZoo = () =>
        entitiesOn(state, level).filter(
          (e) =>
            e.c.monster &&
            e.c.pos!.x >= zoo.lx &&
            e.c.pos!.x <= zoo.hx &&
            e.c.pos!.y >= zoo.ly &&
            e.c.pos!.y <= zoo.hy,
        );
      const base = JSON.stringify(state);
      placeHero(state, { x: d.x - 1, y: d.y });
      setTerrain(level, d.x, d.y, 'nh:door_open_v' as DefId);
      setIntrinsic(getPlayer(state), P.STEALTH, true);
      act(state, { type: 'wait' });
      const r1 = act(state, move('e'));
      expect(texts(r1.events)).toEqual(["Welcome to David's treasure zoo!"]);
      expect(level.rooms[zi]!.type).toBeUndefined();
      expect(inZoo().every((e) => e.c.monster?.asleep)).toBe(true);
      const r2 = act(state, move('e'));
      expect(heroAt(state)).toEqual({ x: d.x + 1, y: d.y });
      expect(keys(r2.events)).not.toContain('zoo.welcome');
      // without Stealth (she gains it at XL3) each of them wakes one time in three
      const loud = JSON.parse(base) as GameState;
      const lv = getLevel(loud);
      placeHero(loud, { x: d.x - 1, y: d.y });
      setTerrain(lv, d.x, d.y, 'nh:door_open_v' as DefId);
      act(loud, { type: 'wait' });
      const r3 = act(loud, move('e'));
      expect(texts(r3.events)[0]).toBe("Welcome to David's treasure zoo!");
      expect(keys(r3.events)).toContain('mon.wakes_up_calm');
    });
  }
});
