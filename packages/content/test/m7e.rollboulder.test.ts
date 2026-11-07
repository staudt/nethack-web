// m7e step 3: rolling boulder traps. The launch spots maketrap() picks (a clear path both ways,
// nothing in Sokoban), the boulder rolling across the trap into a monster, the hero, a pit, a
// closed door, a teleportation trap, another boulder and a wall, monsters setting it off, a
// pushed boulder rolling away, and the random trap roll. Outcomes are asserted on immobile
// monsters (always hit), forced trap data and an enchanted boulder (always hits the hero).
// ref: src/trap.c maketrap(), mkroll_launch(), find_random_launch_coord(), isclearpath(),
// launch_obj(), trapeffect_rolling_boulder_trap(); src/hack.c moverock(); src/mklev.c traptype_rnd()
import {
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  createEngine,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, vanillaMod } from '../src/index';
import { BOULDER } from '../src/boulder';
import { mksobj } from '../src/items';
import { traptypeRnd } from '../src/mklev';
import { launchObj } from '../src/rollboulder';
import { TRAP, dataOf, dotrap, maketrap, mintrap } from '../src/trap';
import { addMon } from './helpers';
import { ctxFor, obj, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'rb',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'rb:run',
      labelKey: 'rb',
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
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with a real Ctx, no time passing; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'rb:run' }).events);
}
const cellOf = (level: Level, x: number, y: number): DefId | undefined =>
  level.palette[level.cells[y * level.width + x] ?? -1];
const boulders = (state: GameState): string[] =>
  Object.values(state.entities)
    .filter((e): e is Entity => !!e && e.def === BOULDER && !!e.c.pos)
    .map((e) => `${e.c.pos!.x},${e.c.pos!.y}`)
    .sort();
const boulderAt = (m: ReturnType<typeof mapSetup>, x: number, y: number): EntityId =>
  mksobj(m.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x, y } });

/** An unseen rolling boulder trap at (tx, ty) rolling from `launch` to `launch2`. */
function rollingTrap(
  m: ReturnType<typeof mapSetup>,
  tx: number,
  ty: number,
  launch: [number, number],
  launch2: [number, number],
  boulder = true,
): void {
  m.level.traps.push({
    def: TRAP.rolling,
    x: tx,
    y: ty,
    seen: false,
    data: { launch: { x: launch[0], y: launch[1] }, launch2: { x: launch2[0], y: launch2[1] } },
  });
  if (boulder) boulderAt(m, launch[0], launch[1]);
}

/** A yellow mold (immobile: the boulder always hits it) with `hp` hit points. */
function mold(state: GameState, x: number, y: number, hp: number): EntityId {
  const id = addMon(state, 'nh:yellow_mold', x, y, { asleep: true });
  state.entities[String(id)]!.c.hp = { cur: hp, max: hp };
  return id;
}

/** A long lit corridor of room floor, the hero at its west end (out of the way). */
const ROW = ['-------------', '|@..........|', '-------------'];

// ---------------------------------------------------------------------------------------------

describe('launch spots', () => {
  test('a boulder 2..8 squares away in a line, with a clear path to the far side', () => {
    let made = 0;
    let none = 0;
    for (let x = 1; x <= 13; x++)
      for (let y = 1; y <= 7; y++) {
        const m = mapSetup([
          '---------------',
          '|.............|',
          '|.............|',
          '|.............|',
          '|.............|',
          '|.............|',
          '|.............|',
          '|.....@.......|',
          '---------------',
        ]);
        // pits and a teleportation trap the path must avoid
        m.level.traps.push({ def: TRAP.pit, x: 3, y: 3, seen: false });
        m.level.traps.push({ def: TRAP.tele, x: 10, y: 5, seen: false });
        if (trapAt(m.level, x, y)) continue;
        run(m.state, (ctx) => {
          maketrap(ctx, 'dlvl1', x, y, TRAP.rolling);
        });
        const t = trapAt(m.level, x, y)!;
        const { launch, launch2 } = dataOf(t);
        if (!launch || !launch2) throw new Error('no launch data');
        if (launch.x === x && launch.y === y) {
          none++;
          expect(launch2).toEqual({ x, y });
          expect(boulders(m.state)).toEqual([]);
          continue;
        }
        made++;
        expect(boulders(m.state)).toEqual([`${launch.x},${launch.y}`]);
        const dx = Math.sign(launch.x - x);
        const dy = Math.sign(launch.y - y);
        const dist = Math.max(Math.abs(launch.x - x), Math.abs(launch.y - y));
        expect(dist).toBeGreaterThanOrEqual(2);
        expect(dist).toBeLessThanOrEqual(8);
        expect(launch).toEqual({ x: x + dist * dx, y: y + dist * dy }); // a straight line
        expect(launch2).toEqual({ x: x - dist * dx, y: y - dist * dy });
        for (let k = -dist; k <= dist; k++) {
          const cx = x + k * dx;
          const cy = y + k * dy;
          expect(cellOf(m.level, cx, cy)).toBe(T.floor);
          const other = trapAt(m.level, cx, cy);
          if (other && (cx !== x || cy !== y)) expect(other.def).toBe(TRAP.rolling);
        }
      }
    expect(made).toBeGreaterThan(30);
    expect(none).toBeGreaterThan(0); // the corners have no room both ways
  });

  test('in Sokoban: no launch spot, no boulder, no random draws', () => {
    const m = mapSetup(['|.......|', '|...@...|', '|.......|']);
    m.level.sokoban = true;
    const before = JSON.stringify(m.state.rng);
    run(m.state, (ctx) => {
      maketrap(ctx, 'dlvl1', 4, 1, TRAP.rolling);
    });
    expect(JSON.stringify(m.state.rng)).toBe(before);
    const t = trapAt(m.level, 4, 1)!;
    expect(dataOf(t)).toEqual({ launch: { x: 4, y: 1 }, launch2: { x: 4, y: 1 } });
    expect(boulders(m.state)).toEqual([]);
    // she sets it off: nothing rolls, and the trap stays
    const msgs = run(m.state, (ctx) => dotrap(ctx, t));
    expect(msgs).toEqual([
      'Click!  You trigger a rolling boulder trap!',
      'Fortunately for you, no boulder was released.',
    ]);
    expect(trapAt(m.level, 4, 1)?.def).toBe(TRAP.rolling);
    // a known one: the shorter message
    expect(run(m.state, (ctx) => dotrap(ctx, trapAt(m.level, 4, 1)!, { force: true }))).toEqual([
      'Click!  You trigger a rolling boulder trap!',
      'No boulder was released.',
    ]);
  });

  test('the random trap roll gives it from level 2, never on level 1', () => {
    const m = mapSetup(['.@.']);
    const kinds = (lvl: number): Set<DefId | null> => {
      const out = new Set<DefId | null>();
      run(m.state, (ctx) => {
        for (let i = 0; i < 2000; i++) out.add(traptypeRnd(ctx, lvl));
      });
      return out;
    };
    expect(kinds(1).has(TRAP.rolling)).toBe(false);
    expect(kinds(2).has(TRAP.rolling)).toBe(true);
  });
});

describe('the boulder rolls', () => {
  test('across the trap to the far end, hitting the hero (an enchanted boulder always hits)', () => {
    const m = mapSetup(ROW);
    for (const o of inventoryOf(m.state, m.state.playerId)) delete m.state.entities[String(o.id)];
    const hero = getPlayer(m.state);
    Object.assign(hero.c.pos!, { x: 5, y: 1 });
    hero.c.hp = { cur: 100, max: 100 };
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    const b = Object.values(m.state.entities).find((e) => e?.def === BOULDER)!;
    b.c.item!.spe = 2; // u.uac 10 + 9 + 2 > rnd(20)
    const msgs = run(m.state, (ctx) => dotrap(ctx, trapAt(m.level, 5, 1)!));
    expect(msgs[0]).toBe('Click!  You trigger a rolling boulder trap!');
    expect(msgs.some((s) => s.startsWith('You are hit by a boulder'))).toBe(true);
    expect(hero.c.hp.cur).toBeLessThan(100);
    expect(boulders(m.state)).toEqual(['8,1']);
    expect(trapAt(m.level, 5, 1)?.seen).toBe(true);
  });

  test('from the far end back when the boulder lies there', () => {
    const m = mapSetup(ROW);
    rollingTrap(m, 5, 1, [2, 1], [8, 1], false);
    boulderAt(m, 8, 1);
    run(m.state, (ctx) => {
      expect(launchObj(ctx, 2, 1, 8, 1, {})).toBe(1);
    });
    expect(boulders(m.state)).toEqual(['2,1']);
  });

  test('a monster in the way is hit and stops it; the kill is hers only on a trap she knew', () => {
    for (const known of [false, true]) {
      const m = mapSetup(ROW);
      const id = mold(m.state, 4, 1, 1);
      rollingTrap(m, 5, 1, [2, 1], [8, 1]);
      const xp = (): number => getPlayer(m.state).c.experience?.points ?? 0;
      const before = xp();
      const msgs = run(m.state, (ctx) => {
        expect(launchObj(ctx, 2, 1, 8, 1, { known })).toBe(2);
      });
      expect(m.state.entities[String(id)]).toBeUndefined();
      expect(msgs).toContain('The yellow mold is killed!');
      expect(boulders(m.state)).toEqual(['4,1']); // it stops where it hit
      if (known) expect(xp()).toBeGreaterThan(before);
      else expect(xp()).toBe(before);
    }
  });

  test('a monster that lives stops it too', () => {
    const m = mapSetup(ROW);
    const id = mold(m.state, 6, 1, 500);
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    run(m.state, (ctx) => launchObj(ctx, 2, 1, 8, 1, {}));
    expect(m.state.entities[String(id)]!.c.hp!.cur).toBeLessThan(500);
    expect(boulders(m.state)).toEqual(['6,1']);
  });

  test('into a pit: it fills it and stops', () => {
    const m = mapSetup(ROW);
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    m.level.traps.push({ def: TRAP.pit, x: 7, y: 1, seen: true });
    const msgs = run(m.state, (ctx) => launchObj(ctx, 2, 1, 8, 1, {}));
    expect(msgs).toContain('The boulder fills a pit.');
    expect(trapAt(m.level, 7, 1)).toBeUndefined();
    expect(boulders(m.state)).toEqual([]);
  });

  test('through a closed door, which breaks', () => {
    const m = mapSetup(['-------------', '|@.....+....|', '-------------']);
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    const msgs = run(m.state, (ctx) => launchObj(ctx, 2, 1, 8, 1, {}));
    expect(msgs).toContain('The boulder crashes through a door.');
    expect(cellOf(m.level, 7, 1)).toBe(T.doorway);
    expect(boulders(m.state)).toEqual(['8,1']);
  });

  test('onto a teleportation trap: it vanishes to another spot of the level', () => {
    const m = mapSetup(ROW);
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    m.level.traps.push({ def: TRAP.tele, x: 7, y: 1, seen: false });
    const msgs = run(m.state, (ctx) => {
      expect(launchObj(ctx, 2, 1, 8, 1, {})).toBe(2);
    });
    expect(msgs).toContain('Suddenly the rolling boulder disappears!');
    expect(trapAt(m.level, 7, 1)?.seen).toBe(true);
    const at = boulders(m.state);
    expect(at).toHaveLength(1);
    expect(at[0]).not.toBe('8,1');
  });

  test('into another boulder, which rolls on', () => {
    const m = mapSetup(ROW);
    rollingTrap(m, 5, 1, [2, 1], [9, 1]);
    boulderAt(m, 7, 1);
    const msgs = run(m.state, (ctx) => launchObj(ctx, 2, 1, 9, 1, {}));
    expect(msgs).toContain('You hear a loud crash as one boulder sets another in motion!');
    expect(boulders(m.state)).toEqual(['7,1', '9,1']);
  });

  test('stops before a wall: "Thump!"', () => {
    const m = mapSetup(['-------', '|@....|', '-------']);
    rollingTrap(m, 3, 1, [2, 1], [7, 1]);
    const msgs = run(m.state, (ctx) => launchObj(ctx, 2, 1, 7, 1, {}));
    expect(msgs).toContain('Thump!');
    expect(boulders(m.state)).toEqual(['5,1']);
  });
});

describe('who sets it off', () => {
  test('a monster: seen, with its message; the boulder hits it', () => {
    const m = mapSetup(ROW);
    const id = addMon(m.state, 'nh:jackal', 5, 1);
    m.state.entities[String(id)]!.c.hp = { cur: 500, max: 500 };
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    let r = '';
    const msgs = run(m.state, (ctx) => {
      r = mintrap(ctx, id);
    });
    expect(msgs[0]).toBe('Click!  The jackal triggers something.');
    expect(trapAt(m.level, 5, 1)?.seen).toBe(true);
    expect(r).toBe('finished');
    // hit (stopped on its square) or missed (rolled on to the far end)
    expect([['5,1'], ['8,1']]).toContainEqual(boulders(m.state));
  });

  test('a flying monster passes over it', () => {
    const m = mapSetup(ROW);
    rollingTrap(m, 5, 1, [2, 1], [8, 1]);
    const bat = addMon(m.state, 'nh:giant_bat', 5, 1);
    run(m.state, (ctx) => mintrap(ctx, bat));
    expect(boulders(m.state)).toEqual(['2,1']);
  });

  test('a boulder pushed onto it rolls away to the far end', () => {
    const m = mapSetup(ROW);
    rollingTrap(m, 4, 1, [4, 1], [4, 1], false);
    boulderAt(m, 3, 1);
    Object.assign(getPlayer(m.state).c.pos!, { x: 2, y: 1 });
    const r = engine.step(m.state, { type: 'move', dir: 'e' });
    expect(texts(r.events)).toContain('The boulder suddenly rolls away from you!');
    expect(texts(r.events)).toContain('Thump!');
    expect(boulders(m.state)).toEqual(['11,1']);
    expect(trapAt(m.level, 4, 1)?.seen).toBe(true);
  });
});

describe('wizard trap wish', () => {
  test('"rolling boulder trap" names the trap', () => {
    const m = mapSetup(ROW);
    expect(ctxFor(m.state).defs.traps.some((t) => t.id === TRAP.rolling)).toBe(true);
    expect(render({ key: TRAP.rolling })).toBe('rolling boulder trap');
  });
});
