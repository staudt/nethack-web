// m17 step 8b: the Wizard of Yendor and the Book of the Dead. The Wizard (iswiz from makemon())
// sleeps until she comes near, clones himself once ("Double Trouble..."), summons with his own
// words, curses her in his own words, teleports to the stairs, and his claws may snatch the Book;
// the Book (unique, never random) is read blind or not, never too hard, and deadbook() gives its
// three outcomes away from the vibrating square and the chill on it; covetous liches go for it.
// Outcomes are found by burning RNG draws (a seed search) with pinned monsters.
// ref: src/makemon.c makemon(); src/wizard.c clonewiz(), tactics(), cuss(); src/mcastu.c
// mcast_clone_wiz(), mcast_summon_mons(), spell_would_be_useless(); src/teleport.c rloc();
// src/uhitm.c mhitm_ad_samu(); src/steal.c stealamulet(); src/spell.c study_book(), learn(),
// deadbook(), deadbook_pacify_undead(); src/mkroom.c mkundead(); src/zap.c obj_resists()
import {
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  inventoryOf,
  sortedIds,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon, vanillaMod } from '../src/index';
import { mhitmAdtyping, type Mhm } from '../src/adtyping';
import { tactics } from '../src/covetous';
import { cuss } from '../src/cuss';
import { BOOK_OF_THE_DEAD, deadbook } from '../src/deadbook';
import { fireDamage } from '../src/flooreffects';
import { VIBRATING_SQUARE } from '../src/invocation';
import { GEHENNOM } from '../src/levelflags';
import { setU, uState } from '../src/luck';
import { objResists } from '../src/material';
import { mcastSpell, spellWouldBeUseless } from '../src/mcastu';
import { mappearance } from '../src/mimicstate';
import { mongone } from '../src/mondeath';
import { isCovetous, wants } from '../src/mondata';
import { dochug } from '../src/monmove';
import { mstratOf } from '../src/mstate';
import { doname } from '../src/objnam';
import { P, setIntrinsic } from '../src/props';
import { rlocMon } from '../src/trap';
import { waterDamage } from '../src/water';
import { readobjnam, wishNames } from '../src/objnam_read';
import { mkWished } from '../src/wish';
import { messagesEn } from '../src/messages.en';
import { discover } from '../src/o_init';
import { isWiz, noOfWizards } from '../src/wizstate';
import { addMon } from './helpers';
import { defs, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'wiz-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'wiz-probe:run',
      labelKey: 'wiz-probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);

/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  const r = engine.step(state, { type: 'mod', action: 'wiz-probe:run' as DefId });
  return r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}

/** Every outcome of `fn` over the first `tries` RNG offsets, each on a copy of `state`. */
function outcomes(
  state: GameState,
  fn: (ctx: Ctx) => void,
  tries = 100,
): { k: number; state: GameState; text: string[] }[] {
  const out = [];
  for (let k = 0; k < tries; k++) {
    const st = structuredClone(state);
    const text = run(st, (ctx) => {
      for (let i = 0; i < k; i++) ctx.rng.rn2(2);
      fn(ctx);
    });
    out.push({ k, state: st, text });
  }
  return out;
}

const ROOM = [
  '..............................',
  '..............................',
  '..............................',
  '...@..........................',
  '..............................',
  '..............................',
];

/** A lit room with the hero at (3,3) and 500 HP. */
function room(rows = ROOM) {
  const s = levelSetup(rows);
  s.step({ type: 'wait' }); // see the level
  return s;
}

/** A monster made by makemon() at (x, y), pinned (speed 0), with plenty of HP. */
function made(st: GameState, def: string, x: number, y: number, o = {}): Entity {
  let id: number | null = null;
  run(st, (ctx) => {
    id = makemon(ctx, defs.monster(def as DefId), { x, y }, o);
  });
  const e = st.entities[String(id)]!;
  e.c.actor!.speed = 0;
  e.c.hp = { cur: 300, max: 300 };
  return e;
}

const monsOn = (st: GameState): Entity[] =>
  sortedIds(st)
    .map((i) => st.entities[String(i)]!)
    .filter((e) => e.c.monster && e.id !== st.playerId && e.c.pos);

/** The hero knows the Book (makeknown()). */
const knowBook = (st: GameState): void =>
  void run(st, (ctx) => discover(ctx, defs.object(BOOK_OF_THE_DEAD)));

const wizardsOf = (st: GameState): Entity[] => monsOn(st).filter((e) => isWiz({ state: st }, e.id));

describe('the rows', () => {
  test('the Wizard follows Medusa; he is iswiz when made, waits for her, covets the Book', () => {
    const ids: string[] = defs.monsters.map((m) => m.id);
    expect(ids.indexOf('nh:wizard_of_yendor')).toBe(ids.indexOf('nh:medusa') + 1);
    const s = room();
    const w = made(s.state, 'nh:wizard_of_yendor', 20, 1);
    expect(isWiz({ state: s.state }, w.id)).toBe(true);
    expect(noOfWizards({ state: s.state })).toBe(1);
    expect(mstratOf({ state: s.state }, w.id).waitForU).toBe(true);
    expect(wants(defs.monster(w.def), 'wantsbook')).toBe(true); // M3_COVETOUS
    expect(isCovetous(defs.monster(w.def))).toBe(true);
    // a lich made by addMon() is no Wizard
    const l = addMon(s.state, 'nh:lich', 21, 1);
    expect(isWiz({ state: s.state }, l)).toBe(false);
    // gone: no Wizards left (wizdeadorgone())
    run(s.state, (ctx) => mongone(ctx, w.id));
    expect(noOfWizards({ state: s.state })).toBe(0);
  });

  test('the Book: unique and never random; "the papyrus spellbook", "the Book of the Dead"', () => {
    const b = defs.object(BOOK_OF_THE_DEAD);
    expect([b.class, b.prob, b.cost]).toEqual(['spellbook', 0, 10000]);
    const s = room();
    const id = s.carry(BOOK_OF_THE_DEAD);
    expect(s.text(s.step({ type: 'wait' }))).toEqual([]);
    const line = (): string =>
      render({ key: 'mon.picks_up', params: { mon: '@nh:lich', item: docName(s.state, id) } });
    expect(line()).toBe('The lich picks up the papyrus spellbook.');
    run(s.state, (ctx) => deadbook(ctx, s.state.entities[String(id)]!));
    expect(line()).toBe('The lich picks up the Book of the Dead.');
  });

  test('a wish for it gives a spellbook of blank paper, outside wizard mode', () => {
    const s = room();
    const spec = readobjnam('Book of the Dead', wishNames(s.state, defs, messagesEn));
    if (spec === null || spec === 'nothing') throw new Error('not parsed');
    expect(spec.what).toMatchObject({ types: [BOOK_OF_THE_DEAD] });
    let a = 0;
    let b = 0;
    run(s.state, (ctx) => {
      a = mkWished(ctx, spec, { wizard: false })!;
      b = mkWished(ctx, spec, { wizard: true })!;
    });
    expect(s.state.entities[String(a)]!.def).toBe('nh:spellbook_of_blank_paper');
    expect(s.state.entities[String(b)]!.def).toBe(BOOK_OF_THE_DEAD);
  });

  test('it resists (no draw), smokes in fire and steams in water, unharmed', () => {
    const s = room();
    const id = s.floor(BOOK_OF_THE_DEAD);
    const book = s.state.entities[String(id)]!;
    knowBook(s.state);
    const before = structuredClone(s.state.rng);
    run(s.state, (ctx) => {
      expect(objResists(ctx, book, 0)).toBe(true);
    });
    expect(s.state.rng).toEqual(before);
    const t1 = run(s.state, (ctx) => {
      expect(fireDamage(ctx, book, true, 3, 3)).toBe(false);
    });
    expect(t1).toEqual(['Smoke rises from the Book of the Dead.']);
    const t2 = run(s.state, (ctx) => {
      expect(waterDamage(ctx, book, null, true)).toBe('nothing');
    });
    expect(t2).toEqual(['Steam rises from the Book of the Dead.']);
    expect(book.def).toBe(BOOK_OF_THE_DEAD);
  });
});

/** The item's doname. */
const docName = (st: GameState, id: number) => doname(st, defs, st.entities[String(id)]!);

describe('the Wizard of Yendor', () => {
  test('asleep on the Book, he wakes when she comes into view near him and takes it', () => {
    const s = room();
    const w = made(s.state, 'nh:wizard_of_yendor', 12, 3, { asleep: true });
    const book = s.give(BOOK_OF_THE_DEAD, { at: { level: 'dlvl1', x: 12, y: 3 } });
    knowBook(s.state);
    expect(w.c.monster!.asleep).toBe(true);
    // out of her sight he sleeps on
    const far = structuredClone(s.state);
    getPlayer(far).c.pos = { level: 'dlvl1', x: 29, y: 0 };
    getLevel(far).lit = getLevel(far).lit.map(() => 0);
    run(far, (ctx) => dochug(ctx, w.id));
    expect(far.entities[String(w.id)]!.c.monster!.asleep).toBe(true);
    const t = run(s.state, (ctx) => dochug(ctx, w.id));
    expect(w.c.monster!.asleep).toBe(false);
    expect(mstratOf({ state: s.state }, w.id).waitForU).toBeUndefined();
    // a covetous move: the Book under him is the target (STRAT_GROUND)
    expect(s.state.entities[String(book)]!.c.item!.carriedBy).toBe(w.id);
    expect(t).toContain('The Wizard of Yendor picks up the Book of the Dead.');
  });

  test('"Double Trouble...": one clone next to her, awake and hostile, maybe posing', () => {
    const s = room();
    const w = made(s.state, 'nh:wizard_of_yendor', 12, 3);
    const res = outcomes(
      s.state,
      (ctx) => mcastSpell(ctx, ctx.state.entities[String(w.id)]!, 0, 'clone_wiz', { x: 3, y: 3 }),
      30,
    );
    for (const o of res) {
      expect(o.text[0]).toBe('Double Trouble...');
      const ws = wizardsOf(o.state);
      expect(ws).toHaveLength(2);
      const clone = ws.find((e) => e.id !== w.id)!;
      const p = clone.c.pos!;
      expect(Math.max(Math.abs(p.x - 3), Math.abs(p.y - 3))).toBe(1);
      expect(clone.c.monster).toMatchObject({ asleep: false, peaceful: false });
      expect(mstratOf({ state: o.state }, clone.id).waitForU).toBeUndefined(); // MM_NOWAIT
      expect(noOfWizards({ state: o.state })).toBe(2);
    }
    const fake = (o: { state: GameState }): boolean =>
      inventoryOf(o.state, wizardsOf(o.state)[1]!.id).some(
        (e) => e.def === 'nh:fake_amulet_of_yendor',
      );
    expect(res.some(fake)).toBe(true);
    expect(res.some((o) => !fake(o))).toBe(true);
    const posing = res.filter(
      (o) => mappearance({ state: o.state }, wizardsOf(o.state)[1]!.id)?.type === 'monster',
    );
    expect(posing.length).toBeGreaterThan(0);
    // two Wizards: neither may clone again; one again when the clone is gone
    const st = res[0]!.state;
    const [a, b] = wizardsOf(st);
    run(st, (ctx) => {
      expect(spellWouldBeUseless(ctx, a!, 'clone_wiz')).toBe(true);
      expect(spellWouldBeUseless(ctx, b!, 'clone_wiz')).toBe(true);
      mongone(ctx, b!.id);
      expect(spellWouldBeUseless(ctx, a!, 'clone_wiz')).toBe(false);
    });
    // and nobody else may
    const lich = made(st, 'nh:arch_lich', 20, 1);
    run(st, (ctx) => expect(spellWouldBeUseless(ctx, lich, 'clone_wiz')).toBe(true));
  });

  test('he summons nasties with "Destroy the thief, my pet(s)!"', () => {
    const s = room();
    getPlayer(s.state).c.experience!.level = 14;
    const w = made(s.state, 'nh:wizard_of_yendor', 12, 3);
    const lines = outcomes(
      s.state,
      (ctx) => mcastSpell(ctx, ctx.state.entities[String(w.id)]!, 0, 'summon_mons', { x: 3, y: 3 }),
      20,
    ).flatMap((o) => o.text);
    expect(lines.some((t) => /^"Destroy the thief, my pets?!"$/.test(t))).toBe(true);
    expect(lines.some((t) => t.includes('appear'))).toBe(false);
  });

  test('he curses her in his own words', () => {
    const s = room();
    const w = made(s.state, 'nh:wizard_of_yendor', 5, 3);
    const lines = outcomes(s.state, (ctx) => cuss(ctx, ctx.state.entities[String(w.id)]!), 30)
      .map((o) => o.text[0])
      .filter((t) => t !== undefined);
    expect(lines).toContain('The Wizard of Yendor laughs fiendishly.');
    expect(
      lines.some((t) => /^"(Thou|Thy|Prepare|Hell|I |Resist|Surr|There|Ver).*!"$/.test(t)),
    ).toBe(true);
    expect(lines.some((t) => t.includes('aspersions'))).toBe(false);
    // when she is nearly dead he may gloat
    getPlayer(s.state).c.hp = { cur: 3, max: 500 };
    const gloat = outcomes(s.state, (ctx) => cuss(ctx, ctx.state.entities[String(w.id)]!), 30)
      .map((o) => o.text[0] ?? '')
      .filter((t) => t.startsWith('"Even now') || t.startsWith('"Savor'));
    expect(gloat.length).toBeGreaterThan(0);
  });

  test('teleporting, he goes to the up stairs; with no stairs, at random', () => {
    const s = room();
    const level = getLevel(s.state);
    level.up = { x: 25, y: 5 };
    const w = made(s.state, 'nh:wizard_of_yendor', 12, 1);
    run(s.state, (ctx) => void rlocMon(ctx, w, false));
    expect(w.c.pos).toMatchObject({ x: 25, y: 5 });
    // hurt, with no stairs to hole up on: teleports away now and then (1 in 3 + hp / 10)
    level.up = null;
    w.c.pos = { level: level.id, x: 12, y: 1 };
    w.c.hp = { cur: 10, max: 300 };
    const res = outcomes(s.state, (ctx) => void tactics(ctx, w.id), 30);
    const moved = res.filter((o) => {
      const p = o.state.entities[String(w.id)]!.c.pos!;
      return p.x !== 12 || p.y !== 1;
    });
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThan(res.length);
  });

  test('his claws snatch the Book 1 time in 20, and he teleports away with it', () => {
    const s = room();
    const w = made(s.state, 'nh:wizard_of_yendor', 4, 3);
    s.carry(BOOK_OF_THE_DEAD);
    knowBook(s.state);
    const atk: AttackDef = { at: 'claw', ad: 'samu', n: 2, d: 12 };
    const res = outcomes(
      s.state,
      (ctx) => {
        const mhm: Mhm = {
          damage: 7,
          hitflags: 0,
          done: false,
          permdmg: 0,
          specialdmg: 0,
          dieroll: 10,
        } as Mhm;
        mhitmAdtyping(ctx, w.id, atk, ctx.state.playerId, mhm);
        expect(mhm.damage).toBe(7); // a plain hit on her
      },
      80,
    );
    const stolen = res.filter((o) =>
      inventoryOf(o.state, w.id).some((e) => e.def === BOOK_OF_THE_DEAD),
    );
    expect(stolen.length).toBeGreaterThan(0);
    expect(stolen.length).toBeLessThan(res.length / 5);
    expect(stolen[0]!.text[0]).toBe('The Wizard of Yendor steals the Book of the Dead!');
    expect(
      inventoryOf(stolen[0]!.state, stolen[0]!.state.playerId).some(
        (e) => e.def === BOOK_OF_THE_DEAD,
      ),
    ).toBe(false);
    const p = stolen[0]!.state.entities[String(w.id)]!.c.pos!;
    expect(p.x !== 4 || p.y !== 3).toBe(true);
    // against a monster: nothing
    const j = made(s.state, 'nh:jackal', 5, 3);
    run(s.state, (ctx) => {
      const mhm = { damage: 7, hitflags: 0, done: false, permdmg: 0, specialdmg: 0 } as Mhm;
      mhitmAdtyping(ctx, w.id, atk, j.id, mhm);
      expect(mhm.damage).toBe(0);
    });
  });
});

describe('reading the Book of the Dead', () => {
  test('blind or not, never too hard: "You begin to recite the runes.", then deadbook()', () => {
    const s = room();
    const id = s.carry(BOOK_OF_THE_DEAD, { init: false });
    s.state.entities[String(id)]!.c.item!.buc = 'cursed';
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    const t = s.text(s.mod('nh:read', { item: id }));
    expect(t).not.toContain('Being blind, you cannot read the mystic runes.');
    // (the study takes no time: the Book's delay is 0)
    expect(t.slice(0, 3)).toEqual([
      'You begin to recite the runes.',
      'You turn the pages of the Book of the Dead...',
      'You raised the dead!',
    ]);
  });

  test('uncursed: one of three lines', () => {
    const s = room();
    const book = s.state.entities[String(s.carry(BOOK_OF_THE_DEAD))]!;
    const lines = new Set(
      outcomes(s.state, (ctx) => deadbook(ctx, book), 20).map((o) => o.text[1]),
    );
    expect([...lines].sort()).toEqual([
      'Oh my!  Your name appears in the book!',
      'The headstones in the cemetery begin to move!',
      'Your ancestors are annoyed with you!',
    ]);
  });

  test('cursed: "You raised the dead!": undead around her, her corpses rise, maybe a lich', () => {
    const s = room();
    const id = s.carry(BOOK_OF_THE_DEAD);
    s.state.entities[String(id)]!.c.item!.buc = 'cursed';
    s.carry('nh:corpse', { corpseOf: 'nh:jackal' as DefId });
    const res = outcomes(s.state, (ctx) => deadbook(ctx, ctx.state.entities[String(id)]!), 20);
    for (const o of res) {
      expect(o.text).toContain('You raised the dead!');
      const near = monsOn(o.state).filter((e) => {
        const p = e.c.pos!;
        return Math.max(Math.abs(p.x - 3), Math.abs(p.y - 3)) <= 2;
      });
      expect(near.length).toBeGreaterThanOrEqual(1);
      // the carried corpse came back
      expect(inventoryOf(o.state, o.state.playerId).some((e) => e.def === 'nh:corpse')).toBe(false);
    }
    const lich = res.filter((o) => monsOn(o.state).some((e) => e.def === 'nh:master_lich'));
    expect(lich.length).toBeGreaterThan(0);
    expect(lich.length).toBeLessThan(res.length);
    for (const o of lich)
      expect(monsOn(o.state).find((e) => e.def === 'nh:master_lich')!.c.monster!.peaceful).toBe(
        false,
      );
  });

  test('blessed: undead she sees turn peaceful; co-aligned ones next to her are tamed', () => {
    const s = room();
    const id = s.carry(BOOK_OF_THE_DEAD);
    s.state.entities[String(id)]!.c.item!.buc = 'blessed';
    run(s.state, (ctx) => setU(ctx, { alignType: -1 }));
    expect(uState(s.state).alignType).toBe(-1);
    const near = addMon(s.state, 'nh:human_zombie', 4, 3); // chaotic, next to her
    const far = addMon(s.state, 'nh:human_zombie', 15, 3);
    const jackal = addMon(s.state, 'nh:jackal', 5, 4);
    run(s.state, (ctx) => deadbook(ctx, ctx.state.entities[String(id)]!));
    const m = (i: number) => s.state.entities[String(i)]!.c.monster!;
    expect(m(near).tame).toBeGreaterThan(0);
    expect(m(far)).toMatchObject({ peaceful: true });
    expect(m(far).tame).toBeUndefined();
    expect(m(jackal).peaceful).toBe(false);
  });

  test('on the vibrating square, without the Bell and the Candelabrum: a chill', () => {
    const s = room();
    const level = getLevel(s.state);
    const n = dungeonLayout(s.state, GEHENNOM).levels!;
    Object.assign(level, { dungeon: GEHENNOM, dlevel: n - 1 });
    level.traps.push({ def: VIBRATING_SQUARE, x: 3, y: 3, seen: true } as never);
    const id = s.carry(BOOK_OF_THE_DEAD);
    const book = s.state.entities[String(id)]!;
    expect(run(s.state, (ctx) => deadbook(ctx, book))).toEqual([
      'You turn the pages of the Book of the Dead...',
      'A chill runs down your spine.',
      'You hear a faint chime...',
      "Vlad's doppelganger is amused.",
    ]);
    book.c.item!.buc = 'cursed';
    expect(run(s.state, (ctx) => deadbook(ctx, book))[1]).toBe(
      "The runes appear scrambled.  You can't read them!",
    );
  });
});

describe('covetous monsters and the Book', () => {
  test('a master lich teleports to the Book on the floor and picks it up', () => {
    const s = room();
    const lich = made(s.state, 'nh:master_lich', 25, 1, { noWait: true });
    const bookId = s.give(BOOK_OF_THE_DEAD, { at: { level: 'dlvl1', x: 20, y: 5 } });
    knowBook(s.state);
    let picked = false;
    const t = run(s.state, (ctx) => {
      picked = tactics(ctx, lich.id);
    });
    expect(picked).toBe(true);
    expect(lich.c.pos).toMatchObject({ x: 20, y: 5 });
    expect(s.state.entities[String(bookId)]!.c.item!.carriedBy).toBe(lich.id);
    expect(t).toContain('The master lich picks up the Book of the Dead.');
  });

  test('when she carries it, it comes next to her; when a monster has it, next to that one', () => {
    const s = room();
    const lich = made(s.state, 'nh:arch_lich', 25, 1, { noWait: true });
    s.carry(BOOK_OF_THE_DEAD);
    run(s.state, (ctx) => void tactics(ctx, lich.id));
    expect(mstratOf({ state: s.state }, lich.id).strat).toBe('player');
    const p = lich.c.pos!;
    expect(Math.max(Math.abs(p.x - 3), Math.abs(p.y - 3))).toBe(1);

    const s2 = room();
    const l2 = made(s2.state, 'nh:arch_lich', 25, 1, { noWait: true });
    const holder = made(s2.state, 'nh:jackal', 15, 4);
    s2.give(BOOK_OF_THE_DEAD, { carriedBy: holder.id });
    run(s2.state, (ctx) => void tactics(ctx, l2.id));
    expect(mstratOf({ state: s2.state }, l2.id).strat).toBe('monstr');
    const q = l2.c.pos!;
    expect(Math.max(Math.abs(q.x - 15), Math.abs(q.y - 4))).toBe(1);
  });
});
