// m16 step 4: engravings wear away (walking, fighting, throwing, kicking, monsters, the turn's
// scuff) and go with the terrain under them (land mines, terrain wishes).
// ref: src/hack.c domove(), maybe_smudge_engr(); src/uhitm.c do_attack(); src/dothrow.c
// throw_obj(); src/dokick.c dokick(); src/monmove.c dochug(); src/allmain.c moveloop_core();
// src/trap.c blow_up_landmine(); src/objnam.c wizterrainwish()
import {
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
  type Rng,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { engrAt, makeEngrAt, turnScuff } from '../src/engr';
import { P, setIntrinsic, vanillaMod } from '../src/index';
import { blowUpLandmine } from '../src/landmine';
import { TRAP } from '../src/trap';
import { wizTerrainWish } from '../src/wizard/terrainwish';
import { addMon } from './helpers';
import { defs, levelSetup } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;
const ROWS = ['.......', '...@...', '.......'];
const lvl = (s: Setup): Level => s.state.levels['dlvl1'] as Level;
const textAt = (s: Setup, x: number, y: number): string | undefined =>
  engrAt(s.ctx, lvl(s), x, y)?.text;
const dust = (s: Setup, x: number, y: number, text = 'Elbereth'): void =>
  void makeEngrAt(s.ctx, lvl(s), x, y, text, null, 0, 'dust');
const answer = (s: Setup, value: unknown) => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return s.step({ type: 'answer', promptId: p.id, value: value as never });
};

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ew',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ew:run',
      labelKey: 'ew',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const probeEngine = createEngine([vanillaMod, probeMod]);
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  probeEngine.step(state, { type: 'mod', action: 'ew:run' as DefId });
};

describe('walking smudges (maybe_smudge_engr())', () => {
  test('the square she leaves and the one she enters both wear', () => {
    const s = levelSetup(ROWS);
    dust(s, 3, 1);
    dust(s, 4, 1);
    dust(s, 0, 0); // not on her way
    s.step({ type: 'move', dir: 'e' });
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 4, y: 1 });
    expect(textAt(s, 3, 1)).not.toBe('Elbereth');
    expect(textAt(s, 4, 1)).not.toBe('Elbereth');
    expect(textAt(s, 0, 0)).toBe('Elbereth');
  });

  test('headstones and burned text do not wear', () => {
    const s = levelSetup(ROWS);
    makeEngrAt(s.ctx, lvl(s), 3, 1, 'Elbereth', null, 0, 'burn');
    makeEngrAt(s.ctx, lvl(s), 4, 1, 'RIP', null, 0, 'headstone');
    s.step({ type: 'move', dir: 'e' });
    s.step({ type: 'move', dir: 'e' });
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 5, y: 1 });
    expect(textAt(s, 3, 1)).toBe('Elbereth');
    expect(textAt(s, 4, 1)).toBe('RIP');
  });

  test('floating above the floor she smudges nothing', () => {
    const s = levelSetup(ROWS);
    setIntrinsic(getPlayer(s.state), P.LEVITATION, true);
    dust(s, 3, 1);
    dust(s, 4, 1);
    s.step({ type: 'move', dir: 'e' });
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 4, y: 1 });
    expect(textAt(s, 3, 1)).toBe('Elbereth');
    expect(textAt(s, 4, 1)).toBe('Elbereth');
  });
});

describe('fighting, throwing and kicking scuff her square (u_wipe_engr())', () => {
  test('a melee attack', () => {
    const s = levelSetup(ROWS);
    const newt = addMon(s.state, 'nh:newt', 4, 1, { asleep: true });
    const m = s.state.entities[String(newt)];
    if (m?.c.hp) m.c.hp = { cur: 200, max: 200 }; // lives through the blow
    dust(s, 3, 1);
    s.step({ type: 'move', dir: 'e' });
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 3, y: 1 }); // she fought, not moved
    expect(textAt(s, 3, 1)).not.toBe('Elbereth');
  });

  test('a throw', () => {
    const s = levelSetup(ROWS);
    const dagger = s.carry('nh:dagger');
    dust(s, 3, 1);
    s.mod('nh:throw', { item: dagger });
    const r = answer(s, 'e');
    expect(r.events.some((e) => e.type === 'projectile')).toBe(true);
    expect(textAt(s, 3, 1)).not.toBe('Elbereth');
  });

  test('a kick', () => {
    const s = levelSetup(ROWS);
    dust(s, 3, 1);
    s.mod('nh:kick', { dir: 'e' });
    expect(textAt(s, 3, 1)).not.toBe('Elbereth');
  });

  test('a wipe out of her reach does nothing', () => {
    const s = levelSetup(ROWS);
    setIntrinsic(getPlayer(s.state), P.LEVITATION, true);
    dust(s, 3, 1);
    s.mod('nh:kick', { dir: 'e' });
    expect(textAt(s, 3, 1)).toBe('Elbereth');
  });
});

describe('monsters scuff their own square (dochug())', () => {
  test('an awake monster wears the dust it stands on; a sleeping one does not', () => {
    const s = levelSetup(ROWS);
    setIntrinsic(getPlayer(s.state), P.STEALTH, true); // the sleeper is never disturbed
    addMon(s.state, 'nh:newt', 6, 0, { energy: 12 });
    addMon(s.state, 'nh:newt', 0, 2, { asleep: true, energy: 12 });
    dust(s, 6, 0);
    dust(s, 0, 2);
    dust(s, 1, 2); // a neighbour square nobody stands on
    s.step({ type: 'search' });
    expect(textAt(s, 6, 0)).not.toBe('Elbereth');
    expect(textAt(s, 1, 2)).toBe('Elbereth');
    expect(textAt(s, 0, 2)).toBe('Elbereth');
  });
});

describe("the turn's scuff", () => {
  /** An Rng that records each rn2/rnd range and answers `pick(n)`. */
  function recording(pick: (n: number) => number): Rng & { calls: number[] } {
    const calls: number[] = [];
    const rn2 = (n: number): number => {
      calls.push(n);
      return pick(n);
    };
    return { rn2, rnd: (n: number) => rn2(n) + 1, calls } as unknown as Rng & {
      calls: number[];
    };
  }

  test('!rn2(40 + 3 * Dex) wipes rnd(3) characters under her', () => {
    const s = levelSetup(ROWS);
    const attrs = getPlayer(s.state).c.attributes;
    if (attrs) attrs.dex = 14;
    dust(s, 3, 1, 'ab');
    const miss = recording(() => 1);
    turnScuff({ state: s.state, defs, rng: miss });
    expect(miss.calls).toEqual([82]);
    expect(textAt(s, 3, 1)).toBe('ab');
    // the roll hits, rnd(3) = 3: three characters of "ab" -> wiped down to nothing but '?'s
    const hit = recording(() => 0);
    turnScuff({ state: s.state, defs, rng: hit });
    expect(hit.calls.slice(0, 2)).toEqual([82, 3]);
    expect(textAt(s, 3, 1)).not.toBe('ab');
  });

  test('over many turns a dust engraving under a waiting hero wears', () => {
    const s = levelSetup(ROWS);
    dust(s, 3, 1, 'Elbereth Elbereth Elbereth');
    for (let i = 0; i < 1500 && textAt(s, 3, 1) === 'Elbereth Elbereth Elbereth'; i++)
      s.step({ type: 'search' });
    expect(textAt(s, 3, 1)).not.toBe('Elbereth Elbereth Elbereth');
  });
});

describe('terrain changes delete the engraving (del_engr_at())', () => {
  test('a land mine blowing up', () => {
    const s = levelSetup(ROWS);
    lvl(s).traps.push({ def: TRAP.landmine, x: 5, y: 1, seen: false });
    dust(s, 5, 1);
    dust(s, 6, 1);
    run(s.state, (ctx) => {
      const t = lvl(s).traps.find((tr) => tr.x === 5 && tr.y === 1);
      if (t) blowUpLandmine(ctx, t);
    });
    expect(textAt(s, 5, 1)).toBeUndefined();
    expect(textAt(s, 6, 1)).toBe('Elbereth');
  });

  test('wishing for water, lava or ice; not for a fountain', () => {
    for (const [wish, gone] of [
      ['pool', true],
      ['lava', true],
      ['ice', true],
      ['fountain', false],
    ] as const) {
      const s = levelSetup(ROWS);
      setIntrinsic(getPlayer(s.state), P.LEVITATION, true); // lava: she floats above it
      dust(s, 3, 1);
      run(s.state, (ctx) => void wizTerrainWish(ctx, wish));
      expect(textAt(s, 3, 1), wish).toBe(gone ? undefined : 'Elbereth');
    }
  });
});
