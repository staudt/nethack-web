import { getPlayer, inventoryOf, type DefId, type GameState, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, inTrouble, setItimeout, setU, uState } from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor, engine, levelSetup, render } from './itemHelpers';

const ROOM = ['-------', '|.....|', '|.@...|', '|.....|', '-------'];
type Setup = ReturnType<typeof setup>;

const texts = (rs: StepResult[]): string[] =>
  rs.flatMap((r) => r.events).flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));

/** Prays (answering yes to the confirmation) and returns every step's result. */
function pray(s: Setup): StepResult[] {
  const ask = s.engine.step(s.state, { type: 'mod', action: 'nh:pray' as DefId });
  expect(ask.prompt?.key).toBe('pray.confirm');
  expect(ask.prompt?.cancellable).toBe(true);
  const out = [
    ask,
    s.engine.step(s.state, { type: 'answer', promptId: ask.prompt!.id, value: true }),
  ];
  return out;
}

const hero = (state: GameState) => getPlayer(state);

/** A room with the hero's real kit (setup() clears every other entity). */
function withKit(seed: number): Setup {
  const l = levelSetup(['.....', '..@..', '.....'], seed);
  return {
    engine,
    state: l.state,
    level: l.state.levels['dlvl1']!,
    wait: () => engine.stepAll(l.state, { type: 'wait' }),
  };
}

describe('#pray', () => {
  test('is offered on the hero; declining the confirmation costs nothing', () => {
    const s = setup(ROOM);
    const offers = s.engine.query(s.state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:pray')).toBe(true);
    const turn = s.state.turn;
    const cnt = uState(s.state).ublesscnt;
    const ask = s.engine.step(s.state, { type: 'mod', action: 'nh:pray' as DefId });
    s.engine.step(s.state, { type: 'answer', promptId: ask.prompt!.id, value: null });
    expect(s.state.turn).toBe(turn);
    expect(uState(s.state).ublesscnt).toBe(cnt);
  });

  test('praying too soon angers Odin: Luck -3, anger +1, a longer timeout', () => {
    const s = setup(ROOM);
    const t = texts(pray(s));
    expect(t).toContain('You begin praying to Odin.');
    expect(t).not.toContain('You are surrounded by a shimmering light.');
    expect(t).toContain('You finish your prayer.');
    const u = uState(s.state);
    expect(u.luck).toBe(-3);
    expect(u.ugangr).toBe(1);
    expect(u.ublesscnt).toBeGreaterThan(250);
  });

  test('praying when Weak with the timeout run out fixes the hunger', () => {
    const s = setup(ROOM);
    setU(s, { ublesscnt: 0, alignRecord: 5 });
    hero(s.state).c.hunger = { nutrition: 30, state: 'weak' };
    expect(inTrouble(ctxFor(s.state) as never)).toBe(9); // TROUBLE_STARVING
    const t = texts(pray(s));
    expect(t).toContain('You are surrounded by a shimmering light.');
    expect(t.indexOf('You finish your prayer.')).toBeLessThan(
      t.indexOf('You feel that Odin is pleased.'),
    );
    expect(t).toContain('Your stomach feels content.');
    // 900, less the turn's burn
    expect(hero(s.state).c.hunger!.state).toBe('not_hungry');
    expect(hero(s.state).c.hunger!.nutrition).toBeGreaterThanOrEqual(898);
    expect(uState(s.state).ublesscnt).toBeGreaterThan(0);
    expect(uState(s.state).uinvulnerable).toBe(false);
  });

  test('low hit points are a major trouble: "You feel much better." and full HP', () => {
    const s = setup(ROOM);
    setU(s, { ublesscnt: 0, alignRecord: 5 });
    hero(s.state).c.hp = { cur: 2, max: 16 };
    const t = texts(pray(s));
    expect(t).toContain('You feel much better.');
    const hp = hero(s.state).c.hp!;
    expect(hp.cur).toBe(hp.max);
    expect(hp.max).toBeGreaterThanOrEqual(16);
  });

  test('while praying, monsters start to attack but pull back', () => {
    const s = setup(ROOM);
    setU(s, { ublesscnt: 0, alignRecord: 5 });
    hero(s.state).c.hunger = { nutrition: 30, state: 'weak' };
    const j = addMon(s.state, 'nh:jackal', 3, 2);
    s.state.entities[String(j)]!.c.actor!.speed = 12;
    const hp0 = hero(s.state).c.hp!.cur;
    const t = texts(pray(s));
    expect(t).toContain('The jackal starts to attack you, but pulls back.');
    expect(t.some((x) => /^The jackal bites!/.test(x))).toBe(false);
    expect(hero(s.state).c.hp!.cur).toBeGreaterThanOrEqual(hp0);
  });

  test('with bad Luck the god is angry (p_type 1)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(ROOM, seed);
      setU(s, { ublesscnt: 0, luck: -2 });
      const t = texts(pray(s));
      if (t.some((x) => x.startsWith('You feel that Odin is displeased.'))) seen++;
      expect(t).not.toContain('You are surrounded by a shimmering light.');
      expect(uState(s.state).ublesscnt).toBeGreaterThan(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test('a lucky prayer may uncurse a cursed weapon: "softly glows amber"', () => {
    let fixed = false;
    for (let seed = 1; seed <= 40 && !fixed; seed++) {
      const s = withKit(seed);
      setU(s, { ublesscnt: 0, alignRecord: 10, luck: 4 });
      const w = inventoryOf(s.state, s.state.playerId).find(
        (o) => o.c.item?.equipped === 'weapon',
      )!;
      w.c.item!.buc = 'cursed';
      expect(inTrouble(ctxFor(s.state) as never)).toBe(-3); // TROUBLE_CURSED_ITEMS
      const t = texts(pray(s));
      if (t.some((x) => /softly glows amber\.$/.test(x))) {
        fixed = true;
        expect(w.c.item!.buc).toBe('uncursed');
      }
    }
    expect(fixed).toBe(true);
  });

  test('status troubles: blindness is minor; the prayer timer stands still while praying', () => {
    const s = setup(ROOM);
    setItimeout(s.state, hero(s.state), P.BLINDED, 50);
    expect(inTrouble(ctxFor(s.state) as never)).toBe(-5);
    setU(s, { ublesscnt: 0, alignRecord: 5 });
    const end = hero(s.state).c.props![P.BLINDED]!.timeout;
    const [, r] = pray(s);
    // three helpless turns passed but the blindness did not count down
    expect(hero(s.state).c.props?.[P.BLINDED]?.timeout ?? end + 3).toBeGreaterThanOrEqual(end);
    void r;
  });
});
