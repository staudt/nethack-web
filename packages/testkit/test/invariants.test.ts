import { vanillaMod } from '@nh/content';
import { createEngine, getLevel, getPlayer, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const engine = createEngine([vanillaMod]);
const fresh = (): GameState => {
  const { state } = engine.newGame({ seed: 5 });
  engine.step(state, { type: 'wait' });
  return state;
};
const errs = (s: GameState): string[] => checkInvariants(s, engine.registry);

function wallCell(s: GameState): { x: number; y: number } {
  const l = getLevel(s);
  const wall = l.palette.indexOf('nh:vwall');
  const i = l.cells.indexOf(wall);
  return { x: i % l.width, y: Math.floor(i / l.width) };
}

describe('invariants', () => {
  test('a healthy state passes', () => {
    expect(errs(fresh())).toEqual([]);
  });

  test('occupation: valid, or null; never with a prompt or game over', () => {
    const s = fresh();
    s.occupation = {
      action: { type: 'mod', action: 'nh:travel', args: { x: 1, y: 1 } },
      data: null,
    };
    expect(errs(s)).toEqual([]);
    s.occupation = { action: { type: 'mod', action: 'zz:nothing' }, data: null };
    expect(errs(s).join('\n')).toMatch(/not registered/);
    s.occupation = { action: { type: 'continue' }, data: null };
    expect(errs(s).join('\n')).toMatch(/cannot continue/);
    s.occupation = { action: { type: 'wait' }, data: null };
    s.gameOver = { kind: 'died', killer: 'k', turn: 1, depth: 1, level: 1 };
    expect(errs(s).join('\n')).toMatch(/occupation is set after game over/);
    s.gameOver = null;
    s.pendingPrompt = { prompt: { id: 'p', kind: 'yn', key: 'k' }, handler: 'nh:eat', data: null };
    expect(errs(s).join('\n')).toMatch(/occupation is set while a prompt/);
  });

  test('out of bounds entity', () => {
    const s = fresh();
    const p = getPlayer(s).c.pos!;
    p.x = -1;
    expect(errs(s).join('\n')).toMatch(/out of bounds/);
  });

  test('entity on impassable cell', () => {
    const s = fresh();
    const w = wallCell(s);
    const p = getPlayer(s).c.pos!;
    p.x = w.x;
    p.y = w.y;
    expect(errs(s).join('\n')).toMatch(/impassable/);
  });

  test('a wall-walker polymorphed inside a wall may stay there; others may not', () => {
    const s = fresh();
    const w = wallCell(s);
    const id = s.nextEntityId++;
    s.entities[String(id)] = {
      id,
      def: 'nh:xorn' as never,
      c: {
        pos: { level: s.currentLevel, x: w.x, y: w.y },
        actor: { energy: 0, speed: 9 },
        hp: { cur: 5, max: 5 },
        monster: { level: 8, peaceful: false, asleep: false, lastHero: null },
      },
    };
    const wallwalk = { ids: new Set<string>(), spots: new Set<string>() };
    const check = (): string => checkInvariants(s, engine.registry, { wallwalk }).join('\n');
    expect(check()).not.toMatch(/impassable/);
    s.entities[String(id)]!.def = 'nh:jackal' as never; // newcham() where it stood
    expect(check()).not.toMatch(/impassable/);
    expect(errs(s).join('\n')).toMatch(/impassable/); // no record: reported
    expect(check()).not.toMatch(/impassable/);
    const fresh2 = { ids: new Set<string>(), spots: new Set<string>() };
    expect(checkInvariants(s, engine.registry, { wallwalk: fresh2 }).join('\n')).toMatch(
      /impassable/,
    );
  });

  test('two entities share a cell', () => {
    const s = fresh();
    const p = getPlayer(s);
    s.entities['99'] = { id: 99, def: p.def, c: { pos: { ...p.c.pos! } } };
    expect(errs(s).join('\n')).toMatch(/share cell/);
  });

  test('only the engulfer holding the hero may share her cell', () => {
    const s = fresh();
    const p = getPlayer(s);
    s.entities['99'] = {
      id: 99,
      def: 'nh:fog_cloud',
      c: { pos: { ...p.c.pos! }, monster: {} as never },
    };
    const nh = s.modData['nh'] as Record<string, unknown>;
    nh['ustuck'] = 99;
    nh['uswallow'] = { mon: 99, tim: 3 };
    expect(errs(s).join('\n')).not.toMatch(/share cell/);
    s.entities['98'] = { id: 98, def: 'nh:newt', c: { pos: { ...p.c.pos! } } };
    expect(errs(s).join('\n')).toMatch(/share cell/);
  });

  test('player missing / no actor / no pos', () => {
    let s = fresh();
    delete s.entities[String(s.playerId)];
    expect(errs(s).join('\n')).toMatch(/player entity .* missing/);
    s = fresh();
    delete getPlayer(s).c.actor;
    expect(errs(s).join('\n')).toMatch(/no actor/);
    s = fresh();
    delete getPlayer(s).c.pos;
    expect(errs(s).join('\n')).toMatch(/no pos/);
  });

  test('visible unsorted, duplicate or out of range', () => {
    let s = fresh();
    s.visible = [5, 3];
    expect(errs(s).join('\n')).toMatch(/ascending/);
    s = fresh();
    s.visible = [3, 3];
    expect(errs(s).join('\n')).toMatch(/ascending/);
    s = fresh();
    s.visible = [1e9];
    expect(errs(s).join('\n')).toMatch(/out of range/);
  });

  test('memory length and values', () => {
    let s = fresh();
    s.memory[s.currentLevel]!.pop();
    expect(errs(s).join('\n')).toMatch(/memory .* length/);
    s = fresh();
    s.memory[s.currentLevel]![0] = 999;
    expect(errs(s).join('\n')).toMatch(/memory .* out of range/);
  });

  test('palette index and array lengths', () => {
    let s = fresh();
    getLevel(s).cells[0] = 999;
    expect(errs(s).join('\n')).toMatch(/palette index 999/);
    s = fresh();
    getLevel(s).cells.pop();
    expect(errs(s).join('\n')).toMatch(/cells length/);
    s = fresh();
    getLevel(s).lit.pop();
    expect(errs(s).join('\n')).toMatch(/lit length/);
  });

  test('timers unsorted', () => {
    const s = fresh();
    s.timers = [
      { at: 5, seq: 1, kind: 'x:y', data: null },
      { at: 3, seq: 2, kind: 'x:y', data: null },
    ];
    expect(errs(s).join('\n')).toMatch(/timers not sorted/);
  });

  test('traps: plain floor only, registered, one per cell, sorted', () => {
    const s = fresh();
    const l = getLevel(s);
    l.traps = [];
    const floor = l.palette.indexOf('nh:floor');
    const cells = l.cells.flatMap((c, i) => (c === floor ? [i] : []));
    const at = (i: number) => ({ x: i % l.width, y: Math.floor(i / l.width) });
    const [a, b] = [at(cells[0]!), at(cells[1]!)];
    l.traps = [
      { def: 'nh:squeaky_board', ...a, seen: false },
      { def: 'nh:bear_trap', ...b, seen: true },
    ];
    expect(errs(s)).toEqual([]);
    l.traps = [l.traps[1]!, l.traps[0]!];
    expect(errs(s).join('\n')).toMatch(/traps not sorted/);
    l.traps = [
      { def: 'nh:squeaky_board', ...a, seen: false },
      { def: 'nh:bear_trap', ...a, seen: false },
    ];
    expect(errs(s).join('\n')).toMatch(/two on/);
    l.traps = [{ def: 'zz:nothing', ...a, seen: false }];
    expect(errs(s).join('\n')).toMatch(/not registered/);
    l.traps = [{ def: 'nh:squeaky_board', ...wallCell(s), seen: false }];
    expect(errs(s).join('\n')).toMatch(/not on plain floor \(nh:vwall\)/);
    const stairs = l.cells.indexOf(l.palette.indexOf('nh:stairs_up'));
    l.traps = [{ def: 'nh:squeaky_board', ...at(stairs), seen: false }];
    expect(errs(s).join('\n')).toMatch(/not on plain floor/);
  });

  test('non-plain state', () => {
    const s = fresh();
    (s.modData as Record<string, unknown>)['x'] = new Map();
    expect(errs(s).join('\n')).toMatch(/JSON-plain/);
    const t = fresh();
    (t.modData as Record<string, unknown>)['x'] = undefined;
    (t as unknown as Record<string, unknown>)['fn'] = () => 1;
    expect(errs(t).join('\n')).toMatch(/JSON-plain/);
  });
});
