// M7f-b step 1: the perception `hides` and `self` hooks and monster memory markers.
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { isMarker, setMonsterMark } from '../src/memory';
import { createQuery } from '../src/query';
import { ModLoadError, loadMods } from '../src/registry';
import { getLevel, getPlayer } from '../src/state';
import { buildSnapshot, diffSnapshot } from '../src/view';
import type { DefId, Json, Pos } from '../src/types/common';
import type { Mod, MonsterDef } from '../src/types/mod';
import type { GameState } from '../src/types/state';
import { actionsMod, terrainMod } from './helpers/fakeMods';
import { heroPos, objectsMod } from './helpers/objectMods';

const monDef = (name: string, ch: string): MonsterDef => ({
  id: `ph:${name}`,
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
  brain: 'ph:idle',
});

/** `invis`: entity ids that are invisible; `seeInvis`/`tele`: hero senses; `form`/`unseen`: self. */
type Flags = { invis?: number[]; tele?: boolean; form?: DefId; unseen?: boolean };
const flags = (s: Readonly<GameState>): Flags => (s.modData['ph'] ?? {}) as Flags;
const set = (s: GameState, f: Flags): void => void (s.modData['ph'] = f as Json);

const MARK: DefId = 'ph:remembered_unseen';

/** Mod 'ph': a test PerceptionDef switched by `modData.ph`, a marker appearance, an entity offer. */
const phMod: Mod = {
  id: 'ph',
  version: '1.0.0',
  register(api) {
    api.defineBrain({ id: 'ph:idle', act: () => undefined });
    api.defineMonster(monDef('mon', 'x'));
    api.defineMonster(monDef('form', 'D'));
    api.defineAppearance({
      id: MARK,
      nameKey: 'ph.unseen',
      class: 'rock',
      glyph: { ch: 'I', fg: '#fff' },
    });
    api.definePerception({
      id: 'ph:invis',
      hides: (s, _d, mon) => (flags(s).invis ?? []).includes(mon.id),
      senses: (s) => flags(s).tele === true,
      self: (s) => {
        const f = flags(s);
        if (f.form === undefined && !f.unseen) return null;
        return {
          ...(f.form !== undefined ? { g: f.form } : {}),
          ...(f.unseen ? { unseen: true } : {}),
        };
      },
    });
    api.defineAction({
      id: 'ph:poke',
      labelKey: 'a.poke',
      handles: 'mod',
      offer: (_ctx, t) =>
        t.kind === 'entity'
          ? [{ action: { type: 'mod', action: 'ph:poke' }, labelKey: 'a.poke' }]
          : [],
      perform: () => 0,
    });
  },
};

const engine = createEngine([terrainMod(), actionsMod(), objectsMod(), phMod]);
const fresh = (): GameState => engine.newGame({ seed: 5, width: 40, height: 15 }).state;
const WAIT = { type: 'wait' } as const;
const idx = (s: GameState, p: Pos): number => p.y * getLevel(s).width + p.x;
const mem = (s: GameState, p: Pos): DefId | undefined =>
  s.monsterMemory[s.currentLevel]?.[String(idx(s, p))];
const view = (s: GameState) => buildSnapshot(engine.registry, s);
const query = (s: GameState) => createQuery(engine.registry, s);

function addMonster(s: GameState, p: Pos, def: DefId = 'ph:mon'): number {
  const id = s.nextEntityId++;
  s.entities[String(id)] = {
    id,
    def,
    c: {
      pos: { level: s.currentLevel, x: p.x, y: p.y },
      monster: { level: 1, peaceful: false, asleep: true, lastHero: null },
    },
  };
  return id;
}

/** A cell next to the hero (always in view for a hero who is not blind). */
function nextToHero(s: GameState): Pos {
  const p = heroPos(s);
  const level = getLevel(s);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const q = { x: p.x + dx, y: p.y + dy };
    if (
      q.x >= 0 &&
      q.y >= 0 &&
      q.x < level.width &&
      q.y < level.height &&
      s.visible.includes(idx(s, q))
    )
      return q;
  }
  throw new Error('no visible neighbour');
}

describe('perception: hides', () => {
  test('a hidden monster on a visible cell is not shown, described, offered or remembered', () => {
    const s = fresh();
    const p = nextToHero(s);
    const id = addMonster(s, p);
    engine.step(s, WAIT);
    expect(mem(s, p)).toBe('ph:mon');
    expect(query(s).actionsFor({ kind: 'entity', id })).toHaveLength(1);

    set(s, { invis: [id] });
    engine.step(s, WAIT);
    expect(s.visible).toContain(idx(s, p));
    expect(view(s).entities.some((e) => e.id === id)).toBe(false);
    expect(view(s).cells[idx(s, p)]?.m).toBeUndefined();
    expect(query(s).describe(p).entities).toEqual([]);
    expect(query(s).actionsFor({ kind: 'entity', id })).toEqual([]);
    // its cell counts as empty: the remembered glyph is gone
    expect(mem(s, p)).toBeUndefined();
  });

  test('senses override hides: a sensed invisible monster is shown and remembered', () => {
    const s = fresh();
    const p = nextToHero(s);
    const id = addMonster(s, p);
    set(s, { invis: [id], tele: true });
    engine.step(s, WAIT);
    expect(view(s).entities.find((e) => e.id === id)).toMatchObject({ x: p.x, y: p.y });
    expect(query(s).describe(p).entities).toEqual([{ id, def: 'ph:mon' }]);
    expect(query(s).actionsFor({ kind: 'entity', id })).toHaveLength(1);
    expect(mem(s, p)).toBe('ph:mon');
  });

  test('a monster out of view and not sensed gets no offers', () => {
    const s = fresh();
    const level = getLevel(s);
    let far: Pos | null = null;
    for (const r of level.rooms)
      for (let y = r.ly; y <= r.hy && !far; y++)
        for (let x = r.lx; x <= r.hx && !far; x++)
          if (!s.visible.includes(idx(s, { x, y }))) far = { x, y };
    if (!far) throw new Error('no hidden floor');
    const id = addMonster(s, far);
    expect(query(s).actionsFor({ kind: 'entity', id })).toEqual([]);
    set(s, { tele: true });
    expect(query(s).actionsFor({ kind: 'entity', id })).toHaveLength(1);
  });
});

describe('monster memory markers', () => {
  test('isMarker: any id that is not a MonsterDef id', () => {
    expect(isMarker(engine.registry, MARK)).toBe(true);
    expect(isMarker(engine.registry, 'ph:mon')).toBe(false);
  });

  test('a marker stays on a visible empty cell and shows as ViewCell.m there', () => {
    const s = fresh();
    const p = nextToHero(s);
    const before = view(s);
    setMonsterMark(s, s.currentLevel, p, MARK);
    engine.step(s, WAIT);
    expect(mem(s, p)).toBe(MARK);
    const v = view(s);
    expect(v.cells[idx(s, p)]).toMatchObject({ v: true, m: MARK });
    expect(v.legend[MARK]?.ch).toBe('I');
    const d = diffSnapshot(before, v);
    expect(d.kind === 'delta' && d.cells.some(([i]) => i === idx(s, p))).toBe(true);
    setMonsterMark(s, s.currentLevel, p, null);
    expect(mem(s, p)).toBeUndefined();
    engine.step(s, WAIT);
    expect(view(s).cells[idx(s, p)]?.m).toBeUndefined();
  });

  test('a hidden monster keeps the marker; once seen it replaces it', () => {
    const s = fresh();
    const p = nextToHero(s);
    const id = addMonster(s, p);
    set(s, { invis: [id] });
    setMonsterMark(s, s.currentLevel, p, MARK);
    engine.step(s, WAIT);
    expect(mem(s, p)).toBe(MARK);
    expect(view(s).cells[idx(s, p)]?.m).toBe(MARK);
    set(s, {});
    engine.step(s, WAIT);
    expect(mem(s, p)).toBe('ph:mon');
    const v = view(s);
    expect(v.cells[idx(s, p)]?.m).toBeUndefined(); // the live monster is an entity
    expect(v.entities.some((e) => e.id === id)).toBe(true);
  });

  test('a remembered monster (not a marker) is still cleared on a visible empty cell', () => {
    const s = fresh();
    const p = nextToHero(s);
    setMonsterMark(s, s.currentLevel, p, 'ph:mon');
    engine.step(s, WAIT);
    expect(mem(s, p)).toBeUndefined();
  });

  test("the hero's own cell never keeps a marker", () => {
    const s = fresh();
    const p = heroPos(s);
    setMonsterMark(s, s.currentLevel, p, MARK);
    engine.step(s, WAIT);
    expect(mem(s, p)).toBeUndefined();
  });

  test('a marker out of view is kept and shown, like a remembered monster', () => {
    const s = fresh();
    const level = getLevel(s);
    const i = level.width * level.height - 1;
    const p = { x: i % level.width, y: Math.floor(i / level.width) };
    expect(s.visible).not.toContain(i);
    setMonsterMark(s, s.currentLevel, p, MARK);
    engine.step(s, WAIT);
    expect(mem(s, p)).toBe(MARK);
  });

  test('setMonsterMark checks the level and the bounds', () => {
    const s = fresh();
    expect(() => setMonsterMark(s, 'nope', { x: 0, y: 0 }, MARK)).toThrow(/unknown level/);
    expect(() => setMonsterMark(s, s.currentLevel, { x: -1, y: 0 }, MARK)).toThrow(/bounds/);
  });
});

describe('perception: self', () => {
  test('the hero is drawn as her role, with no unseen flag, when no def answers', () => {
    const s = fresh();
    const hero = view(s).entities.find((e) => e.id === s.playerId);
    expect(hero?.g).toBe(getPlayer(s).def);
    expect(hero).not.toHaveProperty('unseen');
  });

  test('self sets her glyph (view and describe) and marks her unseen', () => {
    const s = fresh();
    set(s, { form: 'ph:form', unseen: true });
    const hero = view(s).entities.find((e) => e.id === s.playerId);
    expect(hero).toMatchObject({ g: 'ph:form', unseen: true });
    expect(query(s).describe(heroPos(s)).entities).toEqual([{ id: s.playerId, def: 'ph:form' }]);
    set(s, { unseen: true });
    expect(view(s).entities.find((e) => e.id === s.playerId)).toMatchObject({
      g: getPlayer(s).def,
      unseen: true,
    });
  });
});

describe('definePerception: hides and self', () => {
  const load = (d: object) =>
    loadMods([{ id: 'bad', version: '1', register: (api) => api.definePerception(d as never) }]);
  test('either alone is a valid def; non-functions are rejected', () => {
    expect(() => load({ id: 'bad:h', hides: () => false })).not.toThrow();
    expect(() => load({ id: 'bad:s', self: () => null })).not.toThrow();
    expect(() => load({ id: 'bad:p', hides: true })).toThrow(ModLoadError);
    expect(() => load({ id: 'bad:p', self: 1 })).toThrow(/self: must be a function/);
  });
});
