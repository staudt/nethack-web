import { describe, expect, test } from 'vitest';
import {
  cellRules,
  getPlayer,
  inventoryOf,
  itemsAt,
  type DefId,
  type GameEvent,
  type PlayerAction,
} from '@nh/core';
import { BOULDER, P, T, messagesEn, mfndpos, mksobj, setIntrinsic } from '../src/index';
import { setTerrain } from '../src/actions';
import { heroAt, mapSetup, newtAt, runDir, travelTo } from './maps';
import { engine, obj, render } from './itemHelpers';

type M = ReturnType<typeof mapSetup>;

const keys = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));

/** A boulder on the floor at (x, y). */
const boulder = (m: M, x: number, y: number): number =>
  mksobj(m.ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x, y } });
const bouldersAt = (m: M, x: number, y: number): number =>
  itemsAt(engine.registry, m.state, 'dlvl1', x, y).filter((e) => e.def === BOULDER).length;

/** Average strength and constitution: weight_cap 550, so her kit is too heavy to squeeze. */
function average(m: M): void {
  const h = getPlayer(m.state);
  h.c.attributes = { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 };
}
const empty = (m: M): void => {
  for (const e of inventoryOf(m.state, m.state.playerId)) delete m.state.entities[String(e.id)];
};
const move = (dir: string): PlayerAction => ({ type: 'move', dir }) as PlayerAction;

/** Steps once; returns the events and how many turns passed. */
function act(m: M, a: PlayerAction): { events: GameEvent[]; turns: number } {
  const t0 = m.state.turn;
  const { events } = engine.step(m.state, a);
  return { events, turns: m.state.turn - t0 };
}

const ROOM = ['---------', '|.......|', '|.......|', '|.......|', '---------'];
const BIG = ['---------', '|.......|', '|.......|', '|.......|', '|.......|', '---------'];

/** The room with the hero at (2, 2) and a boulder east of her; vision is refreshed. */
function pushSetup(rows: string[] = ROOM, at = { x: 2, y: 2 }): M {
  const r = rows.map((row, y) =>
    y === at.y ? row.slice(0, at.x) + '@' + row.slice(at.x + 1) : row,
  );
  const m = mapSetup(r);
  average(m);
  return m;
}

describe('moverock: pushing', () => {
  test('a push moves the boulder one square and the hero follows, in one move', () => {
    const m = pushSetup();
    boulder(m, 3, 2);
    const r = act(m, move('e'));
    expect(heroAt(m.state)).toEqual({ x: 3, y: 2 });
    expect(bouldersAt(m, 4, 2)).toBe(1);
    expect(bouldersAt(m, 3, 2)).toBe(0);
    expect(r.turns).toBe(1);
    expect(texts(r.events)).toContain('With great effort you move the boulder.');
  });

  test('the message comes once for repeated pushes, again after two turns without pushing', () => {
    const m = pushSetup(['-----------', '|.........|', '|.........|', '-----------']);
    boulder(m, 3, 2);
    expect(keys(act(m, move('e')).events)).toContain('boulder.push');
    expect(keys(act(m, move('e')).events)).not.toContain('boulder.push');
    expect(keys(act(m, move('e')).events)).not.toContain('boulder.push');
    act(m, { type: 'wait' }); // one turn off: still quiet
    expect(keys(act(m, move('e')).events)).not.toContain('boulder.push');
    act(m, { type: 'wait' });
    act(m, { type: 'wait' }); // two turns off: said again
    expect(keys(act(m, move('e')).events)).toContain('boulder.push');
    expect(bouldersAt(m, 8, 2)).toBe(1);
  });

  test('a different boulder gets the message straight away', () => {
    const m = pushSetup(BIG);
    boulder(m, 3, 2);
    boulder(m, 4, 3);
    expect(keys(act(m, move('e')).events)).toContain('boulder.push');
    expect(keys(act(m, move('se')).events)).toContain('boulder.push');
    expect(bouldersAt(m, 5, 4)).toBe(1);
  });

  test('two boulders on one square: the first moves, "the next boulder" does not', () => {
    const m = pushSetup();
    boulder(m, 3, 2);
    boulder(m, 3, 2);
    const r = act(m, move('e'));
    expect(bouldersAt(m, 4, 2)).toBe(1);
    expect(bouldersAt(m, 3, 2)).toBe(1);
    expect(heroAt(m.state)).toEqual({ x: 2, y: 2 });
    expect(r.turns).toBe(0);
    expect(texts(r.events)).toEqual([
      'With great effort you move the boulder.',
      'You try to move the next boulder, but in vain.',
    ]);
  });

  test.each([
    [
      'a boulder behind it',
      (m: M): void => {
        boulder(m, 4, 2);
      },
      'e',
      { x: 3, y: 2 },
    ],
    ['a wall behind it', (): void => undefined, 'e', { x: 3, y: 2 }],
    ['a closed door behind it', (): void => undefined, 'e', { x: 3, y: 2 }],
    [
      'an open door diagonally behind it',
      (m: M): void => setTerrain(m.level, 4, 4, T.door_open_v),
      'se',
      { x: 3, y: 3 },
    ],
  ] as const)('%s: "in vain", nothing moves, no time', (name, extra, dir, at) => {
    const rows =
      name === 'a wall behind it'
        ? ['-----', '|...|', '|...|', '|...|', '-----']
        : name === 'a closed door behind it'
          ? ['-----', '|...|', '|...+', '|...|', '-----']
          : BIG;
    const m = pushSetup(rows);
    boulder(m, at.x, at.y);
    extra(m);
    const r = act(m, move(dir));
    expect(heroAt(m.state)).toEqual({ x: 2, y: 2 });
    expect(bouldersAt(m, at.x, at.y)).toBe(1);
    expect(r.turns).toBe(0);
    expect(texts(r.events)).toEqual(['You try to move the boulder, but in vain.']);
  });

  test('diagonally into a doorway with no door is allowed', () => {
    const m = pushSetup(BIG);
    setTerrain(m.level, 4, 4, T.doorway);
    boulder(m, 3, 3);
    act(m, move('se'));
    expect(bouldersAt(m, 4, 4)).toBe(1);
    expect(heroAt(m.state)).toEqual({ x: 3, y: 3 });
  });

  test('a monster behind the boulder, unseen (the boulder hides it): "You hear a monster"', () => {
    const m = pushSetup();
    boulder(m, 3, 2);
    newtAt(m.state, 4, 2);
    const newt = m.state.entities[String(m.state.nextEntityId - 1)];
    if (newt?.c.actor) newt.c.actor.speed = 0;
    act(m, { type: 'wait' }); // vision: the newt is in the boulder's shadow
    const r = act(m, move('e'));
    expect(texts(r.events)).toEqual([
      'You hear a monster behind the boulder.',
      "Perhaps that's why you cannot move it.",
    ]);
    expect(r.turns).toBe(0);
    expect(bouldersAt(m, 3, 2)).toBe(1);
    expect(heroAt(m.state)).toEqual({ x: 2, y: 2 });
  });

  test('a monster behind the boulder, sensed by a blind telepath: "There\'s a newt"', () => {
    const m = pushSetup();
    boulder(m, 3, 2);
    act(m, { type: 'wait' }); // she sees and remembers the boulder
    newtAt(m.state, 4, 2);
    const hero = getPlayer(m.state);
    setIntrinsic(hero, P.TELEPAT, true);
    setIntrinsic(hero, P.BLINDED, true);
    const r = act(m, move('e'));
    expect(texts(r.events)).toEqual([
      "There's a newt on the other side.",
      "Perhaps that's why you cannot move it.",
    ]);
    expect(r.turns).toBe(0);
    expect(bouldersAt(m, 3, 2)).toBe(1);
  });

  test('blind and not knowing the boulder is there: "That feels like a boulder.", no time', () => {
    const m = pushSetup();
    setIntrinsic(getPlayer(m.state), P.BLINDED, true);
    act(m, { type: 'wait' });
    boulder(m, 3, 2);
    const r = act(m, move('e'));
    expect(texts(r.events)).toEqual(['That feels like a boulder.']);
    expect(r.turns).toBe(0);
    expect(bouldersAt(m, 3, 2)).toBe(1);
    expect(m.state.objectMemory['dlvl1']?.[String(2 * m.level.width + 3)]).toBe(BOULDER);
    // now that she knows, she pushes it
    act(m, move('e'));
    expect(bouldersAt(m, 4, 2)).toBe(1);
  });

  test('carrying almost nothing, she squeezes onto the boulder that will not move', () => {
    const m = pushSetup(['-----', '|...|', '|...|', '|...|', '-----']);
    empty(m);
    boulder(m, 3, 2);
    const r = act(m, move('e'));
    expect(texts(r.events)).toEqual([
      'You try to move the boulder, but in vain.',
      'However, you can squeeze yourself into a small opening.',
      'You see here a boulder.',
    ]);
    expect(heroAt(m.state)).toEqual({ x: 3, y: 2 });
    expect(bouldersAt(m, 3, 2)).toBe(1);
    expect(r.turns).toBe(1);
  });

  test.each([
    ['nh:hole', 'The boulder falls into and plugs a hole in the floor!'],
    ['nh:trap_door', 'The boulder triggers and plugs a trap door in the floor!'],
  ])('a boulder pushed onto a %s plugs it: trap and boulder are gone', (trap, text) => {
    const m = pushSetup();
    boulder(m, 3, 2);
    m.level.traps.push({ def: trap as DefId, x: 4, y: 2, seen: true });
    const r = act(m, move('e'));
    expect(texts(r.events)[0]).toBe(text);
    expect(m.level.traps).toHaveLength(0);
    expect(bouldersAt(m, 4, 2)).toBe(0);
    expect(heroAt(m.state)).toEqual({ x: 3, y: 2 });
    expect(m.state.currentLevel).toBe('dlvl1');
    expect(r.turns).toBe(1);
  });
});

describe('boulders: squeezing, offers, fighting, pickup', () => {
  test('a diagonal squeeze between rock is refused when carrying more than 600', () => {
    const m = mapSetup(['@ ', ' .']);
    mksobj(m.ctx, obj('nh:chest'), { init: false, carriedBy: m.state.playerId });
    const r = act(m, move('se'));
    expect(texts(r.events)).toEqual(['You are carrying too much to get through.']);
    expect(heroAt(m.state)).toEqual({ x: 0, y: 0 });
    expect(r.turns).toBe(0);
    // with her own light kit she gets through
    const ok = mapSetup(['@ ', ' .']);
    act(ok, move('se'));
    expect(heroAt(ok.state)).toEqual({ x: 1, y: 1 });
  });

  test('a remembered boulder offers "Push the boulder" and "Fight the boulder"', () => {
    const m = pushSetup();
    boulder(m, 3, 2);
    act(m, { type: 'wait' });
    const offers = engine.query(m.state).actionsFor({ kind: 'cell', pos: { x: 3, y: 2 } });
    const push = offers.find((o) => o.labelKey === 'action.push');
    expect(push?.action).toEqual({ type: 'move', dir: 'e' });
    expect(messagesEn['action.push']).toBe('Push the boulder');
    const fight = offers.find((o) => o.labelKey === 'action.nh:fight');
    expect(fight && render({ key: fight.labelKey, params: fight.params ?? {} })).toBe(
      'Fight the boulder',
    );
    // an empty floor square is just a move
    const plain = engine.query(m.state).actionsFor({ kind: 'cell', pos: { x: 2, y: 3 } });
    expect(plain.some((o) => o.labelKey === 'action.move')).toBe(true);
    expect(plain.some((o) => o.labelKey === 'action.nh:fight')).toBe(false);
  });

  test('fighting a boulder: "You harmlessly attack a boulder.", one move, it stays', () => {
    const m = pushSetup();
    boulder(m, 3, 2);
    const r = act(m, { type: 'mod', action: 'nh:fight' as DefId, args: { dir: 'e' } });
    expect(texts(r.events)).toEqual(['You harmlessly attack a boulder.']);
    expect(r.turns).toBe(1);
    expect(bouldersAt(m, 3, 2)).toBe(1);
  });

  test('a boulder is not offered for pickup and cannot be lifted', () => {
    const m = pushSetup();
    boulder(m, 2, 2);
    const self = engine.query(m.state).actionsFor({ kind: 'self' });
    expect(self.some((o) => o.labelKey === 'action.nh:pickup')).toBe(false);
    const r = act(m, { type: 'mod', action: 'nh:pickup' as DefId });
    expect(texts(r.events)).toEqual(['There is a boulder here, but you cannot lift any more.']);
    expect(bouldersAt(m, 2, 2)).toBe(1);
  });
});

describe('boulders and movement', () => {
  test('a monster never steps onto a boulder', () => {
    const m = mapSetup(['-----', '|...|', '|...|', '|.@.|', '-----']);
    const newt = newtAt(m.state, 2, 1);
    // every square around the newt but one holds a boulder
    for (const [x, y] of [
      [1, 1],
      [3, 1],
      [1, 2],
      [3, 2],
    ] as const)
      boulder(m, x, y);
    const rules = cellRules(m.level, engine.registry);
    const cands = mfndpos(m.ctx as never, m.level, rules, newt, heroAt(m.state));
    expect(cands.map((c) => [c.x, c.y])).toEqual([[2, 2]]);
  });

  test('rushing stops in front of a boulder; it is not pushed', () => {
    const m = pushSetup(['-----------', '|.........|', '|.........|', '-----------']);
    boulder(m, 6, 2);
    engine.stepAll(m.state, runDir('e', 'rush'));
    expect(heroAt(m.state)).toEqual({ x: 5, y: 2 });
    expect(bouldersAt(m, 6, 2)).toBe(1);
  });

  test('travel stops in front of a single boulder in its way', () => {
    const m = pushSetup(['-----------', '|.........|', '-----------'], { x: 1, y: 1 });
    boulder(m, 4, 1);
    engine.stepAll(m.state, travelTo(8, 1));
    expect(heroAt(m.state)).toEqual({ x: 3, y: 1 });
    expect(bouldersAt(m, 4, 1)).toBe(1);
  });

  test('travel goes around two boulders in a row', () => {
    const m = pushSetup(['-------', '|.....|', '|.---.|', '|.....|', '-------'], { x: 1, y: 1 });
    boulder(m, 2, 1);
    boulder(m, 3, 1);
    engine.stepAll(m.state, travelTo(4, 1));
    expect(heroAt(m.state)).toEqual({ x: 4, y: 1 });
    expect(bouldersAt(m, 2, 1)).toBe(1);
    expect(bouldersAt(m, 3, 1)).toBe(1);
  });
});
