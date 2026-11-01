import { inventoryOf, itemsAt } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { defs, itemOf, levelSetup, plainKit } from './itemHelpers';

const setup = () => {
  const s = levelSetup();
  plainKit(s.state);
  return s;
};
const answer = (s: ReturnType<typeof setup>, value: unknown) =>
  s.step({
    type: 'answer',
    promptId: s.state.pendingPrompt?.prompt.id ?? '',
    value: value as never,
  });
const floor = (s: ReturnType<typeof setup>) => itemsAt(defs, s.state, 'dlvl1', s.here.x, s.here.y);

describe('counts in the pick-up menu', () => {
  test('stacks get max: quantity, single items none', () => {
    const s = setup();
    s.floor('nh:apple', { quantity: 5 });
    s.floor('nh:carrot');
    const r = s.mod('nh:pickup');
    const byMax = r.prompt?.options?.map((o) => o.max);
    expect(byMax).toEqual([undefined, 5]); // carrot on top, then the apples
  });

  test('{ value, count } takes part of a stack and leaves the rest', () => {
    const s = setup();
    const apples = s.floor('nh:apple', { quantity: 5 });
    const carrot = s.floor('nh:carrot');
    s.mod('nh:pickup');
    const a = answer(s, [{ value: apples, count: 2 }, carrot]);
    expect(s.text(a)).toEqual(['e - a carrot.', 'f - 2 apples.']); // the pile's top comes first
    const left = floor(s).find((e) => e.def === 'nh:apple');
    expect(left?.c.item?.quantity).toBe(3);
    const mine = inventoryOf(s.state, s.state.playerId).find((e) => e.def === 'nh:apple');
    expect(mine?.c.item?.quantity).toBe(2);
  });

  test('a count merges into a carried stack and reports the total', () => {
    const s = setup();
    s.carry('nh:apple', { quantity: 2 });
    const apples = s.floor('nh:apple', { quantity: 5 });
    s.floor('nh:carrot');
    s.mod('nh:pickup');
    const a = answer(s, [{ value: apples, count: 1 }]);
    expect(s.text(a)).toEqual(['e - an apple (3 in total).']);
  });

  test('plain ids still take whole stacks; counts at or above the stack take it all', () => {
    const s = setup();
    const apples = s.floor('nh:apple', { quantity: 3 });
    const carrot = s.floor('nh:carrot');
    s.mod('nh:pickup');
    answer(s, [apples, { value: carrot, count: 9 }]);
    expect(floor(s)).toHaveLength(0);
    expect(
      inventoryOf(s.state, s.state.playerId).find((e) => e.def === 'nh:apple')?.c.item?.quantity,
    ).toBe(3);
  });
});

describe('counts in the drop menu', () => {
  test('stacks get max: quantity', () => {
    const s = setup();
    s.carry('nh:apple', { quantity: 4 });
    const r = s.mod('nh:drop_many');
    const maxes = r.prompt?.options?.map((o) => o.max);
    expect(maxes).toEqual([undefined, undefined, undefined, undefined, 4]);
  });

  test('{ value, count } drops part of a stack', () => {
    const s = setup();
    const apples = s.carry('nh:apple', { quantity: 4 });
    s.mod('nh:drop_many');
    const a = answer(s, [{ value: apples, count: 3 }]);
    expect(s.text(a)).toEqual(['You drop 3 apples.']);
    expect(itemOf(s.state, apples).quantity).toBe(1);
    expect(floor(s)[0]?.c.item?.quantity).toBe(3);
    expect(a.events.some((e) => e.type === 'msg' && e.key === 'drop.worn')).toBe(false);
  });

  test('part of a wielded stack drops without unwielding the rest', () => {
    const s = setup();
    const darts = s.carry('nh:dart', { quantity: 6 });
    s.mod('nh:wield', { item: darts });
    s.mod('nh:drop_many');
    answer(s, [{ value: darts, count: 2 }]);
    expect(itemOf(s.state, darts)).toMatchObject({ quantity: 4, equipped: 'weapon' });
    expect(floor(s)[0]?.c.item).toMatchObject({ quantity: 2, equipped: null });
  });

  test('part of the alternate stack leaves the rest alternate', () => {
    const s = setup();
    const daggers = s.byLetter('b');
    itemOf(s.state, daggers).quantity = 3;
    s.mod('nh:drop_many');
    answer(s, [{ value: daggers, count: 1 }]);
    expect(itemOf(s.state, daggers).quantity).toBe(2);
    expect(s.text(s.mod('nh:swap_weapon'))[1]).toBe(
      'a - an uncursed +1 spear (alternate weapon; not wielded).',
    );
  });

  test('whole-stack answers and a mix still work', () => {
    const s = setup();
    const apples = s.carry('nh:apple', { quantity: 4 });
    const food = s.byLetter('d');
    s.mod('nh:drop_many');
    const a = answer(s, [{ value: apples, count: 4 }, food]);
    expect(s.text(a)).toEqual(['You drop 4 apples.', 'You drop an uncursed food ration.']);
    expect(inventoryOf(s.state, s.state.playerId).some((e) => e.def === 'nh:apple')).toBe(false);
  });
});
