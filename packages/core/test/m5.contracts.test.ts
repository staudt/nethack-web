import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { createQuery } from '../src/query';
import { ModLoadError, loadMods } from '../src/registry';
import { getLevel, getPlayer } from '../src/state';
import { buildSnapshot } from '../src/view';
import type { Json } from '../src/types/common';
import type { LevelChange, Mod, MonsterDef } from '../src/types/mod';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';
import { addItem, heroPos, objectsMod } from './helpers/objectMods';

const monDef = (name: string, ch: string): MonsterDef => ({
  id: `pc:${name}`,
  nameKey: `mon.${name}`,
  glyph: { ch, fg: '#f00' },
  level: 1,
  speed: 12,
  ac: 7,
  mr: 0,
  alignment: 0,
  attacks: [],
  size: 'small',
  flags: [],
  frequency: 1,
  group: null,
  genFlags: [],
  difficulty: 1,
  resists: [],
  conveys: [],
  weight: 100,
  nutrition: 100,
  brain: 'pc:idle',
});

type Flags = { blind?: boolean; tele?: boolean; hallu?: boolean };
const flags = (s: Readonly<GameState>): Flags => (s.modData['pc'] ?? {}) as Flags;

/** Mod 'pc': perception switched by `modData.pc` flags, and a 'pc:down' action. */
const pcMod = (changes: LevelChange[] = []): Mod => ({
  id: 'pc',
  version: '1.0.0',
  register(api) {
    api.defineBrain({ id: 'pc:idle', act: () => undefined });
    api.defineMonster(monDef('mon', 'x'));
    api.defineMonster(monDef('other', 'y'));
    api.definePerception({
      id: 'pc:senses',
      blind: (s) => flags(s).blind === true,
      senses: (s) => flags(s).tele === true,
      shownAs: (s, defs, e) =>
        flags(s).hallu ? (defs.isMonster(e.def) ? 'pc:other' : 'ob:apple') : null,
    });
    api.defineAction({
      id: 'pc:down',
      labelKey: 'a.down',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        ctx.goToLevel(2, 'up');
        return 12;
      },
    });
    api.on('levelChange', (_ctx, c) => void changes.push(c));
  },
});

const mk = (changes?: LevelChange[]) =>
  createEngine([terrainMod(), actionsMod(), objectsMod(), pcMod(changes)]);
const engine = mk();
const fresh = (e = engine): GameState => e.newGame({ seed: 5, width: 40, height: 15 }).state;
const WAIT = { type: 'wait' } as const;
const at = (s: GameState, p: { x: number; y: number }): number => p.y * getLevel(s).width + p.x;
const set = (s: GameState, f: Flags): void => void (s.modData['pc'] = f as Json);

function addMonster(s: GameState, p: { x: number; y: number }, tame?: number): number {
  const id = s.nextEntityId++;
  s.entities[String(id)] = {
    id,
    def: 'pc:mon',
    c: {
      pos: { level: s.currentLevel, x: p.x, y: p.y },
      monster: {
        level: 1,
        peaceful: tame !== undefined,
        asleep: true,
        lastHero: null,
        ...(tame !== undefined ? { tame } : {}),
      },
    },
  };
  return id;
}

/** A floor cell the hero cannot see now. */
function hiddenFloor(s: GameState): { x: number; y: number } {
  const level = getLevel(s);
  for (const r of level.rooms)
    for (let y = r.ly; y <= r.hy; y++)
      for (let x = r.lx; x <= r.hx; x++) if (!s.visible.includes(at(s, { x, y }))) return { x, y };
  throw new Error('no hidden floor');
}

describe('perception: blindness', () => {
  test('a blind hero sees no cell and remembers nothing new, but is still drawn', () => {
    const s = fresh();
    set(s, { blind: true });
    const before = [...(s.memory[s.currentLevel] ?? [])];
    engine.step(s, WAIT);
    expect(s.visible).toEqual([]);
    expect(s.memory[s.currentLevel]).toEqual(before);
    const v = buildSnapshot(engine.registry, s);
    expect(v.cells.every((c) => !c.v)).toBe(true);
    expect(v.entities.map((e) => e.id)).toEqual([s.playerId]);
  });

  test('a monster next to a blind hero is not shown unless sensed', () => {
    const s = fresh();
    const p = heroPos(s);
    const id = addMonster(s, { x: p.x, y: p.y });
    set(s, { blind: true });
    engine.step(s, WAIT);
    expect(buildSnapshot(engine.registry, s).entities.some((e) => e.id === id)).toBe(false);
    set(s, { blind: true, tele: true });
    expect(buildSnapshot(engine.registry, s).entities.some((e) => e.id === id)).toBe(true);
  });
});

describe('perception: senses', () => {
  test('a sensed monster out of sight is in the view and in describe()', () => {
    const s = fresh();
    const p = hiddenFloor(s);
    const id = addMonster(s, p);
    expect(buildSnapshot(engine.registry, s).entities.some((e) => e.id === id)).toBe(false);
    expect(createQuery(engine.registry, s).describe(p).entities).toEqual([]);
    set(s, { tele: true });
    const v = buildSnapshot(engine.registry, s);
    expect(v.entities.find((e) => e.id === id)).toMatchObject({ x: p.x, y: p.y, g: 'pc:mon' });
    expect(createQuery(engine.registry, s).describe(p).entities).toEqual([{ id, def: 'pc:mon' }]);
  });
});

describe('perception: shownAs', () => {
  test('creatures and live floor objects are disguised; the hero and memory are not', () => {
    const s = fresh();
    const p = heroPos(s);
    const id = addMonster(s, p);
    addItem(s, 'ob:dagger', { pos: p });
    engine.step(s, WAIT);
    set(s, { hallu: true });
    const v = buildSnapshot(engine.registry, s);
    expect(v.entities.find((e) => e.id === id)?.g).toBe('pc:other');
    expect(v.entities.find((e) => e.id === s.playerId)?.g).toBe(getPlayer(s).def);
    expect(v.cells[at(s, p)]?.o).toBe('ob:apple');
    expect(s.objectMemory[s.currentLevel]?.[String(at(s, p))]).toBe('ob:dagger');
    const d = createQuery(engine.registry, s).describe(p);
    expect(d.entities.find((e) => e.id === id)?.def).toBe('pc:other');
    expect(d.objects[0]?.def).toBe('ob:apple');
  });
});

describe('tame monsters', () => {
  test('a tame monster is flagged in the view; others are not', () => {
    const s = fresh();
    const p = heroPos(s);
    const pet = addMonster(s, p, 10);
    const wild = addMonster(s, p);
    engine.step(s, WAIT);
    const v = buildSnapshot(engine.registry, s);
    expect(v.entities.find((e) => e.id === pet)?.tame).toBe(true);
    expect(v.entities.find((e) => e.id === wild)).not.toHaveProperty('tame');
  });
});

describe('levelChange hook', () => {
  test('runs at new game (from null) and after goToLevel with where the hero came from', () => {
    const changes: LevelChange[] = [];
    const e = mk(changes);
    const s = fresh(e);
    const from = heroPos(s);
    e.step(s, { type: 'mod', action: 'pc:down' });
    expect(changes).toEqual([
      { from: null, fromPos: null, to: 'dlvl1' },
      { from: 'dlvl1', fromPos: from, to: 'dlvl2' },
    ]);
    expect(s.currentLevel).toBe('dlvl2');
  });
});

describe('definePerception validation', () => {
  const load = (d: object) =>
    loadMods([
      {
        id: 'bad',
        version: '1',
        register: (api) => api.definePerception(d as never),
      },
    ]);

  test('needs at least one function', () => {
    expect(() => load({ id: 'bad:p' })).toThrow(ModLoadError);
  });

  test('its parts must be functions', () => {
    expect(() => load({ id: 'bad:p', blind: true })).toThrow(/blind: must be a function/);
  });

  test('a valid def is listed in registration order', () => {
    const r = loadMods([
      {
        id: 'ok',
        version: '1',
        register(api) {
          api.definePerception({ id: 'ok:a', blind: () => false });
          api.definePerception({ id: 'ok:b', senses: () => false });
        },
      },
    ]);
    expect(r.perceptions.map((p) => p.id)).toEqual(['ok:a', 'ok:b']);
  });
});
