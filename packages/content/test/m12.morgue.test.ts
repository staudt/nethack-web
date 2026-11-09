// m12 step 4: morgues (fill_zoo()'s MORGUE case, morguemon(), the entry message) and ghosts
// (passing walls in mfndpos(), rndghostname()).
import {
  cellRules,
  createEngine,
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  MORGUE,
  WIZ_MKROOM,
  fillZoo,
  mksobj,
  mfndpos,
  morguemon,
  rndghostname,
  vanillaMod,
  wizardMod,
} from '../src/index';
import { T, setTerrain } from '../src/terrain';
import { addMon, posOf, setup } from './helpers';
import { ctxFor, defs, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ph',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ph:run',
      labelKey: 'ph',
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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function withCtx(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'ph:run' }).events);
}
const all = (state: GameState): Entity[] =>
  sortedIds(state).map((id) => state.entities[String(id)]!);

// A walled room, floor x 2..8, y 2..6, a doorway in its east wall at 9,4; the hero outside it at
// 10,4. fill_zoo() leaves out the door's side (x 8).
const MAP = [
  '            ',
  ' .........  ',
  ' .........  ',
  ' .......... ',
  ' .......... ',
  ' .........  ',
  ' .........  ',
  ' .........  ',
  '            ',
];
function walledRoom(seed: number, depth: number): { state: GameState; level: Level } {
  const s = levelSetup(MAP, seed);
  const level = getLevel(s.state);
  level.depth = depth;
  for (let x = 1; x <= 9; x++) {
    setTerrain(level, x, 1, T.hwall);
    setTerrain(level, x, 7, T.hwall);
  }
  for (let y = 1; y <= 7; y++) {
    setTerrain(level, 1, y, T.vwall);
    setTerrain(level, 9, y, T.vwall);
  }
  setTerrain(level, 9, 4, T.doorway);
  level.rooms.push({ lx: 2, ly: 2, hx: 8, hy: 6, lit: true });
  getPlayer(s.state).c.pos = { level: level.id, x: 10, y: 4 };
  return { state: s.state, level };
}
const SQUARES = 6 * 5; // x 2..7, y 2..6

const isUndead = (def: DefId): boolean =>
  def === 'nh:ghost' || def === 'nh:wraith' || defs.monster(def).glyph.ch === 'Z';

describe('fill_zoo() MORGUE', () => {
  test('sleeping ghosts, wraiths and zombies; human corpses about 1 in 5, boxes about 1 in 10', () => {
    const count: Record<string, number> = {};
    let corpses = 0;
    let boxes = 0;
    let mons = 0;
    const seeds = 8;
    for (let seed = 1; seed <= seeds; seed++) {
      // depth 9: rn2(9) never reaches the demon or vampire branches
      const { state, level } = walledRoom(seed, 9);
      level.rooms[0]!.type = MORGUE;
      withCtx(state, (ctx) => fillZoo(ctx, level, 0));
      const ents = all(state);
      const ms = ents.filter((e) => e.c.monster && e.id !== state.playerId);
      expect(ms).toHaveLength(SQUARES);
      for (const m of ms) {
        expect(isUndead(m.def)).toBe(true);
        expect(m.c.monster!.asleep).toBe(true);
        expect(m.c.pos!.x).toBeLessThan(8); // not on the door's side
        const k = m.def === 'nh:ghost' || m.def === 'nh:wraith' ? m.def : 'Z';
        count[k] = (count[k] ?? 0) + 1;
      }
      mons += ms.length;
      for (const c of ents.filter((e) => e.def === 'nh:corpse' && e.c.pos)) {
        corpses++;
        expect(c.c.item!.corpseOf).toBe('nh:human');
      }
      boxes += ents.filter(
        (e) => (e.def === 'nh:large_box' || e.def === 'nh:chest') && e.c.pos,
      ).length;
    }
    // ghosts i < 20, wraiths 20 <= i < 40, zombies the rest
    expect(count['nh:ghost']! / mons).toBeGreaterThan(0.1);
    expect(count['nh:ghost']! / mons).toBeLessThan(0.3);
    expect(count['nh:wraith']! / mons).toBeGreaterThan(0.1);
    expect(count['nh:wraith']! / mons).toBeLessThan(0.3);
    expect(count['Z']! / mons).toBeGreaterThan(0.45);
    expect(corpses / mons).toBeGreaterThan(0.1);
    expect(corpses / mons).toBeLessThan(0.3);
    expect(boxes).toBeGreaterThan(0);
    expect(boxes / mons).toBeLessThan(0.2);
  });
});

describe('morguemon()', () => {
  function sample(depth: number, n: number): Record<string, number> {
    const { state } = walledRoom(1, depth);
    const out: Record<string, number> = {};
    withCtx(state, (ctx) => {
      for (let i = 0; i < n; i++) {
        const m = morguemon(ctx, depth);
        const k = m === null ? 'null' : m.glyph.ch === 'Z' ? 'Z' : m.id;
        out[k] = (out[k] ?? 0) + 1;
      }
    });
    return out;
  }

  test('below difficulty 10 always a ghost, a wraith or a zombie', () => {
    const s = sample(9, 2000);
    expect(Object.keys(s).sort()).toEqual(['Z', 'nh:ghost', 'nh:wraith']);
  });

  test('deeper, the vampire branch (hd > 8, i > 85) finds no vampire; the demon branch falls to ghosts', () => {
    const n = 4000;
    const s = sample(30, n);
    expect(Object.keys(s).sort()).toEqual(['Z', 'nh:ghost', 'nh:wraith', 'null']);
    // P(hd > 8) = 21/30, P(i > 85) = 14/100: about 1 in 10 makes a random monster instead
    expect(s['null']! / n).toBeGreaterThan(0.07);
    expect(s['null']! / n).toBeLessThan(0.13);
    // no minor demon can be made (the water demon is G_NOGEN): i < 10 stays a ghost (i < 20)
    expect(s['nh:ghost']! / n).toBeGreaterThan(0.17);
    expect(s['nh:ghost']! / n).toBeLessThan(0.23);
  });
});

describe('entering a morgue', () => {
  test('"You have an uncanny feeling..."; it becomes an ordinary room', () => {
    const { state, level } = walledRoom(3, 12);
    level.rooms[0]!.type = MORGUE;
    const west = { type: 'move', dir: 'w' } as const;
    const t = [
      ...texts(engine.step(state, west).events),
      ...texts(engine.step(state, west).events),
    ];
    expect(t).toContain('You have an uncanny feeling...');
    expect(level.rooms[0]!.type).toBeUndefined();
  });

  test('wiz:mkroom offers and makes a morgue', () => {
    const { state, level } = walledRoom(5, 12);
    getPlayer(state).c.pos = { level: level.id, x: 3, y: 3 };
    wiz.step(state, { type: 'mod', action: WIZ_MKROOM as DefId });
    const p = state.pendingPrompt?.prompt;
    const values = p?.kind === 'menu' ? (p.options ?? []).map((o) => o.value) : [];
    expect(values).toContain(MORGUE);
    wiz.step(state, { type: 'answer', promptId: p!.id, value: MORGUE });
    expect(level.rooms[0]!.type).toBe(MORGUE);
    expect(all(state).filter((e) => e.c.monster && e.id !== state.playerId).length).toBeGreaterThan(
      0,
    );
  });
});

describe('ghosts', () => {
  // a closed room: walls all round, the hero inside, stone outside
  const ROOM = [
    '         ',
    ' -----   ',
    ' |...|   ',
    ' |.@.|   ',
    ' |...|   ',
    ' -----   ',
    '         ',
  ];
  const key = (c: { x: number; y: number }): string => `${c.x},${c.y}`;

  test('mfndpos(): a ghost may enter stone, walls and locked doors; a wraith may not', () => {
    const s = setup(ROOM);
    setTerrain(s.level, 5, 3, T.door_locked); // (diagonals into a door stay closed)
    const g = addMon(s.state, 'nh:ghost', 6, 3);
    const w = addMon(s.state, 'nh:wraith', 7, 6);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    const rules = cellRules(s.level, defs);
    const hero = posOf(s.state, s.state.playerId);
    expect(mfndpos(ctx, s.level, rules, g, hero).map(key).sort()).toEqual(
      ['5,2', '5,3', '5,4', '6,2', '6,4', '7,2', '7,3', '7,4'].sort(),
    );
    expect(mfndpos(ctx, s.level, rules, w, hero)).toHaveLength(0);
  });

  test("not through Sokoban's walls (non-passwall), but onto its boulders", () => {
    const s = setup(['.......', '.-----.', '.|.@.|.', '.-----.', '.......']);
    s.level.def = 'nh:soko1-1' as DefId;
    const g = addMon(s.state, 'nh:ghost', 0, 2);
    const ctx = ctxFor(s.state);
    mksobj(ctx, defs.object('nh:boulder'), { at: { level: s.level.id, x: 0, y: 3 } });
    const hero = posOf(s.state, s.state.playerId);
    const cg = mfndpos(ctx as unknown as Ctx, s.level, cellRules(s.level, defs), g, hero);
    expect(cg.map(key).sort()).toEqual(['0,1', '0,3']);
  });

  test('a ghost drifts into the wall of a closed room and out of it to reach the hero', () => {
    const s = setup(ROOM);
    const g = addMon(s.state, 'nh:ghost', 7, 3);
    const path: string[] = [];
    for (let i = 0; i < 40 && path.at(-1) !== 'floor'; i++) {
      s.wait();
      const p = posOf(s.state, g);
      const t = s.level.palette[s.level.cells[p.y * s.level.width + p.x]!];
      const kind = t === T.vwall || t === T.hwall ? 'wall' : t === T.floor ? 'floor' : 'stone';
      if (path.at(-1) !== kind) path.push(kind);
    }
    expect(path).toEqual(['stone', 'wall', 'floor']);
    // nothing was opened or broken on the way
    for (let y = 1; y <= 5; y++)
      for (const x of [1, 5])
        expect(s.level.palette[s.level.cells[y * s.level.width + x]!]).not.toBe(T.floor);
  });

  test("a ghost's name: one of the ghost names six times in seven, else the hero's", () => {
    const { state } = walledRoom(1, 12);
    let hero = 0;
    const names = new Set<string>();
    withCtx(state, (ctx) => {
      for (let i = 0; i < 700; i++) {
        const n = rndghostname(ctx);
        if (n === null) hero++;
        else names.add(n);
      }
    });
    expect(hero).toBeGreaterThan(60);
    expect(hero).toBeLessThan(150);
    expect(names.has('Adri') && names.has('Murphy')).toBe(true);
  });
});
