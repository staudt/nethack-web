// Wizard mode step 1: the wizard mod, wiz:map and wiz:where.
import {
  applyUpdate,
  buildSnapshot,
  createEngine,
  diffSnapshot,
  getLevel,
  stateHash,
  type DefId,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, WIZ_MAP, WIZ_WHERE, messagesEn, vanillaMod, wizardMod } from '../src/index';

const normal = createEngine([vanillaMod]);
const wizard = createEngine([vanillaMod, wizardMod]);
const SELF = { kind: 'self' } as const;

const wizOffers = (e: typeof normal, state: GameState): string[] =>
  e
    .query(state)
    .actionsFor(SELF)
    .map((o) => (o.action.type === 'mod' ? o.action.action : o.action.type))
    .filter((id) => id.startsWith('wiz:'));

const msgs = (events: GameEvent[]): Extract<GameEvent, { type: 'msg' }>[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e] : []));

describe('the wizard mod', () => {
  test('a normal game offers no wiz: actions; a wizard game offers map and where', () => {
    expect(wizOffers(normal, normal.newGame({ seed: 1 }).state)).toEqual([]);
    expect(wizOffers(wizard, wizard.newGame({ seed: 1 }).state)).toEqual([WIZ_MAP, WIZ_WHERE]);
  });

  test('loading it draws nothing: the same seed builds the same game', () => {
    const a = normal.newGame({ seed: 7 }).state;
    const b = wizard.newGame({ seed: 7 }).state;
    expect(b.mods.map((m) => m.id)).toEqual(['nh', 'wiz']);
    expect(stateHash({ ...b, mods: a.mods })).toBe(stateHash(a));
  });

  test('a wizard save refuses to load without the wizard mod, and loads with it', () => {
    const { state } = wizard.newGame({ seed: 3 });
    const replay = { seed: 3, width: 80, height: 21, mods: state.mods, actions: [] };
    const text = wizard.save(state, replay);
    expect(() => normal.load(text)).toThrow(/wiz@0\.1\.0/);
    expect(stateHash(wizard.load(text).state)).toBe(stateHash(state));
    const plain = normal.newGame({ seed: 3 }).state;
    expect(() => wizard.load(normal.save(plain, { ...replay, mods: plain.mods }))).toThrow(
      /mods \[nh@/,
    );
  });

  test('every message key it uses has English text', () => {
    for (const k of ['action.wiz:map', 'action.wiz:where', 'wiz.where.levels', 'wiz.where.branch'])
      expect(messagesEn[k]).toBeDefined();
  });
});

describe('wiz:map', () => {
  test('remembers every cell, finds secret corridors, shows every trap, takes no time', () => {
    // Hide one corridor cell as a secret corridor and add an unseen trap on the floor, out of sight.
    const { state } = wizard.newGame({ seed: 1 });
    {
      const l = getLevel(state);
      const out = (id: DefId): number =>
        l.cells.findIndex((c, j) => l.palette[c] === id && !state.visible.includes(j));
      const c = out(T.corr);
      expect(c).toBeGreaterThan(-1);
      let pi = l.palette.indexOf(T.scorr);
      if (pi === -1) pi = l.palette.push(T.scorr) - 1;
      l.cells[c] = pi;
      const f = out(T.floor);
      expect(f).toBeGreaterThan(-1);
      const def = wizard.registry.traps[0]?.id as DefId;
      l.traps.push({ def, x: f % l.width, y: Math.floor(f / l.width), seen: false });
    }

    const level = getLevel(state);
    const before = buildSnapshot(wizard.registry, state);
    expect(before.cells.some((c) => c.g === null)).toBe(true);
    const turn = state.turn;
    const { events } = wizard.step(state, { type: 'mod', action: WIZ_MAP as DefId });
    expect(events.filter((e) => e.type === 'msg')).toEqual([]);
    expect(state.turn).toBe(turn);

    const memory = state.memory[level.id] ?? [];
    expect(memory).toEqual(level.cells);
    expect(level.cells.some((c) => level.palette[c] === T.scorr)).toBe(false);
    expect(level.traps.every((t) => t.seen)).toBe(true);

    // The delta carries the newly remembered cells, so a client mirror shows the whole map.
    const next = buildSnapshot(wizard.registry, state);
    const delta = diffSnapshot(before, next);
    const mirror = applyUpdate(before, delta);
    expect(mirror).toEqual(next);
    for (let i = 0; i < level.cells.length; i++) {
      const id = level.palette[level.cells[i] ?? 0];
      expect(mirror.cells[i]?.g).toBe(wizard.registry.terrain(id as DefId).looksLike ?? id);
    }
    for (const t of level.traps) expect(mirror.cells[t.y * level.width + t.x]?.t).toBe(t.def);
  });
});

describe('wiz:where', () => {
  test('one line per dungeon, then its branch stairs, from the layout; no time passes', () => {
    const { state } = wizard.newGame({ seed: 5 });
    const turn = state.turn;
    const { events } = wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    expect(state.turn).toBe(turn);
    const expected: { key: string; params: Record<string, string | number> }[] = [];
    for (const d of state.dungeons) {
      const dungeon = '@' + wizard.registry.dungeon(d.id).nameKey;
      const start = d.depthStart;
      if (d.levels === null) expected.push({ key: 'wiz.where.open', params: { dungeon, start } });
      else
        expected.push({
          key: d.levels > 1 ? 'wiz.where.levels' : 'wiz.where.level',
          params: d.levels > 1 ? { dungeon, start, end: start + d.levels - 1 } : { dungeon, start },
        });
      for (const b of d.branches)
        expected.push({
          key: 'wiz.where.branch',
          params: {
            dungeon: '@' + wizard.registry.dungeon(b.to).nameKey,
            depth: start + b.dlevel - 1,
          },
        });
    }
    const got = msgs(events).map((m) => ({ key: m.key, params: m.params }));
    expect(got).toEqual(expected);

    // The vanilla layout: the Dungeons of Doom (no bottom yet) with the Mines branch, then the Mines.
    const [main, mines] = state.dungeons;
    const branch = main?.branches[0];
    expect(got[0]).toEqual({ key: 'wiz.where.open', params: { dungeon: '@nh:main', start: 1 } });
    expect(got[1]).toEqual({
      key: 'wiz.where.branch',
      params: { dungeon: '@nh:mines', depth: branch?.dlevel ?? -1 },
    });
    expect(got[2]).toEqual({
      key: 'wiz.where.levels',
      params: {
        dungeon: '@nh:mines',
        start: (branch?.dlevel ?? 0) + 1,
        end: (mines?.depthStart ?? 0) + (mines?.levels ?? 0) - 1,
      },
    });
    expect(mines?.depthStart).toBe((branch?.dlevel ?? 0) + 1);
  });
});
