// m23 step 1: Angels and minions. The S_ANGEL rows, a minion's god (emin), makemon()'s random
// minions, peace_minded() and set_malign() for minions, the Angels' swords and shields with the
// Sunsword or Demonbane roll, summon_minion() by alignment and its callers (an angry god, a
// converted altar's priest), msummon()'s minion branches, the Angels' speech and their immunity
// to scaring. Outcomes over many seeds, never a lucky seed.
// ref: include/monsters.h S_ANGEL; include/mextra.h struct emin; src/minion.c summon_minion(),
// lminion(), llord(), msummon(); src/makemon.c makemon(), m_initweap(), peace_minded(),
// set_malign(); src/pray.c angrygods(), offer_different_alignment_altar(); src/priest.c
// angry_priest(); src/wizard.c cuss(); src/sounds.c domonnoise()
import {
  cellIndex,
  getLevel,
  inventoryOf,
  sortedIds,
  type DefId,
  type Entity,
  type EntityId,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL, A_NONE, type Aligntyp } from '../src/aligntyp';
import { artiExists } from '../src/index';
import { emin, isLminion, isMinion, setEmin } from '../src/emin';
import { epriOf, TEMPLE } from '../src/epri';
import { priestini } from '../src/priest';
import { makemon, peaceMinded } from '../src/generation';
import { ELEMENTALS, lminion, llord, msummon, summonMinion } from '../src/minion';
import { angrygods } from '../src/pray';
import { angryPriest } from '../src/peaceful';
import { setU, uState } from '../src/luck';
import { monsterDied } from '../src/mondeath';
import { cuss } from '../src/cuss';
import { domonnoise } from '../src/chat';
import { onscary } from '../src/scary';
import { tamedog } from '../src/dog';
import { checkSpecialRoom } from '../src/rooms';
import { setGenocided } from '../src/vanquished';
import { T } from '../src/terrain';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const ROOM = ['.........', '.........', '....@....', '.........', '.........'];
type S = ReturnType<typeof levelSetup>;

const ANGELS: readonly DefId[] = ['nh:couatl', 'nh:aleax', 'nh:angel', 'nh:ki_rin', 'nh:archon'];

/** A neutral human Valkyrie (Tyr, Odin, Loki) with a clean record. */
function setup(seed = 1, align: Aligntyp = A_NEUTRAL): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  setU(s.ctx, { alignType: align, alignRecord: 5, luck: 0, ugangr: 0, ublesscnt: 0 });
  return s;
}

const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
const monsters = (s: S): Entity[] =>
  sortedIds(s.state)
    .map((id) => s.state.entities[String(id)]!)
    .filter((e) => e.c.monster !== undefined);

/** Makes `kind` two squares east of her (or next to that). */
function make(s: S, kind: string, opts: Parameters<typeof makemon>[3] = {}): Entity {
  const at = { x: s.here.x + 2, y: s.here.y };
  const id = makemon(s.ctx as never, defs.monster(kind as DefId), at, {
    adjacentOk: true,
    ...opts,
  });
  expect(id).not.toBeNull();
  return ent(s, id!);
}

/** Every message of `fn`, rendered. */
function said(s: S, fn: () => void): string[] {
  const before = s.ctx.events.length;
  fn();
  return s.ctx.events
    .slice(before)
    .flatMap((e) =>
      e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
    );
}

describe('the S_ANGEL rows', () => {
  test('five Angels in C order of difficulty, every one a minion that leaves no corpse', () => {
    const rows = defs.monsters.filter((m) => m.glyph.ch === 'A');
    expect(rows.map((m) => m.id)).toEqual(ANGELS);
    for (const m of rows) {
      expect(m.flags).toContain('minion');
      expect(m.genFlags).toContain('nocorpse');
      expect(m.genFlags).toContain('nohell');
      expect(m.alignment).toBeGreaterThan(0);
    }
    expect(rows.filter((m) => m.flags.includes('lord')).map((m) => m.id)).toEqual([
      'nh:ki_rin',
      'nh:archon',
    ]);
  });
});

describe('a minion kind made by makemon()', () => {
  test('peace_minded(): a co-aligned minion is peaceful unless she has strayed at all', () => {
    const s = setup(1, A_LAWFUL);
    const aleax = defs.monster('nh:aleax');
    const draws = JSON.stringify(s.state.rng.core);
    expect(peaceMinded(s.ctx as never, aleax)).toBe(true);
    setU(s.ctx, { alignRecord: 0 });
    expect(peaceMinded(s.ctx as never, aleax)).toBe(true);
    setU(s.ctx, { alignRecord: -1 });
    expect(peaceMinded(s.ctx as never, aleax)).toBe(false);
    expect(JSON.stringify(s.state.rng.core)).toBe(draws); // no co-aligned rolls for a minion
    setU(s.ctx, { alignType: A_NEUTRAL, alignRecord: 10 });
    expect(peaceMinded(s.ctx as never, aleax)).toBe(false);
  });

  test('an Angel serves a random god 1 time in 3, peaceful to her by its god and renegade flag', () => {
    let minions = 0;
    let plain = 0;
    const gods = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = setup(seed);
      const a = make(s, 'nh:angel', { noInventory: true });
      const e = emin(s.state, a.id);
      if (!e) {
        plain++;
        continue;
      }
      minions++;
      gods.add(e.minAlign);
      expect([A_CHAOTIC, A_NEUTRAL, A_LAWFUL]).toContain(e.minAlign);
      const peaceful = e.minAlign === uState(s.state).alignType ? !e.renegade : e.renegade;
      expect(a.c.monster!.peaceful).toBe(peaceful);
    }
    expect(minions).toBeGreaterThan(8);
    expect(plain).toBeGreaterThan(minions);
    expect(gods.size).toBe(3);
  });

  test('MM_ANGRY makes the random minion renegade; MM_EMIN leaves it to the caller', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(seed);
      const a = make(s, 'nh:angel', { noInventory: true, angry: true });
      const e = emin(s.state, a.id);
      if (e) {
        seen++;
        expect(e.renegade).toBe(true);
      }
      const b = make(s, 'nh:angel', { noInventory: true, extra: 'emin' });
      expect(isMinion(s.state, b.id)).toBe(false);
    }
    expect(seen).toBeGreaterThan(5);
  });

  test('an aligned cleric made plainly is a roaming priest; a temple priest is not', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = setup(seed);
      const c = make(s, 'nh:aligned_cleric', { noInventory: true });
      const e = emin(s.state, c.id);
      expect(e).not.toBeNull();
      expect(epriOf(s.ctx, c.id)).toBeNull();
      const level = getLevel(s.state);
      level.rooms.push({ lx: 0, ly: 0, hx: 8, hy: 4, lit: true, type: TEMPLE } as never);
      const at = { x: s.here.x - 2, y: s.here.y };
      level.cells[cellIndex(level, at.x, at.y)] = level.palette.push(T.altar_lawful) - 1;
      const pid = priestini(s.ctx as never, level, level.rooms.length - 1, at);
      expect(pid).not.toBeNull();
      expect(isMinion(s.state, pid!)).toBe(false);
      expect(epriOf(s.ctx, pid!)).not.toBeNull();
    }
  });
});

describe("m_initweap(): an Angel's weapon and shield", () => {
  test('a blessed erodeproof long sword +0..+3 or silver mace +3..+6, and a shield', () => {
    const swords = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(seed);
      for (const kind of ['nh:aleax', 'nh:angel', 'nh:archon']) {
        const a = make(s, kind);
        const inv = inventoryOf(s.state, a.id);
        const wep = inv.find((o) => o.def === 'nh:long_sword' || o.def === 'nh:silver_mace')!;
        expect(wep).toBeDefined();
        swords.add(wep.def);
        const it = wep.c.item!;
        expect(it.buc).toBe('blessed');
        expect(it.erodeproof).toBe(true);
        const lo = wep.def === 'nh:long_sword' ? 0 : 3;
        expect(it.spe).toBeGreaterThanOrEqual(lo);
        expect(it.spe).toBeLessThanOrEqual(lo + 3);
        const shield = inv.find(
          (o) => o.def === 'nh:shield_of_reflection' || o.def === 'nh:large_shield',
        )!;
        expect(shield.c.item!.erodeproof).toBe(true);
        expect(shield.c.item!.spe).toBe(0);
        // a lord always carries the shield of reflection
        if (kind === 'nh:archon') expect(shield.def).toBe('nh:shield_of_reflection');
      }
      // the couatl and the ki-rin have no hands: no minion stuff
      for (const kind of ['nh:couatl', 'nh:ki_rin']) {
        const inv = inventoryOf(s.state, make(s, kind).id).map((o) => o.def);
        for (const d of ['nh:long_sword', 'nh:silver_mace', 'nh:large_shield'])
          expect(inv).not.toContain(d);
      }
    }
    expect([...swords].sort()).toEqual(['nh:long_sword', 'nh:silver_mace']);
  });

  test('a lawful lord always gets Sunsword or Demonbane, made once only', () => {
    const names = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(seed);
      const wep = (a: Entity): Entity =>
        inventoryOf(s.state, a.id).find(
          (o) => o.def === 'nh:long_sword' || o.def === 'nh:silver_mace',
        )!;
      const w1 = wep(make(s, 'nh:archon'));
      const name = (w1.def === 'nh:long_sword' ? 'nh:sunsword' : 'nh:demonbane') as DefId;
      expect(w1.c.item!.artifact).toBe(name);
      expect(artiExists(s.state, name)).toBe(true);
      names.add(name);
      // a second Archon with the same weapon: the artifact exists, a plain one
      for (let i = 0; i < 6; i++) {
        const w2 = wep(make(s, 'nh:archon'));
        if (w2.def === w1.def) expect(w2.c.item!.artifact).toBeUndefined();
      }
    }
    expect([...names].sort()).toEqual(['nh:demonbane', 'nh:sunsword']);
  });

  test('a plain Angel gets an artifact 1 time in 20; one serving another god never', () => {
    let arti = 0;
    let plainLawful = 0;
    let other = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = setup(seed);
      const a = make(s, 'nh:angel');
      const w = inventoryOf(s.state, a.id).find(
        (o) => o.def === 'nh:long_sword' || o.def === 'nh:silver_mace',
      )!;
      const e = emin(s.state, a.id);
      if (e && e.minAlign !== A_LAWFUL) {
        other++;
        expect(w.c.item!.artifact).toBeUndefined();
      } else {
        plainLawful++;
        if (w.c.item!.artifact !== undefined) arti++;
      }
    }
    expect(other).toBeGreaterThan(30);
    expect(arti).toBeGreaterThan(0);
    expect(arti).toBeLessThan(plainLawful / 8);
  });
});

describe('summon_minion()', () => {
  /** Summons a minion of `align` next to her: the new monster and the messages. */
  function summon(s: S, align: Aligntyp, talk: boolean): { mon: Entity | null; t: string[] } {
    const before = new Set(monsters(s).map((m) => m.id));
    const t = said(s, () => summonMinion(s.ctx as never, align, talk));
    const mon = monsters(s).find((m) => !before.has(m.id)) ?? null;
    return { mon, t };
  }

  test('a lawful god sends an Angel kind that is no lord; it serves him, hostile', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed, A_LAWFUL);
      getLevel(s.state).depth = 30; // deep enough for every Angel kind
      const { mon } = summon(s, A_LAWFUL, false);
      expect(mon).not.toBeNull();
      kinds.add(mon!.def);
      expect(['nh:couatl', 'nh:aleax', 'nh:angel']).toContain(mon!.def);
      expect(emin(s.state, mon!.id)).toMatchObject({ minAlign: A_LAWFUL, renegade: false });
      expect(mon!.c.monster!.peaceful).toBe(false);
      expect(isLminion(s.state, mon!.id, defs.monster(mon!.def))).toBe(true);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  test('a neutral god sends an elemental, a chaotic one or Moloch a minor demon', () => {
    const elementals = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed);
      getLevel(s.state).depth = 20;
      const n = summon(s, A_NEUTRAL, false).mon!;
      elementals.add(n.def);
      expect(ELEMENTALS).toContain(n.def);
      expect(emin(s.state, n.id)?.minAlign).toBe(A_NEUTRAL);
      expect(n.c.monster!.peaceful).toBe(false);
      for (const god of [A_CHAOTIC, A_NONE] as const) {
        const d = summon(s, god, false).mon;
        if (!d) continue; // ndemon() found none
        const def = defs.monster(d.def);
        expect(def.flags).toContain('demon');
        if (god === A_CHAOTIC) expect(def.alignment).toBeLessThan(0);
        expect(emin(s.state, d.id)?.minAlign).toBe(god);
        expect(d.c.monster!.peaceful).toBe(false);
      }
    }
    expect(elementals.size).toBe(4);
  });

  test('with `talk` the voice booms and it appears before her', () => {
    const s = setup(3, A_LAWFUL);
    const { mon, t } = summon(s, A_LAWFUL, true);
    expect(t.slice(0, 2)).toEqual([
      'The voice of Tyr booms:',
      '"Thou shalt pay for thine indiscretion!"',
    ]);
    expect(t[2]).toMatch(/^An? (couatl|Aleax|Angel) appears before you\.$/);
    expect(t).toHaveLength(3);
    expect(mon).not.toBeNull();
  });

  test('a summoned minion keeps the malign of its birth: killing it is bad when it was born peaceful', () => {
    const s = setup(5, A_LAWFUL);
    const mon = summon(s, A_LAWFUL, false).mon!;
    const e = emin(s.state, mon.id)!;
    const def = defs.monster(mon.def);
    // born peaceful to a lawful hero with a clean record: -3 * max(3, alignment)
    expect(e.malign).toBe(-3 * Math.max(3, def.alignment));
    const before = uState(s.state).alignRecord;
    monsterDied(s.ctx as never, mon.id, true);
    expect(uState(s.state).alignRecord).toBe(before + e.malign!);
  });

  test('lminion() never makes a lord; llord() is the Archon unless the kind is gone', () => {
    const s = setup(1);
    getLevel(s.state).depth = 50;
    for (let i = 0; i < 40; i++) {
      const pm = lminion(s.ctx as never);
      expect(pm).not.toBeNull();
      expect(defs.monster(pm!).flags).not.toContain('lord');
    }
    expect(llord(s.ctx as never)).toBe('nh:archon');
    setGenocided(s.ctx as never, 'nh:archon' as DefId);
    expect(llord(s.ctx as never)).not.toBe('nh:archon');
  });
});

describe('its callers', () => {
  test('an angry god\'s "Then die" sends a hostile minion of that god', () => {
    let found = 0;
    for (let seed = 1; seed <= 200 && found < 3; seed++) {
      const s = setup(seed);
      // maxanger 3 * 3: no god's bolt, cases 7 and 8 are "Thou durst call upon me?"
      setU(s.ctx, { ugangr: 3, luck: 0 });
      const before = new Set(monsters(s).map((m) => m.id));
      const t = said(s, () => angrygods(s.ctx as never, A_NEUTRAL));
      if (!t.some((l) => l.startsWith('"Then die'))) continue;
      found++;
      const mon = monsters(s).find((m) => !before.has(m.id));
      expect(mon).toBeDefined();
      expect(ELEMENTALS).toContain(mon!.def);
      expect(emin(s.state, mon!.id)?.minAlign).toBe(A_NEUTRAL);
      expect(mon!.c.monster!.peaceful).toBe(false);
    }
    expect(found).toBe(3);
  });

  test("a priest whose altar is gone runs loose as his god's hostile minion", () => {
    const s = setup(1);
    const level = getLevel(s.state);
    level.rooms.push({ lx: 0, ly: 0, hx: 8, hy: 4, lit: true, type: TEMPLE } as never);
    const at = { x: s.here.x, y: s.here.y };
    level.cells[cellIndex(level, at.x, at.y)] = level.palette.push(T.altar_chaotic) - 1;
    level.shrines = [at];
    const pid = priestini(s.ctx as never, level, 0, at)!;
    checkSpecialRoom(s.ctx as never, false);
    // still his altar: he only turns hostile
    angryPriest(s.ctx as never);
    expect(epriOf(s.ctx, pid)).not.toBeNull();
    expect(isMinion(s.state, pid)).toBe(false);
    // the altar gone (dug out): a roaming minion of his god
    level.cells[cellIndex(level, at.x, at.y)] = level.palette.indexOf(T.floor);
    angryPriest(s.ctx as never);
    expect(epriOf(s.ctx, pid)).toBeNull();
    expect(emin(s.state, pid)).toEqual({ minAlign: A_CHAOTIC, renegade: false });
    expect(ent(s, pid).c.monster!.peaceful).toBe(false);
  });
});

describe("msummon()'s minion branches", () => {
  test('a lawful Angel calls lawful minions or Angels; a neutral one Angels of its god', () => {
    let lawfulCalls = 0;
    let neutralAngels = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(seed);
      getLevel(s.state).depth = 30;
      const a = make(s, 'nh:angel', { noInventory: true, extra: 'emin' });
      setEmin(s.ctx, a.id, { minAlign: A_LAWFUL, renegade: false });
      const before = new Set(monsters(s).map((m) => m.id));
      msummon(s.ctx as never, a);
      for (const m of monsters(s).filter((m) => !before.has(m.id))) {
        lawfulCalls++;
        expect(defs.monster(m.def).glyph.ch).toBe('A');
      }
      const b = make(s, 'nh:angel', { noInventory: true, extra: 'emin' });
      setEmin(s.ctx, b.id, { minAlign: A_NEUTRAL, renegade: false });
      const before2 = new Set(monsters(s).map((m) => m.id));
      msummon(s.ctx as never, b);
      for (const m of monsters(s).filter((m) => !before2.has(m.id))) {
        if (m.def === 'nh:angel') {
          neutralAngels++;
          const e = emin(s.state, m.id)!;
          expect(e.minAlign).toBe(A_NEUTRAL);
          // renegade if same alignment but not peaceful, or peaceful but different alignment
          expect(e.renegade).toBe(!m.c.monster!.peaceful);
        } else expect(ELEMENTALS).toContain(m.def);
      }
    }
    expect(lawfulCalls).toBeGreaterThan(20);
    expect(neutralAngels).toBeGreaterThan(20);
  });
});

describe('the Angels speak and fear nothing', () => {
  test("a hostile lawful minion speaks an angel_cuss line; a peaceful one says it's not too late", () => {
    const s = setup(1, A_NEUTRAL);
    const a = make(s, 'nh:angel', { noInventory: true, extra: 'emin' });
    setEmin(s.ctx, a.id, { minAlign: A_LAWFUL, renegade: false });
    a.c.monster!.peaceful = false;
    const angelic = new Set(
      Array.from({ length: 14 }, (_, i) =>
        render({ key: `cuss.angel.${i + 1}`, params: { god: 'Tyr', name: 'Valkyrie' } }),
      ),
    );
    const lines = new Set<string>();
    for (let i = 0; i < 80; i++)
      for (const l of said(s, () => cuss(s.ctx as never, a))) lines.add(l);
    expect(lines.size).toBeGreaterThan(8);
    for (const l of lines) expect(angelic).toContain(l);
    expect(lines).toContain('"The wrath of Tyr is now upon you!"');
    a.c.monster!.peaceful = true;
    expect(said(s, () => domonnoise(s.ctx as never, a.id))).toEqual(['"It\'s not too late."']);
    // a renegade lawful minion curses as a demon would
    setEmin(s.ctx, a.id, { minAlign: A_LAWFUL, renegade: true });
    a.c.monster!.peaceful = false;
    const r = new Set<string>();
    for (let i = 0; i < 30; i++) for (const l of said(s, () => cuss(s.ctx as never, a))) r.add(l);
    expect([...r].some((l) => l.includes('Tyr'))).toBe(false);
  });

  test('a lawful minion ignores scare monster; no minion can be tamed', () => {
    const s = setup(1);
    const a = make(s, 'nh:aleax', { noInventory: true });
    const id = s.floor('nh:scroll_of_scare_monster');
    expect(id).toBeDefined();
    expect(onscary(s.ctx as never, s.here.x, s.here.y, a)).toBe(false);
    const g = make(s, 'nh:air_elemental', { noInventory: true, extra: 'emin' });
    expect(onscary(s.ctx as never, s.here.x, s.here.y, g)).toBe(true);
    setEmin(s.ctx, g.id, { minAlign: A_NEUTRAL, renegade: false });
    expect(tamedog(s.ctx as never, g.id, null, false, () => {})).toBe(false);
    expect(g.c.monster!.tame).toBeUndefined();
  });

  test('a dead minion is forgotten', () => {
    const s = setup(1);
    const a = make(s, 'nh:aleax', { noInventory: true });
    setEmin(s.ctx, a.id, { minAlign: A_LAWFUL, renegade: false });
    monsterDied(s.ctx as never, a.id, false);
    expect(emin(s.state, a.id)).toBeNull();
  });
});
