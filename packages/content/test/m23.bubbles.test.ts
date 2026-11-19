// m23 step 10: the Planes of Water and Air. Water's air bubbles and Air's clouds (their shapes,
// how they are made, drift, bounce off the edges and turn), what a bubble carries (the hero,
// monsters, objects, traps: the portal), which bubble keeps what overlapping bubbles held, the
// forgotten map, Air's tumbling and storms, the water's turbulence, popping into a bubble and
// crawling back into one, Water's monsters. Outcomes over seeds, monsters pinned.
// ref: src/mkmaze.c setup_waterlevel(), mk_bubble(), movebubbles(), mv_bubble(),
// maybe_adjust_hero_bubble(), water_friction(); src/hack.c air_turbulence(), water_turbulence(),
// pooleffects(); src/trap.c float_up(), float_down(), drown(); src/timeout.c do_storms();
// dat/water.lua, air.lua
import {
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  BUBBLE_SHAPES,
  bubbleBounds,
  bubbleCells,
  bubblesOf,
  movebubbles,
  type Bubble,
} from '../src/bubbles';
import { vanillaMod } from '../src/index';
import { mksobj, placeObject } from '../src/items';
import { makemon } from '../src/generation';
import { PLANES, PLANE_LEVELS } from '../src/levelflags';
import { floatDown } from '../src/levitation';
import { setU } from '../src/luck';
import { MAGIC_PORTAL, findPortal } from '../src/portal';
import { WATER } from '../src/planes';
import { P, setIntrinsic } from '../src/props';
import { mapToLevel } from '../src/sp_lev';
import { doStorms } from '../src/storms';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { AMULET_OF_YENDOR } from '../src/uhave';
import { setUinwater, uinwater } from '../src/uwater';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'bb',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'bb:run',
      labelKey: 'bb',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'bb:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;

/** A new game with the Amulet (its wish granted), the hero sturdy. */
function game(seed: number): GameState {
  const { state } = engine.newGame({ seed });
  setU({ state }, { amuletWish: true });
  getPlayer(state).c.hp = { cur: 9999, max: 9999 };
  run(state, (ctx) => {
    mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), { init: true, carriedBy: state.playerId });
  });
  return state;
}

const planeRef = (state: GameState, k: keyof typeof PLANE_LEVELS) => {
  const sp = dungeonLayout(state, PLANES).special.find((s) => s.id === PLANE_LEVELS[k])!;
  return { dungeon: PLANES, dlevel: sp.dlevel };
};
const goPlane = (state: GameState, k: keyof typeof PLANE_LEVELS): string[] =>
  run(state, (ctx) => ctx.goToLevel(planeRef(state, k), 'random'));

const monsOn = (state: GameState, level: Level): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.monster && e.c.pos?.level === level.id && e.id !== state.playerId,
  );
const cellsOf = (level: Level, id: DefId): number =>
  level.cells.filter((c) => level.palette[c] === id).length;
const key = (x: number, y: number) => `${x},${y}`;

/** Pins every monster of the level (asleep, speed 0), so that only the bubbles move things. */
function pinAll(state: GameState): void {
  for (const m of monsOn(state, getLevel(state))) {
    m.c.monster!.asleep = true;
    if (m.c.actor) m.c.actor.speed = 0;
  }
}

/** Replaces the Water level's bubbles with `list`: the old ones flooded, the new drawn as air. */
function setBubbles(state: GameState, list: Bubble[], up = false): void {
  const level = getLevel(state);
  const bl = bubblesOf({ state }, level.id)!;
  bl.list = list;
  bl.up = up;
  for (let x = 1; x < level.width; x++)
    for (let y = 0; y < level.height; y++)
      if (terrainIdAt(level, x, y) === T.air) setTerrain(level, x, y, T.water);
  for (const b of list) for (const c of bubbleCells(b)) setTerrain(level, c.x, c.y, T.air);
}

describe('bubbles', () => {
  test("the seven shapes are C's bit masks", () => {
    expect(BUBBLE_SHAPES.map((s) => [s[0], s[1]])).toEqual([
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 3],
      [6, 4],
      [7, 4],
      [8, 4],
    ]);
    const cells = (n: number) => bubbleCells({ x: 0, y: 0, dx: 0, dy: 0, n }).length;
    expect([0, 1, 2, 3, 4, 5, 6].map(cells)).toEqual([2, 6, 8, 11, 20, 24, 28]);
    // bm4 = { 4, 3, 0x6, 0xf, 0x6 }: a diamond
    expect(
      bubbleCells({ x: 10, y: 5, dx: 0, dy: 0, n: 2 })
        .map((p) => key(p.x, p.y))
        .sort(),
    ).toEqual(['10,6', '11,5', '11,6', '11,7', '12,5', '12,6', '12,7', '13,6'].sort());
  });

  test('Water: water but in its bubbles, the hero arrives in one in the west, the portal in one in the east', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = game(seed);
      const t = goPlane(state, 'water');
      expect(t).toContain('You find yourself suspended in an air bubble surrounded by water.');
      const level = getLevel(state);
      expect(level.def).toBe(WATER.id);
      const bl = bubblesOf({ state }, level.id)!;
      expect(bl.list.length).toBeGreaterThan(4);
      const { xmin, ymin, xmax, ymax } = bubbleBounds(level);
      const inBubble = new Set<string>();
      for (const b of bl.list) {
        for (const c of bubbleCells(b)) inBubble.add(key(c.x, c.y));
        const s = BUBBLE_SHAPES[b.n]!;
        expect(b.x).toBeGreaterThanOrEqual(xmin);
        expect(b.y).toBeGreaterThanOrEqual(ymin);
        expect(b.x + s[0]! - 1).toBeLessThanOrEqual(xmax);
        expect(b.y + s[1]! - 1).toBeLessThanOrEqual(ymax);
      }
      // every air cell is a bubble's and every bubble cell is air; the rest is water (column 0
      // stays stone, as C's column 0 that is not on the map)
      for (let x = 1; x < level.width; x++)
        for (let y = 0; y < level.height; y++)
          expect(terrainIdAt(level, x, y)).toBe(inBubble.has(key(x, y)) ? T.air : T.water);
      const hp = getPlayer(state).c.pos!;
      expect(inBubble.has(key(hp.x, hp.y))).toBe(true);
      expect(bl.hero).toBeDefined();
      expect(hp.x).toBeLessThanOrEqual(mapToLevel(WATER, level, 25, 0).x + 1);
      const portal = findPortal(level)!;
      expect(inBubble.has(key(portal.x, portal.y))).toBe(true);
      expect(portal.x).toBeGreaterThanOrEqual(mapToLevel(WATER, level, 51, 0).x - 1);
      // a fisherman's dream: eels, krakens, sharks, piranhas, jellyfish, water elementals
      const kinds = new Set(monsOn(state, level).map((m) => m.def));
      for (const k of ['nh:giant_eel', 'nh:electric_eel', 'nh:kraken', 'nh:water_elemental'])
        expect(kinds.has(k as DefId)).toBe(true);
      expect(
        monsOn(state, level).filter((m) => m.def === 'nh:water_elemental' && !m.c.monster!.peaceful)
          .length,
      ).toBeGreaterThan(10);
    }
  });

  test('Air: clouds over the air, more along the edges; they are redrawn each turn', () => {
    const state = game(7);
    goPlane(state, 'air');
    const level = getLevel(state);
    const bl = bubblesOf({ state }, level.id)!;
    expect(bl.list.length).toBeGreaterThan(20);
    const clouds = cellsOf(level, T.cloud);
    expect(clouds).toBeGreaterThan(200);
    expect(cellsOf(level, T.water)).toBe(0);
    // every cloud is a bubble's or on the edge
    const { xmin, ymin, xmax, ymax } = bubbleBounds(level);
    const inBubble = new Set(bl.list.flatMap((b) => bubbleCells(b).map((c) => key(c.x, c.y))));
    for (let x = 1; x < level.width; x++)
      for (let y = 0; y < level.height; y++)
        if (terrainIdAt(level, x, y) === T.cloud)
          expect(inBubble.has(key(x, y)) || x < xmin || x > xmax || y < ymin || y > ymax).toBe(
            true,
          );
    const edge = (l: Level) => {
      const out: string[] = [];
      for (let x = 1; x < l.width; x++) if (terrainIdAt(l, x, 0) === T.cloud) out.push(key(x, 0));
      return out.join(' ');
    };
    const before = edge(level);
    pinAll(state);
    engine.step(state, { type: 'search' });
    expect(edge(getLevel(state))).not.toBe(before);
  });

  test('a bubble at the edge bounces off it; one in the open goes on its way', () => {
    const state = game(3);
    goPlane(state, 'water');
    pinAll(state);
    const level = getLevel(state);
    const { xmax } = bubbleBounds(level);
    // 2x1 bubble touching the east edge, drifting east
    const b: Bubble = { x: xmax - 1, y: 8, dx: 1, dy: 0, n: 0 };
    setBubbles(state, [b]);
    run(state, (ctx) => movebubbles(ctx));
    expect(b.x).toBe(xmax - 2);
    expect(b.dx).toBe(-1);
    // a bubble in the open drifting east keeps going east (a turn 1 in 20)
    let east = 0;
    for (let i = 0; i < 20; i++) {
      const c: Bubble = { x: 30, y: 8, dx: 1, dy: 0, n: 0 };
      setBubbles(state, [c]);
      run(state, (ctx) => movebubbles(ctx));
      if (c.x === 31) east++;
      expect(Math.abs(c.y - 8)).toBeLessThanOrEqual(1);
    }
    expect(east).toBe(20);
    expect(terrainIdAt(getLevel(state), 31, 8)).toBe(T.air);
  });

  test('a bubble carries the hero, a monster, an object pile and a trap; the water closes behind it', () => {
    for (const seed of [11, 12, 13]) {
      const state = game(seed);
      goPlane(state, 'water');
      pinAll(state);
      const level = getLevel(state);
      // an 8x4 bubble in the open
      const b: Bubble = { x: 30, y: 8, dx: 1, dy: 1, n: 6 };
      setBubbles(state, [b]);
      for (const m of monsOn(state, level))
        if (bubbleCells(b).some((c) => c.x === m.c.pos!.x && c.y === m.c.pos!.y))
          delete state.entities[String(m.id)];
      Object.assign(getPlayer(state).c.pos!, { x: 32, y: 9 });
      let mon: EntityId = 0;
      const objs: EntityId[] = [];
      run(state, (ctx) => {
        mon = makemon(ctx, ctx.defs.monster('nh:water_elemental' as DefId), { x: 34, y: 10 })!;
        for (const d of ['nh:dagger', 'nh:arrow']) {
          const o = mksobj(ctx, ctx.defs.object(d as DefId), { init: false });
          placeObject(ctx, o, level.id, 35, 9);
          objs.push(o);
        }
        ctx.placeTrap(level.id, { def: 'nh:squeaky_board' as DefId, x: 36, y: 10, seen: true });
      });
      ent(state, mon).c.actor!.speed = 0;
      ent(state, mon).c.monster!.asleep = true;
      run(state, (ctx) => movebubbles(ctx));
      const dx = b.x - 30;
      const dy = b.y - 8;
      expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
      expect(getPlayer(state).c.pos).toMatchObject({ x: 32 + dx, y: 9 + dy });
      expect(ent(state, mon).c.pos).toMatchObject({ x: 34 + dx, y: 10 + dy });
      for (const o of objs) expect(ent(state, o).c.pos).toMatchObject({ x: 35 + dx, y: 9 + dy });
      // the pile kept its order (the arrow on top)
      expect(ent(state, objs[1]!).c.item!.placed).toBeGreaterThan(
        ent(state, objs[0]!).c.item!.placed!,
      );
      expect(trapAt(level, 36 + dx, 10 + dy)?.def).toBe('nh:squeaky_board');
      expect(trapAt(level, 36, 10)).toBeUndefined();
      const idx = level.traps.map((t) => t.y * level.width + t.x);
      expect(idx).toEqual([...idx].sort((p, q) => p - q));
      const cells = new Set(bubbleCells(b).map((c) => key(c.x, c.y)));
      for (let x = 1; x < level.width; x++)
        for (let y = 0; y < level.height; y++)
          expect(terrainIdAt(level, x, y)).toBe(cells.has(key(x, y)) ? T.air : T.water);
      expect(bubblesOf({ state }, level.id)!.hero).toBe(0);
    }
  });

  test('where two bubbles overlap, the first one the chain walk meets keeps what is there', () => {
    for (const up of [false, true]) {
      const state = game(21);
      goPlane(state, 'water');
      pinAll(state);
      const level = getLevel(state);
      const a: Bubble = { x: 30, y: 8, dx: 1, dy: 0, n: 1 };
      const b: Bubble = { x: 30, y: 8, dx: -1, dy: 0, n: 1 };
      setBubbles(state, [a, b], up);
      for (const m of monsOn(state, level))
        if (bubbleCells(a).some((c) => c.x === m.c.pos!.x && c.y === m.c.pos!.y))
          delete state.entities[String(m.id)];
      let o: EntityId = 0;
      run(state, (ctx) => {
        o = mksobj(ctx, ctx.defs.object('nh:dagger' as DefId), { init: false });
        placeObject(ctx, o, level.id, 31, 9);
      });
      run(state, (ctx) => movebubbles(ctx));
      // `up` false walks the chain backwards: the last bubble picks it up; then forwards
      const keeper = up ? a : b;
      expect(ent(state, o).c.pos).toMatchObject({ x: 31 + keeper.x - 30, y: 9 + keeper.y - 8 });
      expect(bubblesOf({ state }, level.id)!.up).toBe(!up);
    }
  });

  test('the hero forgets the Plane of Water: what she does not see is water again', () => {
    const state = game(5);
    goPlane(state, 'water');
    pinAll(state);
    const level = getLevel(state);
    const waterIdx = level.palette.indexOf(T.water);
    engine.step(state, { type: 'search' });
    const mem = state.memory[level.id]!;
    const vis = new Set(state.visible);
    for (let i = 0; i < mem.length; i++) {
      if (i % level.width === 0 || vis.has(i)) continue;
      expect(mem[i]).toBe(waterIdx);
    }
    expect(Object.keys(state.objectMemory[level.id] ?? {}).every((k) => vis.has(Number(k)))).toBe(
      true,
    );
  });

  test('after her move the bubble she rode may take her direction (1 in 2)', () => {
    let took = 0;
    let kept = 0;
    for (let seed = 30; seed < 40; seed++) {
      const state = game(seed);
      goPlane(state, 'water');
      pinAll(state);
      const level = getLevel(state);
      const b: Bubble = { x: 30, y: 8, dx: 0, dy: 1, n: 6 };
      setBubbles(state, [b]);
      for (const m of monsOn(state, level)) delete state.entities[String(m.id)];
      Object.assign(getPlayer(state).c.pos!, { x: 33, y: 9 });
      run(state, (ctx) => movebubbles(ctx));
      const hp = getPlayer(state).c.pos!;
      // step west inside the bubble
      setTerrain(level, hp.x - 1, hp.y, T.air);
      const before = { dx: b.dx, dy: b.dy };
      engine.step(state, { type: 'move', dir: 'w' });
      if (getPlayer(state).c.pos!.level !== level.id) continue;
      // the turn's movebubbles() may still turn it at random afterwards (1 in 20)
      if (b.dx === -1 && b.dy === 0) took++;
      else if (b.dx === before.dx && b.dy === before.dy) kept++;
    }
    expect(took).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });
});

describe('the hero on Air and Water', () => {
  test('Air: 3 steps in 4 she tumbles in place; levitating she walks', () => {
    const state = game(8);
    goPlane(state, 'air');
    const level = getLevel(state);
    for (const m of monsOn(state, level)) delete state.entities[String(m.id)];
    const lines = new Set<string>();
    let stayed = 0;
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const p = getPlayer(state).c.pos!;
      const to = p.x > 40 ? -1 : 1;
      setTerrain(level, p.x + to, p.y, T.air);
      const before = { x: p.x, y: p.y };
      const t = texts(engine.step(state, { type: 'move', dir: to < 0 ? 'w' : 'e' }).events);
      const now = getPlayer(state).c.pos!;
      if (now.x === before.x && now.y === before.y) stayed++;
      else moved++;
      for (const l of t)
        if (/tumble in place|control your movements|thin air/.test(l)) lines.add(l);
    }
    expect(lines).toEqual(
      new Set([
        'You tumble in place.',
        "You can't control your movements very well.",
        "It's hard to walk in thin air.",
      ]),
    );
    expect(stayed).toBeGreaterThan(moved);
    expect(moved).toBeGreaterThan(0);
    const t = run(state, (ctx) => setIntrinsic(getPlayer(ctx.state), P.LEVITATION, true));
    expect(t).toEqual([]);
    for (let i = 0; i < 10; i++) {
      const p = getPlayer(state).c.pos!;
      setTerrain(level, p.x + 1, p.y, T.air);
      const x = p.x;
      expect(texts(engine.step(state, { type: 'move', dir: 'e' }).events).join(' ')).not.toMatch(
        /tumble|thin air|control your/,
      );
      expect(getPlayer(state).c.pos!.x).toBe(x + 1);
    }
    // coming down on Air: she begins to tumble
    const down = run(state, (ctx) => {
      setIntrinsic(getPlayer(ctx.state), P.LEVITATION, false);
      floatDown(ctx);
    });
    expect(down).toContain('You begin to tumble in place.');
  });

  test('Air: a storm strikes from the clouds; in a cloud she hides from the thunder', () => {
    const state = game(9);
    goPlane(state, 'air');
    pinAll(state);
    let rumbles = 0;
    let quiet = 0;
    for (let i = 0; i < 80; i++) {
      const t = run(state, (ctx) => {
        const p = getPlayer(ctx.state).c.pos!;
        setTerrain(getLevel(ctx.state), p.x, p.y, T.air);
        doStorms(ctx);
      });
      if (t.includes('You hear a rumbling noise.')) rumbles++;
      else quiet++;
    }
    // 1 time in 8
    expect(rumbles).toBeGreaterThan(2);
    expect(quiet).toBeGreaterThan(rumbles * 3);
    let kaboom: string[] = [];
    for (let i = 0; i < 80 && kaboom.length === 0; i++)
      kaboom = run(state, (ctx) => {
        const p = getPlayer(ctx.state).c.pos!;
        setTerrain(getLevel(ctx.state), p.x, p.y, T.cloud);
        doStorms(ctx);
      }).filter((l) => l.startsWith('Kaboom'));
    expect(kaboom).toEqual(['Kaboom!!!  Boom!!  Boom!!']);
    expect(getPlayer(state).c.helpless?.reasonKey).toBe('helpless.thunderstorm');
  });

  test('Water: stepping into the water she crawls back into a bubble, keeping her pack', () => {
    let crawled = 0;
    for (let seed = 40; seed < 46; seed++) {
      const state = game(seed);
      goPlane(state, 'water');
      pinAll(state);
      const level = getLevel(state);
      for (const m of monsOn(state, level)) delete state.entities[String(m.id)];
      const b: Bubble = { x: 30, y: 8, dx: 0, dy: 0, n: 1 };
      setBubbles(state, [b]);
      Object.assign(getPlayer(state).c.pos!, { x: 31, y: 9 });
      const pack = Object.values(state.entities).filter(
        (e) => e.c.item?.carriedBy === state.playerId,
      ).length;
      // (31, 10) is water below the 3x2 bubble at (30..32, 8..9)
      let t = texts(engine.step(state, { type: 'move', dir: 's' }).events);
      if (state.pendingPrompt)
        t = [
          ...t,
          ...texts(
            engine.step(state, {
              type: 'answer',
              promptId: state.pendingPrompt.prompt.id,
              value: true,
            }).events,
          ),
        ];
      if (!t.includes('You try to crawl out of the water.')) continue;
      crawled++;
      expect(t).toContain('Pheew!  That was close.');
      expect(t.join(' ')).not.toMatch(/dump some of your gear/);
      const p = getPlayer(state).c.pos!;
      expect(terrainIdAt(getLevel(state), p.x, p.y)).toBe(T.air);
      expect(
        Object.values(state.entities).filter((e) => e.c.item?.carriedBy === state.playerId).length,
      ).toBe(pack);
      expect(state.gameOver).toBeNull();
    }
    expect(crawled).toBeGreaterThan(0);
  });

  test('Water: breathing in the water, the turbulence turns her; out of it she pops into a bubble', () => {
    const state = game(50);
    goPlane(state, 'water');
    pinAll(state);
    const level = getLevel(state);
    for (const m of monsOn(state, level)) delete state.entities[String(m.id)];
    setBubbles(state, [{ x: 30, y: 8, dx: 0, dy: 0, n: 1 }]);
    run(state, (ctx) => setIntrinsic(getPlayer(ctx.state), P.MAGICAL_BREATHING, true));
    Object.assign(getPlayer(state).c.pos!, { x: 31, y: 9 });
    // into the water below: no drowning, no bottom to touch
    let t = texts(engine.step(state, { type: 'move', dir: 's' }).events);
    if (state.pendingPrompt)
      t = texts(
        engine.step(state, { type: 'answer', promptId: state.pendingPrompt.prompt.id, value: true })
          .events,
      );
    expect(t).toContain("But you aren't drowning.");
    expect(t.join(' ')).not.toMatch(/touch bottom/);
    expect(uinwater({ state })).toBe(true);
    // no bubble to come her way while she swims
    setBubbles(state, []);
    // swim east and west in the open water: now and then the turbulence turns her
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      const p = getPlayer(state).c.pos!;
      if (terrainIdAt(level, p.x, p.y) !== T.water) break;
      const dir = p.x > 40 ? 'w' : 'e';
      const tt = texts(engine.step(state, { type: 'move', dir }).events);
      lines.push(...tt.filter((l) => l === 'Water turbulence affects your movements.'));
      if (state.pendingPrompt) break;
    }
    expect(lines.length).toBeGreaterThan(0);
    // out of the water into a bubble
    expect(state.pendingPrompt).toBeNull();
    let out: string[] = [];
    for (let i = 0; i < 10 && uinwater({ state }); i++) {
      const q = getPlayer(state).c.pos!;
      setBubbles(state, [{ x: q.x + 1, y: q.y - 1, dx: 0, dy: 0, n: 1 }]);
      out = texts(engine.step(state, { type: 'move', dir: 'e' }).events);
    }
    expect(out).toContain('You pop into an air bubble.');
    expect(uinwater({ state })).toBe(false);
    setUinwater({ state }, false);
  });

  test('the portal rides its bubble and stays usable', () => {
    const state = game(60);
    goPlane(state, 'water');
    pinAll(state);
    const level = getLevel(state);
    for (let i = 0; i < 20; i++) engine.step(state, { type: 'search' });
    const portal = findPortal(level)!;
    expect(portal.def).toBe(MAGIC_PORTAL);
    expect(terrainIdAt(level, portal.x, portal.y)).toBe(T.air);
    expect(level.traps.filter((t) => t.def === MAGIC_PORTAL)).toHaveLength(1);
  });
});
