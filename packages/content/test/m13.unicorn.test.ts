// m13 step 4: unicorns and the unicorn horn. Co-aligned unicorns are made peaceful; a unicorn
// keeps off the hero's lines and, boxed in, teleports half the time; killing a co-aligned one
// costs 5 Luck; its corpse leaves a horn (crumbling, half the time, after a revival); applying a
// horn cures timed troubles or, cursed, does harm; a gem thrown at a unicorn is caught. Outcomes
// are asserted; rolls are searched.
import { getPlayer, type Ctx, type DefId, type EntityId, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon } from '../src/generation';
import { monsterDied } from '../src/mondeath';
import { monWouldTakeItem } from '../src/mongear';
import { setMrevived } from '../src/mstate';
import { discover } from '../src/o_init';
import { P, heroHas, setIntrinsic, setItimeout, timeoutLeft } from '../src/props';
import { setU, uState } from '../src/luck';
import { addMon } from './helpers';
import { defs, engine, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '             ',
  ' ........... ',
  ' ........... ',
  ' .....@..... ',
  ' ........... ',
  ' ........... ',
  '             ',
];

/** A lit room (no monsters), the hero at (6, 3) with the given alignment. */
function make(seed = 1, align = 1, rows = ROOM): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  }
  setU(s.ctx, { alignType: align });
  s.step({ type: 'wait' });
  return s;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)]!;
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
/** A unicorn at (x, y), awake, with plenty of HP. */
function unicorn(s: S, x: number, y: number, def = 'nh:white_unicorn', speed = 24): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id);
  e.c.actor!.speed = speed;
  e.c.hp = { cur: 200, max: 200 };
  e.c.monster!.level = 4;
  return id;
}
const lined = (x: number, y: number, hx: number, hy: number): boolean => {
  const dx = x - hx;
  const dy = y - hy;
  return dx === 0 || dy === 0 || dx === dy || dx === -dy;
};

describe('makemon(): unicorns of her alignment are peaceful', () => {
  test('a lawful hero: the white unicorn is peaceful (even made angry), the black one is not', () => {
    const s = make(1, 1);
    const ctx = s.ctx as unknown as Ctx;
    const white = makemon(ctx, defs.monster('nh:white_unicorn' as DefId), { x: 2, y: 1 })!;
    const angry = makemon(
      ctx,
      defs.monster('nh:white_unicorn' as DefId),
      { x: 4, y: 1 },
      {
        angry: true,
      },
    )!;
    const black = makemon(ctx, defs.monster('nh:black_unicorn' as DefId), { x: 8, y: 1 })!;
    expect(ent(s, white).c.monster!.peaceful).toBe(true);
    expect(ent(s, angry).c.monster!.peaceful).toBe(true);
    expect(ent(s, black).c.monster!.peaceful).toBe(false);
  });

  test('a neutral hero: the gray unicorn is peaceful', () => {
    const s = make(1, 0);
    const ctx = s.ctx as unknown as Ctx;
    const gray = makemon(ctx, defs.monster('nh:gray_unicorn' as DefId), { x: 2, y: 1 })!;
    expect(ent(s, gray).c.monster!.peaceful).toBe(true);
  });
});

describe('mfndpos() NOTONL and m_move(): keeping out of her lines', () => {
  test('a peaceful unicorn never steps onto a square lined up with her', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = make(seed);
      const id = unicorn(s, 2, 1);
      ent(s, id).c.monster!.peaceful = true;
      let steps = 0;
      for (let t = 0; t < 30; t++) {
        const before = { ...ent(s, id).c.pos! };
        s.step({ type: 'wait' });
        const p = s.state.entities[String(id)]?.c.pos;
        if (!p) break;
        const d = Math.max(Math.abs(p.x - before.x), Math.abs(p.y - before.y));
        if (d === 1) {
          steps++;
          expect(lined(p.x, p.y, 6, 3)).toBe(false);
        }
      }
      expect(steps).toBeGreaterThan(0);
    }
  });

  test('boxed in on her line, it teleports away (half the time)', () => {
    // a dead-end column: the one square the unicorn could step onto is on her column
    const rows = ['       ', ' ..... ', ' ..@.. ', ' ..... ', '   .   ', '   .   ', '       '];
    let teleported = 0;
    let stayed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed, 1, rows);
      const id = unicorn(s, 3, 5, 'nh:white_unicorn', 12);
      ent(s, id).c.actor!.energy = 12; // it moves on this turn: one m_move()
      const r = s.step({ type: 'wait' });
      const p = ent(s, id).c.pos!;
      // it never steps onto (3, 4): either rloc() takes it away ("vanishes and reappears") or
      // it stays where it is
      if (r.events.some((e) => e.type === 'msg' && e.key === 'tele.mon_vanishes_reappears'))
        teleported++;
      else {
        expect(p).toMatchObject({ x: 3, y: 5 });
        stayed++;
      }
    }
    expect(teleported).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(0);
  });
});

describe('mon_would_take_item(): a unicorn wants gemstones only', () => {
  test('a ruby, not glass or a dagger', () => {
    const s = make();
    const id = unicorn(s, 8, 3);
    const wants = (o: string) => monWouldTakeItem(s.ctx as unknown as Ctx, id, ent(s, s.floor(o)));
    expect(wants('nh:ruby')).toBe(true);
    expect(wants('nh:worthless_piece_of_red_glass')).toBe(false);
    expect(wants('nh:dagger')).toBe(false);
  });
});

describe('xkilled() and make_corpse()', () => {
  test('killing a co-aligned unicorn costs 5 Luck ("You feel guilty...") and leaves a horn', () => {
    const s = make(1, 1);
    const id = unicorn(s, 8, 3);
    const luck0 = uState(s.state).luck;
    const ctx = s.ctx as unknown as Ctx;
    monsterDied(ctx, id, true);
    const msgs = s.ctx.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
    expect(msgs).toContain('unicorn.guilty');
    expect(uState(s.state).luck).toBe(luck0 - 5);
    const here = Object.values(s.state.entities).filter(
      (e) => e.c.pos?.x === 8 && e.c.pos.y === 3 && e.c.item,
    );
    // (and maybe xkilled()'s random treasure)
    expect(here.map((e) => e.def)).toEqual(
      expect.arrayContaining(['nh:corpse', 'nh:unicorn_horn']),
    );
  });

  test('a cross-aligned one costs no Luck', () => {
    const s = make(1, 1);
    const id = unicorn(s, 8, 3, 'nh:black_unicorn');
    const luck0 = uState(s.state).luck;
    monsterDied(s.ctx as unknown as Ctx, id, true);
    expect(uState(s.state).luck).toBe(luck0);
    expect(s.ctx.events.some((e) => e.type === 'msg' && e.key === 'unicorn.guilty')).toBe(false);
  });

  test("a revived unicorn's horn crumbles to dust half the time", () => {
    let crumbled = 0;
    let horns = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = make(seed, -1);
      const id = unicorn(s, 8, 3);
      setMrevived(s.ctx, id);
      monsterDied(s.ctx as unknown as Ctx, id, true);
      const horn = Object.values(s.state.entities).some((e) => e.def === 'nh:unicorn_horn');
      const text = s.ctx.events.flatMap((e) =>
        e.type === 'msg' && e.key === 'unicorn.horn_crumbles'
          ? [render({ key: e.key, params: e.params ?? {} })]
          : [],
      );
      // exactly one of the two
      expect(horn).toBe(text.length === 0);
      if (horn) horns++;
      else {
        crumbled++;
        expect(text).toEqual(["The white unicorn's recently regrown horn crumbles to dust."]);
      }
    }
    expect(crumbled).toBeGreaterThan(0);
    expect(horns).toBeGreaterThan(0);
  });
});

describe('use_unicorn_horn()', () => {
  const apply = (s: S, horn: EntityId) => s.mod('nh:apply', { item: horn });

  test('with no trouble: "Nothing happens."', () => {
    const s = make();
    const horn = s.carry('nh:unicorn_horn');
    expect(textOf(apply(s, horn))).toEqual(['Nothing happens.']);
  });

  test('applying a horn is offered on the item', () => {
    const s = make();
    const horn = s.carry('nh:unicorn_horn');
    const offers = engine.query(s.state).actionsFor({ kind: 'item', id: horn });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:apply')).toBe(
      true,
    );
  });

  test('permanent blindness is not a trouble it fixes', () => {
    const s = make();
    const horn = s.carry('nh:unicorn_horn', { buc: 'blessed' } as never);
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    expect(textOf(apply(s, horn))).toEqual(['Nothing happens.']);
    expect(heroHas(s.state, P.BLINDED)).toBe(true);
  });

  test('a blessed horn cures blindness and confusion (a seed that fixes both)', () => {
    let both = 0;
    const fixes = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const horn = s.carry('nh:unicorn_horn');
      ent(s, horn).c.item!.buc = 'blessed';
      const h = getPlayer(s.state);
      setItimeout(s.state, h, P.BLINDED, 200);
      setItimeout(s.state, h, P.CONFUSION, 200);
      const text = textOf(apply(s, horn));
      const blind = heroHas(s.state, P.BLINDED);
      const conf = heroHas(s.state, P.CONFUSION);
      const n = (blind ? 0 : 1) + (conf ? 0 : 1);
      fixes.add(n);
      if (n === 0) expect(text).toEqual(['Nothing seems to happen.']);
      if (!blind) expect(text).toContain('You can see again.');
      if (!conf) expect(text).toContain('You feel less confused now.');
      if (n === 2) both++;
    }
    expect(both).toBeGreaterThan(0);
    // rn2(d(2, 4)) fixes 0, 1 or both of the two
    expect([...fixes].sort()).toEqual([0, 1, 2]);
  });

  test('a cursed horn does harm: confusion for rn1(90, 10) turns (a searched seed)', () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = make(seed);
      const horn = s.carry('nh:unicorn_horn');
      ent(s, horn).c.item!.buc = 'cursed';
      const text = textOf(apply(s, horn));
      if (!text.includes('You suddenly feel confused.')) continue;
      found = true;
      const left = timeoutLeft(s.state, getPlayer(s.state), P.CONFUSION);
      expect(left).toBeGreaterThanOrEqual(9);
      expect(left).toBeLessThanOrEqual(99);
    }
    expect(found).toBe(true);
  });

  test('a cursed horn: blindness, confusion, stun and hallucination among its harms', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed);
      const horn = s.carry('nh:unicorn_horn');
      ent(s, horn).c.item!.buc = 'cursed';
      apply(s, horn);
      for (const p of [P.BLINDED, P.CONFUSION, P.STUNNED, P.HALLUC])
        if (heroHas(s.state, p)) seen.add(p);
    }
    expect([...seen].sort()).toEqual([P.BLINDED, P.CONFUSION, P.HALLUC, P.STUNNED].sort());
  });
});

describe('thitmonst() and gem_accept(): gems thrown to unicorns', () => {
  /** She throws `gem` east at a unicorn two squares away; returns the step's text. */
  function throwAt(s: S, gem: EntityId): string[] {
    s.mod('nh:throw', { item: gem });
    return textOf(answer(s, 'e'));
  }

  test('a known real gem to a co-aligned unicorn: +5 Luck, it keeps the gem and teleports', () => {
    const s = make(1, 1);
    const id = unicorn(s, 8, 3, 'nh:white_unicorn', 0);
    const gem = s.carry('nh:ruby');
    discover(s.ctx, 'nh:ruby');
    const luck0 = uState(s.state).luck;
    const text = throwAt(s, gem);
    expect(text).toContain('The white unicorn catches the ruby.');
    expect(text).toContain('The white unicorn gratefully accepts your gift.');
    expect(uState(s.state).luck).toBe(luck0 + 5);
    expect(ent(s, gem).c.item!.carriedBy).toBe(id);
    expect(ent(s, id).c.monster!.peaceful).toBe(true);
    expect(ent(s, id).c.pos).not.toMatchObject({ x: 8, y: 3 });
  });

  test('an unknown real gem: +1 Luck', () => {
    const s = make(1, 1);
    unicorn(s, 8, 3, 'nh:white_unicorn', 0);
    const gem = s.carry('nh:ruby');
    const luck0 = uState(s.state).luck;
    const text = throwAt(s, gem);
    expect(text).toContain('The white unicorn gratefully accepts your gift.');
    expect(uState(s.state).luck).toBe(luck0 + 1);
  });

  test('unknown glass is taken "graciously" with no Luck; known glass is junk', () => {
    const s = make(1, 1);
    const id = unicorn(s, 8, 3, 'nh:white_unicorn', 0);
    const glass = s.carry('nh:worthless_piece_of_red_glass');
    const luck0 = uState(s.state).luck;
    const text = throwAt(s, glass);
    expect(text).toContain('The white unicorn graciously accepts your gift.');
    expect(uState(s.state).luck).toBe(luck0);
    expect(ent(s, glass).c.item!.carriedBy).toBe(id);

    const s2 = make(1, 1);
    unicorn(s2, 8, 3, 'nh:white_unicorn', 0);
    const glass2 = s2.carry('nh:worthless_piece_of_red_glass');
    discover(s2.ctx, 'nh:worthless_piece_of_red_glass');
    const text2 = throwAt(s2, glass2);
    expect(text2).toContain('The white unicorn is not interested in your junk.');
    expect(uState(s2.state).luck).toBe(luck0);
    expect(ent(s2, glass2).c.item!.carriedBy).toBeNull();
    expect(ent(s2, glass2).c.pos).toBeDefined();
  });

  test('a hostile cross-aligned unicorn becomes peaceful', () => {
    const s = make(1, 1);
    const id = unicorn(s, 8, 3, 'nh:black_unicorn', 0);
    const gem = s.carry('nh:ruby');
    const text = throwAt(s, gem);
    expect(text).toContain('The black unicorn hesitatingly accepts your gift.');
    expect(ent(s, id).c.monster!.peaceful).toBe(true);
  });

  test('a sleeping unicorn: the gem misses it', () => {
    const s = make(1, 1);
    const id = unicorn(s, 8, 3, 'nh:white_unicorn', 0);
    ent(s, id).c.monster!.asleep = true;
    const gem = s.carry('nh:ruby');
    const text = throwAt(s, gem);
    expect(text.some((t) => t.includes('misses the white unicorn'))).toBe(true);
    expect(ent(s, gem).c.item!.carriedBy).toBeNull();
  });
});
