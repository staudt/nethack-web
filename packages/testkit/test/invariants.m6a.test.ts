import { vanillaMod } from '@nh/content';
import { createEngine, getLevel, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { branchStartMod, checkInvariants } from '../src/index';

// branchStartMod puts the hero on the main dungeon's Mines staircase at new game
const engine = createEngine([vanillaMod, branchStartMod]);
const fresh = (): GameState => engine.newGame({ seed: 3 }).state;
const errs = (s: GameState): string => checkInvariants(s, engine.registry).join('\n');

describe('stairs and branch invariants', () => {
  test('a game started on the branch stairs passes', () => {
    const s = fresh();
    expect(getLevel(s).branch?.dir).toBe('down');
    expect(errs(s)).toBe('');
  });

  test('stairs walled off from the others', () => {
    const s = fresh();
    const lv = getLevel(s);
    const down = lv.down;
    if (!down) throw new Error('no down stairs');
    const wall = lv.palette.indexOf('nh:stone');
    expect(wall).toBeGreaterThanOrEqual(0);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = down.x + dx;
        const y = down.y + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < lv.width && y < lv.height)
          lv.cells[y * lv.width + x] = wall;
      }
    s.entities = Object.fromEntries(
      Object.entries(s.entities).filter(([, e]) => !e.c.pos || e.id === s.playerId),
    );
    lv.traps = [];
    expect(errs(s)).toMatch(/stairs at .* unreachable/);
  });

  test('the layout level without its branch stairs, or a branch the layout lacks', () => {
    const s = fresh();
    const lv = getLevel(s);
    const b = lv.branch;
    lv.branch = null;
    expect(errs(s)).toMatch(/branch stairs are missing/);
    lv.branch = b;
    lv.dlevel += 1; // as if on the level below
    expect(errs(s)).toMatch(/not in the layout/);
  });

  test('branch stairs on terrain that does not go their way', () => {
    const s = fresh();
    const lv = getLevel(s);
    if (lv.branch) lv.branch.dir = 'up';
    expect(errs(s)).toMatch(/branch stairs up .* are on 'nh:stairs_down'/);
  });
});

describe('special level invariants', () => {
  test('the layout places Minetown once, in its range', () => {
    const s = fresh();
    expect(errs(s)).toBe('');
    const mines = s.dungeons.find((d) => d.id === 'nh:mines');
    if (!mines) throw new Error('no Mines');
    const town = mines.special[0];
    if (!town) throw new Error('no Minetown');
    mines.special.push({ ...town });
    expect(errs(s)).toMatch(/'nh:minetown' placed twice/);
    mines.special = [{ ...town, dlevel: 7 }];
    expect(errs(s)).toMatch(/'nh:minetown' on 7, outside 3\.\.4/);
    mines.special = [];
    expect(errs(s)).toMatch(/'nh:minetown' is missing from the layout/);
  });

  test('a generated special level is one of its variants and a town', () => {
    const s = fresh();
    const mines = s.dungeons.find((d) => d.id === 'nh:mines');
    const at = mines?.special[0];
    if (!at) throw new Error('no Minetown');
    // the current (main dungeon) level, relabelled as if it were the Minetown spot
    const lv = getLevel(s);
    lv.dungeon = 'nh:mines';
    lv.dlevel = at.dlevel;
    expect(errs(s)).toMatch(/is not a variant of 'nh:minetown'/);
    lv.def = 'nh:minetn-2';
    expect(errs(s)).toMatch(/town is undefined on 'nh:minetown'/);
    lv.town = true;
    expect(errs(s)).not.toMatch(/minetown/);
    lv.dlevel = at.dlevel === 3 ? 4 : 3;
    expect(errs(s)).toMatch(/built from special variant 'nh:minetn-2' off the layout's place/);
  });
});
