// m10 step 5: armed humanoids, trolls and eaters. Elves', centaurs', ogres', trolls' and
// soldiers' starting gear, troll corpses reviving, rust monsters and rock moles eating metal,
// gelatinous cubes eating and engulfing objects, purple worms eating corpses. Seeds are searched
// for the case a test needs, never lucky.
// ref: src/makemon.c m_initweap(), m_initinv(); src/mkobj.c start_corpse_timeout(); src/do.c
// revive_mon(), revive_corpse(); src/mon.c meatmetal(), meatobj(), meatcorpse()
import {
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { startCorpseTimeout } from '../src/corpses';
import { mkcorpse, mksobj } from '../src/items';
import { meatcorpse, meatmetal, meatobj } from '../src/meat';
import { mInitInv, mInitWeap } from '../src/mongear';
import { isMStunned } from '../src/mstate';
import { MUSE_ITEMS, addMon } from './helpers';
import { ctxFor, defs, levelSetup, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;
const ROOM = [
  '...............',
  '...............',
  '.......@.......',
  '...............',
  '...............',
];
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  s.step({ type: 'wait' });
  return s;
}
const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
/** A test Ctx (with its events) for the eaters. */
const cx = (s: S): Ctx & { events: GameEvent[] } =>
  ctxFor(s.state) as unknown as Ctx & { events: GameEvent[] };
/** s.ctx with a schedule() that files real timers, as the engine's does. */
function timed(s: S): S['ctx'] {
  const state = s.state;
  return {
    ...s.ctx,
    schedule: (delay: number, kind: string, data: unknown) => {
      const t = {
        at: state.turn + delay,
        seq: state.seq++,
        kind: kind as DefId,
        data: data as never,
      };
      const i = state.timers.findIndex((o) => o.at > t.at);
      state.timers.splice(i === -1 ? state.timers.length : i, 0, t);
    },
  };
}
function monAt(s: S, def: string, x: number, y: number): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: true });
  const e = ent(s, id);
  e.c.hp = { cur: 1, max: 50 };
  e.c.actor!.speed = 0;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
const carried = (s: S, id: EntityId): string[] =>
  sortedIds(s.state)
    .map((i) => s.state.entities[String(i)]!)
    .filter((e) => e.c.item?.carriedBy === id)
    .map((e) => e.def);
const texts = (events: readonly { type: string; key?: string; params?: unknown }[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg'
      ? [render({ key: e.key!, ...(e.params ? { params: e.params as never } : {}) })]
      : [],
  );

describe('starting gear (m_initweap, m_initinv)', () => {
  function gear(def: string, n: number): string[][] {
    const out: string[][] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = room(seed);
      const id = monAt(s, def, 1, 0);
      mInitWeap(ctxFor(s.state), id);
      mInitInv(ctxFor(s.state), id, 5);
      out.push(carried(s, id).filter((d) => d !== 'nh:gold_piece' && !MUSE_ITEMS.has(d)));
    }
    return out;
  }

  test('elves carry only elven gear, a bow always with its arrows', () => {
    const elven = new Set([
      'nh:elven_mithril_coat',
      'nh:elven_cloak',
      'nh:elven_leather_helm',
      'nh:elven_boots',
      'nh:elven_shield',
      'nh:elven_dagger',
      'nh:elven_bow',
      'nh:elven_arrow',
      'nh:elven_short_sword',
      'nh:elven_broadsword',
      'nh:elven_spear',
    ]);
    const g = gear('nh:grey_elf', 60);
    for (const d of g) {
      for (const x of d) expect(elven.has(x)).toBe(true);
      expect(d.includes('nh:elven_bow')).toBe(d.includes('nh:elven_arrow'));
    }
    for (const x of elven) expect(g.some((d) => d.includes(x))).toBe(true);
  });

  test('a forest centaur may get a bow and arrows, a plains centaur a crossbow and bolts', () => {
    const forest = gear('nh:forest_centaur', 30);
    expect(forest.some((d) => d.includes('nh:bow') && d.includes('nh:arrow'))).toBe(true);
    for (const d of forest) expect(d.every((x) => x === 'nh:bow' || x === 'nh:arrow')).toBe(true);
    const plains = gear('nh:plains_centaur', 30);
    expect(plains.some((d) => d.includes('nh:crossbow') && d.includes('nh:crossbow_bolt'))).toBe(
      true,
    );
    for (const d of plains)
      expect(d.every((x) => x === 'nh:crossbow' || x === 'nh:crossbow_bolt')).toBe(true);
  });

  test('ogres carry a club or a battle-axe; trolls a polearm half the time', () => {
    const ogres = gear('nh:ogre_lord', 60);
    for (const d of ogres) {
      expect(d.length).toBe(1);
      expect(['nh:club', 'nh:battle_axe']).toContain(d[0]);
    }
    const axes = ogres.filter((d) => d.includes('nh:battle_axe')).length;
    expect(axes).toBeGreaterThan(2); // 1 in 6 for an ogre lord
    expect(axes).toBeLessThan(25);
    const trolls = gear('nh:troll', 40);
    const polearms = ['nh:ranseur', 'nh:partisan', 'nh:glaive', 'nh:spetum'];
    for (const d of trolls) {
      expect(d.length).toBeLessThanOrEqual(1);
      for (const x of d) expect(polearms).toContain(x);
    }
    const armed = trolls.filter((d) => d.length > 0).length;
    expect(armed).toBeGreaterThan(8);
    expect(armed).toBeLessThan(32);
  });

  test('soldiers get a polearm, spear, short sword, dagger or knife; sergeants a flail or mace', () => {
    const weapons = (d: string[]) => d.filter((x) => defs.object(x as DefId).class === 'weapon');
    const isPolearm = (x: string) => defs.object(x as DefId).weapon?.skill === 'polearms';
    const soldiers = gear('nh:soldier', 40).map(weapons);
    for (const d of soldiers) {
      expect(d.length).toBeGreaterThan(0);
      for (const x of d)
        if (!isPolearm(x))
          expect(['nh:spear', 'nh:short_sword', 'nh:dagger', 'nh:knife']).toContain(x);
    }
    // a polearm always comes with a dagger or a knife
    const poled = soldiers.filter((d) => d.some(isPolearm));
    expect(poled.length).toBeGreaterThan(3);
    for (const d of poled) expect(d.some((x) => x === 'nh:dagger' || x === 'nh:knife')).toBe(true);
    const sergeants = gear('nh:sergeant', 40).map(weapons);
    for (const d of sergeants) {
      expect(d.some((x) => x === 'nh:mace' || x === 'nh:flail')).toBe(true);
      for (const x of d) expect(['nh:mace', 'nh:flail', 'nh:knife']).toContain(x);
    }
    expect(sergeants.some((d) => d.includes('nh:flail'))).toBe(true);
    expect(sergeants.some((d) => d.includes('nh:mace'))).toBe(true);
  });
});

describe('troll corpses revive', () => {
  test('a troll corpse usually gets a revival timer instead of rotting (searched)', () => {
    let revive = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const c = mkcorpse(s.ctx, defs.monster('nh:troll' as DefId), {
        at: { level: 'dlvl1', x: 9, y: 2 },
      });
      startCorpseTimeout(timed(s), c);
      const kinds = s.state.timers
        .filter((t) => (t.data as { id?: number } | null)?.id === c)
        .map((t) => t.kind);
      expect(kinds.length).toBe(1);
      if (kinds[0] === 'nh:revive_mon') revive++;
    }
    expect(revive).toBeGreaterThan(8); // about 75%
  });

  test('a jackal corpse never does', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = room(seed);
      const c = mkcorpse(s.ctx, defs.monster('nh:jackal' as DefId), {
        at: { level: 'dlvl1', x: 9, y: 2 },
      });
      startCorpseTimeout(timed(s), c);
      expect(s.state.timers.some((t) => t.kind === 'nh:revive_mon')).toBe(false);
    }
  });

  test('when the timer fires the troll rises where its corpse was, in view', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const c = mkcorpse(s.ctx, defs.monster('nh:troll' as DefId), {
        at: { level: 'dlvl1', x: 10, y: 2 },
      });
      startCorpseTimeout(timed(s), c);
      if (!s.state.timers.some((t) => t.kind === 'nh:revive_mon')) continue;
      const seen: string[] = [];
      for (let i = 0; i < 120 && s.state.entities[String(c)]; i++)
        seen.push(...s.text(s.step({ type: 'search' })));
      expect(s.state.entities[String(c)]).toBeUndefined();
      const troll = sortedIds(s.state)
        .map((i) => s.state.entities[String(i)]!)
        .find((e) => e.def === 'nh:troll');
      expect(troll).toBeDefined();
      expect(seen).toContain('The troll rises from the dead!');
      return;
    }
    throw new Error('no seed gave a revival timer');
  });
});

describe('eaters (meatmetal, meatobj, meatcorpse)', () => {
  const at = { level: 'dlvl1', x: 3, y: 0 };
  const put = (s: S, def: string, o: Parameters<typeof mksobj>[2] = {}): EntityId =>
    mksobj(s.ctx, defs.object(def as DefId), { init: false, at, ...o });
  /** The first seed where `f` reports 1 (obj_resists' 5% can say no). */
  function first<T>(f: (s: S) => T | null): T {
    for (let seed = 1; seed <= 20; seed++) {
      const r = f(room(seed));
      if (r !== null) return r;
    }
    throw new Error('no seed');
  }

  test('a rust monster eats an iron dagger on its square: "The rust monster eats a dagger!"', () => {
    const s = first((s) => {
      const id = monAt(s, 'nh:rust_monster', 3, 0);
      const dagger = put(s, 'nh:dagger');
      const c = cx(s);
      return meatmetal(c, ent(s, id)) === 1 ? { s, dagger, c } : null;
    });
    expect(s.s.state.entities[String(s.dagger)]).toBeUndefined();
    expect(texts(s.c.events)).toContain('The rust monster eats a dagger!');
  });

  test('it leaves a mithril coat alone (not rustprone); a rock mole does not', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = room(seed);
      const id = monAt(s, 'nh:rust_monster', 3, 0);
      put(s, 'nh:elven_mithril_coat');
      expect(meatmetal(cx(s), ent(s, id))).toBe(0);
    }
    const r = first((s) => {
      const id = monAt(s, 'nh:rock_mole', 3, 0);
      const coat = put(s, 'nh:elven_mithril_coat');
      return meatmetal(cx(s), ent(s, id)) === 1 ? { s, coat } : null;
    });
    expect(r.s.state.entities[String(r.coat)]).toBeUndefined();
  });

  test('a rustproof dagger is spat out, no longer rustproof, and the monster is stunned', () => {
    const r = first((s) => {
      const id = monAt(s, 'nh:rust_monster', 3, 0);
      const dagger = put(s, 'nh:dagger');
      ent(s, dagger).c.item!.erodeproof = true;
      meatmetal(cx(s), ent(s, id));
      return isMStunned(s, id) ? { s, dagger } : null;
    });
    expect(ent(r.s, r.dagger).c.item!.erodeproof).toBeUndefined();
  });

  test('a gelatinous cube eats food, engulfs a dagger and leaves a boulder', () => {
    const r = first((s) => {
      const id = monAt(s, 'nh:gelatinous_cube', 3, 0);
      const food = put(s, 'nh:food_ration');
      const dagger = put(s, 'nh:dagger');
      put(s, 'nh:boulder');
      meatobj(cx(s), ent(s, id));
      return carried(s, id).includes('nh:dagger') && !s.state.entities[String(food)]
        ? { s, id, dagger }
        : null;
    });
    expect(ent(r.s, r.dagger).c.item!.carriedBy).toBe(r.id);
    expect(itemsAt(defs, r.s.state, 'dlvl1', 3, 0).map((e) => e.def)).toEqual(['nh:boulder']);
  });

  test('a purple worm eats a jackal corpse but not a lichen corpse', () => {
    const s = room(1);
    const id = monAt(s, 'nh:purple_worm', 3, 0);
    const lichen = mkcorpse(s.ctx, defs.monster('nh:lichen' as DefId), { at });
    expect(meatcorpse(cx(s), ent(s, id))).toBe(0);
    const jackal = mkcorpse(s.ctx, defs.monster('nh:jackal' as DefId), { at });
    expect(meatcorpse(cx(s), ent(s, id))).toBe(1);
    expect(s.state.entities[String(jackal)]).toBeUndefined();
    expect(s.state.entities[String(lichen)]).toBeDefined();
  });
});
