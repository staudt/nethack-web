// m23 step 5: carrying the Amulet of Yendor. level_difficulty() (the depth, a builds-up branch,
// aggravate monster, the Amulet's deepest level, the Planes), the mysterious force climbing out of
// Gehennom (its odds by alignment, its bounds, its decay), teleports and level teleports refused,
// the faster Luck timeout, the spell energy drain, the extra hunger, clairvoyance, the portal
// hints of the worn Amulet, peace_minded() and sleeping monsters, the first level's stairs (to the
// Planes with the Amulet since m23 step 7) and "(with a fake Amulet)". Outcomes over seeds.
// ref: src/dungeon.c level_difficulty(), deepest_lev_reached(); src/do.c goto_level();
// src/teleport.c scrolltele(), level_tele(); src/timeout.c nh_timeout(); src/spell.c
// spelleffects(); src/eat.c gethungry(); src/allmain.c moveloop_core(); src/wizard.c amulet();
// src/makemon.c peace_minded(), makemon(); src/potion.c peffect_gain_level(); src/end.c done()
import {
  buildSnapshot,
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { makemon, peaceMinded } from '../src/generation';
import { amulet } from '../src/harass';
import { gethungry } from '../src/hunger';
import { mksobj } from '../src/items';
import { deepestLevReached, levelDifficulty } from '../src/levdiff';
import { GEHENNOM, PLANES } from '../src/levelflags';
import { setU, uState } from '../src/luck';
import { MAGIC_PORTAL } from '../src/portal';
import { updateWornProps } from '../src/props';
import { SOKOBAN_DUNGEON } from '../src/teleport';
import { mysteriousForce } from '../src/mysteryforce';
import { T, terrainIdAt } from '../src/terrain';
import { levelTele, maketrap, tele } from '../src/trap';
import { AMULET_OF_YENDOR } from '../src/uhave';
import { pwOf, setPw } from '../src/uenergy';
import { levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'am',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'am:run',
      labelKey: 'am',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'am:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const FORCE = 'A mysterious force momentarily surrounds you...';

/** Gives the hero the real Amulet (made as NetHack makes it: `made_amulet` set). */
function giveAmulet(state: GameState): Entity {
  let id: EntityId = 0;
  run(state, (ctx) => {
    id = mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), {
      init: true,
      carriedBy: state.playerId,
    });
  });
  return ent(state, id);
}

/** A new game, the hero sturdy and her kit plain (the Amulet's wish already granted). */
function game(seed: number): GameState {
  const { state } = engine.newGame({ seed });
  plainKit(state);
  setU({ state }, { amuletWish: true });
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  return state;
}

const goTo = (state: GameState, dungeon: DefId, dlevel: number, at: 'up' | 'random' = 'random') =>
  run(state, (ctx) => ctx.goToLevel({ dungeon, dlevel }, at));

const diffHere = (state: GameState): number => {
  let d = 0;
  run(state, (ctx) => {
    d = levelDifficulty(ctx);
  });
  return d;
};

describe('level_difficulty()', () => {
  test('the depth; two more per level climbed into a builds-up branch; doubled by aggravate', () => {
    const state = game(1);
    expect(diffHere(state)).toBe(1);
    const soko = dungeonLayout(state, SOKOBAN_DUNGEON);
    for (const dlevel of [soko.levels!, 1]) {
      goTo(state, SOKOBAN_DUNGEON, dlevel);
      const l = getLevel(state);
      // entry_lev is the bottom level: depth + 2 * (entry - dlevel + 1)
      expect(diffHere(state)).toBe(l.depth + 2 * (soko.levels! - dlevel + 1));
    }
    // a worn ring of aggravate monster doubles it, 50 past 25
    goTo(state, 'nh:main', 3);
    let ring: EntityId = 0;
    run(state, (ctx) => {
      ring = mksobj(ctx, ctx.defs.object('nh:ring_of_aggravate_monster'), {
        init: false,
        carriedBy: state.playerId,
      });
    });
    ent(state, ring).c.item!.equipped = 'ringL';
    updateWornProps(state, engine.registry, state.playerId);
    expect(diffHere(state)).toBe(6);
    getLevel(state).depth = 26; // (a deep level's depth)
    expect(diffHere(state)).toBe(50);
  });

  test('with the Amulet: the deepest level she has reached, wherever she is', () => {
    const state = game(2);
    goTo(state, 'nh:main', 6);
    goTo(state, 'nh:main', 2);
    expect(diffHere(state)).toBe(2);
    const amu = giveAmulet(state);
    expect(deepestLevReached(state, false)).toBe(6);
    expect(diffHere(state)).toBe(6);
    goTo(state, 'nh:main', 1);
    expect(diffHere(state)).toBe(6);
    run(state, (ctx) => ctx.remove(amu.id));
    expect(diffHere(state)).toBe(1);
  });

  test("on the Planes: the Sanctum's depth plus half her experience level", () => {
    const state = game(3);
    const hell = dungeonLayout(state, GEHENNOM);
    const sanctum = hell.special.find((s) => s.id === 'nh:sanctum')!;
    const sanctumDepth = hell.depthStart + sanctum.dlevel - 1;
    getPlayer(state).c.experience!.level = 9;
    goTo(state, PLANES, 1);
    expect(getLevel(state).dungeon).toBe(PLANES);
    expect(diffHere(state)).toBe(sanctumDepth + 4);
    giveAmulet(state);
    expect(diffHere(state)).toBe(sanctumDepth + 4);
  });
});

interface Climb {
  texts: string[];
  dlevel: number;
  force: number;
}

/** Climbs the up stairs of Gehennom's level `dlevel` (alignment `align`, the force at `force`). */
function climb(
  seed: number,
  dlevel: number,
  opts: { amulet?: boolean; align?: number; force?: number } = {},
): Climb {
  const state = game(seed);
  setU({ state }, { alignType: opts.align ?? 0, mysteryForce: opts.force ?? 0 });
  if (opts.amulet !== false) giveAmulet(state);
  goTo(state, GEHENNOM, dlevel, 'up');
  expect(getLevel(state).dlevel).toBe(dlevel);
  const r = engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
  const l = getLevel(state);
  expect(l.dungeon).toBe(GEHENNOM);
  return { texts: texts(r.events), dlevel: l.dlevel, force: uState(state).mysteryForce ?? 0 };
}

describe('the mysterious force', () => {
  /** `n` tries of the force for a lawful/neutral/chaotic hero on Gehennom's level 5. */
  function tally(align: number, force: number, n: number): Record<string, number> {
    const state = game(3);
    setU({ state }, { alignType: align });
    giveAmulet(state);
    goTo(state, GEHENNOM, 5, 'up');
    const out: Record<string, number> = {};
    run(state, (ctx) => {
      for (let i = 0; i < n; i++) {
        setU(ctx, { mysteryForce: force });
        const r = mysteriousForce(ctx, { dungeon: GEHENNOM, dlevel: 4 });
        const k = r.kind === 'down' ? `down${r.to.dlevel - 5}` : r.kind;
        out[k] = (out[k] ?? 0) + 1;
        const grown = (uState(ctx.state).mysteryForce ?? 0) - force;
        const levels = r.kind === 'down' ? r.to.dlevel - 5 : 0;
        // it grows by rn2(levels down + 2)
        expect(grown).toBeGreaterThanOrEqual(0);
        expect(grown).toBeLessThanOrEqual(r.kind === 'none' ? 0 : levels + 1);
      }
    });
    return out;
  }

  test("1 time in 4: C's odds of staying or going 1-3 levels down, by alignment", () => {
    const n = 4000;
    // ref: goto_level()'s table: "up" 75%; 0: 6.25/8.33/12.5; -1: 11.46/12.5/12.5;
    // -2: 5.21/4.17/0; -3: 2.08/0/0 (lawful/neutral/chaotic)
    const table: Record<number, Record<string, number>> = {
      1: { none: 75, stay: 6.25, down1: 11.46, down2: 5.21, down3: 2.08 },
      0: { none: 75, stay: 8.33, down1: 12.5, down2: 4.17 },
      [-1]: { none: 75, stay: 12.5, down1: 12.5 },
    };
    for (const align of [1, 0, -1]) {
      const got = tally(align, 0, n);
      const want = table[align]!;
      expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
      for (const [k, pct] of Object.entries(want))
        expect(Math.abs(((got[k] ?? 0) * 100) / n - pct)).toBeLessThan(2);
    }
  });

  test('it grows rarer each time it kicks in: 1 time in 4 + its count', () => {
    const n = 4000;
    const got = tally(1, 36, n);
    expect(Math.abs(((n - (got['none'] ?? 0)) * 100) / n - 100 / 40)).toBeLessThan(1);
  });

  test('climbing the stairs: "A mysterious force momentarily surrounds you..."', () => {
    // a chaotic hero: kept on her level or sent one level down, equally often
    const k = 5;
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200 && seen.size < 2; seed++) {
      const c = climb(seed, k, { align: -1 });
      if (!c.texts.includes(FORCE)) {
        expect(c.dlevel).toBe(k - 1);
        continue;
      }
      expect(c.texts[0]).toBe(FORCE);
      expect([k, k + 1]).toContain(c.dlevel);
      seen.add(c.dlevel - k);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  test('never without the Amulet, nor from the bottom four levels', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const c = climb(seed, 5, { amulet: false });
      expect(c.texts).not.toContain(FORCE);
      expect(c.dlevel).toBe(4);
      const n = dungeonLayout(game(seed), GEHENNOM).levels!;
      const b = climb(seed, n - 3);
      expect(b.texts).not.toContain(FORCE);
      expect(b.dlevel).toBe(n - 4);
    }
  });
});

describe('teleporting with the Amulet', () => {
  test('1 time in 3 only "You feel disoriented for a moment."; level teleports refused', () => {
    let dis = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const state = game(seed);
      giveAmulet(state);
      const before = { ...getPlayer(state).c.pos! };
      const t = run(state, (ctx) => {
        tele(ctx);
      });
      if (t.includes('You feel disoriented for a moment.')) {
        dis++;
        expect(getPlayer(state).c.pos).toEqual(before);
      }
      const lt = run(state, (ctx) => levelTele(ctx));
      expect(lt).toEqual(['You feel very disoriented for a moment.']);
      expect(getLevel(state).dlevel).toBe(1);
    }
    expect(dis).toBeGreaterThan(3);
    expect(dis).toBeLessThan(20);
  });
});

describe('the Luck timeout', () => {
  test('every 300 turns with the Amulet, every 600 without', () => {
    for (const amu of [true, false]) {
      const state = game(4);
      if (amu) giveAmulet(state);
      setU({ state }, { luck: 3 });
      state.turn = 290;
      for (let i = 0; i < 20 && state.turn < 305; i++) engine.step(state, { type: 'wait' });
      expect(state.turn).toBeGreaterThanOrEqual(300);
      expect(uState(state).luck).toBe(amu ? 2 : 3);
    }
  });
});

describe('the spell energy drain', () => {
  const caster = () => {
    const s = levelSetup(['.......', '...@...', '.......']);
    const h = getPlayer(s.state);
    h.c.attributes!.wis = 25;
    const robe = s.carry('nh:robe');
    s.state.entities[String(robe)]!.c.item!.equipped = 'cloak';
    (s.state.modData['nh'] as Record<string, unknown>)['spells'] = [
      { id: 'nh:spellbook_of_force_bolt', retention: 20000 },
    ];
    s.carry(AMULET_OF_YENDOR);
    setU({ state: s.state }, { amuletWish: true });
    return s;
  };
  const cast = (s: ReturnType<typeof caster>): string[] => {
    const out = s.text(s.mod('nh:cast'));
    if (s.state.pendingPrompt?.prompt.id === 'cast-menu')
      out.push(
        ...s.text(engine.step(s.state, { type: 'answer', promptId: 'cast-menu', value: 0 })),
      );
    if (s.state.pendingPrompt?.prompt.id === 'cast-direction')
      out.push(
        ...s.text(engine.step(s.state, { type: 'answer', promptId: 'cast-direction', value: 'h' })),
      );
    return out;
  };

  test('"You feel the amulet draining your energy away." and up to twice the cost more', () => {
    const s = caster();
    setPw(s.ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
    const t = cast(s);
    expect(t[0]).toBe('You feel the amulet draining your energy away.');
    // force bolt costs 5; the drain rnd(10)
    const uen = pwOf(s.state).uen;
    expect(uen).toBeGreaterThanOrEqual(100 - 5 - 10);
    expect(uen).toBeLessThanOrEqual(100 - 5 - 1);
  });

  test('not when she lacks the energy for the spell anyway', () => {
    const s = caster();
    setPw(s.ctx, { uen: 4, uenmax: 100, uenpeak: 100 });
    const turn = s.state.turn;
    const t = cast(s);
    expect(t).not.toContain('You feel the amulet draining your energy away.');
    expect(t.some((m) => m.startsWith("You don't have enough energy"))).toBe(true);
    expect(pwOf(s.state).uen).toBe(4);
    expect(s.state.turn).toBe(turn);
  });
});

describe('hunger', () => {
  test('the Amulet burns food 1 turn in 20', () => {
    const burn = (amu: boolean): number => {
      const state = game(5);
      if (amu)
        run(state, (ctx) => {
          // made without its init roll, so both games draw the same numbers
          mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), {
            init: false,
            carriedBy: state.playerId,
          });
        });
      const h = getPlayer(state).c.hunger!;
      h.nutrition = 2000;
      run(state, (ctx) => {
        for (let i = 0; i < 400; i++) gethungry(ctx);
      });
      return 2000 - h.nutrition;
    };
    const without = burn(false);
    const withAmu = burn(true);
    expect(withAmu).toBeGreaterThan(without);
    expect(withAmu - without).toBeLessThan(60);
  });
});

describe('clairvoyance', () => {
  const known = (state: GameState): number =>
    state.memory[state.currentLevel]!.filter((v) => v !== -1).length;

  test('the Amulet maps her surroundings, not on the Planes', () => {
    const plain = game(6);
    engine.step(plain, { type: 'wait' });
    const seer = game(6);
    giveAmulet(seer);
    engine.step(seer, { type: 'wait' });
    expect(known(seer)).toBeGreaterThan(known(plain));
    const planes = game(6);
    goTo(planes, PLANES, 1);
    giveAmulet(planes);
    engine.step(planes, { type: 'wait' });
    expect((planes.modData['nh'] as Record<string, unknown>)['seerTurn']).toBeUndefined();
  });
});

describe('the worn Amulet near a magic portal', () => {
  test('"feels hot!" within 3 squares, 1 turn in 15; nothing when only carried', () => {
    for (const worn of [true, false]) {
      const state = game(7);
      const amu = giveAmulet(state);
      if (worn) amu.c.item!.equipped = 'amulet';
      const p = getPlayer(state).c.pos!;
      // a floor square within 3 of her
      const level = getLevel(state);
      let at = { x: -1, y: -1 };
      for (let dy = -2; dy <= 2 && at.x < 0; dy++)
        for (let dx = -2; dx <= 2 && at.x < 0; dx++)
          if ((dx || dy) && terrainIdAt(level, p.x + dx, p.y + dy) === T.floor)
            at = { x: p.x + dx, y: p.y + dy };
      expect(at.x).toBeGreaterThanOrEqual(0);
      const out = run(state, (ctx) => {
        maketrap(ctx, p.level, at.x, at.y, MAGIC_PORTAL);
        for (let i = 0; i < 120; i++) amulet(ctx);
      });
      if (worn) {
        expect(out.length).toBeGreaterThan(0);
        expect(new Set(out)).toEqual(new Set(['The Amulet of Yendor feels hot!']));
      } else expect(out).toEqual([]);
    }
  });
});

describe('monsters and the Amulet', () => {
  test('a chaotic monster is never peaceful to a chaotic hero with the Amulet', () => {
    for (const amu of [false, true]) {
      const state = game(8);
      setU({ state }, { alignType: -1, alignRecord: 10 });
      if (amu) giveAmulet(state);
      let peaceful = 0;
      run(state, (ctx) => {
        const imp = ctx.defs.monster('nh:homunculus'); // chaotic, no race to love or hate
        for (let i = 0; i < 60; i++) if (peaceMinded(ctx, imp)) peaceful++;
      });
      if (amu) expect(peaceful).toBe(0);
      else expect(peaceful).toBeGreaterThan(0);
    }
  });

  test('nymphs are made awake while she carries it', () => {
    for (const amu of [false, true]) {
      const state = game(9);
      if (amu) giveAmulet(state);
      let asleep = 0;
      const p = getPlayer(state).c.pos!;
      run(state, (ctx) => {
        for (let i = 0; i < 20; i++) {
          const id = makemon(
            ctx,
            ctx.defs.monster('nh:water_nymph'),
            { x: p.x, y: p.y },
            {
              adjacentOk: true,
            },
          );
          if (id !== null && ent(state, id).c.monster!.asleep) asleep++;
          if (id !== null) ctx.remove(id);
        }
      });
      if (amu) expect(asleep).toBe(0);
      else expect(asleep).toBeGreaterThan(10);
    }
  });
});

describe('leaving the dungeon from the first level', () => {
  const status = (state: GameState) => buildSnapshot(engine.registry, state).status;

  test("the first level's up stairs with the Amulet lead to the Planes, not out (m23 step 7)", () => {
    const state = game(10);
    giveAmulet(state);
    const up = getLevel(state).up!;
    Object.assign(getPlayer(state).c.pos!, { x: up.x, y: up.y });
    engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
    expect(state.pendingPrompt?.prompt.key).toBe('stairs.leave_confirm');
    engine.step(state, { type: 'answer', promptId: 'leave-dungeon', value: true });
    expect(state.gameOver).toBeNull();
    expect(getLevel(state).dungeon).toBe(PLANES);
    expect(status(state)['endHow'] ?? null).toBeNull();
  });

  test('a fake Amulet escapes "(with a fake Amulet)"; no suffix without either', () => {
    for (const fake of [true, false]) {
      const state = game(11);
      if (fake)
        run(state, (ctx) => {
          mksobj(ctx, ctx.defs.object('nh:fake_amulet_of_yendor'), {
            init: false,
            carriedBy: state.playerId,
          });
        });
      const up = getLevel(state).up!;
      Object.assign(getPlayer(state).c.pos!, { x: up.x, y: up.y });
      engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
      engine.step(state, { type: 'answer', promptId: 'leave-dungeon', value: true });
      expect(status(state)['deathSuffix'] ?? null).toBe(fake ? 'end.with_fake_amulet' : null);
    }
  });

  test('a cursed potion of gain level on the first level: an uneasy feeling without the Amulet', () => {
    // (with it she rises to the Plane of Earth: m23.planes.test.ts)
    const s = levelSetup();
    setU({ state: s.state }, { amuletWish: true });
    const pot = s.carry('nh:potion_of_gain_level');
    s.state.entities[String(pot)]!.c.item!.buc = 'cursed';
    const t = s.text(s.mod('nh:quaff', { item: pot }));
    expect(t).toEqual(['You have an uneasy feeling.']);
    expect(s.state.gameOver).toBeNull();
  });
});
