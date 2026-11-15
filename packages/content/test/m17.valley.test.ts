// m17 step 2: the Valley of the Dead. The level builds from valley.lua (map, the three path
// blocks, the temple of Moloch with its priest, three morgues with their graves, the corpses,
// traps and undead, locked secret doors, stairs and branch); arriving from outside Gehennom gives
// its three lines and its down stairs ask at the gate; morgue levels and the Castle are
// graveyards where undead seldom leave corpses; the player-monster rows; magic mapping fails
// there. Outcomes are asserted over many seeds.
// ref: dat/valley.lua; src/do.c goto_level(), dodown(); src/mkroom.c fill_zoo(); src/mklev.c
// mklev(); src/mon.c make_corpse(), corpse_chance(), xkilled(); src/mkobj.c mk_tt_object();
// src/read.c seffect_magic_mapping()
import { levelTemperature } from '../src/temperature';
import {
  createEngine,
  getLevel,
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, vanillaMod } from '../src/index';
import { A_NONE } from '../src/aligntyp';
import { xkilledCorpse } from '../src/corpses';
import { gehennomEntered } from '../src/dbstate';
import { TEMPLE, epriOf } from '../src/epri';
import { mkclass } from '../src/generation';
import { isGraveyard, setGraveyard } from '../src/graveyard';
import { mksobj } from '../src/items';
import { GEHENNOM, GEHENNOM_SPECIALS as G, levelFlags, nonDiggable } from '../src/levelflags';
import { MPLAYERS, isMplayer } from '../src/mondata';
import { timeoutLeft } from '../src/props';
import { mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { TRAP } from '../src/trap';
import { VALLEY } from '../src/valley';
import { MORGUE, mkTtObject } from '../src/zoo';
import { itemOf, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'vl',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'vl:run',
      labelKey: 'vl',
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
  return texts(engine.step(state, { type: 'mod', action: 'vl:run' as DefId }).events);
};

/** A new game whose hero fell into Gehennom level `dlevel`; the arrival's messages. */
function arrive(seed: number, dlevel = 1): { state: GameState; level: Level; text: string[] } {
  const { state } = engine.newGame({ seed });
  const text = run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random'));
  return { state, level: getLevel(state), text };
}

/** The Level position of a valley.lua (map) spot. */
const at = (level: Level, x: number, y: number): Pos => mapToLevel(VALLEY, level, x, y);
const ter = (level: Level, x: number, y: number): DefId => {
  const p = at(level, x, y);
  return terrainIdAt(level, p.x, p.y)!;
};
const isWall = (level: Level, x: number, y: number): boolean =>
  !engine.registry.terrain(ter(level, x, y)).passable;
const onLevel = (state: GameState, level: Level): Entity[] =>
  Object.values(state.entities).filter((e) => e.c.pos?.level === level.id);
const ARRIVAL = [
  'You arrive at the Valley of the Dead...',
  'The odor of burnt flesh and decay pervades the air.',
  'You hear groans and moans everywhere.',
];

describe('the Valley of the Dead', () => {
  const games = Array.from({ length: 12 }, (_, i) => arrive(i + 1));

  test("valley.lua's map on 80x21: stairs down at its corner, the branch back to the Castle", () => {
    for (const { state, level } of games) {
      expect(level.def).toBe(G.valley);
      expect([level.width, level.height]).toEqual([80, 21]);
      expect(level.down).toEqual(at(level, 1, 1));
      expect(level.up).toBeNull();
      expect(level.branch?.pos).toEqual(at(level, 66, 17));
      expect(level.branch?.dir).toBe('up');
      expect(level.branch?.to.dungeon).toBe('nh:main');
      const castle = state.dungeons.find((d) => d.id === 'nh:main')!;
      expect(level.branch?.to.dlevel).toBe(castle.levels);
      // the three locked secret doors
      for (const [x, y] of [
        [4, 1],
        [8, 4],
        [6, 6],
      ] as const)
        expect([T.sdoor_locked_v, T.sdoor_locked_h]).toContain(ter(level, x, y));
      // the fixed traps
      for (const [id, x, y] of [
        [TRAP.spikedPit, 5, 2],
        [TRAP.spikedPit, 14, 5],
        [TRAP.sleepGas, 3, 1],
        [TRAP.squeaky, 21, 12],
        [TRAP.dart, 60, 1],
        [TRAP.dart, 26, 17],
      ] as const) {
        const p = at(level, x, y);
        expect(trapAt(level, p.x, p.y)?.def).toBe(id);
      }
    }
  });

  test('the flags: no teleport, a hard floor, a maze level, no magic mapping, temperate', () => {
    const { state, level } = games[0]!;
    run(state, (ctx) => {
      expect(levelFlags(ctx, level)).toMatchObject({
        noteleport: true,
        hardfloor: true,
        maze: true,
        nommap: true,
        temperate: true,
      });
      // non-diggable walls everywhere on the map
      expect(nonDiggable(ctx, level, at(level, 0, 0).x, at(level, 0, 0).y)).toBe(true);
      expect(nonDiggable(ctx, level, at(level, 75, 19).x, at(level, 75, 19).y)).toBe(true);
    });
  });

  test('the path blocks: each of the three percent(50) edits goes one way or the other', () => {
    const seen = [new Set<boolean>(), new Set<boolean>(), new Set<boolean>()];
    for (const { level } of games) {
      // a wall here goes with an opened boundary there
      const blocks: [boolean, boolean][] = [
        [isWall(level, 50, 8), !isWall(level, 40, 8)],
        [isWall(level, 27, 12), !isWall(level, 28, 3)],
        [isWall(level, 16, 10), !isWall(level, 9, 13)],
      ];
      blocks.forEach(([a, b], i) => {
        expect(a).toBe(b);
        seen[i]!.add(a);
      });
      // the map's own boundaries are floor
      expect(isWall(level, 18, 9)).toBe(false);
      expect(isWall(level, 39, 15)).toBe(false);
    }
    for (const s of seen) expect(s.size).toBe(2);
  });

  test('the temple of Moloch: an unaligned shrine and its priest', () => {
    for (const { state, level } of games) {
      const altar = at(level, 3, 10);
      expect(terrainIdAt(level, altar.x, altar.y)).toBe(T.altar_unaligned);
      expect(level.shrines).toEqual([altar]);
      const lo = at(level, 1, 6);
      const hi = at(level, 5, 14);
      const temple = level.rooms.findIndex((r) => r.type === TEMPLE);
      expect(level.rooms[temple]).toMatchObject({ lx: lo.x, ly: lo.y, hx: hi.x, hy: hi.y });
      const priests = onLevel(state, level).filter((e) => epriOf({ state }, e.id) !== null);
      expect(priests).toHaveLength(1);
      expect(epriOf({ state }, priests[0]!.id)).toMatchObject({ shralign: A_NONE, shroom: temple });
    }
  });

  test('three graveyards: morgues full of undead, with graves; the level is a graveyard', () => {
    let graves = 0;
    for (const { state, level } of games) {
      const morgues = level.rooms.filter((r) => r.type === MORGUE);
      expect(morgues).toHaveLength(3);
      const rect = (x1: number, y1: number, x2: number, y2: number) => {
        const lo = at(level, x1, y1);
        const hi = at(level, x2, y2);
        return { lx: lo.x, ly: lo.y, hx: hi.x, hy: hi.y };
      };
      expect(morgues[0]).toMatchObject(rect(18, 1, 26, 8));
      expect(morgues[1]).toMatchObject(rect(9, 14, 16, 18));
      expect(morgues[2]).toMatchObject(rect(37, 9, 46, 14));
      for (const r of morgues)
        for (let x = r.lx; x <= r.hx; x++)
          for (let y = r.ly; y <= r.hy; y++) if (terrainIdAt(level, x, y) === T.grave) graves++;
      expect(isGraveyard(state, level.id)).toBe(true);
      const undead = onLevel(state, level).filter(
        (e) => e.c.monster && engine.registry.monster(e.def).flags.includes('undead'),
      );
      expect(undead.length).toBeGreaterThan(30);
    }
    expect(graves).toBeGreaterThan(12);
  });

  test("the adventurers' corpses, the ghosts, bats and the lich", () => {
    for (const { state, level } of games) {
      const here = onLevel(state, level);
      const corpses = here.filter((e) => e.def === 'nh:corpse').map((e) => e.c.item!.corpseOf);
      const count = (pm: string): number => corpses.filter((c) => c === pm).length;
      for (const pm of [
        'nh:archeologist',
        'nh:barbarian',
        'nh:healer',
        'nh:knight',
        'nh:ranger',
        'nh:rogue',
        'nh:samurai',
        'nh:tourist',
        'nh:wizard',
        'nh:human', // the valkyries
      ])
        expect(count(pm)).toBeGreaterThanOrEqual(2);
      expect(count('nh:caveman')).toBeGreaterThanOrEqual(2); // and the cavewoman
      const mons = (id: string): number => here.filter((e) => e.c.monster && e.def === id).length;
      expect(mons('nh:ghost')).toBeGreaterThanOrEqual(6);
      expect(mons('nh:vampire_bat')).toBeGreaterThanOrEqual(3);
      expect(here.some((e) => e.c.monster && engine.registry.monster(e.def).glyph.ch === 'L')).toBe(
        true,
      );
    }
  });
});

describe('entering Gehennom', () => {
  test('arriving on the Valley from outside: its three lines, not yet entered', () => {
    const { state, text } = arrive(1);
    expect(text.slice(0, 3)).toEqual(ARRIVAL);
    expect(text).not.toContain('It is hot here.');
    expect(gehennomEntered({ state })).toBe(false);
  });

  test("arriving on another Gehennom level: its temperature's lines, and Gehennom is entered", () => {
    const { state, text, level } = arrive(2, 3);
    if (levelTemperature({ state, defs: engine.registry }, level) < 0)
      expect(text).toContain('It is cold here.');
    else expect(text).toEqual(expect.arrayContaining(['It is hot here.', 'You smell smoke...']));
    expect(text).not.toContain(ARRIVAL[0]);
    expect(gehennomEntered({ state })).toBe(true);
  });

  test("the Valley's down stairs ask at the gate; no goes nowhere, yes goes down, once", () => {
    const { state, level } = arrive(3);
    const hero = getPlayer(state);
    const down = (): string[] =>
      texts(engine.step(state, { type: 'mod', action: 'nh:down' as DefId }).events);
    const answer = (value: boolean): string[] =>
      texts(engine.step(state, { type: 'answer', promptId: 'gehennom-gate', value }).events);
    hero.c.pos = { level: level.id, ...level.down! };
    const turn = state.turn;
    expect(down()).toEqual([
      'You are standing at the gate to Gehennom.',
      'Unspeakable cruelty and harm lurk down there.',
    ]);
    expect(state.pendingPrompt?.prompt.id).toBe('gehennom-gate');
    expect(render({ key: state.pendingPrompt!.prompt.key })).toBe(
      'Are you sure you want to enter?',
    );
    answer(false);
    expect(getLevel(state).id).toBe(level.id);
    expect(state.turn).toBe(turn);
    expect(gehennomEntered({ state })).toBe(false);
    down();
    expect(answer(true)).toContain('So be it.');
    expect(getLevel(state)).toMatchObject({ dungeon: GEHENNOM, dlevel: 2 });
    expect(gehennomEntered({ state })).toBe(true);
    // back up and down again: no question
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 1 }, 'down'));
    hero.c.pos = { level: level.id, ...level.down! };
    const again = down();
    expect(again).not.toContain('You are standing at the gate to Gehennom.');
    expect(state.pendingPrompt).toBeNull();
    expect(getLevel(state)).toMatchObject({ dungeon: GEHENNOM, dlevel: 2 });
  });
});

describe('graveyards', () => {
  /** Corpses left by `n` deaths of `pm` on the hero's level. */
  const corpsesLeft = (state: GameState, pm: string, n: number): number => {
    const p = getPlayer(state).c.pos!;
    const corpses = (): number =>
      Object.values(state.entities)
        .filter((e) => e.def === 'nh:corpse' && e.c.pos?.level === p.level)
        .reduce((a, e) => a + e.c.item!.quantity, 0);
    const before = corpses();
    run(state, (ctx) => {
      const def = ctx.defs.monster(pm as DefId);
      for (let i = 0; i < n; i++) xkilledCorpse(ctx, def, { level: p.level, x: p.x, y: p.y });
    });
    return corpses() - before;
  };

  test('undead leave a corpse 1 time in 3 on a graveyard level, others as anywhere', () => {
    // a giant zombie (huge) always leaves one elsewhere
    const plain = engine.newGame({ seed: 4 }).state;
    expect(isGraveyard(plain, getLevel(plain).id)).toBe(false);
    expect(corpsesLeft(plain, 'nh:giant_zombie', 90)).toBe(90);
    const grave = engine.newGame({ seed: 4 }).state;
    run(grave, (ctx) => setGraveyard(ctx, getLevel(ctx.state).id));
    const n = corpsesLeft(grave, 'nh:giant_zombie', 300);
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(140);
    expect(corpsesLeft(grave, 'nh:giant', 90)).toBe(90);
  });

  test('the Castle is a graveyard; an ordinary level without a morgue is not', () => {
    const { state } = engine.newGame({ seed: 5 });
    const first = getLevel(state).id;
    const castle = state.dungeons.find((d) => d.id === 'nh:main')!.levels!;
    run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: castle }, 'random'));
    expect(getLevel(state).def).toBe('nh:castle');
    expect(isGraveyard(state, getLevel(state).id)).toBe(true);
    expect(isGraveyard(state, first)).toBe(false);
  });
});

describe('the player monsters', () => {
  test('never generated at random, never by class', () => {
    for (const id of MPLAYERS) {
      if (!engine.registry.isMonster(id)) {
        expect(id).toBe('nh:valkyrie'); // the hero's role's id
        continue;
      }
      const def = engine.registry.monster(id);
      expect(def.genFlags).toContain('nogen');
      expect(def.flags).toContain('nopoly');
      expect(isMplayer(def)).toBe(true);
    }
    const { state } = engine.newGame({ seed: 6 });
    run(state, (ctx) => {
      for (let i = 0; i < 300; i++) {
        const m = mkclass(ctx, '@', 30, ['nogen']);
        expect(m === null || !isMplayer(m)).toBe(true);
      }
    });
  });

  test("mk_tt_object(): a morgue's adventurer corpse is a player monster (a valkyrie is human)", () => {
    const { state } = engine.newGame({ seed: 7 });
    const kinds = new Set<string>();
    run(state, (ctx) => {
      const p = getPlayer(ctx.state).c.pos!;
      for (let i = 0; i < 200; i++) {
        const id = mkTtObject(ctx, 'nh:corpse', { level: p.level, x: p.x, y: p.y });
        kinds.add(ctx.state.entities[String(id)]!.c.item!.corpseOf!);
      }
    });
    expect([...kinds].sort()).toEqual(
      [...MPLAYERS.filter((m) => m !== 'nh:valkyrie'), 'nh:human'].sort(),
    );
  });
});

describe('magic mapping in the Valley (nommap)', () => {
  test('the scroll fills her mind with crazy lines and confuses her', () => {
    const { state } = arrive(8);
    plainKit(state);
    let scroll = -1;
    run(state, (ctx) => {
      scroll = mksobj(ctx, ctx.defs.object('nh:scroll_of_magic_mapping' as DefId), {
        init: false,
        carriedBy: ctx.state.playerId,
      });
    });
    itemOf(state, scroll).buc = 'uncursed';
    const t = texts(
      engine.step(state, { type: 'mod', action: 'nh:read' as DefId, args: { item: scroll } })
        .events,
    );
    expect(t).toContain('Your mind is filled with crazy lines!');
    expect(t).toContain('Your head spins in bewilderment.');
    expect(t).not.toContain('A map coalesces in your mind!');
    // confused for rnd(30) turns: still, or (a single turn) over by the end of this one
    expect(
      timeoutLeft(state, getPlayer(state), P.CONFUSION) > 0 ||
        t.includes('You feel less confused now.'),
    ).toBe(true);
  });
});
