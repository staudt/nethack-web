// m23 step 7: the endgame, Earth and Fire. Climbing out of DL1 (the up stairs, a cursed potion of
// gain level) with the Amulet of Yendor onto the Plane of Earth ("Well done, mortal!", the
// Wizard back), the Planes' builds (earth.lua, fire.lua, air.lua; Water as plain air until step
// 10), their portals (Earth -> Air -> Fire -> Water -> Astral, arriving in the next level's
// teleport region; nothing happens without the Amulet), monsters and portals on the Planes, the
// endgame's rules (no level teleport, no rising up, no Elbereth, the status line's place),
// makemon()'s elemental planes, the salamander and the fire and steam vortices. Outcomes over
// seeds.
// ref: src/do.c doup(), goto_level(); src/dungeon.c prev_level(), Can_rise_up();
// src/teleport.c domagicportal(), mlevel_tele_trap(), level_tele_trap(); src/dog.c mon_arrive();
// src/makemon.c makemon(), rndmonst_adj(), wrong_elem_type(), is_home_elemental(), newmonhp();
// src/mhitu.c getmattk(); src/botl.c describe_level(); dat/earth.lua, fire.lua, air.lua
import {
  buildSnapshot,
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { getmattk, monsterAttack } from '../src/combat';
import { makeEngrAt } from '../src/engr';
import { vanillaMod, wizardMod } from '../src/index';
import { makemon, rndmonst } from '../src/generation';
import { mksobj } from '../src/items';
import { PLANES, PLANE_LEVELS, isHomeElemental } from '../src/levelflags';
import { setU } from '../src/luck';
import { MAGIC_PORTAL, findPortal, portalDest } from '../src/portal';
import { AIR, EARTH, FIRE } from '../src/planes';
import { onscary } from '../src/scary';
import { mapToLevel } from '../src/sp_lev';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { maketrap, mintrap, teleds } from '../src/trap';
import { AMULET_OF_YENDOR } from '../src/uhave';
import { isWiz } from '../src/wizstate';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pl',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pl:run',
      labelKey: 'pl',
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
const wizard = createEngine([vanillaMod, wizardMod, probeMod]);
type Engine = typeof engine;
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const run = (state: GameState, fn: (ctx: Ctx) => void, eng: Engine = engine): string[] => {
  probe.fn = fn;
  return texts(eng.step(state, { type: 'mod', action: 'pl:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;

/** A new game, the hero sturdy (the Amulet's wish already granted). */
function game(seed: number, eng: Engine = engine): GameState {
  const { state } = eng.newGame({ seed });
  setU({ state }, { amuletWish: true });
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  return state;
}

function giveAmulet(state: GameState, eng: Engine = engine): Entity {
  let id: EntityId = 0;
  run(
    state,
    (ctx) => {
      id = mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), {
        init: true,
        carriedBy: state.playerId,
      });
    },
    eng,
  );
  return ent(state, id);
}

const planeRef = (state: GameState, k: keyof typeof PLANE_LEVELS) => {
  const sp = dungeonLayout(state, PLANES).special.find((s) => s.id === PLANE_LEVELS[k])!;
  return { dungeon: PLANES, dlevel: sp.dlevel };
};
const goPlane = (state: GameState, k: keyof typeof PLANE_LEVELS, eng: Engine = engine) =>
  run(state, (ctx) => ctx.goToLevel(planeRef(state, k), 'random'), eng);

/** Climbs DL1's up stairs and says yes. */
function climbOut(state: GameState): string[] {
  const up = getLevel(state).up!;
  Object.assign(getPlayer(state).c.pos!, { x: up.x, y: up.y });
  const t = texts(engine.step(state, { type: 'mod', action: 'nh:up' as DefId }).events);
  expect(state.pendingPrompt?.prompt.key).toBe('stairs.leave_confirm');
  return [
    ...t,
    ...texts(engine.step(state, { type: 'answer', promptId: 'leave-dungeon', value: true }).events),
  ];
}

const monsOn = (state: GameState, level: Level): Entity[] =>
  Object.values(state.entities).filter((e) => e.c.monster && e.c.pos?.level === level.id);
const countTerrain = (level: Level, id: DefId): number =>
  level.cells.filter((c) => level.palette[c] === id).length;

describe('entering the endgame', () => {
  test("DL1's up stairs with the Amulet: Earth's teleport region, its lines and the Wizard", () => {
    for (const seed of [1, 2, 3]) {
      const state = game(seed);
      giveAmulet(state);
      const t = climbOut(state);
      expect(state.gameOver).toBeNull();
      const l = getLevel(state);
      expect(l.def).toBe(EARTH.id);
      // des.teleport_region({ region = {69,16,69,16} })
      const spot = mapToLevel(EARTH, l, 69, 16);
      expect(getPlayer(state).c.pos).toMatchObject(spot);
      expect(t.slice(0, 3)).toEqual([
        'Well done, mortal!',
        'But now thou must face the final Test...',
        'Prove thyself worthy or perish!',
      ]);
      // resurrect(): a new Wizard next to her, "So thou thought thou couldst kill me, fool."
      expect(t).toContain('"So thou thought thou couldst kill me, fool."');
      const wiz = monsOn(state, l).find((m) => isWiz({ state }, m.id))!;
      expect(wiz).toBeDefined();
      const hp = getPlayer(state).c.pos!;
      expect(Math.max(Math.abs(wiz.c.pos!.x - hp.x), Math.abs(wiz.c.pos!.y - hp.y))).toBe(1);
      // his spellbook of dig: the first Wizard made on Earth
      const inv = inventoryOf(state, wiz.id).map((e) => e.def);
      expect(inv).toContain('nh:spellbook_of_dig');
      // the status line's place
      expect(buildSnapshot(engine.registry, state).status['place']).toBe('status.plane_earth');
      // a second arrival says nothing (no new Wizard either: not a new dungeon)
      goPlane(state, 'air');
      const back = goPlane(state, 'earth');
      expect(back).not.toContain('Well done, mortal!');
      expect(back).toEqual([]);
    }
  });

  test('without the Amulet the climb is an escape; a cursed potion of gain level rises to Earth', () => {
    const state = game(4);
    climbOut(state);
    expect(state.gameOver?.kind).toBe('escaped');

    const s2 = game(5);
    giveAmulet(s2);
    let pot: EntityId = 0;
    run(s2, (ctx) => {
      pot = mksobj(ctx, ctx.defs.object('nh:potion_of_gain_level'), {
        init: false,
        carriedBy: s2.playerId,
      });
    });
    ent(s2, pot).c.item!.buc = 'cursed';
    const t = texts(
      engine.step(s2, { type: 'mod', action: 'nh:quaff' as DefId, args: { item: pot } as never })
        .events,
    );
    expect(t).toContain('You rise up, through the ceiling!');
    expect(s2.gameOver).toBeNull();
    expect(getLevel(s2).def).toBe(EARTH.id);
    // no rising up from the Planes
    run(s2, (ctx) => {
      pot = mksobj(ctx, ctx.defs.object('nh:potion_of_gain_level'), {
        init: false,
        carriedBy: s2.playerId,
      });
    });
    ent(s2, pot).c.item!.buc = 'cursed';
    const t2 = texts(
      engine.step(s2, { type: 'mod', action: 'nh:quaff' as DefId, args: { item: pot } as never })
        .events,
    );
    expect(t2).toContain('You have an uneasy feeling.');
    expect(getLevel(s2).def).toBe(EARTH.id);
  });

  test('a wizard levelport into the Planes hands her the Amulet first', () => {
    const state = game(6, wizard);
    const t = run(state, (ctx) => ctx.goToLevel(planeRef(state, 'fire'), 'random'), wizard);
    expect(t).toEqual([]);
    const s2 = game(6, wizard);
    wizard.step(s2, { type: 'mod', action: 'wiz:levelport' as DefId });
    wizard.step(s2, { type: 'answer', promptId: 'wiz-levelport-dungeon', value: PLANES });
    const w = texts(
      wizard.step(s2, {
        type: 'answer',
        promptId: 'wiz-levelport-level',
        value: planeRef(s2, 'fire').dlevel,
      }).events,
    );
    expect(w[0]).toMatch(/^Endgame prerequisite: . - the Amulet of Yendor\.$/);
    expect(getLevel(s2).def).toBe(FIRE.id);
  });
});

describe('the planes', () => {
  test('Earth: the map, its portal to Air, no stairs, hostile earth elementals at home', () => {
    for (const seed of [7, 8]) {
      const state = game(seed);
      giveAmulet(state);
      goPlane(state, 'earth');
      const l = getLevel(state);
      expect([l.up, l.down, l.branch]).toEqual([null, null, null]);
      expect(countTerrain(l, T.stairs_up) + countTerrain(l, T.stairs_down)).toBe(0);
      const portal = findPortal(l)!;
      expect(portalDest(portal)).toEqual(planeRef(state, 'air'));
      // in the levregion {0,0,75,19} outside {65,13,75,19}, on floor
      const lo = mapToLevel(EARTH, l, 65, 13);
      expect(portal.x >= lo.x && portal.y >= lo.y).toBe(false);
      expect(terrainIdAt(l, portal.x, portal.y)).toBe(T.floor);
      const mons = monsOn(state, l);
      const elementals = mons.filter((m) => m.def === 'nh:earth_elemental');
      expect(elementals.length).toBe(27);
      expect(elementals.every((m) => !m.c.monster!.peaceful)).toBe(true);
      expect(elementals.every((m) => isHomeElemental(state, m.def, l))).toBe(true);
      // the Elvenking's pick-axe and the minotaurs' wands of digging, made with the level
      const king = mons.find((m) => m.def === 'nh:elvenking')!;
      expect(inventoryOf(state, king.id).map((e) => e.def)).toContain('nh:pick_axe');
      for (const m of mons.filter((x) => x.def === 'nh:minotaur'))
        expect(inventoryOf(state, m.id).map((e) => e.def)).toContain('nh:wand_of_digging');
      expect(
        Object.values(state.entities).some(
          (e) => e.def === 'nh:boulder' && e.c.pos?.level === l.id,
        ),
      ).toBe(true);
    }
  });

  test('Fire: lava, 40 fire traps, 5 boulders, its portal to Water', () => {
    const state = game(9);
    giveAmulet(state);
    goPlane(state, 'fire');
    const l = getLevel(state);
    expect(l.def).toBe(FIRE.id);
    expect(countTerrain(l, T.lava)).toBeGreaterThan(300);
    expect(l.traps.filter((t) => t.def === 'nh:fire_trap').length).toBe(40);
    expect(
      Object.values(state.entities).filter((e) => e.def === 'nh:boulder' && e.c.pos?.level === l.id)
        .length,
    ).toBe(5);
    expect(portalDest(findPortal(l)!)).toEqual(planeRef(state, 'water'));
    const sal = monsOn(state, l).filter((m) => m.def === 'nh:salamander');
    expect(sal.length).toBe(8);
    expect(sal.every((m) => !m.c.monster!.peaceful)).toBe(true);
    expect(buildSnapshot(engine.registry, state).status['place']).toBe('status.plane_fire');
  });

  test('Air and Water: open air everywhere (Water until step 10), their portals', () => {
    const state = game(10);
    giveAmulet(state);
    const t = goPlane(state, 'air');
    // (and the Wizard, entering the endgame from DL1)
    expect(t.slice(0, 2)).toEqual([
      'What a strange feeling!',
      'You notice that there is no gravity here.',
    ]);
    const air = getLevel(state);
    expect(air.def).toBe(AIR.id);
    expect(air.cells.every((c) => air.palette[c] === T.air)).toBe(true);
    expect(portalDest(findPortal(air)!)).toEqual(planeRef(state, 'fire'));
    expect(monsOn(state, air).filter((m) => m.def === 'nh:air_elemental').length).toBeGreaterThan(
      0,
    );
    goPlane(state, 'water');
    const water = getLevel(state);
    expect(water.cells.every((c) => water.palette[c] === T.air)).toBe(true);
    expect(portalDest(findPortal(water)!)).toEqual(planeRef(state, 'astral'));
  });
});

describe('the portals', () => {
  test('Earth -> Air -> Fire -> Water -> Astral, each into the teleport region for arrivals from below', () => {
    const state = game(11);
    giveAmulet(state);
    goPlane(state, 'earth');
    for (const next of ['air', 'fire', 'water', 'astral'] as const) {
      const portal = findPortal(getLevel(state))!;
      const t = run(state, (ctx) => teleds(ctx, portal.x, portal.y));
      expect(t).toContain('You activated a magic portal!');
      const l = getLevel(state);
      expect(l.dungeon).toBe(PLANES);
      expect(l.dlevel).toBe(planeRef(state, next).dlevel);
      const p = getPlayer(state).c.pos!;
      if (next === 'air') expect(p.x).toBeLessThanOrEqual(23);
      if (next === 'fire') expect(p).toMatchObject(mapToLevel(FIRE, l, 71, 16));
      if (next === 'water') expect(p.x).toBeLessThanOrEqual(mapToLevel(FIRE, l, 25, 0).x + 2);
      expect(trapAt(l, p.x, p.y)?.def).not.toBe(MAGIC_PORTAL);
    }
  });

  test('without the Amulet: "You feel dizzy for a moment, but nothing happens..."', () => {
    const state = game(12);
    const amu = giveAmulet(state);
    goPlane(state, 'earth');
    run(state, (ctx) => ctx.remove(amu.id));
    const portal = findPortal(getLevel(state))!;
    const t = run(state, (ctx) => teleds(ctx, portal.x, portal.y));
    expect(t).toContain('You feel dizzy for a moment, but nothing happens...');
    expect(getLevel(state).def).toBe(EARTH.id);
  });
});

describe('monsters on the Planes', () => {
  test('rndmonst(): only kinds that can live on the plane; elementals only at home', () => {
    const state = game(13);
    giveAmulet(state);
    getPlayer(state).c.experience!.level = 14;
    for (const k of ['fire', 'air', 'earth'] as const) {
      goPlane(state, k);
      const l = getLevel(state);
      run(state, (ctx) => {
        for (let i = 0; i < 200; i++) {
          const d = rndmonst(ctx, 30, 0, 0, l);
          if (!d) continue;
          if (d.glyph.ch === 'E') expect(isHomeElemental(state, d.id, l)).toBe(true);
          if (k === 'fire') expect(d.resists).toContain('fire');
          if (k === 'air')
            expect(
              ['fly', 'float', 'amorphous'].some((f) => d.flags.includes(f)) ||
                d.glyph.ch === 'v' ||
                d.glyph.ch === ' ',
            ).toBe(true);
        }
      });
    }
  });

  test('a monster on a plane portal goes through only 1 time in 7; an elemental at home never', () => {
    let through = 0;
    let shimmers = 0;
    for (let seed = 20; seed < 34; seed++) {
      const state = game(seed);
      giveAmulet(state);
      goPlane(state, 'earth');
      const l = getLevel(state);
      const portal = findPortal(l)!;
      for (const kind of ['nh:salamander', 'nh:earth_elemental'] as DefId[]) {
        let id: EntityId | null = null;
        run(state, (ctx) => {
          id = makemon(ctx, ctx.defs.monster(kind), portal, { adjacentOk: true });
        });
        const m = ent(state, id!);
        Object.assign(m.c.pos!, { x: portal.x, y: portal.y });
        run(state, (ctx) => void mintrap(ctx, m.id));
        if (kind === 'nh:earth_elemental') expect(m.c.pos?.level).toBe(l.id);
        else if (m.c.pos?.level !== l.id) through++;
        else shimmers++;
        if (m.c.pos?.level === l.id) run(state, (ctx) => ctx.remove(m.id));
      }
    }
    expect(through).toBeGreaterThan(0);
    expect(shimmers).toBeGreaterThan(through);
  });
});

describe('the endgame rules', () => {
  test('no Elbereth, no level teleporter, no teleport trap prompt on the Planes', () => {
    const state = game(40);
    giveAmulet(state);
    goPlane(state, 'earth');
    const l = getLevel(state);
    const p = getPlayer(state).c.pos!;
    let scared = true;
    let id: EntityId | null = null;
    run(state, (ctx) => {
      makeEngrAt(ctx, l, p.x, p.y, 'Elbereth', null, 0, 'dust');
      id = makemon(ctx, ctx.defs.monster('nh:rock_troll'), p, { adjacentOk: true });
      scared = onscary(ctx, p.x, p.y, ent(state, id!));
    });
    expect(scared).toBe(false);
    run(state, (ctx) => ctx.remove(id!));
    // a level teleporter: "You feel a wrenching sensation."
    const spot = { x: p.x + 1, y: p.y };
    const t = run(state, (ctx) => {
      setTerrain(l, spot.x, spot.y, T.floor);
      maketrap(ctx, l.id, spot.x, spot.y, 'nh:level_teleporter');
      teleds(ctx, spot.x, spot.y);
    });
    expect(t).toContain('You feel a wrenching sensation.');
    expect(getLevel(state).id).toBe(l.id);
  });

  test('a monster through a portal onto a plane comes out in its teleport region from below', () => {
    let seen = 0;
    for (let seed = 50; seed < 54; seed++) {
      const state = game(seed);
      giveAmulet(state);
      goPlane(state, 'earth');
      const earth = getLevel(state);
      const portal = findPortal(earth)!;
      let mid: EntityId | null = null;
      run(state, (ctx) => {
        mid = makemon(ctx, ctx.defs.monster('nh:fire_vortex'), portal, { adjacentOk: true });
      });
      const m = ent(state, mid!);
      for (let i = 0; i < 40 && m.c.pos?.level === earth.id; i++) {
        Object.assign(m.c.pos!, { x: portal.x, y: portal.y });
        run(state, (ctx) => void mintrap(ctx, m.id));
      }
      if (m.c.pos) continue;
      // the hero follows through the portal: it arrives near Air's left part
      run(state, (ctx) => teleds(ctx, portal.x, portal.y));
      expect(getLevel(state).def).toBe(AIR.id);
      const arrived = ent(state, mid!).c.pos;
      expect(arrived?.level).toBe(getLevel(state).id);
      expect(arrived!.x).toBeLessThanOrEqual(25);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("an elemental at home: its attacks' dice doubled and thrice the hit points", () => {
    const state = game(41);
    giveAmulet(state);
    goPlane(state, 'earth');
    const p = getPlayer(state).c.pos!;
    let home: Entity | null = null;
    let away: Entity | null = null;
    run(state, (ctx) => {
      home = ent(
        state,
        makemon(ctx, ctx.defs.monster('nh:earth_elemental'), p, { adjacentOk: true })!,
      );
      away = ent(
        state,
        makemon(ctx, ctx.defs.monster('nh:fire_elemental'), p, { adjacentOk: true })!,
      );
      expect(getmattk(ctx, home, 0)!.n).toBe(
        ctx.defs.monster('nh:earth_elemental').attacks[0]!.n * 2,
      );
      expect(getmattk(ctx, away, 0)!.n).toBe(ctx.defs.monster('nh:fire_elemental').attacks[0]!.n);
    });
    // d(m_lev, 8) * 3: at least 3 per level
    expect(home!.c.hp!.max).toBeGreaterThanOrEqual(3 * home!.c.monster!.level);
  });

  test('digging rock on Earth: a cave, a collapse, or living debris', () => {
    const seen = new Set<string>();
    for (let seed = 60; seed < 100 && seen.size < 3; seed++) {
      const state = game(seed);
      giveAmulet(state);
      goPlane(state, 'earth');
      const l = getLevel(state);
      const p = getPlayer(state).c.pos!;
      // rock to dig east of her, and no monsters to interrupt
      run(state, (ctx) => {
        setTerrain(l, p.x + 1, p.y, T.stone);
        for (const m of monsOn(state, l)) ctx.remove(m.id);
      });
      let pick: EntityId = 0;
      run(state, (ctx) => {
        pick = mksobj(ctx, ctx.defs.object('nh:pick_axe'), {
          init: false,
          carriedBy: state.playerId,
        });
      });
      const it = ent(state, pick).c.item!;
      it.buc = seed % 2 ? 'blessed' : 'uncursed';
      it.spe = 30;
      for (const o of inventoryOf(state, state.playerId))
        if (o.c.item?.equipped === 'weapon') o.c.item.equipped = null;
      it.equipped = 'weapon';
      const t = texts(
        engine.step(state, { type: 'mod', action: 'nh:apply' as DefId, args: { item: pick } })
          .events,
      );
      const prompt = state.pendingPrompt?.prompt;
      expect(prompt?.id).toBe('dig-direction');
      let r = engine.step(state, { type: 'answer', promptId: prompt!.id, value: 'e' });
      t.push(...texts(r.events));
      for (let i = 0; i < 50 && state.occupation; i++) {
        r = engine.step(state, { type: 'continue' });
        t.push(...texts(r.events));
      }
      if (t.some((x) => x.startsWith('A mysterious force'))) seen.add('cave');
      if (t.includes('Crash!  The ceiling collapses around you!')) seen.add('collapse');
      if (t.includes('The debris from your digging comes to life!')) seen.add('debris');
    }
    expect([...seen].sort()).toEqual(['cave', 'collapse', 'debris']);
  });
});

describe('the salamander and the fire vortex', () => {
  test('the salamander roasts her in its hug; the fire vortex engulfs and burns', () => {
    const want = new Set(["You're being roasted!", 'You are burning to a crisp!']);
    const seen = new Set<string>();
    for (let seed = 90; seed < 120 && seen.size < want.size; seed++) {
      const state = game(seed);
      const p = getPlayer(state).c.pos!;
      getPlayer(state).c.hp = { cur: 9999, max: 9999 };
      for (const kind of ['nh:salamander', 'nh:fire_vortex'] as DefId[]) {
        let id: EntityId | null = null;
        run(state, (ctx) => {
          id = makemon(ctx, ctx.defs.monster(kind), p, { adjacentOk: true });
        });
        for (let i = 0; i < 6; i++) {
          const t = run(state, (ctx) => monsterAttack(ctx, id!));
          for (const x of t) if (want.has(x)) seen.add(x);
        }
        run(state, (ctx) => {
          if (state.entities[String(id)]) ctx.remove(id!);
        });
      }
    }
    expect([...seen].sort()).toEqual([...want].sort());
  });
});
