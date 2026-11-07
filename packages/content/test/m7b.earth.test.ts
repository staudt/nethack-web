// The scroll of earth. ref: src/read.c seffect_earth(), drop_boulder_on_player(),
// drop_boulder_on_monster()
import { describe, expect, test } from 'vitest';
import {
  getPlayer,
  itemsAt,
  type Buc,
  type DefId,
  type GameEvent,
  type PlayerAction,
} from '@nh/core';
import { BOULDER, P, T, isKnown, isMtrapped, mksobj, setItimeout } from '../src/index';
import { setMtrapped } from '../src/trapstate';
import { setTerrain } from '../src/actions';
import { mapSetup, newtAt } from './maps';
import { defs, engine, obj, render } from './itemHelpers';

type M = ReturnType<typeof mapSetup>;

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));

const ROOM = ['---------', '|.......|', '|...@...|', '|.......|', '---------'];
const HX = 4;
const HY = 2;
const AROUND = [-1, 0, 1].flatMap((dx) =>
  [-1, 0, 1].filter((dy) => dx !== 0 || dy !== 0).map((dy) => ({ x: HX + dx, y: HY + dy })),
);

const count = (m: M, def: DefId, x: number, y: number): number =>
  itemsAt(engine.registry, m.state, 'dlvl1', x, y)
    .filter((e) => e.def === def)
    .reduce((n, e) => n + (e.c.item?.quantity ?? 1), 0);

/** The hero in the room with plenty of hit points. */
function setup(rows: string[] = ROOM): M {
  const m = mapSetup(rows);
  const h = getPlayer(m.state);
  if (h.c.hp) h.c.hp = { cur: 500, max: 500 };
  return m;
}

/** Reads a new scroll of earth of the given BUC; returns the step's message texts. */
function readEarth(m: M, buc: Buc): string[] {
  const id = mksobj(m.ctx, obj('nh:scroll_of_earth'), {
    init: false,
    carriedBy: m.state.playerId,
  });
  const it = m.state.entities[String(id)]?.c.item;
  if (it) it.buc = buc;
  const a = { type: 'mod', action: 'nh:read', args: { item: id } } as unknown as PlayerAction;
  return texts(engine.step(m.state, a).events);
}

/** A pinned (speed 0, asleep) newt at (x, y) with `hp` hit points. */
function newt(m: M, x: number, y: number, hp: number): number {
  const id = newtAt(m.state, x, y);
  const e = m.state.entities[String(id)];
  if (e?.c.hp) e.c.hp = { cur: hp, max: hp };
  if (e?.c.actor) e.c.actor.speed = 0;
  return id;
}

const heroHp = (m: M): number => getPlayer(m.state).c.hp?.cur ?? 0;

describe('scroll of earth', () => {
  test('uncursed: a boulder on each square around and one on the hero; identified', () => {
    const m = setup();
    const t = readEarth(m, 'uncursed');
    expect(t[0]).toBe('As you read the scroll, it disappears.');
    expect(t[1]).toBe('The ceiling rumbles above you!');
    expect(t).toContain('You are hit by a boulder!');
    for (const p of AROUND) expect(count(m, BOULDER, p.x, p.y)).toBe(1);
    expect(count(m, BOULDER, HX, HY)).toBe(1);
    expect(heroHp(m)).toBeLessThan(500);
    expect(heroHp(m)).toBeGreaterThanOrEqual(480); // rnd(20)
    expect(isKnown(m.state, defs, 'nh:scroll_of_earth')).toBe(true);
  });

  test('blessed: boulders around only; "around you"', () => {
    const m = setup();
    const t = readEarth(m, 'blessed');
    expect(t[1]).toBe('The ceiling rumbles around you!');
    for (const p of AROUND) expect(count(m, BOULDER, p.x, p.y)).toBe(1);
    expect(count(m, BOULDER, HX, HY)).toBe(0);
    expect(heroHp(m)).toBe(500);
    expect(t).not.toContain('But nothing else happens.');
  });

  test('blessed with no open square around: "But nothing else happens."', () => {
    const m = setup(['-----', '|-.-|', '|.@+|', '|---|', '-----']);
    // the closet: floor N and W, a closed door E, walls elsewhere
    const t = readEarth(m, 'blessed');
    expect(count(m, BOULDER, 2, 1)).toBe(1);
    expect(count(m, BOULDER, 1, 2)).toBe(1);
    expect(count(m, BOULDER, 3, 2)).toBe(0); // closed door
    expect(t).not.toContain('But nothing else happens.');
    const walled = setup(['---', '|@|', '---']);
    const t2 = readEarth(walled, 'blessed');
    expect(t2).toContain('But nothing else happens.');
  });

  test('cursed: only the hero, and her hard helmet does not help', () => {
    const m = setup();
    const helm = mksobj(m.ctx, obj('nh:dwarvish_iron_helm'), {
      init: false,
      carriedBy: m.state.playerId,
    });
    const hi = m.state.entities[String(helm)]?.c.item;
    if (hi) hi.equipped = 'helm';
    const t = readEarth(m, 'cursed');
    for (const p of AROUND) expect(count(m, BOULDER, p.x, p.y)).toBe(0);
    expect(count(m, BOULDER, HX, HY)).toBe(1);
    expect(t).toContain('You are hit by a boulder!');
    expect(t).not.toContain('Fortunately, you are wearing a hard helmet.');
    expect(heroHp(m)).toBeLessThan(500);
  });

  test('uncursed with a hard helmet: at most 2 damage', () => {
    const m = setup();
    const helm = mksobj(m.ctx, obj('nh:dwarvish_iron_helm'), {
      init: false,
      carriedBy: m.state.playerId,
    });
    const hi = m.state.entities[String(helm)]?.c.item;
    if (hi) hi.equipped = 'helm';
    const t = readEarth(m, 'uncursed');
    expect(t).toContain('Fortunately, you are wearing a hard helmet.');
    expect(heroHp(m)).toBeGreaterThanOrEqual(498);
  });

  test('confused: 2..6 rocks fall instead of boulders', () => {
    const m = setup();
    setItimeout(m.state, getPlayer(m.state), P.CONFUSION, 100);
    const t = readEarth(m, 'uncursed');
    expect(t).toContain('Being confused, you mispronounce the magic words...');
    expect(t.some((s) => /^You are hit by [2-6] rocks!$/.test(s))).toBe(true);
    for (const p of [...AROUND, { x: HX, y: HY }]) {
      expect(count(m, BOULDER, p.x, p.y)).toBe(0);
      const n = count(m, 'nh:rock' as DefId, p.x, p.y);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  test('a corridor has a rock cavern above it', () => {
    const m = setup(['#####', '##@##', '#####']);
    setTerrain(m.level, 2, 1, T.corr); // the '@' cell is floor
    expect(readEarth(m, 'blessed')[1]).toBe('The rock cavern rumbles around you!');
  });

  test('a boulder hits a monster beside her and wakes it', () => {
    const m = setup();
    const id = newt(m, HX + 1, HY, 100);
    const t = readEarth(m, 'blessed');
    expect(t).toContain('The newt is hit by a boulder!');
    const e = m.state.entities[String(id)];
    expect(e?.c.hp?.cur).toBeLessThan(100);
    expect(e?.c.hp?.cur).toBeGreaterThanOrEqual(80);
    expect(e?.c.monster?.asleep).toBe(false);
    expect(count(m, BOULDER, HX + 1, HY)).toBe(1);
  });

  test('a boulder kills a weak monster, with the hero credited', () => {
    const m = setup();
    const id = newt(m, HX - 1, HY - 1, 1);
    const xp0 = getPlayer(m.state).c.experience?.points ?? 0;
    const t = readEarth(m, 'blessed');
    expect(t).toContain('The newt is hit by a boulder!');
    expect(t).toContain('You kill the newt!');
    expect(m.state.entities[String(id)]).toBeUndefined();
    expect(getPlayer(m.state).c.experience?.points ?? 0).toBeGreaterThan(xp0);
    expect(count(m, BOULDER, HX - 1, HY - 1)).toBe(1);
  });

  test("a monster's hard helmet caps the damage at 2", () => {
    const m = setup();
    const id = newt(m, HX, HY + 1, 100);
    const helm = mksobj(m.ctx, obj('nh:orcish_helm'), { init: false, carriedBy: id });
    const hi = m.state.entities[String(helm)]?.c.item;
    if (hi) hi.equipped = 'helm';
    const t = readEarth(m, 'blessed');
    expect(t).toContain('Fortunately, the newt is wearing a hard helmet.');
    expect(m.state.entities[String(id)]?.c.hp?.cur).toBeGreaterThanOrEqual(98);
  });

  test('boulders fill a pit and plug a hole around her', () => {
    const m = setup();
    m.level.traps.push({ def: 'nh:pit' as DefId, x: HX + 1, y: HY, seen: true });
    m.level.traps.push({ def: 'nh:hole' as DefId, x: HX - 1, y: HY, seen: true });
    const t = readEarth(m, 'blessed');
    expect(t).toContain('The boulder fills a pit.');
    expect(t).toContain('The boulder plugs a hole.');
    expect(m.level.traps).toHaveLength(0);
    expect(count(m, BOULDER, HX + 1, HY)).toBe(0);
    expect(count(m, BOULDER, HX - 1, HY)).toBe(0);
    expect(count(m, BOULDER, HX, HY + 1)).toBe(1);
  });

  test('a monster trapped in a pit is hit twice and the pit filled', () => {
    const m = setup();
    m.level.traps.push({ def: 'nh:pit' as DefId, x: HX + 1, y: HY, seen: true });
    const id = newt(m, HX + 1, HY, 200);
    setMtrapped(m.ctx, id, true);
    const t = readEarth(m, 'blessed');
    expect(t).toContain('The newt is hit by a boulder!');
    expect(t).toContain('The boulder falls into the pit.');
    expect(t).toContain('The boulder fills a pit.');
    const hp = m.state.entities[String(id)]?.c.hp?.cur ?? 0;
    expect(hp).toBeLessThanOrEqual(200 - 2); // two hits of at least 1
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(m.level.traps).toHaveLength(0);
  });
});
