import { vanillaMod } from '@nh/content';
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type EntityId,
  type GameState,
  type Mod,
  type ObjectDef,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

// Content may not define objects yet, so the test brings its own.
const objDef = (
  name: string,
  cls: ObjectDef['class'],
  extra: Partial<ObjectDef> = {},
): ObjectDef => ({
  id: `ti:${name}`,
  nameKey: `obj.${name}`,
  class: cls,
  glyph: { ch: '%', fg: '#fff' },
  prob: 1,
  weight: 1,
  cost: 0,
  material: 'mineral',
  merge: cls === 'food',
  magic: false,
  delay: 0,
  ...extra,
});
const itemMod: Mod = {
  id: 'ti',
  version: '1.0.0',
  register(api) {
    api.defineObject(objDef('rock', 'food'));
    api.defineObject(objDef('sack', 'tool', { container: { capacity: null, box: false } }));
    api.defineObject(objDef('ring', 'ring'));
    api.defineObject(objDef('amulet', 'amulet'));
  },
};
const engine = createEngine([vanillaMod, itemMod]);
const reg = engine.registry;
const DEF = 'ti:rock';

const fresh = (): GameState => {
  const { state } = engine.newGame({ seed: 5 });
  engine.step(state, { type: 'wait' });
  return state;
};
const errs = (s: GameState): string => checkInvariants(s, reg).join('\n');

interface Opts {
  def?: `${string}:${string}`;
  pos?: boolean;
  carriedBy?: number | null;
  letter?: string | null;
  equipped?: import('@nh/core').EquipSlot | null;
  quantity?: number;
}
function add(s: GameState, o: Opts = {}): EntityId {
  const id = s.nextEntityId++;
  const hero = getPlayer(s).c.pos!;
  s.entities[String(id)] = {
    id,
    def: o.def ?? DEF,
    c: {
      ...(o.pos === false ? {} : { pos: { ...hero } }),
      item: {
        quantity: o.quantity ?? 1,
        buc: 'uncursed',
        spe: 0,
        known: { buc: false, spe: false },
        carriedBy: o.carriedBy ?? null,
        letter: o.letter ?? null,
        equipped: o.equipped ?? null,
        placed: 0,
      },
    },
  };
  return id;
}

describe('item invariants', () => {
  test('a floor item sharing a cell with the hero is fine', () => {
    const s = fresh();
    add(s);
    add(s);
    expect(errs(s)).toBe('');
  });

  test('a carried item with a letter is fine', () => {
    const s = fresh();
    add(s, { pos: false, carriedBy: s.playerId, letter: 'y' });
    expect(errs(s)).toBe('');
  });

  test('both pos and carriedBy', () => {
    const s = fresh();
    add(s, { carriedBy: s.playerId });
    expect(errs(s)).toMatch(/exactly one place/);
  });

  test('neither pos nor carriedBy', () => {
    const s = fresh();
    add(s, { pos: false });
    expect(errs(s)).toMatch(/exactly one place/);
  });

  test('a contained item has no pos and no carrier, inside a container item', () => {
    const s = fresh();
    const sack = add(s, { def: 'ti:sack' });
    const inner = add(s, { pos: false });
    s.entities[String(inner)]!.c.item!.containedIn = sack;
    expect(errs(s)).toBe('');
    s.entities[String(inner)]!.c.item!.carriedBy = s.playerId;
    expect(errs(s)).toMatch(/exactly one place/);
  });

  test('a contained item must be inside an existing container item', () => {
    const s = fresh();
    const rock = add(s);
    const inner = add(s, { pos: false });
    s.entities[String(inner)]!.c.item!.containedIn = rock;
    expect(errs(s)).toMatch(/which is not a container item/);
    s.entities[String(inner)]!.c.item!.containedIn = 4242;
    expect(errs(s)).toMatch(/contained in 4242, which is not a container item/);
  });

  test('containers may not nest in a loop', () => {
    const s = fresh();
    const a = add(s, { def: 'ti:sack', pos: false });
    const b = add(s, { def: 'ti:sack', pos: false });
    s.entities[String(a)]!.c.item!.containedIn = b;
    s.entities[String(b)]!.c.item!.containedIn = a;
    expect(errs(s)).toMatch(/nest in a loop/);
  });

  test('a contained item cannot be equipped', () => {
    const s = fresh();
    const sack = add(s, { def: 'ti:sack' });
    const inner = add(s, { pos: false, equipped: 'weapon' });
    s.entities[String(inner)]!.c.item!.containedIn = sack;
    expect(errs(s)).toMatch(/not carried but equipped/);
  });

  test('carrier missing', () => {
    const s = fresh();
    add(s, { pos: false, carriedBy: 4242 });
    expect(errs(s)).toMatch(/carried by missing entity 4242/);
  });

  test('duplicate letter for the same carrier, but not across carriers', () => {
    const s = fresh();
    const mon = s.nextEntityId++;
    s.entities[String(mon)] = { id: mon, def: getPlayer(s).def, c: {} };
    add(s, { pos: false, carriedBy: s.playerId, letter: 'y' });
    add(s, { pos: false, carriedBy: mon, letter: 'y' });
    expect(errs(s)).not.toMatch(/share letter/);
    add(s, { pos: false, carriedBy: s.playerId, letter: 'y' });
    expect(errs(s)).toMatch(/share letter/);
  });

  test('a floor item may keep its letter but not be equipped', () => {
    let s = fresh();
    add(s, { equipped: 'weapon' });
    expect(errs(s)).toMatch(/not carried but equipped/);
    s = fresh();
    add(s, { letter: 'b' });
    expect(errs(s)).toBe('');
  });

  test.each([0, -1, 1.5])('quantity %s', (q) => {
    const s = fresh();
    add(s, { quantity: q });
    expect(errs(s)).toMatch(/not a positive integer/);
  });

  test('unregistered def', () => {
    const s = fresh();
    add(s, { def: 'zz:nothing' });
    expect(errs(s)).toMatch(/'zz:nothing' is not a registered object/);
  });
});

describe('carrier, equipment and hunger invariants', () => {
  const bare = (): GameState => {
    const s = fresh();
    for (const e of inventoryOf(s, s.playerId)) delete s.entities[String(e.id)];
    return s;
  };
  const heroCarries = (s: GameState, o: Opts): EntityId =>
    add(s, { pos: false, carriedBy: s.playerId, letter: 'y', ...o });

  test('two wielded items for one carrier', () => {
    const s = bare();
    heroCarries(s, { equipped: 'weapon', letter: 'x' });
    expect(errs(s)).toBe('');
    heroCarries(s, { equipped: 'weapon', letter: 'z' });
    expect(errs(s)).toMatch(/both occupy slot/);
  });

  test('a monster that is off any level cannot carry', () => {
    const s = bare();
    const mon = s.nextEntityId++;
    s.entities[String(mon)] = { id: mon, def: getPlayer(s).def, c: {} };
    add(s, { pos: false, carriedBy: mon });
    expect(errs(s)).toMatch(/is not on a level/);
    s.entities[String(mon)]!.c.pos = { level: 'nowhere', x: 0, y: 0 };
    expect(errs(s)).toMatch(/is not on a level/);
  });

  test('hero letters must be in $a-zA-Z#', () => {
    const s = bare();
    heroCarries(s, { letter: '#' });
    expect(errs(s)).toBe('');
    heroCarries(s, { letter: '$' });
    expect(errs(s)).toBe('');
    heroCarries(s, { letter: '!' });
    expect(errs(s)).toMatch(/not in \$a-zA-Z#/);
    const t = bare();
    heroCarries(t, { letter: null });
    expect(errs(t)).toMatch(/not in \$a-zA-Z#/);
  });

  test('armor in the wrong slot', () => {
    const s = bare();
    heroCarries(s, { def: 'nh:small_shield', equipped: 'shield' });
    expect(errs(s)).toBe('');
    heroCarries(s, { def: 'nh:small_shield', equipped: 'helm', letter: 'q' });
    expect(errs(s)).toMatch(/worn in slot helm/);
  });

  test('one ring per hand, and only rings on hands', () => {
    const s = bare();
    heroCarries(s, { def: 'ti:ring', equipped: 'ringL', letter: 'a' });
    heroCarries(s, { def: 'ti:ring', equipped: 'ringR', letter: 'b' });
    heroCarries(s, { def: 'ti:amulet', equipped: 'amulet', letter: 'c' });
    expect(errs(s)).toBe('');
    heroCarries(s, { def: 'ti:ring', equipped: 'ringL', letter: 'd' });
    expect(errs(s)).toMatch(/both occupy slot \d+:ringL/);
    const t = bare();
    heroCarries(t, { def: 'ti:amulet', equipped: 'ringR' });
    expect(errs(t)).toMatch(/\(amulet\) worn in slot ringR/);
    const u = bare();
    heroCarries(u, { def: 'ti:ring', equipped: 'amulet' });
    expect(errs(u)).toMatch(/\(ring\) worn in slot amulet/);
    const w = bare();
    heroCarries(w, { def: 'ti:ring', equipped: 'blindfold' });
    expect(errs(w)).toMatch(/worn in slot blindfold/);
  });

  test('nutrition must be an integer', () => {
    const s = bare();
    getPlayer(s).c.hunger!.nutrition = 12.5;
    expect(errs(s)).toMatch(/nutrition 12.5 is not an integer/);
  });

  test('helpless must lie in the future', () => {
    const s = bare();
    getPlayer(s).c.helpless = { until: s.turn + 3, reasonKey: 'x' };
    expect(errs(s)).toBe('');
    getPlayer(s).c.helpless = { until: s.turn, reasonKey: 'x' };
    expect(errs(s)).toMatch(/helpless until/);
  });
});
