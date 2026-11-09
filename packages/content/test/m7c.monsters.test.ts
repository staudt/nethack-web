// m7c step 2: the new orcs, zombies, mummies, the water moccasin and the water demon. Outcomes
// are found by burning RNG draws before the action (the same as a seed search) with pinned
// monsters, never by a lucky seed.
import {
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { monsterAttack } from '../src/combat';
import { makemon, monsterDied, vanillaMod } from '../src/index';
import { MUSE_ITEMS, addMon, setup as roomSetup } from './helpers';
import { ctxFor, defs, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'm7c-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'm7c-probe:run',
      labelKey: 'm7c-probe',
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
  const r = engine.step(state, { type: 'mod', action: 'm7c-probe:run' });
  return r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}

/** Every outcome of `fn` over the first `tries` RNG offsets, each on a copy of `state`. */
function outcomes(state: GameState, fn: (ctx: Ctx) => void, tries = 200) {
  const out = [];
  for (let k = 0; k < tries; k++) {
    const st = structuredClone(state);
    const text = run(st, (ctx) => {
      for (let i = 0; i < k; i++) ctx.rng.rn2(2);
      fn(ctx);
    });
    out.push({ state: st, text });
  }
  return out;
}

/** The hero (500 HP) at (3,3) of a lit room and a pinned `def` next to her at (4,3). */
function pinned(def: string, level?: number) {
  const s = levelSetup(['.........', '.........', '.........', '...@.....', '.........']);
  const h = getPlayer(s.state);
  if (h.c.hp) h.c.hp = { cur: 500, max: 500 };
  const id = addMon(s.state, def, 4, 3);
  const e = s.state.entities[String(id)]!;
  e.c.actor!.speed = 0;
  if (level !== undefined) e.c.monster!.level = level;
  s.step({ type: 'wait' }); // see the level
  return { s, id };
}
const heroHp = (st: GameState): number => getPlayer(st).c.hp?.cur ?? -1;

const NEW = [
  'nh:orc',
  'nh:mordor_orc',
  'nh:uruk_hai',
  'nh:orc_shaman',
  'nh:orc_captain',
  'nh:kobold_mummy',
  'nh:gnome_mummy',
  'nh:orc_mummy',
  'nh:dwarf_mummy',
  'nh:ettin_mummy',
  'nh:water_moccasin',
  'nh:kobold_zombie',
  'nh:gnome_zombie',
  'nh:orc_zombie',
  'nh:dwarf_zombie',
  'nh:water_demon',
];
const mdef = (id: string) => defs.monster(id as DefId);

describe('the new monsters match include/monsters.h', () => {
  test('LVL(), frequency, difficulty and attacks', () => {
    // [id, level, speed, ac, mr, alignment, frequency, difficulty, attacks (at/ad n d)]
    const rows: [string, number, number, number, number, number, number, number, string][] = [
      ['nh:orc', 1, 9, 10, 0, -3, 0, 3, 'weapon/phys 1d8'],
      ['nh:mordor_orc', 3, 5, 10, 0, -5, 1, 5, 'weapon/phys 1d6'],
      ['nh:uruk_hai', 3, 7, 10, 0, -4, 1, 5, 'weapon/phys 1d8'],
      ['nh:orc_shaman', 3, 9, 5, 10, -5, 1, 5, 'magic/spel 0d0'],
      ['nh:orc_captain', 5, 5, 10, 0, -5, 1, 7, 'weapon/phys 2d4,weapon/phys 2d4'],
      ['nh:kobold_mummy', 3, 8, 6, 20, -2, 1, 4, 'claw/phys 1d4'],
      ['nh:gnome_mummy', 4, 10, 6, 20, -3, 1, 5, 'claw/phys 1d6'],
      ['nh:orc_mummy', 5, 10, 5, 20, -4, 1, 6, 'claw/phys 1d6'],
      ['nh:dwarf_mummy', 5, 10, 5, 20, -4, 1, 6, 'claw/phys 1d6'],
      ['nh:ettin_mummy', 7, 12, 4, 30, -6, 1, 8, 'claw/phys 2d6,claw/phys 2d6'],
      ['nh:water_moccasin', 4, 15, 3, 0, 0, 0, 7, 'bite/drst 1d6'],
      ['nh:kobold_zombie', 0, 6, 10, 0, -2, 1, 1, 'claw/phys 1d4'],
      ['nh:gnome_zombie', 1, 6, 10, 0, -2, 1, 2, 'claw/phys 1d5'],
      ['nh:orc_zombie', 2, 6, 9, 0, -3, 1, 3, 'claw/phys 1d6'],
      ['nh:dwarf_zombie', 2, 6, 9, 0, -3, 1, 3, 'claw/phys 1d6'],
      ['nh:water_demon', 8, 12, -4, 30, -7, 0, 11, 'weapon/phys 1d3,claw/phys 1d3,bite/phys 1d3'],
    ];
    expect(rows.map((r) => r[0])).toEqual(NEW);
    for (const [id, level, speed, ac, mr, alignment, frequency, difficulty, atk] of rows) {
      const m = mdef(id);
      expect({ level, speed, ac, mr, alignment, frequency, difficulty }, id).toEqual({
        level: m.level,
        speed: m.speed,
        ac: m.ac,
        mr: m.mr,
        alignment: m.alignment,
        frequency: m.frequency,
        difficulty: m.difficulty,
      });
      expect(m.attacks.map((a) => `${a.at}/${a.ad} ${a.n}d${a.d}`).join(), id).toBe(atk);
    }
    // the plain orc, the water moccasin and the water demon are never made at random
    for (const id of ['nh:orc', 'nh:water_moccasin', 'nh:water_demon'])
      expect(mdef(id).genFlags).toContain('nogen');
  });

  test('undead resist cold, sleep and poison and are mindless; zombies and mummies leave no corpse of their own', () => {
    for (const id of NEW.filter((i) => /zombie|mummy/.test(i))) {
      const m = mdef(id);
      expect(m.resists, id).toEqual(['cold', 'sleep', 'poison']);
      expect(m.flags, id).toEqual(expect.arrayContaining(['undead', 'mindless', 'breathless']));
      expect(m.genFlags, id).toContain('nocorpse');
    }
  });
});

describe('the new monsters fight', () => {
  test('each can be made, and each melee attacker hurts the hero', () => {
    const t = roomSetup(['.....', '..@..', '.....']);
    const ctx = ctxFor(t.state) as unknown as Ctx;
    for (const id of NEW) {
      const mid = makemon(ctx, mdef(id), { x: 0, y: 0 }, { nogroup: true });
      expect(mid, id).not.toBeNull();
      expect(t.state.entities[String(mid)]?.def).toBe(id);
      for (const e of inventoryOf(t.state, mid!)) delete t.state.entities[String(e.id)];
      delete t.state.entities[String(mid)];
    }
    for (const id of NEW.filter((i) => i !== 'nh:orc_shaman')) {
      const { s, id: mid } = pinned(id);
      const hurt = outcomes(s.state, (c) => monsterAttack(c, mid), 60).filter(
        (o) => heroHp(o.state) < 500,
      );
      expect(hurt.length, id).toBeGreaterThan(0);
    }
  });

  test('the water moccasin bite is poisonous', () => {
    const { s, id } = pinned('nh:water_moccasin');
    const texts = outcomes(s.state, (c) => monsterAttack(c, id), 300).map((o) => o.text.join(' '));
    expect(texts.some((t) => /bite was poisoned/.test(t))).toBe(true);
  });

  test('an orc shaman casts psi bolt', () => {
    const { s, id } = pinned('nh:orc_shaman', 5);
    const psi = outcomes(s.state, (c) => monsterAttack(c, id), 300).filter(
      (o) =>
        o.text[0] === 'The orc shaman casts a spell at you!' && /head|brain/.test(o.text[1] ?? ''),
    );
    expect(psi.length).toBeGreaterThan(0);
    for (const o of psi) expect(heroHp(o.state)).toBeLessThan(500);
  });
});

describe('starting gear', () => {
  function gear(id: string, n: number) {
    const t = roomSetup(['.....', '..@..', '.....'], 3);
    const ctx = ctxFor(t.state) as unknown as Ctx;
    const counts = new Map<string, number>();
    const all: { defs: string[]; arrows: number; cloak: string | null }[] = [];
    for (let i = 0; i < n; i++) {
      const mid = makemon(ctx, mdef(id), { x: 0, y: 0 }, { nogroup: true })!;
      const inv = inventoryOf(t.state, mid);
      const ds = inv.map((e) => e.def).filter((d) => !MUSE_ITEMS.has(d));
      for (const d of new Set(ds)) counts.set(d, (counts.get(d) ?? 0) + 1);
      const arrows = inv.find((e) => e.def === 'nh:orcish_arrow')?.c.item?.quantity ?? 0;
      const cloak = inv.find((e) => e.c.item?.equipped === 'cloak')?.def ?? null;
      all.push({ defs: ds, arrows, cloak });
      for (const e of inv) delete t.state.entities[String(e.id)];
      delete t.state.entities[String(mid)];
    }
    return { all, f: (d: string) => (counts.get(d) ?? 0) / n };
  }
  const near = (a: number, b: number, tol = 0.05) => expect(Math.abs(a - b)).toBeLessThan(tol);
  const MORDOR = ['nh:scimitar', 'nh:orcish_shield', 'nh:knife', 'nh:orcish_chain_mail'];
  const URUK = [
    'nh:orcish_cloak',
    'nh:orcish_short_sword',
    'nh:iron_shoes',
    'nh:orcish_bow',
    'nh:orcish_arrow',
    'nh:uruk_hai_shield',
  ];
  const BOTH = ['nh:orcish_helm', 'nh:gold_piece'];

  test("a Mordor orc carries only m_initweap()'s Mordor items, each 1 time in 3", () => {
    const g = gear('nh:mordor_orc', 1500);
    for (const o of g.all) for (const d of o.defs) expect([...MORDOR, ...BOTH]).toContain(d);
    for (const d of MORDOR) near(g.f(d), 1 / 3);
    near(g.f('nh:orcish_helm'), 0.5);
  });

  test('an Uruk-hai carries only the Uruk-hai items; a bow comes with 3..14 orcish arrows', () => {
    const g = gear('nh:uruk_hai', 1500);
    for (const o of g.all) {
      for (const d of o.defs) expect([...URUK, ...BOTH]).toContain(d);
      expect(o.defs.includes('nh:orcish_bow')).toBe(o.defs.includes('nh:orcish_arrow'));
      if (o.arrows) expect(o.arrows).toBeGreaterThanOrEqual(3);
      expect(o.arrows).toBeLessThanOrEqual(14);
    }
    for (const d of URUK) near(g.f(d), 1 / 3);
  });

  test('an orc-captain is equipped as one or the other, never both', () => {
    const g = gear('nh:orc_captain', 1000);
    let mordor = 0;
    let uruk = 0;
    for (const o of g.all) {
      const m = o.defs.some((d) => MORDOR.includes(d));
      const u = o.defs.some((d) => URUK.includes(d));
      expect(m && u).toBe(false);
      if (m) mordor++;
      if (u) uruk++;
    }
    expect(mordor).toBeGreaterThan(0);
    expect(uruk).toBeGreaterThan(0);
  });

  test('mummies get a mummy wrapping 6 times in 7 and wear it, even the huge ettin mummy', () => {
    for (const id of ['nh:gnome_mummy', 'nh:ettin_mummy']) {
      const g = gear(id, 700);
      near(g.f('nh:mummy_wrapping'), 6 / 7);
      for (const o of g.all)
        expect(o.cloak, id).toBe(o.defs.includes('nh:mummy_wrapping') ? 'nh:mummy_wrapping' : null);
    }
  });
});

describe('corpses', () => {
  function deaths(id: string, tries = 60) {
    const t = roomSetup(['.....', '..@..', '.....']);
    t.state.turn = 500;
    const mid: EntityId = addMon(t.state, id, 4, 2);
    return outcomes(t.state, (c) => monsterDied(c, mid, true), tries).map((o) => ({
      corpses: itemsAt(defs, o.state, 'dlvl1', 4, 2).filter((e) => e.def === 'nh:corpse'),
      turn: o.state.turn,
    }));
  }

  test('a gnome zombie leaves an old gnome corpse, sometimes', () => {
    const out = deaths('nh:gnome_zombie');
    const with1 = out.filter((o) => o.corpses.length > 0);
    expect(with1.length).toBeGreaterThan(0);
    expect(with1.length).toBeLessThan(out.length); // corpse_chance(): 1 in 3 for it
    for (const o of with1) {
      expect(o.corpses.map((c) => c.c.item?.corpseOf)).toEqual(['nh:gnome']);
      expect(o.corpses[0]!.c.item?.age).toBe(500 - 101); // aged past TAINT_AGE
    }
  });

  test('an orc mummy leaves an orc corpse; the ettin mummy an ettin one', () => {
    const orc = deaths('nh:orc_mummy').flatMap((o) => o.corpses);
    expect(orc.length).toBeGreaterThan(0);
    for (const c of orc) expect(c.c.item?.corpseOf).toBe('nh:orc');
    const ettin = deaths('nh:ettin_mummy', 20).flatMap((o) => o.corpses);
    expect(ettin.length).toBeGreaterThan(0);
    for (const c of ettin) expect(c.c.item?.corpseOf).toBe('nh:ettin');
  });
});
