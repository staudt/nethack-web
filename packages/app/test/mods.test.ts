import { createEngine, type FromCore } from '@nh/core';
import { vanillaMod, wizardMod } from '@nh/content';
import { expect, test } from 'vitest';
import { createModHost } from '../src/modhost';
import { bootPlan, modsForSave, newGameMods, savedModIds, savedSeed } from '../src/mods';
import { parseParams } from '../src/params';

const rnd = (): number => 1;
const saveWith = (mods: Parameters<typeof createEngine>[0]): string => {
  const e = createEngine(mods);
  const { state } = e.newGame({ seed: 2 });
  return e.save(state, { seed: 2, width: 80, height: 21, mods: state.mods, actions: [] });
};
const normalSave = saveWith([vanillaMod]);
const wizardSave = saveWith([vanillaMod, wizardMod]);

test('a save names its mods', () => {
  expect(savedModIds(normalSave)).toEqual(['nh']);
  expect(savedModIds(wizardSave)).toEqual(['nh', 'wiz']);
  expect(savedSeed(normalSave)).toBe(2);
  expect(savedSeed('not json')).toBeNull();
  expect(savedModIds('not json')).toBeNull();
  expect(savedModIds('{"mods":[{"id":3}]}')).toBeNull();
  expect(modsForSave(wizardSave, false)).toEqual(['nh', 'wiz']);
  expect(modsForSave('junk', true)).toEqual(['nh', 'wiz']);
});

test('boot: a stored save keeps its own mods, with or without wizard=1', () => {
  const plain = parseParams('', rnd);
  const wiz = parseParams('?wizard=1', rnd);
  expect(bootPlan(plain, null)).toEqual({ kind: 'new', mods: ['nh'] });
  expect(bootPlan(wiz, null)).toEqual({ kind: 'new', mods: ['nh', 'wiz'] });
  expect(bootPlan(plain, wizardSave)).toEqual({
    kind: 'load',
    save: wizardSave,
    mods: newGameMods(true),
  });
  expect(bootPlan(wiz, wizardSave)).toEqual({
    kind: 'load',
    save: wizardSave,
    mods: ['nh', 'wiz'],
  });
  expect(bootPlan(plain, normalSave)).toEqual({ kind: 'load', save: normalSave, mods: ['nh'] });
  // wizard=1 over a normal save asks for a wizard game: a new one, like new=1 or seed=.
  expect(bootPlan(wiz, normalSave)).toEqual({ kind: 'new', mods: ['nh', 'wiz'] });
  expect(bootPlan(parseParams('?new=1', rnd), wizardSave)).toEqual({ kind: 'new', mods: ['nh'] });
});

test('the worker host switches mods on a mods message and rejects unknown ones', () => {
  const out: FromCore[] = [];
  const host = createModHost({ nh: vanillaMod, wiz: wizardMod }, ['nh'], (m) => out.push(m));
  host.handle({ t: 'load', save: wizardSave });
  expect(out.pop()).toMatchObject({ t: 'error', message: expect.stringMatching(/wiz@/) as string });
  host.handle({ t: 'mods', ids: ['nh', 'wiz'] });
  host.handle({ t: 'load', save: wizardSave });
  expect(out.pop()?.t).toBe('view');
  host.handle({ t: 'query', id: 1, q: 'actionsFor', args: [{ kind: 'self' }] });
  const reply = out.pop();
  expect(reply?.t).toBe('reply');
  const ids = (reply as unknown as { result: { action: { action?: string } }[] }).result.map(
    (o) => o.action.action,
  );
  expect(ids).toContain('wiz:map');
  host.handle({ t: 'mods', ids: ['nh', 'zz'] });
  expect(out.pop()).toEqual({ t: 'error', message: "Unknown game mod 'zz'" });
});
