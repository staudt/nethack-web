// m7d step 3: the wand of digging (across the level, down and up), level flags for digging (maze,
// cavernous, hard floor, non-diggable areas), dug traps belonging to the hero, the Watch seeing
// her dig in town, and immediate wands zapped up or down. Outcomes are asserted; where a roll
// decides, several seeds are tried and every outcome is checked.
// ref: src/dig.c zap_dig(), dighole(), digactualhole(), watch_dig(); src/zap.c zap_updown(),
// weffects(); src/trap.c maybe_finish_sokoban()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, WAN, vanillaMod } from '../src/index';
import { canDigDown, cavernous, nonDiggable } from '../src/levelflags';
import { mapToLevel } from '../src/sp_lev';
import { maybeFinishSokoban } from '../src/sokoban';
import { setTerrain } from '../src/terrain';
import { TRAP, dataOf } from '../src/trap';
import { zapDig } from '../src/dig';
import { mksobj } from '../src/items';
import { addMon } from './helpers';
import { ctxFor, obj, quiet, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'dg',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'dg:run',
      labelKey: 'dg',
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
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with a real Ctx, no time passing; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'dg:run' }).events);
}

const cellOf = (level: Level, x: number, y: number): string | undefined =>
  level.palette[level.cells[y * level.width + x] ?? -1];
const heroAt = (state: GameState): Pos & { level: string } => {
  const p = getPlayer(state).c.pos!;
  return { level: p.level, x: p.x, y: p.y };
};
const hp = (state: GameState): number => getPlayer(state).c.hp?.cur ?? 0;

/** A charged wand in the hero's pack, its type not yet known. */
function wand(state: GameState, id: DefId): EntityId {
  delete state.appearances[id];
  const w = mksobj(ctxFor(state), obj(id), { init: false, carriedBy: state.playerId });
  const it = state.entities[String(w)]?.c.item;
  if (it) {
    it.spe = 8;
    it.buc = 'uncursed';
  }
  return w;
}

/** Zaps the wand in `dir` ('e', 'up', 'down', ...); the rendered messages. */
function zap(state: GameState, w: EntityId, dir: string): string[] {
  const r1 = engine.step(state, { type: 'mod', action: 'nh:zap' as DefId, args: { item: w } });
  const p = state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  const values = (p.options ?? []).map((o) => o.value);
  expect(values).toContain(dir);
  const r2 = engine.step(state, { type: 'answer', promptId: p.id, value: dir });
  return [...texts(r1.events), ...texts(r2.events)];
}

/** Takes off any helmet she wears (her kit may have one). */
function bareHead(state: GameState): void {
  for (const o of inventoryOf(state, state.playerId))
    if (o.c.item?.equipped === 'helm') o.c.item.equipped = null;
}

/** Big enough for the next level to be generated at its size when she falls. */
const BIG = ['..........', '..@.......', ...Array.from({ length: 10 }, () => '..........')];

// ---------------------------------------------------------------------------------------------

describe('digging across the level', () => {
  test('a room wall becomes a doorway, the rock beyond corridor', () => {
    const m = mapSetup([
      '                              ',
      '-----                         ',
      '|.@.|                         ',
      '-----                         ',
    ]);
    const w = wand(m.state, WAN.digging);
    zap(m.state, w, 'e');
    expect(cellOf(m.level, 4, 2)).toBe(T.doorway);
    // rn1(18, 8) squares, a wall costing 3, rock 2: at least 3 squares of corridor, contiguous
    let n = 0;
    while (cellOf(m.level, 5 + n, 2) === T.corr) n++;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(11);
    for (let x = 5 + n; x < m.level.width; x++) expect(cellOf(m.level, x, 2)).toBe(T.stone);
    // the wand is known (a ray is always seen)
    expect(m.state.appearances[WAN.digging]).toBeUndefined();
  });

  test('from a corridor into solid rock: corridor all the way', () => {
    const m = mapSetup(['@                             ']);
    const w = wand(m.state, WAN.digging);
    zap(m.state, w, 'e');
    let n = 0;
    while (cellOf(m.level, 1 + n, 0) === T.corr) n++;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(13);
  });

  test('a closed door is razed: "The door is razed!"', () => {
    const m = mapSetup(['-----   ', '|.@.+   ', '-----   ']);
    const w = wand(m.state, WAN.digging);
    const text = zap(m.state, w, 'e');
    expect(text).toContain('The door is razed!');
    expect(cellOf(m.level, 4, 1)).toBe(T.doorway);
    expect(cellOf(m.level, 5, 1)).toBe(T.corr);
  });

  test('on a cavernous level a wall becomes corridor', () => {
    const m = mapSetup(['     ', '|.@.|', '     ']);
    m.level.def = 'nh:minefill' as DefId;
    expect(cavernous({ defs }, m.level)).toBe(true);
    const w = wand(m.state, WAN.digging);
    zap(m.state, w, 'e');
    expect(cellOf(m.level, 4, 1)).toBe(T.corr);
  });

  test('on a maze level the first wall becomes floor and the beam stops', () => {
    const m = mapSetup(['-----------', '|.@.|.|...|', '-----------']);
    m.level.def = 'nh:minetn-5' as DefId; // "mazelevel", no non-diggable areas
    const w = wand(m.state, WAN.digging);
    zap(m.state, w, 'e');
    expect(cellOf(m.level, 4, 1)).toBe(T.floor);
    expect(cellOf(m.level, 6, 1)).toBe(T.vwall);
  });

  test('an undiggable maze wall: "The wall glows then fades."; rock: "The rock glows then fades."', () => {
    const m = mapSetup(['-----', '|.@.|', '-----']);
    m.level.def = 'nh:soko1-1' as DefId; // non-diggable everywhere
    const w = wand(m.state, WAN.digging);
    expect(zap(m.state, w, 'e')).toContain('The wall glows then fades.');
    expect(cellOf(m.level, 4, 1)).toBe(T.vwall);
    const r = mapSetup(['@    ']);
    r.level.def = 'nh:soko1-1' as DefId;
    const w2 = wand(r.state, WAN.digging);
    expect(zap(r.state, w2, 'e')).toContain('The rock glows then fades.');
    expect(cellOf(r.level, 1, 0)).toBe(T.stone);
  });
});

describe('digging down', () => {
  test('on the floor: a hole she falls through to the next level', () => {
    const m = mapSetup(BIG);
    const before = hp(m.state);
    const text = run(m.state, (ctx) => zapDig(ctx, 'down')); // no time passes: no regeneration
    expect(text).toContain('You dig a hole through the floor.');
    expect(text).toContain('You fall through...');
    expect(heroAt(m.state).level).toBe('dlvl2');
    expect(hp(m.state)).toBeLessThan(before); // d(1, 6) for the fall
    const t = trapAt(m.level, 2, 1);
    expect(t?.def).toBe(TRAP.hole);
    expect(t?.seen).toBe(true);
    expect(dataOf(t!).madeby_u).toBe(true);
  });

  test('on stairs: the beam bounces and a rock falls on her head', () => {
    const m = mapSetup(['.....', '..@..', '.....']);
    setTerrain(m.level, 2, 1, T.stairs_down);
    bareHead(m.state);
    const before = hp(m.state);
    const text = run(m.state, (ctx) => zapDig(ctx, 'down'));
    expect(text).toEqual(
      expect.arrayContaining([
        'The beam bounces off the stairs and hits the ceiling.',
        'You loosen a rock from the ceiling.',
        'It falls on your head!',
      ]),
    );
    expect(trapAt(m.level, 2, 1)).toBeUndefined();
    expect(heroAt(m.state).level).toBe('dlvl1');
    expect(before - hp(m.state)).toBeGreaterThanOrEqual(1);
    expect(itemsAt(defs, m.state, 'dlvl1', 2, 1).map((o) => o.def)).toContain('nh:rock');
  });

  test('where the floor cannot be dug through, a pit holds her', () => {
    const m = mapSetup(['.....', '..@..', '.....']);
    m.level.def = 'nh:soko4-1' as DefId; // hardfloor
    expect(canDigDown({ defs, state: m.state }, m.level)).toBe(false);
    const w = wand(m.state, WAN.digging);
    const text = zap(m.state, w, 'down');
    expect(text).toContain('You dig a pit in the floor.');
    expect(trapAt(m.level, 2, 1)?.def).toBe(TRAP.pit);
    expect(heroAt(m.state).level).toBe('dlvl1');
    const u = (m.state.modData['nh'] as { utrap?: { type: string; n: number } }).utrap;
    expect(u?.type).toBe('pit');
    expect(u?.n).toBeGreaterThanOrEqual(2);
    expect(u?.n).toBeLessThanOrEqual(5);
    // again, in the pit: the floor here is too hard
    expect(zap(m.state, w, 'down')).toContain('The floor here is too hard to dig in.');
  });

  test('in a doorway: too hard (no traps in doorways here)', () => {
    const m = mapSetup(['|.@.|']);
    setTerrain(m.level, 2, 0, T.doorway);
    const w = wand(m.state, WAN.digging);
    expect(zap(m.state, w, 'down')).toContain('The doorway here is too hard to dig in.');
    expect(trapAt(m.level, 2, 0)).toBeUndefined();
  });
});

describe('digging up', () => {
  const damages = (helmet: boolean): number[] =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => {
      const m = mapSetup(['...', '.@.', '...'], { seed });
      bareHead(m.state);
      if (helmet) {
        const h = mksobj(ctxFor(m.state), obj('nh:orcish_helm'), {
          init: false,
          carriedBy: m.state.playerId,
        });
        m.state.entities[String(h)]!.c.item!.equipped = 'helm';
      }
      const before = hp(m.state);
      // no time passes, so no hit points come back
      const text = run(m.state, (ctx) => zapDig(ctx, 'up'));
      expect(text).toEqual(
        expect.arrayContaining(['You loosen a rock from the ceiling.', 'It falls on your head!']),
      );
      expect(itemsAt(defs, m.state, 'dlvl1', 1, 1).map((o) => o.def)).toContain('nh:rock');
      return before - hp(m.state);
    });

  test('a rock falls on her head: rnd(6), rnd(2) with a hard helmet', () => {
    const bare = damages(false);
    expect(bare.filter((d) => d < 1 || d > 6)).toEqual([]);
    expect(bare.some((d) => d > 2)).toBe(true);
    expect(damages(true).filter((d) => d < 1 || d > 2)).toEqual([]);
  });
});

// A town room; the hero stands next to its east wall.
const TOWN = [
  '-----------    ',
  '|.........|    ',
  '|........@|    ',
  '|.........|    ',
  '-----------    ',
];

describe('the Watch', () => {
  for (const town of [true, false])
    test(`a watchman who sees her dig a ${town ? 'town' : 'non-town'} wall`, () => {
      const m = mapSetup(TOWN);
      m.level.rooms = [{ lx: 1, ly: 1, hx: 9, hy: 3, lit: true }];
      if (town) m.level.town = true;
      const wm = addMon(m.state, 'nh:watchman', 2, 2, { peaceful: true });
      m.state.entities[String(wm)]!.c.actor!.speed = 0;
      m.state.entities[String(wm)]!.c.hp = { cur: 200, max: 200 };
      const w = wand(m.state, WAN.digging);
      const text = zap(m.state, w, 'e');
      expect(cellOf(m.level, 10, 2)).toBe(T.doorway);
      expect(text.includes('"Halt, vandal!  You\'re under arrest!"')).toBe(town);
      expect(m.state.entities[String(wm)]?.c.monster?.peaceful).toBe(!town);
    });
});

// ---------------------------------------------------------------------------------------------

/** A new game sent to Sokoban level `n` or the Mines' bottom, its pet left behind. */
function special(where: 'soko4' | 'minend', from = 1): { state: GameState; level: Level } {
  for (let seed = from; seed < from + 40; seed++) {
    const { state } = engine.newGame({ seed });
    for (const e of Object.values(state.entities))
      if ((e.c.monster?.tame ?? 0) > 0) delete state.entities[String(e.id)];
    quiet(state);
    const n =
      where === 'soko4' ? 4 : (state.dungeons.find((d) => d.id === 'nh:mines')?.levels ?? 0);
    run(state, (ctx) =>
      ctx.goToLevel({ dungeon: where === 'soko4' ? 'nh:sokoban' : 'nh:mines', dlevel: n }, 'up'),
    );
    return { state, level: getLevel(state) };
  }
  throw new Error('unreachable');
}

/** A floor square with nothing on it and floor to its east, west and below. */
function quietFloor(state: GameState, level: Level): Pos {
  const free = (x: number, y: number): boolean =>
    cellOf(level, x, y) === T.floor &&
    !trapAt(level, x, y) &&
    itemsAt(defs, state, level.id, x, y).length === 0 &&
    !Object.values(state.entities).some(
      (e) => e.c.monster && e.c.pos?.level === level.id && e.c.pos.x === x && e.c.pos.y === y,
    );
  for (let y = 1; y < level.height - 1; y++)
    for (let x = 1; x < level.width - 1; x++) if (free(x, y)) return { x, y };
  throw new Error('no free floor');
}
const placeHero = (state: GameState, p: Pos): void => {
  Object.assign(getPlayer(state).c.pos!, { x: p.x, y: p.y });
};

describe('Sokoban', () => {
  test("the entry level's hard floor gets a pit, the hero's, and the rules stay", () => {
    const { state, level } = special('soko4');
    expect(level.sokoban).toBe(true);
    placeHero(state, quietFloor(state, level));
    const w = wand(state, WAN.digging);
    expect(zap(state, w, 'down')).toContain('You dig a pit in the floor.');
    const t = trapAt(level, heroAt(state).x, heroAt(state).y);
    expect(t?.def).toBe(TRAP.pit);
    expect(dataOf(t!).madeby_u).toBe(true);
    expect(level.sokoban).toBe(true);
  });

  test('pits the hero dug do not keep the rules once the puzzle pits are gone', () => {
    const { state, level } = special('soko4');
    const p = quietFloor(state, level);
    level.traps.push({ def: TRAP.pit, x: p.x, y: p.y, seen: true, data: { madeby_u: true } });
    run(state, (ctx) => {
      for (const t of [...level.traps])
        if (!dataOf(t).madeby_u) ctx.removeTrap(level.id, { x: t.x, y: t.y });
      maybeFinishSokoban(ctx, level.id);
    });
    expect(level.traps).toHaveLength(1);
    expect(level.sokoban).toBeUndefined();
  });

  test('its walls glow then fade', () => {
    const { state, level } = special('soko4');
    // a floor square with a wall to its east
    let at: Pos | null = null;
    for (let y = 1; y < level.height - 1 && !at; y++)
      for (let x = 1; x < level.width - 1 && !at; x++)
        if (
          cellOf(level, x, y) === T.floor &&
          cellOf(level, x + 1, y) === T.vwall &&
          itemsAt(defs, state, level.id, x, y).length === 0
        )
          at = { x, y };
    placeHero(state, at!);
    const w = wand(state, WAN.digging);
    expect(zap(state, w, 'e')).toContain('The wall glows then fades.');
    expect(cellOf(level, at!.x + 1, at!.y)).toBe(T.vwall);
  });
});

describe("Mines' End", () => {
  test('the bottom of the Mines: a pit, never a hole', () => {
    for (const from of [1, 41]) {
      const { state, level } = special('minend', from);
      expect(level.def?.startsWith('nh:minend-')).toBe(true);
      placeHero(state, quietFloor(state, level));
      const w = wand(state, WAN.digging);
      expect(zap(state, w, 'down')).toContain('You dig a pit in the floor.');
      expect(heroAt(state).level).toBe(level.id);
    }
  });

  test('the non-diggable areas follow the map block', () => {
    let seen = 0;
    for (let seed = 1; seed <= 60 && seen < 2; seed++) {
      const { level } = special('minend', seed);
      if (level.def !== 'nh:minend-3') continue;
      seen++;
      const def = defs.level(level.def);
      const inside = mapToLevel(def, level, 70, 5);
      const outside = mapToLevel(def, level, 40, 5);
      expect(nonDiggable({ defs }, level, inside.x, inside.y)).toBe(true);
      expect(nonDiggable({ defs }, level, outside.x, outside.y)).toBe(false);
      expect(cavernous({ defs }, level)).toBe(false);
    }
    expect(seen).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------

describe('immediate wands up and down', () => {
  test('teleportation down sends the objects under her away', () => {
    const m = mapSetup(['..........', '....@.....', '..........']);
    for (const id of ['nh:food_ration', 'nh:rock'])
      mksobj(ctxFor(m.state), obj(id), { init: false, at: { level: 'dlvl1', x: 4, y: 1 } });
    const w = wand(m.state, WAN.teleportation);
    zap(m.state, w, 'down');
    expect(itemsAt(defs, m.state, 'dlvl1', 4, 1)).toHaveLength(0);
    const elsewhere = Object.values(m.state.entities).filter(
      (e) => e.def === 'nh:food_ration' && e.c.pos?.level === 'dlvl1',
    );
    expect(elsewhere).toHaveLength(1);
  });

  test('probing: up the ceiling, down the floor', () => {
    const m = mapSetup(['...', '.@.', '...']);
    const w = wand(m.state, WAN.probing);
    expect(zap(m.state, w, 'up')).toEqual(
      expect.arrayContaining(['You probe towards the ceiling.', 'Your probe reveals nothing.']),
    );
    expect(zap(m.state, w, 'down')).toEqual(
      expect.arrayContaining(['You probe beneath the floor.', 'Your probe reveals nothing.']),
    );
  });

  test('locking down turns a hole into a trap door; striking shatters it back', () => {
    let fell = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const m = mapSetup(BIG, { seed });
      m.level.traps.push({ def: TRAP.hole, x: 2, y: 1, seen: true, data: { dst: 2 } });
      const lock = wand(m.state, WAN.locking);
      expect(zap(m.state, lock, 'down')).toContain('A trapdoor appears beneath you.');
      expect(trapAt(m.level, 2, 1)?.def).toBe(TRAP.trapdoor);
      expect(heroAt(m.state).level).toBe('dlvl1');
      const strike = wand(m.state, WAN.striking);
      expect(zap(m.state, strike, 'down')).toContain('The trapdoor beneath you shatters.');
      expect(trapAt(m.level, 2, 1)?.def).toBe(TRAP.hole);
      if (heroAt(m.state).level === 'dlvl2') fell++;
    }
    // a seen hole is escaped 1 time in 5
    expect(fell).toBeGreaterThan(0);
  });

  test('a ray zapped down stays on her square', () => {
    let hit = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const m = mapSetup(['.....', '..@..', '.....'], { seed });
      const w = wand(m.state, WAN.sleep);
      const text = zap(m.state, w, 'down');
      expect(text.some((t) => /bounces/.test(t))).toBe(false);
      if (text.includes('The sleep ray hits you!')) hit++;
      else expect(text).toContain('The sleep ray whizzes by you!');
    }
    expect(hit).toBeGreaterThan(0);
  });

  test('the direction prompt offers up and down for vanilla wands', () => {
    const m = mapSetup(['...', '.@.', '...']);
    const w = wand(m.state, WAN.digging);
    engine.step(m.state, { type: 'mod', action: 'nh:zap' as DefId, args: { item: w } });
    const values = (m.state.pendingPrompt?.prompt.options ?? []).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['up', 'down', 'self', 'n']));
  });
});
