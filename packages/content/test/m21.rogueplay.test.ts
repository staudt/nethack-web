// m21 step 3: the Rogue level in play. Nothing tunnels there and monsters neither throw nor fire
// from afar nor go out of their way for objects (breath and the like still come, as in C); no
// corpse or death drop is left; a found secret door is a doorway; locking magic hides a doorway
// as a secret door; a secret door opened unseen by a ray or probing is felt as a draft; light
// fills the whole room and nothing in a corridor; the scroll of earth does nothing. Outcomes on
// pinned monsters and forced terrain (a level whose LevelDef is the Rogue level's), and searching
// on real Rogue levels over many seeds.
// ref: src/monmove.c m_digweapon_check(), m_move(); src/mon.c mfndpos() (mon_allowflags()),
// LEVEL_SPECIFIC_NOCORPSE; src/dogmove.c; src/mhitu.c mattacku() AT_WEAP; src/detect.c
// cvt_sdoor_to_door(); src/lock.c doorlock(); src/zap.c zap_map(), zap_over_floor(); src/read.c
// litroom(), seffect_earth(), seffect_magic_mapping(); src/muse.c find_offensive()
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  sortedIds,
  type Buc,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Json,
  type Level,
  type Mod,
  type PlayerAction,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { ROGUE, isRogueLevel } from '../src/levelflags';
import { mksobj } from '../src/items';
import { mDigweaponCheck } from '../src/mdig';
import { monWep } from '../src/mongear';
import { monkilled, monsterDied } from '../src/mondeath';
import { mattackRanged } from '../src/mthrowu';
import { findOffensive } from '../src/muse';
import { isKnown } from '../src/o_init';
import { setMspecUsed } from '../src/mstate';
import { P, setIntrinsic } from '../src/props';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { addMon } from './helpers';
import { ctxFor, defs, obj, render } from './itemHelpers';
import { mapSetup } from './maps';
import { keys, mon, room } from './m9helpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'rp',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'rp:run',
      labelKey: 'rp',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with a real Ctx, no time passing; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'rp:run' as DefId }).events);
}
const step = (state: GameState, a: PlayerAction): string[] => texts(engine.step(state, a).events);
const answer = (state: GameState, value: Json): string[] => {
  const p = state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return step(state, { type: 'answer', promptId: p.id, value });
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
/** Makes the test level the Rogue level (C's Is_rogue_level() reads the LevelDef). */
const rogue = (level: Level): Level => {
  level.def = ROGUE;
  return level;
};

/** Gives `owner` (a monster or the hero) a new uncursed object. */
function give(state: GameState, owner: EntityId, otyp: string, quan = 1): EntityId {
  const id = mksobj(ctxFor(state), obj(otyp), { init: false, carriedBy: owner });
  const it = ent(state, id).c.item!;
  it.buc = 'uncursed';
  it.quantity = quan;
  return id;
}

/** Zaps a new wand of `def` (5 charges) in `dir`; the messages. */
function zap(state: GameState, def: string, dir: string): string[] {
  const w = give(state, state.playerId, def);
  ent(state, w).c.item!.spe = 5;
  return [
    ...step(state, { type: 'mod', action: 'nh:zap' as DefId, args: { item: w } }),
    ...answer(state, dir),
  ];
}

/** Reads a new scroll of `def`; the messages. */
function read(state: GameState, def: string, buc: Buc = 'uncursed'): string[] {
  const id = give(state, state.playerId, def);
  ent(state, id).c.item!.buc = buc;
  return step(state, { type: 'mod', action: 'nh:read' as DefId, args: { item: id } });
}

const floorItems = (state: GameState): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[id] as Entity)
    .filter((e) => e.c.item && !e.c.item.carriedBy && e.c.pos?.level === 'dlvl1');

// ---------------------------------------------------------------------------------------------

describe('nothing tunnels on the Rogue level', () => {
  const MAP = [
    '-----          ',
    '|...|          ',
    '|.@.|         .',
    '|...|          ',
    '-----          ',
  ];

  test('a dwarf with a pick does not wield it to dig, nor dig toward her', () => {
    const m = mapSetup(MAP);
    rogue(m.level);
    getPlayer(m.state).c.hp = { cur: 999, max: 999 };
    const d = addMon(m.state, 'nh:dwarf', 14, 2);
    ent(m.state, d).c.hp = { cur: 40, max: 40 };
    give(m.state, d, 'nh:pick_axe');
    run(m.state, (ctx) => expect(mDigweaponCheck(ctx, ent(ctx.state, d), 13, 2)).toBe(false));
    for (let i = 0; i < 100; i++) m.step({ type: 'wait' });
    expect(ent(m.state, d).c.pos).toMatchObject({ x: 14, y: 2 });
    expect(monWep(m.ctx, d)).toBeNull();
    for (let x = 5; x <= 13; x++) expect(terrainIdAt(m.level, x, 2)).toBe(T.stone);
    expect(terrainIdAt(m.level, 4, 2)).toBe(T.vwall);
  });

  test('elsewhere the same dwarf wields its pick to dig', () => {
    const m = mapSetup(MAP);
    const d = addMon(m.state, 'nh:dwarf', 14, 2);
    give(m.state, d, 'nh:pick_axe');
    run(m.state, (ctx) => expect(mDigweaponCheck(ctx, ent(ctx.state, d), 13, 2)).toBe(true));
  });
});

describe('no ranged attacks from weapons on the Rogue level', () => {
  /** A soldier at (x, 2) wielding a bow, with 20 arrows; the arrows' id. */
  function archer(s: ReturnType<typeof room>, x: number): { id: EntityId; arrows: EntityId } {
    const id = mon(s.state, 'nh:soldier', x, 2).id;
    const bow = give(s.state, id, 'nh:bow');
    ent(s.state, bow).c.item!.equipped = 'weapon';
    return { id, arrows: give(s.state, id, 'nh:arrow', 20) };
  }
  const clear = (): boolean => true;
  const quan = (s: ReturnType<typeof room>, id: EntityId): number =>
    s.state.entities[String(id)]?.c.item?.quantity ?? 0;

  test('a soldier lined up with her does not fire its arrows; elsewhere it does', () => {
    const r = room();
    rogue(getLevel(r.state));
    const a = archer(r, 8);
    for (let i = 0; i < 30; i++) mattackRanged(r.ctx, a.id, clear, null);
    expect(quan(r, a.arrows)).toBe(20);
    expect(keys(r.ctx).filter((k) => k.startsWith('mthrow'))).toEqual([]);
    const o = room();
    const b = archer(o, 8);
    for (let i = 0; i < 30; i++) mattackRanged(o.ctx, b.id, clear, null);
    expect(quan(o, b.arrows)).toBeLessThan(20);
  });

  test('it comes to her and fights in melee instead', () => {
    const r = room();
    rogue(getLevel(r.state));
    const a = archer(r, 8);
    const hp0 = getPlayer(r.state).c.hp!.cur;
    for (let i = 0; i < 60 && getPlayer(r.state).c.hp!.cur === hp0; i++) r.step({ type: 'wait' });
    expect(getPlayer(r.state).c.hp!.cur).toBeLessThan(hp0);
    const p = ent(r.state, a.id).c.pos!;
    expect(Math.max(Math.abs(p.x - 2), Math.abs(p.y - 2))).toBe(1);
    expect(quan(r, a.arrows)).toBe(20);
  });

  test('breath still comes from afar, as in NetHack', () => {
    const r = room();
    rogue(getLevel(r.state));
    setIntrinsic(getPlayer(r.state), P.COLD_RES, false);
    const w = mon(r.state, 'nh:winter_wolf_cub', 7, 2);
    for (let i = 0; i < 30; i++) {
      setMspecUsed(r.ctx, w.id, 0);
      mattackRanged(r.ctx, w.id, clear, null);
    }
    expect(keys(r.ctx)).toContain('mthrow.breathes');
  });
});

describe('monsters do not go after objects on the Rogue level', () => {
  const ROOM = [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '............@.',
  ];
  /** Whether a hill orc at (6,1) ever holds the dagger put at (2,1) within 12 turns. */
  function fetches(rogueLevel: boolean, seed: number): boolean {
    const m = mapSetup(ROOM, { seed });
    if (rogueLevel) rogue(m.level);
    getPlayer(m.state).c.hp = { cur: 999, max: 999 };
    const o = addMon(m.state, 'nh:hill_orc', 6, 1);
    ent(m.state, o).c.hp = { cur: 99, max: 99 };
    const dagger = mksobj(m.ctx, obj('nh:dagger'), {
      init: false,
      at: { level: 'dlvl1', x: 2, y: 1 },
    });
    for (let i = 0; i < 12; i++) {
      m.step({ type: 'wait' });
      if (ent(m.state, dagger).c.item?.carriedBy === o) return true;
    }
    return false;
  }

  test('a hill orc leaves a dagger behind it there, and fetches it elsewhere', () => {
    let elsewhere = 0;
    for (let seed = 1; seed <= 10; seed++) {
      expect(fetches(true, seed)).toBe(false);
      if (fetches(false, seed)) elsewhere++;
    }
    expect(elsewhere).toBeGreaterThan(5);
  });
});

describe('no corpses on the Rogue level', () => {
  /** Kills 30 dwarves in turn at (5,2), half by the hero and half not; the floor items. */
  function killAll(rogueLevel: boolean): Entity[] {
    const r = room();
    if (rogueLevel) rogue(getLevel(r.state));
    for (let i = 0; i < 30; i++) {
      const id = mon(r.state, 'nh:dwarf', 5, 2).id;
      if (i % 2 === 0) monsterDied(r.ctx, id, true);
      else monkilled(r.ctx, id, false);
    }
    return floorItems(r.state);
  }

  test('nothing is left by a killed monster there; elsewhere corpses are', () => {
    expect(killAll(true)).toEqual([]);
    expect(killAll(false).some((e) => e.def === 'nh:corpse')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

const rogueDlevel = (state: GameState): number =>
  state.dungeons[0]?.special.find((s) => s.id === 'nh:rogue')?.dlevel ?? -1;

/** A new game on its Rogue level. */
function rogueLevel(seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: rogueDlevel(state) }, 'random'));
  return { state, level: getLevel(state) };
}

const SDOORS: ReadonlySet<DefId | undefined> = new Set([
  T.sdoor_v,
  T.sdoor_h,
  T.sdoor_locked_v,
  T.sdoor_locked_h,
]);

describe('secret doors found on the Rogue level are doorways', () => {
  test('searching next to one finds a doorway (over many seeds)', () => {
    let found = 0;
    for (let seed = 1; seed <= 40 && found < 5; seed++) {
      const { state, level } = rogueLevel(seed);
      expect(isRogueLevel(level)).toBe(true);
      // a secret door with walkable ground beside it (a corridor or the room's floor)
      let spot: { door: { x: number; y: number }; at: { x: number; y: number } } | null = null;
      for (let i = 0; i < level.cells.length && !spot; i++) {
        const x = i % level.width;
        const y = (i - x) / level.width;
        if (!SDOORS.has(terrainIdAt(level, x, y))) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const t = terrainIdAt(level, x + dx, y + dy);
          if (t === T.floor || t === T.corr)
            spot = { door: { x, y }, at: { x: x + dx, y: y + dy } };
        }
      }
      if (!spot) continue;
      const hero = getPlayer(state);
      hero.c.hp = { cur: 5000, max: 5000 };
      // nothing else on the level to interfere
      for (const id of sortedIds(state)) {
        const e = state.entities[id];
        if (e?.c.monster && e.id !== state.playerId) delete state.entities[id];
      }
      Object.assign(hero.c.pos!, spot.at);
      const lines: string[] = [];
      for (let i = 0; i < 300 && SDOORS.has(terrainIdAt(level, spot.door.x, spot.door.y)); i++)
        lines.push(...step(state, { type: 'search' }));
      expect(terrainIdAt(level, spot.door.x, spot.door.y)).toBe(T.doorway);
      expect(lines).toContain('You find a hidden door.');
      found++;
    }
    expect(found).toBe(5);
  });

  const DARK = ['        |', '@#######|', '        |'];

  test('a blessed magic mapping turns every secret door into a doorway', () => {
    const m = mapSetup(['-----', '|.@.|', '-----']);
    rogue(m.level);
    setTerrain(m.level, 2, 0, T.sdoor_h);
    setTerrain(m.level, 4, 1, T.sdoor_locked_v);
    read(m.state, 'nh:scroll_of_magic_mapping', 'blessed');
    expect(terrainIdAt(m.level, 2, 0)).toBe(T.doorway);
    expect(terrainIdAt(m.level, 4, 1)).toBe(T.doorway);
  });

  test('probing reveals an unseen one: "You feel a draft."', () => {
    const m = mapSetup(DARK, { memory: 'none' });
    rogue(m.level);
    setTerrain(m.level, 8, 1, T.sdoor_v);
    const out = zap(m.state, 'nh:wand_of_probing', 'e');
    expect(terrainIdAt(m.level, 8, 1)).toBe(T.doorway);
    expect(out).toContain('You feel a draft.');
  });

  test('a ray reveals an unseen one: "You feel a draft."; elsewhere a door, silently', () => {
    const m = mapSetup(DARK, { memory: 'none' });
    rogue(m.level);
    getPlayer(m.state).c.hp = { cur: 999, max: 999 };
    setTerrain(m.level, 8, 1, T.sdoor_v);
    const out = zap(m.state, 'nh:wand_of_cold', 'e');
    expect(terrainIdAt(m.level, 8, 1)).toBe(T.doorway);
    expect(out).toContain('You feel a draft.');
    const o = mapSetup(DARK, { memory: 'none' });
    getPlayer(o.state).c.hp = { cur: 999, max: 999 };
    setTerrain(o.level, 8, 1, T.sdoor_v);
    expect(zap(o.state, 'nh:wand_of_cold', 'e')).not.toContain('You feel a draft.');
    expect(terrainIdAt(o.level, 8, 1)).not.toBe(T.sdoor_v);
  });
});

describe('locking magic hides a Rogue doorway', () => {
  const MAP = ['|.....|', '---o---', '  ...  ', '  .@.  '];

  test('the wand of locking: a cloud of dust and a secret door in the wall', () => {
    const m = mapSetup(MAP);
    rogue(m.level);
    const out = zap(m.state, 'nh:wand_of_locking', 'n');
    expect(out).toContain('A cloud of dust springs up in the older, more primitive doorway.');
    expect(out).toContain('The doorway vanishes!');
    expect(terrainIdAt(m.level, 3, 1)).toBe(T.sdoor_h);
  });

  test('something in the way: the cloud dissipates and the doorway stays', () => {
    const m = mapSetup(MAP);
    rogue(m.level);
    const d = addMon(m.state, 'nh:newt', 3, 1, { asleep: true });
    ent(m.state, d).c.actor!.speed = 0;
    const out = zap(m.state, 'nh:wand_of_locking', 'n');
    expect(out).toContain('The cloud quickly dissipates.');
    expect(terrainIdAt(m.level, 3, 1)).toBe(T.doorway);
  });

  test('elsewhere a door assembles itself and locks', () => {
    const m = mapSetup(MAP);
    zap(m.state, 'nh:wand_of_locking', 'n');
    expect(terrainIdAt(m.level, 3, 1)).toBe(T.door_locked);
  });
});

describe('light on the Rogue level', () => {
  // a dark room 14 wide with a corridor off its east doorway
  const MAP = [
    '----------------     ',
    '|..............|     ',
    '|.@............o#####',
    '|..............|     ',
    '----------------     ',
  ];
  function dark(rogueLevel: boolean) {
    const m = mapSetup(MAP);
    if (rogueLevel) rogue(m.level);
    m.level.lit = m.level.lit.map(() => 0);
    m.level.rooms.push({ lx: 1, ly: 1, hx: 14, hy: 3, lit: false });
    return m;
  }
  const litAt = (l: Level, x: number, y: number): number => l.lit[cellIndex(l, x, y)] ?? 0;

  test('the scroll lights the whole room, walls included', () => {
    const m = dark(true);
    expect(read(m.state, 'nh:scroll_of_light')).toContain('A lit field surrounds you!');
    for (let x = 0; x <= 15; x++) for (let y = 0; y <= 4; y++) expect(litAt(m.level, x, y)).toBe(1);
    expect(m.level.rooms[0]?.lit).toBe(true);
    expect(litAt(m.level, 17, 2)).toBe(0); // the corridor stays dark
  });

  test('elsewhere only a radius of 5 is lit', () => {
    const m = dark(false);
    read(m.state, 'nh:scroll_of_light');
    expect(litAt(m.level, 3, 2)).toBe(1);
    expect(litAt(m.level, 14, 2)).toBe(0);
  });

  test('in a corridor: nothing is lit and nothing is said', () => {
    const m = dark(true);
    Object.assign(getPlayer(m.state).c.pos!, { x: 18, y: 2 });
    m.step({ type: 'wait' });
    expect(read(m.state, 'nh:scroll_of_light')).not.toContain('A lit field surrounds you!');
    expect(m.level.lit.every((l) => l === 0)).toBe(true);
  });

  test('a cursed one darkens the whole room', () => {
    const m = dark(true);
    m.level.lit = m.level.lit.map(() => 1);
    m.level.rooms[0]!.lit = true;
    read(m.state, 'nh:scroll_of_light', 'cursed');
    for (let x = 0; x <= 15; x++) for (let y = 0; y <= 4; y++) expect(litAt(m.level, x, y)).toBe(0);
    expect(m.level.rooms[0]?.lit).toBe(false);
  });
});

describe('the scroll of earth on the Rogue level', () => {
  const ROOM = ['---------', '|.......|', '|...@...|', '|.......|', '---------'];
  const boulders = (state: GameState): number =>
    floorItems(state).filter((e) => e.def === 'nh:boulder').length;

  test('reading it does nothing and teaches nothing', () => {
    for (const buc of ['blessed', 'uncursed', 'cursed'] as const) {
      const m = mapSetup(ROOM);
      rogue(m.level);
      const hp = getPlayer(m.state).c.hp!.cur;
      const out = read(m.state, 'nh:scroll_of_earth', buc);
      expect(out.filter((l) => /rumbles|boulder/.test(l))).toEqual([]);
      expect(boulders(m.state)).toBe(0);
      expect(getPlayer(m.state).c.hp!.cur).toBe(hp);
      expect(isKnown(m.state, defs, 'nh:scroll_of_earth' as DefId)).toBe(false);
    }
  });

  test('a monster never chooses to read it there; elsewhere it does', () => {
    const orcWith = (rogueLevel: boolean, seed: number): string | null => {
      const m = mapSetup(ROOM, { seed });
      if (rogueLevel) rogue(m.level);
      const id = addMon(m.state, 'nh:hill_orc', 5, 2);
      const helm = give(m.state, id, 'nh:dwarvish_iron_helm');
      ent(m.state, helm).c.item!.equipped = 'helm';
      give(m.state, id, 'nh:scroll_of_earth');
      let kind: string | null = null;
      run(m.state, (ctx) => {
        kind = findOffensive(ctx, id)?.kind ?? null;
      });
      return kind;
    };
    for (let seed = 1; seed <= 10; seed++) {
      expect(orcWith(true, seed)).toBeNull();
      expect(orcWith(false, seed)).toBe('scr_earth');
    }
  });
});
