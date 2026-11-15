// m15 step 9: the dungeon. nh:main gets NetHack's size (25-29 levels) and its special levels (the
// Oracle, the big room in 40% of games, Medusa 1-4 levels above the bottom, the Castle last);
// Gehennom's stub hangs below the Castle with no stairs at the Castle's end; the passtune is drawn
// at new game; the Castle's trap doors and level teleports past the bottom lead into Gehennom,
// whose levels are mazes, whose prayers go unanswered and whose monsters are Gehennom's. Outcomes
// are asserted over many seeds or with pinned monsters.
// ref: dat/dungeon.lua; src/dungeon.c init_dungeons(), init_castle_tune(), Can_fall_thru(),
// find_hell(); src/trap.c fall_through(), mlevel_tele_trap(); src/teleport.c level_tele();
// src/do.c goto_level(); src/pray.c prayer_done(); src/makemon.c uncommon(), rndmonst_adj()
import { levelTemperature } from '../src/temperature';
import {
  createEngine,
  getLevel,
  getPlayer,
  levelStairs,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, rndmonst, setU, vanillaMod, wizardMod } from '../src/index';
import { castleTune, gehennomEntered } from '../src/dbstate';
import { GEHENNOM, inHell, isStronghold, medusaDepth } from '../src/levelflags';
import { setIntrinsic } from '../src/props';
import { TRAP, dotrap, mintrap } from '../src/trap';
import { addMon, setup } from './helpers';
import { itemOf, levelSetup, plainKit, render } from './itemHelpers';

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
const wizard = createEngine([vanillaMod, wizardMod]);
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'dg:run' as DefId }).events);
};

const main = (state: GameState) => state.dungeons.find((d) => d.id === 'nh:main')!;
const gehennom = (state: GameState) => state.dungeons.find((d) => d.id === GEHENNOM)!;
const special = (state: GameState, id: string) => main(state).special.find((s) => s.id === id);
const monsOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.monster && e.c.pos?.level === level.id && e.id !== state.playerId);

/** A new game on the Castle (arriving by falling, as from a level teleport). */
function castle(seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  const dlevel = main(state).levels!;
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'random'));
  return { state, level: getLevel(state) };
}

describe('the dungeon layout', () => {
  const games = Array.from({ length: 200 }, (_, i) => engine.newGame({ seed: i + 1 }).state);

  test('the main dungeon has 25-29 levels with the Castle last and Medusa 1-4 above it', () => {
    const sizes = new Set<number>();
    for (const state of games) {
      const n = main(state).levels!;
      sizes.add(n);
      expect(n).toBeGreaterThanOrEqual(25);
      expect(n).toBeLessThanOrEqual(29);
      expect(special(state, 'nh:castle')?.dlevel).toBe(n);
      const medusa = special(state, 'nh:medusa')!.dlevel;
      expect(n - medusa).toBeGreaterThanOrEqual(1);
      expect(n - medusa).toBeLessThanOrEqual(4);
      expect(medusaDepth(state)).toBe(medusa);
      const oracle = special(state, 'nh:oracle')!.dlevel;
      expect(oracle).toBeGreaterThanOrEqual(5);
      expect(oracle).toBeLessThanOrEqual(9);
    }
    expect(sizes).toEqual(new Set([25, 26, 27, 28, 29]));
  });

  test('the big room is on DL10-12 in about 40% of games', () => {
    let made = 0;
    for (const state of games) {
      const big = special(state, 'nh:bigroom');
      if (!big) continue;
      made++;
      expect(big.dlevel).toBeGreaterThanOrEqual(10);
      expect(big.dlevel).toBeLessThanOrEqual(12);
    }
    expect(made).toBeGreaterThan(games.length * 0.3);
    expect(made).toBeLessThan(games.length * 0.5);
  });

  test('Gehennom: 20-24 levels right below the Castle, connected without stairs on the Castle', () => {
    for (const state of games) {
      const g = gehennom(state);
      expect(g.levels).toBeGreaterThanOrEqual(20);
      expect(g.levels).toBeLessThanOrEqual(24);
      const n = main(state).levels!;
      expect(g.depthStart).toBe(n + 1);
      expect(main(state).branches).toContainEqual({ to: GEHENNOM, dlevel: n, stairs: 'child' });
    }
    const state = games[0]!;
    const n = main(state).levels!;
    // the Castle: up stairs only; Gehennom's first level: its stairs up to the Castle and down
    expect(levelStairs(state, { dungeon: 'nh:main', dlevel: n })).toEqual({
      up: true,
      down: false,
    });
    expect(levelStairs(state, { dungeon: GEHENNOM, dlevel: 1 })).toEqual({
      up: false,
      down: true,
      branch: { to: { dungeon: 'nh:main', dlevel: n }, dir: 'up' },
    });
  });

  test('the passtune is drawn at new game: five notes A-G, different between games', () => {
    const tunes = new Set(games.map((state) => castleTune({ state })));
    for (const t of tunes) expect(t).toMatch(/^[A-G]{5}$/);
    expect(tunes.size).toBeGreaterThan(150);
  });
});

describe('the Castle and Gehennom', () => {
  test('the Castle is built with real trap doors and no down or branch stairs', () => {
    const { state, level } = castle(1);
    expect(level.def).toBe('nh:castle');
    expect(isStronghold(state, level)).toBe(true);
    expect(level.down).toBeNull();
    expect(level.branch).toBeNull();
    const doors = level.traps.filter((t) => t.def === TRAP.trapdoor);
    expect(doors).toHaveLength(5);
    // castle.lua's five spots (40,08) .. (55,08), none turned into a falling rock trap (the maze
    // around the fortress gets random traps, which may be falling rock traps)
    const [first] = doors;
    expect(doors.map((t) => [t.x - first!.x, t.y - first!.y])).toEqual([
      [0, 0],
      [4, 0],
      [8, 0],
      [12, 0],
      [15, 0],
    ]);
  });

  test('her fall through a Castle trap door lands in the Valley of the Dead (m17)', () => {
    const { state, level } = castle(2);
    const door = level.traps.find((t) => t.def === TRAP.trapdoor)!;
    getPlayer(state).c.pos = { level: level.id, x: door.x, y: door.y };
    const t = run(state, (ctx) => dotrap(ctx, door));
    expect(t).toContain('A trap door opens up under you!');
    expect(t).toContain('You arrive at the Valley of the Dead...');
    const here = getLevel(state);
    expect([here.dungeon, here.dlevel]).toEqual([GEHENNOM, 1]);
    expect(here.def).toBe('nh:valley');
    expect(inHell(state)).toBe(true);
    expect(gehennomEntered({ state })).toBe(false); // not until the Valley's gate
    // a fall from one level up: d(1, 6)
    expect(getPlayer(state).c.hp!.max - getPlayer(state).c.hp!.cur).toBeLessThanOrEqual(6);
  });

  test('a monster on a Castle trap door falls into Gehennom', () => {
    const { state, level } = castle(3);
    const door = level.traps.find((t) => t.def === TRAP.trapdoor)!;
    for (const m of monsOn(state, level))
      if (m.c.pos?.x === door.x && m.c.pos.y === door.y) delete state.entities[String(m.id)];
    const id = addMon(state, 'nh:hill_orc', door.x, door.y);
    const mon = state.entities[String(id)]!;
    mon.c.pos = { level: level.id, x: door.x, y: door.y };
    run(state, (ctx) => expect(mintrap(ctx, id)).toBe('moved'));
    expect(state.entities[String(id)]?.c.pos).toBeUndefined();
    // it comes out when she gets there
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 1 }, 'random'));
    expect(state.entities[String(id)]?.c.pos?.level).toBe(getLevel(state).id);
  });

  test("Gehennom's up stairs lead to the Castle's east bank (its 'up' teleport region)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state } = castle(seed);
      run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 1 }, 'random'));
      const g1 = getLevel(state);
      expect(g1.branch?.dir).toBe('up');
      expect(g1.up).toBeNull();
      expect(g1.down).not.toBeNull();
      run(state, (ctx) => ctx.goToLevel(g1.branch!.to, 'branch'));
      const here = getLevel(state);
      expect(here.def).toBe('nh:castle');
      // castle.lua: des.teleport_region({ region = {69,00,79,20}, ..., dir="up" })
      expect(getPlayer(state).c.pos!.x).toBeGreaterThanOrEqual(68);
    }
  });

  test("Gehennom's levels are hellfill's; from the temperate Valley, the level's temperature", () => {
    const { state } = castle(4);
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 1 }, 'random'));
    const t = run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 2 }, 'up'));
    const g2 = getLevel(state);
    expect(g2.def).toBe('nh:hellfill'); // m17 step 3
    const cold = levelTemperature({ state, defs: engine.registry }, g2) < 0;
    expect(t).toEqual(
      expect.arrayContaining(
        cold ? ['It is cold here.'] : ['It is hot here.', 'You smell smoke...'],
      ),
    );
    expect(g2.up).not.toBeNull();
    expect(g2.branch).toBeNull();
  });

  test('a level teleport past the bottom of the main dungeon goes to Gehennom', () => {
    // ROOM on a vanilla-sized level: the Valley's map needs 76x20
    const s = levelSetup(
      [
        ...ROOM.map((r) => r.padEnd(80, ' ')),
        ...Array.from({ length: 21 - ROOM.length }, () => ' '.repeat(80)),
      ],
      1,
    );
    plainKit(s.state);
    s.step({ type: 'wait' });
    setIntrinsic(getPlayer(s.state), P.TELEPORT_CONTROL, true);
    const scroll = s.carry('nh:scroll_of_teleportation');
    itemOf(s.state, scroll).buc = 'cursed';
    expect(s.mod('nh:read', { item: scroll }).prompt?.id).toBe('tele-level');
    engine.step(s.state, { type: 'answer', promptId: 'tele-level', value: '99' });
    const here = getLevel(s.state);
    expect([here.dungeon, here.dlevel]).toEqual([GEHENNOM, 1]);
  });
});

/** A 20x5 lit floor room (stone around it), the hero at (2,2); tall enough for a new level. */
const ROOM = [
  '                      ',
  ' .................... ',
  ' .@.................. ',
  ' .................... ',
  ' .................... ',
  ' .................... ',
  '                      ',
  '                      ',
  '                      ',
  '                      ',
  '                      ',
];

describe('in Gehennom', () => {
  test('prayer: no shimmering light, "Since you are in Gehennom, Odin can\'t help you."', () => {
    const s = setup(['.....', '..@..', '.....']);
    s.level.dungeon = GEHENNOM;
    setU({ state: s.state }, { alignRecord: 10 });
    const ask = s.engine.step(s.state, { type: 'mod', action: 'nh:pray' as DefId });
    const t = texts(
      s.engine.step(s.state, { type: 'answer', promptId: ask.prompt!.id, value: true }).events,
    );
    expect(t).toContain('You begin praying to Odin.');
    expect(t).not.toContain('You are surrounded by a shimmering light.');
    expect(t).toContain('You finish your prayer.');
    expect(t).toContain("Since you are in Gehennom, Odin can't help you.");
    expect(t).not.toContain('You feel a hopeful feeling.');
  });

  test('random monsters: Gehennom-only kinds may come, never-in-Gehennom and lawful ones never', () => {
    const s = setup(['.....', '..@..', '.....']);
    const defs = s.engine.registry;
    s.level.dungeon = GEHENNOM;
    const seen = new Set<DefId>();
    run(s.state, (ctx) => {
      for (let i = 0; i < 3000; i++) {
        const m = rndmonst(ctx, 40);
        if (m) seen.add(m.id);
      }
    });
    expect(seen.size).toBeGreaterThan(20);
    for (const id of seen) {
      const d = defs.monster(id);
      expect(d.genFlags, id).not.toContain('nohell');
      expect(d.alignment, id).toBeLessThanOrEqual(0);
    }
    const hellOnly = defs.monsters.filter((m) => m.genFlags.includes('hell')).map((m) => m.id);
    expect(hellOnly.some((id) => seen.has(id))).toBe(true);
  });
});

describe('wizard mode', () => {
  test('wiz:where names the Castle, Medusa and the big room and shows the connection', () => {
    const state = Array.from({ length: 20 }, (_, i) => engine.newGame({ seed: i + 1 }).state).find(
      (st) => special(st, 'nh:bigroom'),
    )!;
    const t = texts(wizard.step(state, { type: 'mod', action: 'wiz:where' as DefId }).events);
    const n = main(state).levels!;
    expect(t).toContain(`The Dungeons of Doom: levels 1 to ${n}`);
    expect(t).toContain(`   Connection to Gehennom: ${n}`);
    expect(t).toContain(`  Castle: ${n}`);
    expect(t).toContain(`  Medusa: ${special(state, 'nh:medusa')!.dlevel}`);
    expect(t).toContain(`  Big Room: ${special(state, 'nh:bigroom')!.dlevel}`);
    expect(t).toContain(`Gehennom: levels ${n + 1} to ${n + gehennom(state).levels!}`);
  });
});
