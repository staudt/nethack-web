// Milestone 6b2 step 1: altars and gods. Dropping on an altar shows curse status (doaltarobj()),
// look_here names the altar's god, kicking an altar angers it (altar_wrath()), shrines.
import {
  cellIndex,
  getLevel,
  itemsAt,
  type Ctx,
  type DefId,
  type EntityId,
  type Level,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  A_NONE,
  T,
  aAlign,
  alignGname,
  altarWrath,
  makeBlinded,
  makeHallucinated,
  onAltar,
  onShrine,
  relobj,
  uState,
} from '../src/index';
import { setU } from '../src/luck';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, render } from './itemHelpers';

/** Sets cell x,y of `level` to terrain `id`, adding it to the palette. */
function paint(level: Level, x: number, y: number, id: DefId): void {
  let i = level.palette.indexOf(id);
  if (i === -1) i = level.palette.push(id) - 1;
  level.cells[cellIndex(level, x, y)] = i;
}

type Setup = ReturnType<typeof levelSetup>;
/** The hero on an altar of `altar` (neutral by default) in the middle of a strip. */
function onAltarSetup(altar: DefId = T.altar_neutral, seed = 1): Setup {
  const s = levelSetup(['.....', '..@..', '.....'], seed);
  paint(getLevel(s.state), 2, 1, altar);
  s.step({ type: 'wait' }); // see the level
  return s;
}
const drop = (s: Setup, id: EntityId) => s.mod('nh:drop', { item: id });
const dropMany = (s: Setup, ids: EntityId[]) => {
  s.mod('nh:drop_many');
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: ids });
};
/** A carried item of a given curse status (status unknown). */
const make = (s: Setup, def: string, b: 'blessed' | 'uncursed' | 'cursed', quantity = 1) => {
  const id = s.carry(def, { quantity });
  itemOf(s.state, id).buc = b;
  return id;
};
const buc = (s: Setup, id: EntityId) => {
  const it = itemOf(s.state, id);
  return { buc: it.buc, known: it.known.buc === true };
};

describe('alignment helpers', () => {
  test('altars by alignment, their gods, and where the hero stands', () => {
    const s = onAltarSetup(T.altar_lawful);
    const level = getLevel(s.state);
    paint(level, 0, 0, T.altar_chaotic);
    paint(level, 1, 0, T.altar_unaligned);
    expect([aAlign(s.ctx, 2, 1), aAlign(s.ctx, 0, 0), aAlign(s.ctx, 1, 0)]).toEqual([
      1,
      -1,
      A_NONE,
    ]);
    expect(aAlign(s.ctx, 3, 1)).toBeNull();
    expect(aAlign(s.ctx, 99, 99)).toBeNull();
    expect(
      [1, 0, -1, A_NONE].map((a) =>
        render(
          { key: 'x', params: { g: alignGname(a) } },
          {
            x: '{g}',
            'god.tyr': 'Tyr',
            'god.odin': 'Odin',
            'god.loki': 'Loki',
            'god.moloch': 'Moloch',
          },
        ),
      ),
    ).toEqual(['Tyr', 'Odin', 'Loki', 'Moloch']);
    expect(onAltar(s.ctx)).toBe(true);
    expect(onShrine(s.ctx)).toBe(false);
    level.shrines = [{ x: 2, y: 1 }];
    expect(onShrine(s.ctx)).toBe(true);
  });
});

describe('dropping on an altar (doaltarobj)', () => {
  test('blessed flashes amber, cursed black, uncursed lands; all become known', () => {
    const s = onAltarSetup();
    const b = make(s, 'nh:knife', 'blessed');
    const c = make(s, 'nh:apple', 'cursed');
    const u = make(s, 'nh:arrow', 'uncursed', 3);
    expect(s.text(drop(s, b))).toEqual(['There is an amber flash as a knife hits the altar.']);
    expect(s.text(drop(s, c))).toEqual(['There is a black flash as an apple hits the altar.']);
    expect(s.text(drop(s, u))).toEqual(['3 arrows land on the altar.']);
    expect([buc(s, b), buc(s, c), buc(s, u)]).toEqual([
      { buc: 'blessed', known: true },
      { buc: 'cursed', known: true },
      { buc: 'uncursed', known: true },
    ]);
    const here = itemsAt(defs, s.state, 'dlvl1', 2, 1).map((e) => e.id);
    expect(here).toEqual(expect.arrayContaining([b, c, u]));
  });

  test('off an altar it is "You drop" and nothing is learned', () => {
    const s = levelSetup(['.....', '..@..', '.....']);
    const c = make(s, 'nh:apple', 'cursed');
    expect(s.text(drop(s, c))).toEqual(['You drop an apple.']);
    expect(buc(s, c)).toEqual({ buc: 'cursed', known: false });
  });

  test('several things at once, each with its own message', () => {
    const s = onAltarSetup(T.altar_chaotic);
    const b = make(s, 'nh:knife', 'blessed');
    const u = make(s, 'nh:apple', 'uncursed');
    expect(s.text(dropMany(s, [b, u]))).toEqual([
      'There is an amber flash as a knife hits the altar.',
      'An apple lands on the altar.',
    ]);
    expect([buc(s, b).known, buc(s, u).known]).toEqual([true, true]);
  });

  test('a stack that now matches a known one on the altar merges with it', () => {
    const s = onAltarSetup();
    const known = s.floor('nh:arrow', { quantity: 2 });
    Object.assign(itemOf(s.state, known), { buc: 'cursed', known: { buc: true, spe: false } });
    const b = make(s, 'nh:arrow', 'cursed', 3);
    drop(s, b);
    const here = itemsAt(defs, s.state, 'dlvl1', 2, 1);
    expect(here.map((e) => e.c.item?.quantity)).toEqual([5]);
  });

  test('coins lose their curse status and land', () => {
    const s = onAltarSetup();
    const g = make(s, 'nh:gold_piece', 'cursed', 12);
    expect(s.text(drop(s, g))).toEqual(['12 gold pieces land on the altar.']);
    const here = itemsAt(defs, s.state, 'dlvl1', 2, 1).find((e) => e.def === 'nh:gold_piece');
    expect(here?.c.item?.buc).toBe('uncursed');
  });

  test('blind: no message and nothing learned; hallucinating: a flash but not the status', () => {
    const blind = onAltarSetup();
    makeBlinded(blind.ctx as unknown as Ctx, 100, false);
    const c = make(blind, 'nh:apple', 'cursed');
    expect(blind.text(drop(blind, c))).toEqual([]);
    expect(buc(blind, c).known).toBe(false);

    const hal = onAltarSetup();
    makeHallucinated(hal.ctx as unknown as Ctx, 100, false);
    const h = make(hal, 'nh:apple', 'cursed');
    const u = make(hal, 'nh:knife', 'uncursed');
    expect(hal.text(drop(hal, h))).toEqual([
      expect.stringMatching(/^There is an? [a-z ]+ flash as an apple hits the altar\.$/),
    ]);
    expect(buc(hal, h).known).toBe(false);
    hal.text(drop(hal, u));
    expect(buc(hal, u).known).toBe(true); // "lands" still tells
  });

  test('a monster drop on an altar in sight shows (mon_moving); out of sight it does not', () => {
    const s = onAltarSetup();
    const level = getLevel(s.state);
    paint(level, 3, 1, T.altar_lawful);
    const mon = addMon(s.state, 'nh:jackal', 3, 1, { asleep: true });
    const item = s.give('nh:dagger', { carriedBy: mon });
    itemOf(s.state, item).buc = 'cursed';
    const ctx = ctxFor(s.state);
    relobj(ctx as unknown as Ctx, mon, undefined, true);
    expect(ctx.events.map((e) => (e.type === 'msg' ? render(e) : ''))).toEqual([
      'There is a black flash as a dagger hits the altar.',
    ]);
    expect(buc(s, item).known).toBe(true);

    // the hero's own kill (not while monsters move): nothing
    const quiet = ctxFor(s.state);
    const mon2 = addMon(s.state, 'nh:jackal', 3, 1, { asleep: true });
    const item2 = s.give('nh:apple', { carriedBy: mon2 });
    itemOf(s.state, item2).buc = 'blessed';
    relobj(quiet as unknown as Ctx, mon2, undefined, false);
    expect(quiet.events).toEqual([]);
    expect(buc(s, item2).known).toBe(false);
  });
});

describe('throwing onto an altar', () => {
  test('a cursed missile that slips straight down lands on the altar (hitfloor)', () => {
    let found = 0;
    for (let seed = 1; seed <= 400 && found < 3; seed++) {
      const s = onAltarSetup(T.altar_neutral, seed);
      const dagger = s.byLetter('b');
      itemOf(s.state, dagger).buc = 'cursed';
      s.mod('nh:throw', { item: dagger });
      const p = s.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no prompt');
      const r = engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' });
      const here = itemsAt(defs, s.state, 'dlvl1', 2, 1).find((e) => e.def === 'nh:dagger');
      if (!here) continue; // it flew east
      found++;
      // the starting kit's curse status is known, so doname() says "cursed"
      expect(s.text(r)).toContain('There is a black flash as a cursed +0 dagger hits the altar.');
      expect(s.msgKeys(r).some((k) => k.startsWith('throw.floor'))).toBe(false);
      expect(here.c.item?.known.buc).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('looking at an altar', () => {
  test('stepping onto objects on an altar names its god and alignment', () => {
    const s = levelSetup(['.@...']);
    const level = getLevel(s.state);
    paint(level, 2, 0, T.altar_chaotic);
    paint(level, 3, 0, T.altar_unaligned);
    s.floor('nh:apple', { at: { level: 'dlvl1', x: 2, y: 0 } });
    s.floor('nh:apple', { at: { level: 'dlvl1', x: 3, y: 0 } });
    const east = () => s.text(s.step({ type: 'move', dir: 'e' }));
    expect(east()[0]).toBe('There is an altar to Loki (chaotic) here.');
    expect(east()[0]).toBe('There is an altar to Moloch (unaligned) here.');
  });
});

describe('the wrath of an altar (altar_wrath, kicking)', () => {
  test("its own god: Wisdom and a point of alignment record; another god's: Luck", () => {
    // the hero is neutral (Odin): the coaligned branch needs record > -rn2(4), always at 1+
    // (at 0 it fails 1 time in 4)
    const own = onAltarSetup(T.altar_neutral);
    const h = own.hero.c.attributes!;
    h.wis = 12;
    setU({ state: own.state }, { alignRecord: 1 });
    const ctx = ctxFor(own.state);
    altarWrath(ctx as unknown as Ctx, 2, 1);
    expect(ctx.events.map((e) => (e.type === 'msg' ? render(e) : ''))).toEqual([
      expect.stringMatching(
        /^The voice of Odin (booms out|thunders|rings out|booms): "How darest thou desecrate my altar!"$/,
      ),
    ]);
    expect([h.wis, uState(own.state).alignRecord]).toEqual([11, 0]);

    let lost = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const other = onAltarSetup(T.altar_lawful, seed);
      const c = ctxFor(other.state);
      altarWrath(c as unknown as Ctx, 2, 1);
      expect(c.events.map((e) => (e.type === 'msg' ? render(e) : ''))).toEqual([
        'A voice (could it be Tyr?) whispers:',
        '"Thou shalt pay, infidel!"',
      ]);
      const luck = uState(other.state).luck;
      expect([0, -1, -2]).toContain(luck);
      if (luck < 0) lost++;
      expect(uState(other.state).alignRecord).toBe(0);
    }
    // Luck 0: rn2(6) != 0, 5 in 6
    expect(lost).toBeGreaterThan(40);
  });

  test('kicking an altar: "You kick the altar.", its wrath, and 1 in 3 it hurts', () => {
    let hurt = 0;
    const n = 90;
    for (let seed = 1; seed <= n; seed++) {
      const s = levelSetup(['.....', '..@..', '.....'], seed);
      paint(getLevel(s.state), 3, 1, T.altar_chaotic);
      s.mod('nh:kick');
      const p = s.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no prompt');
      const r = engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' });
      const keys = s.msgKeys(r);
      expect(keys.slice(0, 3)).toEqual(['kick.altar', 'altar.whisper', 'altar.infidel']);
      if (keys.includes('kick.ouch')) hurt++;
    }
    expect(hurt / n).toBeGreaterThan(0.2);
    expect(hurt / n).toBeLessThan(0.48);
  });
});
