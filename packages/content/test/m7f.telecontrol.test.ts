// m7f-a step 2: the ring of teleport control and controlled teleports (the scroll, the wand at
// herself, teleportation traps, teleportitis) and controlled level teleports (the cursed or
// confused scroll, level teleporters). Outcomes are asserted; where a roll decides the case,
// seeds are searched for each outcome.
import {
  createEngine,
  getLevel,
  getPlayer,
  trapAt,
  type DefId,
  type EntityId,
  type GameState,
  type Ctx,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { TELE_ID, WAN, isKnown, teleControlled, vanillaMod } from '../src/index';
import { P, hasProp, setIntrinsic, timeoutLeft } from '../src/props';
import { TRAP, tele } from '../src/trap';
import { defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

// a probe action runs content functions with a real Ctx (no time passes)
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'tc-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'tc-probe:run',
      labelKey: 'tc-probe',
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
function probeText(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return probeEngine
    .step(state, { type: 'mod', action: 'tc-probe:run' as DefId })
    .events.flatMap((e) =>
      e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
    );
}

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
type S = ReturnType<typeof levelSetup>;
function room(seed = 1, control = true): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const d of defs.objects) if (d.class === 'wand') delete s.state.appearances[d.id];
  s.step({ type: 'wait' });
  if (control) setIntrinsic(getPlayer(s.state), P.TELEPORT_CONTROL, true);
  return s;
}
const heroAt = (state: GameState) => {
  const p = getPlayer(state).c.pos;
  return p ? { x: p.x, y: p.y } : null;
};
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const addTrap = (level: Level, def: string, x: number, y: number) => {
  level.traps.push({ def: def as DefId, x, y, seen: false });
  level.traps.sort((a, b) => a.y * level.width + a.x - (b.y * level.width + b.x));
};
function scroll(s: S, buc: 'blessed' | 'uncursed' | 'cursed' = 'uncursed'): EntityId {
  const id = s.carry('nh:scroll_of_teleportation');
  itemOf(s.state, id).buc = buc;
  return id;
}
const read = (s: S, id: EntityId): StepResult => s.mod('nh:read', { item: id });

describe('the ring of teleport control', () => {
  test('objects.h: a gold ring, 300 zm, after teleportation; wearing it gives control', () => {
    const def = defs.object('nh:ring_of_teleport_control' as DefId);
    expect(def).toMatchObject({
      class: 'ring',
      cost: 300,
      material: 'gold',
      prop: 'teleport_control',
    });
    const rings = defs.objects.filter((d) => d.class === 'ring').map((d) => d.id);
    expect(rings.indexOf(def.id)).toBe(rings.indexOf('nh:ring_of_teleportation' as DefId) + 1);
    const s = room(1, false);
    const ring = s.carry('nh:ring_of_teleport_control');
    s.mod('nh:puton', { item: ring });
    if (s.state.pendingPrompt) answer(s, 'l');
    expect(hasProp(getPlayer(s.state), P.TELEPORT_CONTROL)).toBe(true);
    expect(teleControlled({ state: s.state })).toBe(true);
  });
});

describe('a controlled teleport', () => {
  test('the scroll asks where; she lands there; the move is spent with the answer', () => {
    const s = room();
    const sc = scroll(s);
    const turn = s.state.turn;
    const r = read(s, sc);
    // "Where do you want to be teleported?" (the UI shows the prompt's text in the log)
    expect(r.prompt).toMatchObject({ id: 'tele-where', kind: 'position', key: 'tele.where_to' });
    expect(s.state.turn).toBe(turn);
    // the scroll is used up and known either way
    expect(s.state.entities[String(sc)]).toBeUndefined();
    expect(isKnown(s.state, defs, 'nh:scroll_of_teleportation')).toBe(true);
    const text = s.text(answer(s, { x: 15, y: 4 }));
    expect(heroAt(s.state)).toEqual({ x: 15, y: 4 });
    expect(text).toContain('You materialize in a different location!');
    expect(s.state.turn).toBe(turn + 1); // one move in all
  });

  test('a blessed scroll controls it without the property', () => {
    const s = room(1, false);
    expect(read(s, scroll(s, 'blessed')).prompt?.id).toBe('tele-where');
    answer(s, { x: 10, y: 1 });
    expect(heroAt(s.state)).toEqual({ x: 10, y: 1 });
  });

  test('stunned, control is lost: a random teleport and no prompt', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.STUNNED, true);
    expect(teleControlled({ state: s.state })).toBe(false);
    const r = read(s, scroll(s, 'blessed'));
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.text(r).some((t) => t.startsWith('You materialize'))).toBe(true);
  });

  test('cancelling stays put; the scroll is still used up and known', () => {
    const s = room();
    const sc = scroll(s);
    const from = heroAt(s.state);
    read(s, sc);
    const text = s.text(answer(s, null));
    expect(heroAt(s.state)).toEqual(from);
    expect(text.filter((t) => t.startsWith('You materialize'))).toEqual([]);
    expect(s.state.entities[String(sc)]).toBeUndefined();
    expect(isKnown(s.state, defs, 'nh:scroll_of_teleportation')).toBe(true);
  });

  test('a spot she cannot land on is "Sorry..." and a random teleport', () => {
    const s = room();
    read(s, scroll(s));
    const text = s.text(answer(s, { x: 0, y: 0 })); // solid rock
    expect(text).toContain('Sorry...');
    expect(text.some((t) => t.startsWith('You materialize'))).toBe(true);
    expect(heroAt(s.state)).not.toEqual({ x: 0, y: 0 });
  });

  test('unconscious: "Being unconscious, you cannot control your teleport." and a random one', () => {
    const s = room();
    getPlayer(s.state).c.helpless = { until: s.state.turn + 50, reasonKey: 'helpless.asleep' };
    const text = probeText(s.state, (ctx) => tele(ctx));
    expect(text[0]).toBe('Being unconscious, you cannot control your teleport.');
    expect(text.some((t) => t.startsWith('You materialize'))).toBe(true);
    expect(s.state.pendingPrompt).toBeNull();
  });

  test('the wand zapped at herself asks, and is learned even for a short hop', () => {
    const s = room();
    const w = s.carry(WAN.teleportation);
    itemOf(s.state, w).spe = 5;
    const turn = s.state.turn;
    s.mod('nh:zap', { item: w });
    const r = answer(s, 'self');
    expect(r.prompt?.id).toBe('tele-where');
    expect(isKnown(s.state, defs, WAN.teleportation)).toBe(true);
    const from = heroAt(s.state)!;
    const to = { x: from.x + 1, y: from.y + 1 };
    answer(s, to);
    expect(heroAt(s.state)).toEqual(to);
    expect(s.state.turn).toBe(turn + 1); // one move in all: the zap took it
  });

  test('a teleportation trap asks where; the trap stays', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.tele, 3, 2);
    const r = s.step({ type: 'move', dir: 'e' });
    expect(r.prompt?.id).toBe('tele-where');
    expect(heroAt(s.state)).toEqual({ x: 3, y: 2 });
    answer(s, { x: 18, y: 5 });
    expect(heroAt(s.state)).toEqual({ x: 18, y: 5 });
    expect(trapAt(getLevel(s.state), 3, 2)?.def).toBe(TRAP.tele);
  });

  test('teleportitis asks where at the end of a turn', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.TELEPORT, true);
    let asked = false;
    for (let i = 0; i < 1000 && !asked; i++) {
      s.step({ type: 'wait' });
      asked = s.state.pendingPrompt?.prompt.id === 'tele-where';
    }
    expect(asked).toBe(true);
    expect(s.state.pendingPrompt?.handler).toBe(TELE_ID);
    answer(s, { x: 12, y: 3 });
    expect(heroAt(s.state)).toEqual({ x: 12, y: 3 });
    expect(s.state.pendingPrompt).toBeNull();
  });
});

describe('a controlled level teleport', () => {
  test('the cursed scroll asks for a level; a number is that depth', () => {
    const s = room();
    const r = read(s, scroll(s, 'cursed'));
    expect(r.prompt).toMatchObject({ id: 'tele-level', kind: 'text', key: 'tele.level_prompt' });
    expect(s.state.pendingPrompt?.handler).toBe(TELE_ID);
    const text = s.text(answer(s, '3'));
    expect(getLevel(s.state)).toMatchObject({ dungeon: 'nh:main', dlevel: 3 });
    expect(text).toContain('You materialize on a different level!');
  });

  test('her own depth does nothing; cancelling stays; "*" is a random level', () => {
    const s = room();
    read(s, scroll(s, 'cursed'));
    expect(s.text(answer(s, '1')).filter((t) => /materialize|get there/.test(t))).toEqual([]);
    expect(getLevel(s.state).id).toBe('dlvl1');
    read(s, scroll(s, 'cursed'));
    answer(s, null);
    expect(getLevel(s.state).id).toBe('dlvl1');
    expect(s.state.pendingPrompt).toBeNull();
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30 && kinds.size < 2; seed++) {
      const t = room(seed);
      read(t, scroll(t, 'cursed'));
      const text = t.text(answer(t, '*'));
      if (text.includes('You shudder for a moment.')) kinds.add('shudder');
      else {
        expect(getLevel(t.state).dlevel).toBeGreaterThanOrEqual(2);
        expect(getLevel(t.state).dlevel).toBeLessThanOrEqual(4);
        kinds.add('moved');
      }
    }
    expect(kinds).toEqual(new Set(['shudder', 'moved']));
  });

  test('past the bottom of the dungeon is its last level', () => {
    const s = room();
    read(s, scroll(s, 'cursed'));
    answer(s, '99');
    const lv = getLevel(s.state);
    expect(lv.dungeon).toBe('nh:main');
    expect(lv.dlevel).toBeGreaterThan(20);
  });

  test('words ask again with the hint, 10 times, then a random level', () => {
    const s = room();
    read(s, scroll(s, 'cursed'));
    for (let i = 1; i < 10; i++) {
      const r = answer(s, 'oracle');
      expect(r.prompt).toMatchObject({ id: 'tele-level', key: 'tele.level_prompt_again' });
    }
    const text = s.text(answer(s, 'oracle'));
    expect(s.state.pendingPrompt).toBeNull();
    expect(
      text.includes('You shudder for a moment.') ||
        text.includes('You materialize on a different level!'),
    ).toBe(true);
  });

  test('0 asks "Go to Nowhere.  Are you sure?": no stays, yes is suicide', () => {
    const s = room();
    read(s, scroll(s, 'cursed'));
    expect(answer(s, '0').prompt).toMatchObject({ id: 'tele-nowhere', kind: 'yn' });
    answer(s, false);
    expect(s.state.gameOver).toBeNull();
    expect(getLevel(s.state).id).toBe('dlvl1');
    read(s, scroll(s, 'cursed'));
    answer(s, '0');
    const text = s.text(answer(s, true));
    expect(text).toEqual(
      expect.arrayContaining([
        'You scream in agony as your body begins to warp...',
        'You cease to exist.',
      ]),
    );
    expect(s.state.gameOver).toMatchObject({ kind: 'died', killer: '@killer.tele.suicide' });
  });

  test('above the dungeon: she plummets, floats down when levitating, or arrives in heaven', () => {
    const fall = room();
    read(fall, scroll(fall, 'cursed'));
    expect(fall.text(answer(fall, '-3'))).toEqual(
      expect.arrayContaining([
        'You are now high above the clouds...',
        "Unfortunately, you don't know how to fly.",
        'You plummet a few thousand feet to your death.',
      ]),
    );
    expect(fall.state.gameOver).toMatchObject({ kind: 'died', killer: '@killer.tele.plummet' });

    const float = room();
    setIntrinsic(getPlayer(float.state), P.LEVITATION, true);
    read(float, scroll(float, 'cursed'));
    expect(float.text(answer(float, '-9'))).toEqual(
      expect.arrayContaining([
        'You feel deliriously happy.',
        "(In fact, you're on Cloud 9!)",
        'You float gently down to earth.',
      ]),
    );
    expect(float.state.gameOver).toMatchObject({ kind: 'escaped' });

    const heaven = room();
    setIntrinsic(getPlayer(heaven.state), P.LEVITATION, true);
    read(heaven, scroll(heaven, 'cursed'));
    expect(heaven.text(answer(heaven, '-10'))).toContain('You arrive in heaven.');
    expect(heaven.state.gameOver).toMatchObject({ kind: 'died', killer: '@killer.tele.heaven' });
  });

  test('confused, "Oops..." sends her to a random level most of the time, even cancelling', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40 && kinds.size < 2; seed++) {
      const s = room(seed);
      setIntrinsic(getPlayer(s.state), P.CONFUSION, true);
      read(s, scroll(s)); // confused: a level teleport
      expect(s.state.pendingPrompt?.prompt.id).toBe('tele-level');
      const text = s.text(answer(s, null));
      if (text.includes('Oops...')) kinds.add('oops');
      else {
        kinds.add('cancelled');
        expect(getLevel(s.state).id).toBe('dlvl1');
      }
    }
    expect(kinds).toEqual(new Set(['oops', 'cancelled']));
  });

  test('a level teleporter: asks, then "You briefly feel centered." and no confusion', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.levelTele, 3, 2);
    const r = s.step({ type: 'move', dir: 'e' });
    expect(s.text(r)[0]).toBe('You step onto a level teleport trap!');
    expect(r.prompt?.id).toBe('tele-level');
    const text = s.text(answer(s, '2'));
    const i = text.indexOf('You briefly feel centered.');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('You materialize on a different level!')).toBeGreaterThan(i);
    expect(getLevel(s.state).dlevel).toBe(2);
    expect(timeoutLeft(s.state, getPlayer(s.state), P.CONFUSION)).toBe(0);
  });

  test('stunned, control is lost: a random level and no prompt', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.STUNNED, true);
    read(s, scroll(s, 'cursed'));
    expect(s.state.pendingPrompt).toBeNull();
  });
});
