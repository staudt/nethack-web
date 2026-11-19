// m22 step 4: alignment and gods. Every role's pantheon (a Priest's drawn from another role's),
// the starting alignment and record (initrecord), the original alignment a helm of opposite
// alignment returns to, holy and unholy water for lawful, chaotic and undead heroes, and the god
// names in prayer, priests and the wrath that kills. Other roles come through `playAs()` (helpers.ts) or a new game's character.
// ref: src/role.c role_init() (pantheon); src/pray.c align_gname(), align_gtitle(),
// fry_by_god(); src/priest.c priestname(); src/attrib.c newhp(); src/u_init.c u_init_misc();
// src/potion.c peffect_water()
import {
  createEngine,
  createRng,
  getPlayer,
  seedRng,
  type Buc,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  ROLES_TAB,
  ROLE_ORDER,
  alignGname,
  alignGtitle,
  initPantheon,
  pantheon,
  setU,
  startAlign,
  uInitAlign,
  uState,
  ualignBase,
  vanillaMod,
  type RaceKey,
  type RoleKey,
  raceDefId,
  roleDefId,
} from '../src/index';
import { godSuffix } from '../src/gods';
import { messagesEn } from '../src/messages.en';
import { priestName, type Epri } from '../src/epri';
import { mksobj } from '../src/items';
import { polymon } from '../src/polyself';
import { setUlycn, ulycn } from '../src/werestate';
import { engine, itemOf, levelSetup, obj, plainBottles, plainKit, render } from './itemHelpers';
import { playAs } from './helpers';

const BASE = engine.newGame({ seed: 1 }).state;
const fresh = (): GameState => structuredClone(BASE);
const ctxOf = (state: GameState, seed = 1): Pick<Ctx, 'state' | 'rng'> => ({
  state,
  rng: createRng(seedRng(seed)),
});
const god = (state: GameState, a: number): string =>
  render({ key: 'look.altar', params: { god: alignGname(state, a), align: '' } }).replace(
    /^altar to (.*) \(\)$/,
    '$1',
  );
const title = (state: GameState, a: number): string =>
  render({ key: 'pray.begin', params: { god: alignGtitle(state, a) } }).replace(
    /^You begin praying to (.*)\.$/,
    '$1',
  );

/** C's roles[] gods: lawful, neutral, chaotic ('_' marks a goddess). ref: src/role.c */
const C_GODS: Record<Exclude<RoleKey, 'priest'>, [string, string, string]> = {
  archeologist: ['Quetzalcoatl', 'Camaxtli', 'Huhetotl'],
  barbarian: ['Mitra', 'Crom', 'Set'],
  caveman: ['Anu', '_Ishtar', 'Anshar'],
  healer: ['_Athena', 'Hermes', 'Poseidon'],
  knight: ['Lugh', '_Brigit', 'Manannan Mac Lir'],
  monk: ['Shan Lai Ching', 'Chih Sung-tzu', 'Huan Ti'],
  rogue: ['Issek', 'Mog', 'Kos'],
  ranger: ['Mercury', '_Venus', 'Mars'],
  samurai: ['_Amaterasu Omikami', 'Raijin', 'Susanowo'],
  tourist: ['Blind Io', '_The Lady', 'Offler'],
  valkyrie: ['Tyr', 'Odin', 'Loki'],
  wizard: ['Ptah', 'Thoth', 'Anhur'],
};

describe('pantheons (role.c roles[], pray.c align_gname/align_gtitle)', () => {
  test("each role's gods and goddesses by alignment, Moloch for the unaligned", () => {
    for (const role of ROLE_ORDER) {
      if (role === 'priest') continue;
      const s = fresh();
      playAs(s, role);
      const want = C_GODS[role];
      const got = [1, 0, -1].map((a) => (title(s, a) === 'goddess' ? '_' : '') + god(s, a));
      expect(got, role).toEqual(want);
      expect(god(s, -128), role).toBe('Moloch');
      expect(title(s, -128), role).toBe('god');
    }
  });

  test('the default Valkyrie keeps Tyr, Odin and Loki and stores no pantheon', () => {
    const s = fresh();
    expect([1, 0, -1].map((a) => god(s, a))).toEqual(['Tyr', 'Odin', 'Loki']);
    expect(pantheon(s)).toBe('valkyrie');
    expect((s.modData['nh'] as Record<string, unknown>)['pantheon']).toBeUndefined();
    initPantheon(ctxOf(s));
    expect((s.modData['nh'] as Record<string, unknown>)['pantheon']).toBeUndefined();
  });

  test("a Priest's pantheon is another role's, drawn at new game and kept through a save", () => {
    const seen = new Set<RoleKey>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = fresh();
      playAs(s, 'priest');
      initPantheon(ctxOf(s, seed));
      const p = pantheon(s);
      expect(p).not.toBe('priest');
      expect(ROLES_TAB[p].gods).not.toBeNull();
      expect((s.modData['nh'] as Record<string, unknown>)['pantheon']).toBe(p);
      seen.add(p);
      // a save is JSON: the pantheon (and so the gods) come back unchanged
      const loaded = JSON.parse(JSON.stringify(s)) as GameState;
      expect([1, 0, -1].map((a) => god(loaded, a))).toEqual(
        C_GODS[p as Exclude<RoleKey, 'priest'>].map((g) => g.replace(/^_/, '')),
      );
    }
    // randrole(): any of the twelve other roles
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  test("a Priest without a drawn pantheon (playAs() after new game) uses the first role's", () => {
    const s = fresh();
    playAs(s, 'priest');
    expect(pantheon(s)).toBe('archeologist');
    expect(god(s, 1)).toBe('Quetzalcoatl');
  });

  test('temple priests and the wrath that kills are named for the pantheon', () => {
    const s = fresh();
    playAs(s, 'healer');
    const priest = (a: number): string =>
      render(
        { key: 'x', params: { m: priestName(s, { shralign: a } as Epri) } },
        { ...messagesEn, x: 'You kill {m|the}!' },
      );
    expect([1, 0, -1, -128].map(priest)).toEqual([
      'You kill the priest of Athena!',
      'You kill the priest of Hermes!',
      'You kill the priest of Poseidon!',
      'You kill the priest of Moloch!',
    ]);
    expect(render(`@killer.wrath_${godSuffix(s, -1)}`)).toBe('the wrath of Poseidon');
    expect(render(`@killer.wrath_${godSuffix(fresh(), 0)}`)).toBe('the wrath of Odin');
  });
});

/** A new game of `role` and `race` (their first alignment and gender that go together). */
const charEngine = createEngine([vanillaMod]);
const newGameAs = (role: RoleKey, race: RaceKey, seed: number): GameState =>
  charEngine.newGame({ seed, character: { role: roleDefId(role), race: raceDefId(race) } }).state;

describe('the starting alignment (attrib.c newhp(), u_init.c u_init_misc())', () => {
  test("a new game's u_init hook sets the alignment and record and draws a Priest's gods", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const k = newGameAs('knight', 'human', seed);
      expect(uState(k)).toMatchObject({ alignType: 1, alignRecord: 10, alignBase: 1 });
      expect(pantheon(k)).toBe('knight');
      const p = newGameAs('priest', 'elf', seed);
      expect(uState(p)).toMatchObject({ alignType: -1, alignRecord: 0, alignBase: -1 });
      expect(pantheon(p)).not.toBe('priest');
      expect((p.modData['nh'] as Record<string, unknown>)['pantheon']).toBe(pantheon(p));
    }
    // the default game is the neutral Valkyrie, as before
    expect(uState(engine.newGame({ seed: 1 }).state)).toMatchObject({
      alignType: 0,
      alignRecord: 0,
    });
  });

  test("the role's first alignment its race allows, and the role's initrecord", () => {
    const cases: [RoleKey, Parameters<typeof startAlign>[1], number, number][] = [
      ['archeologist', 'human', 1, 10],
      ['archeologist', 'dwarf', 1, 10],
      ['barbarian', 'orc', -1, 10],
      ['caveman', 'gnome', 0, 0],
      ['knight', 'human', 1, 10],
      ['priest', 'elf', -1, 0],
      ['wizard', 'orc', -1, 0],
      ['tourist', 'human', 0, 0],
      ['valkyrie', 'dwarf', 1, 0],
      ['valkyrie', 'human', 0, 0],
    ];
    for (const [role, race, align, record] of cases) {
      const s = fresh();
      playAs(s, role, race);
      uInitAlign(ctxOf(s));
      const u = uState(s);
      expect([role, race, u.alignType, u.alignRecord, ualignBase(s)]).toEqual([
        role,
        race,
        align,
        record,
        align,
      ]);
      // every allowed alignment is one the race allows too
      expect(ROLES_TAB[role].aligns).toContain(align);
    }
  });

  test('a lawful Archeologist starts with record 10 and stays lawful through a save', () => {
    const s = fresh();
    playAs(s, 'archeologist', 'human');
    uInitAlign(ctxOf(s));
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(uState(loaded)).toMatchObject({ alignType: 1, alignRecord: 10, alignBase: 1 });
  });

  test("the neutral Valkyrie's new game writes nothing (record 0 is the default)", () => {
    const s = fresh();
    const before = JSON.stringify(s.modData);
    uInitAlign(ctxOf(s));
    expect(JSON.stringify(s.modData)).toBe(before);
    expect(uState(s)).toMatchObject({ alignType: 0, alignRecord: 0 });
    expect(uState(s).alignBase).toBeUndefined();
    expect(ualignBase(s)).toBe(0);
  });
});

type S = ReturnType<typeof levelSetup>;
const ROOM = ['.......', '...@...', '.......'];
function room(): S {
  const s = levelSetup(ROOM);
  plainKit(s.state);
  return s;
}
const hero = (s: S) => getPlayer(s.state);
const drink = (s: S, buc: Buc): StepResult => {
  plainBottles(s.state, 'nh:potion_of_water');
  const id = mksobj(s.ctx, obj('nh:potion_of_water'), { init: false, carriedBy: s.state.playerId });
  itemOf(s.state, id).buc = buc;
  return s.mod('nh:quaff', { item: id });
};
const quaff = (s: S, buc: Buc): string[] => s.text(drink(s, buc));

describe('holy and unholy water (potion.c peffect_water())', () => {
  test('holy water burns a chaotic hero and cures her lycanthropy; unholy water heals her', () => {
    const s = room();
    setU(s.ctx, { alignType: -1 });
    setUlycn(s.ctx, 'nh:werejackal' as DefId);
    hero(s).c.hp = { cur: 100, max: 500 };
    const r = drink(s, 'blessed');
    expect(s.text(r)).toContain('This burns like acid!');
    // "Your affinity to werejackals disappears!"
    expect(r.events).toContainEqual({
      type: 'msg',
      key: 'potion.water_affinity',
      params: { mon: '@nh:werejackal' },
    });
    expect(ulycn(s.state)).toBeNull();
    const hp = hero(s).c.hp!.cur;
    expect(hp).toBeGreaterThanOrEqual(100 - 12);
    expect(hp).toBeLessThanOrEqual(100 - 2);
    const out2 = quaff(s, 'cursed');
    expect(out2).toContain('You feel quite proud of yourself.');
    expect(hero(s).c.hp!.cur).toBeGreaterThanOrEqual(hp + 2);
    expect(hero(s).c.hp!.cur).toBeLessThanOrEqual(hp + 12);
  });

  test('unholy water burns a lawful hero; holy water fills her with awe', () => {
    const s = room();
    setU(s.ctx, { alignType: 1 });
    hero(s).c.hp = { cur: 100, max: 500 };
    expect(quaff(s, 'cursed')).toContain('This burns like acid!');
    const hp = hero(s).c.hp!.cur;
    expect(hp).toBeLessThanOrEqual(98);
    expect(hp).toBeGreaterThanOrEqual(88);
    expect(quaff(s, 'blessed')).toContain('You feel full of awe.');
    // no damage (her turn may regenerate a point)
    expect(hero(s).c.hp!.cur).toBeGreaterThanOrEqual(hp);
    expect(hero(s).c.hp!.cur).toBeLessThanOrEqual(hp + 1);
  });

  test('unholy water can kill a lawful hero: "killed by a potion of unholy water"', () => {
    const s = room();
    setU(s.ctx, { alignType: 1 });
    hero(s).c.hp = { cur: 1, max: 10 };
    const out = quaff(s, 'cursed');
    expect(out).toContain('This burns like acid!');
    expect(out).toContain('You die...');
    expect(s.state.gameOver).toMatchObject({ kind: 'died', killer: '@killer.potion.unholy_water' });
  });

  test('holy water burns a neutral hero in an undead form', () => {
    const s = room();
    s.step({ type: 'wait' });
    polymon(s.ctx as unknown as Ctx, 'nh:human_zombie' as DefId, false);
    hero(s).c.hp = { cur: 100, max: 500 };
    expect(quaff(s, 'blessed')).toContain('This burns like acid!');
    expect(hero(s).c.hp!.cur).toBeLessThan(100);
  });

  test("the neutral Valkyrie's texts are unchanged", () => {
    const s = room();
    expect(quaff(s, 'blessed')).toContain('You feel full of awe.');
    expect(quaff(s, 'cursed')).toContain('You feel full of dread.');
  });
});

const texts = (rs: StepResult[]): string[] =>
  rs.flatMap((r) => r.events).flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));
function pray(s: S): StepResult[] {
  const ask = s.step({ type: 'mod', action: 'nh:pray' as DefId });
  return [ask, s.step({ type: 'answer', promptId: ask.prompt!.id, value: true })];
}

describe('prayer names the pantheon (pray.c)', () => {
  test('a chaotic Archeologist prays to Huhetotl, a lawful one to Quetzalcoatl', () => {
    for (const [align, want] of [
      [-1, 'Huhetotl'],
      [1, 'Quetzalcoatl'],
    ] as const) {
      const s = room();
      playAs(s.state, 'archeologist');
      setU(s.ctx, { alignType: align, alignRecord: 10, ublesscnt: 0 }); // a good prayer
      const t = texts(pray(s));
      expect(t).toContain(`You begin praying to ${want}.`);
      expect(t.some((m) => m.startsWith(`You feel that ${want} is `))).toBe(true);
    }
  });

  test('the Valkyrie still prays to Odin', () => {
    const s = room();
    expect(texts(pray(s))).toContain('You begin praying to Odin.');
  });
});

describe('the helm of opposite alignment returns her to her original alignment', () => {
  test('a lawful hero turns chaotic with it on and lawful again with it off', () => {
    const s = room();
    for (const id of Object.keys(s.state.entities)) {
      const it = s.state.entities[id]?.c.item;
      if (it?.carriedBy === s.state.playerId && it.equipped === 'helm') it.equipped = null;
    }
    playAs(s.state, 'archeologist', 'human');
    uInitAlign(s.ctx);
    const helm: EntityId = s.carry('nh:helm_of_opposite_alignment');
    s.text(s.mod('nh:wear', { item: helm }));
    expect(uState(s.state).alignType).toBe(-1);
    for (let i = 0; i < 10 && hero(s).c.helpless; i++) s.step({ type: 'wait' });
    itemOf(s.state, helm).buc = 'uncursed';
    expect(s.text(s.mod('nh:takeoff', { item: helm }))).toContain(
      'Your mind is back in sync with your body.',
    );
    expect(uState(s.state).alignType).toBe(1);
    expect(ualignBase(s.state)).toBe(1);
  });
});
