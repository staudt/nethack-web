// Milestone 7c step 5: wallifyLevel(), the wall pass content runs after changing a built level.
import { describe, expect, test } from 'vitest';
import { buildLevel, VANILLA_TERRAIN, wallifyLevel } from '../src/index';
import { createRng, seedRng } from '../src/rng';
import type { Level } from '../src/types/level';
import type { LevelDef } from '../src/types/mod';
import type { DefId } from '../src/types/common';

const STONE: LevelDef = {
  id: 'wf:stone',
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
};

function stoneLevel(): Level {
  const opts = { id: 'wf', depth: 1, width: 30, height: 12, terrain: VANILLA_TERRAIN };
  return buildLevel(createRng(seedRng(1)), { ...opts, up: false, down: false }, STONE);
}
const set = (level: Level, x: number, y: number, id: DefId): void => {
  let p = level.palette.indexOf(id);
  if (p === -1) p = level.palette.push(id) - 1;
  level.cells[y * level.width + x] = p;
};
const at = (level: Level, x: number, y: number): string | undefined =>
  level.palette[level.cells[y * level.width + x] ?? -1];

describe('wallifyLevel', () => {
  test('stone around new floor becomes joined walls; a wall with only rock around goes', () => {
    const level = stoneLevel();
    for (let x = 5; x <= 7; x++) for (let y = 5; y <= 6; y++) set(level, x, y, 'nh:floor');
    set(level, 20, 9, 'nh:hwall'); // free-standing, surrounded by stone
    wallifyLevel(level, VANILLA_TERRAIN);
    expect(at(level, 4, 4)).toBe('nh:tlcorn');
    expect(at(level, 8, 4)).toBe('nh:trcorn');
    expect(at(level, 4, 7)).toBe('nh:blcorn');
    expect(at(level, 8, 7)).toBe('nh:brcorn');
    expect(at(level, 6, 4)).toBe('nh:hwall');
    expect(at(level, 6, 7)).toBe('nh:hwall');
    expect(at(level, 4, 5)).toBe('nh:vwall');
    expect(at(level, 8, 6)).toBe('nh:vwall');
    expect(at(level, 3, 5)).toBe('nh:stone');
    expect(at(level, 20, 9)).toBe('nh:stone');
  });

  test('only stone inside `area` is walled in', () => {
    const level = stoneLevel();
    set(level, 5, 5, 'nh:floor');
    wallifyLevel(level, VANILLA_TERRAIN, [5, 0, 29, 11]);
    expect(at(level, 6, 5)).toBe('nh:vwall');
    expect(at(level, 4, 5)).toBe('nh:stone');
  });
});
