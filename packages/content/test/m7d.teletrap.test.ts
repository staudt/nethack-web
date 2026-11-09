// m7d step 2: teleportation traps and level teleporters (the hero and monsters), the Catacombs'
// level teleporters, teleportitis and the wand of stasis. Outcomes are asserted; where a roll
// decides the case, seeds or RNG offsets are searched for each outcome.
import {
  createEngine,
  getLevel,
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type GameState,
  type Json,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { WAN, isKnown, vanillaMod } from '../src/index';
import { mapToLevel } from '../src/sp_lev';
import { MINEND_3, MINEND_3_PLACES } from '../src/minesend';
import { isMConfused } from '../src/mstate';
import { P, setIntrinsic, timeoutLeft } from '../src/props';
import { inStasis, noteleportLevel } from '../src/teleport';
import { TRAP, mintrap, tele } from '../src/trap';
import { trapTable } from '../src/trapstate';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'tt-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'tt-probe:run',
      labelKey: 'tt-probe',
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
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx after burning `burn` draws; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void, burn = 0): string[] {
  probe.fn = (ctx) => {
    for (let i = 0; i < burn; i++) ctx.rng.rn2(2);
    fn(ctx);
  };
  return textOf(probeEngine.step(state, { type: 'mod', action: 'tt-probe:run' }));
}

/** A 20x5 floor room (stone around it), the hero at (2,2), lit. */
const ROOM = [
  '                      ',
  ' .................... ',
  ' .@.................. ',
  ' .................... ',
  ' .................... ',
  ' .................... ',
  '                      ',
  // stone below: a level made from here (a level teleport) needs at least 10 rows
  '                      ',
  '                      ',
  '                      ',
  '                      ',
];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const heroAt = (state: GameState) => {
  const p = getPlayer(state).c.pos;
  return p ? { x: p.x, y: p.y } : null;
};
const addTrap = (level: Level, def: string, x: number, y: number) => {
  level.traps.push({ def: def as DefId, x, y, seen: false });
  level.traps.sort((a, b) => a.y * level.width + a.x - (b.y * level.width + b.x));
};
const east = (s: S): string[] => s.text(s.step({ type: 'move', dir: 'e' }));
/** A pinned jackal (speed 0, awake) at (x, y). */
function jackal(s: S, x: number, y: number): number {
  const id = addMon(s.state, 'nh:jackal', x, y);
  s.state.entities[String(id)]!.c.actor!.speed = 0;
  return id;
}
function zapStasis(s: S): void {
  const w = s.carry(WAN.stasis);
  itemOf(s.state, w).spe = 5;
  s.mod('nh:zap', { item: w });
}

describe('a teleportation trap', () => {
  test('sends her to a random safe spot of the level; the trap is seen and stays', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.tele, 3, 2);
    const text = east(s);
    expect(text).toContain('You materialize in a different location!');
    const p = heroAt(s.state);
    expect(p).not.toEqual({ x: 3, y: 2 });
    const t = trapAt(getLevel(s.state), 3, 2);
    expect(t?.def).toBe(TRAP.tele);
    expect(t?.seen).toBe(true);
  });

  test('"You feel a wrenching sensation." with magic resistance, and under stasis', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.tele, 3, 2);
    setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true);
    expect(east(s)).toContain('You feel a wrenching sensation.');
    expect(heroAt(s.state)).toEqual({ x: 3, y: 2 });

    const s2 = room();
    addTrap(getLevel(s2.state), TRAP.tele, 3, 2);
    zapStasis(s2);
    expect(east(s2)).toContain('You feel a wrenching sensation.');
    expect(heroAt(s2.state)).toEqual({ x: 3, y: 2 });
  });

  test('a monster on it lands elsewhere ("seems disoriented"), flyers too; not under stasis', () => {
    for (const def of ['nh:jackal', 'nh:giant_bat']) {
      const s = room();
      addTrap(getLevel(s.state), TRAP.tele, 6, 2);
      const id = addMon(s.state, def, 6, 2);
      let r = '';
      const text = run(s.state, (ctx) => {
        r = mintrap(ctx, id);
      });
      expect(r).toBe('moved');
      const p = s.state.entities[String(id)]?.c.pos;
      expect(p?.level).toBe('dlvl1');
      expect({ x: p?.x, y: p?.y }).not.toEqual({ x: 6, y: 2 });
      expect(text).toContain(
        def === 'nh:jackal' ? 'The jackal seems disoriented.' : 'The giant bat seems disoriented.',
      );
      expect(trapAt(getLevel(s.state), 6, 2)?.seen).toBe(true);
    }
    const s = room();
    addTrap(getLevel(s.state), TRAP.tele, 6, 2);
    zapStasis(s);
    const id = jackal(s, 6, 2);
    const text = run(s.state, (ctx) => void mintrap(ctx, id));
    expect(s.state.entities[String(id)]?.c.pos).toMatchObject({ x: 6, y: 2 });
    expect(text).toEqual([]);
  });
});

describe('a level teleporter', () => {
  test('"You step onto a level teleport trap!", gone; another level or a shudder; disoriented and confused', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30 && kinds.size < 2; seed++) {
      const s = room(seed);
      addTrap(getLevel(s.state), TRAP.levelTele, 3, 2);
      const conf0 = timeoutLeft(s.state, getPlayer(s.state), P.CONFUSION);
      const text = east(s);
      expect(text[0]).toBe('You step onto a level teleport trap!');
      expect(trapAt(s.state.levels['dlvl1']!, 3, 2)).toBeUndefined();
      const lv = getLevel(s.state);
      if (text.includes('You shudder for a moment.')) {
        kinds.add('shudder');
        expect(lv.id).toBe('dlvl1');
        expect(text.slice(1)).toEqual(['You shudder for a moment.', 'You feel disoriented.']);
      } else {
        kinds.add('moved');
        expect(lv.dungeon).toBe('nh:main');
        expect(lv.dlevel).toBeGreaterThanOrEqual(2);
        expect(lv.dlevel).toBeLessThanOrEqual(4);
        expect(getPlayer(s.state).c.pos?.level).toBe(lv.id);
        // level_tele_trap()'s message comes before the deferred goto's
        const i = text.indexOf('You feel disoriented.');
        expect(i).toBeGreaterThan(0);
        expect(text.indexOf('You materialize on a different level!')).toBeGreaterThan(i);
      }
      // 3 more turns of confusion (one may have ticked away at the end of the move)
      expect(timeoutLeft(s.state, getPlayer(s.state), P.CONFUSION)).toBeGreaterThanOrEqual(
        conf0 + 2,
      );
    }
    expect(kinds).toEqual(new Set(['shudder', 'moved']));
  });

  test('magic resistance: "You feel a wrenching sensation." and the trap stays', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.levelTele, 3, 2);
    setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true);
    expect(east(s)).toEqual([
      'You step onto a level teleport trap!',
      'You feel a wrenching sensation.',
    ]);
    expect(trapAt(getLevel(s.state), 3, 2)?.def).toBe(TRAP.levelTele);
    expect(getLevel(s.state).id).toBe('dlvl1');
  });

  test('a monster on it goes to another level, confused ("disappears out of sight"), or shudders', () => {
    const kinds = new Set<string>();
    for (let k = 0; k < 40 && kinds.size < 2; k++) {
      const s = room();
      addTrap(getLevel(s.state), TRAP.levelTele, 6, 2);
      const id = jackal(s, 6, 2);
      let r = '';
      const text = run(
        s.state,
        (ctx) => {
          r = mintrap(ctx, id);
        },
        k,
      );
      if (r === 'moved') {
        kinds.add('moved');
        expect(text).toEqual(['Suddenly, the jackal disappears out of sight.']);
        expect(s.state.entities[String(id)]?.c.pos).toBeUndefined();
        const to = trapTable({ state: s.state }, 'migrating', false)?.[String(id)];
        expect(typeof to).toBe('string');
        expect(to).not.toBe('dlvl1');
        expect(isMConfused({ state: s.state }, id)).toBe(true);
      } else {
        kinds.add('shudder');
        expect(r).toBe('finished');
        expect(text).toEqual(['The jackal shudders for a moment.']);
        expect(s.state.entities[String(id)]?.c.pos).toMatchObject({ x: 6, y: 2 });
      }
      // the trap stays for monsters
      expect(trapAt(getLevel(s.state), 6, 2)?.def).toBe(TRAP.levelTele);
    }
    expect(kinds).toEqual(new Set(['moved', 'shudder']));
  });
});

describe("the Catacombs' level teleporters", () => {
  test('two level teleporters on the luckstone and flint spots', () => {
    let found = 0;
    for (let seed = 1; seed <= 200 && found < 3; seed++) {
      const { state } = probeEngine.newGame({ seed });
      const n = state.dungeons.find((d) => d.id === 'nh:mines')?.levels ?? 0;
      run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: n }, 'up'));
      const level = getLevel(state);
      if (level.def !== MINEND_3.id) continue;
      found++;
      const spots = MINEND_3_PLACES.map(([x, y]) => mapToLevel(MINEND_3, level, x, y));
      const on = spots.filter((p) => trapAt(level, p.x, p.y)?.def === TRAP.levelTele);
      expect(on).toHaveLength(2);
      // the luckstone's spot is one of them (a random luckstone may lie elsewhere too)
      const stones = Object.values(state.entities).filter(
        (e) => e.def === 'nh:luckstone' && e.c.pos?.level === level.id,
      );
      expect(stones.some((st) => on.some((p) => p.x === st.c.pos?.x && p.y === st.c.pos.y))).toBe(
        true,
      );
    }
    expect(found).toBe(3);
  });
});

describe('teleportitis', () => {
  test('with the property she teleports now and then; without it never', () => {
    const s = room();
    let moved = false;
    for (let i = 0; i < 1000 && !moved; i++) {
      const before = heroAt(s.state);
      const text = s.text(s.step({ type: 'wait' }));
      expect(text.some((t) => t.startsWith('You materialize'))).toBe(false);
      expect(heroAt(s.state)).toEqual(before);
    }
    setIntrinsic(getPlayer(s.state), P.TELEPORT, true);
    let turns = 0;
    for (; turns < 1000 && !moved; turns++) {
      const before = heroAt(s.state);
      const text = s.text(s.step({ type: 'wait' }));
      if (text.some((t) => t.startsWith('You materialize'))) {
        moved = true;
        expect(heroAt(s.state)).not.toEqual(before);
      }
    }
    expect(moved).toBe(true);
  });

  test('a level that forbids teleporting says so', () => {
    const s = room();
    zapStasis(s);
    const text = run(s.state, (ctx) => tele(ctx));
    expect(text).toEqual(['A mysterious force prevents you from teleporting!']);
  });
});

describe('the wand of stasis', () => {
  test('no message, not learned; stops teleporting for 10..30 turns, then wears off', () => {
    const s = room();
    const w = s.carry(WAN.stasis);
    itemOf(s.state, w).spe = 5;
    const r = s.mod('nh:zap', { item: w });
    expect(s.text(r)).toEqual([]);
    expect(isKnown(s.state, defs, WAN.stasis)).toBe(false);
    expect(itemOf(s.state, w).spe).toBe(4);
    const level = getLevel(s.state);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    expect(noteleportLevel(ctx, level)).toBe(true);
    const zapped = s.state.turn;
    let turns = 0;
    while (inStasis(s.state, level.id) && turns < 40) {
      s.step({ type: 'wait' });
      turns++;
    }
    const lasted = s.state.turn - zapped;
    expect(lasted).toBeGreaterThanOrEqual(10);
    expect(lasted).toBeLessThanOrEqual(31);
    expect(noteleportLevel(ctx, level)).toBe(false);
  });

  test('"A mysterious force prevents you teleporting the jackal!" from the wand of teleportation', () => {
    const s = room();
    zapStasis(s);
    const id = jackal(s, 5, 2);
    const w = s.carry(WAN.teleportation);
    itemOf(s.state, w).spe = 4;
    s.mod('nh:zap', { item: w });
    const p = s.state.pendingPrompt?.prompt;
    const text = s.text(
      engine.step(s.state, { type: 'answer', promptId: p?.id ?? '', value: 'e' as Json }),
    );
    expect(text).toContain('A mysterious force prevents you teleporting the jackal!');
    expect(s.state.entities[String(id)]?.c.pos).toMatchObject({ x: 5, y: 2 });
  });
});
