// m16 step 1: the engraving state, wearing it away, reading it on arrival and with `:`.
import { getPlayer, type DefId, type Level, type Rng } from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  delEngrAt,
  engrAt,
  engravingsOn,
  makeEngrAt,
  sengrAt,
  uWipeEngr,
  wipeEngrAt,
  wipeoutText,
} from '../src/engr';
import { setUstuck } from '../src/hackmove';
import { P, T, setIntrinsic } from '../src/index';
import { canReachFloor } from '../src/reach';
import { addMon } from './helpers';
import { defs, engine, levelSetup } from './itemHelpers';

/** An Rng whose rn2/rnd answers come from `values` in order (each checked against its range). */
function scripted(values: number[]): Rng & { left: () => number } {
  const q = [...values];
  const rn2 = (n: number): number => {
    const v = q.shift();
    if (v === undefined) throw new Error(`rn2(${n}): no value left`);
    if (v < 0 || v >= n) throw new Error(`rn2(${n}): ${v} out of range`);
    return v;
  };
  return {
    next: () => 0,
    rn2,
    rnd: (n: number) => rn2(n) + 1,
    d: () => 0,
    left: () => q.length,
  } as unknown as Rng & { left: () => number };
}

const lvl = (s: ReturnType<typeof levelSetup>): Level => s.state.levels['dlvl1'] as Level;
const hero = (s: ReturnType<typeof levelSetup>) => getPlayer(s.state);

/** Puts terrain `id` at (x, y). */
function terrain(level: Level, x: number, y: number, id: DefId): void {
  let i = level.palette.indexOf(id);
  if (i === -1) i = level.palette.push(id) - 1;
  level.cells[y * level.width + x] = i;
}

const selfOffers = (s: ReturnType<typeof levelSetup>): string[] =>
  engine
    .query(s.state)
    .actionsFor({ kind: 'self' })
    .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));

describe('wipeout_text()', () => {
  test('punctuation rubs out to blanks, then trailing blanks go', () => {
    // pick 'x.' index 1 ('.'), rubout roll 1
    expect(wipeoutText(scripted([1, 1]), 'x.', 1)).toBe('x');
    // a blank is skipped but still uses up the count
    expect(wipeoutText(scripted([1, 0]), 'a b', 1)).toBe('a b');
  });

  test('a letter with rubouts becomes one of them 3 times in 4, else "?"', () => {
    // 'E' -> "|FL[_": rubout roll 2 (non-zero), pick 3 -> '['
    expect(wipeoutText(scripted([0, 2, 3]), 'Elbereth', 1)).toBe('[lbereth');
    // rubout roll 0: '?'
    expect(wipeoutText(scripted([0, 0]), 'Elbereth', 1)).toBe('?lbereth');
    // 'x' has no rubout: '?' even with a rubout roll
    expect(wipeoutText(scripted([0, 3]), 'xyz', 1)).toBe('?yz');
  });

  test('the seeded form draws nothing and repeats itself', () => {
    const rng = scripted([]);
    const a = wipeoutText(rng, 'Elbereth was here', 6, 12345);
    const b = wipeoutText(rng, 'Elbereth was here', 6, 12345);
    expect(a).toBe(b);
    expect(a).not.toBe('Elbereth was here');
    expect(a.length).toBeLessThanOrEqual('Elbereth was here'.length);
  });

  test('nothing to do with no text or no count', () => {
    const rng = scripted([]);
    expect(wipeoutText(rng, '', 5)).toBe('');
    expect(wipeoutText(rng, 'abc  ', 0)).toBe('abc');
  });
});

describe('the engraving state', () => {
  test('one per square: make replaces, del removes, iteration is in cell order', () => {
    const s = levelSetup();
    const level = lvl(s);
    makeEngrAt(s.ctx, level, 3, 1, 'first', null, 1, 'dust');
    makeEngrAt(s.ctx, level, 0, 0, 'zero', null, 1, 'burn');
    makeEngrAt(s.ctx, level, 3, 1, 'second', null, 1, 'engrave');
    expect(engrAt(s.ctx, level, 3, 1)).toMatchObject({ text: 'second', type: 'engrave' });
    expect(engravingsOn(s.ctx, level).map((e) => [e.x, e.y, e.e.text])).toEqual([
      [0, 0, 'zero'],
      [3, 1, 'second'],
    ]);
    delEngrAt(s.ctx, level, 0, 0);
    delEngrAt(s.ctx, level, 3, 1);
    expect(engravingsOn(s.ctx, level)).toEqual([]);
    expect((s.state.modData['nh'] as Record<string, unknown>)['engr']).toBeUndefined();
    // JSON-plain
    makeEngrAt(s.ctx, level, 1, 1, 'Elbereth', null, 1, 'dust');
    expect(JSON.parse(JSON.stringify(s.state.modData))).toEqual(s.state.modData);
  });

  test('a random type is dust .. blood; an "Elbereth" made with the level guards objects', () => {
    const s = levelSetup();
    const level = lvl(s);
    const ctx = { state: s.state, rng: scripted([4]) };
    expect(makeEngrAt(ctx, level, 1, 1, 'x', null, 0, null).type).toBe('blood');
    ctx.rng = scripted([0]);
    expect(makeEngrAt(ctx, level, 1, 1, 'x', null, 0, null).type).toBe('dust');
    expect(
      makeEngrAt(s.ctx, level, 1, 1, 'Elbereth', null, 0, 'mark', { inMklev: true }).guard,
    ).toBe(true);
    expect(makeEngrAt(s.ctx, level, 1, 1, 'Elbereth', null, 0, 'mark').guard).toBeUndefined();
    expect(
      makeEngrAt(s.ctx, level, 1, 1, 'elbereth', null, 0, 'mark', { inMklev: true }).guard,
    ).toBeUndefined();
  });

  test('sengr_at(): any case, strict or a substring; never a headstone or an unfinished one', () => {
    const s = levelSetup();
    const level = lvl(s);
    const turn = s.state.turn;
    makeEngrAt(s.ctx, level, 1, 1, 'ELBERETH', null, turn, 'dust');
    expect(sengrAt(s.ctx, 'Elbereth', level, 1, 1, true)).not.toBeNull();
    makeEngrAt(s.ctx, level, 1, 1, 'Elbereth Elbereth', null, turn, 'dust');
    expect(sengrAt(s.ctx, 'Elbereth', level, 1, 1, true)).toBeNull();
    expect(sengrAt(s.ctx, 'elbereth', level, 1, 1, false)).not.toBeNull();
    makeEngrAt(s.ctx, level, 1, 1, 'Elbereth', null, turn + 1, 'dust');
    expect(sengrAt(s.ctx, 'Elbereth', level, 1, 1, true)).toBeNull();
    makeEngrAt(s.ctx, level, 1, 1, 'Elbereth', null, turn, 'headstone');
    expect(sengrAt(s.ctx, 'Elbereth', level, 1, 1, false)).toBeNull();
  });
});

describe('wipe_engr_at()', () => {
  const at = (s: ReturnType<typeof levelSetup>, rng: Rng) => ({
    state: s.state,
    defs,
    rng,
  });

  test('dust and blood lose `cnt` characters; leading blanks go and are counted', () => {
    const s = levelSetup();
    const level = lvl(s);
    makeEngrAt(s.ctx, level, 1, 1, '.Elbereth', null, 0, 'dust');
    // index 0 ('.') rubs out to a blank, then index 4 ('e' -> 'c')
    const rng = scripted([0, 1, 4, 1, 0]);
    wipeEngrAt(at(s, rng), level, 1, 1, 2, false);
    expect(rng.left()).toBe(0);
    expect(engrAt(s.ctx, level, 1, 1)).toMatchObject({
      text: 'Elbcreth',
      pristine: '.Elbereth',
      off: 1,
    });
  });

  test('engraved text loses one character at most, rarely: rn2(1 + 50 / (cnt + 1))', () => {
    const s = levelSetup();
    const level = lvl(s);
    makeEngrAt(s.ctx, level, 1, 1, 'abc', null, 0, 'engrave');
    // cnt 3: rn2(13) non-zero -> nothing
    wipeEngrAt(at(s, scripted([5])), level, 1, 1, 3, false);
    expect(engrAt(s.ctx, level, 1, 1)?.text).toBe('abc');
    // rn2(13) zero -> one character: index 2 ('c'), no rubout -> '?'
    wipeEngrAt(at(s, scripted([0, 2, 0])), level, 1, 1, 3, false);
    expect(engrAt(s.ctx, level, 1, 1)?.text).toBe('ab?');
  });

  test('burned text resists except on ice or, half the time, to magic', () => {
    const s = levelSetup();
    const level = lvl(s);
    makeEngrAt(s.ctx, level, 1, 1, 'abc', null, 0, 'burn');
    wipeEngrAt(at(s, scripted([])), level, 1, 1, 50, false); // no draw at all
    wipeEngrAt(at(s, scripted([1])), level, 1, 1, 50, true); // the magic coin fails
    expect(engrAt(s.ctx, level, 1, 1)?.text).toBe('abc');
    // the coin succeeds: rn2(1 + 50 / 51) = rn2(1) is 0 -> one character, '.'-less 'a' -> '?'
    wipeEngrAt(at(s, scripted([0, 0, 0, 0])), level, 1, 1, 50, true);
    expect(engrAt(s.ctx, level, 1, 1)?.text).toBe('?bc');
    terrain(level, 2, 1, T.ice);
    makeEngrAt(s.ctx, level, 2, 1, 'abc', null, 0, 'burn');
    wipeEngrAt(at(s, scripted([0, 0, 0])), level, 2, 1, 50, false);
    expect(engrAt(s.ctx, level, 2, 1)?.text).toBe('?bc');
  });

  test('headstones and protected engravings never wear; an empty one is deleted', () => {
    const s = levelSetup();
    const level = lvl(s);
    makeEngrAt(s.ctx, level, 1, 1, 'RIP', null, 0, 'headstone');
    const e = makeEngrAt(s.ctx, level, 2, 1, 'Keep out', null, 0, 'dust');
    e.nowipe = true;
    wipeEngrAt(at(s, scripted([])), level, 1, 1, 50, true);
    wipeEngrAt(at(s, scripted([])), level, 2, 1, 50, true);
    expect(engrAt(s.ctx, level, 1, 1)?.text).toBe('RIP');
    expect(engrAt(s.ctx, level, 2, 1)?.text).toBe('Keep out');
    makeEngrAt(s.ctx, level, 3, 1, '.', null, 0, 'blood');
    wipeEngrAt(at(s, scripted([0, 0])), level, 3, 1, 1, false);
    expect(engrAt(s.ctx, level, 3, 1)).toBeNull();
  });

  test('u_wipe_engr() needs her to reach the floor', () => {
    const s = levelSetup();
    const level = lvl(s);
    const { x, y } = s.here;
    makeEngrAt(s.ctx, level, x, y, 'abc', null, 0, 'dust');
    setIntrinsic(hero(s), P.LEVITATION, true);
    uWipeEngr(at(s, scripted([])), 3);
    expect(engrAt(s.ctx, level, x, y)?.text).toBe('abc');
    setIntrinsic(hero(s), P.LEVITATION, false);
    uWipeEngr(at(s, scripted([0, 0])), 1);
    expect(engrAt(s.ctx, level, x, y)?.text).toBe('?bc');
  });
});

describe('can_reach_floor()', () => {
  test('not swallowed, held by a hugger, floating; a seen pit edge only with check_pit', () => {
    const s = levelSetup();
    expect(canReachFloor(s.ctx, true)).toBe(true);
    const owlbear = addMon(s.state, 'nh:owlbear', s.here.x + 1, s.here.y);
    setUstuck(s.ctx, owlbear);
    expect(canReachFloor(s.ctx)).toBe(false);
    setUstuck(s.ctx, null);
    const level = lvl(s);
    level.traps.push({ def: 'nh:pit', x: s.here.x, y: s.here.y, seen: true });
    expect(canReachFloor(s.ctx, false)).toBe(true);
    expect(canReachFloor(s.ctx, true)).toBe(false);
    // flying reaches over it
    setIntrinsic(hero(s), P.FLYING, true);
    expect(canReachFloor(s.ctx, true)).toBe(true);
    setIntrinsic(hero(s), P.FLYING, false);
    setIntrinsic(hero(s), P.LEVITATION, true);
    expect(canReachFloor(s.ctx, false)).toBe(false);
  });
});

describe('reading engravings', () => {
  const east = (s: ReturnType<typeof levelSetup>) => s.step({ type: 'move', dir: 'e' });
  const write = (
    s: ReturnType<typeof levelSetup>,
    text: string,
    type: Parameters<typeof makeEngrAt>[7],
    x = 2,
  ) => makeEngrAt(s.ctx, lvl(s), x, 0, text, null, 0, type);

  test('each type on arrival, with the final "." unless the text keeps its own', () => {
    const cases: [Parameters<typeof makeEngrAt>[7], string, string][] = [
      ['dust', 'Elbereth', 'Something is written here in the dust.'],
      ['engrave', 'Vlad was here', 'Something is engraved here on the floor.'],
      ['burn', 'ad aerarium', 'Some text has been burned into the floor here.'],
      ['mark', 'X marks the spot', "There's some graffiti on the floor here."],
      ['blood', 'Elbereth', 'You see a message scrawled in blood here.'],
    ];
    for (const [type, text, first] of cases) {
      const s = levelSetup(['.@...']);
      write(s, text, type);
      expect(s.text(east(s))).toEqual([first, `You read: "${text}".`]);
    }
    const s = levelSetup(['.@...']);
    write(s, 'Closed for inventory!', 'dust');
    expect(s.text(east(s))[1]).toBe('You read: "Closed for inventory!"');
    // a "." that wear made is not the text's own
    const w = levelSetup(['.@...']);
    makeEngrAt(w.ctx, lvl(w), 2, 0, 'ab,', 'abc', 0, 'dust').text = 'ab.';
    expect(w.text(east(w))[1]).toBe('You read: "ab.".');
  });

  test('frost and melted text on ice', () => {
    const s = levelSetup(['.@...']);
    terrain(lvl(s), 1, 0, T.ice);
    makeEngrAt(s.ctx, lvl(s), 1, 0, 'x', null, 0, 'dust');
    expect(s.text(s.mod('nh:look')).slice(0, 2)).toEqual([
      'Something is written here in the frost.',
      'You read: "x".',
    ]);
    makeEngrAt(s.ctx, lvl(s), 1, 0, 'y', null, 0, 'burn');
    expect(s.text(s.mod('nh:look'))[0]).toBe('Some text has been melted into the ice here.');
  });

  test('blind, she feels engraved and burned text but not dust, graffiti or blood', () => {
    for (const type of ['dust', 'mark', 'blood'] as const) {
      const s = levelSetup(['.@...']);
      setIntrinsic(hero(s), P.BLINDED, true);
      write(s, 'Elbereth', type);
      expect(s.text(east(s))).toEqual([]);
    }
    const s = levelSetup(['.@...']);
    setIntrinsic(hero(s), P.BLINDED, true);
    write(s, 'Elbereth', 'burn');
    expect(s.text(east(s))).toEqual([
      'Some text has been burned into the floor here.',
      'You feel the words: "Elbereth".',
    ]);
  });

  test('floating, she reads it but sees no objects; blind and floating, she feels nothing', () => {
    const s = levelSetup(['.@...']);
    setIntrinsic(hero(s), P.LEVITATION, true);
    write(s, 'Elbereth', 'dust');
    s.floor('nh:apple', { at: { level: 'dlvl1', x: 2, y: 0 } });
    expect(s.text(east(s))).toEqual([
      'Something is written here in the dust.',
      'You read: "Elbereth".',
    ]);
    const b = levelSetup(['.@...']);
    setIntrinsic(hero(b), P.LEVITATION, true);
    setIntrinsic(hero(b), P.BLINDED, true);
    write(b, 'Elbereth', 'burn');
    expect(b.text(east(b))).toEqual([]);
  });

  test("look_here()'s order: one object after the engraving, a list before it", () => {
    const s = levelSetup(['.@...']);
    const at = { level: 'dlvl1', x: 2, y: 0 };
    write(s, 'hi', 'dust');
    s.floor('nh:apple', { at });
    expect(s.msgKeys(east(s))).toEqual(['engr.here_dust', 'engr.you_read', 'look.one']);
    const t = levelSetup(['.@...']);
    makeEngrAt(t.ctx, lvl(t), 2, 0, 'hi', null, 0, 'dust');
    t.floor('nh:apple', { at });
    t.floor('nh:carrot', { at });
    expect(t.msgKeys(east(t))).toEqual(['look.list2', 'engr.here_dust', 'engr.you_read']);
  });

  test('travel stops on an engraving it reads', () => {
    const s = levelSetup(['@......']);
    write(s, 'stop', 'dust', 3);
    s.step({ type: 'wait' }); // see the map first
    s.mod('nh:travel', { x: 6, y: 0 });
    expect(hero(s).c.pos?.x).toBe(3);
  });
});

describe('the `:` look command', () => {
  test('is always offered on the hero, near the end', () => {
    const s = levelSetup();
    const offers = selfOffers(s);
    expect(offers).toContain('nh:look');
    expect(offers.indexOf('nh:look')).toBeGreaterThan(offers.indexOf('nh:sit'));
  });

  test('the feature, the engraving, the objects, or "You see no objects here."; no time', () => {
    const s = levelSetup(['.@...']);
    const turn = s.state.turn;
    expect(s.text(s.mod('nh:look'))).toEqual(['You see no objects here.']);
    expect(s.state.turn).toBe(turn);
    makeEngrAt(s.ctx, lvl(s), 1, 0, 'Elbereth', null, 0, 'dust');
    expect(s.text(s.mod('nh:look'))).toEqual([
      'Something is written here in the dust.',
      'You read: "Elbereth".',
      'You see no objects here.',
    ]);
    for (const id of ['nh:apple', 'nh:carrot', 'nh:knife', 'nh:club', 'nh:axe']) s.floor(id);
    const r = s.mod('nh:look');
    // no pile limit: every object, then the engraving
    expect(s.msgKeys(r)).toEqual([
      'look.things',
      ...Array<string>(5).fill('look.item'),
      'engr.here_dust',
      'engr.you_read',
    ]);
    expect(s.state.turn).toBe(turn);
  });

  test('a fountain is named and then no "no objects" line; a seen trap is told', () => {
    const s = levelSetup(['.@...']);
    terrain(lvl(s), 1, 0, T.fountain);
    expect(s.text(s.mod('nh:look'))).toEqual(['There is a fountain here.']);
    lvl(s).traps.push({ def: 'nh:bear_trap', x: 1, y: 0, seen: true });
    expect(s.text(s.mod('nh:look'))[0]).toBe('There is a bear trap here.');
  });

  test('blind: she feels, and it takes a move', () => {
    const s = levelSetup(['.@...']);
    setIntrinsic(hero(s), P.BLINDED, true);
    const turn = s.state.turn;
    makeEngrAt(s.ctx, lvl(s), 1, 0, 'Elbereth', null, 0, 'engrave');
    expect(s.text(s.mod('nh:look'))).toEqual([
      'You try to feel what is lying here on the floor.',
      'Something is engraved here on the floor.',
      'You feel the words: "Elbereth".',
      'You feel no objects here.',
    ]);
    expect(s.state.turn).toBeGreaterThan(turn);
  });
});
