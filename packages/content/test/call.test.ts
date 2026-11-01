import { type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { nhData } from '../src/index';
import { defs, engine, levelSetup, plainKit, render } from './itemHelpers';

const setup = () => {
  const s = levelSetup();
  plainKit(s.state);
  return s;
};
type Setup = ReturnType<typeof setup>;

const name = (s: Setup, id: number): string =>
  render(defs.itemName(s.state, s.state.entities[String(id)]!));
const answer = (s: Setup, value: unknown) =>
  s.step({
    type: 'answer',
    promptId: s.state.pendingPrompt?.prompt.id ?? '',
    value: value as never,
  });

/** Starts #name, picks the item, and returns the text prompt. */
function toTextPrompt(s: Setup, id: number) {
  const pick = s.mod('nh:call');
  expect(pick.prompt?.kind).toBe('menu');
  expect(pick.prompt?.multi).toBeFalsy();
  return answer(s, id).prompt;
}

describe('#name / call an object type', () => {
  test('is a self offer', () => {
    const s = setup();
    const offered = engine
      .query(s.state)
      .actionsFor({ kind: 'self' })
      .map((o) => o.action.type === 'mod' && o.action.action);
    expect(offered).toContain('nh:call');
  });

  test('nothing to call: the kit is all identified or plain', () => {
    const s = setup();
    const r = s.mod('nh:call');
    expect(r.prompt).toBeNull();
    expect(s.text(r)).toEqual(["You don't have anything to call."]);
  });

  test('the menu lists unidentified types with letters; the text prompt names one potion', () => {
    const s = setup();
    const potions = s.carry('nh:potion_of_healing', { quantity: 2 });
    s.carry('nh:scroll_of_identify');
    const pick = s.mod('nh:call');
    expect(pick.prompt?.options?.map((o) => o.value)).toHaveLength(2);
    expect(pick.prompt?.options?.every((o) => o.letter !== undefined)).toBe(true);
    const text = answer(s, potions).prompt;
    expect(text?.kind).toBe('text');
    expect(text?.maxLength).toBe(63);
    const app = name(s, potions).replace(/^2 /, '').replace('potions', 'potion');
    expect(render({ key: text?.key ?? '', params: text?.params ?? {} })).toBe(
      `Call ${/^[aeiou]/.test(app) ? 'an' : 'a'} ${app}:`,
    );
  });

  test('the name shows as "potion called healing?" and survives a save', () => {
    const s = setup();
    const potions = s.carry('nh:potion_of_healing', { quantity: 2 });
    const before = name(s, potions);
    toTextPrompt(s, potions);
    const r = answer(s, 'healing?');
    expect(r.prompt).toBeNull();
    expect(name(s, potions)).toBe('2 potions called healing?');
    expect(before).toMatch(/^2 .* potions$/);
    expect(render(defs.itemName(s.state, s.state.entities[String(potions)]!))).toContain('called');
    expect(nhData(s.ctx).called).toEqual({ 'nh:potion_of_healing': 'healing?' });
    const copy = JSON.parse(JSON.stringify(s.state)) as GameState;
    expect(render(defs.itemName(copy, copy.entities[String(potions)]!))).toBe(
      '2 potions called healing?',
    );
    // one potion
    const one = s.carry('nh:potion_of_extra_healing');
    toTextPrompt(s, one);
    answer(s, '  extra   good ');
    expect(name(s, one)).toBe('potion called extra good');
  });

  test('scrolls read "scroll called X"', () => {
    const s = setup();
    const sc = s.carry('nh:scroll_of_identify');
    toTextPrompt(s, sc);
    answer(s, 'id');
    expect(name(s, sc)).toBe('scroll called id');
  });

  test('empty or null answers cancel; blanks remove the name', () => {
    const s = setup();
    const p = s.carry('nh:potion_of_healing');
    toTextPrompt(s, p);
    answer(s, 'heal');
    expect(name(s, p)).toBe('potion called heal');
    toTextPrompt(s, p);
    answer(s, ''); // cancel: keeps the name
    expect(name(s, p)).toBe('potion called heal');
    toTextPrompt(s, p);
    answer(s, null);
    expect(name(s, p)).toBe('potion called heal');
    toTextPrompt(s, p);
    answer(s, '   '); // spaces only: removes it
    expect(name(s, p)).toMatch(/^.* potion$/);
    expect(name(s, p)).not.toContain('called');
    expect(nhData(s.ctx).called).toEqual({});
  });

  test('an identified type is not offered unless it has a name; names stay shown nowhere then', () => {
    const s = setup();
    const p = s.carry('nh:potion_of_healing');
    toTextPrompt(s, p);
    answer(s, 'heal');
    s.state.discovered.push('nh:potion_of_healing' as never);
    expect(name(s, p)).toBe('potion of healing');
    const pick = s.mod('nh:call'); // still listed, so the name can be cleared
    expect(pick.prompt?.options).toHaveLength(1);
    answer(s, p);
    answer(s, ' ');
    expect(nhData(s.ctx).called).toEqual({});
    expect(s.mod('nh:call').prompt).toBeNull();
  });

  test('a leading @ cannot masquerade as a message key', () => {
    const s = setup();
    const p = s.carry('nh:potion_of_healing');
    toTextPrompt(s, p);
    answer(s, '@welcome');
    expect(name(s, p)).toBe('potion called welcome');
  });

  test('unidentified described weapons and armor read "<description> called X"', () => {
    const s = setup();
    const d = s.carry('nh:elven_dagger');
    toTextPrompt(s, d);
    answer(s, 'nice');
    expect(name(s, d)).toBe('runed dagger called nice');
    const h = s.carry('nh:orcish_helm');
    toTextPrompt(s, h);
    answer(s, 'cheap');
    expect(name(s, h)).toBe('helmet called cheap');
  });
});
