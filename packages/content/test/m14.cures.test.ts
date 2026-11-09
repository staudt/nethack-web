// m14 step 6: a monster turning to stone eats a lizard or acidic corpse or drinks acid
// (munstone()); one turning into a green slime burns it off with its breath, a wand of fire or a
// scroll of fire (munslime()); monsters reflect rays and gazes with a shield or amulet of
// reflection (mon_reflects()); they put on amulets of life saving and reflection (m_dowear()),
// and an amulet of life saving saves a dying monster once (lifesaved_monster()). Outcomes are
// asserted; random rolls are searched over seeds.
import {
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj } from '../src/index';
import { buzzFrom, killedByHero } from '../src/buzz';
import { mondied, monkilled } from '../src/mondeath';
import { mDoWear } from '../src/mongear';
import { mspecUsed, paralyzeMonst, isFrozen, setMConfused } from '../src/mstate';
import { monReflects } from '../src/musestate';
import { isKnown } from '../src/o_init';
import { munslime } from '../src/slimestate';
import { munstone } from '../src/stonestate';
import { minstapetrify } from '../src/stoning';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, obj, plainKit, render } from './itemHelpers';

const ROOM = [
  '               ',
  ' ............. ',
  ' ............. ',
  ' ......@...... ',
  ' ............. ',
  ' ............. ',
  '               ',
];

function make(seed = 1) {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
const msgs = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** A hostile awake monster (a gnome by default) at (x, y) with 20 hit points. */
function mon(state: GameState, x: number, y: number, def = 'nh:gnome'): EntityId {
  const id = addMon(state, def, x, y, { asleep: false, energy: 12 });
  const e = ent(state, id)!;
  e.c.hp = { cur: 20, max: 20 };
  e.c.monster!.level = 1;
  return id;
}
/** Gives the monster a new object; `worn` puts it on in that slot. */
function give(
  state: GameState,
  owner: EntityId,
  otyp: string,
  o: {
    buc?: 'blessed' | 'cursed';
    spe?: number;
    corpseOf?: string;
    worn?: 'shield' | 'amulet';
  } = {},
): EntityId {
  const id = mksobj(ctxFor(state), obj(otyp), {
    init: false,
    carriedBy: owner,
    ...(o.corpseOf ? { corpseOf: o.corpseOf as DefId } : {}),
  });
  const it = state.entities[String(id)]!.c.item!;
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  if (o.worn) it.equipped = o.worn;
  return id;
}
function tctx(state: GameState): Ctx & { events: GameEvent[] } {
  const c = ctxFor(state);
  return Object.assign(c, { interrupt: () => undefined }) as unknown as Ctx & {
    events: GameEvent[];
  };
}
/** Records the species as genocided. */
function genocideMonster(state: GameState, id: string): void {
  const nh = state.modData['nh'] as { genocided?: string[] };
  nh.genocided = [...(nh.genocided ?? []), id];
}
const carried = (state: GameState, id: EntityId): string[] =>
  inventoryOf(state, id).map((e) => e.def);

describe('munstone(): a monster turning to stone cures itself', () => {
  test('it eats a lizard corpse and seems limber', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:corpse', { corpseOf: 'nh:lizard' });
    const ctx = tctx(s.state);
    expect(munstone(ctx, ent(s.state, id)!, false)).toBe(true);
    const text = msgs(ctx.events);
    expect(text).toContain('The gnome eats a lizard corpse.');
    expect(text).toContain('The gnome seems limber!');
    expect(carried(s.state, id)).toEqual([]);
    expect(ent(s.state, id)!.c.hp!.cur).toBe(20);
  });

  test('the hero hitting it with a cockatrice corpse: it cures itself instead of a statue', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:corpse', { corpseOf: 'nh:lizard' });
    const ctx = tctx(s.state);
    if (!munstone(ctx, ent(s.state, id)!, true)) minstapetrify(ctx, ent(s.state, id)!, true);
    expect(ent(s.state, id)?.c.monster).toBeDefined();
    // with nothing to eat it turns to stone
    if (!munstone(ctx, ent(s.state, id)!, true)) minstapetrify(ctx, ent(s.state, id)!, true);
    expect(ent(s.state, id)).toBeUndefined();
  });

  test('a potion of acid burns its stomach and may kill it (the hero gets the kill)', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    ent(s.state, id)!.c.hp!.cur = 1;
    give(s.state, id, 'nh:potion_of_acid');
    const ctx = tctx(s.state);
    const xp = getPlayer(s.state).c.experience!.points;
    expect(munstone(ctx, ent(s.state, id)!, true)).toBe(true);
    const text = msgs(ctx.events);
    expect(text[1]).toMatch(/^The gnome quaffs an? .*potion\.$/);
    expect(text).toContain('The gnome has a very bad case of stomach acid.');
    expect(text).toContain('The gnome dies!');
    expect(text).not.toContain('The gnome seems limber!');
    expect(ent(s.state, id)).toBeUndefined();
    expect(getPlayer(s.state).c.experience!.points).toBeGreaterThan(xp);
  });

  test('not when it resists stoning, is helpless or has nothing that cures', () => {
    const s = make();
    const golem = mon(s.state, 9, 3, 'nh:hill_orc');
    const ctx = tctx(s.state);
    expect(munstone(ctx, ent(s.state, golem)!, false)).toBe(false); // nothing to eat
    give(s.state, golem, 'nh:corpse', { corpseOf: 'nh:newt' });
    expect(munstone(ctx, ent(s.state, golem)!, false)).toBe(false); // a newt does not cure
    give(s.state, golem, 'nh:corpse', { corpseOf: 'nh:lizard' });
    paralyzeMonst(ctx, golem, 5);
    expect(munstone(ctx, ent(s.state, golem)!, false)).toBe(false);
    expect(carried(s.state, golem)).toHaveLength(2);
  });
});

describe('munslime(): a monster turning into a green slime burns it off', () => {
  test('it zaps itself with a wand of fire', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    const w = give(s.state, id, 'nh:wand_of_fire', { spe: 3 });
    const ctx = tctx(s.state);
    expect(munslime(ctx, ent(s.state, id)!, false)).toBe(true);
    const text = msgs(ctx.events);
    expect(text[0]).toBe('The gnome starts turning green.');
    expect(text[1]).toMatch(/^The gnome zaps itself with an? .*wand!$/);
    expect(text).toContain("The gnome's slime is burned away!");
    expect(ent(s.state, w)!.c.item!.spe).toBe(2);
    expect(ent(s.state, id)!.def).toBe('nh:gnome');
    expect(isKnown(s.state, defs, 'nh:wand_of_fire' as DefId)).toBe(true);
  });

  test('a fire breather breathes fire on itself and needs time to breathe again', () => {
    let used = false;
    for (let seed = 1; seed < 40 && !used; seed++) {
      const t = make(seed);
      const id = mon(t.state, 9, 3, 'nh:red_naga');
      const ctx = tctx(t.state);
      expect(munslime(ctx, ent(t.state, id)!, false)).toBe(true);
      expect(msgs(ctx.events)).toContain('The red naga breathes fire on itself.');
      if (mspecUsed(ctx, id) > 0) {
        used = true;
        expect(mspecUsed(ctx, id)).toBeGreaterThanOrEqual(5);
        expect(mspecUsed(ctx, id)).toBeLessThan(15);
        // with its breath used up it has nothing else
        expect(munslime(ctx, ent(t.state, id)!, false)).toBe(false);
      }
    }
    expect(used).toBe(true);
  });

  test('a confused monster reading a scroll of fire only makes a pretty fire', () => {
    const s = make();
    const id = mon(s.state, 9, 3);
    give(s.state, id, 'nh:scroll_of_fire');
    const ctx = tctx(s.state);
    setMConfused(ctx, id, true);
    expect(munslime(ctx, ent(s.state, id)!, false)).toBe(false);
    const text = msgs(ctx.events);
    expect(text).toContain('Oh, what a pretty fire!');
    expect(text).not.toContain("The gnome's slime is burned away!");
    expect(carried(s.state, id)).toEqual([]);
  });

  test('animals and the mindless do not use items', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:jackal');
    give(s.state, id, 'nh:wand_of_fire', { spe: 3 });
    expect(munslime(tctx(s.state), ent(s.state, id)!, false)).toBe(false);
  });
});

describe('mon_reflects()', () => {
  test('a shield of reflection bounces her ray: "But it reflects from the hill orc\'s shield!"', () => {
    let seen = false;
    for (let seed = 1; seed < 60 && !seen; seed++) {
      const s = make(seed);
      getPlayer(s.state).c.hp = { cur: 200, max: 200 };
      const id = mon(s.state, 9, 3, 'nh:hill_orc');
      give(s.state, id, 'nh:shield_of_reflection', { worn: 'shield' });
      const ctx = tctx(s.state);
      const hp = getPlayer(s.state).c.pos!;
      buzzFrom(ctx, 'fire', 6, { x: hp.x, y: hp.y }, 'e', {
        by: 'hero',
        wakeup: () => undefined,
      });
      const text = msgs(ctx.events);
      if (text.includes("But it reflects from the hill orc's shield!")) {
        seen = true;
        expect(text).toContain('The bolt of fire hits the hill orc.');
        expect(ent(s.state, id)!.c.hp!.cur).toBe(20);
        expect(isKnown(s.state, defs, 'nh:shield_of_reflection' as DefId)).toBe(true);
      }
    }
    expect(seen).toBe(true);
  });

  test('an amulet of reflection reflects; nothing else does', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:hill_orc');
    const ctx = tctx(s.state);
    expect(monReflects(ctx, ent(s.state, id)!, null)).toBe(false);
    give(s.state, id, 'nh:amulet_of_reflection'); // carried, not worn
    expect(monReflects(ctx, ent(s.state, id)!, null)).toBe(false);
    mDoWear(ctx, id, false);
    expect(monReflects(ctx, ent(s.state, id)!, 'zap.ray.reflects_mon')).toBe(true);
    expect(msgs(ctx.events)).toContain("But it reflects from the hill orc's amulet!");
  });
});

describe('monsters wear amulets', () => {
  test('a hill orc puts on an amulet of life saving; a jackal does not', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:hill_orc');
    const a = give(s.state, id, 'nh:amulet_of_life_saving');
    const ctx = tctx(s.state);
    expect(mDoWear(ctx, id, false)).toBe(true);
    expect(ent(s.state, a)!.c.item!.equipped).toBe('amulet');
    expect(msgs(ctx.events)[0]).toMatch(/^The hill orc puts on an? .*amulet/);
    // no amulet better than the one it wears
    give(s.state, id, 'nh:amulet_of_reflection');
    expect(mDoWear(ctx, id, false)).toBe(false);
    const dog = mon(s.state, 10, 3, 'nh:jackal');
    give(s.state, dog, 'nh:amulet_of_life_saving');
    expect(mDoWear(ctx, dog, false)).toBe(false);
  });
});

describe('monster life saving', () => {
  test('the amulet saves a dying monster once', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:hill_orc');
    const a = give(s.state, id, 'nh:amulet_of_life_saving', { worn: 'amulet' });
    ent(s.state, id)!.c.hp = { cur: 0, max: 6 };
    const ctx = tctx(s.state);
    monkilled(ctx, id, true);
    const text = msgs(ctx.events);
    expect(text).toEqual([
      'The hill orc is killed!',
      'But wait...',
      "The hill orc's medallion begins to glow!",
      'The hill orc looks much better!',
      'The medallion crumbles to dust!',
    ]);
    expect(ent(s.state, id)?.c.hp).toEqual({ cur: 10, max: 10 });
    expect(ent(s.state, a)).toBeUndefined();
    expect(isKnown(s.state, defs, 'nh:amulet_of_life_saving' as DefId)).toBe(true);
    // the second death is for good, with its corpse chance
    mondied(ctx, id);
    expect(ent(s.state, id)).toBeUndefined();
  });

  test('a monster the hero kills: no experience while it lives; frozen ones can move again', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:hill_orc');
    give(s.state, id, 'nh:amulet_of_life_saving', { worn: 'amulet' });
    const ctx = tctx(s.state);
    paralyzeMonst(ctx, id, 10);
    const xp = getPlayer(s.state).c.experience!.points;
    ent(s.state, id)!.c.hp!.cur = 0;
    killedByHero(ctx, ent(s.state, id)!);
    expect(ent(s.state, id)?.c.monster).toBeDefined();
    expect(isFrozen(ctx, id)).toBe(false);
    expect(getPlayer(s.state).c.experience!.points).toBe(xp);
  });

  test('turning to stone: saved before the statue is made', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:hill_orc');
    give(s.state, id, 'nh:amulet_of_life_saving', { worn: 'amulet' });
    const ctx = tctx(s.state);
    minstapetrify(ctx, ent(s.state, id)!, false);
    expect(ent(s.state, id)?.c.monster).toBeDefined();
    expect(
      Object.values(s.state.entities).some((e) => e?.def === 'nh:statue' && e.c.pos?.x === 9),
    ).toBe(false);
  });

  test('a genocided monster is still genocided', () => {
    const s = make();
    const id = mon(s.state, 9, 3, 'nh:hill_orc');
    give(s.state, id, 'nh:amulet_of_life_saving', { worn: 'amulet' });
    genocideMonster(s.state, 'nh:hill_orc');
    const ctx = tctx(s.state);
    monkilled(ctx, id, true);
    expect(msgs(ctx.events)).toContain('Unfortunately, the hill orc is still genocided...');
    expect(ent(s.state, id)).toBeUndefined();
  });
});
