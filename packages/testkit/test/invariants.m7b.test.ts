import { vanillaMod } from '@nh/content';
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  sortedIds,
  type Entity,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  boulderCells,
  boulderMoveErrors,
  boulderPushesSince,
  boulderSnapshot,
  checkInvariants,
} from '../src/index';

/** A test-local game mod that levelports the hero to Sokoban's entry level at new game. */
const sokobanStartMod: Mod = {
  id: 'test-sokoban-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const soko = ctx.state.dungeons.find((d) => d.id === 'nh:sokoban');
        if (soko?.levels) ctx.goToLevel({ dungeon: soko.id, dlevel: soko.levels }, 'branch');
      },
      { priority: -100 },
    );
  },
};

const engine = createEngine([vanillaMod, sokobanStartMod]);
const errs = (s: GameState): string => checkInvariants(s, engine.registry).join('\n');

/** A new game on Sokoban's entry level with no monster but the hero on it. */
function sokoban(): GameState {
  const s = engine.newGame({ seed: 1 }).state;
  for (const id of sortedIds(s)) {
    const e = s.entities[String(id)];
    if (e?.c.monster && id !== s.playerId && e.c.pos?.level === s.currentLevel)
      delete s.entities[String(id)];
  }
  return s;
}
const boulders = (s: GameState): Entity[] =>
  sortedIds(s)
    .map((id) => s.entities[String(id)] as Entity)
    .filter((e) => e.def === 'nh:boulder' && e.c.pos?.level === s.currentLevel);
const terrainAt = (lv: Level, x: number, y: number): string =>
  lv.palette[lv.cells[cellIndex(lv, x, y)] ?? -1] ?? '';
const floor = (s: GameState, lv: Level, x: number, y: number): boolean =>
  terrainAt(lv, x, y) === 'nh:floor' &&
  !lv.traps.some((t) => t.x === x && t.y === y) &&
  !boulders(s).some((b) => b.c.pos?.x === x && b.c.pos.y === y) &&
  !(getPlayer(s).c.pos?.x === x && getPlayer(s).c.pos?.y === y);
const putHero = (s: GameState, x: number, y: number): void => {
  const p = getPlayer(s).c.pos;
  if (p) getPlayer(s).c.pos = { level: p.level, x, y };
};

describe('boulder invariants', () => {
  test('Sokoban as built passes', () => {
    const s = sokoban();
    expect(getLevel(s).sokoban).toBe(true);
    expect(boulders(s).length).toBeGreaterThan(0);
    expect(errs(s)).toBe('');
  });

  test('a boulder in a wall', () => {
    const s = sokoban();
    const lv = getLevel(s);
    const b = boulders(s)[0];
    const at = b?.c.pos;
    if (!at) throw new Error('no boulder');
    lv.cells[cellIndex(lv, at.x, at.y)] = lv.palette.indexOf('nh:hwall');
    expect(lv.palette.indexOf('nh:hwall')).toBeGreaterThanOrEqual(0);
    expect(errs(s)).toMatch(/boulder \d+: on non-passable 'nh:hwall'/);
  });

  test('the sokoban flag only on a level built from a sokoban LevelDef', () => {
    const s = sokoban();
    const lv = getLevel(s);
    delete lv.sokoban; // solved: fine
    expect(errs(s)).toBe('');
    const other = Object.values(s.levels).find((l) => l.id !== lv.id);
    if (!other) throw new Error('no other level');
    other.sokoban = true;
    expect(errs(s)).toMatch(/level .*: sokoban flag on a level not built from a sokoban LevelDef/);
  });

  test('a monster that moves onto a boulder, not one a boulder lands on', () => {
    const s = sokoban();
    const b = boulders(s)[0]?.c.pos;
    if (!b) throw new Error('no boulder');
    const cells = boulderCells(s, engine.registry);
    const key = `${b.level}:${b.x},${b.y}`;
    expect(cells.has(key)).toBe(true);
    const hero = s.playerId;
    const pet = 1_000_000;
    s.entities[String(pet)] = { id: pet, def: 'nh:jackal', c: { monster: {} as never, pos: b } };
    // it walked there from elsewhere: an error; it was there already: none
    expect(boulderMoveErrors(s, engine.registry, new Map([[pet, 'x:0,0']]), cells)).toEqual([
      `monster ${pet} moved onto a boulder at ${key}`,
    ]);
    expect(boulderMoveErrors(s, engine.registry, new Map([[pet, key]]), cells)).toEqual([]);
    // the boulder arrived in the step (a scroll of earth): none; the hero squeezing on: none
    expect(boulderMoveErrors(s, engine.registry, new Map([[pet, 'x:0,0']]), new Set())).toEqual([]);
    expect(boulderMoveErrors(s, engine.registry, new Map([[hero, 'x:0,0']]), cells)).toEqual([]);
    // a pet swapping places with the hero squeezed onto the boulder: none
    expect(
      boulderMoveErrors(
        s,
        engine.registry,
        new Map([
          [hero, key],
          [pet, 'x:0,0'],
        ]),
        cells,
      ),
    ).toEqual([]);
  });
});

describe('the soak counts boulder pushes', () => {
  test('a boulder pushed one square, and one pushed into a pit', () => {
    const s = sokoban();
    const lv = getLevel(s);
    // a boulder with floor on both sides along a row: the hero west of it pushes it east
    const b = boulders(s).find((e) => {
      const p = e.c.pos;
      return p && floor(s, lv, p.x - 1, p.y) && floor(s, lv, p.x + 1, p.y);
    });
    const at = b?.c.pos;
    if (!b || !at) throw new Error('no pushable boulder');
    putHero(s, at.x - 1, at.y);
    let before = boulderSnapshot(s, engine.registry);
    engine.step(s, { type: 'move', dir: 'e' });
    expect(b.c.pos).toMatchObject({ x: at.x + 1, y: at.y });
    expect(boulderPushesSince(s, before)).toBe(1);

    // with the other boulders and the rolling boulder traps (which would roll it on) gone, a pit
    // with two floor squares beside it in a line: that boulder goes next to it and is pushed in
    for (const o of boulders(s)) if (o.id !== b.id) delete s.entities[String(o.id)];
    lv.traps = lv.traps.filter((t) => t.def !== 'nh:rolling_boulder_trap');
    b.c.pos = { level: lv.id, x: 0, y: 0 };
    const sides = [
      { dx: 1, dy: 0, push: 'w' },
      { dx: -1, dy: 0, push: 'e' },
      { dx: 0, dy: 1, push: 'n' },
      { dx: 0, dy: -1, push: 's' },
    ] as const;
    const side = (t: { x: number; y: number }) =>
      sides.find(
        ({ dx, dy }) =>
          floor(s, lv, t.x + dx, t.y + dy) && floor(s, lv, t.x + 2 * dx, t.y + 2 * dy),
      );
    const pit = lv.traps.find((t) => t.def === 'nh:pit' && side(t));
    const sd = pit && side(pit);
    if (!pit || !sd) throw new Error('no pit with room beside it');
    b.c.pos = { level: lv.id, x: pit.x + sd.dx, y: pit.y + sd.dy };
    putHero(s, pit.x + 2 * sd.dx, pit.y + 2 * sd.dy);
    const traps = lv.traps.length;
    before = boulderSnapshot(s, engine.registry);
    engine.step(s, { type: 'move', dir: sd.push });
    expect(s.entities[String(b.id)]).toBeUndefined();
    expect(lv.traps.length).toBe(traps - 1);
    expect(boulderPushesSince(s, before)).toBe(1);
    expect(errs(s)).toBe('');
  });
});
