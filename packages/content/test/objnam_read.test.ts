// The wish parser: readobjnam() subset, makesingular(), name_to_monplus().
import { describe, expect, test } from 'vitest';
import {
  makesingular,
  messagesEn,
  nameToMon,
  readobjnam,
  wishNames,
  type WishSpec,
} from '../src/index';
import { defs, freshState } from './itemHelpers';

const state = freshState(1);
const names = wishNames(state, defs, messagesEn);
const parse = (s: string): WishSpec => {
  const r = readobjnam(s, names);
  if (r === null || r === 'nothing') throw new Error(`no spec for "${s}"`);
  return r;
};
/** The single type a description names. */
const typeOf = (s: string): string => {
  const w = parse(s).what;
  if (w.kind === 'type') return w.type;
  if (w.kind === 'types' && w.types.length === 1) return w.types[0] ?? '';
  throw new Error(`"${s}" is ${JSON.stringify(w)}`);
};

describe('readobjnam', () => {
  test('a count, a/an, BUC and enchantment', () => {
    const s = parse('2 blessed +3 daggers');
    expect([s.cnt, s.blessed, s.spe, s.spesgn]).toEqual([2, true, 3, 1]);
    expect(typeOf('2 blessed +3 daggers')).toBe('nh:dagger');
    const c = parse('a cursed -2 long sword');
    expect([c.cnt, c.iscursed, c.spe, c.spesgn]).toEqual([1, true, 2, -1]);
    expect(typeOf('an uncursed elven dagger')).toBe('nh:elven_dagger');
    expect(parse('an uncursed elven dagger').uncursed).toBe(true);
    // the last BUC word wins, as in the prefix loop
    const u = parse('blessed cursed dagger');
    expect([u.blessed, u.iscursed]).toEqual([false, true]);
    // nothing given: count 1, no sign
    expect([parse('dagger').cnt, parse('dagger').spesgn]).toEqual([1, 0]);
    // SPE_LIM
    expect(parse('+150 dagger').spe).toBe(99);
  });

  test('plurals: a plural without a count asks for 2', () => {
    expect(typeOf('daggers')).toBe('nh:dagger');
    expect(parse('daggers').cnt).toBe(2);
    expect(typeOf('3 knives')).toBe('nh:knife');
    expect(parse('3 knives').cnt).toBe(3);
    expect(typeOf('potions of healing')).toBe('nh:potion_of_healing');
    expect(parse('potions of healing').cnt).toBe(2);
    expect(typeOf('5 scrolls of identify')).toBe('nh:scroll_of_identify');
    expect(typeOf('pair of iron shoes')).toBe('nh:iron_shoes');
    expect(typeOf('leather gloves')).toBe('nh:leather_gloves');
  });

  test('"X of Y" names, "Y X", class words and actual names', () => {
    expect(typeOf('ring of free action')).toBe('nh:ring_of_free_action');
    expect(typeOf('cursed ring of aggravate monster')).toBe('nh:ring_of_aggravate_monster');
    expect(typeOf('wand of striking')).toBe('nh:wand_of_striking');
    expect(typeOf('striking wand')).toBe('nh:wand_of_striking');
    expect(typeOf('amulet of life saving')).toBe('nh:amulet_of_life_saving');
    expect(typeOf('life saving amulet')).toBe('nh:amulet_of_life_saving');
    expect(typeOf('amulet versus poison')).toBe('nh:amulet_versus_poison');
    expect(typeOf('spellbook of force bolt')).toBe('nh:spellbook_of_force_bolt');
    expect(typeOf('bag of holding')).toBe('nh:bag_of_holding');
    expect(typeOf('holding')).toBe('nh:bag_of_holding');
    expect(typeOf('Food Ration')).toBe('nh:food_ration');
    expect(typeOf('dwarven mattock')).toBe('nh:dwarvish_mattock');
    expect(typeOf('orcish helmet')).toBe('nh:orcish_helm');
    expect(typeOf('long-sword')).toBe('nh:long_sword');
    // a name shared by two classes is a weighted pick of both
    const healing = parse('healing').what;
    expect(healing).toEqual({
      kind: 'types',
      types: ['nh:potion_of_healing', 'nh:spellbook_of_healing'],
      xtra: 1,
    });
  });

  test('class names alone give a random object of the class', () => {
    expect(parse('ring').what).toEqual({ kind: 'class', cls: 'ring' });
    expect(parse('wand').what).toEqual({ kind: 'class', cls: 'wand' });
    expect(parse('2 potions').what).toEqual({ kind: 'class', cls: 'potion' });
    expect(parse('/').what).toEqual({ kind: 'class', cls: 'wand' });
    expect(parse('armor').what).toEqual({ kind: 'class', cls: 'armor' });
  });

  test('appearances and fixed descriptions name the type they belong to this game', () => {
    const potion = 'nh:potion_of_healing';
    const app = state.appearances[potion];
    expect(app).toBeDefined();
    const text = messagesEn[defs.appearance(app as never).nameKey] ?? '';
    expect(text.endsWith(' potion')).toBe(true);
    expect(typeOf(text)).toBe(potion);
    expect(typeOf(`blessed ${text.replace(' potion', ' potions')}`)).toBe(potion);
    expect(typeOf('crude dagger')).toBe('nh:orcish_dagger');
    expect(typeOf('hard shoes')).toBe('nh:iron_shoes');
    const scroll = state.appearances['nh:scroll_of_light'];
    const label = (messagesEn[defs.appearance(scroll as never).nameKey] ?? '').replace(
      'scroll labeled ',
      '',
    );
    expect(typeOf(`scroll labeled ${label.toLowerCase()}`)).toBe('nh:scroll_of_light');
  });

  test('a called name names its type', () => {
    const s = freshState(2);
    (s.modData['nh'] as Record<string, unknown>)['called'] = { 'nh:wand_of_fire': 'zappy' };
    const n = wishNames(s, defs, messagesEn);
    expect(readobjnam('wand called zappy', n)).toMatchObject({
      what: { kind: 'types', types: ['nh:wand_of_fire'] },
    });
  });

  test('gold, holy water, erosion and charges', () => {
    expect(parse('400 gold pieces')).toMatchObject({ what: { kind: 'gold' }, cnt: 400 });
    expect(parse('gold pieces')).toMatchObject({ what: { kind: 'gold' }, cnt: 2 });
    expect(parse('$')).toMatchObject({ what: { kind: 'gold' }, cnt: 1 });
    // "holy" is a BUC word; "water" is the potion's name
    expect(parse('3 holy water')).toMatchObject({
      what: { kind: 'types', types: ['nh:potion_of_water'] },
      blessed: true,
      cnt: 3,
    });
    expect(parse('potion of unholy water')).toMatchObject({
      what: { kind: 'type', type: 'nh:potion_of_water' },
      iscursed: true,
    });
    expect(parse('rustproof +2 long sword')).toMatchObject({ erodeproof: true, spe: 2 });
    expect(parse('very rusty thoroughly corroded long sword')).toMatchObject({
      eroded: 2,
      eroded2: 3,
    });
    expect(parse('wand of striking (2:8)')).toMatchObject({ rechrg: 2, spe: 8, spesgn: 1 });
    expect(parse('locked chest')).toMatchObject({ locked: true });
  });

  test('corpses name their monster', () => {
    expect(parse('newt corpse')).toMatchObject({
      what: { kind: 'types', types: ['nh:corpse'] },
      mon: 'nh:newt',
    });
    expect(parse('2 corpses of a jackal')).toMatchObject({ mon: 'nh:jackal', cnt: 2 });
    expect(parse('corpse').mon).toBeNull();
  });

  test('unknown names are null; "nothing" declines; empty is a random object', () => {
    expect(readobjnam('grimoire of dancing', names)).toBeNull();
    expect(readobjnam('ring of teleportation', names)).not.toBeNull(); // a random ring
    expect(readobjnam('xyzzy', names)).toBeNull();
    expect(readobjnam('newt', names)).toBeNull();
    expect(readobjnam('nothing', names)).toBe('nothing');
    expect(readobjnam('  None ', names)).toBe('nothing');
    expect(readobjnam('', names)).toMatchObject({ what: { kind: 'random' } });
  });
});

describe('makesingular', () => {
  test.each([
    ['daggers', 'dagger'],
    ['knives', 'knife'],
    ['potions of healing', 'potion of healing'],
    ['boxes', 'box'],
    ['rubies', 'ruby'],
    ['wolves', 'wolf'],
    ['boots', 'boots'],
    ['iron shoes', 'iron shoes'],
    ['aklys', 'aklys'],
    ['dwarvish mattocks', 'dwarvish mattock'],
    ['scrolls labeled foo', 'scroll labeled foo'],
    ['watchmen', 'watchman'],
    ['glass', 'glass'],
  ])('%s -> %s', (plural, singular) => expect(makesingular(plural)).toBe(singular));
});

describe('name_to_mon', () => {
  test('exact, plural and prefixed names', () => {
    const m = names.monsters;
    expect(nameToMon(m, 'newt')).toBe('nh:newt');
    expect(nameToMon(m, 'Newts')).toBe('nh:newt');
    expect(nameToMon(m, 'a jackal')).toBe('nh:jackal');
    expect(nameToMon(m, 'jackal corpse')).toBe('nh:jackal');
    expect(nameToMon(m, 'newtish')).toBeNull();
  });
});
