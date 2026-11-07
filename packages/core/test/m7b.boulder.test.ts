import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/engine';
import { cellRules } from '../src/movement';
import { itemsAt, sightBlockers, topObjectEntities, topObjects } from '../src/objects';
import { getLevel } from '../src/state';
import { computeVisible } from '../src/vision';
import type { GameState } from '../src/types/state';
import { RULES, asciiLevel, idx, litAll } from './helpers/asciiLevel';
import { actionsMod, terrainMod } from './helpers/fakeMods';
import { addItem, heroPos, objDef, objectsMod } from './helpers/objectMods';

const engine = createEngine([
  terrainMod(),
  actionsMod(),
  objectsMod((api) =>
    api.defineObject(objDef('boulder', { class: 'rock', weight: 6000, boulder: true })),
  ),
]);
const reg = engine.registry;
const fresh = (seed = 5): GameState => engine.newGame({ seed, width: 40, height: 15 }).state;

describe('computeVisible blocked cells (boulders)', () => {
  test('a blocked cell is seen but casts a shadow like a pillar', () => {
    const l = litAll(asciiLevel(['.......', '.......', '.......', '.......', '.......']));
    const open = computeVisible(l, RULES, { x: 1, y: 2 });
    expect(open).toContain(idx(l, 5, 2));
    const v = computeVisible(l, RULES, { x: 1, y: 2 }, [], new Set([idx(l, 3, 2)]));
    expect(v).toContain(idx(l, 3, 2));
    expect(v).not.toContain(idx(l, 5, 2));
    expect(v).toContain(idx(l, 5, 0));
  });

  test('a lit blocked cell at the end of a dark stretch is not seen (vision_recalc rule)', () => {
    // dark floor between the hero and a lit spot: the lit boulder cell needs a lit neighbour
    const l = asciiLevel(['.......'], ['.....LL']);
    expect(computeVisible(l, RULES, { x: 0, y: 0 })).toContain(idx(l, 5, 0));
    const v = computeVisible(l, RULES, { x: 0, y: 0 }, [], new Set([idx(l, 5, 0)]));
    expect(v).not.toContain(idx(l, 5, 0));
  });
});

/** The fresh level made into one lit room of floor; the hero at (5, 5). */
function openRoom(s: GameState) {
  const level = getLevel(s);
  const rules = cellRules(level, reg);
  const floor = level.cells.findIndex((c) => rules.passable[c] === true && !rules.intactDoor[c]);
  const f = level.cells[floor] ?? 0;
  for (let y = 1; y < level.height - 1; y++)
    for (let x = 1; x < level.width - 1; x++) level.cells[y * level.width + x] = f;
  level.lit = level.lit.map(() => 1);
  s.memory[level.id] = level.cells.map(() => -1);
  for (const id of Object.keys(s.entities)) if (Number(id) !== s.playerId) delete s.entities[id];
  const hp = s.entities[String(s.playerId)]?.c.pos;
  if (hp) Object.assign(hp, { x: 5, y: 5 });
  return level;
}

describe('boulders in the engine', () => {
  test('sightBlockers lists floor boulders only, and vision stops at them', () => {
    const s = fresh();
    const level = openRoom(s);
    addItem(s, 'ob:boulder', { pos: { x: 7, y: 5 } });
    addItem(s, 'ob:boulder', { carriedBy: s.playerId, letter: 'z' });
    addItem(s, 'ob:dagger', { pos: { x: 6, y: 7 } });
    expect([...sightBlockers(reg, s, level.id)]).toEqual([5 * level.width + 7]);
    engine.step(s, { type: 'wait' });
    expect(s.visible).toContain(5 * level.width + 7);
    expect(s.visible).not.toContain(5 * level.width + 9);
    expect(s.visible).toContain(7 * level.width + 9);
    // the cell behind is not remembered either
    expect(s.memory[level.id]?.[5 * level.width + 9]).toBe(-1);
  });

  test('a boulder lies on top of its pile, even under newer objects', () => {
    const s = fresh();
    const level = getLevel(s);
    const here = heroPos(s);
    const boulder = addItem(s, 'ob:boulder', { pos: here, placed: 1 });
    const dagger = addItem(s, 'ob:dagger', { pos: here, placed: 5 });
    const apple = addItem(s, 'ob:apple', { pos: here, placed: 3 });
    expect(itemsAt(reg, s, level.id, here.x, here.y).map((e) => e.id)).toEqual([
      boulder,
      dagger,
      apple,
    ]);
    const i = here.y * level.width + here.x;
    expect(topObjectEntities(reg, s, level).get(i)?.id).toBe(boulder);
    expect(topObjects(reg, s, level).get(i)).toBe('ob:boulder');
    // two boulders: the newer one is on top
    const second = addItem(s, 'ob:boulder', { pos: here, placed: 9 });
    expect(itemsAt(reg, s, level.id, here.x, here.y)[0]?.id).toBe(second);
    expect(topObjectEntities(reg, s, level).get(i)?.id).toBe(second);
  });
});
