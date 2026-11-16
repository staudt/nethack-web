// m19 step 7: magic markers. Applying a marker writes a scroll or a spellbook on blank paper
// (by name, by a seen label, by a called name; the ink it costs; drying out; Luck for an
// unknown type; spellbooks by name only, the fresh spell, "My Diary"; blindness), and `E` with
// a marker writes graffiti (MARK) at two letters a charge, drying out mid-text. Outcomes are
// asserted; random rolls are bounded over many tries.
// ref: src/write.c dowrite(), cost(); src/engrave.c stylus_ok(), doengrave_sfx_item(), engrave()
import { getPlayer, inventoryOf, type DefId, type EntityId, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { engrAt } from '../src/engr';
import { setU, luckOf } from '../src/luck';
import { messagesEn } from '../src/messages.en';
import { discover } from '../src/o_init';
import { P, setIntrinsic } from '../src/props';
import { writeCost } from '../src/write';
import { defs, engine, levelSetup, obj } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

/** A room with the hero and nothing in her pack. */
function make(seed = 1): S {
  const s = levelSetup(['.......', '...@...', '.......'], seed);
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  return s;
}
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
function carry(
  s: S,
  id: string,
  o: { spe?: number; buc?: 'blessed' | 'cursed'; quantity?: number } = {},
): EntityId {
  const e = s.carry(id);
  const it = ent(s.state, e)!.c.item!;
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  if (o.quantity !== undefined) it.quantity = o.quantity;
  return e;
}
const answer = (s: S, value: unknown) =>
  s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never });
const pending = (s: S): string | undefined => s.state.pendingPrompt?.prompt.id;
const BLANK = 'nh:scroll_of_blank_paper';
const BLANK_BOOK = 'nh:spellbook_of_blank_paper';

/** Applies the marker, picks the paper and types `text`; the messages of each answer. */
function write(s: S, pen: EntityId, paper: EntityId, text: string) {
  const r0 = s.mod('nh:apply', { item: pen });
  expect(pending(s)).toBe('write-on');
  const r1 = answer(s, paper);
  if (pending(s) !== 'write-what') return { first: s.text(r0), paper: s.text(r1), text: [] };
  const r2 = answer(s, text);
  return { first: s.text(r0), paper: s.text(r1), text: s.text(r2) };
}

/** The scrolls (or books) of a type she carries. */
const held = (s: S, def: string): EntityId[] =>
  inventoryOf(s.state, s.state.playerId)
    .filter((e) => e.def === def)
    .map((e) => e.id);

/** This game's label of a scroll type ("FOOBIE BLETCH"). */
function label(state: GameState, def: string): string {
  const app = state.appearances[def as DefId]!;
  return messagesEn[defs.appearance(app).nameKey]!.replace('scroll labeled ', '');
}

describe('the offers and the paper', () => {
  test('Apply and "Engrave with" are offered on a carried marker', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const actions = engine
      .query(s.state)
      .actionsFor({ kind: 'item', id: pen })
      .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));
    expect(actions).toContain('nh:apply');
    expect(actions).toContain('nh:engrave_with');
  });

  test('no scroll or book: "You don\'t have anything to write on." (no time)', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const turn = s.state.turn;
    const r = s.mod('nh:apply', { item: pen });
    expect(s.text(r)).toEqual(["You don't have anything to write on."]);
    expect(pending(s)).toBeUndefined();
    expect(s.state.turn).toBe(turn);
  });

  test('the menu lists blank paper first, then the other scrolls and books; Escape is free', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const light = carry(s, 'nh:scroll_of_light');
    const book = carry(s, BLANK_BOOK);
    const blank = carry(s, BLANK);
    carry(s, 'nh:apple');
    s.mod('nh:apply', { item: pen });
    expect(s.state.pendingPrompt?.prompt.options?.map((o) => o.value)).toEqual([
      book,
      blank,
      light,
    ]);
    const turn = s.state.turn;
    answer(s, null);
    expect(s.state.turn).toBe(turn);
    expect(pending(s)).toBeUndefined();
  });

  test('paper that is not blank takes the move; blank paper is discovered', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const light = carry(s, 'nh:scroll_of_light');
    const turn = s.state.turn;
    const r = write(s, pen, light, 'identify');
    expect(r.paper).toEqual(['That scroll is not blank!']);
    expect(s.state.turn).toBe(turn + 1);
    const blank = carry(s, BLANK);
    expect(s.state.discovered).not.toContain(BLANK);
    s.mod('nh:apply', { item: pen });
    answer(s, blank);
    expect(pending(s)).toBe('write-what');
    expect(s.state.discovered).toContain(BLANK);
    expect(
      s.text({ events: [{ type: 'msg', ...s.state.pendingPrompt!.prompt }] } as never),
    ).toEqual(['What type of scroll do you want to write?']);
    // nothing typed: the move is taken
    const t2 = s.state.turn;
    answer(s, '');
    expect(s.state.turn).toBe(t2 + 1);
    expect(ent(s.state, blank)).toBeDefined();
  });
});

describe('writing a scroll', () => {
  test('a known type by name: the ink is in [basecost/2, basecost), the paper becomes it', () => {
    const base = writeCost(obj('nh:scroll_of_identify'));
    expect(base).toBe(14);
    const spent = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      discover(s.ctx, 'nh:scroll_of_identify');
      const pen = carry(s, 'nh:magic_marker', { spe: 50 });
      const blank = carry(s, BLANK);
      const r = write(s, pen, blank, seed % 2 ? 'identify' : 'Scroll of IDENTIFY');
      // she holds it: hold_another_object()'s inventory line
      expect(r.text).toEqual([expect.stringMatching(/^[a-zA-Z] - a scroll of identify\.$/)]);
      expect(ent(s.state, blank)).toBeUndefined();
      expect(held(s, 'nh:scroll_of_identify')).toHaveLength(1);
      const used = 50 - ent(s.state, pen)!.c.item!.spe;
      expect(used).toBeGreaterThanOrEqual(7);
      expect(used).toBeLessThan(14);
      spent.add(used);
    }
    expect(spent.size).toBeGreaterThan(3);
  });

  test("the new scroll's BUC is the sum of the pen's and the paper's", () => {
    for (const [pb, qb, out] of [
      ['blessed', 'blessed', 'blessed'],
      ['blessed', 'cursed', 'uncursed'],
      [undefined, 'cursed', 'cursed'],
      [undefined, 'blessed', 'blessed'],
    ] as const) {
      const s = make();
      discover(s.ctx, 'nh:scroll_of_light');
      const pen = carry(s, 'nh:magic_marker', { spe: 50, ...(pb ? { buc: pb } : {}) });
      const blank = carry(s, BLANK, { buc: qb });
      write(s, pen, blank, 'light');
      const [id] = held(s, 'nh:scroll_of_light');
      expect(ent(s.state, id!)!.c.item!.buc).toBe(out);
    }
  });

  test('one of a stack of blank paper is used', () => {
    const s = make();
    discover(s.ctx, 'nh:scroll_of_light');
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const blank = carry(s, BLANK, { quantity: 3 });
    write(s, pen, blank, 'light');
    expect(ent(s.state, blank)!.c.item!.quantity).toBe(2);
    expect(held(s, 'nh:scroll_of_light')).toHaveLength(1);
  });

  test('refusals: no such scroll, blank paper ("obscene"), the Book of the Dead', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const blank = carry(s, BLANK);
    expect(write(s, pen, blank, 'pizza').text).toEqual(['There is no such scroll!']);
    expect(write(s, pen, blank, 'blank paper').text).toEqual([
      "You can't write that!",
      "It's obscene!",
    ]);
    expect(write(s, pen, blank, 'unlabeled').text).toEqual([
      "You can't write that!",
      "It's obscene!",
    ]);
    const book = carry(s, BLANK_BOOK);
    expect(write(s, pen, book, 'book of the dead').text).toEqual([
      'No mere dungeon adventurer could write that.',
    ]);
    // nothing was spent or used up
    expect(ent(s.state, pen)!.c.item!.spe).toBe(50);
    expect(ent(s.state, blank)).toBeDefined();
    expect(ent(s.state, book)).toBeDefined();
  });

  test('too dry: below half the base cost the marker refuses and keeps its ink', () => {
    const s = make();
    discover(s.ctx, 'nh:scroll_of_identify');
    const pen = carry(s, 'nh:magic_marker', { spe: 6 });
    const blank = carry(s, BLANK);
    expect(write(s, pen, blank, 'identify').text).toEqual([
      'Your marker is too dry to write that!',
    ]);
    expect(ent(s.state, pen)!.c.item!.spe).toBe(6);
    expect(ent(s.state, blank)).toBeDefined();
  });

  test('drying out mid-scroll: ink 0, the scroll is useless and disappears', () => {
    let dried = 0;
    let wrote = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      discover(s.ctx, 'nh:scroll_of_genocide'); // base 30: costs 15..29
      const pen = carry(s, 'nh:magic_marker', { spe: 20 });
      const blank = carry(s, BLANK);
      const r = write(s, pen, blank, 'genocide');
      if (r.text.includes('Your marker dries out!')) {
        dried++;
        expect(r.text).toEqual([
          'Your marker dries out!',
          'The scroll is now useless and disappears!',
        ]);
        expect(ent(s.state, pen)!.c.item!.spe).toBe(0);
        expect(ent(s.state, blank)).toBeUndefined();
        expect(held(s, 'nh:scroll_of_genocide')).toEqual([]);
      } else {
        wrote++;
        expect(held(s, 'nh:scroll_of_genocide')).toHaveLength(1);
      }
    }
    expect(dried).toBeGreaterThan(5);
    expect(wrote).toBeGreaterThan(2);
  });

  test('an unknown type by name: Luck decides (1 in 15 at Luck 0, about 1 in 3 at Luck 13)', () => {
    const rate = (luck: boolean): number => {
      let ok = 0;
      const N = 300;
      for (let seed = 1; seed <= N; seed++) {
        const s = make(seed);
        if (luck) {
          setU(s.ctx, { luck: 10 });
          carry(s, 'nh:luckstone', { buc: 'blessed' });
          expect(luckOf(s.state)).toBe(13);
        }
        const pen = carry(s, 'nh:magic_marker', { spe: 50 });
        const blank = carry(s, BLANK);
        const r = write(s, pen, blank, 'teleportation');
        if (held(s, 'nh:scroll_of_teleportation').length === 1) ok++;
        else {
          expect(r.text).toEqual([
            "You don't know how to write that.",
            'You write "Valkyrie was here!" and the scroll disappears.',
          ]);
          expect(ent(s.state, blank)).toBeUndefined();
        }
        // the ink is spent either way (base 20: 10..19)
        expect(ent(s.state, pen)!.c.item!.spe).toBeLessThanOrEqual(40);
      }
      return ok / N;
    };
    const r0 = rate(false);
    expect(r0).toBeGreaterThan(0.02);
    expect(r0).toBeLessThan(0.13);
    const r13 = rate(true);
    expect(r13).toBeGreaterThan(0.22);
    expect(r13).toBeLessThan(0.45);
  });

  test('by a label she has seen (one carried, one on the floor in view): always written', () => {
    for (const where of ['carried', 'floor'] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = make(seed);
        if (where === 'carried') carry(s, 'nh:scroll_of_taming');
        else {
          s.give('nh:scroll_of_taming', { at: { level: 'dlvl1', x: 5, y: 1 } });
          s.step({ type: 'wait' }); // seen and remembered
        }
        const pen = carry(s, 'nh:magic_marker', { spe: 50 });
        const blank = carry(s, BLANK);
        const r = write(s, pen, blank, label(s.state, 'nh:scroll_of_taming').toLowerCase());
        expect(r.text).toEqual([expect.stringMatching(/ - (a|2) scrolls? labeled [A-Z ]+/)]);
        const n = held(s, 'nh:scroll_of_taming').reduce(
          (a, id) => a + ent(s.state, id)!.c.item!.quantity,
          0,
        );
        expect(n).toBe(where === 'carried' ? 2 : 1);
        // writing by label does not identify the type
        expect(s.state.discovered).not.toContain('nh:scroll_of_taming');
      }
    }
  });

  test('by a label she has never seen: "You fail to write that." and the label rubbed out', () => {
    let failed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed);
      const pen = carry(s, 'nh:magic_marker', { spe: 50 });
      const blank = carry(s, BLANK);
      const lab = label(s.state, 'nh:scroll_of_taming');
      const r = write(s, pen, blank, lab);
      if (held(s, 'nh:scroll_of_taming').length === 0) {
        failed++;
        expect(r.text[0]).toBe('You fail to write that.');
        const m = /^You write "(.*)" and the scroll disappears\.$/.exec(r.text[1] ?? '');
        expect(m).not.toBeNull();
        // the label as written, worn: (6 + 30 - 1) / 6 = 5 characters rubbed out at level 1
        expect(m![1]!.length).toBeLessThanOrEqual(lab.length);
      }
    }
    expect(failed).toBeGreaterThan(30);
  });

  test('by the name she called the type: written like a seen label', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed);
      const nh = s.state.modData['nh'] as Record<string, unknown>;
      nh['called'] = { 'nh:scroll_of_fire': 'burny' };
      const pen = carry(s, 'nh:magic_marker', { spe: 50 });
      const blank = carry(s, BLANK);
      expect(write(s, pen, blank, 'Burny').text).toEqual([
        expect.stringMatching(/ - a scroll called burny\.$/),
      ]);
      expect(held(s, 'nh:scroll_of_fire')).toHaveLength(1);
    }
  });

  test('blind: a scroll is written only when Luck allows (rnl(3)); else it disappears', () => {
    let ok = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      discover(s.ctx, 'nh:scroll_of_light');
      setIntrinsic(getPlayer(s.state), P.BLINDED, true);
      const pen = carry(s, 'nh:magic_marker', { spe: 50 });
      const blank = carry(s, BLANK);
      const r = write(s, pen, blank, 'light');
      if (held(s, 'nh:scroll_of_light').length === 1) ok++;
      else {
        expect(r.text).toEqual(['You fail to write the scroll correctly and it disappears.']);
        expect(ent(s.state, blank)).toBeUndefined();
      }
    }
    // rnl(3) at Luck 0 is 0 one time in 3
    expect(ok).toBeGreaterThan(8);
    expect(ok).toBeLessThan(35);
  });
});

describe('writing a spellbook', () => {
  test('blind: "can\'t create braille text" (no time)', () => {
    const s = make();
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const book = carry(s, BLANK_BOOK);
    const turn = s.state.turn;
    expect(write(s, pen, book, 'x').paper).toEqual([
      "Your magic marker can't create braille text.",
    ]);
    expect(s.state.turn).toBe(turn);
  });

  test('a known spellbook: it warps and turns its description; base cost 10 * level', () => {
    const s = make();
    discover(s.ctx, 'nh:spellbook_of_force_bolt');
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const book = carry(s, BLANK_BOOK);
    expect(writeCost(obj('nh:spellbook_of_force_bolt'))).toBe(10);
    const r = write(s, pen, book, 'force bolt');
    expect(r.text).toEqual([
      expect.stringMatching(/^The spellbook warps strangely, then turns [a-z ]+\.$/),
      expect.stringMatching(/ - a spellbook of force bolt\.$/),
    ]);
    expect(held(s, 'nh:spellbook_of_force_bolt')).toHaveLength(1);
    const spent = 50 - ent(s.state, pen)!.c.item!.spe;
    expect(spent).toBeGreaterThanOrEqual(5);
    expect(spent).toBeLessThan(10);
  });

  test('by its description: refused unless known ("not enough information")', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const book = carry(s, BLANK_BOOK);
    const app = s.state.appearances['nh:spellbook_of_force_bolt' as DefId]!;
    const descr = messagesEn[defs.appearance(app).nameKey]!.replace(' spellbook', '');
    expect(write(s, pen, book, descr).text).toEqual([
      "Unfortunately you don't have enough information to go on.",
    ]);
    expect(ent(s.state, pen)!.c.item!.spe).toBe(50);
  });

  test('an unknown book: "My Diary" and the book stays blank, unless the spell is fresh', () => {
    let diary = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      const pen = carry(s, 'nh:magic_marker', { spe: 50 });
      const book = carry(s, BLANK_BOOK);
      const r = write(s, pen, book, 'sleep');
      if (held(s, 'nh:spellbook_of_sleep').length === 0) {
        diary++;
        expect(r.text).toEqual([
          "You don't know how to write that.",
          'You write in your best handwriting:  "My Diary", but it quickly fades.',
        ]);
        expect(ent(s.state, book)).toBeDefined();
      }
    }
    expect(diary).toBeGreaterThan(22);
    // a freshly known spell writes the book always
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed);
      const nh = s.state.modData['nh'] as Record<string, unknown>;
      nh['spells'] = [{ id: 'nh:spellbook_of_sleep', retention: 20000 }];
      const pen = carry(s, 'nh:magic_marker', { spe: 50 });
      const book = carry(s, BLANK_BOOK);
      write(s, pen, book, 'sleep');
      expect(held(s, 'nh:spellbook_of_sleep')).toHaveLength(1);
    }
  });

  test('a book beyond the ink: the marker dries out and the book is left unfinished', () => {
    let dried = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      discover(s.ctx, 'nh:spellbook_of_dig'); // level 5: base 50, costs 25..49
      const pen = carry(s, 'nh:magic_marker', { spe: 30 });
      const book = carry(s, BLANK_BOOK);
      const r = write(s, pen, book, 'dig');
      if (r.text.includes('Your marker dries out!')) {
        dried++;
        expect(r.text).toEqual([
          'Your marker dries out!',
          'The spellbook is left unfinished and your writing fades.',
        ]);
        expect(ent(s.state, pen)!.c.item!.spe).toBe(0);
        expect(ent(s.state, book)?.def).toBe(BLANK_BOOK);
      }
    }
    expect(dried).toBeGreaterThan(10);
  });
});

describe('graffiti', () => {
  const here = (s: S) => engrAt(s.ctx, s.state.levels['dlvl1']!, s.here.x, s.here.y);
  function engraveWith(s: S, pen: EntityId, text: string) {
    const r0 = s.mod('nh:engrave_with', { item: pen });
    if (pending(s) !== 'engrave') return { first: s.text(r0), text: [] as string[] };
    return { first: s.text(r0), text: s.text(answer(s, text)) };
  }

  test('a marker scribbles graffiti: "Elbereth" whole, 5 ink for the action', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    const r = engraveWith(s, pen, 'Elbereth');
    expect(r.first).toEqual(['You scribble on the floor with a magic marker.']);
    expect(here(s)).toMatchObject({ type: 'mark', text: 'Elbereth' });
    expect(ent(s.state, pen)!.c.item!.spe).toBe(45);
  });

  test('a long text takes two actions and 5 ink each', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    engraveWith(s, pen, 'abcdefghijklmno');
    while (s.state.occupation) s.step({ type: 'continue' });
    expect(here(s)).toMatchObject({ type: 'mark', text: 'abcdefghijklmno' });
    expect(ent(s.state, pen)!.c.item!.spe).toBe(40);
  });

  test('drying out mid-word: two letters a charge, then the text is cut', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 2 });
    const r = engraveWith(s, pen, 'Elbereth');
    expect(r.text).toEqual([
      'Your marker dries out.',
      'You are only able to write "Elbe".',
      'You cannot write any more.',
    ]);
    expect(here(s)).toMatchObject({ type: 'mark', text: 'Elbe' });
    expect(ent(s.state, pen)!.c.item!.spe).toBe(0);
    expect(s.state.occupation).toBeNull();
  });

  test('a dried-out marker says so and writes in the dust', () => {
    const s = make();
    const pen = carry(s, 'nh:magic_marker', { spe: 0 });
    const r = engraveWith(s, pen, 'x');
    expect(r.first).toEqual([
      'Your marker has dried out.',
      'You write in the dust with a magic marker.',
    ]);
    expect(here(s)?.type).toBe('dust');
  });
});
