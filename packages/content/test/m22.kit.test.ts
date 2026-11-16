// m22 step 3: the starting inventory of every role and race (u_init.c ini_inv() and its
// helpers, the extras, the race substitutions), the known objects, starting spells and gold, the
// carry boost, skill_init() and the role's pet. Other roles are reached through the test seam;
// each check runs over many RNG seeds and asserts outcomes, never one lucky seed.
// ref: src/u_init.c u_init_role(), u_init_race(), ini_inv(), ini_inv_mkobj_filter(),
// ini_inv_adjust_obj(), ini_inv_use_obj(), knows_class(), u_init_carry_attr_boost(),
// u_init_skills_discoveries(); src/weapon.c skill_init(); src/dog.c makedog(), pet_type()
import {
  createEngine,
  createRng,
  getPlayer,
  inventoryOf,
  seedRng,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  EXTRAS,
  INV_SUBS,
  KITS,
  ROLES_TAB,
  ROLE_ORDER,
  SKILL_TAB,
  finalScore,
  setRoleRaceForTest,
  uInitInventoryAttrs,
  uInitSkillsDiscoveries,
  umoney0,
  vanillaMod,
  type RaceKey,
  type RoleKey,
} from '../src/index';
import { makedog } from '../src/dog';
import { isWornSaddle, nhData, wornSaddle } from '../src/items';
import { relobj } from '../src/mongear';
import { isKnown } from '../src/o_init';
import { P, hasProp } from '../src/props';
import { knownSpells } from '../src/spell';
import { roleSpellSkill } from '../src/spellcalc';
import { skillLevel } from '../src/skills';
import { invWeight } from '../src/stats';
import { pwOf } from '../src/uenergy';
import { attrMax } from '../src/attrstate';
import { swapWep } from '../src/wield';
import { ELF_INSTRUMENTS, JAPANESE_ITEMS, RACE_KNOWS } from '../src/kittab';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'kit',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'kit:run',
      labelKey: 'kit',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);
const defs = eng.registry;
const BASE = eng.newGame({ seed: 1 }).state;

function run(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  eng.step(state, { type: 'mod', action: 'kit:run' as DefId });
}

interface Kit {
  s: GameState;
  inv: Entity[];
}

/** The starting inventory of `role` and `race` made with the RNG seeded by `seed`. */
function kitFor(role: RoleKey, race: RaceKey, seed: number, state?: GameState): Kit {
  const s = state ?? structuredClone(BASE);
  setRoleRaceForTest(s, role, race);
  s.discovered = [];
  delete (nhData({ state: s }) as { spells?: unknown }).spells;
  run(s, (c) => {
    const ctx = { ...c, rng: createRng(seedRng(seed)) } as Ctx;
    uInitInventoryAttrs(ctx, s.playerId, role, race);
    uInitSkillsDiscoveries(ctx, s.playerId, role);
  });
  return { s, inv: inventoryOf(s, s.playerId) };
}

const of = (k: Kit, id: string): Entity[] => k.inv.filter((o) => o.def === id);
const qty = (k: Kit, id: string): number =>
  of(k, id).reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0);
const one = (k: Kit, id: string): Entity => {
  const all = of(k, id);
  expect(all, id).toHaveLength(1);
  return all[0]!;
};
const slotOf = (k: Kit, id: string): string | null => one(k, id).c.item?.equipped ?? null;
const swapOf = (k: Kit): string | undefined => swapWep({ state: k.s })?.def;
const PAIRS: [RoleKey, RaceKey][] = ROLE_ORDER.flatMap((r) =>
  ROLES_TAB[r].races.map((race): [RoleKey, RaceKey] => [r, race]),
);
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('the tables (u_init.c)', () => {
  test('every kit, extra and substitute names an object', () => {
    const lines = [...Object.values(KITS).flat(), ...Object.values(EXTRAS).flat()];
    for (const t of lines) if (t.id) expect(defs.isObject(t.id), t.id).toBe(true);
    for (const s of INV_SUBS) {
      expect(defs.isObject(s.from), s.from).toBe(true);
      expect(defs.isObject(s.to), s.to).toBe(true);
    }
    for (const id of [...ELF_INSTRUMENTS, ...JAPANESE_ITEMS, ...Object.values(RACE_KNOWS).flat()])
      expect(defs.isObject(id), id).toBe(true);
  });

  test('the kits as u_init.c has them', () => {
    expect(KITS.valkyrie.map((t) => [t.id, t.spe, t.qmin, t.qmax, t.bless])).toEqual([
      ['nh:spear', 1, 1, 1, 'undef'],
      ['nh:dagger', 0, 1, 1, 'undef'],
      ['nh:small_shield', 3, 1, 1, 'undef'],
      ['nh:food_ration', 0, 1, 1, 0],
    ]);
    expect(KITS.wizard.map((t) => t.id ?? t.cls)).toEqual([
      'nh:quarterstaff',
      'nh:cloak_of_magic_resistance',
      'wand',
      'ring',
      'potion',
      'scroll',
      'nh:spellbook_of_force_bolt',
      'spellbook',
      'nh:magic_marker',
    ]);
    expect(INV_SUBS).toHaveLength(25);
  });
});

describe('each role, human', () => {
  test.each(SEEDS)('Archeologist (seed %i)', (seed) => {
    const k = kitFor('archeologist', 'human', seed);
    expect(one(k, 'nh:bullwhip').c.item).toMatchObject({ spe: 2, equipped: 'weapon' });
    expect(slotOf(k, 'nh:leather_jacket')).toBe('body');
    expect(slotOf(k, 'nh:fedora')).toBe('helm');
    expect(qty(k, 'nh:food_ration')).toBeGreaterThanOrEqual(3);
    expect(qty(k, 'nh:food_ration')).toBeLessThanOrEqual(6);
    expect(swapOf(k)).toBe('nh:pick_axe');
    expect(one(k, 'nh:touchstone').c.item).toMatchObject({ quantity: 1, buc: 'uncursed' });
    one(k, 'nh:tinning_kit');
    one(k, 'nh:sack');
    expect(k.s.discovered).toEqual(expect.arrayContaining(['nh:sack', 'nh:touchstone']));
    expect(skillLevel({ state: k.s }, 'whip')).toBe(2);
    expect(skillLevel({ state: k.s }, 'pick_axe')).toBe(2);
    expect(skillLevel({ state: k.s }, 'sling')).toBe(1); // the touchstone is ammo
  });

  test.each(SEEDS)('Barbarian (seed %i)', (seed) => {
    const k = kitFor('barbarian', 'human', seed);
    const w = k.inv.find((o) => o.c.item?.equipped === 'weapon')?.def;
    expect(['nh:two_handed_sword', 'nh:battle_axe']).toContain(w);
    expect(swapOf(k)).toBe(w === 'nh:battle_axe' ? 'nh:short_sword' : 'nh:axe');
    expect(slotOf(k, 'nh:ring_mail')).toBe('body');
    expect(k.s.discovered).toContain('nh:orcish_dagger'); // knows_class(WEAPON_CLASS)
    expect(k.s.discovered).not.toContain('nh:small_shield');
  });

  test.each(SEEDS)('Caveman (seed %i)', (seed) => {
    const k = kitFor('caveman', 'human', seed);
    expect(one(k, 'nh:club').c.item).toMatchObject({ spe: 1, equipped: 'weapon' });
    expect(swapOf(k)).toBe('nh:sling');
    // 10..20 flint stones, each mksobj()'s single or pair; 3 rocks of 6..11
    expect(qty(k, 'nh:flint_stone')).toBeGreaterThanOrEqual(10);
    expect(qty(k, 'nh:flint_stone')).toBeLessThanOrEqual(40);
    expect(qty(k, 'nh:rock')).toBeGreaterThanOrEqual(18);
    expect(qty(k, 'nh:rock')).toBeLessThanOrEqual(33);
    expect(of(k, 'nh:flint_stone').every((o) => o.c.item?.equipped === null)).toBe(true);
    expect(slotOf(k, 'nh:leather_armor')).toBe('body');
    expect(skillLevel({ state: k.s }, 'bare_handed')).toBe(2); // Master: knows her hands
  });

  test.each(SEEDS)('Healer (seed %i)', (seed) => {
    const k = kitFor('healer', 'human', seed);
    expect(slotOf(k, 'nh:scalpel')).toBe('weapon');
    expect(one(k, 'nh:leather_gloves').c.item).toMatchObject({ spe: 1, equipped: 'gloves' });
    expect(qty(k, 'nh:potion_of_healing')).toBe(4);
    expect(qty(k, 'nh:potion_of_extra_healing')).toBe(4);
    expect(qty(k, 'nh:apple')).toBeGreaterThanOrEqual(5);
    one(k, 'nh:stethoscope');
    one(k, 'nh:wand_of_sleep');
    const gold = qty(k, 'nh:gold_piece');
    expect(gold).toBeGreaterThanOrEqual(1001);
    expect(gold).toBeLessThanOrEqual(2000);
    expect(umoney0(k.s)).toBe(gold);
    expect(knownSpells({ state: k.s }).map((s) => s.id)).toEqual([
      'nh:spellbook_of_healing',
      'nh:spellbook_of_extra_healing',
      'nh:spellbook_of_stone_to_flesh',
    ]);
    expect(of(k, 'nh:spellbook_of_healing')[0]?.c.item?.buc).toBe('blessed');
    expect(k.s.discovered).toContain('nh:potion_of_full_healing');
    expect(skillLevel({ state: k.s }, 'healing_spell')).toBe(2);
    expect(pwOf(k.s).uenmax).toBeGreaterThanOrEqual(5);
  });

  test.each(SEEDS)('Knight (seed %i)', (seed) => {
    const k = kitFor('knight', 'human', seed);
    expect(one(k, 'nh:long_sword').c.item).toMatchObject({ spe: 1, equipped: 'weapon' });
    expect(swapOf(k)).toBe('nh:lance');
    expect(one(k, 'nh:ring_mail').c.item).toMatchObject({ spe: 1, equipped: 'body' });
    expect(slotOf(k, 'nh:helmet')).toBe('helm');
    expect(slotOf(k, 'nh:small_shield')).toBe('shield');
    expect(slotOf(k, 'nh:leather_gloves')).toBe('gloves');
    expect(qty(k, 'nh:apple')).toBeGreaterThanOrEqual(10);
    expect(qty(k, 'nh:carrot')).toBeGreaterThanOrEqual(10);
    expect(hasProp(getPlayer(k.s), P.JUMPING)).toBe(true);
    expect(k.s.discovered).toContain('nh:glaive'); // knights know polearms
    expect(skillLevel({ state: k.s }, 'riding')).toBe(2);
    expect(skillLevel({ state: k.s }, 'lance')).toBe(2);
  });

  test.each(SEEDS)('Monk (seed %i)', (seed) => {
    const k = kitFor('monk', 'human', seed);
    expect(one(k, 'nh:leather_gloves').c.item).toMatchObject({ spe: 2, equipped: 'gloves' });
    expect(one(k, 'nh:robe').c.item).toMatchObject({ spe: 1, equipped: 'cloak' });
    expect(k.inv.some((o) => o.c.item?.equipped === 'weapon')).toBe(false);
    const scrolls = k.inv.filter((o) => defs.object(o.def).class === 'scroll');
    expect(scrolls.reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0)).toBe(1);
    expect(scrolls[0]?.def).not.toBe('nh:scroll_of_enchant_weapon');
    expect(qty(k, 'nh:potion_of_healing')).toBe(3);
    expect(qty(k, 'nh:orange')).toBeGreaterThanOrEqual(5);
    expect(qty(k, 'nh:fortune_cookie')).toBeGreaterThanOrEqual(3);
    const spells = knownSpells({ state: k.s }).map((s) => s.id);
    expect(spells).toHaveLength(1);
    expect([
      'nh:spellbook_of_healing',
      'nh:spellbook_of_protection',
      'nh:spellbook_of_confuse_monster',
    ]).toContain(spells[0]);
    expect(k.s.discovered).toContain('nh:shuriken');
    expect(skillLevel({ state: k.s }, 'bare_handed')).toBe(2); // Grand Master
    expect(skillLevel({ state: k.s }, 'healing_spell')).toBe(2);
    expect(pwOf(k.s).uenmax).toBeGreaterThanOrEqual(5);
  });

  test.each(SEEDS)('Priest (seed %i)', (seed) => {
    const k = kitFor('priest', 'human', seed);
    expect(one(k, 'nh:mace').c.item).toMatchObject({ spe: 1, buc: 'blessed', equipped: 'weapon' });
    expect(slotOf(k, 'nh:robe')).toBe('cloak');
    expect(slotOf(k, 'nh:small_shield')).toBe('shield');
    expect(one(k, 'nh:potion_of_water').c.item).toMatchObject({ quantity: 4, buc: 'blessed' });
    one(k, 'nh:clove_of_garlic');
    one(k, 'nh:sprig_of_wolfsbane');
    expect(k.s.discovered).toContain('nh:potion_of_water');
    const books = k.inv.filter((o) => defs.object(o.def).class === 'spellbook');
    expect(books).toHaveLength(2); // two different books
    const levels = books.map((o) => defs.object(o.def).spellbook?.level ?? 0);
    expect(levels).toContain(1);
    for (const b of books) {
      expect(SKILL_TAB.priest[roleSpellSkill(b.def, 'priest')]).toBeDefined();
      expect(defs.object(b.def).spellbook?.level).toBeLessThanOrEqual(3);
    }
    expect(knownSpells({ state: k.s })).toHaveLength(2);
    expect(skillLevel({ state: k.s }, 'cleric_spell')).toBe(2);
  });

  test.each(SEEDS)('Ranger (seed %i)', (seed) => {
    const k = kitFor('ranger', 'human', seed);
    expect(one(k, 'nh:dagger').c.item).toMatchObject({ spe: 1, equipped: 'weapon' });
    expect(swapOf(k)).toBe('nh:bow');
    const arrows = of(k, 'nh:arrow');
    const plus2 = arrows.find((o) => o.c.item?.spe === 2)?.c.item?.quantity ?? 0;
    const plus0 = arrows.find((o) => o.c.item?.spe === 0)?.c.item?.quantity ?? 0;
    expect(plus2).toBeGreaterThanOrEqual(50);
    expect(plus2).toBeLessThanOrEqual(59);
    expect(plus0).toBeGreaterThanOrEqual(30);
    expect(plus0).toBeLessThanOrEqual(39);
    expect(one(k, 'nh:cloak_of_displacement').c.item).toMatchObject({ spe: 2, equipped: 'cloak' });
    expect(qty(k, 'nh:cram_ration')).toBeGreaterThanOrEqual(4);
    // launchers, ammo and spears only
    expect(k.s.discovered).toEqual(expect.arrayContaining(['nh:elven_arrow', 'nh:orcish_spear']));
    expect(k.s.discovered).not.toContain('nh:orcish_short_sword');
    expect(skillLevel({ state: k.s }, 'bow')).toBe(2);
  });

  test.each(SEEDS)('Rogue (seed %i)', (seed) => {
    const k = kitFor('rogue', 'human', seed);
    expect(slotOf(k, 'nh:short_sword')).toBe('weapon');
    const daggers = one(k, 'nh:dagger').c.item;
    expect(daggers?.buc).toBe('uncursed');
    expect(daggers?.quantity).toBeGreaterThanOrEqual(6);
    expect(daggers?.quantity).toBeLessThanOrEqual(15);
    expect(swapOf(k)).toBe('nh:dagger');
    expect(one(k, 'nh:leather_armor').c.item).toMatchObject({ spe: 1, equipped: 'body' });
    one(k, 'nh:potion_of_sickness');
    one(k, 'nh:lock_pick');
    one(k, 'nh:sack');
    expect(qty(k, 'nh:gold_piece')).toBe(0);
    expect(k.s.discovered).toEqual(expect.arrayContaining(['nh:orcish_dagger', 'nh:sack']));
    expect(k.s.discovered).not.toContain('nh:orcish_short_sword');
  });

  test.each(SEEDS)('Samurai (seed %i)', (seed) => {
    const k = kitFor('samurai', 'human', seed);
    expect(slotOf(k, 'nh:katana')).toBe('weapon');
    expect(swapOf(k)).toBe('nh:short_sword');
    one(k, 'nh:yumi');
    expect(qty(k, 'nh:ya')).toBeGreaterThanOrEqual(26);
    expect(qty(k, 'nh:ya')).toBeLessThanOrEqual(45);
    const mail = one(k, 'nh:splint_mail');
    expect(mail.c.item).toMatchObject({ equipped: 'body', erodeproof: true }); // lacquered
    const rk = (nhData({ state: k.s }) as { rknown?: Record<string, true> }).rknown;
    expect(rk?.[String(mail.id)]).toBe(true);
    expect(k.s.discovered).toEqual(expect.arrayContaining(['nh:helmet', 'nh:potion_of_booze']));
    expect(k.s.discovered).not.toContain('nh:magic_harp');
    expect(skillLevel({ state: k.s }, 'bare_handed')).toBe(2); // Master
  });

  test.each(SEEDS)('Tourist (seed %i)', (seed) => {
    const k = kitFor('tourist', 'human', seed);
    const darts = one(k, 'nh:dart').c.item;
    expect(darts?.spe).toBe(2);
    expect(darts?.quantity).toBeGreaterThanOrEqual(21);
    expect(darts?.quantity).toBeLessThanOrEqual(40);
    // the ten random foods (mksobj may make pairs)
    const food = k.inv.filter((o) => defs.object(o.def).class === 'food');
    const n = food.reduce((x, o) => x + (o.c.item?.quantity ?? 0), 0);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(20);
    expect(qty(k, 'nh:potion_of_extra_healing')).toBe(2);
    expect(qty(k, 'nh:scroll_of_magic_mapping')).toBe(4);
    expect(slotOf(k, 'nh:hawaiian_shirt')).toBe('shirt');
    one(k, 'nh:expensive_camera');
    one(k, 'nh:credit_card');
    const gold = qty(k, 'nh:gold_piece');
    expect(gold).toBeGreaterThanOrEqual(1);
    expect(gold).toBeLessThanOrEqual(1000);
    expect(skillLevel({ state: k.s }, 'dart')).toBe(2); // darts are missiles, not ammo
  });

  test.each(SEEDS)('Valkyrie (seed %i)', (seed) => {
    const k = kitFor('valkyrie', 'human', seed);
    expect(one(k, 'nh:spear').c.item).toMatchObject({ spe: 1, equipped: 'weapon' });
    expect(swapOf(k)).toBe('nh:dagger');
    expect(one(k, 'nh:small_shield').c.item).toMatchObject({ spe: 3, equipped: 'shield' });
    expect(one(k, 'nh:food_ration').c.item?.buc).toBe('uncursed');
    expect(k.inv.every((o) => o.c.item?.buc !== 'cursed')).toBe(true);
    expect(k.s.discovered).toContain('nh:elven_dagger');
    expect(k.s.discovered).not.toContain('nh:glaive'); // no polearms
    expect(k.s.discovered).not.toContain('nh:elven_cloak'); // magic
  });

  test.each(SEEDS)('Wizard (seed %i)', (seed) => {
    const k = kitFor('wizard', 'human', seed);
    expect(one(k, 'nh:quarterstaff').c.item).toMatchObject({
      spe: 1,
      buc: 'blessed',
      equipped: 'weapon',
    });
    expect(slotOf(k, 'nh:cloak_of_magic_resistance')).toBe('cloak');
    const marker = one(k, 'nh:magic_marker').c.item?.spe ?? 0;
    expect(marker).toBeGreaterThanOrEqual(19);
    expect(marker).toBeLessThanOrEqual(22);
    const cls = (c: string): number =>
      k.inv
        .filter((o) => defs.object(o.def).class === c)
        .reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0);
    expect(cls('wand')).toBe(1);
    expect(cls('ring')).toBe(2);
    expect(cls('potion')).toBe(3);
    expect(cls('scroll')).toBe(3);
    expect(cls('spellbook')).toBe(2);
    const spells = knownSpells({ state: k.s }).map((s) => s.id);
    expect(spells[0]).toBe('nh:spellbook_of_force_bolt');
    expect(spells).toHaveLength(2);
    expect(skillLevel({ state: k.s }, 'attack_spell')).toBe(2);
    expect(skillLevel({ state: k.s }, 'enchantment_spell')).toBe(2);
    expect(pwOf(k.s).uenmax).toBeGreaterThanOrEqual(5);
    // skill_based_spellbook_id(): every level 1 book, attack and enchantment up to level 3
    expect(isKnown(k.s, defs, 'nh:spellbook_of_sleep')).toBe(true);
    expect(isKnown(k.s, defs, 'nh:spellbook_of_magic_missile')).toBe(true);
    expect(isKnown(k.s, defs, 'nh:spellbook_of_light')).toBe(true);
    expect(isKnown(k.s, defs, 'nh:spellbook_of_cone_of_cold')).toBe(false);
    expect(isKnown(k.s, defs, 'nh:spellbook_of_clairvoyance')).toBe(false);
  });
});

describe('the random items', () => {
  const NEVER = [
    'nh:wand_of_wishing',
    'nh:ring_of_levitation',
    'nh:potion_of_hallucination',
    'nh:potion_of_acid',
    'nh:scroll_of_amnesia',
    'nh:scroll_of_fire',
    'nh:scroll_of_blank_paper',
    'nh:spellbook_of_blank_paper',
    'nh:ring_of_aggravate_monster',
    'nh:ring_of_hunger',
    'nh:wand_of_nothing',
    'nh:spellbook_of_force_bolt',
  ];
  test('a Wizard over 300 seeds: no excluded item, no two equal rings, no polymorph pair', () => {
    let state: GameState | undefined;
    const ringPairs = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const k = kitFor('wizard', 'orc', seed, state);
      state = k.s;
      const rand = k.inv.filter((o) =>
        ['wand', 'ring', 'potion', 'scroll'].includes(defs.object(o.def).class),
      );
      for (const o of rand) expect(NEVER, o.def).not.toContain(o.def);
      expect(k.inv.some((o) => o.def === 'nh:ring_of_poison_resistance')).toBe(false); // orc
      const rings = k.inv.filter((o) => defs.object(o.def).class === 'ring').map((o) => o.def);
      expect(new Set(rings).size).toBe(rings.length);
      ringPairs.add(rings.sort().join(','));
      const ids = new Set(k.inv.map((o) => o.def));
      if (ids.has('nh:ring_of_polymorph_control'))
        for (const p of [
          'nh:ring_of_polymorph',
          'nh:spellbook_of_polymorph',
          'nh:potion_of_polymorph',
        ])
          expect(ids.has(p as DefId), p).toBe(false);
      const books = k.inv.filter((o) => defs.object(o.def).class === 'spellbook');
      for (const b of books) {
        expect(defs.object(b.def).spellbook?.level).toBeLessThanOrEqual(3);
        expect(SKILL_TAB.wizard[roleSpellSkill(b.def, 'wizard')]).toBeDefined();
      }
    }
    expect(ringPairs.size).toBeGreaterThan(50); // the rings do vary
  });

  test('a Monk never gets enchant weapon; a Tourist eats; over 300 seeds', () => {
    let monk: GameState | undefined;
    for (let seed = 1; seed <= 300; seed++) {
      const k = kitFor('monk', 'human', seed, monk);
      monk = k.s;
      expect(qty(k, 'nh:scroll_of_enchant_weapon')).toBe(0);
    }
  });
});

describe('the races', () => {
  test.each(SEEDS)('elven, orcish and gnomish Rangers, dwarvish Valkyries (seed %i)', (seed) => {
    const elf = kitFor('ranger', 'elf', seed);
    expect(slotOf(elf, 'nh:elven_dagger')).toBe('weapon');
    expect(swapOf(elf)).toBe('nh:elven_bow');
    expect(qty(elf, 'nh:elven_arrow')).toBeGreaterThanOrEqual(80);
    expect(slotOf(elf, 'nh:elven_cloak')).toBe('cloak');
    expect(qty(elf, 'nh:lembas_wafer')).toBeGreaterThanOrEqual(4);
    expect(elf.s.discovered).toEqual(expect.arrayContaining(['nh:elven_boots']));
    const orc = kitFor('ranger', 'orc', seed);
    expect(swapOf(orc)).toBe('nh:orcish_bow');
    expect(qty(orc, 'nh:orcish_arrow')).toBeGreaterThanOrEqual(80);
    expect(slotOf(orc, 'nh:cloak_of_displacement')).toBe('cloak');
    // the tripe rations and the orc's two extra random foods
    expect(qty(orc, 'nh:tripe_ration')).toBeGreaterThanOrEqual(4);
    const food = orc.inv.filter((o) => defs.object(o.def).class === 'food');
    expect(food.reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0)).toBeGreaterThanOrEqual(6);
    expect(orc.s.discovered).toContain('nh:uruk_hai_shield');
    const gnome = kitFor('ranger', 'gnome', seed);
    expect(swapOf(gnome)).toBe('nh:crossbow');
    expect(qty(gnome, 'nh:crossbow_bolt')).toBeGreaterThanOrEqual(80);
    expect(skillLevel({ state: gnome.s }, 'crossbow')).toBe(2);
    const dwarf = kitFor('valkyrie', 'dwarf', seed);
    expect(slotOf(dwarf, 'nh:dwarvish_spear')).toBe('weapon');
    expect(dwarf.s.discovered).toContain('nh:dwarvish_mattock');
  });

  test.each(SEEDS)('an orcish Barbarian, an elven Priest and Wizard (seed %i)', (seed) => {
    const orc = kitFor('barbarian', 'orc', seed);
    expect(slotOf(orc, 'nh:orcish_ring_mail')).toBe('body');
    const instruments = (k: Kit) => k.inv.filter((o) => ELF_INSTRUMENTS.includes(o.def));
    expect(instruments(kitFor('priest', 'elf', seed))).toHaveLength(1);
    const wiz = kitFor('wizard', 'elf', seed);
    expect(instruments(wiz)).toHaveLength(1);
    expect(instruments(kitFor('wizard', 'human', seed))).toHaveLength(0);
    // an orcish Wizard gets no extra food
    expect(kitFor('wizard', 'orc', seed).inv.some((o) => defs.object(o.def).class === 'food')).toBe(
      false,
    );
  });
});

describe('every allowed role and race', () => {
  test.each(PAIRS)('%s %s: skills within their maximums, the special spell allowed', (r, race) => {
    for (const seed of [1, 2, 3]) {
      const k = kitFor(r, race, seed);
      const d = nhData({ state: k.s });
      for (const [sk, lvl] of Object.entries(d.skills ?? {}))
        expect(lvl, sk).toBeLessThanOrEqual(d.skillMax?.[sk] ?? 0);
      const school = roleSpellSkill(ROLES_TAB[r].spelspec, r);
      expect(d.skillMax?.[school], school).toBeGreaterThanOrEqual(2);
      expect(d.weaponSlots).toBe(2);
      // the carry boost: she can carry it all, or Str and Con are at their maximums
      const a = getPlayer(k.s).c.attributes!;
      const ok =
        invWeight(k.s, defs, k.s.playerId) <= 0 ||
        (a.str >= attrMax(k.s, 'str') && a.con >= attrMax(k.s, 'con'));
      expect(ok).toBe(true);
      // worn and wielded things are hers, never cursed
      for (const o of k.inv) expect(o.c.item?.buc).not.toBe('cursed');
      // casters can cast their first spell
      if (knownSpells({ state: k.s }).length) expect(pwOf(k.s).uenmax).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('the Valkyrie at new game', () => {
  test('the oil lamp 1 time in 6, the food ration sometimes two', () => {
    let lamps = 0;
    let pairs = 0;
    let state: GameState | undefined;
    for (let seed = 1; seed <= 600; seed++) {
      const k = kitFor('valkyrie', 'human', seed, state);
      state = k.s;
      if (of(k, 'nh:oil_lamp').length) {
        lamps++;
        expect(k.s.discovered).toContain('nh:potion_of_oil');
      }
      if (qty(k, 'nh:food_ration') === 2) pairs++;
    }
    expect(lamps).toBeGreaterThan(60);
    expect(lamps).toBeLessThan(140);
    expect(pairs).toBeGreaterThan(60);
    expect(pairs).toBeLessThan(140);
  });

  test('a new game: her pet is a kitten or a little dog', () => {
    const pets = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = eng.newGame({ seed }).state;
      const pet = Object.values(s.entities).find((e) => (e.c.monster?.tame ?? 0) > 0);
      pets.add(pet?.def ?? 'none');
      expect(skillLevel({ state: s }, 'spear')).toBe(2);
    }
    expect([...pets].sort()).toEqual(['nh:kitten', 'nh:little_dog']);
  });
});

describe('the pet', () => {
  /** The role's starting pet made next to her on a fresh level. */
  function petOf(role: RoleKey): { s: GameState; pet: Entity } {
    const s = structuredClone(BASE);
    for (const e of Object.values(s.entities))
      if (e.c.monster?.tame) delete s.entities[String(e.id)];
    setRoleRaceForTest(s, role, 'human');
    let id: number | null = null;
    run(s, (ctx) => {
      id = makedog(ctx);
    });
    const pet = s.entities[String(id)];
    if (!pet) throw new Error('no pet');
    return { s, pet };
  }

  test.each([
    ['caveman', 'nh:little_dog'],
    ['ranger', 'nh:little_dog'],
    ['samurai', 'nh:little_dog'],
    ['knight', 'nh:pony'],
    ['wizard', 'nh:kitten'],
  ] as const)("a %s's pet is a %s", (role, def) => {
    expect(petOf(role).pet.def).toBe(def);
  });

  test("the Knight's pony wears a saddle, which it keeps when it drops things", () => {
    const { s, pet } = petOf('knight');
    const saddle = wornSaddle(s, pet.id);
    expect(saddle?.def).toBe('nh:saddle');
    expect(saddle?.c.item?.known).toEqual({ buc: true, spe: true });
    run(s, (ctx) => relobj(ctx, pet.id, undefined, true, true)); // dog_invent()
    expect(wornSaddle(s, pet.id)?.id).toBe(saddle?.id);
    run(s, (ctx) => relobj(ctx, pet.id)); // death: everything drops
    const dropped = s.entities[String(saddle?.id)];
    expect(dropped?.c.pos).toBeDefined();
    expect(dropped && isWornSaddle(s, dropped)).toBe(false);
    expect((nhData({ state: s }) as { saddled?: unknown }).saddled).toBeUndefined();
  });
});

describe('the starting gold in the score', () => {
  test("a Tourist's own gold is no gain", () => {
    const k = kitFor('tourist', 'human', 7);
    const gold = qty(k, 'nh:gold_piece');
    expect(gold).toBeGreaterThan(0);
    const before = finalScore(k.s, defs);
    one(k, 'nh:gold_piece').c.item!.quantity = gold + 100;
    expect(finalScore(k.s, defs) - before).toBe(90); // the gain less a tenth
  });
});
