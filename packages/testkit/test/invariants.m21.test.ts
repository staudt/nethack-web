// m21 step 5: the invariants of the Rogue level's doors and Fort Ludios's portals, shown to
// catch a broken state.
import { vanillaMod } from '@nh/content';
import { createEngine, type DefId, type GameState, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const go: { to: { dungeon: DefId; dlevel: number } | null } = { to: null };
const goMod: Mod = {
  id: 'go',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'go:to',
      labelKey: 'go',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        if (go.to) ctx.goToLevel(go.to, 'random');
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, goMod]);
const goTo = (state: GameState, dungeon: string, dlevel: number): void => {
  go.to = { dungeon: dungeon as DefId, dlevel };
  engine.step(state, { type: 'mod', action: 'go:to' as DefId });
};
const errs = (state: GameState): string[] => checkInvariants(state, engine.registry);

describe('m21 invariants', () => {
  test('a door on the Rogue level as made is reported; its doorways are not', () => {
    const { state } = engine.newGame({ seed: 4 });
    const rogue = state.dungeons[0]!.special.find((s) => s.id === 'nh:rogue')!;
    goTo(state, 'nh:main', rogue.dlevel);
    expect(errs(state)).toEqual([]);
    const lv = state.levels[state.currentLevel]!;
    const doorway = lv.palette.indexOf('nh:doorway' as DefId);
    const at = lv.cells.indexOf(doorway);
    expect(at).toBeGreaterThanOrEqual(0);
    if (!lv.palette.includes('nh:door_closed' as DefId)) lv.palette.push('nh:door_closed' as DefId);
    lv.cells[at] = lv.palette.indexOf('nh:door_closed' as DefId);
    expect(errs(state).join('\n')).toMatch(/Rogue level square \d+ has a door/);
  });

  test('Fort Ludios: no portal before a vault has one; knox naming a level without it', () => {
    const { state } = engine.newGame({ seed: 4 });
    goTo(state, 'nh:ludios', 1);
    expect(errs(state)).toEqual([]);
    const knox = state.levels[state.currentLevel]!;
    // a portal back before any vault has one
    knox.traps.push({
      def: 'nh:magic_portal' as DefId,
      x: 1,
      y: 1,
      seen: false,
      data: { dst: { dungeon: 'nh:main', dlevel: 12 } },
    });
    expect(errs(state).join('\n')).toMatch(/Fort Ludios has a portal before any vault has one/);
    knox.traps.pop();
    // knox names DL1, which has no portal to the fort
    (state.modData['nh'] as Record<string, unknown>)['knox'] = { dlevel: 1 };
    const e = errs(state).join('\n');
    expect(e).toMatch(/knox names it but it has no portal to Fort Ludios/);
    expect(e).toMatch(/Fort Ludios has no single portal back to dlvl1/);
  });
});
