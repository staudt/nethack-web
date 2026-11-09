// m7f-d step 4: what a form can wear, wield, carry and eat. break_armor() and drop_weapon() when
// she turns into a big, small, handless, centaur or headless form; the wear, put on, wield, apply,
// zap, throw, pick up, open and eat offers and refusals of a form; diet tastes; carrying capacity
// from the form; flying and infravision from the form; the NO_KILLER_PREFIX death text.
import {
  buildSnapshot,
  computeVisible,
  cellRules,
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
  type Offer,
  type Target,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { polymon, rehumanize } from '../src/polyself';
import { P, hasProp, setIntrinsic, wornIn } from '../src/props';
import { weightCap } from '../src/stats';
import { dotrap, TRAP } from '../src/trap';
import { flying } from '../src/trapstate';
import { addMon } from './helpers';
import { defs, itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
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

const ROOM = ['         ', ' ....... ', ' ...@... ', ' ....... ', '         '];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}
const act = (s: S, action: string, args: Record<string, unknown>): string[] =>
  textsOf(eng.step(s.state, { type: 'mod', action: action as DefId, args: args as never }).events);
const become = (s: S, id: string): string[] => run(s, (ctx) => polymon(ctx, id as DefId, false));
const hero = (s: S): Entity => getPlayer(s.state);
const offers = (s: S, target: Target): string[] =>
  eng
    .query(s.state)
    .actionsFor(target)
    .map((o: Offer) => (o.action.type === 'mod' ? o.action.action : o.action.type));
const worn = (s: S, slot: string): Entity | null => wornIn(s.state, s.state.playerId, slot);
const wear = (s: S, otyp: string, slot: string): EntityId => {
  const id = s.carry(otyp);
  itemOf(s.state, id).equipped = slot as never;
  return id;
};
const onFloor = (s: S): string[] =>
  itemsAt(defs, s.state, s.here.level, s.here.x, s.here.y).map((e) => e.def);
const carried = (s: S, id: EntityId): boolean =>
  s.state.entities[String(id)]?.c.item?.carriedBy === s.state.playerId;
/** The Valkyrie's kit: her wielded spear, alternate dagger and worn small shield. */
const kit = (s: S, def: string): Entity =>
  inventoryOf(s.state, s.state.playerId).find((e) => e.def === def)!;
/** She wields a long sword instead of her spear. */
function sword(s: S): Entity {
  kit(s, 'nh:spear').c.item!.equipped = null;
  const id = s.carry('nh:long_sword');
  itemOf(s.state, id).equipped = 'weapon';
  return s.state.entities[String(id)]!;
}

describe('break_armor(): what the new form sheds', () => {
  test('a big form breaks out of its suit, the cloak clasp breaks open', () => {
    const s = room();
    const suit = wear(s, 'nh:ring_mail', 'body');
    const cloak = wear(s, 'nh:orcish_cloak', 'cloak');
    const text = become(s, 'nh:ogre');
    expect(text).toContain('You break out of your armor!');
    expect(text).toContain('The clasp on your cloak breaks open!');
    expect(s.state.entities[String(suit)]).toBeUndefined();
    expect(carried(s, cloak)).toBe(false);
    expect(onFloor(s)).toContain('nh:orcish_cloak');
    // an ogre has hands: the shield and sword stay
    expect(worn(s, 'shield')?.def).toBe('nh:small_shield');
    expect(worn(s, 'weapon')?.def).toBe('nh:spear');
  });

  test('a mummy wrapping tears apart on a big form', () => {
    const s = room();
    const wrap = wear(s, 'nh:mummy_wrapping', 'cloak');
    expect(become(s, 'nh:mumak')).toContain('Your wrapping tears apart!');
    expect(s.state.entities[String(wrap)]).toBeUndefined();
  });

  test('a small form lets its armor fall and shrinks out of its cloak; a wrapping fits', () => {
    const s = room();
    wear(s, 'nh:ring_mail', 'body');
    const text = become(s, 'nh:gnome');
    expect(text).toContain('Your armor falls around you!');
    expect(onFloor(s)).toContain('nh:ring_mail');
    const t = room();
    wear(t, 'nh:orcish_cloak', 'cloak');
    expect(become(t, 'nh:gnome')).toContain('You shrink out of your cloak!');
    const u = room();
    wear(u, 'nh:mummy_wrapping', 'cloak');
    become(u, 'nh:gnome');
    expect(worn(u, 'cloak')?.def).toBe('nh:mummy_wrapping');
  });

  test('a handless form drops gloves and weapon, shield, helm and boots', () => {
    const s = room();
    wear(s, 'nh:leather_gloves', 'gloves');
    wear(s, 'nh:orcish_helm', 'helm');
    wear(s, 'nh:iron_shoes', 'boots');
    const text = become(s, 'nh:jackal');
    expect(text).toEqual(
      expect.arrayContaining([
        'You drop your gloves and weapon!',
        'You can no longer hold your shield!',
        'Your helm falls to the floor!',
        'Your boots are pushed off your feet!',
      ]),
    );
    for (const slot of ['gloves', 'weapon', 'shield', 'helm', 'boots'])
      expect(worn(s, slot)).toBeNull();
    expect(onFloor(s)).toEqual(
      expect.arrayContaining([
        'nh:leather_gloves',
        'nh:spear',
        'nh:small_shield',
        'nh:orcish_helm',
        'nh:iron_shoes',
      ]),
    );
  });

  test('a centaur form breaks out of its suit and loses its boots, keeps its hands', () => {
    const s = room();
    wear(s, 'nh:iron_shoes', 'boots');
    const text = become(s, 'nh:forest_centaur');
    expect(text).toContain('Your boots are pushed off your feet!');
    expect(worn(s, 'shield')?.def).toBe('nh:small_shield');
  });

  test('a headless form loses its blindfold', () => {
    const s = room();
    wear(s, 'nh:blindfold', 'blindfold');
    const text = become(s, 'nh:floating_eye');
    expect(text).toContain('Your blindfold falls off!');
    expect(onFloor(s)).toContain('nh:blindfold');
    expect(hasProp(hero(s), P.BLINDED)).toBe(false);
  });
});

describe('drop_weapon(): a form that cannot wield', () => {
  test('"You find you must drop your sword!"', () => {
    const s = room();
    const ls = sword(s);
    expect(become(s, 'nh:jackal')).toContain('You find you must drop your sword!');
    expect(carried(s, ls.id)).toBe(false);
  });

  test('a welded weapon is released and stays in the inventory', () => {
    const s = room();
    const ls = sword(s);
    ls.c.item!.buc = 'cursed';
    expect(become(s, 'nh:jackal')).toContain('You find you must release your sword!');
    expect(carried(s, ls.id)).toBe(true);
    expect(ls.c.item!.equipped).toBeNull();
  });

  test('a spear is named by its skill', () => {
    const s = room();
    expect(become(s, 'nh:newt')).toContain('You find you must drop your spear!');
  });
});

describe('what a form can put on and use', () => {
  test('armor: no hands, too big for a suit, hooves', () => {
    const s = room();
    const mail = s.carry('nh:ring_mail');
    become(s, 'nh:jackal');
    expect(offers(s, { kind: 'item', id: mail })).not.toContain('nh:wear');
    expect(act(s, 'nh:wear', { item: mail })).toContain(
      "You can't wear any armor in your current form.",
    );
    const t = room();
    const tmail = t.carry('nh:ring_mail');
    const cloak = t.carry('nh:orcish_cloak');
    become(t, 'nh:gnome');
    expect(act(t, 'nh:wear', { item: tmail })).toContain('The suit will not fit on your body.');
    expect(offers(t, { kind: 'item', id: cloak })).toContain('nh:wear'); // a small form's cloak
    const u = room();
    const boots = u.carry('nh:iron_shoes');
    become(u, 'nh:forest_centaur');
    expect(offers(u, { kind: 'item', id: boots })).not.toContain('nh:wear');
    expect(act(u, 'nh:wear', { item: boots })).toContain('You have too many hooves to wear boots.');
  });

  test('accessories: no limbs for a ring, no head for a blindfold', () => {
    const s = room();
    const ring = s.carry('nh:ring_of_adornment');
    const fold = s.carry('nh:blindfold');
    become(s, 'nh:snake');
    expect(offers(s, { kind: 'item', id: ring })).not.toContain('nh:puton');
    expect(act(s, 'nh:puton', { item: ring })).toContain(
      'You cannot make the ring stick to your body.',
    );
    expect(act(s, 'nh:puton', { item: fold })).toContain(
      'You have no head to wear a blindfold on.',
    );
  });

  test('wielding, applying, zapping and opening need hands', () => {
    const s = room();
    const dagger = kit(s, 'nh:dagger');
    const wand = s.carry('nh:wand_of_striking');
    become(s, 'nh:jackal');
    expect(offers(s, { kind: 'item', id: dagger.id })).not.toContain('nh:wield');
    expect(offers(s, { kind: 'item', id: wand })).not.toContain('nh:zap');
    expect(act(s, 'nh:wield', { item: dagger.id })).toContain("Don't be ridiculous!");
    expect(act(s, 'nh:zap', { item: wand })).toContain(
      "You aren't able to zap anything in your current form.",
    );
    expect(act(s, 'nh:apply', { item: wand })).toContain(
      "You aren't able to use or apply tools in your current form.",
    );
    expect(act(s, 'nh:open', { dir: 'e' })).toContain(
      "You can't open anything -- you have no hands!",
    );
  });

  test('throwing: notake and handless forms', () => {
    const s = room();
    const dagger = kit(s, 'nh:dagger');
    become(s, 'nh:snake');
    expect(offers(s, { kind: 'item', id: dagger.id })).not.toContain('nh:throw');
    expect(act(s, 'nh:throw', { item: dagger.id })).toContain(
      'You are physically incapable of throwing or shooting anything.',
    );
    const t = room();
    const tdagger = kit(t, 'nh:dagger');
    become(t, 'nh:jackal');
    expect(act(t, 'nh:throw', { item: tdagger.id })).toContain(
      "You can't throw or shoot without hands.",
    );
  });

  test('a notake form picks nothing up', () => {
    const s = room();
    const gem = s.floor('nh:dagger');
    become(s, 'nh:snake');
    expect(offers(s, { kind: 'self' })).not.toContain('nh:pickup');
    act(s, 'nh:pickup', {});
    expect(carried(s, gem)).toBe(false);
    const t = room();
    t.floor('nh:dagger');
    become(t, 'nh:jackal'); // no hands, but it can carry in its mouth
    expect(offers(t, { kind: 'self' })).toContain('nh:pickup');
  });
});

describe('eating by diet', () => {
  const corpse = (s: S, of: string): EntityId => s.carry('nh:corpse', { corpseOf: of as DefId });

  test('a carnivore finds a lizard delicious, a herbivore a lichen; a carnivore hates a lichen', () => {
    const s = room();
    const lizard = corpse(s, 'nh:lizard'); // never rots
    become(s, 'nh:jackal');
    expect(act(s, 'nh:eat', { item: lizard }).join(' ')).toContain('tastes delicious!');
    const t = room();
    const lichen = corpse(t, 'nh:lichen');
    become(t, 'nh:pony');
    expect(act(t, 'nh:eat', { item: lichen }).join(' ')).toContain('tastes delicious!');
    const u = room();
    const lichen2 = corpse(u, 'nh:lichen');
    become(u, 'nh:jackal');
    expect(act(u, 'nh:eat', { item: lichen2 }).join(' ')).toContain('tastes terrible!');
  });

  test('a carnivorous non-humanoid likes tripe; an orc form does not mind it', () => {
    const s = room();
    const tripe = s.carry('nh:tripe_ration');
    become(s, 'nh:jackal');
    expect(act(s, 'nh:eat', { item: tripe })).toContain('This tripe ration is surprisingly good!');
    const t = room();
    const tripe2 = t.carry('nh:tripe_ration');
    become(t, 'nh:hill_orc');
    expect(act(t, 'nh:eat', { item: tripe2 })).toContain('Mmm, tripe... not bad!');
  });

  test('a ghoul eats only meaty corpses', () => {
    const s = room();
    const ration = s.carry('nh:food_ration');
    const lichen = corpse(s, 'nh:lichen');
    const newt = corpse(s, 'nh:newt');
    become(s, 'nh:ghoul');
    expect(offers(s, { kind: 'item', id: ration })).not.toContain('nh:eat');
    expect(offers(s, { kind: 'item', id: lichen })).not.toContain('nh:eat');
    expect(offers(s, { kind: 'item', id: newt })).toContain('nh:eat');
    expect(act(s, 'nh:eat', { item: ration })).toContain('You cannot eat that!');
  });
});

describe('carrying capacity from the form', () => {
  const at = (s: S, str: number, con: number): void => {
    Object.assign(hero(s).c.attributes!, { str, con });
  };
  test('weight_cap(): a nymph carries the most, a jackal by its weight, an ogre by its', () => {
    const s = room();
    at(s, 16, 16); // 25 * 32 + 50 = 850
    expect(weightCap(s.state, defs, s.state.playerId)).toBe(850);
    become(s, 'nh:water_nymph');
    at(s, 16, 16);
    expect(weightCap(s.state, defs, s.state.playerId)).toBe(1000);
    const t = room();
    become(t, 'nh:jackal');
    at(t, 16, 16);
    expect(weightCap(t.state, defs, t.state.playerId)).toBe(Math.trunc((850 * 300) / 1450));
    const u = room();
    become(u, 'nh:ogre'); // strong, but heavier than a human
    at(u, 16, 16);
    expect(weightCap(u.state, defs, u.state.playerId)).toBe(Math.trunc((850 * 1600) / 1450));
    const v = room();
    become(v, 'nh:fog_cloud'); // no corpse weight: by its size (huge = 4 against a human's 2)
    at(v, 10, 10); // 550
    expect(weightCap(v.state, defs, v.state.playerId)).toBe(1000);
  });

  test('wounded legs do not lower a flyer’s capacity', () => {
    const s = room();
    become(s, 'nh:raven');
    at(s, 16, 16);
    const base = weightCap(s.state, defs, s.state.playerId);
    setIntrinsic(hero(s), P.WOUNDED_LEGS, true);
    expect(weightCap(s.state, defs, s.state.playerId)).toBe(base);
  });
});

describe('flying and infravision from the form', () => {
  test('a raven flies: over a seen pit, no fall through a trap door', () => {
    const s = room();
    become(s, 'nh:raven');
    expect(flying(s.ctx)).toBe(true);
    const lvl = s.state.levels['dlvl1']!;
    lvl.traps.push({ def: TRAP.pit, x: s.here.x, y: s.here.y, seen: true } as never);
    const text = run(s, (ctx) => dotrap(ctx, lvl.traps[0]!));
    expect(text).toContain('You fly over a pit.');
    expect(s.state.currentLevel).toBe('dlvl1');
  });

  test('a gnome form sees an infravisible jackal in the dark', () => {
    const s = room();
    const lvl = s.state.levels['dlvl1']!;
    lvl.lit = lvl.lit.map(() => 0);
    const jackal = addMon(s.state, 'nh:jackal', s.here.x + 3, s.here.y, { asleep: true });
    const seen = (): boolean =>
      buildSnapshot(eng.registry, s.state).entities.some((e) => e.id === jackal);
    s.state.visible = computeVisible(lvl, cellRules(lvl, defs), s.here);
    expect(seen()).toBe(false);
    become(s, 'nh:gnome');
    expect(seen()).toBe(true);
  });
});

describe('the death text', () => {
  test('dying stuck in a form is NO_KILLER_PREFIX', () => {
    const s = room();
    become(s, 'nh:jackal');
    setIntrinsic(hero(s), P.UNCHANGING, true);
    hero(s).c.hp!.cur = 0;
    run(s, (ctx) => rehumanize(ctx));
    expect(s.state.gameOver?.killer).toBe('!@killer.poly.stuck');
  });
});
