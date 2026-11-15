// m17 step 2: fire traps. Level generation makes them only in Gehennom (traptype_rnd()), where a
// random trap is one 1 time in 5 before the usual roll (mktrap()); a special level's stocked maze
// (sp_lev rndtrap()) may get one anywhere. On the hero: a tower of flame (dofiretrap()), the ice
// under her melting; on a monster: its damage, maximum HP loss, burning and the ice; monsters that
// resist fire do not mind it; a slimed monster walks onto one to burn the slime off.
// ref: src/mklev.c traptype_rnd(), mktrap(); src/sp_lev.c rndtrap(); src/trap.c
// trapeffect_fire_trap(), dofiretrap(), m_harmless_trap(); src/muse.c munslime(), muse_unslime()
import {
  createEngine,
  getLevel,
  getPlayer,
  isPlainFloor,
  trapAt,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { GEHENNOM } from '../src/levelflags';
import { mktrap, rndtrap, traptypeRnd } from '../src/mklev';
import { munslime } from '../src/muse';
import { P, setIntrinsic } from '../src/props';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { TRAP, TRAPS, dotrap, mHarmlessTrap, mintrap } from '../src/trap';
import { addMon } from './helpers';
import { levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ft',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ft:run',
      labelKey: 'ft',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return textOf(engine.step(state, { type: 'mod', action: 'ft:run' as DefId }));
};

const ROOM = ['            ', ' .......... ', ' .@........ ', ' .......... ', '            '];
type S = ReturnType<typeof levelSetup>;
function room(): S {
  const s = levelSetup(ROOM);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const addTrap = (level: Level, def: string, x: number, y: number, seen = false) => {
  level.traps.push({ def: def as DefId, x, y, seen });
  level.traps.sort((a, b) => a.y * level.width + a.x - (b.y * level.width + b.x));
};
/** A pinned monster (speed 0, awake) at (x, y). */
function pinned(s: S, def: string, x: number, y: number, hp = 30): number {
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.actor!.speed = 0;
  e.c.hp = { cur: hp, max: hp };
  return id;
}

describe('the fire trap kind', () => {
  test('an orange ^ named "fire trap"', () => {
    expect(TRAPS.find((t) => t.id === TRAP.fire)).toMatchObject({
      glyph: { ch: '^', fg: '#ff8800' },
    });
    expect(render({ key: TRAP.fire })).toBe('fire trap');
  });

  test('traptype_rnd() makes one only in Gehennom (roll 10), at any difficulty', () => {
    const fixed = (n: number) => ({
      rng: { rnd: () => n, rn2: () => 0, d: () => 0, next: () => 0 },
    });
    expect(traptypeRnd(fixed(10) as never, 1)).toBeNull();
    expect(traptypeRnd(fixed(10) as never, 30)).toBeNull();
    expect(traptypeRnd(fixed(10) as never, 1, false, false, true)).toBe(TRAP.fire);
  });

  test('mktrap(): in Gehennom a random trap is a fire trap 1 time in 5 and more; never elsewhere', () => {
    const count = (state: GameState, level: Level, n: number): number => {
      let fire = 0;
      run(state, (ctx) => {
        let p = { x: 0, y: 0 };
        for (let i = 0; i < level.cells.length; i++) {
          const x = i % level.width;
          const y = Math.floor(i / level.width);
          if (isPlainFloor(ctx.defs, level, x, y) && !trapAt(level, x, y)) {
            p = { x, y };
            break;
          }
        }
        for (let i = 0; i < n; i++) {
          mktrap(ctx, level, { x: p.x, y: p.y });
          const t = trapAt(level, p.x, p.y);
          if (t?.def === TRAP.fire) fire++;
          ctx.removeTrap(level.id, { x: p.x, y: p.y });
        }
      });
      return fire;
    };
    const main = engine.newGame({ seed: 1 }).state;
    expect(count(main, getLevel(main), 400)).toBe(0);
    const hell = engine.newGame({ seed: 1 }).state;
    run(hell, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 5 }, 'random'));
    const n = count(hell, getLevel(hell), 400);
    // 1/5 from the bias, then 1 in (25 - the kinds that are refused) from traptype_rnd()
    expect(n).toBeGreaterThan(80);
    expect(n).toBeLessThan(160);
  });

  test("Gehennom's levels get fire traps; the main dungeon's ordinary levels none", () => {
    let hellFire = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const { state } = engine.newGame({ seed });
      expect(getLevel(state).traps.some((t) => t.def === TRAP.fire)).toBe(false);
      run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 6 }, 'random'));
      hellFire += getLevel(state).traps.filter((t) => t.def === TRAP.fire).length;
    }
    expect(hellFire).toBeGreaterThan(0);
  });

  test('sp_lev rndtrap() (a stocked maze) makes them on any level', () => {
    const { state } = engine.newGame({ seed: 2 });
    const kinds = new Set<string>();
    run(state, (ctx) => {
      for (let i = 0; i < 600; i++) kinds.add(rndtrap(ctx, getLevel(ctx.state)));
    });
    expect(kinds.has(TRAP.fire)).toBe(true);
    expect(kinds.has(TRAP.hole)).toBe(false);
  });
});

describe('a fire trap under the hero', () => {
  test('a tower of flame: the trap is seen, she loses maximum HP and is hurt', () => {
    const s = room();
    const p = getPlayer(s.state).c.pos!;
    const level = getLevel(s.state);
    addTrap(level, TRAP.fire, p.x, p.y);
    const hp = getPlayer(s.state).c.hp!;
    hp.cur = hp.max = 40;
    const text = run(s.state, (ctx) => dotrap(ctx, trapAt(level, p.x, p.y)!));
    expect(text[0]).toBe('A tower of flame erupts from the floor!');
    expect(trapAt(level, p.x, p.y)?.seen).toBe(true);
    expect(hp.max).toBeGreaterThanOrEqual(32);
    expect(hp.cur).toBeLessThan(40);
  });

  test('fire resistance leaves 0 or 1 damage', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.FIRE_RES, true);
    const p = getPlayer(s.state).c.pos!;
    const level = getLevel(s.state);
    addTrap(level, TRAP.fire, p.x, p.y);
    const hp = getPlayer(s.state).c.hp!;
    hp.cur = hp.max = 40;
    run(s.state, (ctx) => dotrap(ctx, trapAt(level, p.x, p.y)!));
    expect(hp.max).toBe(40);
    expect(hp.cur).toBeGreaterThanOrEqual(39);
  });

  test('on ice, the ice melts under her', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.FIRE_RES, true);
    const p = getPlayer(s.state).c.pos!;
    const level = getLevel(s.state);
    setTerrain(level, p.x, p.y, T.ice);
    addTrap(level, TRAP.fire, p.x, p.y);
    const text = run(s.state, (ctx) => dotrap(ctx, trapAt(level, p.x, p.y)!));
    expect(text).toContain('The ice crackles and melts.');
    expect([T.pool, T.moat]).toContain(terrainIdAt(level, p.x, p.y));
  });

  test('a seen one is escaped now and then, as other floor traps are', () => {
    let escaped = 0;
    for (let i = 0; i < 30; i++) {
      const s = room();
      setIntrinsic(getPlayer(s.state), P.FIRE_RES, true);
      const p = getPlayer(s.state).c.pos!;
      const level = getLevel(s.state);
      addTrap(level, TRAP.fire, p.x, p.y, true);
      const text = run(s.state, (ctx) => {
        for (let k = 0; k < i; k++) ctx.rng.rn2(2);
        dotrap(ctx, trapAt(level, p.x, p.y)!);
      });
      if (text.some((t) => t.startsWith('You escape a fire trap'))) escaped++;
    }
    expect(escaped).toBeGreaterThan(0);
    expect(escaped).toBeLessThan(30);
  });
});

describe('a fire trap under a monster', () => {
  test('it burns a monster that does not resist fire', () => {
    const s = room();
    const level = getLevel(s.state);
    addTrap(level, TRAP.fire, 6, 2);
    const id = pinned(s, 'nh:jackal', 6, 2);
    const mon = s.state.entities[String(id)]!;
    run(s.state, (ctx) => expect(mHarmlessTrap(ctx, mon, trapAt(level, 6, 2)!)).toBe(false));
    const text = run(s.state, (ctx) => void mintrap(ctx, id, { force: true }));
    expect(text[0]).toBe('A tower of flame erupts from the floor under the jackal!');
    const hp = s.state.entities[String(id)]?.c.hp;
    expect(hp === undefined || hp.cur < 30).toBe(true);
    expect(trapAt(level, 6, 2)?.seen).toBe(true);
  });

  test('a fire-resistant monster is uninjured and does not mind it', () => {
    const s = room();
    const level = getLevel(s.state);
    addTrap(level, TRAP.fire, 6, 2);
    const id = pinned(s, 'nh:red_mold', 6, 2);
    const mon = s.state.entities[String(id)]!;
    let harmless = false;
    run(s.state, (ctx) => {
      harmless = mHarmlessTrap(ctx, mon, trapAt(level, 6, 2)!);
    });
    expect(harmless).toBe(true);
    const text = run(s.state, (ctx) => void mintrap(ctx, id, { force: true }));
    expect(text).toContain('The red mold is uninjured.');
    expect(s.state.entities[String(id)]!.c.hp).toEqual({ cur: 30, max: 30 });
  });

  test('ice under it melts', () => {
    const s = room();
    const level = getLevel(s.state);
    setTerrain(level, 6, 2, T.ice);
    addTrap(level, TRAP.fire, 6, 2);
    const id = pinned(s, 'nh:red_mold', 6, 2);
    run(s.state, (ctx) => void mintrap(ctx, id, { force: true }));
    expect([T.pool, T.moat]).toContain(terrainIdAt(level, 6, 2));
  });

  test('a slimed monster steps onto a fire trap next to it to burn the slime off', () => {
    const s = room();
    const level = getLevel(s.state);
    addTrap(level, TRAP.fire, 7, 2, true);
    const id = pinned(s, 'nh:gnome_lord', 6, 2, 60);
    s.state.entities[String(id)]!.c.actor!.speed = 8;
    let res = false;
    const text = run(s.state, (ctx) => {
      res = munslime(ctx, ctx.state.entities[String(id)]!, false);
    });
    expect(res).toBe(true);
    const mon = s.state.entities[String(id)];
    expect(mon?.c.pos).toMatchObject({ x: 7, y: 2 });
    expect(text).toContain('The gnome lord moves onto the fire trap!');
    expect(text).toContain('A tower of flame erupts from the floor under the gnome lord!');
  });
});
