// m21 step 4: Fort Ludios. knox.lua as a LevelDef and its fixup: Croesus (a new row) on his
// throne with his two-handed sword, the treasury's gold and traps, the garrison, dragons, eels and
// gems at the script's spots, the rooms filled after them; random monsters never made in the
// treasury or the corner towers; the alarm on the first arrival and while Croesus lives; no
// teleporting, level teleports going nowhere, no level teleporters; a monster at its post does
// not flee from a fight beside another; "Fort Ludios" on the status line. Outcomes over seeds.
// ref: dat/knox.lua; src/do.c goto_level(); src/teleport.c level_tele(), random_teleport_level();
// src/mklev.c mktrap(); src/trap.c maketrap(); src/muse.c find_defensive(), m_next2m();
// src/mkmaze.c is_exclusion_zone(); src/makemon.c makemon(), m_initinv(); src/botl.c
// describe_level()
import {
  buildSnapshot,
  createEngine,
  getLevel,
  getPlayer,
  inBounds,
  inventoryOf,
  isPlainFloor,
  itemsAt,
  sortedIds,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type Mod,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { makemon } from '../src/generation';
import { mksobj } from '../src/items';
import { KNOX_LEVEL } from '../src/knox';
import { LUDIOS, isKnox, madeLevelFlags, mongenExcluded } from '../src/levelflags';
import { mktrap } from '../src/mklev';
import { findDefensive } from '../src/muse';
import { P, setIntrinsic } from '../src/props';
import { mapToLevel } from '../src/sp_lev';
import { randomTeleportLevel } from '../src/teleport';
import { T, terrainIdAt } from '../src/terrain';
import { TRAP, levelTele, tele } from '../src/trap';
import { countKill } from '../src/vanquished';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'kx',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'kx:run',
      labelKey: 'kx',
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
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx (no time passes); the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textOf(engine.step(state, { type: 'mod', action: 'kx:run' as DefId }));
}
const answer = (state: GameState, value: string): string[] => {
  const p = state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return textOf(engine.step(state, { type: 'answer', promptId: p.id, value }));
};

const toKnox = (state: GameState): string[] =>
  run(state, (ctx) => ctx.goToLevel({ dungeon: LUDIOS, dlevel: 1 }, 'random'));
const toMain = (state: GameState): string[] =>
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 1 }, 'random'));

/** A new game whose hero has just arrived on Fort Ludios. */
function knox(seed: number): { state: GameState; level: Level; text: string[] } {
  const { state } = engine.newGame({ seed });
  const text = toKnox(state);
  return { state, level: getLevel(state), text };
}
/** A map spot of knox.lua in Level coordinates. */
const mp = (level: Level, x: number, y: number): Pos => mapToLevel(KNOX_LEVEL, level, x, y);

const monsOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state).flatMap((id) => {
    const e = state.entities[String(id)];
    return e?.c.monster && e.c.pos?.level === level.id && id !== state.playerId ? [e] : [];
  });
const monAt = (state: GameState, level: Level, p: Pos): Entity | undefined =>
  monsOn(state, level).find((e) => e.c.pos?.x === p.x && e.c.pos.y === p.y);

const SOLDIERS: readonly (readonly [number, number])[] = [
  [12, 14],
  [12, 13],
  [11, 10],
  [13, 2],
  [14, 3],
  [20, 2],
  [30, 2],
  [40, 2],
  [30, 16],
  [32, 16],
  [40, 16],
  [54, 16],
  [54, 14],
  [54, 13],
  [57, 10],
  [57, 9],
];

describe('Fort Ludios is built as knox.lua says', () => {
  test('Croesus on his throne (both rows), the treasury, the garrison and the gems, over seeds', () => {
    const thrones = new Set<number>();
    const traps = new Set<DefId>();
    for (let seed = 1; seed <= 12; seed++) {
      const { state, level } = knox(seed);
      expect(isKnox(level)).toBe(true);
      // no stairs at all: the branch spot is floor (the portal back comes with the vault portal)
      expect(level.up).toBeNull();
      expect(level.down).toBeNull();
      expect(level.branch).toBeNull();
      expect(terrainIdAt(level, mp(level, 8, 16).x, mp(level, 8, 16).y)).toBe(T.floor);
      // Croesus: one, hostile, on the throne at (43,10) or moved up to (43,9), the other floor
      const croesus = monsOn(state, level).filter((e) => e.def === 'nh:croesus');
      expect(croesus).toHaveLength(1);
      const c = croesus[0]!;
      const cp = c.c.pos!;
      const hi = mp(level, 43, 9);
      const lo = mp(level, 43, 10);
      expect(cp.x).toBe(lo.x);
      expect([hi.y, lo.y]).toContain(cp.y);
      thrones.add(cp.y - hi.y);
      expect(terrainIdAt(level, cp.x, cp.y)).toBe(T.throne);
      const other = cp.y === hi.y ? lo : hi;
      expect(terrainIdAt(level, other.x, other.y)).toBe(T.floor);
      expect(c.c.monster?.peaceful).toBe(false);
      expect(inventoryOf(state, c.id).map((e) => e.def)).toContain('nh:two_handed_sword');
      // the treasury: a pile of 600..900 gold on each of its 60 squares, only spiked pits and
      // land mines among its traps
      let piles = 0;
      for (let x = 21; x <= 35; x++)
        for (let y = 8; y <= 11; y++) {
          const p = mp(level, x, y);
          const gold = itemsAt(engine.registry, state, level.id, p.x, p.y).filter(
            (e) => e.def === 'nh:gold_piece',
          );
          expect(gold).toHaveLength(1);
          const q = gold[0]!.c.item!.quantity;
          expect(q).toBeGreaterThanOrEqual(600);
          expect(q).toBeLessThanOrEqual(900);
          piles++;
          const t = level.traps.find((tr) => tr.x === p.x && tr.y === p.y);
          if (t) {
            expect([TRAP.spikedPit, TRAP.landmine]).toContain(t.def);
            traps.add(t.def);
          }
        }
      expect(piles).toBe(60);
      // the garrison at its spots
      for (const [x, y] of SOLDIERS)
        expect(monAt(state, level, mp(level, x, y))?.def).toBe('nh:soldier');
      expect(monAt(state, level, mp(level, 15, 8))?.def).toBe('nh:lieutenant');
      expect(monAt(state, level, mp(level, 3, 1))?.def).toBe('nh:stone_giant');
      for (const [x, y] of [
        [18, 9],
        [49, 10],
        [33, 5],
        [33, 14],
      ] as const) {
        const d = monAt(state, level, mp(level, x, y));
        expect(d && engine.registry.monster(d.def).glyph.ch).toBe('D');
      }
      for (const [x, y] of [
        [17, 8],
        [17, 11],
        [48, 8],
        [48, 11],
      ] as const) {
        const p = mp(level, x, y);
        expect(monAt(state, level, p)?.def).toBe('nh:giant_eel');
        expect(terrainIdAt(level, p.x, p.y)).toBe(T.moat);
      }
      // the corner towers' gems
      for (const [id, x1, y] of [
        ['nh:diamond', 19, 6],
        ['nh:emerald', 19, 13],
        ['nh:ruby', 46, 6],
        ['nh:amethyst', 46, 13],
      ] as const)
        for (let x = x1; x <= x1 + 2; x++) {
          const p = mp(level, x, y);
          expect(itemsAt(engine.registry, state, level.id, p.x, p.y).map((e) => e.def)).toContain(
            id,
          );
        }
      // the court, the zoo and the barracks were filled after the script (soldiers in the
      // barracks), and the alarm woke everyone
      expect(level.rooms.map((r) => r.type)).toEqual([
        'nh:court',
        'nh:zoo',
        'nh:zoo',
        'nh:barracks',
        'nh:barracks',
        'nh:barracks',
      ]);
      const barracks = level.rooms[3]!;
      const squad = monsOn(state, level).filter((e) => {
        const p = e.c.pos!;
        return p.x >= barracks.lx && p.x <= barracks.hx && p.y >= barracks.ly && p.y <= barracks.hy;
      });
      expect(squad.length).toBeGreaterThan(10);
      expect(monsOn(state, level).every((e) => !e.c.monster!.asleep)).toBe(true);
    }
    expect(thrones).toEqual(new Set([0, 1]));
    expect(traps).toEqual(new Set([TRAP.spikedPit, TRAP.landmine]));
  });
});

describe('monster-generation exclusions', () => {
  const placed = (state: GameState, n: number): Pos[] => {
    const out: Pos[] = [];
    run(state, (ctx) => {
      for (let i = 0; i < n; i++) {
        const id = makemon(ctx, null, null, { nogroup: true });
        const p = id === null ? undefined : ctx.state.entities[String(id)]?.c.pos;
        if (p) out.push({ x: p.x, y: p.y });
      }
    });
    return out;
  };

  test('random new monsters are never placed in the treasury or the corner towers', () => {
    const { state, level } = knox(3);
    const ex = madeLevelFlags(state, level.id).mongenExclude;
    expect(ex).toHaveLength(5);
    // the same draws with the exclusions dropped do land there: the test has teeth
    const loose = structuredClone(state);
    const flags = (loose.modData['nh'] as { levflags: Record<string, { mongenExclude?: unknown }> })
      .levflags[level.id]!;
    delete flags.mongenExclude;
    const inZone = (p: Pos): boolean => mongenExcluded(state, level, p.x, p.y);
    expect(placed(loose, 300).some(inZone)).toBe(true);
    const got = placed(state, 300);
    expect(got.length).toBeGreaterThan(200);
    expect(got.some(inZone)).toBe(false);
    // a monster asked for on an excluded spot is still made there (no goodpos() for MON_AT())
    const spot = mp(level, 28, 9);
    let id: number | null = null;
    run(state, (ctx) => {
      id = makemon(ctx, ctx.defs.monster('nh:soldier'), spot, { nogroup: true });
    });
    expect(id).not.toBeNull();
    expect(state.entities[String(id)]?.c.pos).toMatchObject(spot);
  });
});

describe('the alarm', () => {
  test('first arrival: the two lines and every monster awake; again while Croesus lives', () => {
    const { state, level, text } = knox(4);
    expect(text).toContain('You have penetrated a high security area!');
    expect(text).toContain('An alarm sounds!');
    expect(monsOn(state, level).some((e) => e.def === 'nh:soldier')).toBe(true);
    expect(monsOn(state, level).every((e) => !e.c.monster!.asleep)).toBe(true);
    toMain(state);
    const soldier = monsOn(state, level).find((e) => e.def === 'nh:soldier')!;
    soldier.c.monster!.asleep = true;
    const again = toKnox(state);
    expect(again).toContain('An alarm sounds!');
    expect(soldier.c.monster!.asleep).toBe(false);
    // once Croesus has died, a later arrival is quiet
    run(state, (ctx) => countKill(ctx, 'nh:croesus' as DefId));
    toMain(state);
    soldier.c.monster!.asleep = true;
    const quietText = toKnox(state);
    expect(quietText).not.toContain('An alarm sounds!');
    expect(quietText).not.toContain('You have penetrated a high security area!');
    expect(soldier.c.monster!.asleep).toBe(true);
  });

  test('no alarm anywhere else', () => {
    const { state } = engine.newGame({ seed: 4 });
    const text = run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'random'));
    expect(text).not.toContain('An alarm sounds!');
  });
});

describe('teleporting on a level of a single-level branch', () => {
  test('a teleport is refused; an uncontrolled level teleport stays (after its draw)', () => {
    const { state, level } = knox(5);
    const here = { ...getPlayer(state).c.pos };
    expect(run(state, (ctx) => tele(ctx))).toContain(
      'A mysterious force prevents you from teleporting!',
    );
    expect(getPlayer(state).c.pos).toEqual(here);
    for (let i = 0; i < 5; i++) {
      expect(run(state, (ctx) => levelTele(ctx))).toContain('You shudder for a moment.');
      expect(getLevel(state).id).toBe(level.id);
    }
    const depths = new Set<number>();
    run(state, (ctx) => {
      for (let i = 0; i < 50; i++) depths.add(randomTeleportLevel(ctx, level));
    });
    expect([...depths]).toEqual([level.depth]);
  });

  test('a controlled level teleport to a positive level shudders and stays', () => {
    const { state, level } = knox(6);
    setIntrinsic(getPlayer(state), P.TELEPORT_CONTROL, true);
    run(state, (ctx) => levelTele(ctx));
    expect(state.pendingPrompt?.prompt.id).toBe('tele-level');
    expect(answer(state, '3')).toContain('You shudder for a moment.');
    expect(getLevel(state).id).toBe(level.id);
    // the same answer elsewhere goes there
    const { state: s2 } = engine.newGame({ seed: 6 });
    setIntrinsic(getPlayer(s2), P.TELEPORT_CONTROL, true);
    run(s2, (ctx) => levelTele(ctx));
    answer(s2, '3');
    expect(getLevel(s2).depth).toBe(3);
  });

  test('no level teleporter is made there', () => {
    const { state, level } = knox(7);
    const p = mp(level, 7, 16);
    run(state, (ctx) => mktrap(ctx, level, p, TRAP.levelTele));
    expect(level.traps.some((t) => t.def === TRAP.levelTele)).toBe(false);
    // on an ordinary level it is
    const { state: s2 } = engine.newGame({ seed: 7 });
    const l2 = getLevel(s2);
    const room = l2.rooms[0]!;
    let at: Pos | null = null;
    for (let x = room.lx; x <= room.hx && !at; x++)
      for (let y = room.ly; y <= room.hy && !at; y++)
        if (isPlainFloor(engine.registry, l2, x, y) && !trapAt(l2, x, y)) at = { x, y };
    if (!at) throw new Error('no free floor');
    run(s2, (ctx) => mktrap(ctx, l2, at, TRAP.levelTele));
    expect(l2.traps.some((t) => t.def === TRAP.levelTele)).toBe(true);
  });
});

describe('m_next2m(): monsters at their posts', () => {
  /** A free 3x3 floor block of `level` away from the hero. */
  function freeBlock(state: GameState, level: Level): Pos {
    const hp = getPlayer(state).c.pos!;
    for (let y = 1; y < level.height - 1; y++)
      for (let x = 1; x < level.width - 1; x++) {
        if (Math.abs(x - hp.x) < 6 && Math.abs(y - hp.y) < 6) continue;
        let ok = true;
        for (let dx = -2; dx <= 2 && ok; dx++)
          for (let dy = -2; dy <= 2 && ok; dy++) {
            const q = { x: x + dx, y: y + dy };
            ok =
              inBounds(level, q.x, q.y) &&
              terrainIdAt(level, q.x, q.y) === T.floor &&
              !level.traps.some((t) => t.x === q.x && t.y === q.y) &&
              !monAt(state, level, q);
          }
        if (ok) return { x, y };
      }
    throw new Error('no free block');
  }
  /** A cornered soldier with a wand of create monster, and maybe another next to it. */
  function choice(state: GameState, buddy: boolean): string | null {
    const level = getLevel(state);
    const p = freeBlock(state, level);
    let kind: string | null = null;
    run(state, (ctx) => {
      const id = makemon(ctx, ctx.defs.monster('nh:soldier'), p, { nogroup: true })!;
      const wand = mksobj(ctx, ctx.defs.object('nh:wand_of_create_monster'), {
        init: false,
        carriedBy: id,
      });
      ctx.state.entities[String(wand)]!.c.item!.spe = 5;
      if (buddy)
        makemon(ctx, ctx.defs.monster('nh:soldier'), { x: p.x + 1, y: p.y }, { nogroup: true });
      kind = findDefensive(ctx, id, true)?.kind ?? null;
    });
    return kind;
  }

  test('on Fort Ludios a monster with another beside it does not try to escape', () => {
    expect(choice(knox(8).state, true)).toBeNull();
    expect(choice(knox(8).state, false)).toBe('wan_create_monster');
    // elsewhere the neighbour does not matter
    expect(choice(engine.newGame({ seed: 8 }).state, true)).toBe('wan_create_monster');
  });
});

describe('the status line', () => {
  test('"Fort Ludios" in place of Dlvl:N there only', () => {
    const { state } = knox(9);
    expect(buildSnapshot(engine.registry, state).status['place']).toBe('nh:ludios');
    expect(render({ key: 'nh:ludios' })).toBe('Fort Ludios');
    toMain(state);
    expect(buildSnapshot(engine.registry, state).status['place']).toBeUndefined();
  });
});
