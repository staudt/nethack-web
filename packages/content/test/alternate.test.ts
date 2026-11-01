import { itemsAt, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { isSwapWep, nhData, swapWep } from '../src/index';
import { engine, itemOf, levelSetup, plainKit } from './itemHelpers';

const setup = () => {
  const s = levelSetup();
  plainKit(s.state);
  return s;
};
const offers = (s: ReturnType<typeof setup>) =>
  engine
    .query(s.state)
    .actionsFor({ kind: 'self' })
    .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));

describe('the alternate weapon and x', () => {
  test('the Valkyrie starts with the dagger as her alternate weapon', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = levelSetup(undefined, seed);
      const dagger = s.byLetter('b');
      expect(swapWep(s.ctx)?.id).toBe(dagger);
      expect(itemOf(s.state, dagger).equipped).toBeNull();
    }
  });

  test('the namer says "(alternate weapon; not wielded)"', () => {
    const s = setup();
    const e = s.state.entities[String(s.byLetter('b'))];
    expect(e && isSwapWep(s.state, e)).toBe(true);
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual([
      'b - an uncursed +0 dagger (weapon in hand).',
      'a - an uncursed +1 spear (alternate weapon; not wielded).',
    ]);
  });

  test('plural stacks say "alternate weapons"', () => {
    const s = setup();
    s.mod('nh:swap_weapon');
    const darts = s.carry('nh:dart', { quantity: 3 });
    s.mod('nh:wield', { item: darts });
    expect(s.text(s.mod('nh:swap_weapon'))[1]).toMatch(/\(alternate weapons; not wielded\)\.$/);
  });

  test("x swaps with NetHack's messages, takes a move, and swaps back", () => {
    const s = setup();
    const t0 = s.state.turn;
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual([
      'b - an uncursed +0 dagger (weapon in hand).',
      'a - an uncursed +1 spear (alternate weapon; not wielded).',
    ]);
    expect(s.state.turn).toBe(t0 + 1);
    expect(itemOf(s.state, s.byLetter('b')).equipped).toBe('weapon');
    expect(itemOf(s.state, s.byLetter('a')).equipped).toBeNull();
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual([
      'a - an uncursed +1 spear (weapon in hand).',
      'b - an uncursed +0 dagger (alternate weapon; not wielded).',
    ]);
    expect(s.state.turn).toBe(t0 + 2);
  });

  test('offered on self when a weapon is wielded or alternate, and discoverable', () => {
    const s = setup();
    expect(offers(s)).toContain('nh:swap_weapon');
    s.mod('nh:wield', { item: null }); // bare handed, dagger still alternate
    expect(offers(s)).toContain('nh:swap_weapon');
    nhData(s.ctx).uswapwep = null;
    expect(offers(s)).not.toContain('nh:swap_weapon');
  });

  test('with no alternate, the wielded weapon becomes it and hands are empty', () => {
    const s = setup();
    nhData(s.ctx).uswapwep = null;
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual([
      'You are bare handed.',
      'a - an uncursed +1 spear (alternate weapon; not wielded).',
    ]);
    // and from empty hands the alternate is wielded and no secondary is left
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual([
      'a - an uncursed +1 spear (weapon in hand).',
      'You have no secondary weapon readied.',
    ]);
  });

  test('nothing wielded and nothing alternate: already bare handed, no time', () => {
    const s = setup();
    s.mod('nh:wield', { item: null });
    nhData(s.ctx).uswapwep = null;
    const t0 = s.state.turn;
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual(['You are already bare handed.']);
    expect(s.state.turn).toBe(t0);
    expect(swapWep(s.ctx)).toBeNull();
  });

  test('a cursed (welded) weapon blocks it', () => {
    const s = setup();
    const spear = s.byLetter('a');
    itemOf(s.state, spear).buc = 'cursed';
    const t0 = s.state.turn;
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual(['Your spear is welded to your hand!']);
    expect(s.state.turn).toBe(t0);
    expect(itemOf(s.state, spear).equipped).toBe('weapon');
    expect(swapWep(s.ctx)?.id).toBe(s.byLetter('b'));
  });

  test('swapping in a cursed alternate welds it, and the old weapon stays alternate', () => {
    const s = setup();
    itemOf(s.state, s.byLetter('b')).buc = 'cursed';
    const out = s.text(s.mod('nh:swap_weapon'));
    expect(out[0]).toMatch(/dagger welds itself to your dominant right hand!$/);
    expect(out[1]).toBe('a - an uncursed +1 spear (alternate weapon; not wielded).');
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual(['Your dagger is welded to your hand!']);
  });

  test('a two-handed weapon alternate cannot be wielded over a shield; nothing changes', () => {
    const s = setup();
    const m = s.carry('nh:dwarvish_mattock');
    nhData(s.ctx).uswapwep = m;
    const t0 = s.state.turn;
    expect(s.text(s.mod('nh:swap_weapon'))).toEqual([
      'You cannot wield a two-handed weapon while wearing a shield.',
    ]);
    expect(s.state.turn).toBe(t0);
    expect(swapWep(s.ctx)?.id).toBe(m);
    expect(itemOf(s.state, s.byLetter('a')).equipped).toBe('weapon');
  });

  test('wielding the alternate weapon swaps (dowield -> doswapweapon)', () => {
    const s = setup();
    expect(s.text(s.mod('nh:wield', { item: s.byLetter('b') }))).toEqual([
      'b - an uncursed +0 dagger (weapon in hand).',
      'a - an uncursed +1 spear (alternate weapon; not wielded).',
    ]);
  });

  test('dropping the alternate weapon clears the slot, silently of the old state', () => {
    const s = setup();
    const dagger = s.byLetter('b');
    expect(s.text(s.mod('nh:drop', { item: dagger }))).toEqual(['You drop an uncursed +0 dagger.']);
    expect(swapWep(s.ctx)).toBeNull();
    // picking it back up does not make it alternate again
    s.mod('nh:pickup');
    const again = s.state.entities[String(s.byLetter('b'))];
    expect(again && isSwapWep(s.state, again)).toBe(false);
    expect(itemsAt(s.ctx.defs, s.state, 'dlvl1', s.here.x, s.here.y)).toHaveLength(0);
  });

  test('throwing the whole alternate stack clears the slot', () => {
    const s = setup();
    const t = s.mod('nh:throw', { item: s.byLetter('b') });
    expect(t.prompt?.kind).toBe('direction');
    engine.step(s.state, { type: 'answer', promptId: t.prompt?.id ?? '', value: 'e' });
    expect(swapWep(s.ctx)).toBeNull();
  });

  test('the slot survives a save round trip', () => {
    const s = setup();
    const copy = JSON.parse(JSON.stringify(s.state)) as GameState;
    expect(swapWep({ state: copy })?.id).toBe(s.byLetter('b'));
  });
});
