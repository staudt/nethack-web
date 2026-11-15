// m16 step 2: the `E` command without wands: the stylus menu, the refusals, each stylus class,
// the add/overwrite questions, the text, the scrambling and the engrave() occupation.
import { getPlayer, inventoryOf, type Ctx, type DefId, type EntityId, type Level } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { engrAt, makeEngrAt } from '../src/engr';
import { setUstuck } from '../src/hackmove';
import { setUswallow } from '../src/engulfstate';
import { P, T, setIntrinsic } from '../src/index';
import { polymon } from '../src/polyself';
import { addMon } from './helpers';
import { engine, levelSetup } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;

/** A 5x3 room with the hero in the middle and nothing in her pack. */
function setup(rows?: string[]): Setup {
  const s = levelSetup(rows);
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  return s;
}

const lvl = (s: Setup): Level => s.state.levels['dlvl1'] as Level;
const hero = (s: Setup) => getPlayer(s.state);
const here = (s: Setup) => engrAt(s.ctx, lvl(s), s.here.x, s.here.y);

function terrain(s: Setup, id: DefId): void {
  const level = lvl(s);
  let i = level.palette.indexOf(id);
  if (i === -1) i = level.palette.push(id) - 1;
  level.cells[s.here.y * level.width + s.here.x] = i;
}

/** A carried item with these fields. */
function carry(
  s: Setup,
  id: string,
  o: { spe?: number; buc?: 'cursed' | 'uncursed' | 'blessed'; quantity?: number } = {},
): EntityId {
  const e = s.carry(id);
  const it = s.state.entities[String(e)]!.c.item!;
  if (o.spe !== undefined) it.spe = o.spe;
  if (o.buc !== undefined) it.buc = o.buc;
  if (o.quantity !== undefined) it.quantity = o.quantity;
  return e;
}

const answer = (s: Setup, value: unknown) =>
  s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never });

/** `E`, then the stylus ('fingers' or an item id); the result of the stylus answer. */
function engraveWith(s: Setup, stylus: 'fingers' | EntityId) {
  const r = s.mod('nh:engrave');
  expect(s.state.pendingPrompt?.prompt.id).toBe('engrave-with');
  return { first: r, r: answer(s, stylus) };
}

const pending = (s: Setup): string | undefined => s.state.pendingPrompt?.prompt.id;

describe('the offers', () => {
  test('`E` is always on the hero after `:`; "Engrave with" on weapons, gems, rings, wands', () => {
    const s = setup();
    const self = engine
      .query(s.state)
      .actionsFor({ kind: 'self' })
      .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));
    expect(self.indexOf('nh:engrave')).toBeGreaterThan(self.indexOf('nh:look'));
    const withOn = (id: string) =>
      engine
        .query(s.state)
        .actionsFor({ kind: 'item', id: carry(s, id) })
        .some((o) => o.action.type === 'mod' && o.action.action === 'nh:engrave_with');
    expect(
      ['nh:dagger', 'nh:diamond', 'nh:ring_of_conflict', 'nh:wand_of_light'].map(withOn),
    ).toEqual([true, true, true, true]);
    expect(['nh:apple', 'nh:leather_armor'].map(withOn)).toEqual([false, false]);
  });

  test('the menu: fingers first, then the suggested items, then the rest', () => {
    const s = setup();
    const apple = carry(s, 'nh:apple');
    const dagger = carry(s, 'nh:dagger');
    s.mod('nh:engrave');
    expect(s.state.pendingPrompt?.prompt.options?.map((o) => o.value)).toEqual([
      'fingers',
      dagger,
      apple,
    ]);
    // Escape: "Never mind."
    const r = answer(s, null);
    expect(s.text(r)).toEqual(['Never mind.']);
  });
});

describe('writing with her fingers', () => {
  test('"You write in the dust with your fingertip.", the text, one move for 8 letters', () => {
    const s = setup();
    const { r } = engraveWith(s, 'fingers');
    expect(s.text(r)).toEqual(['You write in the dust with your fingertip.']);
    expect(s.state.pendingPrompt?.prompt).toMatchObject({ id: 'engrave', kind: 'text' });
    expect(
      s.text({ events: [{ type: 'msg', ...s.state.pendingPrompt!.prompt }] } as never),
    ).toEqual(['What do you want to write in the dust here?']);
    const turn = s.state.turn;
    const t = answer(s, 'Elbereth');
    // a single action: no "You finish" line
    expect(s.text(t)).toEqual([]);
    expect(s.state.turn).toBe(turn + 1);
    const e = here(s);
    expect(e).toMatchObject({ type: 'dust', time: turn });
    // dust scrambles a letter 1 time in 25, never a blank
    expect(e!.text).toHaveLength(8);
  });

  test('ten letters an action; the engraving grows; "You finish writing in the dust."', () => {
    const s = setup();
    engraveWith(s, 'fingers');
    const text = 'abcdefghij klmnopqrst uvw';
    const r0 = s.state.turn;
    // one action at a time
    engine.step(s.state, { type: 'answer', promptId: 'engrave', value: text });
    expect(here(s)!.text).toHaveLength(10);
    expect(s.state.occupation).not.toBeNull();
    engine.step(s.state, { type: 'continue' });
    expect(here(s)!.text).toHaveLength(21);
    const r = engine.step(s.state, { type: 'continue' });
    expect(here(s)!.text).toHaveLength(text.length);
    expect(s.text(r)).toEqual(['You finish writing in the dust.']);
    expect(s.state.occupation).toBeNull();
    expect(s.state.turn).toBe(r0 + 3);
  });

  test('frost on ice; blood in a demon form', () => {
    const s = setup();
    terrain(s, T.ice);
    const { r } = engraveWith(s, 'fingers');
    expect(s.text(r)).toEqual(['You write in the frost with your fingertip.']);
    const d = setup();
    polymon(d.ctx as unknown as Ctx, 'nh:water_demon' as DefId, false);
    const { r: rd } = engraveWith(d, 'fingers');
    expect(d.text(rd)).toEqual(['You scrawl on the floor with your fingertip.']);
    answer(d, 'x');
    expect(here(d)?.type).toBe('blood');
  });

  test('an empty or cancelled text: "Never mind.", no time', () => {
    for (const v of ['   ', null]) {
      const s = setup();
      engraveWith(s, 'fingers');
      const turn = s.state.turn;
      expect(s.text(answer(s, v))).toEqual(['Never mind.']);
      expect(s.state.turn).toBe(turn);
      expect(here(s)).toBeNull();
    }
  });

  test('blanks are condensed; hallucinating scrambles letters but never blanks', () => {
    const s = setup();
    engraveWith(s, 'fingers');
    answer(s, '  El \t  bereth ');
    expect(here(s)!.text).toMatch(/^\S\S \S{6}$/);
    const h = setup();
    setIntrinsic(hero(h), P.HALLUC, true);
    engraveWith(h, 'fingers');
    // forty letters, each scrambled 1 time in 2 (or more): some always change
    const text = 'a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a';
    answer(h, text);
    while (h.state.occupation) engine.step(h.state, { type: 'continue' });
    const got = here(h)!.text;
    expect(got).toHaveLength(text.length);
    expect(got.replace(/[^ ]/g, '')).toBe(text.replace(/[^ ]/g, ''));
    expect(got).not.toBe(text);
    for (const ch of got.replace(/ /g, '')) {
      expect(ch.charCodeAt(0)).toBeGreaterThanOrEqual(33);
      expect(ch.charCodeAt(0)).toBeLessThanOrEqual(126);
    }
  });
});

describe('refusals', () => {
  test("water, lava, a fountain, a cloud and rock: she can't write there", () => {
    const cases: [DefId, string][] = [
      [T.pool, "You can't write on the water!"],
      [T.lava, "You can't write on the lava!"],
      [T.fountain, "You can't write on the fountain!"],
      [T.cloud, "You can't write in cloud vapor!"],
      [T.tree, "You can't write here."],
    ];
    for (const [id, line] of cases) {
      const s = setup();
      terrain(s, id);
      expect(s.text(s.mod('nh:engrave'))).toEqual([line]);
      expect(pending(s)).toBeUndefined();
    }
  });

  test('a form without hands; inside an animal, a vortex, a jelly', () => {
    const s = setup();
    polymon(s.ctx as unknown as Ctx, 'nh:jackal' as DefId, false);
    expect(s.text(s.mod('nh:engrave'))).toEqual(["You can't even hold anything!"]);
    const swallow = (def: string) => {
      const t = setup();
      const m = addMon(t.state, def, t.here.x, t.here.y);
      setUstuck(t.ctx, m);
      setUswallow(t.ctx, { mon: m, tim: 20 });
      return t;
    };
    const w = swallow('nh:purple_worm');
    expect(w.text(w.mod('nh:engrave'))).toEqual(['What would you write?  "Jonah was here"?']);
    const v = swallow('nh:fog_cloud');
    expect(v.text(v.mod('nh:engrave'))).toEqual(["You can't reach the floor."]);
    const j = swallow('nh:ochre_jelly');
    expect(j.text(engraveWith(j, 'fingers').r)).toEqual([
      'You tickle the ochre jelly with your fingertip.',
      'Your message dissolves...',
    ]);
  });

  test("floating: she can't reach the floor; from a seen pit's edge, its bottom", () => {
    const s = setup();
    setIntrinsic(hero(s), P.LEVITATION, true);
    expect(s.text(engraveWith(s, 'fingers').r)).toEqual(["You can't reach the floor."]);
    const p = setup();
    lvl(p).traps.push({ def: 'nh:pit', x: p.here.x, y: p.here.y, seen: true });
    expect(p.text(engraveWith(p, 'fingers').r)).toEqual(["You can't reach the bottom of the pit."]);
  });

  test('a cursed two-handed weapon welded to her hands: no free hand', () => {
    const s = setup();
    const sword = carry(s, 'nh:two_handed_sword', { buc: 'cursed' });
    s.state.entities[String(sword)]!.c.item!.equipped = 'weapon';
    expect(s.text(engraveWith(s, 'fingers').r)).toEqual(['You have no free hand to write with!']);
  });

  test('an altar: a motion towards it and its wrath, no engraving', () => {
    const s = setup();
    terrain(s, T.altar_chaotic);
    const lines = s.text(engraveWith(s, 'fingers').r);
    expect(lines[0]).toBe('You make a motion towards the altar with your fingertip.');
    expect(lines.length).toBeGreaterThan(1);
    expect(pending(s)).toBeUndefined();
  });
});

describe('the stylus', () => {
  test('a +0 dagger: one letter an action, dulls every other one, stops at 7 letters', () => {
    const s = setup();
    const dagger = carry(s, 'nh:dagger');
    const { r } = engraveWith(s, dagger);
    expect(s.text(r)).toEqual(['You engrave in the floor with a dagger.']);
    const turn = s.state.turn;
    const t = answer(s, 'Elbereth');
    expect(s.text(t)).toEqual([
      'Your dagger gets dull.',
      'You are only able to write "Elberet".',
      'You cannot write any more.',
    ]);
    expect(here(s)).toMatchObject({ text: 'Elberet', type: 'engrave' });
    expect(s.state.entities[String(dagger)]!.c.item!.spe).toBe(-3);
    expect(s.state.turn).toBe(turn + 7);
  });

  test('"Engrave with" a dagger skips the menu; two letters cost one point', () => {
    const s = setup();
    const dagger = carry(s, 'nh:dagger');
    s.mod('nh:engrave_with', { item: dagger });
    expect(pending(s)).toBe('engrave');
    const t = answer(s, 'Xy');
    expect(s.text(t)).toEqual(['Your dagger gets dull.', 'You finish engraving.']);
    expect(s.state.entities[String(dagger)]!.c.item!.spe).toBe(-1);
  });

  test('one of a stack is split off and dulled', () => {
    const s = setup();
    const daggers = carry(s, 'nh:dagger', { quantity: 2 });
    const { r } = engraveWith(s, daggers);
    expect(s.text(r)).toEqual(['You engrave in the floor with 1 of 2 daggers.']);
    const t = answer(s, 'x');
    expect(s.text(t)[0]).toBe('One of your daggers gets dull.');
    const inv = inventoryOf(s.state, s.state.playerId);
    expect(inv.map((e) => [e.c.item!.quantity, e.c.item!.spe])).toEqual([
      [1, 0],
      [1, -1],
    ]);
  });

  test('an uncursed athame does not dull and writes ten letters an action', () => {
    const s = setup();
    const athame = carry(s, 'nh:athame');
    engraveWith(s, athame);
    const turn = s.state.turn;
    answer(s, 'Elbereth');
    expect(here(s)).toMatchObject({ text: 'Elbereth', type: 'engrave' });
    expect(s.state.entities[String(athame)]!.c.item!.spe).toBe(0);
    expect(s.state.turn).toBe(turn + 1);
  });

  test('a welded or too dull blade, a blunt weapon: in the dust', () => {
    const s = setup();
    const welded = carry(s, 'nh:dagger', { buc: 'cursed' });
    s.state.entities[String(welded)]!.c.item!.equipped = 'weapon';
    expect(s.text(engraveWith(s, welded).r)).toEqual([
      'Your dagger can only scratch the floor.',
      'You write in the dust with a cursed dagger (weapon in hand).',
    ]);
    const d = setup();
    const dull = carry(d, 'nh:dagger', { spe: -3 });
    expect(d.text(engraveWith(d, dull).r)[0]).toBe('Your dagger is too dull for engraving.');
    const c = setup();
    expect(c.text(engraveWith(c, carry(c, 'nh:club')).r)).toEqual([
      'You write in the dust with a club.',
    ]);
  });

  test('hard gems and rings engrave, one letter an action; soft ones write in the dust', () => {
    const s = setup();
    const diamond = carry(s, 'nh:diamond');
    engraveWith(s, diamond);
    answer(s, 'ab');
    expect(here(s)).toMatchObject({ text: 'ab', type: 'engrave' });
    const r = setup();
    engraveWith(r, carry(r, 'nh:ring_of_warning'));
    answer(r, 'x');
    expect(here(r)?.type).toBe('engrave');
    const g = setup();
    engraveWith(g, carry(g, 'nh:worthless_piece_of_white_glass'));
    answer(g, 'x');
    expect(here(g)?.type).toBe('dust');
    const a = setup();
    engraveWith(a, carry(a, 'nh:ring_of_adornment'));
    answer(a, 'x');
    expect(here(a)?.type).toBe('dust');
  });

  test('boots write in the dust; other armor and boulders are too large; food too dirty', () => {
    const s = setup();
    expect(s.text(engraveWith(s, carry(s, 'nh:low_boots')).r)[0]).toMatch(/^You write in the dust/);
    const a = setup();
    const turn = a.state.turn;
    expect(a.text(engraveWith(a, carry(a, 'nh:leather_armor')).r)).toEqual([
      "You can't engrave with such a large object!",
    ]);
    expect(a.state.turn).toBe(turn + 1);
    const f = setup();
    expect(f.text(engraveWith(f, carry(f, 'nh:apple')).r)).toEqual([
      'Your apple would get too dirty.',
    ]);
    const i = setup();
    terrain(i, T.ice);
    expect(i.text(engraveWith(i, carry(i, 'nh:apple')).r)).toEqual([
      'Your apple would get all frosty.',
    ]);
  });

  test('a worn blindfold: no, and no time', () => {
    const s = setup();
    const b = carry(s, 'nh:blindfold');
    s.state.entities[String(b)]!.c.item!.equipped = 'blindfold';
    const turn = s.state.turn;
    expect(s.text(engraveWith(s, b).r)).toEqual([
      "That is a bit difficult to engrave with, don't you think?",
    ]);
    expect(s.state.turn).toBe(turn);
  });
});

describe('the current engraving', () => {
  test('the same type: add to it (y), wipe it out (n) or never mind (q)', () => {
    const y = setup();
    makeEngrAt(y.ctx, lvl(y), y.here.x, y.here.y, 'ab', null, 0, 'dust');
    engraveWith(y, 'fingers');
    expect(pending(y)).toBe('engrave-add');
    expect(y.text(answer(y, true))).toEqual([
      'You add to the writing in the dust with your fingertip.',
    ]);
    answer(y, 'cd');
    expect(here(y)!.text).toMatch(/^ab..$/);

    const n = setup();
    makeEngrAt(n.ctx, lvl(n), n.here.x, n.here.y, 'ab', null, 0, 'dust');
    engraveWith(n, 'fingers');
    expect(n.text(answer(n, false))).toEqual([
      'You wipe out the message that was written in the dust here.',
      'You write in the dust with your fingertip.',
    ]);
    expect(here(n)).toBeNull();

    const q = setup();
    makeEngrAt(q.ctx, lvl(q), q.here.x, q.here.y, 'ab', null, 0, 'dust');
    engraveWith(q, 'fingers');
    expect(q.text(answer(q, null))).toEqual(['Never mind.']);
    expect(here(q)?.text).toBe('ab');
  });

  test("a burned one can't be wiped out by fingers (a move)", () => {
    const s = setup();
    makeEngrAt(s.ctx, lvl(s), s.here.x, s.here.y, 'ab', null, 0, 'burn');
    const turn = s.state.turn;
    expect(s.text(engraveWith(s, 'fingers').r)).toEqual([
      'You cannot wipe out the message that is burned into the floor here.',
    ]);
    expect(s.state.turn).toBe(turn + 1);
  });

  test('another type: dust is wiped out, an engraving overwritten when the text is given', () => {
    const s = setup();
    makeEngrAt(s.ctx, lvl(s), s.here.x, s.here.y, 'ab', null, 0, 'dust');
    expect(s.text(engraveWith(s, carry(s, 'nh:athame')).r)[0]).toBe(
      'You wipe out the message that was written in the dust here.',
    );
    const o = setup();
    makeEngrAt(o.ctx, lvl(o), o.here.x, o.here.y, 'old', null, 0, 'engrave');
    engraveWith(o, carry(o, 'nh:athame'));
    expect(o.text(answer(o, false))).toEqual([
      'You will overwrite the current message.',
      'You engrave in the floor with an athame.',
    ]);
    expect(here(o)?.text).toBe('old');
    answer(o, 'new');
    expect(here(o)?.text).toBe('new');
  });

  test('blind: a dust message is overwritten silently; no room past 255 letters', () => {
    const s = setup();
    setIntrinsic(hero(s), P.BLINDED, true);
    makeEngrAt(s.ctx, lvl(s), s.here.x, s.here.y, 'ab', null, 0, 'dust');
    expect(s.text(engraveWith(s, 'fingers').r)).toEqual([
      'You write in the dust with your fingertip.',
    ]);
    expect(here(s)?.text).toBe('ab');
    const f = setup();
    makeEngrAt(f.ctx, lvl(f), f.here.x, f.here.y, 'x'.repeat(255), null, 0, 'engrave');
    engraveWith(f, carry(f, 'nh:athame'));
    expect(f.text(answer(f, true))).toEqual(['There is no room to add anything else here.']);
  });

  test('adding past the buffer: "You run out of room to write."', () => {
    const s = setup();
    makeEngrAt(s.ctx, lvl(s), s.here.x, s.here.y, 'x'.repeat(250), null, 0, 'engrave');
    engraveWith(s, carry(s, 'nh:athame'));
    answer(s, true);
    const t = answer(s, 'abcdefgh');
    expect(s.text(t)).toEqual([
      'You run out of room to write.',
      'You are only able to write "abcde".',
      'You cannot write any more.',
    ]);
    expect(here(s)!.text).toHaveLength(255);
  });
});

describe('the occupation', () => {
  test('moved away: "You are unable to continue engraving."', () => {
    const s = setup();
    engraveWith(s, carry(s, 'nh:diamond'));
    engine.step(s.state, { type: 'answer', promptId: 'engrave', value: 'abc' });
    expect(here(s)?.text).toBe('a');
    hero(s).c.pos!.x += 1;
    const r = engine.step(s.state, { type: 'continue' });
    expect(s.text(r)).toEqual(['You are unable to continue engraving.']);
    expect(s.state.occupation).toBeNull();
  });

  test('a hostile next to her stops it: "You stop engraving."', () => {
    const s = setup();
    addMon(s.state, 'nh:lichen', s.here.x + 1, s.here.y, { energy: -1000 });
    s.state.entities[String(s.state.nextEntityId - 1)]!.c.actor!.speed = 0;
    engraveWith(s, carry(s, 'nh:diamond'));
    const r = answer(s, 'abc');
    expect(s.text(r)).toEqual(['You stop engraving.']);
    expect(here(s)?.text).toBe('a');
    expect(s.state.occupation).toBeNull();
  });
});
