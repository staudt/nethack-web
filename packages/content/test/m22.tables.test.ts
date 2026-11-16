// m22 step 1: the role and race tables (role.c, attrib.c, u_init.c) and the hero's stats read
// through urole()/urace(). The other roles are reached through the test seam.
import {
  createRng,
  getPlayer,
  inventoryOf,
  seedRng,
  type Ctx,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  P,
  RACES_TAB,
  RACE_ORDER,
  ROLES_TAB,
  ROLE_ORDER,
  SKILL_GROUPS,
  SKILL_TAB,
  adjabil,
  enermod,
  initAttr,
  initialAttributes,
  messagesEn,
  newhp,
  newpw,
  percentSuccess,
  rankTitleKey,
  roleNameKey,
  setRoleRaceForTest,
  urace,
  urole,
  type RaceKey,
  type RoleKey,
} from '../src/index';
import { adjattrib } from '../src/attrib';
import { skillInit, skillLevel } from '../src/skills';
import { nhData } from '../src/items';
import { defs, engine, levelSetup } from './itemHelpers';

const fresh = (seed = 1): GameState => engine.newGame({ seed }).state;

/** A ctx over `state` with its own seeded RNG; events are collected. */
function ctxFor(state: GameState, seed: number, events: GameEvent[] = []): Ctx {
  return {
    state,
    rng: createRng(seedRng(seed)),
    defs,
    emit: (e: GameEvent) => events.push(e),
  } as unknown as Ctx;
}

/** Every allowed (role, race) pair. ref: src/role.c roles[].allow */
const PAIRS: [RoleKey, RaceKey][] = ROLE_ORDER.flatMap((r) =>
  ROLES_TAB[r].races.map((race): [RoleKey, RaceKey] => [r, race]),
);

describe('role table (role.c roles[])', () => {
  test('13 roles in C order, Rogue before Ranger', () => {
    expect(ROLE_ORDER.map((r) => ROLES_TAB[r].filecode)).toEqual([
      'Arc',
      'Bar',
      'Cav',
      'Hea',
      'Kni',
      'Mon',
      'Pri',
      'Rog',
      'Ran',
      'Sam',
      'Tou',
      'Val',
      'Wiz',
    ]);
  });

  test('attrbase sums and attrdist totals of 100', () => {
    const sums = Object.fromEntries(
      ROLE_ORDER.map((r) => [r, ROLES_TAB[r].attrbase.reduce((a, b) => a + b, 0)]),
    );
    expect(sums).toEqual({
      archeologist: 48,
      barbarian: 67,
      caveman: 45,
      healer: 61,
      knight: 69,
      monk: 47,
      priest: 45,
      rogue: 44,
      ranger: 68,
      samurai: 58,
      tourist: 47,
      valkyrie: 48,
      wizard: 45,
    });
    for (const r of ROLE_ORDER) expect(ROLES_TAB[r].attrdist.reduce((a, b) => a + b, 0)).toBe(100);
  });

  // [role, hpadv, enadv, xlev, initrecord, spelbase, spelheal, spelshld, spelarmr, stat, spec]
  test.each([
    [
      'archeologist',
      [11, 0, 0, 8, 1, 0],
      [1, 0, 0, 1, 0, 1],
      14,
      10,
      5,
      0,
      2,
      10,
      'int',
      'magic_mapping',
    ],
    [
      'barbarian',
      [14, 0, 0, 10, 2, 0],
      [1, 0, 0, 1, 0, 1],
      10,
      10,
      14,
      0,
      0,
      8,
      'int',
      'haste_self',
    ],
    ['caveman', [14, 0, 0, 8, 2, 0], [1, 0, 0, 1, 0, 1], 10, 0, 12, 0, 1, 8, 'int', 'dig'],
    [
      'healer',
      [11, 0, 0, 8, 1, 0],
      [1, 4, 0, 1, 0, 2],
      20,
      10,
      3,
      -3,
      2,
      10,
      'wis',
      'cure_sickness',
    ],
    ['knight', [14, 0, 0, 8, 2, 0], [1, 4, 0, 1, 0, 2], 10, 10, 8, -2, 0, 9, 'wis', 'turn_undead'],
    [
      'monk',
      [12, 0, 0, 8, 1, 0],
      [2, 2, 0, 2, 0, 2],
      10,
      10,
      8,
      -2,
      2,
      20,
      'wis',
      'restore_ability',
    ],
    ['priest', [12, 0, 0, 8, 1, 0], [4, 3, 0, 2, 0, 2], 10, 0, 3, -2, 2, 10, 'wis', 'remove_curse'],
    [
      'rogue',
      [10, 0, 0, 8, 1, 0],
      [1, 0, 0, 1, 0, 1],
      11,
      10,
      8,
      0,
      1,
      9,
      'int',
      'detect_treasure',
    ],
    ['ranger', [13, 0, 0, 6, 1, 0], [1, 0, 0, 1, 0, 1], 12, 10, 9, 2, 1, 10, 'int', 'invisibility'],
    [
      'samurai',
      [13, 0, 0, 8, 1, 0],
      [1, 0, 0, 1, 0, 1],
      11,
      10,
      10,
      0,
      0,
      8,
      'int',
      'clairvoyance',
    ],
    ['tourist', [8, 0, 0, 8, 0, 0], [1, 0, 0, 1, 0, 1], 14, 0, 5, 1, 2, 10, 'int', 'charm_monster'],
    [
      'valkyrie',
      [14, 0, 0, 8, 2, 0],
      [1, 0, 0, 1, 0, 1],
      10,
      0,
      10,
      -2,
      0,
      9,
      'wis',
      'cone_of_cold',
    ],
    ['wizard', [10, 0, 0, 8, 1, 0], [4, 3, 0, 2, 0, 3], 12, 0, 1, 0, 3, 10, 'int', 'magic_missile'],
  ] as const)('%s', (r, hp, en, xlev, initrecord, base, heal, shld, armr, stat, spec) => {
    const row = ROLES_TAB[r];
    const flat = (a: (typeof row)['hpadv']) => [
      a.infix,
      a.inrnd,
      a.lofix,
      a.lornd,
      a.hifix,
      a.hirnd,
    ];
    expect(flat(row.hpadv)).toEqual(hp);
    expect(flat(row.enadv)).toEqual(en);
    expect([row.xlev, row.initrecord]).toEqual([xlev, initrecord]);
    expect([row.spelbase, row.spelheal, row.spelshld, row.spelarmr, row.spelsbon]).toEqual([
      base,
      heal,
      shld,
      armr,
      -4,
    ]);
    expect(row.spelstat).toBe(stat);
    expect(row.spelspec).toBe(`nh:spellbook_of_${spec}`);
    // the special spell's book exists
    expect(defs.object(row.spelspec).class).toBe('spellbook');
  });

  test('allowed races, genders and alignments; the pets', () => {
    const allow = (r: RoleKey) => {
      const row = ROLES_TAB[r];
      return `${row.races.join(',')} ${row.genders.join(',')} ${row.aligns.join(',')} ${row.petnum ?? '-'}`;
    };
    expect(Object.fromEntries(ROLE_ORDER.map((r) => [r, allow(r)]))).toEqual({
      archeologist: 'human,dwarf,gnome male,female 1,0 -',
      barbarian: 'human,orc male,female 0,-1 -',
      caveman: 'human,dwarf,gnome male,female 1,0 nh:little_dog',
      healer: 'human,gnome male,female 0 -',
      knight: 'human male,female 1 nh:pony',
      monk: 'human male,female 1,0,-1 -',
      priest: 'human,elf male,female 1,0,-1 -',
      rogue: 'human,orc male,female -1 -',
      ranger: 'human,elf,gnome,orc male,female 0,-1 nh:little_dog',
      samurai: 'human male,female 1 nh:little_dog',
      tourist: 'human male,female 0 -',
      // the default character: human, female, neutral first
      valkyrie: 'human,dwarf female 0,1 -',
      wizard: 'human,elf,gnome,orc male,female 0,-1 nh:kitten',
    });
    for (const r of ROLE_ORDER) {
      const pet = ROLES_TAB[r].petnum;
      if (pet) expect(defs.monster(pet).id).toBe(pet);
    }
  });

  test('every allowed race shares an alignment with the role', () => {
    for (const [r, race] of PAIRS)
      expect(
        ROLES_TAB[r].aligns.some((a) => RACES_TAB[race].aligns.includes(a)),
        `${r} ${race}`,
      ).toBe(true);
  });

  test('names, ranks and gods have English text', () => {
    for (const r of ROLE_ORDER) {
      for (const f of [false, true]) {
        expect(messagesEn[roleNameKey(r, f)], r).toBeTypeOf('string');
        for (let n = 1; n <= 9; n++)
          expect(messagesEn[rankTitleKey(r, n, f)], `${r} ${n}`).toBeTypeOf('string');
      }
      const g = ROLES_TAB[r].gods;
      if (g)
        for (const k of [g.lawful, g.neutral, g.chaotic])
          expect(messagesEn[k], k).toBeTypeOf('string');
    }
    expect(ROLES_TAB.priest.gods).toBeNull();
    expect(messagesEn[roleNameKey('caveman', true)]).toBe('Cavewoman');
    expect(messagesEn[roleNameKey('priest', true)]).toBe('Priestess');
    expect(messagesEn[roleNameKey('valkyrie', true)]).toBe('Valkyrie');
    expect(messagesEn[rankTitleKey('valkyrie', 1, true)]).toBe('Stripling');
    expect(messagesEn[rankTitleKey('valkyrie', 4, true)]).toBe('Woman-at-arms');
    expect(messagesEn[rankTitleKey('valkyrie', 4, false)]).toBe('Man-at-arms');
    expect(messagesEn[rankTitleKey('knight', 8, true)]).toBe('Dame');
    expect(messagesEn[ROLES_TAB.knight.gods?.chaotic ?? '']).toBe('Manannan Mac Lir');
    expect(ROLES_TAB.samurai.goddess).toEqual({ lawful: true });
    for (const race of RACE_ORDER) {
      expect(messagesEn[`race.${race}`]).toBeTypeOf('string');
      expect(messagesEn[`race.${race}.adj`]).toBeTypeOf('string');
    }
  });
});

describe('intrinsics by level (attrib.c *_abil[])', () => {
  const list = (abil: readonly { level: number; prop: string }[]) =>
    abil.map((a) => `${a.level}:${a.prop}`).join(' ');

  test('every role', () => {
    expect(Object.fromEntries(ROLE_ORDER.map((r) => [r, list(ROLES_TAB[r].abil)]))).toEqual({
      archeologist: '1:searching 5:stealth 10:fast',
      barbarian: '1:poison_res 7:fast 15:stealth',
      caveman: '7:fast 15:warning',
      healer: '1:poison_res 15:warning',
      knight: '7:fast',
      monk: '1:fast 1:sleep_res 1:see_invis 3:poison_res 5:stealth 7:warning 9:searching 11:fire_res 13:cold_res 15:shock_res 17:teleport_control',
      priest: '15:warning 20:fire_res',
      rogue: '1:stealth 10:searching',
      ranger: '1:searching 7:stealth 15:see_invis',
      samurai: '1:fast 15:stealth',
      tourist: '10:searching 20:poison_res',
      valkyrie: '1:cold_res 3:stealth 7:fast',
      wizard: '15:warning 17:teleport_control',
    });
  });

  test('every race', () => {
    expect(Object.fromEntries(RACE_ORDER.map((r) => [r, list(RACES_TAB[r].abil)]))).toEqual({
      human: '',
      elf: '1:infravision 4:sleep_res',
      dwarf: '1:infravision',
      gnome: '1:infravision',
      orc: '1:infravision 1:poison_res',
    });
  });

  test('properties and messages exist', () => {
    const props = new Set<string>(Object.values(P));
    for (const row of [...Object.values(ROLES_TAB), ...Object.values(RACES_TAB)])
      for (const a of row.abil) {
        expect(props.has(a.prop), a.prop).toBe(true);
        for (const k of [a.gain, a.lose]) if (k) expect(messagesEn[k], k).toBeTypeOf('string');
      }
    // C: an empty losestr says "less <gainstr>"
    const monk = ROLES_TAB.monk.abil;
    expect(monk.find((a) => a.prop === 'poison_res')).toMatchObject({
      gain: 'abil.healthy',
      lose: 'abil.less_healthy',
    });
    expect(monk.find((a) => a.prop === 'searching')?.lose).toBe('abil.unaware');
  });

  /** The hero's intrinsics among the table's properties after adjabil() from 0 up to `lvl`. */
  function intrinsicsAt(role: RoleKey, race: RaceKey, lvl: number, events: GameEvent[] = []) {
    const s = fresh();
    setRoleRaceForTest(s, role, race);
    const hero = getPlayer(s);
    delete hero.c.props;
    const ctx = ctxFor(s, 1, events);
    adjabil(ctx, s.playerId, 0, 1);
    for (let l = 1; l < lvl; l++) adjabil(ctx, s.playerId, l, l + 1);
    return Object.keys(hero.c.props ?? {})
      .filter((k) => hero.c.props?.[k]?.intrinsic)
      .sort();
  }

  test.each(PAIRS)('%s %s across levels 1..30', (role, race) => {
    const raceAbil = race === 'elf' || race === 'orc' ? RACES_TAB[race].abil : [];
    const abil = [...ROLES_TAB[role].abil, ...raceAbil];
    for (const lvl of [1, 3, 7, 10, 15, 20, 30]) {
      const want = [...new Set(abil.filter((a) => a.level <= lvl).map((a) => a.prop))].sort();
      expect(intrinsicsAt(role, race, lvl), `${role} ${race} ${lvl}`).toEqual(want);
    }
  });

  test('a dwarf or gnome gets no adjabil() infravision (set_uasmon() gives it)', () => {
    expect(intrinsicsAt('archeologist', 'dwarf', 1)).toEqual(['searching']);
    expect(intrinsicsAt('archeologist', 'gnome', 1)).toEqual(['searching']);
  });

  test('an elf feels awake at XL4; a Monk feels cool at XL11 and loses it at XL10', () => {
    const ev: GameEvent[] = [];
    intrinsicsAt('wizard', 'elf', 4, ev);
    expect(ev.map((e) => (e.type === 'msg' ? e.key : ''))).toContain('abil.awake');
    const s = fresh();
    setRoleRaceForTest(s, 'monk', 'human');
    const events: GameEvent[] = [];
    const ctx = ctxFor(s, 1, events);
    adjabil(ctx, s.playerId, 10, 11);
    expect(getPlayer(s).c.props?.[P.FIRE_RES]?.intrinsic).toBe(true);
    adjabil(ctx, s.playerId, 11, 10);
    expect(getPlayer(s).c.props?.[P.FIRE_RES]?.intrinsic).toBeFalsy();
    expect(events.map((e) => (e.type === 'msg' ? e.key : ''))).toEqual([
      'abil.cool',
      'abil.warmer',
    ]);
  });
});

describe('skill tables (u_init.c Skill_*[])', () => {
  test('entry counts and names', () => {
    const counts = Object.fromEntries(ROLE_ORDER.map((r) => [r, Object.keys(SKILL_TAB[r]).length]));
    expect(counts).toEqual({
      archeologist: 19,
      barbarian: 22,
      caveman: 20,
      healer: 16,
      knight: 26,
      monk: 12,
      priest: 21,
      rogue: 23,
      ranger: 24,
      samurai: 20,
      tourist: 32,
      valkyrie: 20,
      wizard: 22,
    });
    const names = new Set(SKILL_GROUPS.flatMap((g) => g.skills));
    for (const r of ROLE_ORDER)
      for (const [k, v] of Object.entries(SKILL_TAB[r])) {
        expect(names.has(k), `${r} ${k}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(2);
        expect(v).toBeLessThanOrEqual(6);
      }
  });

  test('spot checks', () => {
    expect(SKILL_TAB.monk['bare_handed']).toBe(6); // P_MARTIAL_ARTS, P_GRAND_MASTER
    expect(SKILL_TAB.samurai['bare_handed']).toBe(5); // P_MARTIAL_ARTS, P_MASTER
    expect(SKILL_TAB.barbarian['bare_handed']).toBe(5);
    expect(SKILL_TAB.caveman['bare_handed']).toBe(5);
    expect(SKILL_TAB.knight['lance']).toBe(4);
    expect(SKILL_TAB.knight['riding']).toBe(4);
    expect(SKILL_TAB.wizard['attack_spell']).toBe(4);
    expect(SKILL_TAB.priest['cleric_spell']).toBe(4);
    expect(SKILL_TAB.healer['healing_spell']).toBe(4);
    expect(SKILL_TAB.tourist['dart']).toBe(4);
    expect(SKILL_TAB.ranger['bow']).toBe(4);
    expect(SKILL_TAB.priest['dagger']).toBeUndefined();
  });

  test("skillInit() takes the role's maximums", () => {
    const s = levelSetup();
    setRoleRaceForTest(s.state, 'wizard', 'elf');
    skillInit({ state: s.state, defs }, s.state.playerId);
    const d = nhData({ state: s.state });
    expect(d.skillMax).toEqual(SKILL_TAB.wizard);
    expect(skillLevel({ state: s.state }, 'attack_spell')).toBe(2); // skill_init()'s magic: Basic
    expect(skillLevel({ state: s.state }, 'divination_spell')).toBe(1); // unskilled
    expect(skillLevel({ state: s.state }, 'axe')).toBe(1);
    expect(skillLevel({ state: s.state }, 'long_sword')).toBe(0); // restricted
  });
});

describe('hero stats by role and race', () => {
  test.each(PAIRS)('%s %s: init_attr(75) within the race limits, then the variation', (r, race) => {
    const row = ROLES_TAB[r];
    const lim = RACES_TAB[race];
    for (let seed = 1; seed <= 50; seed++) {
      const ctx = ctxFor(fresh(), seed);
      const a = initAttr(ctx, 75, r, race);
      expect(a.reduce((x, y) => x + y, 0)).toBe(75);
      a.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(row.attrbase[i] ?? 0);
        expect(v).toBeLessThanOrEqual(lim.attrmax[i] ?? 0);
      });
      const b = initialAttributes(ctxFor(fresh(), seed), r, race);
      [b.str, b.int, b.wis, b.dex, b.con, b.cha].forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(lim.attrmin[i] ?? 0);
        expect(v).toBeLessThanOrEqual(lim.attrmax[i] ?? 0);
      });
    }
  });

  test.each(PAIRS)('%s %s: newhp() and newpw() at level 0 and 1..30', (r, race) => {
    const role = ROLES_TAB[r];
    const rc = RACES_TAB[race];
    const s = fresh();
    setRoleRaceForTest(s, r, race);
    const rnd = (n: number) => (n > 0 ? [1, n] : [0, 0]);
    for (let seed = 1; seed <= 10; seed++) {
      const ctx = ctxFor(s, seed);
      const hp0 = newhp(ctx, 0, 18);
      const [a1, b1] = rnd(role.hpadv.inrnd);
      const [a2, b2] = rnd(rc.hpadv.inrnd);
      const base = role.hpadv.infix + rc.hpadv.infix;
      expect(hp0).toBeGreaterThanOrEqual(Math.max(base + (a1 ?? 0) + (a2 ?? 0), 1));
      expect(hp0).toBeLessThanOrEqual(Math.max(base + (b1 ?? 0) + (b2 ?? 0), 1));
      const en0 = newpw(ctx, 0, 18);
      const [c1, d1] = rnd(role.enadv.inrnd);
      const [c2, d2] = rnd(rc.enadv.inrnd);
      const ebase = role.enadv.infix + rc.enadv.infix;
      expect(en0).toBeGreaterThanOrEqual(Math.max(ebase + (c1 ?? 0) + (c2 ?? 0), 1));
      expect(en0).toBeLessThanOrEqual(Math.max(ebase + (d1 ?? 0) + (d2 ?? 0), 1));
      for (let lvl = 1; lvl < 30; lvl++) {
        const lo = lvl < role.xlev;
        const fix = lo ? role.hpadv.lofix + rc.hpadv.lofix : role.hpadv.hifix + rc.hpadv.hifix;
        const rr = lo ? [role.hpadv.lornd, rc.hpadv.lornd] : [role.hpadv.hirnd, rc.hpadv.hirnd];
        const min = fix + rr.filter((n) => n > 0).length + 1; // Con 15: +1
        const max = fix + rr.reduce((x, y) => x + y, 0) + 1;
        const hp = newhp(ctx, lvl, 15);
        expect(hp, `${r} ${race} hp ${lvl}`).toBeGreaterThanOrEqual(Math.max(min, 1));
        expect(hp, `${r} ${race} hp ${lvl}`).toBeLessThanOrEqual(Math.max(max, 1));
        // energy: enermod(rn1(Wis / 2 + rnd parts, fix parts)) at Wis 12
        const efix = lo ? role.enadv.lofix + rc.enadv.lofix : role.enadv.hifix + rc.enadv.hifix;
        const ernd =
          6 + (lo ? role.enadv.lornd + rc.enadv.lornd : role.enadv.hirnd + rc.enadv.hirnd);
        const en = newpw(ctx, lvl, 12);
        expect(en, `${r} ${race} en ${lvl}`).toBeGreaterThanOrEqual(Math.max(enermod(r, efix), 1));
        expect(en, `${r} ${race} en ${lvl}`).toBeLessThanOrEqual(
          Math.max(enermod(r, efix + ernd - 1), 1),
        );
      }
    }
  });

  test('enermod() by role', () => {
    expect(ROLE_ORDER.map((r) => enermod(r, 8))).toEqual([
      8, 6, 8, 12, 12, 8, 16, 8, 8, 8, 8, 6, 16,
    ]);
  });

  test('a Wizard starts with 4 + 1d3 + 2 (elf) energy, a dwarf Valkyrie with 1 and 18 hp', () => {
    const s = fresh();
    setRoleRaceForTest(s, 'wizard', 'elf');
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) seen.add(newpw(ctxFor(s, seed), 0, 10));
    expect([...seen].sort()).toEqual([7, 8, 9]);
    setRoleRaceForTest(s, 'valkyrie', 'dwarf');
    expect(newpw(ctxFor(s, 1), 0, 10)).toBe(1);
    expect(newhp(ctxFor(s, 1), 0, 10)).toBe(18);
  });

  test('race attribute limits: an elf cannot raise Str above 18, a gnome Int to 19', () => {
    const s = levelSetup();
    setRoleRaceForTest(s.state, 'wizard', 'elf');
    const a = getPlayer(s.state).c.attributes;
    if (!a) throw new Error('no attributes');
    a.str = 18;
    a.int = 18;
    const ctx = ctxFor(s.state, 1);
    expect(adjattrib(ctx, 'str', 1, false)).toBe(false);
    expect(a.str).toBe(18);
    expect(adjattrib(ctx, 'int', 1, false)).toBe(true);
    expect(a.int).toBe(19);
    setRoleRaceForTest(s.state, 'wizard', 'gnome');
    expect(adjattrib(ctx, 'int', 1, false)).toBe(false);
    expect(a.int).toBe(19);
  });

  test('a Wizard casts by Int with spelbase 1; a Knight has no metal armor penalty for clerical', () => {
    const s = levelSetup();
    for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
    const hero = getPlayer(s.state);
    if (!hero.c.attributes) throw new Error('no attributes');
    hero.c.attributes.int = 7;
    hero.c.attributes.wis = 18;
    hero.c.experience = { level: 1, points: 0 };
    setRoleRaceForTest(s.state, 'wizard', 'human');
    // force bolt, unskilled: chance 11 * 7 / 2 + 15 = 53; 53 * (20 - 1) / 15 - 1 = 66
    expect(percentSuccess(s.state, defs, 'nh:spellbook_of_force_bolt')).toBe(66);
    // the Knight: plate mail would add spelarmr 9, but not to a clerical spell
    setRoleRaceForTest(s.state, 'knight', 'human');
    hero.c.attributes.wis = 18;
    hero.c.experience = { level: 14, points: 0 };
    // remove curse (level 3, restricted): 99 - isqrt(4700) = 31; splcaster 8 - 2 (healing bonus)
    const without = percentSuccess(s.state, defs, 'nh:spellbook_of_remove_curse');
    expect(without).toBe(22);
    const plate = s.carry('nh:plate_mail');
    const item = s.state.entities[String(plate)]?.c.item;
    if (item) item.equipped = 'body';
    expect(percentSuccess(s.state, defs, 'nh:spellbook_of_remove_curse')).toBe(without);
    expect(percentSuccess(s.state, defs, 'nh:spellbook_of_force_bolt')).toBeLessThan(
      (() => {
        if (item) item.equipped = null;
        const v = percentSuccess(s.state, defs, 'nh:spellbook_of_force_bolt');
        if (item) item.equipped = 'body';
        return v;
      })(),
    );
  });
});

describe('the default hero is the Valkyrie', () => {
  test('urole/urace without the seam; the seam switches them', () => {
    const s = fresh();
    expect([urole(s), urace(s)]).toEqual(['valkyrie', 'human']);
    setRoleRaceForTest(s, 'priest', 'elf');
    expect([urole(s), urace(s)]).toEqual(['priest', 'elf']);
    setRoleRaceForTest(s, null);
    expect([urole(s), urace(s)]).toEqual(['valkyrie', 'human']);
    // a player.role of `nh:<key>` is that role
    getPlayer(s).c.player = { role: 'nh:healer' as never };
    expect(urole(s)).toBe('healer');
  });

  test('her stats: Skill_V maximums, 16 hp, cold resistance', () => {
    const s = fresh(7);
    const hero = getPlayer(s);
    expect(hero.c.hp).toEqual({ cur: 16, max: 16 });
    expect(nhData({ state: s }).skillMax).toEqual(SKILL_TAB.valkyrie);
    expect(hero.c.props?.[P.COLD_RES]?.intrinsic).toBe(true);
    expect(Object.keys(s.modData['nh'] as object)).not.toContain('urole');
    expect(Object.keys(s.modData['nh'] as object)).not.toContain('urace');
  });

  test('initialAttributes() for the Valkyrie draws as before', () => {
    const s = fresh();
    const a = initialAttributes(ctxFor(s, 5));
    const b = initialAttributes(ctxFor(s, 5), 'valkyrie', 'human');
    expect(a).toEqual(b);
  });
});
