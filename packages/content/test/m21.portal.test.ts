// m21 step 5: the portal to Fort Ludios. mk_knox_portal() in each new vault until one has it:
// nothing drawn once placed or on a level a branch ends on, then `rn2(3)` (2 in 3 defers; drawn
// and ignored in wizard mode), then only the main dungeon from DL11 down to above Medusa; the
// hidden portal on the vault's bottom-right square, the fort's portal back at its branch spot
// (added to a fort made first), the trip both ways, #wizwhere. Outcomes over seeds.
// ref: src/mklev.c mk_knox_portal(), place_branch(); src/mkmaze.c mkportal(); src/teleport.c
// domagicportal(); src/dungeon.c print_branch()
import {
  createEngine,
  getLevel,
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
  type Room,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod, wizardMod } from '../src/index';
import { KNOX_LEVEL } from '../src/knox';
import { knoxSource } from '../src/knoxstate';
import { LUDIOS, isBranchlev, medusaDepth } from '../src/levelflags';
import { MAGIC_PORTAL, findPortal, portalDest } from '../src/portal';
import { mapToLevel } from '../src/sp_lev';
import { T, setTerrain } from '../src/terrain';
import { teleds } from '../src/trap';
import { mkKnoxPortal } from '../src/vault';
import { VAULT, vaultRoom } from '../src/vaultstate';
import { WIZ_WHERE } from '../src/wizard/where';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'kp',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'kp:run',
      labelKey: 'kp',
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
const wizard = createEngine([vanillaMod, wizardMod, probeMod]);
type Engine = typeof engine;
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx (no time passes); the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void, eng: Engine = engine): string[] {
  probe.fn = fn;
  return textOf(eng.step(state, { type: 'mod', action: 'kp:run' as DefId }));
}

/**
 * A copy of the game's first level as main-dungeon level `dlevel` (depth `dlevel`), its first
 * room's top-left 2x2 squares typed as a vault, put into the state: what mkVault() hands
 * mkKnoxPortal().
 */
function vaultLevel(state: GameState, dlevel: number): { level: Level; vault: Room } {
  const base = state.levels['dlvl1']!;
  const r0 = base.rooms[0]!;
  const vault: Room = {
    lx: r0.lx,
    ly: r0.ly,
    hx: r0.lx + 1,
    hy: r0.ly + 1,
    lit: true,
    type: VAULT,
  };
  const level: Level = {
    ...structuredClone(base),
    id: `dlvl${dlevel}`,
    dlevel,
    depth: dlevel,
    traps: [],
    rooms: [...structuredClone(base.rooms), vault],
  };
  for (let x = vault.lx; x <= vault.hx; x++)
    for (let y = vault.ly; y <= vault.hy; y++) setTerrain(level, x, y, T.floor);
  state.levels[level.id] = level;
  return { level, vault };
}

/** Calls mkKnoxPortal() on a vault level `dlevel`; whether the rng moved. */
function tryPortal(state: GameState, dlevel: number, eng: Engine = engine): boolean {
  const before = JSON.stringify(state.rng);
  let after = before;
  run(
    state,
    (ctx) => {
      const { level, vault } = vaultLevel(state, dlevel);
      mkKnoxPortal(ctx, level, vault);
      after = JSON.stringify(ctx.state.rng);
    },
    eng,
  );
  return after !== before;
}

const portalsTo = (level: Level, dungeon: string) =>
  level.traps.filter((t) => t.def === MAGIC_PORTAL && portalDest(t)?.dungeon === dungeon);

describe('mk_knox_portal()', () => {
  test('about 1 vault in 3 from DL11 to above Medusa gets it, on its bottom-right square', () => {
    let placed = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const { state } = engine.newGame({ seed });
      const dlevel = 11 + (seed % (medusaDepth(state) - 11));
      expect(tryPortal(state, dlevel)).toBe(true); // rn2(3) drawn
      const src = knoxSource(state);
      const level = state.levels[`dlvl${dlevel}`]!;
      const vault = level.rooms.at(-1)!;
      const portals = portalsTo(level, LUDIOS);
      if (!src) {
        expect(portals).toHaveLength(0);
        continue;
      }
      placed++;
      expect(src).toEqual({ dungeon: 'nh:main', dlevel });
      expect(portals).toHaveLength(1);
      expect(portals[0]).toMatchObject({ x: vault.hx, y: vault.hy, seen: false });
      expect(portalDest(portals[0]!)).toEqual({ dungeon: LUDIOS, dlevel: 1 });
      // once placed, no other vault gets one and nothing is drawn
      expect(tryPortal(state, dlevel + 1)).toBe(false);
      expect(portalsTo(state.levels[`dlvl${dlevel + 1}`]!, LUDIOS)).toHaveLength(0);
      expect(knoxSource(state)?.dlevel).toBe(dlevel);
    }
    expect(placed).toBeGreaterThan(n / 3 - 30);
    expect(placed).toBeLessThan(n / 3 + 30);
  });

  test('never above DL11, at or below Medusa, or outside the main dungeon; the roll is drawn', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = engine.newGame({ seed });
      const medusa = medusaDepth(state);
      for (const dlevel of [5, 10, medusa, medusa + 1]) {
        // the Sokoban branch may be on DL10, the Castle (Gehennom's branch) below Medusa
        const branch = isBranchlev(state, { dungeon: 'nh:main', dlevel });
        expect(tryPortal(state, dlevel)).toBe(!branch);
        expect(knoxSource(state)).toBeNull();
      }
      // a Mines level: drawn, never placed
      const mines = state.dungeons.find((d) => d.id === 'nh:mines')!;
      run(state, (ctx) => {
        const { level, vault } = vaultLevel(state, 12);
        level.dungeon = mines.id;
        level.dlevel = 3;
        level.id = 'nh:mines/3';
        state.levels[level.id] = level;
        mkKnoxPortal(ctx, level, vault);
      });
      expect(knoxSource(state)).toBeNull();
    }
  });

  test('a level a branch ends on draws nothing (Is_branchlev())', () => {
    const { state } = engine.newGame({ seed: 3 });
    const main = state.dungeons[0]!;
    const mines = main.branches.find((b) => b.to === 'nh:mines')!;
    expect(tryPortal(state, mines.dlevel)).toBe(false);
    // Fort Ludios's own rolled level is not a branch level (its end floats)
    const ludios = main.branches.find((b) => b.to === LUDIOS)!;
    expect(tryPortal(state, ludios.dlevel)).toBe(true);
  });

  test('wizard mode: the first eligible vault always gets it, the roll still drawn', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = wizard.newGame({ seed });
      expect(tryPortal(state, 5, wizard)).toBe(true); // too shallow: drawn, not placed
      expect(knoxSource(state)).toBeNull();
      expect(tryPortal(state, 12, wizard)).toBe(true);
      expect(knoxSource(state)).toEqual({ dungeon: 'nh:main', dlevel: 12 });
    }
  });
});

describe('the portal in play', () => {
  /** A wizard game whose first vault on DL11 or below, made by level generation, got it. */
  function portalGame(): { state: GameState; level: Level } {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = wizard.newGame({ seed });
      for (let dlevel = 11; dlevel < medusaDepth(state); dlevel++) {
        run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'random'), wizard);
        const level = getLevel(state);
        if (vaultRoom(level) === null) continue;
        expect(knoxSource(state)).toEqual({ dungeon: 'nh:main', dlevel });
        return { state, level };
      }
      expect(knoxSource(state)).toBeNull();
    }
    throw new Error('no vault on DL11..Medusa in 40 games');
  }

  test('level generation puts it in the vault; the fort, made later, has its portal back', () => {
    const { state, level } = portalGame();
    const vault = level.rooms[vaultRoom(level)!]!;
    const t = findPortal(level)!;
    expect(t).toMatchObject({ x: vault.hx, y: vault.hy });
    expect(portalDest(t)).toEqual({ dungeon: LUDIOS, dlevel: 1 });

    // she steps into the vault and onto the portal: off to the fort's arrival spot
    const text = run(state, (ctx) => teleds(ctx, vault.hx, vault.hy), wizard);
    expect(text).toContain('You activated a magic portal!');
    expect(text).toContain('You have penetrated a high security area!');
    const knox = getLevel(state);
    expect(knox.def).toBe(KNOX_LEVEL.id);
    const spot = mapToLevel(KNOX_LEVEL, knox, 8, 16);
    expect(getPlayer(state).c.pos).toMatchObject(spot);
    const back = trapAt(knox, spot.x, spot.y)!;
    expect(back.def).toBe(MAGIC_PORTAL);
    expect(portalDest(back)).toEqual({ dungeon: 'nh:main', dlevel: level.dlevel });
    expect(knox.traps.filter((x) => x.def === MAGIC_PORTAL)).toHaveLength(1);

    // and back: onto the vault's portal
    run(state, (ctx) => teleds(ctx, spot.x + 1, spot.y), wizard);
    const t2 = run(state, (ctx) => teleds(ctx, spot.x, spot.y), wizard);
    expect(t2).toContain('You activated a magic portal!');
    expect(getLevel(state).id).toBe(level.id);
    expect(getPlayer(state).c.pos).toMatchObject({ x: vault.hx, y: vault.hy });

    // #wizwhere names the portal's level among the main dungeon's
    const where = wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    const keys = where.events.flatMap((e) => (e.type === 'msg' ? [e] : []));
    expect(keys).toContainEqual(
      expect.objectContaining({
        key: 'wiz.where.portal',
        params: { dungeon: '@nh:ludios', depth: level.depth },
      }),
    );
    expect(keys.some((e) => e.key === 'wiz.where.portal_unplaced')).toBe(false);
  });

  test('a fort made first (#levelport) has no portal until a vault gets one, then it does', () => {
    const { state } = wizard.newGame({ seed: 2 });
    run(state, (ctx) => ctx.goToLevel({ dungeon: LUDIOS, dlevel: 1 }, 'random'), wizard);
    const knox = getLevel(state);
    expect(knox.def).toBe(KNOX_LEVEL.id);
    expect(findPortal(knox)).toBeNull();
    const where = wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    expect(
      where.events.some((e) => e.type === 'msg' && e.key === 'wiz.where.portal_unplaced'),
    ).toBe(true);
    tryPortal(state, 13, wizard);
    expect(knoxSource(state)).toEqual({ dungeon: 'nh:main', dlevel: 13 });
    const spot = mapToLevel(KNOX_LEVEL, knox, 8, 16);
    const back = trapAt(knox, spot.x, spot.y)!;
    expect(back.def).toBe(MAGIC_PORTAL);
    expect(portalDest(back)).toEqual({ dungeon: 'nh:main', dlevel: 13 });
    // the hero standing there does not fall through at once (nothing happens until she steps)
    expect(getLevel(state).id).toBe(knox.id);
  });
});
