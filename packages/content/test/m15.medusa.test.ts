// m15 step 6: Medusa. Her four island levels (medusa.ts) with Perseus's statue, the petrified
// statues and the statues of fixup_special(); her gaze against monsters (gazemm()) and the hero
// (m_respond()); proper names; the dragons' scales left on death, dragon scale mail (reflection,
// the extra properties of do_wear.c) and the black dragon's disintegration blast.
// Outcomes are asserted: monsters are placed and pinned, levels built from several seeds.
// ref: dat/medusa-1.lua .. medusa-4.lua; src/mkmaze.c fixup_special(); src/sp_lev.c
// create_object(), create_monster(), pm_to_humidity(); src/mhitm.c gazemm(); src/mon.c
// m_respond(), make_corpse(); src/zap.c zhitm(), zhitu(), disintegrate_mon(); src/muse.c
// mon_reflects(); src/do_wear.c dragon_armor_handling(); src/do_name.c x_monnam()
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type EquipSlot,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { buzzFrom } from '../src/buzz';
import { armorOn } from '../src/dowear';
import { mksobj } from '../src/items';
import { levelFlags } from '../src/levelflags';
import { blindfOn } from '../src/jewelry';
import { isPool } from '../src/liquid';
import { FIRST_ROOM, MEDUSA_VARIANTS } from '../src/medusa';
import { mattackm } from '../src/mhitm';
import { mondied } from '../src/mondeath';
import { isExtinct } from '../src/vanquished';
import { mRespond } from '../src/mrespond';
import { monReflects } from '../src/musestate';
import { xnameOf } from '../src/objnam';
import { monNam } from '../src/perception';
import { P, hasExtrinsic, updateWornProps } from '../src/props';
import { ureflects } from '../src/reflect';
import { mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { addMon } from './helpers';
import { ctxFor, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
/**
 * A probe action and a test dungeon (from DL20 of the main one) whose level n + 1 is Medusa
 * variant n, between ordinary levels so that every variant gets up and down stairs (the main
 * dungeon places Medusa from step 9 on).
 */
const testMod: Mod = {
  id: 'mt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mt:run',
      labelKey: 'mt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
    api.defineDungeon({
      id: 'mt:med',
      nameKey: 'mt:med',
      levels: { base: 6 },
      entry: { from: 'nh:main', base: 20 },
      special: MEDUSA_VARIANTS.map((v, i) => ({
        id: `mt:m${String(i + 1)}`,
        nameKey: 'mt:m',
        base: i + 2,
        variants: [v.id],
      })),
    });
  },
};
const engine = createEngine([vanillaMod, testMod]);
const defs = engine.registry;
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'mt:run' as DefId }).events);
};
const goTo = (state: GameState, dlevel: number, at: 'up' | 'random'): Level => {
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'mt:med', dlevel }, at));
  return getLevel(state);
};

/**
 * Medusa variant `n` of a new game with `seed`, the hero falling onto it from above (from the
 * plain first level: the levels between hold the other variants, and Medusa is made only once).
 */
function medusa(n: number, seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  goTo(state, 1, 'up');
  return { state, level: goTo(state, n + 1, 'random') };
}

const entitiesOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.pos?.level === level.id);
const monsOn = (state: GameState, level: Level, def?: string): Entity[] =>
  entitiesOn(state, level).filter(
    (e) => e.c.monster !== undefined && e.id !== state.playerId && (!def || e.def === def),
  );
const statuesOn = (state: GameState, level: Level): Entity[] =>
  entitiesOn(state, level).filter((e) => e.def === 'nh:statue');
const inside = (state: GameState, box: EntityId): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.item?.containedIn === box);

describe("Medusa's island", () => {
  test.each([1, 2, 3, 4])('medusa-%i builds with Medusa asleep on the down stairs', (n) => {
    for (const seed of [1, 2, 3]) {
      const { state, level } = medusa(n, seed);
      const def = MEDUSA_VARIANTS[n - 1] as (typeof MEDUSA_VARIANTS)[number];
      expect(level.def).toBe(def.id);
      expect([level.width, level.height]).toEqual([80, 21]);
      expect(level.cells.some((c) => level.palette[c] === T.moat)).toBe(true);
      expect(levelFlags({ defs }, level)).toMatchObject({ noteleport: true, maze: true });
      // Medusa sleeps on the down stairs, with Perseus's statue
      const down = level.down as Pos;
      expect(terrainIdAt(level, down.x, down.y)).toBe(T.stairs_down);
      const [med] = monsOn(state, level, 'nh:medusa');
      expect(med?.c.pos).toMatchObject(down);
      expect(med?.c.monster?.asleep).toBe(true);
      const perseus = statuesOn(state, level).find(
        (s) => s.c.pos?.x === down.x && s.c.pos.y === down.y,
      ) as Entity;
      expect(perseus.c.item?.corpseOf).toBe('nh:human');
      expect(perseus.c.item?.buc).toBe('uncursed');
      for (const o of inside(state, perseus.id))
        expect([
          'nh:shield_of_reflection',
          'nh:levitation_boots',
          'nh:scimitar',
          'nh:sack',
        ]).toContain(o.def);
      // every other statue shows a monster that stoning would turn to stone
      const others = statuesOn(state, level).filter((s) => s.id !== perseus.id);
      // (medusa-2: its eight garden statues and the fixup's last one; the fixup's rnd(4) tries
      // in the first room may all miss)
      expect(others.length).toBeGreaterThanOrEqual(9);
      for (const s of others) {
        const m = defs.monster(s.c.item?.corpseOf as DefId);
        expect(m.resists).not.toContain('stone');
      }
      // the moat's sea monsters are in the water
      for (const e of monsOn(state, level).filter((m) => defs.monster(m.def).glyph.ch === ';'))
        expect(isPool({ defs }, level, e.c.pos?.x ?? -1, e.c.pos?.y ?? -1)).toBe(true);
      // fixup_special()'s statues: at least one stands in the first room
      const r = FIRST_ROOM[def.id] as [number, number, number, number];
      const a = mapToLevel(def, level, r[0], r[1]);
      const b = mapToLevel(def, level, r[2], r[3]);
      expect(
        others.some(
          (s) =>
            (s.c.pos?.x ?? -1) >= a.x &&
            (s.c.pos?.x ?? 99) <= b.x &&
            (s.c.pos?.y ?? -1) >= a.y &&
            (s.c.pos?.y ?? 99) <= b.y,
        ),
      ).toBe(true);
    }
  });

  test('Medusa is made only once: a second island visited after the first has none', () => {
    const { state } = engine.newGame({ seed: 1 });
    goTo(state, 1, 'up');
    const first = goTo(state, 2, 'random'); // medusa-1
    expect(monsOn(state, first, 'nh:medusa')).toHaveLength(1);
    expect(isExtinct(state, 'nh:medusa' as DefId)).toBe(true);
    const second = goTo(state, 3, 'random'); // medusa-2
    expect(second.def).toBe(MEDUSA_VARIANTS[1]?.id);
    expect(monsOn(state, second, 'nh:medusa')).toHaveLength(0);
  });

  test('a petrified statue holds what its monster carried', () => {
    // search the seeds for one whose statues hold something (a monster made with gear)
    let found = false;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const { state, level } = medusa(1, seed);
      const down = level.down as Pos;
      for (const s of statuesOn(state, level)) {
        if (s.c.pos?.x === down.x && s.c.pos.y === down.y) continue;
        const held = inside(state, s.id);
        if (held.length > 0) {
          found = true;
          for (const o of held) expect(o.c.item?.equipped ?? null).toBeNull();
        }
      }
    }
    expect(found).toBe(true);
  });

  test('medusa-3 and medusa-4 put Medusa in one of their rooms; medusa-3 has a fountain', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { level } = medusa(3, seed);
      const def = MEDUSA_VARIANTS[2] as (typeof MEDUSA_VARIANTS)[number];
      const spots = [
        [8, 6],
        [66, 5],
        [46, 15],
      ].map(([x, y]) => mapToLevel(def, level, x as number, y as number));
      const down = level.down as Pos;
      const i = spots.findIndex((p) => p.x === down.x && p.y === down.y);
      expect(i).toBeGreaterThanOrEqual(0);
      seen.add(String(i));
      const fountains = spots.filter((p) => terrainIdAt(level, p.x, p.y) === T.fountain);
      expect(fountains).toHaveLength(1);
      expect(fountains[0]).not.toEqual(down);
      expect(levelFlags({ defs }, level).shortsighted).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
    const { state, level } = medusa(4, 1);
    const def = MEDUSA_VARIANTS[3] as (typeof MEDUSA_VARIANTS)[number];
    const nest = mapToLevel(def, level, 5, 4);
    const [dragon] = monsOn(state, level, 'nh:yellow_dragon');
    expect(dragon?.c.pos).toMatchObject(nest);
    expect(dragon?.c.monster?.asleep).toBe(true);
    const eggs = itemsAt(defs, state, level.id, nest.x, nest.y).filter((o) => o.def === 'nh:egg');
    expect(eggs.length).toBeGreaterThanOrEqual(1);
    for (const e of eggs) expect(e.c.item?.corpseOf).toBe('nh:yellow_dragon');
  });

  test('falling onto medusa-1 lands on the up stairs island', () => {
    const def = MEDUSA_VARIANTS[0] as (typeof MEDUSA_VARIANTS)[number];
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, level } = medusa(1, seed);
      const p = getPlayer(state).c.pos as Pos;
      const a = mapToLevel(def, level, 1, 1);
      const b = mapToLevel(def, level, 5, 17);
      expect(p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y).toBe(true);
    }
  });
});

/** A lit room, the hero at (2,2); Medusa and another monster pinned in it. */
function room(seed = 1) {
  const s = levelSetup(
    ['...........', '...........', '..@........', '...........', '...........'],
    seed,
  );
  plainKit(s.state);
  return s;
}
/** A pinned, awake monster of `def` at (x, y) with its level and plenty of hit points. */
function pinned(state: GameState, def: string, x: number, y: number, hp = 1000): EntityId {
  const id = addMon(state, def, x, y);
  const e = state.entities[String(id)] as Entity;
  if (e.c.actor) e.c.actor.speed = 0;
  if (e.c.monster) e.c.monster.level = defs.monster(def as DefId).level;
  e.c.hp = { cur: hp, max: hp };
  return id;
}
/** Gives monster `mon` (or the hero) `id`, worn in `slot`. */
function wearOn(state: GameState, mon: EntityId, id: string, slot: EquipSlot): EntityId {
  const o = mksobj(ctxFor(state), defs.object(id as DefId), { init: false, carriedBy: mon });
  const it = state.entities[String(o)]?.c.item;
  if (it) it.equipped = slot;
  updateWornProps(state, defs, mon);
  return o;
}
const statueAt = (state: GameState, x: number, y: number): Entity | undefined =>
  itemsAt(defs, state, 'dlvl1', x, y).find((o) => o.def === 'nh:statue');

describe("Medusa's gaze", () => {
  test('a monster that looks at her is turned to stone', () => {
    const s = room();
    const med = pinned(s.state, 'nh:medusa', 6, 2);
    const orc = pinned(s.state, 'nh:hill_orc', 7, 2);
    run(s.state, (ctx) => void mattackm(ctx, med, orc));
    expect(s.state.entities[String(orc)]).toBeUndefined();
    expect(statueAt(s.state, 7, 2)?.c.item?.corpseOf).toBe('nh:hill_orc');
  });

  test('a reflected gaze turns Medusa to stone', () => {
    const s = room();
    const med = pinned(s.state, 'nh:medusa', 6, 2);
    const orc = pinned(s.state, 'nh:hill_orc', 7, 2);
    wearOn(s.state, orc, 'nh:shield_of_reflection', 'shield');
    const t = run(s.state, (ctx) => void mattackm(ctx, med, orc));
    expect(t).toContain("The gaze is reflected away by the hill orc's shield.");
    expect(t).toContain('Medusa turns to stone!');
    expect(s.state.entities[String(med)]).toBeUndefined();
    expect(s.state.entities[String(orc)]?.c.monster).toBeDefined();
    const st = statueAt(s.state, 6, 2) as Entity;
    expect(render(xnameOf(s.state, defs, st))).toBe('statue of Medusa');
  });

  test('she stones a hero who sees her; a blindfold or reflection saves her', () => {
    const s = room();
    const med = pinned(s.state, 'nh:medusa', 8, 2);
    run(s.state, (ctx) => mRespond(ctx, ctx.state.entities[String(med)] as Entity));
    expect(s.state.gameOver).not.toBeNull();

    const b = room();
    const med2 = pinned(b.state, 'nh:medusa', 8, 2);
    const bf = mksobj(ctxFor(b.state), defs.object('nh:blindfold'), {
      init: false,
      carriedBy: b.state.playerId,
    });
    run(b.state, (ctx) => blindfOn(ctx, ctx.state.entities[String(bf)] as Entity));
    run(b.state, (ctx) => mRespond(ctx, ctx.state.entities[String(med2)] as Entity));
    expect(b.state.gameOver).toBeNull();

    const r = room();
    const med3 = pinned(r.state, 'nh:medusa', 8, 2);
    wearOn(r.state, r.state.playerId, 'nh:amulet_of_reflection', 'amulet');
    run(r.state, (ctx) => mRespond(ctx, ctx.state.entities[String(med3)] as Entity));
    expect(r.state.gameOver).toBeNull();
    expect(r.state.entities[String(med3)]).toBeUndefined();
    expect(statueAt(r.state, 8, 2)?.c.item?.corpseOf).toBe('nh:medusa');
  });

  test('she is "Medusa", with no article', () => {
    const s = room();
    const med = pinned(s.state, 'nh:medusa', 8, 2);
    const name = monNam(ctxFor(s.state), s.state.entities[String(med)] as Entity);
    expect(render({ key: 'zap.ray.mon_disintegrated', params: { mon: name } })).toBe(
      'Medusa is disintegrated!',
    );
  });
});

describe('dragons and their scales', () => {
  test('a dead dragon leaves its scales 1 time in 3, uncursed and +0', () => {
    let withScales = 0;
    let without = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = room(seed);
      const d = pinned(s.state, 'nh:red_dragon', 6, 2, 1);
      run(s.state, (ctx) => mondied(ctx, d));
      const scales = itemsAt(defs, s.state, 'dlvl1', 6, 2).filter(
        (o) => o.def === 'nh:red_dragon_scales',
      );
      if (scales.length === 0) without++;
      else {
        withScales++;
        expect(scales[0]?.c.item).toMatchObject({ buc: 'uncursed', spe: 0 });
      }
    }
    expect(withScales).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(withScales);
  });

  test('silver dragon scale mail and grown-up silver dragons reflect', () => {
    const s = room();
    wearOn(s.state, s.state.playerId, 'nh:silver_dragon_scale_mail', 'body');
    expect(ureflects(ctxFor(s.state), null)).toBe(true);
    const orc = pinned(s.state, 'nh:hill_orc', 7, 2);
    wearOn(s.state, orc, 'nh:silver_dragon_scales', 'body');
    const silver = pinned(s.state, 'nh:silver_dragon', 8, 3);
    const baby = pinned(s.state, 'nh:baby_silver_dragon', 8, 4);
    const ent = (id: EntityId) => s.state.entities[String(id)] as Entity;
    run(s.state, (ctx) => {
      expect(monReflects(ctx, ent(orc), null)).toBe(true);
      expect(monReflects(ctx, ent(silver), null)).toBe(true);
      expect(monReflects(ctx, ent(baby), null)).toBe(false);
    });
  });

  test("dragon armor's extra properties: blue speeds her up", () => {
    const s = room();
    const mail = wearOn(s.state, s.state.playerId, 'nh:blue_dragon_scale_mail', 'body');
    const t = run(s.state, (ctx) => armorOn(ctx, ctx.state.entities[String(mail)] as Entity));
    expect(t).toContain('You speed up.');
    const h = getPlayer(s.state);
    expect(hasExtrinsic(h, P.FAST)).toBe(true);
    expect(hasExtrinsic(h, P.SHOCK_RES)).toBe(true);
    const y = room();
    wearOn(y.state, y.state.playerId, 'nh:yellow_dragon_scales', 'body');
    expect(hasExtrinsic(getPlayer(y.state), P.STONE_RES)).toBe(true);
    expect(hasExtrinsic(getPlayer(y.state), P.ACID_RES)).toBe(true);
  });
});

/** A lit 41x5 room, the hero at (30,2): a blast fired from next to her ends before any wall. */
function wideRoom(seed = 1) {
  const row = '.'.repeat(41);
  const s = levelSetup([row, row, `${'.'.repeat(30)}@${'.'.repeat(10)}`, row, row], seed);
  plainKit(s.state);
  return s;
}

describe("the black dragon's disintegration blast", () => {
  const blast = (state: GameState, dragon: EntityId, dir: 'w' | 'e'): string[] =>
    run(state, (ctx) => {
      const p = ctx.state.entities[String(dragon)]?.c.pos as Pos;
      buzzFrom(ctx, 'death', 1, { x: p.x, y: p.y }, dir, { by: 'breath', mon: dragon });
    });

  test('it destroys her shield first, then kills her without one', () => {
    const s = wideRoom();
    for (const o of inventoryOf(s.state, s.state.playerId))
      if (o.c.item && o.c.item.equipped !== null && o.c.item.equipped !== 'weapon')
        o.c.item.equipped = null;
    const shield = wearOn(s.state, s.state.playerId, 'nh:small_shield', 'shield');
    const dragon = pinned(s.state, 'nh:black_dragon', 31, 2);
    const t = blast(s.state, dragon, 'w');
    expect(t).toContain('Your shield crumbles away!');
    expect(s.state.entities[String(shield)]).toBeUndefined();
    expect(s.state.gameOver).toBeNull();
    // the blast may miss her (zap_hit() against her AC): it hits within a few breaths
    for (let i = 0; i < 20 && !s.state.gameOver; i++) blast(s.state, dragon, 'w');
    expect(s.state.gameOver).not.toBeNull();
  });

  test('disintegration resistance keeps her whole', () => {
    const s = wideRoom();
    for (const o of inventoryOf(s.state, s.state.playerId))
      if (o.c.item && o.c.item.equipped !== null && o.c.item.equipped !== 'weapon')
        o.c.item.equipped = null;
    wearOn(s.state, s.state.playerId, 'nh:black_dragon_scale_mail', 'body');
    const dragon = pinned(s.state, 'nh:black_dragon', 31, 2);
    expect(blast(s.state, dragon, 'w')).toContain('You are not disintegrated.');
    expect(s.state.gameOver).toBeNull();
  });

  test('a monster loses its shield, or is disintegrated with no corpse', () => {
    const s = wideRoom();
    const dragon = pinned(s.state, 'nh:black_dragon', 5, 3);
    const orc = pinned(s.state, 'nh:hill_orc', 6, 3);
    wearOn(s.state, orc, 'nh:orcish_shield', 'shield');
    const t = blast(s.state, dragon, 'e');
    expect(t.some((x) => /^The hill orc's .* is disintegrated!$/.test(x))).toBe(true);
    expect(s.state.entities[String(orc)]?.c.monster).toBeDefined();
    const t2 = blast(s.state, dragon, 'e');
    expect(t2).toContain('The hill orc is disintegrated!');
    expect(s.state.entities[String(orc)]).toBeUndefined();
    expect(itemsAt(defs, s.state, 'dlvl1', 6, 3).some((o) => o.def === 'nh:corpse')).toBe(false);
    expect(cellIndex(getLevel(s.state), 6, 3)).toBeGreaterThan(0);
  });
});
