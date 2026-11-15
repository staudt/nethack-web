// m17 step 6: Juiblex's swamp, Asmodeus's and Baalzebub's lairs. Each level builds on 80x21 with
// its maps, fixed contents, doors, stairs in their regions and flags; the swamp is a relaxed
// blockwise maze of moat with a fountain and three mimics posing as fountains; Asmodeus's two
// parts share a column and keep their doors; the beetle keeps its legs. Outcomes are asserted
// over many seeds.
// ref: dat/juiblex.lua, dat/asmodeus.lua, dat/baalz.lua; src/sp_lev.c lvlfill_swamp(); src/mkmaze.c
// baalz_fixup(), place_lregion()
import {
  createEngine,
  getLevel,
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type LevelDef,
  type MapBlock,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { ASMODEUS } from '../src/asmodeus';
import { BAALZ } from '../src/baalz';
import { JUIBLEX } from '../src/juiblex';
import { GEHENNOM, GEHENNOM_SPECIALS as G, levelFlags, nonDiggable } from '../src/levelflags';
import { isMoat, waterbodyName } from '../src/liquid';
import { mappearance } from '../src/mimicstate';
import { mapToLevel } from '../src/sp_lev';
import { levelTemperature } from '../src/temperature';
import { T, isWallId, terrainIdAt } from '../src/terrain';
import { TRAP } from '../src/trap';
import { SWAMP } from '../src/zoo';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'lr',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'lr:run',
      labelKey: 'lr',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'lr:run' as DefId });
};

/** A new game whose hero fell onto Gehennom's special level `sp`. */
function arrive(seed: number, sp: DefId): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  const d = state.dungeons.find((x) => x.id === GEHENNOM)!;
  const dlevel = d.special.find((s) => s.id === sp)!.dlevel;
  run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random'));
  return { state, level: getLevel(state) };
}

const SEEDS = Array.from({ length: 8 }, (_, i) => i + 1);
const ter = (l: Level, p: Pos): DefId => terrainIdAt(l, p.x, p.y)!;
const monAt = (state: GameState, l: Level, p: Pos): Entity | undefined =>
  Object.values(state.entities).find(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const itemsAt = (state: GameState, l: Level, p: Pos): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.item && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const inRect = (p: Pos, [x1, y1, x2, y2]: readonly number[]): boolean =>
  p.x >= x1! && p.x <= x2! && p.y >= y1! && p.y <= y2!;
const block = (def: LevelDef, l: Level): MapBlock => {
  const a = mapToLevel(def, l, 0, 0);
  const rows = def.map!.rows;
  return { x: a.x, y: a.y, w: rows[0]!.length, h: rows.length };
};
/** A map character's terrain as the lairs' maps lay it ('S' and '+' checked on their own). */
const isWallCh = (ch: string): boolean => ch === '-' || ch === '|';

describe("Juiblex's swamp", () => {
  const games = SEEDS.map((s) => arrive(s, G.juiblex));
  const at = (l: Level, x: number, y: number): Pos => mapToLevel(JUIBLEX, l, x, y);
  const PLACES: [number, number][] = [
    [4, 2],
    [46, 2],
    [4, 15],
    [46, 15],
  ];

  test("the lair over the swamp, Juiblex's fixed company and the stairs at either end", () => {
    for (const { state, level } of games) {
      expect(level.def).toBe(JUIBLEX.id);
      expect([level.width, level.height]).toEqual([80, 21]);
      const b = block(JUIBLEX, level);
      JUIBLEX.map!.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const id = ter(level, { x: b.x + x, y: b.y + y });
          if (ch === '}') expect(id).toBe(T.moat);
          else if (ch === 'P') expect(id).toBe(T.pool);
          else if (ch === '.') expect([T.floor, T.fountain]).toContain(id);
          else expect([T.floor, T.moat]).toContain(id); // the swamp shows through
        }),
      );
      expect(monAt(state, level, at(level, 25, 8))?.def).toBe('nh:juiblex');
      for (const x of [43, 44, 45])
        expect(monAt(state, level, at(level, x, 8))?.def).toBe('nh:lemure');
      for (const x of [43, 45])
        expect(
          itemsAt(state, level, at(level, x, 6)).some((e) => defs.object(e.def).class === 'gem'),
        ).toBe(true);
      for (const x of [43, 44, 45])
        expect(
          itemsAt(state, level, at(level, x, 9)).some((e) => defs.object(e.def).class === 'potion'),
        ).toBe(true);
      // the stairs: down in the west, up in the east, never in the lair
      const lair = [b.x, b.y, b.x + 50, b.y + 17];
      expect(level.down && inRect(level.down, [0, 0, 10, 20]) && !inRect(level.down, lair)).toBe(
        true,
      );
      expect(level.up && inRect(level.up, [68, 0, 78, 20]) && !inRect(level.up, lair)).toBe(true);
      expect(ter(level, level.down!)).toBe(T.stairs_down);
      expect(ter(level, level.up!)).toBe(T.stairs_up);
    }
  });

  test('one fountain and three giant mimics posing as fountains on the four spots', () => {
    for (const { state, level } of games) {
      const spots = PLACES.map(([x, y]) => at(level, x, y));
      const fountains = spots.filter((p) => ter(level, p) === T.fountain);
      expect(fountains).toHaveLength(1);
      let mimics = 0;
      run(state, (ctx) => {
        for (const p of spots) {
          if (ter(level, p) === T.fountain) continue;
          const m = monAt(state, level, p);
          expect(m?.def).toBe('nh:giant_mimic');
          expect(mappearance(ctx, m!.id)).toEqual({ type: 'furniture', id: T.fountain });
          mimics++;
        }
      });
      expect(mimics).toBe(3);
    }
  });

  test('the swamp: each 2x2 block outside the maps has floor at its corner and one more', () => {
    for (const { level } of games) {
      const b = block(JUIBLEX, level);
      const lair = [b.x - 1, b.y - 1, b.x + b.w, b.y + b.h];
      let blocks = 0;
      for (let x = 1; x + 1 < level.width; x += 2)
        for (let y = 0; y + 1 < level.height - 1; y += 2) {
          const cells = [
            { x, y },
            { x: x + 1, y },
            { x, y: y + 1 },
            { x: x + 1, y: y + 1 },
          ];
          // the clearings sit in the corners; the lair in the middle
          if (
            cells.some((p) => inRect(p, lair) || (p.y >= 15 && p.x <= 8) || (p.y <= 7 && p.x >= 69))
          )
            continue;
          if (cells.some((p) => p.x === level.width - 1)) continue;
          const floor = cells.filter((p) => {
            const id = ter(level, p);
            return id === T.floor || id === T.stairs_up || id === T.stairs_down;
          });
          expect(ter(level, cells[0]!) === T.moat).toBe(false);
          expect(floor).toHaveLength(2);
          blocks++;
        }
      expect(blocks).toBeGreaterThan(100);
      // column 0 is never touched; the last row is all moat
      for (let y = 0; y < level.height; y++) expect(ter(level, { x: 0, y })).toBe(T.stone);
      for (let x = 1; x < level.width; x++) expect(ter(level, { x, y: 20 })).toBe(T.moat);
    }
  });

  test('flags: a maze level, shortsighted, temperate; a swamp room; its water is a swamp', () => {
    const { state, level } = games[0]!;
    run(state, (ctx) => {
      expect(levelFlags(ctx, level)).toMatchObject({
        maze: true,
        shortsighted: true,
        temperate: true,
      });
      expect(levelTemperature(ctx, level)).toBe(0);
    });
    expect(level.rooms.some((r) => r.type === SWAMP)).toBe(true);
    const b = block(JUIBLEX, level);
    const moat = { x: b.x + 24, y: b.y + 4 };
    expect(ter(level, moat)).toBe(T.moat);
    expect(isMoat({ defs }, level, moat.x, moat.y)).toBe(false);
    expect(waterbodyName({ defs }, level, moat.x, moat.y)).toBe('liquid.name.swamp');
  });

  test('falling in, she lands in the east, outside the lair', () => {
    for (const { state, level } of games) {
      const p = getPlayer(state).c.pos!;
      const b = block(JUIBLEX, level);
      expect(inRect(p, [68, 0, 78, 20]) && !inRect(p, [b.x, b.y, b.x + 50, b.y + 17])).toBe(true);
    }
  });
});

describe("Asmodeus's lair", () => {
  const games = SEEDS.map((s) => arrive(s, G.asmodeus));
  const at = (l: Level, x: number, y: number): Pos => mapToLevel(ASMODEUS, l, x, y);

  test('the first part: walls, doors, secret doors, down stairs, Asmodeus and his company', () => {
    for (const { state, level } of games) {
      expect(level.def).toBe(ASMODEUS.id);
      const b = block(ASMODEUS, level);
      ASMODEUS.map!.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const id = ter(level, { x: b.x + x, y: b.y + y });
          if (isWallCh(ch)) expect(isWallId(id)).toBe(true);
          if (ch === 'S') expect([T.sdoor_v, T.sdoor_h]).toContain(id);
        }),
      );
      expect(ter(level, at(level, 4, 3))).toBe(T.door_closed);
      expect(ter(level, at(level, 18, 4))).toBe(T.door_locked);
      expect(ter(level, at(level, 18, 8))).toBe(T.door_closed);
      // a secret door between a wall above and below faces them
      expect(ter(level, at(level, 14, 2))).toBe(T.sdoor_v);
      expect(level.down).toEqual(at(level, 13, 7));
      expect(ter(level, level.down!)).toBe(T.stairs_down);
      const asmo = monAt(state, level, at(level, 12, 7));
      expect(asmo?.def).toBe('nh:asmodeus');
      expect(asmo?.c.monster?.peaceful).toBe(true);
      expect(monAt(state, level, at(level, 11, 7))?.def).toBe('nh:ghost');
      expect(monAt(state, level, at(level, 10, 5))?.def).toBe('nh:horned_devil');
      const pit = at(level, 5, 2);
      expect(trapAt(level, pit.x, pit.y)?.def).toBe(TRAP.spikedPit);
      const fire = at(level, 8, 6);
      expect(trapAt(level, fire.x, fire.y)?.def).toBe(TRAP.fire);
    }
  });

  test("the second part shares the first part's last column; its door; up stairs in the west", () => {
    for (const { level } of games) {
      const b = block(ASMODEUS, level);
      // the corridor's walls and its closed east door
      const x2 = b.x + 20;
      const y2 = b.y + 4;
      for (let x = x2; x <= x2 + 32; x++) {
        expect(isWallId(ter(level, { x, y: y2 }))).toBe(true);
        expect(isWallId(ter(level, { x, y: y2 + 4 }))).toBe(true);
      }
      for (let x = x2; x < x2 + 32; x++)
        for (let y = y2 + 1; y <= y2 + 3; y++) expect(ter(level, { x, y })).not.toBe(T.stone);
      expect(ter(level, { x: x2 + 32, y: y2 + 2 })).toBe(T.door_closed);
      expect(level.up && inRect(level.up, [0, 0, 5, 20]) && !inRect(level.up, [5, 1, 69, 16])).toBe(
        true,
      );
      expect(ter(level, level.up!)).toBe(T.stairs_up);
      // the maze walked east of the corridor
      expect(ter(level, { x: x2 + 33, y: y2 + 2 })).toBe(T.floor);
    }
  });

  test('flags: a maze level; both parts non-diggable, the maze diggable', () => {
    const { state, level } = games[0]!;
    const b = block(ASMODEUS, level);
    run(state, (ctx) => {
      expect(levelFlags(ctx, level).maze).toBe(true);
      expect(nonDiggable(ctx, level, b.x, b.y)).toBe(true);
      expect(nonDiggable(ctx, level, b.x + 20, b.y + 11)).toBe(true);
      expect(nonDiggable(ctx, level, b.x + 52, b.y + 8)).toBe(true);
      expect(nonDiggable(ctx, level, b.x + 53, b.y + 8)).toBe(false);
      expect(nonDiggable(ctx, level, 1, 2)).toBe(false);
    });
  });
});

describe("Baalzebub's lair", () => {
  const games = SEEDS.map((s) => arrive(s, G.baalz));
  const at = (l: Level, x: number, y: number): Pos => mapToLevel(BAALZ, l, x, y);

  test("the beetle keeps its legs: every wall inside the map's edge stays a wall", () => {
    for (const { level } of games) {
      expect(level.def).toBe(BAALZ.id);
      const b = block(BAALZ, level);
      BAALZ.map!.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const id = ter(level, { x: b.x + x, y: b.y + y });
          // the map's edge goes through the plain wall pass: walls with only rock round go
          const inside = x >= 1 && x <= 46 && y >= 1 && y <= 11;
          if (isWallCh(ch) && inside) expect(isWallId(id), `${String(x)},${String(y)}`).toBe(true);
          if (ch === ' ' && inside) expect(id).toBe(T.stone);
          if (ch === 'P') expect(isWallId(id)).toBe(true); // the pools were markers
          if (ch === 'F') expect(id).toBe(T.iron_bars);
          if (ch === 'S') expect([T.sdoor_v, T.sdoor_h]).toContain(id);
        }),
      );
      expect(ter(level, at(level, 34, 8))).toBe(T.sdoor_h);
      expect(ter(level, at(level, 29, 5))).toBe(T.sdoor_v);
      // the rear legs' first joints are separate corners again
      for (const [x, y] of [
        [39, 3],
        [39, 9],
      ] as const)
        expect([T.tlwall, T.trwall]).not.toContain(ter(level, at(level, x, y)));
    }
  });

  test('stairs, the locked door, the maze west, Baalzebub and his devils', () => {
    for (const { state, level } of games) {
      expect(level.down).toEqual(at(level, 44, 6));
      expect(ter(level, level.down!)).toBe(T.stairs_down);
      expect(
        level.up && inRect(level.up, [0, 0, 14, 20]) && !inRect(level.up, [14, 1, 69, 16]),
      ).toBe(true);
      expect(ter(level, level.up!)).toBe(T.stairs_up);
      expect(ter(level, at(level, 0, 6))).toBe(T.door_locked);
      const west = at(level, -1, 6);
      expect(ter(level, west)).toBe(T.floor);
      const baal = monAt(state, level, at(level, 35, 6));
      expect(baal?.def).toBe('nh:baalzebub');
      expect(baal?.c.monster?.peaceful).toBe(true);
      expect(monAt(state, level, at(level, 37, 7))?.def).toBe('nh:ghost');
      expect(monAt(state, level, at(level, 32, 5))?.def).toBe('nh:horned_devil');
      expect(monAt(state, level, at(level, 38, 7))?.def).toBe('nh:barbed_devil');
    }
  });

  test('non-diggable but in front of the eyes and the far right column', () => {
    const { state, level } = games[0]!;
    run(state, (ctx) => {
      const nd = (x: number, y: number): boolean => {
        const p = at(level, x, y);
        return nonDiggable(ctx, level, p.x, p.y);
      };
      expect(levelFlags(ctx, level).maze).toBe(true);
      expect(nd(0, 0)).toBe(true);
      expect(nd(1, 3)).toBe(true);
      expect(nd(47, 12)).toBe(true);
      for (const y of [4, 8]) {
        expect(nd(0, y)).toBe(false);
        expect(nd(1, y)).toBe(false);
        expect(nd(2, y)).toBe(true);
      }
      expect(nd(48, 6)).toBe(false);
    });
  });
});
