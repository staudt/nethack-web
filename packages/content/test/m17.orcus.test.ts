// m17 step 7: Orcus Town, shades and skeletons. The town builds on 80x21 right-aligned in a
// maze grid with its doors, altar, boulders, stairs and residents; its two shops are stocked and
// deserted (their goods are free) and its morgue is filled; shades let iron pass harmlessly
// through them and are hurt by silver and blessed weapons; skeletons rattle and wear their
// armor. Outcomes are asserted over many seeds or with pinned monsters.
// ref: dat/orcus.lua; src/shknam.c stock_room(); src/uhitm.c shade_miss(), shade_aware(),
// hmon_hitmon(); src/weapon.c dmgval(); src/dokick.c kickdmg(); src/mhitm.c hitmm();
// src/sounds.c domonnoise(); src/makemon.c m_initweap(); src/worn.c m_dowear()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Level,
  type Mod,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { heroWeapon, knownHitum } from '../src/combat';
import { costlySpot, shopKeeper } from '../src/eshk';
import { isGraveyard } from '../src/graveyard';
import { GEHENNOM, GEHENNOM_SPECIALS as G, levelFlags } from '../src/levelflags';
import { mattackm } from '../src/mhitm';
import { mksobj } from '../src/items';
import { makemon } from '../src/generation';
import { ORCUS_TOWN } from '../src/orcus';
import { shadeMiss } from '../src/shade';
import { mapToLevel } from '../src/sp_lev';
import { T, isWallId, terrainIdAt } from '../src/terrain';
import { MORGUE } from '../src/zoo';
import { addMon, setup } from './helpers';
import { ctxFor, defs, obj, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'oc',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'oc:run',
      labelKey: 'oc',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'oc:run' as DefId });
};

/** A new game whose hero fell onto Gehennom's special level `sp`. */
function arrive(seed: number, sp: DefId): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  const d = state.dungeons.find((x) => x.id === GEHENNOM)!;
  const dlevel = d.special.find((s) => s.id === sp)!.dlevel;
  run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel }, 'random'));
  return { state, level: getLevel(state) };
}

const SEEDS = Array.from({ length: 8 }, (_, i) => i + 1);
const ter = (l: Level, p: Pos): DefId => terrainIdAt(l, p.x, p.y)!;
const monAt = (state: GameState, l: Level, p: Pos): Entity | undefined =>
  Object.values(state.entities).find(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const itemsAt = (state: GameState, l: Level, p: Pos): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.item && e.c.pos?.level === l.id && e.c.pos.x === p.x && e.c.pos.y === p.y,
  );
const roomCells = (r: Level['rooms'][number]): Pos[] => {
  const out: Pos[] = [];
  for (let x = r.lx; x <= r.hx; x++) for (let y = r.ly; y <= r.hy; y++) out.push({ x, y });
  return out;
};
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

const DOORS: [number, number, 'closed' | 'open' | 'nodoor'][] = [
  [23, 2, 'closed'],
  [31, 3, 'open'],
  [3, 5, 'nodoor'],
  [9, 5, 'closed'],
  [14, 5, 'closed'],
  [41, 5, 'closed'],
  [3, 8, 'open'],
  [13, 8, 'nodoor'],
  [41, 8, 'open'],
  [24, 9, 'closed'],
  [31, 11, 'closed'],
  [11, 13, 'open'],
  [18, 13, 'closed'],
  [41, 13, 'closed'],
  [26, 14, 'open'],
  [6, 15, 'closed'],
];
const BOULDERS: [number, number][] = [
  [19, 2],
  [20, 2],
  [21, 2],
  [36, 2],
  [36, 3],
  [6, 4],
  [5, 5],
  [6, 5],
  [7, 5],
  [39, 5],
  [8, 8],
  [9, 8],
  [10, 8],
  [11, 8],
  [6, 10],
  [5, 11],
  [6, 11],
  [7, 11],
  [21, 11],
  [21, 12],
  [13, 13],
  [14, 13],
  [15, 13],
  [14, 14],
];

describe('Orcus Town', () => {
  const games = SEEDS.map((s) => arrive(s, G.orcus));
  const at = (l: Level, x: number, y: number): Pos => mapToLevel(ORCUS_TOWN, l, x, y);

  test('the town right-aligned in the maze grid: walls, doors, the altar, boulders, residents', () => {
    for (const { state, level } of games) {
      expect(level.def).toBe(ORCUS_TOWN.id);
      expect([level.width, level.height]).toEqual([80, 21]);
      // des.map({ halign = "right" }): its last column next to the grid's east wall
      const o = at(level, 0, 0);
      expect(o).toEqual({ x: 80 - 1 - 45, y: 3 });
      ORCUS_TOWN.map!.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const id = ter(level, { x: o.x + x, y: o.y + y });
          if (ch === '-' || ch === '|') expect(isWallId(id)).toBe(true);
          else if (ch === '.')
            expect([T.floor, T.grave, T.stairs_down, T.altar_unaligned]).toContain(id);
        }),
      );
      for (const [x, y, st] of DOORS) {
        const id = ter(level, at(level, x, y));
        if (st === 'closed') expect(id).toBe(T.door_closed);
        else if (st === 'open') expect([T.door_open_v, T.door_open_h]).toContain(id);
        else expect(id).toBe(T.doorway);
      }
      // an ordinary unaligned altar (no temple room: no high altar)
      expect(ter(level, at(level, 24, 7))).toBe(T.altar_unaligned);
      for (const [x, y] of BOULDERS)
        expect(itemsAt(state, level, at(level, x, y)).some((e) => e.def === 'nh:boulder')).toBe(
          true,
        );
      // the down stairs under Orcus, his fixed companions beside him
      expect(level.down).toEqual(at(level, 33, 15));
      expect(ter(level, level.down!)).toBe(T.stairs_down);
      expect(monAt(state, level, at(level, 33, 15))?.def).toBe('nh:orcus');
      expect(monAt(state, level, at(level, 32, 15))?.def).toBe('nh:human_zombie');
      expect(monAt(state, level, at(level, 32, 14))?.def).toBe('nh:shade');
      expect(monAt(state, level, at(level, 32, 16))?.def).toBe('nh:shade');
      const onLevel = (def: string): number =>
        Object.values(state.entities).filter(
          (e) => e.c.monster && e.def === def && e.c.pos?.level === level.id,
        ).length;
      expect(onLevel('nh:skeleton')).toBeGreaterThanOrEqual(5);
      expect(onLevel('nh:shade')).toBeGreaterThanOrEqual(6);
      // the up stairs in the west region, and the branch there when Vlad's Tower leaves from
      // this level (m23: its stairs up)
      expect(level.up!.x).toBeLessThanOrEqual(11);
      expect(ter(level, level.up!)).toBe(T.stairs_up);
      if (level.branch) {
        expect(level.branch.to.dungeon).toBe('nh:vlad');
        expect(level.branch.pos.x).toBeLessThanOrEqual(11);
        expect(ter(level, level.branch.pos)).toBe(T.stairs_up);
      }
    }
  });

  test('the morgue is filled; the two shops are stocked and have no shopkeeper', () => {
    for (const { state, level } of games) {
      expect(level.rooms.map((r) => r.type)).toEqual([MORGUE, 'nh:shop', 'nh:shop']);
      const [morgue, shop1, shop2] = level.rooms as [
        Level['rooms'][number],
        Level['rooms'][number],
        Level['rooms'][number],
      ];
      expect([morgue.lx, morgue.ly]).toEqual(Object.values(at(level, 22, 12)));
      expect([shop1.lx, shop1.ly, shop1.hx, shop1.hy]).toEqual([
        ...Object.values(at(level, 32, 9)),
        ...Object.values(at(level, 37, 12)),
      ]);
      expect([shop2.lx, shop2.ly]).toEqual(Object.values(at(level, 12, 0)));
      expect(roomCells(morgue).some((p) => monAt(state, level, p))).toBe(true);
      expect(isGraveyard(state, level.id)).toBe(true);
      run(state, (ctx) => {
        for (const i of [1, 2]) expect(shopKeeper(ctx, level.id, i)).toBeNull();
      });
      expect(
        Object.values(state.entities).some((e) => e.def === 'nh:shopkeeper' && e.c.monster),
      ).toBe(false);
      for (const r of [shop1, shop2]) {
        const stocked = roomCells(r).filter(
          (p) => itemsAt(state, level, p).length > 0 || monAt(state, level, p),
        );
        expect(stocked.length).toBeGreaterThan(4);
        expect(level.lit[r.ly * level.width + r.lx]).toBe(1);
      }
    }
  });

  test('an object worth most of a wish: a magic marker or a magic lamp (m19 step 1)', () => {
    const kinds = new Set<string>();
    for (const { state, level } of games) {
      const onLevel = (e: Entity): boolean => {
        const holder = e.c.item?.carriedBy;
        const at = holder ? state.entities[String(holder)]?.c.pos : e.c.pos;
        return at?.level === level.id;
      };
      const found = Object.values(state.entities).filter(
        (e) => (e.def === 'nh:magic_marker' || e.def === 'nh:magic_lamp') && onLevel(e),
      );
      expect(found.length).toBeGreaterThanOrEqual(1);
      for (const e of found) kinds.add(e.def);
    }
    // math.random(0, 1) over eight games: both come up
    expect([...kinds].sort()).toEqual(['nh:magic_lamp', 'nh:magic_marker']);
  });

  test("the ghost town's goods are free: picked up with no bill", () => {
    const { state, level } = arrive(3, G.orcus);
    for (const k of Object.keys(state.entities)) {
      const e = state.entities[k]!;
      if (e.c.monster && e.id !== state.playerId) delete state.entities[k];
    }
    const shop = level.rooms[1]!;
    const spot = roomCells(shop).find((p) => itemsAt(state, level, p).length === 1)!;
    expect(spot).toBeDefined();
    const [item] = itemsAt(state, level, spot) as [Entity];
    Object.assign(getPlayer(state).c.pos!, spot);
    run(state, (ctx) => expect(costlySpot(ctx, spot.x, spot.y)).toBe(false));
    const r = engine.step(state, { type: 'mod', action: 'nh:pickup' as DefId });
    expect(keys(r).some((k) => k.startsWith('shk.') || k.startsWith('pay.'))).toBe(false);
    // (it may merge into a stack she carries)
    const got =
      state.entities[String(item.id)] ??
      Object.values(state.entities).find(
        (e) => e.def === item.def && e.c.item?.carriedBy === state.playerId,
      )!;
    expect(got.c.item?.carriedBy).toBe(state.playerId);
    expect(got.c.item?.unpaid).toBeFalsy();
  });

  test('hell_tweaks() leaves the town alone; flags and the teleport region', () => {
    for (const { state, level } of games) {
      run(state, (ctx) =>
        expect(levelFlags(ctx, level)).toMatchObject({ maze: true, shortsighted: true }),
      );
      expect(ORCUS_TOWN.teleportRegions).toEqual([
        { area: [0, 0, 11, 20], coords: 'level', exclude: [19, 1, 69, 20], excludeCoords: 'level' },
      ]);
      // no lava, pool or iron bars inside the town
      const o = at(level, 0, 0);
      for (let y = 0; y < 17; y++)
        for (let x = 0; x < 45; x++)
          expect([T.lava, T.pool, T.moat, T.iron_bars]).not.toContain(
            ter(level, { x: o.x + x, y: o.y + y }),
          );
    }
  });
});

// ---------------------------------------------------------------------------------------------

type S = ReturnType<typeof setup>;
/** The hero beside a pinned, awake shade (speed 0) with plenty of hit points. */
function shadeBeside(): {
  s: S;
  ctx: Ctx & { events: { type: string; key?: string }[] };
  shade: Entity;
} {
  const s = setup(['.....', '.@...', '.....']);
  const id = addMon(s.state, 'nh:shade', 2, 1);
  const shade = s.state.entities[String(id)]!;
  shade.c.actor!.speed = 0;
  shade.c.hp = { cur: 60, max: 60 };
  const ctx = ctxFor(s.state) as unknown as Ctx & { events: { type: string; key?: string }[] };
  return { s, ctx, shade };
}
const wield = (s: S, id: string, buc: 'blessed' | 'uncursed' = 'uncursed'): Entity => {
  for (const e of inventoryOf(s.state, s.state.playerId))
    if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
  const ctx = ctxFor(s.state);
  const w = mksobj(ctx, obj(id), { init: false, carriedBy: s.state.playerId })!;
  const e = s.state.entities[String(w)]!;
  e.c.item!.equipped = 'weapon';
  e.c.item!.buc = buc;
  e.c.item!.spe = 0;
  return e;
};
const text = (ctx: { events: { type: string }[] }): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));

describe('shades', () => {
  test('bare hands and an iron weapon pass harmlessly through; the shade wakes', () => {
    {
      const { s, ctx, shade } = shadeBeside();
      for (const e of inventoryOf(s.state, s.state.playerId))
        if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
      shade.c.monster!.asleep = true;
      expect(knownHitum(ctx, shade.id, null, true, null)).toBe(true);
      expect(shade.c.hp!.cur).toBe(60);
      expect(shade.c.monster!.asleep).toBe(false);
      expect(text(ctx)).toContain('Your attack passes harmlessly through the shade.');
    }
    {
      const { s, ctx, shade } = shadeBeside();
      const sword = wield(s, 'nh:long_sword');
      for (let i = 0; i < 20; i++) knownHitum(ctx, shade.id, heroWeapon(ctx, sword), true, null);
      expect(shade.c.hp!.cur).toBe(60);
      expect(text(ctx)).toContain('Your long sword passes harmlessly through the shade.');
    }
  });

  test('silver and a blessed weapon hurt it', () => {
    for (const [id, buc] of [
      ['nh:silver_saber', 'uncursed'],
      ['nh:long_sword', 'blessed'],
    ] as const) {
      const { s, ctx, shade } = shadeBeside();
      const w = wield(s, id, buc);
      knownHitum(ctx, shade.id, heroWeapon(ctx, w), true, null);
      expect(shade.c.hp!.cur).toBeLessThan(60);
      expect(text(ctx).some((t) => t.includes('harmlessly'))).toBe(false);
    }
  });

  test("missiles: an iron one passes through, a silver one doesn't (shade_miss())", () => {
    const { s, ctx, shade } = shadeBeside();
    const hero = getPlayer(s.state);
    const dagger = mksobj(ctx, obj('nh:dagger'), { init: false, carriedBy: hero.id })!;
    const silver = mksobj(ctx, obj('nh:silver_dagger'), { init: false, carriedBy: hero.id })!;
    const ent = (id: EntityId): Entity => s.state.entities[String(id)]!;
    expect(shadeMiss(ctx, hero, shade, ent(dagger), true, true)).toBe(true);
    expect(text(ctx)).toEqual(['The dagger passes harmlessly through the shade.']);
    expect(shadeMiss(ctx, hero, shade, ent(silver), true, true)).toBe(false);
    // a monster's blow: "The jackal's attack passes harmlessly through the shade."
    const jackal = s.state.entities[String(addMon(s.state, 'nh:jackal', 3, 1))]!;
    expect(shadeMiss(ctx, jackal, shade, null, false, true)).toBe(true);
    expect(text(ctx)).toContain("The jackal's attack passes harmlessly through the shade.");
    // not a shade: no effect
    expect(shadeMiss(ctx, shade, jackal, null, false, true)).toBe(false);
  });

  test('a monster fighting a shade never hurts it', () => {
    const { s, ctx, shade } = shadeBeside();
    const ant = addMon(s.state, 'nh:soldier_ant', 3, 1);
    s.state.entities[String(ant)]!.c.monster!.level = 6;
    let passed = 0;
    for (let i = 0; i < 40; i++) {
      ctx.events.length = 0;
      mattackm(ctx, ant, shade.id);
      if (text(ctx).some((t) => t.includes('harmlessly through the shade'))) passed++;
    }
    expect(shade.c.hp!.cur).toBe(60);
    expect(passed).toBeGreaterThan(0);
  });

  test('a kick passes harmlessly through', () => {
    const { s, shade } = shadeBeside();
    s.engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
    const p = s.state.pendingPrompt!.prompt;
    const r = s.engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' });
    expect(keys(r)).toContain('shade.kick_passes');
    expect(shade.c.hp!.cur).toBe(60);
  });

  test('#chat: the shade wails', () => {
    const { s } = shadeBeside();
    const r = s.engine.step(s.state, {
      type: 'mod',
      action: 'nh:chat' as DefId,
      args: { dir: 'e' },
    });
    expect(keys(r)).toContain('chat.wails');
  });
});

describe('skeletons', () => {
  test('#chat: it rattles and she freezes for a moment', () => {
    const s = setup(['.....', '.@...', '.....']);
    const id = addMon(s.state, 'nh:skeleton', 2, 1);
    s.state.entities[String(id)]!.c.actor!.speed = 0;
    const t = s.state.turn;
    const r = s.engine.step(s.state, {
      type: 'mod',
      action: 'nh:chat' as DefId,
      args: { dir: 'e' },
    });
    // nomul(-2): two more moves pass before "You can move again."
    expect(keys(r)).toEqual(['chat.rattles', 'chat.freeze', 'eat.can_move_again']);
    expect(s.state.turn - t).toBe(3);
  });

  test("its starting gear is m_initweap()'s S_ZOMBIE case, and it wears the armor", () => {
    let armored = 0;
    let armed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = setup(['.....', '.@...', '.....'], seed);
      const ctx = ctxFor(s.state) as unknown as Ctx;
      const id = makemon(ctx, defs.monster('nh:skeleton' as DefId), { x: 3, y: 1 })!;
      const inv = inventoryOf(s.state, id);
      for (const e of inv)
        expect(['nh:leather_armor', 'nh:knife', 'nh:short_sword']).toContain(e.def);
      const armor = inv.find((e) => e.def === 'nh:leather_armor');
      if (armor) {
        armored++;
        expect(armor.c.item?.equipped).toBe('body');
      }
      if (inv.some((e) => e.def !== 'nh:leather_armor')) armed++;
    }
    expect(armored).toBeGreaterThan(5);
    expect(armed).toBeGreaterThan(5);
  });
});
