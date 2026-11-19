// m17 step 1: Gehennom's layout and bottom. Its eleven special levels are placed at new game in
// dungeon.lua's order (each built from its own LevelDef but the Sanctum); the Sanctum is out of reach (dng_bottom():
// holes, trap doors and level teleports stop on the invocation level, "Sorry..." for a level
// teleport aimed at the bottom; wizard mode's #levelport gets through); the invocation level has no
// down stairs but the vibrating square. Outcomes are asserted over many seeds.
// ref: dat/dungeon.lua; src/dungeon.c level_range(), place_level(), Invocation_lev(),
// Can_dig_down(); src/trap.c dng_bottom(), hole_destination(), clamp_hole_destination(),
// trapeffect_vibrating_square(); src/teleport.c level_tele(), random_teleport_level();
// src/hack.c invocation_message(); src/do.c dodown(); src/mkmaze.c pick_vibrasquare_location()
import {
  createEngine,
  depthOf,
  getLevel,
  getPlayer,
  sortedIds,
  trapAt,
  type Ctx,
  type DefId,
  type DungeonLayout,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, vanillaMod, wizardMod } from '../src/index';
import {
  GEHENNOM,
  GEHENNOM_SPECIALS as G,
  canDigDown,
  dngBottom,
  gehennomSpecial,
  invocationLev,
  isValley,
} from '../src/levelflags';
import { mksobj } from '../src/items';
import { setIntrinsic } from '../src/props';
import { digCheck } from '../src/dig';
import { randomTeleportLevel, teleok } from '../src/teleport';
import {
  TRAP,
  canFallThru,
  dotrap,
  holeDestination,
  mHarmlessTrap,
  maketrap,
  mintrap,
  teleds,
} from '../src/trap';
import { levelportLevels } from '../src/wizard';
import { addMon, setup } from './helpers';
import { itemOf, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'gl',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'gl:run',
      labelKey: 'gl',
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
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'gl:run' as DefId }).events);
};
const hell = (state: GameState): DungeonLayout => state.dungeons.find((d) => d.id === GEHENNOM)!;
const where = (state: GameState): [string, number] => {
  const l = getLevel(state);
  return [l.dungeon, l.dlevel];
};

/** A new game on Gehennom level `dlevel` (counted from the bottom when negative), arrived by falling. */
function inGehennom(seed: number, dlevel: number): { state: GameState; level: Level; n: number } {
  const { state } = engine.newGame({ seed });
  const n = hell(state).levels!;
  run(state, (ctx) =>
    ctx.goToLevel({ dungeon: GEHENNOM, dlevel: dlevel < 0 ? n + dlevel + 1 : dlevel }, 'random'),
  );
  return { state, level: getLevel(state), n };
}

describe("Gehennom's layout", () => {
  const games = Array.from({ length: 120 }, (_, i) => engine.newGame({ seed: i + 1 }).state);

  test("the eleven special levels on dungeon.lua's levels, the tower's three in a row", () => {
    const wiz1 = new Set<number>();
    for (const state of games) {
      const g = hell(state);
      const n = g.levels!;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(24);
      const at = (id: string): number => g.special.find((s) => s.id === id)?.dlevel ?? -1;
      expect(g.special.map((s) => s.id)).toEqual(Object.values(G));
      expect(new Set(g.special.map((s) => s.dlevel)).size).toBe(11);
      expect(at(G.valley)).toBe(1);
      expect(at(G.sanctum)).toBe(n);
      const inRange = (id: string, lo: number, hi: number): void => {
        expect(at(id)).toBeGreaterThanOrEqual(lo);
        expect(at(id)).toBeLessThanOrEqual(hi);
      };
      inRange(G.juiblex, 4, 7);
      inRange(G.baalz, 6, 9);
      inRange(G.asmodeus, 2, 7);
      inRange(G.wizard1, 11, 16);
      inRange(G.orcus, 10, 15);
      inRange(G.fakewiz1, n - 5, n - 2);
      inRange(G.fakewiz2, n - 5, n - 2);
      expect(at(G.wizard2)).toBe(at(G.wizard1) + 1);
      expect(at(G.wizard3)).toBe(at(G.wizard1) + 2);
      wiz1.add(at(G.wizard1));
    }
    expect(wiz1.size).toBe(6);
  });

  test('the special levels are built, the Sanctum too; the predicates know each by its id', () => {
    const { state, level } = inGehennom(3, 1);
    expect(level.def).toBe(G.valley); // m17 step 2
    expect(isValley(state)).toBe(true);
    expect(gehennomSpecial(state, level)).toBe(G.valley);
    const orcus = hell(state).special.find((s) => s.id === G.orcus)!;
    expect(gehennomSpecial(state, { dungeon: GEHENNOM, dlevel: orcus.dlevel })).toBe(G.orcus);
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: orcus.dlevel }, 'random'));
    expect(getLevel(state).def).toBe('nh:orcus-town'); // m17 step 7
    const wiz = hell(state).special.find((s) => s.id === G.fakewiz1)!;
    expect(gehennomSpecial(state, { dungeon: GEHENNOM, dlevel: wiz.dlevel })).toBe(G.fakewiz1);
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: wiz.dlevel }, 'random'));
    expect(getLevel(state).def).toBe('nh:fakewiz1'); // m17 step 8
    // the Sanctum (out of reach but for wizard mode) is its own level (m23 step 3)
    const sanctum = hell(state).special.find((s) => s.id === G.sanctum)!;
    expect(gehennomSpecial(state, { dungeon: GEHENNOM, dlevel: sanctum.dlevel })).toBe(G.sanctum);
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: sanctum.dlevel }, 'random'));
    expect(getLevel(state).def).toBe('nh:sanctum');
    // an ordinary level has none, and the main dungeon's specials are not Gehennom's
    const taken = new Set(hell(state).special.map((s) => s.dlevel));
    const plain = [...Array(hell(state).levels!).keys()]
      .map((i) => i + 1)
      .find((d) => !taken.has(d))!;
    expect(gehennomSpecial(state, { dungeon: GEHENNOM, dlevel: plain })).toBeNull();
    expect(gehennomSpecial(state, { dungeon: 'nh:main', dlevel: 5 })).toBeNull();
  });
});

describe("Gehennom's bottom", () => {
  test('holes and trap doors never lead past the invocation level', () => {
    const { state, n } = inGehennom(1, -3);
    run(state, (ctx) => {
      const above = getLevel(ctx.state);
      expect(dngBottom(ctx.state, above)).toBe(n - 1);
      for (let i = 0; i < 200; i++) expect(holeDestination(ctx, above)).toBe(n - 1);
      expect(canFallThru(ctx.state, above)).toBe(true);
      expect(canDigDown(ctx, above)).toBe(true);
    });
  });

  test('a trap door on the level above the invocation level stops there, even an old one', () => {
    for (const stored of [undefined, 99]) {
      const { state, level, n } = inGehennom(2, -3);
      const p = getPlayer(state).c.pos!;
      run(state, (ctx) => {
        const t = maketrap(ctx, level.id, p.x, p.y, TRAP.trapdoor);
        // a destination stored before the bottom moved (an old save) is clamped
        if (stored !== undefined) t.data = { dst: stored };
        dotrap(ctx, t);
      });
      expect(where(state)).toEqual([GEHENNOM, n - 1]);
    }
  });

  test('the invocation level: no holes or trap doors, no digging down', () => {
    const { state, level } = inGehennom(4, -2);
    expect(invocationLev(state, level)).toBe(true);
    run(state, (ctx) => {
      expect(canFallThru(ctx.state, level)).toBe(false);
      expect(canDigDown(ctx, level)).toBe(false);
      expect(dngBottom(ctx.state, level)).toBe(level.dlevel);
    });
    expect(level.traps.some((t) => t.def === TRAP.trapdoor || t.def === TRAP.hole)).toBe(false);
  });

  test('a controlled level teleport aimed at the bottom says "Sorry..." and stops above it', () => {
    const { state, n } = inGehennom(5, 3);
    plainKit(state);
    setIntrinsic(getPlayer(state), P.TELEPORT_CONTROL, true);
    let scroll = -1;
    run(state, (ctx) => {
      scroll = mksobj(ctx, ctx.defs.object('nh:scroll_of_teleportation' as DefId), {
        init: false,
        carriedBy: ctx.state.playerId,
      });
    });
    itemOf(state, scroll).buc = 'cursed';
    engine.step(state, { type: 'mod', action: 'nh:read' as DefId, args: { item: scroll } });
    expect(state.pendingPrompt?.prompt.id).toBe('tele-level');
    const sanctum = depthOf(state, { dungeon: GEHENNOM, dlevel: n });
    const t = texts(
      engine.step(state, { type: 'answer', promptId: 'tele-level', value: String(sanctum) }).events,
    );
    expect(t).toContain('Sorry...');
    expect(where(state)).toEqual([GEHENNOM, n - 1]);
  });

  test('random level teleports from Gehennom stop on the invocation level', () => {
    const { state, level, n } = inGehennom(6, -2);
    const bottom = depthOf(state, { dungeon: GEHENNOM, dlevel: n - 1 });
    let deepest = 0;
    run(state, (ctx) => {
      for (let i = 0; i < 300; i++) deepest = Math.max(deepest, randomTeleportLevel(ctx, level));
    });
    expect(deepest).toBeLessThanOrEqual(bottom);
  });

  test('wizard mode may levelport to the bottom', () => {
    const wizard = createEngine([vanillaMod, wizardMod]);
    const { state } = wizard.newGame({ seed: 7 });
    const n = hell(state).levels!;
    expect(levelportLevels({ state }, GEHENNOM)).toBe(n);
    wizard.step(state, { type: 'mod', action: 'wiz:levelport' as DefId });
    wizard.step(state, {
      type: 'answer',
      promptId: state.pendingPrompt!.prompt.id,
      value: GEHENNOM,
    });
    const t = texts(
      wizard.step(state, { type: 'answer', promptId: state.pendingPrompt!.prompt.id, value: n })
        .events,
    );
    expect(t).not.toContain('Sorry...');
    expect(where(state)).toEqual([GEHENNOM, n]);
  });
});

/** The vibrating square of `level`. */
const square = (level: Level): Pos => {
  const t = level.traps.find((x) => x.def === TRAP.vibrating);
  if (!t) throw new Error('no vibrating square');
  return { x: t.x, y: t.y };
};

describe('the invocation level', () => {
  test('no down stairs; one vibrating square, away from the up stairs and on open ground', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state, level } = inGehennom(seed, -2);
      expect(level.down).toBeNull();
      expect(level.up).not.toBeNull();
      expect(level.traps.filter((t) => t.def === TRAP.vibrating)).toHaveLength(1);
      const sq = square(level);
      const up = level.up!;
      // pick_vibrasquare_location(): not in line with the up stairs, more than 11 squares away
      expect(sq.x).not.toBe(up.x);
      expect(sq.y).not.toBe(up.y);
      expect(Math.abs(sq.x - up.x)).not.toBe(Math.abs(sq.y - up.y));
      expect(Math.max(Math.abs(sq.x - up.x), Math.abs(sq.y - up.y))).toBeGreaterThan(11);
      expect(['nh:floor', 'nh:corr', 'nh:ice']).toContain(
        level.palette[level.cells[sq.y * level.width + sq.x]!],
      );
      // no down stairs terrain anywhere
      expect(level.cells.some((c) => level.palette[c] === 'nh:stairs_down')).toBe(false);
      expect(invocationLev(state, level)).toBe(true);
    }
  });

  test('the level above and the Sanctum are ordinary (stairs both ways / up only)', () => {
    const above = inGehennom(1, -3).level;
    expect(above.down).not.toBeNull();
    expect(above.traps.some((t) => t.def === TRAP.vibrating)).toBe(false);
  });

  test('stepping on it: "You feel a strange vibration under your feet."; ">" there: "not yet"', () => {
    const { state, level } = inGehennom(2, -2);
    const sq = square(level);
    const t = run(state, (ctx) => teleds(ctx, sq.x, sq.y));
    expect(t).toContain('You feel a strange vibration under your feet.');
    expect(trapAt(level, sq.x, sq.y)?.seen).toBe(true);
    const d = texts(engine.step(state, { type: 'mod', action: 'nh:down' as DefId }).events);
    expect(d).toContain("You can't go down here yet.");
    expect(where(state)).toEqual([GEHENNOM, level.dlevel]);
    // floating: "beneath you"
    setIntrinsic(getPlayer(state), P.LEVITATION, true);
    const f = run(state, (ctx) => teleds(ctx, sq.x, sq.y));
    expect(f).toContain('You feel a strange vibration beneath you.');
  });

  test('walking onto it gives the clue too', () => {
    const { state, level } = inGehennom(3, -2);
    const sq = square(level);
    const dirs = [
      ['n', 0, -1],
      ['s', 0, 1],
      ['e', 1, 0],
      ['w', -1, 0],
    ] as const;
    const open = (x: number, y: number): boolean =>
      ['nh:floor', 'nh:corr'].includes(level.palette[level.cells[y * level.width + x]!] ?? '');
    const from = dirs.find(([, dx, dy]) => open(sq.x - dx, sq.y - dy))!;
    for (const id of sortedIds(state)) {
      const m = state.entities[String(id)];
      if (m?.c.monster && id !== state.playerId && m.c.pos?.level === level.id)
        delete state.entities[String(id)];
    }
    getPlayer(state).c.pos = { level: level.id, x: sq.x - from[1], y: sq.y - from[2] };
    const t = texts(engine.step(state, { type: 'move', dir: from[0] }).events);
    expect(getPlayer(state).c.pos).toMatchObject(sq);
    expect(t).toContain('You feel a strange vibration under your feet.');
  });

  test('a monster on it, seen: "You see a strange vibration beneath the hill orc\'s feet."', () => {
    const s = setup(['.....', '.@...', '.....']);
    run(s.state, (ctx) => void maketrap(ctx, 'dlvl1', 3, 1, TRAP.vibrating));
    const id = addMon(s.state, 'nh:hill_orc', 3, 1);
    s.wait();
    const t = run(s.state, (ctx) => void mintrap(ctx, id, { force: true }));
    expect(t).toContain("You see a strange vibration beneath the hill orc's feet.");
    const bat = addMon(s.state, 'nh:giant_bat', 3, 1);
    const b = run(s.state, (ctx) => void mintrap(ctx, bat, { force: true }));
    expect(b).toContain('You see a strange vibration beneath the giant bat.');
  });

  test('nothing replaces it or digs it away; monsters and teleports do not mind it', () => {
    const s = setup(['.....', '.@...', '.....']);
    run(s.state, (ctx) => {
      maketrap(ctx, 'dlvl1', 3, 1, TRAP.vibrating);
      maketrap(ctx, 'dlvl1', 3, 1, TRAP.pit);
    });
    expect(trapAt(getLevel(s.state), 3, 1)?.def).toBe(TRAP.vibrating);
    const id = addMon(s.state, 'nh:hill_orc', 3, 2);
    run(s.state, (ctx) => {
      const level = getLevel(ctx.state);
      // dig_check(): DIGCHECK_FAIL_UNDESTROYABLETRAP
      expect(digCheck(ctx, level, 3, 1)).toBe('toohard');
      // teleok(): "not a real trap"
      expect(teleok(ctx, level, 3, 1, false)).toBe(true);
      // m_harmless_trap()
      expect(mHarmlessTrap(ctx, ctx.state.entities[String(id)]!, trapAt(level, 3, 1)!)).toBe(true);
    });
  });
});
