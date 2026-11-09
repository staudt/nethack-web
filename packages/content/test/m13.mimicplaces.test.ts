// m13 step 3: mimics where NetHack puts them. Trapped doors from difficulty 9 are sometimes a
// doorway with a mimic posing as the door (dosdoor()); shop squares sometimes hold a mimic posing
// as stock (shk.test.ts); des.monster `appear_as` (LevelContent.appearAs) gives Sokoban's top
// level two giant mimics posing as boulders and the Mimic of the Mines four posing as gray
// stones (minesend.test.ts); a cursed object detector shows mimics posing as objects. Outcomes
// are asserted; rolls are searched.
import {
  createEngine,
  getLevel,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { doorTrapped } from '../src/btrapstate';
import { monsterDetect } from '../src/detect';
import { objectDetect } from '../src/detectobj';
import { vanillaMod } from '../src/index';
import { mappearance, setMappearance } from '../src/mimicstate';
import { keepTrappedDoors } from '../src/mklev';
import { T } from '../src/terrain';
import { setGenocided } from '../src/vanquished';
import { addMon, setup } from './helpers';
import { ctxFor, defs } from './itemHelpers';

// five closed doors in a wall, and a secret door at the right end
const DOORS = ['-------------', '|...........|', '-+-+-+-+-+---', '|.....@.....|', '-------------'];
const DOOR_XS = [1, 3, 5, 7, 9];
const SDOOR_X = 11;

type S = ReturnType<typeof setup>;
const terrainAt = (s: S, x: number, y: number): DefId | undefined =>
  s.level.palette[s.level.cells[y * s.level.width + x] ?? -1];
const monAt = (state: GameState, level: string, x: number, y: number): Entity | undefined =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .find((e) => e.c.monster && e.c.pos?.level === level && e.c.pos.x === x && e.c.pos.y === y);

/** The test level at `depth` with its five doors and the secret door asked to be trapped. */
function trappedDoors(seed: number, depth: number): S {
  const s = setup(DOORS, seed);
  s.level.depth = depth;
  let i = s.level.palette.indexOf(T.sdoor_h);
  if (i === -1) i = s.level.palette.push(T.sdoor_h) - 1;
  s.level.cells[2 * s.level.width + SDOOR_X] = i;
  s.level.trappedDoorSpots = [...DOOR_XS, SDOOR_X].map((x) => ({ x, y: 2 }));
  return s;
}

describe('door mimics (dosdoor())', () => {
  test('from difficulty 9 a trapped door may be a doorway with a mimic posing as the door', () => {
    let mimics = 0;
    let traps = 0;
    for (let seed = 1; seed <= 20 && (mimics === 0 || traps === 0); seed++) {
      const s = trappedDoors(seed, 9);
      const ctx = ctxFor(s.state) as unknown as Ctx;
      keepTrappedDoors(ctx, s.level);
      expect(s.level.trappedDoorSpots).toBeUndefined();
      for (const x of DOOR_XS) {
        const m = monAt(s.state, 'dlvl1', x, 2);
        if (m) {
          mimics++;
          expect(defs.monster(m.def).glyph.ch).toBe('m');
          expect(terrainAt(s, x, 2)).toBe(T.doorway);
          expect(doorTrapped(ctx, 'dlvl1', x, 2)).toBe(false);
          expect(mappearance(ctx, m.id)).toEqual({ type: 'furniture', id: T.door_closed });
        } else {
          traps++;
          expect(terrainAt(s, x, 2)).toBe(T.door_closed);
          expect(doorTrapped(ctx, 'dlvl1', x, 2)).toBe(true);
        }
      }
      // a secret door keeps its trap: never a mimic
      expect(monAt(s.state, 'dlvl1', SDOOR_X, 2)).toBeUndefined();
      expect(doorTrapped(ctx, 'dlvl1', SDOOR_X, 2)).toBe(true);
    }
    expect(mimics).toBeGreaterThan(0);
    expect(traps).toBeGreaterThan(0);
  });

  test('below difficulty 9, or with all three mimics genocided, the doors stay trapped', () => {
    for (let seed = 1; seed <= 10; seed++)
      for (const geno of [false, true]) {
        const s = trappedDoors(seed, geno ? 20 : 8);
        const ctx = ctxFor(s.state) as unknown as Ctx;
        if (geno)
          for (const id of ['nh:small_mimic', 'nh:large_mimic', 'nh:giant_mimic'])
            setGenocided(ctx, id as DefId);
        keepTrappedDoors(ctx, s.level);
        for (const x of [...DOOR_XS, SDOOR_X]) {
          expect(monAt(s.state, 'dlvl1', x, 2)).toBeUndefined();
          expect(doorTrapped(ctx, 'dlvl1', x, 2)).toBe(true);
        }
      }
  });
});

describe('des.monster appear_as', () => {
  const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
  const probeMod: Mod = {
    id: 'mp',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'mp:run',
        labelKey: 'mp',
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

  test("Sokoban's top level: two giant mimics posing as boulders, in both variants", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
      const { state } = engine.newGame({ seed });
      probe.fn = (ctx) => ctx.goToLevel({ dungeon: 'nh:sokoban', dlevel: 1 }, 'down');
      engine.step(state, { type: 'mod', action: 'mp:run' });
      const level = getLevel(state);
      seen.add(level.def ?? '');
      const mimics = sortedIds(state)
        .map((id) => state.entities[String(id)] as Entity)
        .filter((e) => e.def === 'nh:giant_mimic' && e.c.pos?.level === level.id);
      expect(mimics).toHaveLength(2);
      for (const m of mimics) {
        expect(mappearance({ state }, m.id)).toEqual({ type: 'object', id: 'nh:boulder' });
        // shown and described as a boulder
        const snap = engine.query(state).describe({ x: m.c.pos!.x, y: m.c.pos!.y });
        expect(JSON.stringify(snap)).not.toContain('mimic');
      }
    }
    expect([...seen].sort()).toEqual(['nh:soko1-1', 'nh:soko1-2']);
  });
});

describe('detection', () => {
  test('a cursed object detector shows a mimic posing as an object; an uncursed one does not', () => {
    for (const buc of ['cursed', 'uncursed'] as const) {
      const s = setup(['...........', '.@.........', '...........'], 1);
      const ctx = ctxFor(s.state) as unknown as Ctx;
      const id = addMon(s.state, 'nh:giant_mimic', 9, 1, { asleep: true });
      setMappearance(ctx, id, { type: 'object', id: 'nh:boulder' });
      objectDetect(ctx, { buc, cls: 'potion', item: null });
      const mem = s.state.objectMemory['dlvl1']?.[String(1 * s.level.width + 9)];
      expect(mem).toBe(buc === 'cursed' ? 'nh:boulder' : undefined);
    }
  });

  test('monster detection shows the mimic as itself', () => {
    const s = setup(['...........', '.@.........', '...........'], 1);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    const id = addMon(s.state, 'nh:small_mimic', 9, 1, { asleep: true });
    setMappearance(ctx, id, { type: 'furniture', id: T.door_closed });
    monsterDetect(ctx);
    expect(s.state.monsterMemory['dlvl1']?.[String(1 * s.level.width + 9)]).toBe('nh:small_mimic');
  });
});
