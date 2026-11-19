import { createHost, type FromCore, type ToCore } from '@nh/core';
import { vanillaMod } from '@nh/content';
import { expect, test } from 'vitest';
import { createRemote, type ViewMessage, type WorkerLike } from '../src/remote';

function simWorker(): WorkerLike {
  const listeners: ((e: { data: FromCore }) => void)[] = [];
  const host = createHost([vanillaMod], (m) => {
    const copy = structuredClone(m);
    queueMicrotask(() => listeners.forEach((l) => l({ data: copy })));
  });
  return {
    postMessage: (m: ToCore) => host.handle(structuredClone(m)),
    addEventListener: (_t, fn) => void listeners.push(fn),
  };
}

test('new, act, queries, errors', async () => {
  const r = createRemote(simWorker());
  const views: ViewMessage[] = [];
  r.onView((m) => views.push(m));
  r.newGame(1, 40, 15);
  await Promise.resolve();
  expect(views).toHaveLength(1);
  expect(views[0]?.view.kind).toBe('full');

  r.act({ type: 'wait' });
  await Promise.resolve();
  expect(views).toHaveLength(2);
  expect(views[1]?.view.kind).toBe('delta');

  const first = views[0]?.view;
  if (first?.kind !== 'full') throw new Error('expected full');
  const { x, y } = first.player;
  const d = await r.query.describe({ x, y });
  expect(d.visible).toBe(true);
  const offers = await r.query.actionsFor({ kind: 'self' });
  expect(offers.length).toBeGreaterThan(0);
  expect(await r.query.pathTo({ x, y })).toEqual(expect.anything());

  await expect(r.query.describe(undefined as never)).rejects.toThrow(/^query \d+:/);
});

test('errors without a query go to onError', async () => {
  const r = createRemote(simWorker());
  const errs: string[] = [];
  r.onError((e) => errs.push(e));
  r.act({ type: 'wait' });
  await Promise.resolve();
  expect(errs).toEqual(['No game in progress']);
});

test('save then load reproduces hash', async () => {
  const a = createRemote(simWorker());
  a.newGame(5, 40, 15);
  a.act({ type: 'wait' });
  a.act({ type: 'search' });
  const save = await a.save();
  const b = createRemote(simWorker());
  b.load(save);
  expect(await b.hash()).toBe(await a.hash());
});

test('choices before any game, then a new game with a character (m22 step 8)', async () => {
  const r = createRemote(simWorker());
  const ch = await r.choices();
  expect(ch.roles.map((x) => x.id)).toEqual([
    'nh:role_archeologist',
    'nh:role_barbarian',
    'nh:role_caveman',
    'nh:role_healer',
    'nh:role_knight',
    'nh:role_monk',
    'nh:role_priest',
    'nh:role_rogue',
    'nh:role_ranger',
    'nh:role_samurai',
    'nh:role_tourist',
    'nh:role_valkyrie',
    'nh:role_wizard',
  ]);
  expect(ch.races.map((x) => x.id)).toEqual([
    'nh:race_human',
    'nh:race_elf',
    'nh:race_dwarf',
    'nh:race_gnome',
    'nh:race_orc',
  ]);
  const views: ViewMessage[] = [];
  r.onView((m) => views.push(m));
  r.newGame(3, 80, 21, { role: 'nh:role_wizard', race: 'nh:race_elf', gender: 'male' });
  await Promise.resolve();
  expect(views[0]?.events[0]).toEqual({
    type: 'msg',
    key: 'welcome',
    params: {
      role: '@role.wizard',
      race: '@race.elf.adj',
      gender: '@gender.male',
      align: '@align.chaotic',
      who: {
        key: 'welcome.who.gender',
        params: { gender: '@gender.male', race: '@race.elf.adj', role: '@role.wizard' },
      },
    },
  });
  const file = JSON.parse(await r.save()) as { replay: { character: unknown } };
  expect(file.replay.character).toEqual({
    role: 'nh:role_wizard',
    race: 'nh:race_elf',
    gender: 'male',
    align: -1,
  });
});

test('an older save is refused with a clear error (m22 Q5: old saves are wiped)', async () => {
  const a = createRemote(simWorker());
  a.newGame(5, 40, 15);
  const save = JSON.parse(await a.save()) as Record<string, unknown>;
  save['version'] = 10;
  const b = createRemote(simWorker());
  const errs: string[] = [];
  b.onError((e) => errs.push(e));
  b.load(JSON.stringify(save));
  await Promise.resolve();
  expect(errs).toEqual([
    "This save was made by an older version of the game (save version 10, now 11) and can't be restored",
  ]);
});
