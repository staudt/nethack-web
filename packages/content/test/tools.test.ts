// Tools: lamps, locks (keys, lock picks, credit cards), containers (#loot, bags of holding),
// whistles and the blindfold. Outcomes are asserted; where rolls decide, seeds are searched.
import {
  cellIndex,
  contents,
  getPlayer,
  inventoryOf,
  isVisible,
  type DefId,
  type EntityId,
  type Level,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, T, heroHas, weight, invWeight } from '../src/index';
import { setTerrain } from '../src/actions';
import { addMon } from './helpers';
import { defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

function make(rows: string[], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  // no kitten or other creature: only what a test adds
  for (const k of Object.keys(s.state.entities)) {
    const e = s.state.entities[k];
    if (e?.c.monster) delete s.state.entities[k];
  }
  s.step({ type: 'wait' });
  return s;
}
const hero = (s: S) => getPlayer(s.state);
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const levelOf = (s: S): Level => s.state.levels['dlvl1']!;
const terrainAt = (s: S, x: number, y: number): DefId | undefined => {
  const lv = levelOf(s);
  return lv.palette[lv.cells[y * lv.width + x] ?? 0];
};
const nameOf = (s: S, id: EntityId): string =>
  render(defs.itemName(s.state, s.state.entities[String(id)]!));
const offersFor = (s: S, target: Parameters<ReturnType<typeof engine.query>['actionsFor']>[0]) =>
  engine
    .query(s.state)
    .actionsFor(target)
    .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));

describe('apply', () => {
  test('apply is offered for the tools of the subset', () => {
    const s = make(['@....']);
    for (const id of [
      'nh:oil_lamp',
      'nh:skeleton_key',
      'nh:sack',
      'nh:tin_whistle',
      'nh:blindfold',
    ])
      expect(offersFor(s, { kind: 'item', id: s.carry(id) }), id).toContain('nh:apply');
  });
});

describe('locks', () => {
  test('a skeleton key unlocks a locked box under the hero, over several turns', () => {
    // dex 3: 78% a turn; search a seed where the first turn is not enough
    for (let seed = 1; seed < 200; seed++) {
      const s = make(['@....'], seed);
      hero(s).c.attributes!.dex = 3;
      const box = s.floor('nh:large_box');
      itemOf(s.state, box).locked = true;
      const key = s.carry('nh:skeleton_key');
      const turn0 = s.state.turn;
      s.mod('nh:apply', { item: key });
      expect(s.state.pendingPrompt?.prompt.id).toBe('lock-direction');
      answer(s, 'self');
      expect(s.state.pendingPrompt?.prompt.id).toBe('lock-box');
      const r = answer(s, true);
      if (s.state.turn - turn0 < 2) continue;
      expect(textOf(r)).toContain('You succeed in unlocking the box.');
      expect(itemOf(s.state, box).locked).toBeUndefined();
      expect(nameOf(s, box)).toBe('unlocked large box');
      return;
    }
    throw new Error('no seed found');
  });

  test('an interrupted attempt resumes when the tool is applied again', () => {
    for (let seed = 1; seed < 400; seed++) {
      const s = make(['@....'], seed);
      hero(s).c.attributes!.dex = 3;
      const box = s.floor('nh:chest');
      itemOf(s.state, box).locked = true;
      const card = s.carry('nh:credit_card'); // dex% a turn
      s.mod('nh:apply', { item: card });
      answer(s, 'self');
      // one move only, then something else
      const p = s.state.pendingPrompt!.prompt;
      engine.step(s.state, { type: 'answer', promptId: p.id, value: true });
      if (!s.state.occupation) continue;
      s.step({ type: 'search' });
      const r = s.mod('nh:apply', { item: card });
      expect(textOf(r)[0]).toBe('You resume your attempt at picking the lock.');
      // eventually done (or given up after 50 turns)
      const all = textOf(r).join(' ');
      if (!itemOf(s.state, box).locked) expect(all).toContain('You succeed in picking the lock.');
      return;
    }
    throw new Error('no seed found');
  });

  test('a credit card cannot lock a door or a box', () => {
    const s = make(['@....']);
    setTerrain(levelOf(s), 1, 0, T.door_closed);
    const card = s.carry('nh:credit_card');
    s.mod('nh:apply', { item: card });
    expect(textOf(answer(s, 'e'))).toEqual(["You can't lock a door with a credit card."]);
    expect(terrainAt(s, 1, 0)).toBe('nh:door_closed');
    s.floor('nh:large_box');
    s.mod('nh:apply', { item: card });
    answer(s, 'self');
    expect(textOf(answer(s, true))).toEqual(["You can't do that with a credit card."]);
  });

  test('a lock pick unlocks a door next to the hero (offered on the door cell)', () => {
    const s = make(['@....']);
    setTerrain(levelOf(s), 1, 0, T.door_locked);
    s.step({ type: 'wait' });
    const pick = s.carry('nh:lock_pick');
    expect(offersFor(s, { kind: 'cell', pos: { x: 1, y: 0 } })).toContain('nh:lock');
    s.mod('nh:lock', { item: pick, dir: 'e' });
    expect(s.state.pendingPrompt?.prompt.key).toBe('lock.unlock_it');
    const r = answer(s, true);
    expect(textOf(r).at(-1)).toBe('You succeed in picking the lock.');
    expect(terrainAt(s, 1, 0)).toBe('nh:door_closed');
    // and locks it again
    s.mod('nh:lock', { item: pick, dir: 'e' });
    expect(s.state.pendingPrompt?.prompt.key).toBe('lock.lock_it');
    expect(textOf(answer(s, true)).at(-1)).toBe('You succeed in locking the door.');
    expect(terrainAt(s, 1, 0)).toBe('nh:door_locked');
  });

  test('#loot of a locked box: "Hmmm, ... turns out to be locked", then unlocking with a key', () => {
    const s = make(['@....']);
    const box = s.floor('nh:large_box');
    itemOf(s.state, box).locked = true;
    expect(textOf(s.mod('nh:loot', { box }))).toEqual([
      'Hmmm, the large box turns out to be locked.',
    ]);
    expect(textOf(s.mod('nh:loot', { box }))).toEqual(['The large box is locked.']);
    s.carry('nh:skeleton_key');
    s.mod('nh:loot', { box });
    expect(s.state.pendingPrompt?.prompt.id).toBe('lock-auto');
    answer(s, true);
    expect(itemOf(s.state, box).locked).toBeUndefined();
  });
});

describe('containers', () => {
  /** A sack on the floor holding `n` daggers and a food ration. */
  function sackHere(s: S, n = 5) {
    const sack = s.floor('nh:sack');
    const daggers = s.give('nh:dagger', { quantity: n });
    const ration = s.give('nh:food_ration');
    // mksobj without a place leaves them detached: put them straight in
    s.state.entities[String(daggers)]!.c.item!.containedIn = sack;
    s.state.entities[String(ration)]!.c.item!.containedIn = sack;
    return { sack, daggers, ration };
  }

  test('#loot takes some of a stack out and puts some back in, with counts', () => {
    const s = make(['@....']);
    const { sack, daggers } = sackHere(s);
    expect(offersFor(s, { kind: 'self' })).toContain('nh:loot');
    s.mod('nh:loot', { box: sack });
    const what = s.state.pendingPrompt!.prompt;
    expect(what.options?.map((o) => o.value)).toEqual(['o', 'i', 'b', 'q']);
    answer(s, 'o');
    expect(s.state.pendingPrompt?.prompt.id).toBe('loot-out');
    const turn0 = s.state.turn;
    answer(s, [{ value: daggers, count: 2 }]);
    expect(s.state.turn).toBeGreaterThan(turn0);
    const mine = inventoryOf(s.state, s.state.playerId).filter((e) => e.def === 'nh:dagger');
    expect(mine.reduce((n, e) => n + (e.c.item?.quantity ?? 0), 0)).toBeGreaterThanOrEqual(2);
    expect(itemOf(s.state, daggers).quantity).toBe(3);
    expect(nameOf(s, sack)).toBe('bag containing 2 items');

    // put one dagger back in: it merges with the 3 inside
    const out = mine.find((e) => e.id !== daggers && e.c.item?.equipped === null)!;
    s.mod('nh:loot', { box: sack });
    answer(s, 'i');
    expect(s.state.pendingPrompt?.prompt.id).toBe('loot-in');
    const r = answer(s, [{ value: out.id, count: 1 }]);
    expect(textOf(r)[0]).toBe('You put an uncursed +0 dagger into the bag.');
    expect(itemOf(s.state, daggers).quantity).toBe(4);
  });

  test('a bag of holding weighs half its contents (a quarter blessed, double cursed)', () => {
    const s = make(['@....']);
    const boh = s.carry('nh:bag_of_holding');
    const rocks = s.give('nh:food_ration', { quantity: 3 }); // 20 each
    s.state.entities[String(rocks)]!.c.item!.containedIn = boh;
    const e = () => s.state.entities[String(boh)]!;
    expect(weight(defs, e(), s.state)).toBe(15 + 30);
    itemOf(s.state, boh).buc = 'blessed';
    expect(weight(defs, e(), s.state)).toBe(15 + 15);
    itemOf(s.state, boh).buc = 'cursed';
    expect(weight(defs, e(), s.state)).toBe(15 + 120);
    // carried contents count toward the load
    const before = invWeight(s.state, defs, s.state.playerId);
    itemOf(s.state, boh).buc = 'uncursed';
    expect(invWeight(s.state, defs, s.state.playerId)).toBe(before - 120 + 30);
  });

  test('a bag of holding put into another explodes; both and the bag are gone', () => {
    const s = make(['@....']);
    const outer = s.carry('nh:bag_of_holding');
    const inner = s.carry('nh:bag_of_holding');
    const hp0 = hero(s).c.hp!.cur;
    s.mod('nh:apply', { item: outer });
    answer(s, 'i');
    const r = answer(s, [inner]);
    expect(textOf(r)[0]).toBe('As you put a bag inside, you are blasted by a magical explosion!');
    expect(s.state.entities[String(outer)]).toBeUndefined();
    expect(s.state.entities[String(inner)]).toBeUndefined();
    expect(hero(s).c.hp!.cur).toBeLessThan(hp0);
  });

  test('a carried locked box must be put down to unlock', () => {
    const s = make(['@....']);
    const box = s.carry('nh:large_box');
    itemOf(s.state, box).locked = true;
    expect(textOf(s.mod('nh:apply', { item: box }))).toEqual([
      'The large box is locked.',
      'You must put it down to unlock.',
    ]);
    expect(nameOf(s, box)).toBe('locked large box');
  });

  test('a lit lamp put into a sack goes out', () => {
    const s = make(['@....']);
    const sack = s.carry('nh:sack');
    const lamp = s.carry('nh:brass_lantern');
    itemOf(s.state, lamp).age = 500;
    s.mod('nh:apply', { item: lamp });
    expect(itemOf(s.state, lamp).lit).toBe(true);
    s.mod('nh:apply', { item: sack });
    answer(s, 'i');
    const r = answer(s, [lamp]);
    expect(textOf(r)).toContain('The brass lantern goes out!');
    expect(itemOf(s.state, lamp).lit).toBeUndefined();
    expect(contents(s.state, sack).map((e) => e.id)).toEqual([lamp]);
  });
});

describe('lamps', () => {
  test('a lit lamp lights a dark corridor cell, flickers, and burns out', () => {
    const s = make(['@........']);
    const lv = levelOf(s);
    lv.lit = lv.lit.map(() => 0);
    s.step({ type: 'wait' });
    const lamp = s.carry('nh:oil_lamp');
    itemOf(s.state, lamp).age = 60;
    const hx = hero(s).c.pos!.x;
    const cell = cellIndex(lv, hx + 2, 0);
    expect(isVisible(s.state, cell)).toBe(false);
    expect(textOf(s.mod('nh:apply', { item: lamp }))).toEqual(['Your lamp is now on.']);
    expect(isVisible(s.state, cell)).toBe(true);
    expect(nameOf(s, lamp)).toBe('lamp (lit)');
    const seen: string[] = [];
    for (let i = 0; i < 70 && itemOf(s.state, lamp).lit; i++)
      seen.push(...textOf(s.step({ type: 'wait' })).filter((t) => t.includes('lamp')));
    expect(seen).toEqual([
      'Your lamp flickers considerably.',
      'Your lamp seems about to go out.',
      'Your lamp has gone out.',
    ]);
    expect(itemOf(s.state, lamp).age).toBe(0);
    expect(isVisible(s.state, cell)).toBe(false);
    expect(textOf(s.mod('nh:apply', { item: lamp }))[0]).toBe('This lamp has no oil.');
  });

  test('turning a lamp off keeps the unused fuel', () => {
    const s = make(['@....']);
    const lamp = s.carry('nh:brass_lantern');
    itemOf(s.state, lamp).age = 400;
    s.mod('nh:apply', { item: lamp });
    s.step({ type: 'wait' });
    s.step({ type: 'wait' });
    expect(textOf(s.mod('nh:apply', { item: lamp }))).toEqual(['Your lantern is now off.']);
    const left = itemOf(s.state, lamp).age!;
    expect(left).toBeLessThan(400);
    expect(left).toBeGreaterThan(390);
  });
});

describe('whistles', () => {
  test('a magic whistle brings a pet next to the hero and is identified', () => {
    const s = make(['@.........']);
    const pet = addMon(s.state, 'nh:kitten', 9, 0, { peaceful: true });
    s.state.entities[String(pet)]!.c.monster!.tame = 10;
    s.state.entities[String(pet)]!.c.actor!.speed = 0; // pinned: it stays where the whistle puts it
    s.step({ type: 'wait' });
    const w = s.carry('nh:magic_whistle');
    expect(nameOf(s, w)).toBe('whistle');
    const r = s.mod('nh:apply', { item: w });
    expect(textOf(r)[0]).toBe('You produce a strange whistling sound.');
    const p = s.state.entities[String(pet)]!.c.pos!;
    expect(Math.max(Math.abs(p.x - hero(s).c.pos!.x), Math.abs(p.y - hero(s).c.pos!.y))).toBe(1);
    expect(nameOf(s, w)).toBe('magic whistle');
  });

  test('a tin whistle wakes sleeping monsters nearby', () => {
    const s = make(['@.........']);
    const newt = addMon(s.state, 'nh:newt', 3, 0, { asleep: true });
    const w = s.carry('nh:tin_whistle');
    const r = s.mod('nh:apply', { item: w });
    expect(textOf(r)[0]).toBe('You produce a high whistling sound.');
    expect(s.state.entities[String(newt)]!.c.monster!.asleep).toBe(false);
  });
});

describe('blindfold', () => {
  test('wearing a blindfold blinds the hero; removing it restores sight', () => {
    const s = make(['@....']);
    const b = s.carry('nh:blindfold');
    expect(offersFor(s, { kind: 'item', id: b })).toContain('nh:puton');
    const r = s.mod('nh:puton', { item: b });
    expect(textOf(r)).toEqual(['You are now wearing a blindfold.', "You can't see any more."]);
    expect(heroHas(s.state, P.BLINDED)).toBe(true);
    expect(isVisible(s.state, cellIndex(levelOf(s), 2, 0))).toBe(false);
    expect(nameOf(s, b)).toBe('blindfold (being worn)');
    expect(offersFor(s, { kind: 'item', id: b })).toContain('nh:remove');
    expect(textOf(s.mod('nh:remove', { item: b }))).toEqual([
      'You were wearing a blindfold.',
      'You can see again.',
    ]);
    expect(heroHas(s.state, P.BLINDED)).toBe(false);
    // apply toggles it too
    s.mod('nh:apply', { item: b });
    expect(heroHas(s.state, P.BLINDED)).toBe(true);
  });
});
