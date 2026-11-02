import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { isJsonPlain } from '../src/hash';
import { cellRules } from '../src/movement';
import {
  allContents,
  contents,
  inventoryOf,
  itemsAt,
  putIn,
  takeOut,
  topObjects,
} from '../src/objects';
import { createQuery } from '../src/query';
import { loadMods } from '../src/registry';
import { parseSave, serializeSave } from '../src/save';
import { getLevel, getPlayer } from '../src/state';
import { buildSnapshot } from '../src/view';
import { MAX_LIGHT_RADIUS, computeVisible } from '../src/vision';
import type { Json } from '../src/types/common';
import type { Ctx, LightSource, Mod } from '../src/types/mod';
import type { GameState } from '../src/types/state';
import { RULES, asciiLevel, idx } from './helpers/asciiLevel';
import { actionsMod, terrainMod } from './helpers/fakeMods';
import { addItem, heroPos, objDef, objectsMod } from './helpers/objectMods';

/** Mod 'oc': a sack, a chest, a ring, a light perception and an 'oc:run' action with a real Ctx. */
const ctl: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const lightsOf = (s: Readonly<GameState>): LightSource[] =>
  ((s.modData['oc'] ?? []) as unknown as LightSource[]).map((l) => ({ ...l }));
const ocMod: Mod = {
  id: 'oc',
  version: '1.0.0',
  register(api) {
    api.defineObject(
      objDef('sack', { id: 'oc:sack', class: 'tool', container: { capacity: null, box: false } }),
    );
    api.defineObject(
      objDef('chest', { id: 'oc:chest', class: 'tool', container: { capacity: null, box: true } }),
    );
    api.defineObject(objDef('ring', { id: 'oc:ring', class: 'ring', prop: 'fire_res' }));
    api.definePerception({ id: 'oc:lamps', lights: (s) => lightsOf(s) });
    api.defineAction({
      id: 'oc:run',
      labelKey: 'a.run',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        ctl.fn(ctx);
        return 12;
      },
    });
  },
};
const engine = createEngine([terrainMod(), actionsMod(), objectsMod(), ocMod]);
const reg = engine.registry;
const fresh = (seed = 5): GameState => engine.newGame({ seed, width: 40, height: 15 }).state;
const run = (s: GameState, fn: (ctx: Ctx) => void): void => {
  ctl.fn = fn;
  engine.step(s, { type: 'mod', action: 'oc:run', args: null });
  ctl.fn = () => undefined;
};
/** A detached item: no pos, not carried, not contained. */
const loose = (s: GameState, def: string): number => addItem(s, def as `${string}:${string}`);

describe('containers', () => {
  test('putIn, contents (newest first) and takeOut', () => {
    const s = fresh();
    const sack = addItem(s, 'oc:sack', { pos: heroPos(s) });
    const a = loose(s, 'ob:dagger');
    const b = loose(s, 'ob:apple');
    putIn(reg, s, sack, a);
    putIn(reg, s, sack, b);
    expect(contents(s, sack).map((e) => e.id)).toEqual([b, a]);
    const ia = s.entities[String(a)]?.c.item;
    expect(ia?.containedIn).toBe(sack);
    expect(ia?.carriedBy).toBeNull();
    expect(s.entities[String(a)]?.c.pos).toBeUndefined();
    takeOut(s, a);
    expect(ia?.containedIn).toBeUndefined();
    expect(contents(s, sack).map((e) => e.id)).toEqual([b]);
    expect(isJsonPlain(s)).toBe(true);
  });

  test('putIn refuses non-containers, placed items and nesting loops', () => {
    const s = fresh();
    const sack = addItem(s, 'oc:sack', { pos: heroPos(s) });
    const dagger = loose(s, 'ob:dagger');
    expect(() => putIn(reg, s, dagger, sack)).toThrow(/not a container/);
    const onFloor = addItem(s, 'ob:apple', { pos: heroPos(s) });
    expect(() => putIn(reg, s, sack, onFloor)).toThrow(/not detached/);
    const carried = addItem(s, 'ob:apple', { carriedBy: s.playerId, letter: 'q' });
    expect(() => putIn(reg, s, sack, carried)).toThrow(/not detached/);
    expect(() => putIn(reg, s, sack, sack)).toThrow(/not detached/);
    const inner = loose(s, 'oc:sack');
    putIn(reg, s, sack, inner);
    expect(() => putIn(reg, s, sack, inner)).toThrow(/not detached/);
    // the outer sack, taken off the floor, cannot go into the sack it holds
    delete s.entities[String(sack)]?.c.pos;
    expect(() => putIn(reg, s, inner, sack)).toThrow(/contain itself/);
    expect(() => takeOut(s, dagger)).toThrow(/not in a container/);
  });

  test('floor piles, inventory, describe and the view ignore contained items', () => {
    const s = fresh();
    const here = heroPos(s);
    const level = getLevel(s);
    const chest = addItem(s, 'oc:chest', { pos: here, placed: 1 });
    const inChest = loose(s, 'ob:dagger');
    putIn(reg, s, chest, inChest); // newest `placed` of all, but not on the floor
    const sack = addItem(s, 'oc:sack', { carriedBy: s.playerId, letter: 'a' });
    const inSack = loose(s, 'ob:apple');
    putIn(reg, s, sack, inSack);
    expect(itemsAt(reg, s, level.id, here.x, here.y).map((e) => e.id)).toEqual([chest]);
    expect(topObjects(reg, s, level).get(here.y * level.width + here.x)).toBe('oc:chest');
    expect(inventoryOf(s, s.playerId).map((e) => e.id)).toEqual([sack]);
    const d = createQuery(reg, s).describe(here);
    expect(d.objects.map((o) => o.id)).toEqual([chest]);
    const snap = buildSnapshot(reg, s);
    expect(snap.inventory.map((i) => i.id)).toEqual([sack]);
    expect(snap.entities.some((e) => e.id === inChest || e.id === inSack)).toBe(false);
  });

  test('removing a container removes everything inside it, nested too', () => {
    const s = fresh();
    const outer = addItem(s, 'oc:chest', { pos: heroPos(s) });
    const inner = loose(s, 'oc:sack');
    const deep = loose(s, 'ob:dagger');
    const beside = loose(s, 'ob:apple');
    // the inner sack is filled first, so nesting is newer than the contents
    putIn(reg, s, inner, deep);
    putIn(reg, s, outer, inner);
    putIn(reg, s, outer, beside);
    const other = addItem(s, 'oc:sack', { pos: heroPos(s) });
    const kept = loose(s, 'ob:apple');
    putIn(reg, s, other, kept);
    expect(allContents(s, outer)).toEqual([inner, deep, beside].sort((a, b) => a - b));
    run(s, (ctx) => ctx.remove(outer));
    for (const id of [outer, inner, deep, beside]) expect(s.entities[String(id)]).toBeUndefined();
    expect(contents(s, other).map((e) => e.id)).toEqual([kept]);
  });

  test('new item fields survive a save round trip at version 6', () => {
    const s = fresh();
    const chest = addItem(s, 'oc:chest', { pos: heroPos(s) });
    const c = s.entities[String(chest)]?.c.item;
    if (!c) throw new Error('no chest');
    c.locked = true;
    c.erosion = { e1: 2, e2: 0 };
    c.erodeproof = true;
    const ring = loose(s, 'oc:ring');
    putIn(reg, s, chest, ring);
    const text = serializeSave(s, { seed: 5, width: 40, height: 15, mods: [], actions: [] });
    expect(JSON.parse(text).version).toBe(6);
    const back = parseSave(text, reg).state;
    expect(back.entities[String(chest)]?.c.item).toMatchObject({
      locked: true,
      erosion: { e1: 2, e2: 0 },
      erodeproof: true,
    });
    expect(back.entities[String(ring)]?.c.item?.containedIn).toBe(chest);
  });
});

describe('equip slots', () => {
  test('ring hands, amulet and blindfold are equip slots shown in the view', () => {
    const s = fresh();
    addItem(s, 'oc:ring', { carriedBy: s.playerId, letter: 'a', equipped: 'ringL' });
    addItem(s, 'oc:ring', { carriedBy: s.playerId, letter: 'b', equipped: 'ringR' });
    expect(buildSnapshot(reg, s).inventory.map((i) => [i.cls, i.equipped])).toEqual([
      ['ring', 'ringL'],
      ['ring', 'ringR'],
    ]);
  });
});

describe('light sources (ref: src/light.c do_light_sources)', () => {
  const ROOM = [
    '|||||||||||',
    '|.........|',
    '|.........|',
    '|.........|',
    '|.........|',
    '|||||||||||',
  ];

  test('a light at the hero lights a circle of what she can see in a dark room', () => {
    const l = asciiLevel(ROOM);
    const hero = { x: 5, y: 2 };
    expect(computeVisible(l, RULES, hero).length).toBe(9);
    const v = computeVisible(l, RULES, hero, [{ x: 5, y: 2, radius: 2 }]);
    // circle_data radius 2: half-widths 2, 2, 1 for rows 0, 1, 2 away
    expect(v).toContain(idx(l, 7, 3));
    expect(v).toContain(idx(l, 6, 4));
    expect(v).not.toContain(idx(l, 7, 4)); // the circle's corner
    expect(v).not.toContain(idx(l, 8, 2)); // out of range
    expect(v).toContain(idx(l, 5, 0)); // a wall whose neighbor toward the hero is lit
    expect(v).toEqual([...v].sort((a, b) => a - b));
  });

  test('a light elsewhere lights only what it can see; the hero still needs line of sight', () => {
    // a pillar at (5,2) between a lamp at (3,2) and the cell (7,2)
    const l = asciiLevel(ROOM);
    l.cells[idx(l, 5, 2)] = 1;
    const v = computeVisible(l, RULES, { x: 5, y: 4 }, [{ x: 3, y: 2, radius: 4 }]);
    expect(v).toContain(idx(l, 3, 2));
    expect(v).toContain(idx(l, 1, 1));
    expect(v).not.toContain(idx(l, 7, 2)); // in the pillar's shadow from the lamp
    expect(v).toContain(idx(l, 7, 4)); // lit by the lamp and seen by the hero
    // hero behind the pillar's shadow: the lit cell (3,2) is out of her sight from (7,2)
    const w = computeVisible(l, RULES, { x: 7, y: 2 }, [{ x: 3, y: 2, radius: 4 }]);
    expect(w).not.toContain(idx(l, 3, 2));
  });

  test('radius is clamped to 0..15 and bad lights are ignored', () => {
    const l = asciiLevel(ROOM);
    const dark = computeVisible(l, RULES, { x: 5, y: 2 });
    expect(computeVisible(l, RULES, { x: 5, y: 2 }, [{ x: 50, y: 2, radius: 3 }])).toEqual(dark);
    expect(computeVisible(l, RULES, { x: 5, y: 2 }, [{ x: 1, y: 1, radius: -4 }])).toEqual(
      [...dark, idx(l, 1, 1)].sort((a, b) => a - b),
    );
    expect(computeVisible(l, RULES, { x: 5, y: 2 }, [{ x: 1, y: 1, radius: NaN }])).toEqual(dark);
    const wide = asciiLevel(['.'.repeat(40)]);
    const v = computeVisible(wide, RULES, { x: 0, y: 0 }, [{ x: 0, y: 0, radius: 99 }]);
    expect(Math.max(...v)).toBe(MAX_LIGHT_RADIUS);
  });

  test('vision uses the lights on the current level from perception defs', () => {
    const s = fresh();
    const level = getLevel(s);
    level.lit = level.lit.map(() => 0);
    const here = heroPos(s);
    const lamp = { level: level.id, x: here.x, y: here.y, radius: 3 };
    s.modData['oc'] = [{ ...lamp, level: 'elsewhere' }] as unknown as Json;
    engine.step(s, { type: 'wait' });
    const rules = cellRules(level, reg);
    expect(s.visible).toEqual(computeVisible(level, rules, heroPos(s)));
    s.modData['oc'] = [lamp] as unknown as Json;
    engine.step(s, { type: 'wait' });
    expect(s.visible).toEqual(computeVisible(level, rules, heroPos(s), [lamp]));
    expect(getPlayer(s).c.pos).toMatchObject(here);
  });

  test('a perception def may define only lights', () => {
    const r = loadMods([
      {
        id: 'ok',
        version: '1',
        register: (api) => api.definePerception({ id: 'ok:l', lights: () => [] }),
      },
    ]);
    expect(r.perceptions.map((p) => p.id)).toEqual(['ok:l']);
  });
});
