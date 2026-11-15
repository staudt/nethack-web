// m17 step 3: the level temperature (Gehennom hot but for the temperate Valley and hellfill's
// cold mazes): the lines on changing level, potions breaking on the hot ground, the random
// monster weights; Gehennom's object class probabilities (hellprobs) and its fast bats.
// ref: src/do.c hellish_smoke_mesg(), temperature_change_msg(), flooreffects(); src/makemon.c
// temperature_shift(), makemon() S_BAT; src/mkobj.c mkobj() hellprobs[]
import {
  createEngine,
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { flooreffects } from '../src/flooreffects';
import { makemon } from '../src/generation';
import { mksobj } from '../src/items';
import { GEHENNOM, madeLevelFlags } from '../src/levelflags';
import { mkobj } from '../src/mkobj';
import { mspeed } from '../src/mstate';
import { hellishSmokeMesg, levelTemperature, temperatureShift } from '../src/temperature';
import { T, setTerrain } from '../src/terrain';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'tp',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'tp:run',
      labelKey: 'tp',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'tp:run' as DefId }).events);
};
const temp = (state: GameState, level: Level): number => levelTemperature({ state, defs }, level);
const go = (state: GameState, dlevel: number, at: 'up' | 'random' = 'random'): string[] =>
  run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, at));
const ordinary = (state: GameState): number[] => {
  const d = state.dungeons.find((x) => x.id === GEHENNOM)!;
  const taken = new Set(d.special.map((s) => s.dlevel));
  return [...Array(d.levels!).keys()].map((i) => i + 1).filter((n) => !taken.has(n));
};

/** A new game and an ordinary Gehennom level of it that is hot (`want` 1) or cold (-1). */
function find(want: 1 | -1): { state: GameState; dlevel: number } {
  for (let seed = 1; seed <= 60; seed++) {
    const { state } = engine.newGame({ seed });
    for (const dlevel of ordinary(state).slice(0, 5)) {
      go(state, dlevel);
      if (temp(state, getLevel(state)) === want) {
        const fresh = engine.newGame({ seed }).state;
        return { state: fresh, dlevel };
      }
    }
  }
  throw new Error('no such level');
}

describe('the level temperature', () => {
  test('0 in the main dungeon and on the temperate Valley; hellfill levels are hot or cold', () => {
    const { state } = engine.newGame({ seed: 3 });
    expect(temp(state, getLevel(state))).toBe(0);
    go(state, 1);
    expect(temp(state, getLevel(state))).toBe(0);
    const hot = find(1);
    go(hot.state, hot.dlevel);
    expect(madeLevelFlags(hot.state, getLevel(hot.state).id).hellfill).not.toBe(6);
    const cold = find(-1);
    go(cold.state, cold.dlevel);
    expect(madeLevelFlags(cold.state, getLevel(cold.state).id).hellfill).toBe(6);
  });

  test('from the Valley onto a hot level and back: "It is hot here.", then the heat is gone', () => {
    const { state, dlevel } = find(1);
    go(state, 1);
    const t = go(state, dlevel);
    expect(t).toContain('It is hot here.');
    expect(t).toContain('You smell smoke...');
    const back = go(state, 1);
    expect(back).toContain('The heat and smoke are gone.');
    expect(back).not.toContain('It is hot here.');
  });

  test('onto a cold level and back: "It is cold here.", then "You are out of the cold."', () => {
    const { state, dlevel } = find(-1);
    go(state, 1);
    const t = go(state, dlevel);
    expect(t).toContain('It is cold here.');
    expect(t).not.toContain('You smell smoke...');
    expect(go(state, 1)).toContain('You are out of the cold.');
  });

  test('between two hot levels nothing is said; a form without smell senses the smoke', () => {
    const { state, dlevel } = find(1);
    go(state, dlevel);
    // another hot level
    const other = ordinary(state).find((n) => {
      if (n === dlevel) return false;
      go(state, n);
      return temp(state, getLevel(state)) === 1;
    })!;
    go(state, dlevel);
    const t = go(state, other);
    expect(t).not.toContain('It is hot here.');
    const eye = defs.monster('nh:floating_eye');
    const s = run(state, (ctx) => hellishSmokeMesg(ctx, getLevel(ctx.state), eye));
    expect(s).toEqual(['It is hot here.', 'You sense smoke...']);
  });

  test('random monsters: resistant kinds weigh 3 more on a hot or cold level', () => {
    const fire = defs.monsters.find(
      (m) => m.resists.includes('fire') && !m.resists.includes('cold'),
    )!;
    const cold = defs.monsters.find(
      (m) => m.resists.includes('cold') && !m.resists.includes('fire'),
    )!;
    const h = find(1);
    go(h.state, h.dlevel);
    const hot = getLevel(h.state);
    expect(temperatureShift({ state: h.state, defs }, hot, fire)).toBe(3);
    expect(temperatureShift({ state: h.state, defs }, hot, cold)).toBe(0);
    const c = find(-1);
    go(c.state, c.dlevel);
    const icy = getLevel(c.state);
    expect(temperatureShift({ state: c.state, defs }, icy, cold)).toBe(3);
    expect(temperatureShift({ state: c.state, defs }, icy, fire)).toBe(0);
    const { state } = engine.newGame({ seed: 1 });
    expect(temperatureShift({ state, defs }, getLevel(state), fire)).toBe(0);
  });
});

describe('potions on the hot ground', () => {
  /** How many of `n` potions (blessed or not) landing on her floor square break. */
  function breaks(
    state: GameState,
    n: number,
    blessed: boolean,
  ): { broken: number; text: string[] } {
    let broken = 0;
    const text = run(state, (ctx) => {
      const p = getPlayer(ctx.state).c.pos!;
      setTerrain(getLevel(ctx.state), p.x, p.y, T.floor);
      for (let i = 0; i < n; i++) {
        const id = mksobj(ctx, defs.object('nh:potion_of_water'), { init: false });
        const obj = ctx.state.entities[String(id)]!;
        if (blessed) obj.c.item!.buc = 'blessed';
        if (flooreffects(ctx, obj, p.x, p.y, 'fall')) broken++;
        else ctx.remove(id);
      }
    });
    return { broken, text };
  }

  test('half of them break, blessed ones less often: "It shatters from the heat!"', () => {
    const { state, dlevel } = find(1);
    go(state, dlevel);
    const plain = breaks(state, 300, false);
    const holy = breaks(state, 300, true);
    expect(plain.broken).toBeGreaterThan(110);
    expect(plain.broken).toBeLessThan(190);
    expect(holy.broken).toBeGreaterThan(50);
    expect(holy.broken).toBeLessThan(plain.broken);
    expect(plain.text).toContain('The clear potion heats up as it hits the hot ground.');
    expect(plain.text).toContain('It shatters from the heat!');
  });

  test('not on a temperate or cold level', () => {
    const { state } = engine.newGame({ seed: 2 });
    go(state, 1);
    expect(breaks(state, 50, false).broken).toBe(0);
    const c = find(-1);
    go(c.state, c.dlevel);
    expect(breaks(c.state, 50, false).broken).toBe(0);
  });
});

describe("Gehennom's objects and bats", () => {
  /** Class counts of `n` random objects made for the current level. */
  function classes(state: GameState, n: number): Record<string, number> {
    const out: Record<string, number> = {};
    run(state, (ctx) => {
      for (let i = 0; i < n; i++) {
        const id = mkobj(ctx, 'random', { level: ctx.state.currentLevel });
        if (id === null) continue;
        const cls = defs.object(ctx.state.entities[String(id)]!.def).class;
        out[cls] = (out[cls] ?? 0) + 1;
        ctx.remove(id);
      }
    });
    return out;
  }

  test('hellprobs: no spellbooks, few potions and scrolls, more weapons and armor', () => {
    const { state } = engine.newGame({ seed: 4 });
    const main = classes(state, 2000);
    go(state, 1);
    const hell = classes(state, 2000);
    expect(hell['spellbook'] ?? 0).toBe(0);
    expect((hell['potion'] ?? 0) + (hell['scroll'] ?? 0)).toBeLessThan(100);
    expect(hell['weapon']!).toBeGreaterThan(main['weapon']! * 1.4);
    expect(main['spellbook']!).toBeGreaterThan(0);
    expect(main['potion']!).toBeGreaterThan(200);
  });

  test('bats made in Gehennom are fast', () => {
    const made = (state: GameState): string | null => {
      let speed: string | null = null;
      run(state, (ctx) => {
        const p = getPlayer(ctx.state).c.pos!;
        const id = makemon(
          ctx,
          defs.monster('nh:giant_bat'),
          { x: p.x, y: p.y },
          {
            adjacentOk: true,
          },
        );
        speed = id === null ? 'none' : mspeed(ctx, id);
      });
      return speed;
    };
    const { state } = engine.newGame({ seed: 5 });
    expect(made(state)).toBeNull();
    go(state, 1);
    expect(made(state)).toBe('fast');
  });
});
