// m14 step 7: acquisition. Monsters are made with rnd_defensive_item(), rnd_offensive_item()
// and rnd_misc_item() by m_lev (most soldiers get none), want what they can use
// (searches_for_item()), magic lovers take magic, pets nothing cursed, and the corpses that cure
// stoning are picked up. Outcomes are asserted over many draws, never one lucky seed.
import { inventoryOf, type Ctx, type EntityId, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mksobj } from '../src/index';
import { mInitInv, mInitWeap, monWouldTakeItem, mpickstuff } from '../src/mongear';
import { rndDefensiveItem, rndMiscItem, rndOffensiveItem, searchesForItem } from '../src/musestate';
import { monAdjustSpeed } from '../src/mstate';
import { MUSE_ITEMS, addMon } from './helpers';
import { ctxFor, levelSetup, obj } from './itemHelpers';

const ROOM = ['           ', ' ......... ', ' ....@.... ', ' ......... ', '           '];

const ent = (state: GameState, id: EntityId) => state.entities[String(id)]!;
const ctxOf = (state: GameState) => ctxFor(state) as unknown as Ctx;

function mon(state: GameState, def: string, lev = 1, x = 2, y = 1): EntityId {
  const id = addMon(state, def, x, y);
  ent(state, id).c.monster!.level = lev;
  return id;
}
/** A new object on the floor at (x, y), or carried by `by`. */
function item(
  state: GameState,
  otyp: string,
  o: { x?: number; y?: number; by?: EntityId; spe?: number; buc?: 'cursed'; of?: string } = {},
): EntityId {
  const id = mksobj(ctxFor(state), obj(otyp), {
    init: false,
    ...(o.by !== undefined
      ? { carriedBy: o.by }
      : { at: { level: 'dlvl1', x: o.x ?? 8, y: o.y ?? 3 } }),
    ...(o.of ? { corpseOf: o.of as never } : {}),
  });
  const it = ent(state, id).c.item!;
  if (o.spe !== undefined) it.spe = o.spe;
  if (o.buc) it.buc = o.buc;
  return id;
}
/** The items `pick` gives over `n` draws, as a set. */
function picks(state: GameState, id: EntityId, pick: typeof rndDefensiveItem, n = 400) {
  const out = new Set<string | null>();
  for (let i = 0; i < n; i++) out.add(pick(ctxOf(state), id));
  return out;
}

describe('rnd_defensive_item(), rnd_offensive_item(), rnd_misc_item()', () => {
  // difficulty 4: rn2(9), so case 8 (create monster) can come
  test('a hill orc can get every defensive item; no wand of death below difficulty 8', () => {
    const s = levelSetup(ROOM, 3);
    const orc = mon(s.state, 'nh:hill_orc');
    expect([...picks(s.state, orc, rndDefensiveItem)].sort()).toEqual(
      [
        'nh:potion_of_extra_healing',
        'nh:potion_of_full_healing',
        'nh:potion_of_healing',
        'nh:scroll_of_create_monster',
        'nh:scroll_of_teleportation',
        'nh:wand_of_create_monster',
        'nh:wand_of_digging',
        'nh:wand_of_teleportation',
      ].sort(),
    );
    // difficulty 4: rn2(9) (cases 0-8; no sleep, fire, cold or lightning)
    const off = picks(s.state, orc, rndOffensiveItem);
    expect(off.has('nh:wand_of_death')).toBe(false);
    expect(off.has('nh:wand_of_fire')).toBe(false);
    expect(off.has('nh:wand_of_magic_missile')).toBe(true);
    expect(off.has('nh:potion_of_sleeping')).toBe(true);
    expect(off.has(null)).toBe(false);
    // a soldier (difficulty 8) can have the attack wands and the wand of death
    const sol = mon(s.state, 'nh:soldier', 6, 3, 1);
    const soff = picks(s.state, sol, rndOffensiveItem, 2000);
    for (const w of ['nh:wand_of_death', 'nh:wand_of_fire', 'nh:wand_of_lightning'])
      expect(soff.has(w)).toBe(true);
  });

  test('a floater digs no hole; a ghost, an animal or a mindless monster gets nothing', () => {
    const s = levelSetup(ROOM, 4);
    const eye = mon(s.state, 'nh:floating_eye');
    const def = picks(s.state, eye, rndDefensiveItem);
    expect(def.has('nh:wand_of_digging')).toBe(false);
    expect(def.has(null)).toBe(true); // case 7 gives nothing
    for (const m of ['nh:ghost', 'nh:newt', 'nh:yellow_light']) {
      const id = mon(s.state, m, 1, 3, 1);
      for (const f of [rndDefensiveItem, rndOffensiveItem, rndMiscItem])
        expect([...picks(s.state, id, f, 50)]).toEqual([null]);
      delete s.state.entities[String(id)];
    }
  });

  test('misc: polymorph only for weak monsters; a peaceful one gets no invisibility', () => {
    const s = levelSetup(ROOM, 5);
    const gnome = mon(s.state, 'nh:gnome');
    const g = picks(s.state, gnome, rndMiscItem, 2000);
    for (const x of [
      'nh:potion_of_polymorph',
      'nh:wand_of_polymorph',
      'nh:amulet_of_life_saving',
      'nh:potion_of_speed',
      'nh:wand_of_speed_monster',
      'nh:potion_of_invisibility',
      'nh:wand_of_make_invisible',
      'nh:potion_of_gain_level',
    ])
      expect(g.has(x)).toBe(true);
    const sol = mon(s.state, 'nh:soldier', 6, 3, 1);
    ent(s.state, sol).c.monster!.peaceful = true;
    const p = picks(s.state, sol, rndMiscItem, 2000);
    expect(p.has('nh:potion_of_polymorph')).toBe(false);
    expect(p.has('nh:wand_of_polymorph')).toBe(false);
    expect(p.has('nh:potion_of_invisibility')).toBe(false);
    expect(p.has(null)).toBe(true);
    expect(p.has('nh:potion_of_gain_level')).toBe(true);
  });
});

describe('m_initweap()/m_initinv(): monsters made with items', () => {
  /** What `n` monsters of `def` at m_lev `lev` are made with (muse items only). */
  function made(def: string, lev: number, n: number): string[][] {
    const out: string[][] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = levelSetup(ROOM, seed);
      const id = mon(s.state, def, lev);
      if (
        ctxFor(s.state)
          .defs.monster(def as never)
          .attacks.some((a) => a.at === 'weapon')
      )
        mInitWeap(ctxFor(s.state), id);
      mInitInv(ctxFor(s.state), id, 1);
      out.push(
        inventoryOf(s.state, id)
          .map((e) => e.def as string)
          .filter((d) => MUSE_ITEMS.has(d)),
      );
    }
    return out;
  }

  test('m_lev 0 never gets one; m_lev 100 always gets a defensive and an offensive item', () => {
    for (const d of made('nh:hill_orc', 0, 20)) expect(d).toEqual([]);
    const high = made('nh:hill_orc', 100, 20);
    for (const d of high) expect(d.length).toBeGreaterThanOrEqual(2); // misc may be none
  });

  test('ordinary soldiers rarely have access to magic: 12 in 13 skip both rolls', () => {
    const sols = made('nh:soldier', 100, 104);
    // m_initweap()'s offensive item always comes (m_lev 100 > rn2(75)); the defensive one only
    // after the rn2(13) return
    const withDef = sols.filter((d) => d.length >= 2).length;
    expect(withDef).toBeGreaterThan(0);
    expect(withDef).toBeLessThan(30);
    for (const d of sols) expect(d.length).toBeGreaterThanOrEqual(1);
  });
});

describe('searches_for_item(), mon_would_take_item(), mpickstuff()', () => {
  test('the wands, potions, scrolls and amulets a thinking monster wants', () => {
    const s = levelSetup(ROOM, 6);
    const st = s.state;
    const orc = mon(st, 'nh:hill_orc');
    const wants = (otyp: string, o: Parameters<typeof item>[2] = {}) =>
      searchesForItem(ctxOf(st), ent(st, orc), ent(st, item(st, otyp, o)));
    expect(wants('nh:wand_of_fire', { spe: 3 })).toBe(true);
    expect(wants('nh:wand_of_fire', { spe: 0 })).toBe(false);
    expect(wants('nh:wand_of_striking', { spe: 1 })).toBe(true);
    expect(wants('nh:wand_of_digging', { spe: 1 })).toBe(true);
    expect(wants('nh:wand_of_polymorph', { spe: 1 })).toBe(true); // difficulty 4 < 6
    expect(wants('nh:wand_of_light', { spe: 5 })).toBe(false);
    expect(wants('nh:potion_of_sleeping')).toBe(true);
    expect(wants('nh:potion_of_blindness')).toBe(true);
    expect(wants('nh:potion_of_see_invisible')).toBe(false);
    expect(wants('nh:scroll_of_earth')).toBe(true);
    expect(wants('nh:scroll_of_fire')).toBe(true);
    expect(wants('nh:scroll_of_identify')).toBe(false);
    expect(wants('nh:amulet_of_life_saving')).toBe(true);
    expect(wants('nh:amulet_of_reflection')).toBe(true);
    expect(wants('nh:amulet_of_strangulation')).toBe(false);
    expect(wants('nh:unicorn_horn')).toBe(true);
    expect(wants('nh:unicorn_horn', { buc: 'cursed' })).toBe(false);
    expect(wants('nh:corpse', { of: 'nh:lizard' })).toBe(true);
    expect(wants('nh:corpse', { of: 'nh:newt' })).toBe(false);
    expect(wants('nh:egg', { of: 'nh:cockatrice' })).toBe(true);
    // fast already: no speed
    expect(wants('nh:potion_of_speed')).toBe(true);
    monAdjustSpeed(ctxOf(st), ent(st, orc), 1);
    expect(wants('nh:potion_of_speed')).toBe(false);
    // a floater wants no wand of digging; a soldier (difficulty 8) no polymorph
    const eye = mon(st, 'nh:floating_eye', 1, 3, 1);
    expect(
      searchesForItem(ctxOf(st), ent(st, eye), ent(st, item(st, 'nh:wand_of_digging', { spe: 2 }))),
    ).toBe(false);
    const sol = mon(st, 'nh:soldier', 6, 4, 1);
    expect(
      searchesForItem(
        ctxOf(st),
        ent(st, sol),
        ent(st, item(st, 'nh:wand_of_polymorph', { spe: 2 })),
      ),
    ).toBe(false);
    // ghosts and animals look for nothing
    const ghost = mon(st, 'nh:ghost', 1, 5, 1);
    expect(
      searchesForItem(ctxOf(st), ent(st, ghost), ent(st, item(st, 'nh:potion_of_healing'))),
    ).toBe(false);
  });

  test('magic lovers take any magic; a pet takes nothing cursed', () => {
    const s = levelSetup(ROOM, 7);
    const st = s.state;
    const shaman = mon(st, 'nh:kobold_shaman');
    const orc = mon(st, 'nh:hill_orc', 1, 3, 1);
    const ring = ent(st, item(st, 'nh:ring_of_adornment'));
    const book = ent(st, item(st, 'nh:spellbook_of_force_bolt'));
    expect(monWouldTakeItem(ctxOf(st), shaman, ring)).toBe(true);
    expect(monWouldTakeItem(ctxOf(st), shaman, book)).toBe(true);
    expect(monWouldTakeItem(ctxOf(st), orc, ring)).toBe(false);
    const potion = ent(st, item(st, 'nh:potion_of_healing', { buc: 'cursed' }));
    expect(monWouldTakeItem(ctxOf(st), orc, potion)).toBe(true);
    ent(st, orc).c.monster!.tame = 10;
    ent(st, orc).c.monster!.peaceful = true;
    expect(monWouldTakeItem(ctxOf(st), orc, potion)).toBe(false);
  });

  test('a hill orc picks up a lizard corpse, not a newt corpse or a bare-handed cockatrice', () => {
    for (const [of, picked] of [
      ['nh:lizard', true],
      ['nh:newt', false],
      ['nh:cockatrice', false],
    ] as const) {
      const s = levelSetup(ROOM, 8);
      const st = s.state;
      const orc = mon(st, 'nh:hill_orc', 1, 2, 1);
      const c = item(st, 'nh:corpse', { x: 2, y: 1, of });
      expect(mpickstuff(ctxFor(st), orc)).toBe(picked);
      expect(ent(st, c).c.item!.carriedBy === orc).toBe(picked);
    }
  });

  test('with gloves on it takes the cockatrice corpse', () => {
    const s = levelSetup(ROOM, 9);
    const st = s.state;
    const orc = mon(st, 'nh:hill_orc', 1, 2, 1);
    const gl = item(st, 'nh:leather_gloves', { by: orc });
    ent(st, gl).c.item!.equipped = 'gloves';
    const c = item(st, 'nh:corpse', { x: 2, y: 1, of: 'nh:cockatrice' });
    expect(mpickstuff(ctxFor(st), orc)).toBe(true);
    expect(ent(st, c).c.item!.carriedBy).toBe(orc);
  });
});
