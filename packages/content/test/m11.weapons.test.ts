// m11 step 1: the weapon rows, monsters choosing them, their damage and the hero's skills.
import { createRng, inventoryOf, seedRng, type Ctx, type DefId, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { dmgval, mongets, nhData, selectHwep } from '../src/index';
import { mksobj } from '../src/items';
import { addMon, setup } from './helpers';
import { ctxFor, defs, levelSetup, plainKit } from './itemHelpers';

const ROOM = ['.'.repeat(12), '.'.repeat(12), '.'.repeat(12)];

describe('select_hwep() with the whole hwep[]', () => {
  const pick = (mon: string, items: string[], shield = false): string | undefined => {
    const s = setup(ROOM);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    const id = addMon(s.state, mon, 5, 1);
    for (const o of items) mongets(ctx, id, o);
    if (shield) {
      const sh = mongets(ctx, id, 'nh:small_shield')!;
      s.state.entities[String(sh)]!.c.item!.equipped = 'shield';
    }
    return selectHwep(ctx, id)?.def;
  };

  test('a strong monster prefers a tsurugi to a two-handed sword to a long sword', () => {
    expect(pick('nh:ettin', ['nh:long_sword', 'nh:two_handed_sword', 'nh:tsurugi'])).toBe(
      'nh:tsurugi',
    );
    expect(pick('nh:ettin', ['nh:long_sword', 'nh:two_handed_sword'])).toBe('nh:two_handed_sword');
  });

  test('with a shield, or when not strong, two-handed weapons are skipped', () => {
    expect(pick('nh:ettin', ['nh:dagger', 'nh:two_handed_sword'], true)).toBe('nh:dagger');
    expect(pick('nh:gnome', ['nh:knife', 'nh:halberd', 'nh:battle_axe'])).toBe('nh:knife');
  });

  test('silver and new one-handed weapons slot into C order', () => {
    expect(pick('nh:gnome', ['nh:mace', 'nh:silver_mace'])).toBe('nh:silver_mace');
    expect(pick('nh:gnome', ['nh:dagger', 'nh:silver_dagger'])).toBe('nh:silver_dagger');
    expect(pick('nh:gnome', ['nh:scimitar', 'nh:silver_saber', 'nh:broadsword'])).toBe(
      'nh:broadsword',
    );
    expect(pick('nh:gnome', ['nh:club', 'nh:quarterstaff'])).toBe('nh:club'); // bimanual
  });

  test('giants just love to use clubs', () => {
    expect(pick('nh:giant', ['nh:two_handed_sword', 'nh:club'])).toBe('nh:club');
    expect(pick('nh:ettin', ['nh:two_handed_sword', 'nh:club'])).toBe('nh:two_handed_sword');
  });
});

describe("dmgval()'s per-type extras", () => {
  const range = (weapon: string, mon: string): [number, number] => {
    const s = setup(ROOM);
    const ctx = ctxFor(s.state) as unknown as Ctx;
    const carrier = addMon(s.state, 'nh:jackal', 1, 1);
    const id = mksobj(ctx, defs.object(weapon as DefId), { init: false, carriedBy: carrier });
    const e = s.state.entities[String(id)]!; // +0, not eroded
    const rng = createRng(seedRng(7));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const d = dmgval(rng, e, defs.object(weapon as DefId), defs.monster(mon as DefId));
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return [lo, hi];
  };

  test('two-handed sword: d12 vs small, 3d6 vs large (d6 + 2d6)', () => {
    expect(range('nh:two_handed_sword', 'nh:jackal')).toEqual([1, 12]);
    expect(range('nh:two_handed_sword', 'nh:ettin')).toEqual([3, 18]);
  });

  test('battle-axe: d8+d4 vs small, d6+2d4 vs large; flail d6+1 / 2d4; halberd d10 / 2d6', () => {
    expect(range('nh:battle_axe', 'nh:jackal')).toEqual([2, 12]);
    expect(range('nh:battle_axe', 'nh:ettin')).toEqual([3, 14]);
    expect(range('nh:flail', 'nh:jackal')).toEqual([2, 7]);
    expect(range('nh:flail', 'nh:ettin')).toEqual([2, 8]);
    expect(range('nh:halberd', 'nh:jackal')).toEqual([1, 10]);
    expect(range('nh:halberd', 'nh:ettin')).toEqual([2, 12]);
  });

  test('the crossbow bolt is +1 against both sizes', () => {
    expect(range('nh:crossbow_bolt', 'nh:jackal')).toEqual([2, 5]);
    expect(range('nh:crossbow_bolt', 'nh:ettin')).toEqual([2, 7]);
  });
});

describe('the hero and the new weapons', () => {
  /** The hero (a Valkyrie) wields a new `weapon`, shield removed, and hits a sturdy newt. */
  function train(weapon: string, skill: string): { before: number; after: number } {
    const s = levelSetup(['.....', '..@..', '.....']);
    plainKit(s.state);
    for (const e of inventoryOf(s.state, s.state.playerId))
      if (e.c.item?.equipped === 'shield') delete s.state.entities[String(e.id)];
    const w = s.carry(weapon);
    s.mod('nh:wield', { item: w });
    expect(s.state.entities[String(w)]?.c.item?.equipped).toBe('weapon');
    const before = nhData(s.ctx).skillAdvance?.[skill] ?? 0;
    const m: EntityId = addMon(s.state, 'nh:newt', 3, 1, { asleep: true });
    const mon = s.state.entities[String(m)]!;
    mon.c.actor!.speed = 0;
    for (let i = 0; i < 60; i++) {
      mon.c.hp = { cur: 100000, max: 100000 };
      s.step({ type: 'move', dir: 'e' });
    }
    return { before, after: nhData(s.ctx).skillAdvance?.[skill] ?? 0 };
  }

  test.each([
    ['nh:broadsword', 'broad_sword'],
    ['nh:two_handed_sword', 'two_handed_sword'],
    ['nh:silver_saber', 'saber'],
    ['nh:war_hammer', 'hammer'],
    ['nh:quarterstaff', 'quarterstaff'],
    ['nh:halberd', 'polearms'],
    ['nh:trident', 'trident'],
    ['nh:lance', 'lance'],
    ['nh:battle_axe', 'axe'],
  ])('hitting with a %s trains %s', (weapon, skill) => {
    expect(defs.object(weapon as DefId).weapon?.skill).toBe(skill);
    const { before, after } = train(weapon, skill);
    expect(after).toBeGreaterThan(before);
  });

  test('a restricted skill (flail for a Valkyrie) does not train', () => {
    const { after } = train('nh:flail', 'flail');
    expect(after).toBe(0);
  });

  test('a two-handed sword or battle-axe cannot be wielded while wearing a shield', () => {
    const s = levelSetup(['.....', '..@..', '.....']);
    plainKit(s.state);
    const sword = s.carry('nh:two_handed_sword');
    expect(s.text(s.mod('nh:wield', { item: sword }))).toEqual([
      'You cannot wield a two-handed sword while wearing a shield.',
    ]);
    const axe = s.carry('nh:battle_axe');
    expect(s.text(s.mod('nh:wield', { item: axe }))).toEqual([
      'You cannot wield a two-handed axe while wearing a shield.',
    ]);
    expect(s.state.entities[String(sword)]?.c.item?.equipped ?? null).toBeNull();
  });
});
