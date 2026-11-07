// m7d step 4: levitation. The ring floats her up (out of a pit; a bear trap holds her) and down
// (the trap there goes off), she passes over the floor's traps, cannot reach the floor (pick up,
// eat, loot, '>', fountains), kicks with nothing to brace against, cannot push boulders, and
// Sokoban's air currents still pull her into its pits. Outcomes are asserted; rolls are pinned
// (unseen traps have no escape roll) or every outcome is accepted.
// ref: src/trap.c float_up(), float_down(), dotrap(), fall_through(), climb_pit();
// src/do_wear.c Ring_on(), Ring_off_or_gone(); src/hack.c moverock(), pickup_checks();
// src/do.c dodown(); src/dokick.c dokick(); src/fountain.c drinkfountain(); src/dig.c
// digactualhole()
import {
  buildSnapshot,
  getLevel,
  getPlayer,
  itemsAt,
  trapAt,
  type DefId,
  type EntityId,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, T, TRAP, WAN, hasProp, isKnown, utrap, weightCap } from '../src/index';
import { mksobj } from '../src/items';
import { setTerrain } from '../src/terrain';
import { levitating } from '../src/trapstate';
import { defs, engine, itemOf, obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

const RING = 'nh:ring_of_levitation';

type M = ReturnType<typeof mapSetup>;

const texts = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

/** A map (see mapSetup) with a plain kit and rings known by name. */
function make(rows: string[], seed = 1): M {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 500, max: 500 };
  for (const d of defs.objects) if (d.class === 'ring') delete m.state.appearances[d.id];
  return m;
}
const mod = (m: M, action: string, args?: Record<string, unknown>): StepResult =>
  m.step({ type: 'mod', action: action as DefId, ...(args ? { args: args as never } : {}) });
const answer = (m: M, value: unknown): StepResult => {
  const p = m.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(m.state, { type: 'answer', promptId: p.id, value: value as never });
};
function carry(m: M, id: string): EntityId {
  return mksobj(m.ctx, obj(id), { init: false, carriedBy: m.state.playerId });
}
/** A ring of levitation in her pack. */
function ring(m: M, buc: 'uncursed' | 'cursed' = 'uncursed'): EntityId {
  const r = carry(m, RING);
  itemOf(m.state, r).buc = buc;
  return r;
}
/** Puts the ring on her left hand; the messages. */
function putOn(m: M, r: EntityId): string[] {
  const t = texts(mod(m, 'nh:puton', { item: r }));
  return m.state.pendingPrompt ? [...t, ...texts(answer(m, 'l'))] : t;
}
const removeRing = (m: M, r: EntityId): string[] => texts(mod(m, 'nh:remove', { item: r }));
const walk = (m: M, dir: string): string[] => texts(m.step({ type: 'move', dir: dir as never }));
const pos = (s: GameState) => {
  const p = getPlayer(s).c.pos!;
  return { level: p.level, x: p.x, y: p.y };
};
const hp = (s: GameState): number => getPlayer(s).c.hp?.cur ?? 0;
function trap(m: M, def: DefId, x: number, y: number, seen: boolean): void {
  m.level.traps.push({ def, x, y, seen });
}

const ROOM = ['-----------', '|.........|', '|...@.....|', '|.........|', '-----------'];
/** Big enough for a level below to be made at its size. */
const BIG = ['..........', '..@.......', ...Array.from({ length: 10 }, () => '..........')];

describe('putting on and taking off the ring', () => {
  test('she floats up, the ring is learned, Lev shows, she can carry the most', () => {
    const m = make(ROOM);
    const r = ring(m);
    const capBefore = weightCap(m.state, m.state.playerId);
    expect(putOn(m, r)).toContain('You start to float in the air!');
    expect(levitating(m.ctx)).toBe(true);
    expect(isKnown(m.state, defs, defs.object(RING))).toBe(true);
    expect(buildSnapshot(defs, m.state).status['lev']).toBe(1);
    expect(weightCap(m.state, m.state.playerId)).toBe(1000);
    expect(capBefore).toBeLessThan(1000);
    expect(removeRing(m, r)).toContain('You float gently to the floor.');
    expect(levitating(m.ctx)).toBe(false);
    expect(buildSnapshot(defs, m.state).status['lev']).toBeUndefined();
  });

  test('over a pit she is in, she floats up and out of it', () => {
    const m = make(ROOM);
    trap(m, TRAP.pit, 4, 2, true);
    m.ctx.state.modData['nh'] = {
      ...(m.state.modData['nh'] as object),
      utrap: { n: 5, type: 'pit' },
    };
    expect(putOn(m, ring(m))).toContain('You float up, out of the pit!');
    expect(utrap(m.ctx)).toBeNull();
    expect(levitating(m.ctx)).toBe(true);
  });

  test('a bear trap holds her down until she wriggles free, then she floats', () => {
    const m = make(ROOM);
    trap(m, TRAP.bear, 4, 2, true);
    m.ctx.state.modData['nh'] = {
      ...(m.state.modData['nh'] as object),
      utrap: { n: 1, type: 'beartrap' },
    };
    const r = ring(m);
    expect(putOn(m, r)).toContain('You float up slightly, but your leg is still stuck.');
    expect(hasProp(getPlayer(m.state), P.LEVITATION)).toBe(true);
    expect(levitating(m.ctx)).toBe(false);
    // a diagonal move always loosens the last turn of it
    const t = walk(m, 'ne');
    expect(t).toContain('You finally wriggle free.');
    expect(t).toContain('You start to float in the air!');
    expect(levitating(m.ctx)).toBe(true);
    expect(pos(m.state)).toMatchObject({ x: 4, y: 2 });
  });

  test('removing the ring in a bear trap: no longer trying to float up', () => {
    const m = make(ROOM);
    const r = ring(m);
    putOn(m, r);
    trap(m, TRAP.bear, 4, 2, true);
    m.ctx.state.modData['nh'] = {
      ...(m.state.modData['nh'] as object),
      utrap: { n: 4, type: 'beartrap' },
    };
    expect(removeRing(m, r)).toContain(
      "You are no longer trying to float up from the trap's jaws.",
    );
  });

  test('a cursed ring cannot be removed: she stays up', () => {
    const m = make(ROOM);
    const r = ring(m, 'cursed');
    putOn(m, r);
    expect(removeRing(m, r)).toContain("You can't.  It is cursed.");
    expect(levitating(m.ctx)).toBe(true);
  });

  test('taking it off over an unseen trap door drops her through it', () => {
    const m = make(BIG);
    const r = ring(m);
    putOn(m, r);
    trap(m, TRAP.trapdoor, 3, 1, false);
    expect(walk(m, 'e')).toEqual([]); // floating over it, she never notices it
    expect(pos(m.state)).toMatchObject({ level: 'dlvl1', x: 3, y: 1 });
    expect(trapAt(m.level, 3, 1)?.seen).toBe(false);
    const t = removeRing(m, r);
    expect(t).toContain('You float gently to the floor.');
    expect(t).toContain('A trap door opens up under you!');
    expect(pos(m.state).level).not.toBe('dlvl1');
  });

  test('in Sokoban the air currents knock her over as she comes down onto a trap', () => {
    const m = make(ROOM);
    m.level.sokoban = true;
    const r = ring(m);
    putOn(m, r);
    trap(m, TRAP.pit, 4, 2, true);
    const before = hp(m.state);
    const t = removeRing(m, r);
    expect(t).toContain('You fall over.');
    expect(t).toContain('Air currents pull you down into a pit!');
    expect(utrap(m.ctx)?.type).toBe('pit');
    expect(before - hp(m.state)).toBeGreaterThanOrEqual(1);
  });
});

describe('floating over traps', () => {
  for (const [def, name] of [
    [TRAP.pit, 'a pit'],
    [TRAP.spikedPit, 'a spiked pit'],
    [TRAP.hole, 'a hole'],
    [TRAP.trapdoor, 'a trap door'],
    [TRAP.bear, 'a bear trap'],
    [TRAP.squeaky, 'a squeaky board'],
    [TRAP.arrow, 'an arrow trap'],
    [TRAP.rock, 'a falling rock trap'],
  ] as const)
    test(`a seen ${name}: "You float over ${name}." and nothing happens`, () => {
      const m = make(BIG);
      putOn(m, ring(m));
      trap(m, def, 3, 1, true);
      const before = hp(m.state);
      // no "Really step onto...?" for the ground traps; the projectile traps still ask
      let t = walk(m, 'e');
      if (m.state.pendingPrompt) {
        expect(m.state.pendingPrompt.prompt.key).toMatch(/_float$/);
        t = texts(answer(m, true));
      }
      expect(t).toContain(`You float over ${name}.`);
      expect(pos(m.state)).toMatchObject({ level: 'dlvl1', x: 3, y: 1 });
      expect(utrap(m.ctx)).toBeNull();
      expect(hp(m.state)).toBe(before);
    });

  test('a level teleporter still works: "You float onto a level teleport trap!"', () => {
    const m = make(BIG);
    putOn(m, ring(m));
    trap(m, TRAP.levelTele, 3, 1, false);
    expect(walk(m, 'e')).toContain('You float onto a level teleport trap!');
  });

  test("Sokoban's air currents still pull her into a pit; she floats out against them", () => {
    const m = make(ROOM);
    m.level.sokoban = true;
    putOn(m, ring(m));
    trap(m, TRAP.pit, 5, 2, true);
    let t = walk(m, 'e');
    if (m.state.pendingPrompt) t = texts(answer(m, true)); // a Sokoban pit is never safe
    expect(t).toContain('Air currents pull you down into a pit!');
    expect(utrap(m.ctx)?.type).toBe('pit');
    expect(levitating(m.ctx)).toBe(true); // a pit does not hold her down
    let out: string[] = [];
    for (let i = 0; i < 20 && utrap(m.ctx); i++) out = texts(mod(m, 'nh:up'));
    expect(out).toContain(
      'You struggle against the air currents and float to the edge of the pit.',
    );
  });
});

describe('out of reach of the floor', () => {
  test('pick up: the floor, the bottom of a seen pit, the edge of a hole', () => {
    const m = make(ROOM);
    putOn(m, ring(m));
    mksobj(m.ctx, obj('nh:food_ration'), { init: false, at: { level: 'dlvl1', x: 4, y: 2 } });
    expect(texts(mod(m, 'nh:pickup'))).toEqual(['You cannot reach the floor.']);
    trap(m, TRAP.pit, 4, 2, true);
    expect(texts(mod(m, 'nh:pickup'))).toEqual(['You cannot reach the bottom of the pit.']);
    m.level.traps[0]!.def = TRAP.hole;
    expect(texts(mod(m, 'nh:pickup'))).toEqual(['You cannot reach the edge of the hole.']);
    expect(itemsAt(defs, m.state, 'dlvl1', 4, 2).map((o) => o.def)).toEqual(['nh:food_ration']);
  });

  test('floor food is not offered; walking onto objects shows nothing', () => {
    const m = make(ROOM);
    putOn(m, ring(m));
    mksobj(m.ctx, obj('nh:food_ration'), { init: false, at: { level: 'dlvl1', x: 5, y: 2 } });
    expect(walk(m, 'e')).toEqual([]);
    const offers = engine
      .query(m.state)
      .actionsFor({ kind: 'self' })
      .map((o) => (o.action.type === 'mod' ? o.action.action : ''));
    expect(offers).toContain('nh:pickup');
    expect(offers).not.toContain('nh:eat');
  });

  test('> on the down stairs: "You are floating high above the stairs."', () => {
    const m = make(['-----', '|.@>|', '-----']);
    putOn(m, ring(m));
    walk(m, 'e');
    const turn = m.state.turn;
    expect(texts(mod(m, 'nh:down'))).toEqual(['You are floating high above the stairs.']);
    expect(pos(m.state).level).toBe('dlvl1');
    expect(m.state.turn).toBe(turn);
  });

  test('a fountain: "You are floating high above the fountain."', () => {
    const m = make(ROOM);
    setTerrain(m.level, 4, 2, T.fountain);
    putOn(m, ring(m));
    const turn = m.state.turn;
    expect(texts(mod(m, 'nh:quaff', { fountain: true }))).toEqual([
      'You are floating high above the fountain.',
    ]);
    expect(m.state.turn).toBe(turn);
  });

  test('a floor box cannot be looted', () => {
    const m = make(ROOM);
    putOn(m, ring(m));
    const box = mksobj(m.ctx, obj('nh:large_box'), {
      init: false,
      at: { level: 'dlvl1', x: 4, y: 2 },
    });
    expect(texts(mod(m, 'nh:loot', { box }))).toEqual(["You can't reach the floor."]);
  });
});

describe('kicking and pushing while floating', () => {
  test('nothing to brace against in the open; a wall behind her braces the kick', () => {
    const m = make(['-------', '|.....|', '|.@...|', '|.....|', '-------']);
    putOn(m, ring(m));
    expect(texts(mod(m, 'nh:kick', { dir: 'e' }))).toEqual([
      'You have nothing to brace yourself against.',
    ]);
    // against the west wall she kicks east at empty space (or strains a muscle)
    walk(m, 'w');
    const t = texts(mod(m, 'nh:kick', { dir: 'e' }));
    expect(t.some((s) => s === 'You kick at empty space.' || s.startsWith('Dumb move!'))).toBe(
      true,
    );
  });

  test('a closed door does not give: "Ouch!  That hurts!"', () => {
    const m = make(['-----', '|@+.|', '-----']);
    putOn(m, ring(m));
    const before = hp(m.state);
    expect(texts(mod(m, 'nh:kick', { dir: 'e' }))).toContain('Ouch!  That hurts!');
    const lv = getLevel(m.state, 'dlvl1');
    expect(lv.palette[lv.cells[1 * lv.width + 2] ?? 0]).toBe(T.door_closed);
    expect(hp(m.state)).toBeLessThan(before);
  });

  test('a boulder: "You don\'t have enough leverage to push the boulder."', () => {
    const m = make(ROOM);
    putOn(m, ring(m));
    const b = mksobj(m.ctx, obj('nh:boulder'), { init: false, at: { level: 'dlvl1', x: 5, y: 2 } });
    expect(walk(m, 'e')).toEqual(["You don't have enough leverage to push the boulder."]);
    expect(pos(m.state)).toMatchObject({ x: 4, y: 2 });
    expect(m.state.entities[String(b)]?.c.pos).toMatchObject({ x: 5, y: 2 });
  });
});

describe('digging down while floating', () => {
  test('a hole is dug below her, but she does not fall', () => {
    const m = make(BIG);
    putOn(m, ring(m));
    const w = carry(m, WAN.digging);
    itemOf(m.state, w).spe = 4;
    mod(m, 'nh:zap', { item: w });
    const t = texts(answer(m, 'down'));
    expect(t).toContain('You dig a hole through the floor.');
    expect(trapAt(m.level, 2, 1)?.def).toBe(TRAP.hole);
    expect(pos(m.state)).toMatchObject({ level: 'dlvl1', x: 2, y: 1 });
  });

  test('a wand of opening forces the trap door under her open, but she does not fall in', () => {
    const m = make(BIG);
    putOn(m, ring(m));
    trap(m, TRAP.trapdoor, 2, 1, true);
    const w = carry(m, WAN.opening);
    itemOf(m.state, w).spe = 4;
    mod(m, 'nh:zap', { item: w });
    const t = texts(answer(m, 'down'));
    expect(t).toContain('A trap door opens up under you!');
    expect(t).toContain("You don't fall in.");
    expect(pos(m.state)).toMatchObject({ level: 'dlvl1', x: 2, y: 1 });
  });
});
