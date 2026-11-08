// m8 step 3: the score (`u.urexp` and really_done()'s final points) and the vanquished counts.
import {
  buildSnapshot,
  type Ctx,
  getPlayer,
  putIn,
  type GameEvent,
  type GameState,
  type Level,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  WAN,
  addToInventory,
  deaths,
  mksobj,
  experienceFor,
  finalScore,
  isKnown,
  monkilled,
  urexp,
  vanquishedLines,
} from '../src/index';
import { setHeroFemale } from '../src/gender';
import { addMon, setup } from './helpers';
import { ctxFor, levelSetup, obj, plainKit, render } from './itemHelpers';

const lists = (ev: GameEvent[]) =>
  ev.filter((e): e is Extract<GameEvent, { type: 'list' }> => e.type === 'list');

const nh = (state: GameState): Record<string, unknown> =>
  state.modData['nh'] as unknown as Record<string, unknown>;

/** A pinned (speed 0, asleep) 1 HP monster east of her, hit until it dies. */
function killEast(s: ReturnType<typeof setup>, def: string): number {
  const id = addMon(s.state, def, 2, 0, { asleep: true });
  const mon = s.state.entities[String(id)]!;
  mon.c.actor!.speed = 0;
  mon.c.hp = { cur: 1, max: 1 };
  for (let i = 0; i < 100 && s.state.entities[String(id)]; i++)
    s.engine.step(s.state, { type: 'move', dir: 'e' });
  expect(s.state.entities[String(id)]).toBeUndefined();
  return id;
}

describe('u.urexp', () => {
  test('a kill adds four times its experience; the kill is counted', () => {
    const s = setup(['.@..']);
    expect(urexp(s.state)).toBe(0);
    killEast(s, 'nh:jackal');
    const exp = experienceFor(s.engine.registry.monster('nh:jackal'), 0);
    expect(urexp(s.state)).toBe(4 * exp);
    expect(deaths(s.state, 'nh:jackal')).toBe(1);
  });

  test('a monster killed by another monster is counted, with no score for her', () => {
    const s = setup(['.@..']);
    const id = addMon(s.state, 'nh:newt', 3, 0, { asleep: true });
    monkilled(ctxFor(s.state) as unknown as Ctx, id, false);
    expect(s.state.entities[String(id)]).toBeUndefined();
    expect(deaths(s.state, 'nh:newt')).toBe(1);
    expect(urexp(s.state)).toBe(0);
  });

  test('a scroll type learned by reading it: +10, once', () => {
    const s = levelSetup();
    plainKit(s.state);
    const before = urexp(s.state);
    s.mod('nh:read', { item: s.carry('nh:scroll_of_light') });
    expect(urexp(s.state)).toBe(before + 10);
    s.mod('nh:read', { item: s.carry('nh:scroll_of_light') });
    expect(urexp(s.state)).toBe(before + 10);
  });

  test('a potion type learned by drinking it, a wand by zapping it: +10 each, once', () => {
    const s = levelSetup();
    plainKit(s.state);
    const before = urexp(s.state);
    s.mod('nh:quaff', { item: s.carry('nh:potion_of_sleeping') });
    expect(isKnown(s.state, s.ctx.defs, 'nh:potion_of_sleeping')).toBe(true);
    expect(urexp(s.state)).toBe(before + 10);

    const w = s.carry(WAN.light);
    s.state.entities[String(w)]!.c.item!.spe = 5;
    s.mod('nh:zap', { item: w });
    expect(isKnown(s.state, s.ctx.defs, WAN.light)).toBe(true);
    expect(urexp(s.state)).toBe(before + 20);
    s.mod('nh:zap', { item: w });
    expect(urexp(s.state)).toBe(before + 20);
  });
});

describe('final score', () => {
  /** A finished game: no inventory, `how`, the given levels' depths and u.urexp. */
  function ended(how: string, depths: number[], rexp = 0) {
    const s = setup(['@']);
    for (const e of Object.values(s.state.entities))
      if (e.c.item) delete s.state.entities[String(e.id)];
    const base = s.state.levels['dlvl1'] as Level;
    for (const d of depths) s.state.levels[`d${d}`] = { ...base, id: `d${d}`, depth: d };
    nh(s.state)['endHow'] = how;
    nh(s.state)['urexp'] = rexp;
    s.state.gameOver = {
      kind: how === 'escaped' ? 'escaped' : 'died',
      killer: '',
      turn: 1,
      depth: 1,
      level: 1,
    };
    const score = (): number => finalScore(s.state, s.engine.registry);
    const make = (def: string, qty: number, carried = true): number => {
      const ctx = ctxFor(s.state);
      const id = mksobj(ctx, obj(def), { init: false });
      s.state.entities[String(id)]!.c.item!.quantity = qty;
      if (carried) addToInventory(ctx, s.state.playerId, id);
      return id;
    };
    return { s, score, make };
  }

  test('gold: 90% on death, all of it when escaping; containers count', () => {
    const d = ended('died', []);
    d.make('nh:gold_piece', 95);
    const sack = d.make('nh:sack', 1);
    const inner = d.make('nh:gold_piece', 5, false);
    putIn(d.s.engine.registry, d.s.state, sack, inner);
    expect(d.score()).toBe(100 - 10);
    const e = ended('escaped', [], 7);
    e.make('nh:gold_piece', 101);
    expect(e.score()).toBe(7 + 101);
    const q = ended('starving', []);
    q.make('nh:gold_piece', 19);
    expect(q.score()).toBe(19 - 1);
  });

  test('depth: 50 per level below the first, 1000 per level past 20, at most 10', () => {
    expect(ended('died', []).score()).toBe(0);
    expect(ended('died', [5]).score()).toBe(200);
    expect(ended('died', [21]).score()).toBe(1000 + 1000);
    expect(ended('died', [3, 35, 9]).score()).toBe(1700 + 10000);
  });

  test('escaping adds the carried amulets and gems at base cost, not gray stones', () => {
    const e = ended('escaped', []);
    e.make('nh:ruby', 2); // 3500 each
    e.make('nh:amulet_of_esp', 1); // 150
    e.make('nh:worthless_piece_of_red_glass', 3); // 0
    e.make('nh:luckstone', 1); // a gray stone: not a valuable
    expect(e.score()).toBe(2 * 3500 + 150);
    const d = ended('died', []);
    d.make('nh:ruby', 2);
    expect(d.score()).toBe(0);
  });

  test('statuses after game over: score, maxDepth, plcode, endGold', () => {
    const d = ended('died', [4], 40);
    d.make('nh:gold_piece', 10);
    const st = buildSnapshot(d.s.engine.registry, d.s.state).status;
    expect(st['score']).toBe(40 + 9 + 150);
    expect(st['maxDepth']).toBe(4);
    expect(st['plcode']).toBe('Val-Hum-Fem-Neu');
    expect(st['endGold']).toBe(10);
    // an amulet of change made her male (7f-d): topten's gender file code
    setHeroFemale(d.s.state, false);
    expect(buildSnapshot(d.s.engine.registry, d.s.state).status['plcode']).toBe('Val-Hum-Mal-Neu');
  });
});

describe('vanquished', () => {
  test("C's order (level high to low, then index), wording and total", () => {
    const s = setup(['@']);
    const v: Record<string, number> = {
      'nh:newt': 1,
      'nh:jackal': 3,
      'nh:gnome_lord': 1,
      'nh:oracle': 2,
    };
    nh(s.state)['vanquished'] = v;
    const lines = vanquishedLines(s.state, s.engine.registry);
    const text = lines.map((m) => render(m));
    // the content test renderer has no |plural (the UI's): "3 jackals" is checked in ui
    expect(lines[0]).toEqual({
      key: 'end.vanq.unique_times',
      params: { mon: '@nh:oracle', times: { key: 'end.twice' } },
    });
    expect(text[0]).toBe('the Oracle (twice)');
    expect(lines.slice(1).map((m) => m.key)).toEqual([
      'end.vanq.one',
      'end.vanq.one',
      'end.vanq.many',
      'end.blank',
      'end.vanq.total',
    ]);
    expect(lines.slice(1, 4).map((m) => m.params?.['mon'])).toEqual([
      '@nh:gnome_lord', // level 2
      '@nh:newt', // level 0, monster index 0
      '@nh:jackal', // level 0, index 3
    ]);
    expect(text.slice(1, 3)).toEqual(['a gnome lord', 'a newt']);
    expect(lines[3]?.params?.['n']).toBe(3);
    expect(text[5]).toBe('7 creatures vanquished.');
  });

  test('one type: no total; nothing died: no list and no question', () => {
    const s = setup(['@']);
    nh(s.state)['vanquished'] = { 'nh:newt': 1 };
    expect(vanquishedLines(s.state, s.engine.registry).map((m) => render(m))).toEqual(['a newt']);
  });

  test('the third disclosure question comes only after a death', () => {
    const run = (kill: boolean) => {
      const s = setup(['.@j.']);
      if (kill) killEast(s, 'nh:newt');
      addMon(s.state, 'nh:jackal', 2, 0, { energy: 12 });
      getPlayer(s.state).c.hp!.cur = 1;
      let events: GameEvent[] = [];
      for (let i = 0; i < 300 && !s.state.gameOver; i++)
        events = s.engine.step(s.state, { type: 'wait' }).events;
      expect(s.state.gameOver).not.toBeNull();
      return lists(events);
    };
    expect(run(false).map((l) => l.ask)).not.toContain('end.ask.vanquished');
    const withKill = run(true);
    const vq = withKill.find((l) => l.ask === 'end.ask.vanquished');
    expect(vq).toMatchObject({ titleKey: 'end.vanquished' });
    expect(vq?.items.map((m) => render(m))).toEqual(['a newt']);
    expect(withKill.map((l) => l.ask).at(-1)).toBe('end.ask.vanquished');
  });
});
