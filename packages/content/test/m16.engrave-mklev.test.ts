// m16 step 6: engravings made with the level. Ordinary rooms get graffiti (a random engraving,
// MARK), the vault teleporter's niche "ad aerarium" in the dust in front of it, and a locked shop
// door "Closed for inventory" on the square outside it; the text files give random lines.
// (The special levels' des.engraving()s are checked with their levels: m7b.sokoban,
// m15.castle and minesend tests.) Outcomes over many made levels, not one lucky seed.
// ref: src/mklev.c fill_ordinary_room(), makeniche(); src/shknam.c stock_room();
// src/engrave.c random_engraving(); src/rumors.c get_rnd_text()
import {
  createEngine,
  getLevel,
  inRooms,
  type Ctx,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { insideShop, isShopType, pendingVaultTele, vanillaMod } from '../src/index';
import { engravingsOn, type Engr } from '../src/engr';
import { ENGRAVE_TEXTS } from '../src/engravetxt';
import { EPITAPH_TEXTS } from '../src/epitaph';
import { FALSE_RUMORS, TRUE_RUMORS } from '../src/rumortxt';
import { getRndText } from '../src/rumors';
import { T, terrainIdAt } from '../src/terrain';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'probe:run',
      labelKey: 'probe',
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
const defs = engine.registry;
function withCtx(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'probe:run' });
}

interface Made {
  state: GameState;
  level: Level;
  engr: { x: number; y: number; e: Engr }[];
}

// main-dungeon levels 1..8 of a number of games, with their engravings as made
const made: Made[] = [];
for (let seed = 1; seed <= 16; seed++) {
  const { state } = engine.newGame({ seed });
  for (let dlevel = 1; dlevel <= 8; dlevel++) {
    if (dlevel > 1) withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
    const level = getLevel(state);
    made.push({ state, level, engr: structuredClone(engravingsOn({ state }, level)) });
  }
}

const RANDOM_LINES = new Set([...TRUE_RUMORS, ...FALSE_RUMORS, ...ENGRAVE_TEXTS]);

describe('engravings made with the level', () => {
  test('graffiti: a worn random line, MARK, finished, on the floor of an ordinary room', () => {
    let graffiti = 0;
    for (const { level, engr } of made)
      for (const { x, y, e } of engr) {
        if (e.type !== 'mark') continue;
        graffiti++;
        expect(e.time).toBe(0);
        expect(RANDOM_LINES.has(e.pristine)).toBe(true);
        expect(e.pristine.startsWith('[cookie] ')).toBe(false);
        // a quarter of its letters worn (trailing blanks trimmed): mostly the same letters
        expect(e.text.length).toBeLessThanOrEqual(e.pristine.length);
        const same = [...e.pristine].filter((c, i) => c === e.text[i]).length;
        expect(same).toBeGreaterThanOrEqual(e.pristine.length - Math.trunc(e.pristine.length / 4));
        expect(terrainIdAt(level, x, y)).toBe(T.floor);
        const rooms = inRooms(level, x, y).map((i) => level.rooms[i]);
        expect(rooms.some((r) => r !== undefined && r.type === undefined)).toBe(true);
        // only a level-made text reading exactly "Elbereth" guards objects
        expect(e.guard === true).toBe(e.text === 'Elbereth');
      }
    // 1 in 27 + 3 * depth per ordinary room: a handful over these levels
    expect(graffiti).toBeGreaterThan(5);
  });

  test('"ad aerarium" in the dust in front of each vault teleporter niche, aged', () => {
    let niches = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { state } = engine.newGame({ seed });
      const level = getLevel(state);
      const cell = pendingVaultTele(state, level.id);
      if (cell === null) continue;
      niches++;
      const nx = cell % level.width;
      const ny = Math.trunc(cell / level.width);
      // (a random graffiti may read "ad aerarium" too: engrave.txt has it, as a MARK)
      const found = engravingsOn({ state }, level).filter(
        ({ e }) => e.pristine === 'ad aerarium' && e.type === 'dust',
      );
      expect(found).toHaveLength(1);
      const { x, y, e } = found[0]!;
      // two squares from the niche, the secret door between them, on a room's floor
      expect(x).toBe(nx);
      expect(Math.abs(y - ny)).toBe(2);
      const door = terrainIdAt(level, x, (y + ny) / 2)!;
      expect(door.startsWith('nh:sdoor') || defs.terrain(door).door !== undefined).toBe(true);
      expect(inRooms(level, x, y).length).toBeGreaterThan(0);
      expect(e).toMatchObject({ type: 'dust', time: 0 });
      expect(e.guard).toBeUndefined();
      // wipe_engr_at(5) wore up to five letters of the dust (leading blanks trimmed, and
      // wipeout_text()'s trailing ones)
      expect(e.text.length).toBeGreaterThan(0);
      expect(e.text.length + (e.off ?? 0)).toBeLessThanOrEqual('ad aerarium'.length);
      expect(e.text.length + (e.off ?? 0)).toBeGreaterThanOrEqual('ad aerarium'.length - 5);
    }
    expect(niches).toBeGreaterThan(5);
  });

  test('"Closed for inventory" in the dust outside a locked shop door, on floor or corridor', () => {
    let closed = 0;
    let shops = 0;
    const check = (state: GameState, level: Level): void => {
      for (let i = 0; i < level.rooms.length; i++) {
        if (!isShopType(level.rooms[i]?.type)) continue;
        shops++;
      }
      for (const { x, y, e } of engravingsOn({ state }, level)) {
        if (e.pristine !== 'Closed for inventory') continue;
        closed++;
        expect(e).toEqual({
          text: 'Closed for inventory',
          pristine: 'Closed for inventory',
          type: 'dust',
          time: 0,
        });
        expect([T.floor, T.corr]).toContain(terrainIdAt(level, x, y));
        expect(insideShop(level, x, y)).toBeNull();
        // next to it, the locked door of a shop
        const doors = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(
          ([dx, dy]) =>
            terrainIdAt(level, x + dx!, y + dy!) === T.door_locked &&
            inRooms(level, x + dx!, y + dy!).some((r) => isShopType(level.rooms[r]?.type)),
        );
        expect(doors).toHaveLength(1);
      }
      // and every locked shop door has one
      for (let i = 0; i < level.rooms.length; i++) {
        const r = level.rooms[i];
        if (!r || !isShopType(r.type)) continue;
        for (let x = r.lx - 1; x <= r.hx + 1; x++)
          for (let y = r.ly - 1; y <= r.hy + 1; y++) {
            if (terrainIdAt(level, x, y) !== T.door_locked) continue;
            const near = engravingsOn({ state }, level).filter(
              (o) =>
                o.e.pristine === 'Closed for inventory' &&
                Math.abs(o.x - x) + Math.abs(o.y - y) === 1,
            );
            expect(near).toHaveLength(1);
          }
      }
    };
    for (const { state, level } of made) check(state, level);
    // a locked shop is rare: when the sample has none, search more games for one
    for (let seed = 17; closed === 0 && seed <= 200; seed++) {
      const { state } = engine.newGame({ seed });
      for (let dlevel = 1; dlevel <= 8 && closed === 0; dlevel++) {
        if (dlevel > 1)
          withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
        check(state, getLevel(state));
      }
    }
    expect(shops).toBeGreaterThan(0);
    expect(closed).toBeGreaterThan(0);
  });

  test('get_rnd_text() picks uniformly from the engrave and epitaph files', () => {
    const { state } = engine.newGame({ seed: 1 });
    withCtx(state, (ctx) => {
      const epitaphs = new Set<string>();
      for (let i = 0; i < 2000; i++) epitaphs.add(getRndText(ctx, 'epitaph'));
      for (const s of epitaphs) expect(EPITAPH_TEXTS).toContain(s);
      expect(epitaphs.size).toBeGreaterThan(EPITAPH_TEXTS.length / 2);
      expect(EPITAPH_TEXTS[0]).toBe('No matter where I went, here I am.');
      expect(EPITAPH_TEXTS).toContain('Rest in peace');
      expect(EPITAPH_TEXTS.some((s) => s.startsWith('#') || s === '')).toBe(false);
      for (let i = 0; i < 50; i++) expect(ENGRAVE_TEXTS).toContain(getRndText(ctx, 'engrave'));
    });
  });
});
