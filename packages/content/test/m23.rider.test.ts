// m23 step 9: the Riders and the player monsters. The Riders on the Astral Plane (each on one of
// the script's three spots, Pestilence with its potion of sickness, d(10, 8) hit points); Death's,
// Pestilence's and Famine's touches on the hero and on monsters; a Rider's corpse always reviving
// (from its timer, or when handled); eating one; the player monsters of final_level() and their
// gear by role. Outcomes over seeds.
// ref: include/monsters.h; src/uhitm.c mhitm_ad_deth(), mhitm_ad_pest(), mhitm_ad_famn();
// src/mhitu.c hitmu(); src/mkobj.c start_corpse_timeout(), rider_revival_time(); src/do.c
// revive_mon(), revive_corpse(); src/pickup.c rider_corpse_revival(); src/eat.c cprefx();
// src/mplayer.c create_mplayers(), mk_mplayer(); src/do.c final_level(); dat/astral.lua
import {
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { newMhm, mhitmAdtyping } from '../src/adtyping';
import { ASTRAL } from '../src/astral';
import { monsterAttack } from '../src/combat';
import { startCorpseTimeout } from '../src/corpses';
import { chamOf } from '../src/chamstate';
import { domonnoise } from '../src/chat';
import { cprefxMon } from '../src/eat';
import { makemon } from '../src/generation';
import { hungerData } from '../src/hunger';
import { vanillaMod } from '../src/index';
import { mkcorpse, mksobj } from '../src/items';
import { PLANES, PLANE_LEVELS } from '../src/levelflags';
import { setU } from '../src/luck';
import { MPLAYERS } from '../src/mondata';
import { mkMplayer, mplayerName } from '../src/mplayer';
import { P, setIntrinsic } from '../src/props';
import { riderCorpseRevival } from '../src/rider';
import { mapToLevel } from '../src/sp_lev';
import { AMULET_OF_YENDOR } from '../src/uhave';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'rd',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'rd:run',
      labelKey: 'rd',
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
  return texts(engine.step(state, { type: 'mod', action: 'rd:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const def = (id: string) => engine.registry.monster(id as DefId);

const DEATH = 'nh:death';
const PESTILENCE = 'nh:pestilence';
const FAMINE = 'nh:famine';
const RIDERS = [DEATH, PESTILENCE, FAMINE];

/** A new game; the hero sturdy (999 hit points at level 1). */
function game(seed: number): GameState {
  const { state } = engine.newGame({ seed });
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  return state;
}

/** A free floor spot next to the hero. */
function nextTo(state: GameState): Pos {
  const l = getLevel(state);
  const h = getPlayer(state).c.pos!;
  const taken = new Set(
    Object.values(state.entities)
      .filter((e) => e.c.monster && e.c.pos?.level === l.id)
      .map((e) => `${e.c.pos!.x},${e.c.pos!.y}`),
  );
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const x = h.x + dx;
      const y = h.y + dy;
      if ((dx || dy) && !taken.has(`${x},${y}`)) {
        const t = engine.registry.terrain(l.palette[l.cells[y * l.width + x] ?? 0]!);
        if (t.passable && t.id === 'nh:floor') return { x, y };
      }
    }
  throw new Error('no room next to the hero');
}

/** Makes `kind` next to the hero (asleep, speed 0: it does not act on its own). */
function pinned(state: GameState, kind: string): EntityId {
  let id: EntityId | null = null;
  run(state, (ctx) => {
    id = makemon(ctx, def(kind), nextTo(state), { asleep: true });
  });
  const m = ent(state, id!);
  m.c.actor!.speed = 0;
  return id!;
}

const monsOf = (state: GameState, kind: string): Entity[] =>
  sortedIds(state)
    .map((i) => state.entities[String(i)]!)
    .filter((e) => e.c.monster && e.def === kind);

describe('the Riders on the Astral Plane', () => {
  /** To the Astral Plane with the Amulet: the level. */
  function astral(seed: number): { state: GameState; level: Level; msgs: string[] } {
    const state = game(seed);
    setU({ state }, { amuletWish: true });
    run(state, (ctx) => {
      mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), { init: true, carriedBy: state.playerId });
    });
    const sp = dungeonLayout(state, PLANES).special.find((s) => s.id === PLANE_LEVELS.astral)!;
    const msgs = run(state, (ctx) =>
      ctx.goToLevel({ dungeon: PLANES, dlevel: sp.dlevel }, 'random'),
    );
    return { state, level: getLevel(state), msgs };
  }

  test('each Rider is made on one of the three spots, hostile, Pestilence with sickness', () => {
    const spots = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { state, level } = astral(seed);
      const place = [
        [23, 9],
        [37, 14],
        [51, 9],
      ].map(([x, y]) => mapToLevel(ASTRAL, level, x!, y!));
      const taken: string[] = [];
      for (const kind of RIDERS) {
        const [r] = monsOf(state, kind);
        expect(r, kind).toBeDefined();
        const p = r!.c.pos!;
        const i = place.findIndex((q) => q.x === p.x && q.y === p.y);
        // a Rider may have moved one step already: it is made on (or next to) its spot
        const near = place.findIndex(
          (q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) <= 1,
        );
        expect(i >= 0 || near >= 0, `${kind} at ${p.x},${p.y}`).toBe(true);
        if (i >= 0) {
          taken.push(`${i}`);
          spots.add(`${kind}:${i}`);
        }
        expect(r!.c.monster!.peaceful).toBe(false);
        expect(r!.c.hp!.max).toBeGreaterThanOrEqual(11);
        expect(r!.c.hp!.max).toBeLessThanOrEqual(80);
      }
      expect(new Set(taken).size).toBe(taken.length); // never two on one spot
      const [pest] = monsOf(state, PESTILENCE);
      expect(inventoryOf(state, pest!.id).some((o) => o.def === 'nh:potion_of_sickness')).toBe(
        true,
      );
    }
    // the spots are drawn: not always the same Rider on the same spot
    expect(spots.size).toBeGreaterThan(3);
  });

  test("final_level() makes 3..6 player monsters with the endgame's gear", () => {
    for (const seed of [1, 2, 3]) {
      const { state, level } = astral(seed);
      // (a doppelganger may have taken a player monster's shape: not one of these)
      const mps = Object.values(state.entities).filter(
        (e) =>
          e.c.monster &&
          e.c.pos?.level === level.id &&
          MPLAYERS.includes(e.def) &&
          chamOf({ state }, e.id) === null,
      );
      expect(mps.length).toBeGreaterThanOrEqual(3);
      expect(mps.length).toBeLessThanOrEqual(6);
      for (const m of mps) {
        expect(m.c.monster!.level).toBeGreaterThanOrEqual(15);
        expect(m.c.monster!.level).toBeLessThanOrEqual(30);
        expect(m.c.monster!.peaceful).toBe(false);
        expect(inventoryOf(state, m.id).some((o) => o.def === 'nh:fake_amulet_of_yendor')).toBe(
          true,
        );
        expect(typeof mplayerName({ state }, m.id)).toBe('string');
      }
      // dev_name(): no two share a developer's name (Adam and Eve aside)
      const names = mps.map((m) => mplayerName({ state }, m.id)).filter((n) => n.length > 2);
      for (const n of names)
        expect(names.filter((o) => o.startsWith(n) || n.startsWith(o)).length).toBe(1);
    }
  });
});

describe("the Riders' touches", () => {
  test("Death's touch: the life force drains her maximum hit points, or nothing happens", () => {
    let drained = 0;
    let lucky = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const state = game(seed);
      const death = pinned(state, DEATH);
      for (let i = 0; i < 30 && !state.gameOver; i++) {
        const before = getPlayer(state).c.hp!.max;
        const msgs = run(state, (ctx) => monsterAttack(ctx, death));
        const after = getPlayer(state).c.hp!.max;
        if (msgs.some((m) => m.includes('deadly touch'))) {
          expect(msgs).toContain('Death reaches out with its deadly touch.');
        }
        if (
          msgs.includes('You feel your life force draining away...') &&
          !msgs.includes('You feel drained...')
        ) {
          expect(after).toBeLessThan(before);
          expect(after).toBeGreaterThanOrEqual(1);
          drained++;
        }
        if (msgs.includes("Lucky for you, it didn't work!")) lucky++;
        getPlayer(state).c.hp = { cur: 999, max: 999 };
      }
    }
    expect(drained).toBeGreaterThan(0);
    expect(lucky).toBeGreaterThan(0);
  });

  test('magic resistance keeps the touch of death away', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const state = game(seed);
      setIntrinsic(getPlayer(state), P.ANTIMAGIC, true);
      const death = pinned(state, DEATH);
      for (let i = 0; i < 30 && !state.gameOver; i++) {
        const msgs = run(state, (ctx) => monsterAttack(ctx, death));
        expect(msgs).not.toContain('You feel drained...');
        getPlayer(state).c.hp = { cur: 999, max: 999 };
      }
      expect(state.gameOver).toBeNull();
    }
  });

  test("Pestilence's touch makes her deathly sick; Famine's makes her hungry", () => {
    const state = game(1);
    const pest = pinned(state, PESTILENCE);
    const famine = pinned(state, FAMINE);
    const atk = { at: 'touch' as const, ad: 'pest', n: 8, d: 8 };
    let msgs = run(state, (ctx) => mhitmAdtyping(ctx, pest, atk, state.playerId, newMhm(10)));
    expect(msgs).toContain('Pestilence reaches out, and you feel fever and chills.');
    expect(hungerData({ state }).sick).not.toBeNull();
    const h = getPlayer(state).c.hunger!;
    h.nutrition = 900;
    const mhm = newMhm(10);
    msgs = run(state, (ctx) =>
      mhitmAdtyping(ctx, famine, { ...atk, ad: 'famn' }, state.playerId, mhm),
    );
    expect(msgs).toContain('Famine reaches out, and your body shrivels.');
    expect(mhm.damage).toBe(10); // plus the normal damage
    expect(900 - getPlayer(state).c.hunger!.nutrition).toBeGreaterThanOrEqual(40);
  });

  test("Famine's touch does not harm a monster that does not eat; Death's drains a monster", () => {
    const state = game(2);
    const famine = pinned(state, FAMINE);
    const golem = pinned(state, 'nh:iron_golem');
    const jackal = pinned(state, 'nh:jackal');
    const atk = { at: 'touch' as const, ad: 'famn', n: 8, d: 8 };
    const a = newMhm(10);
    const b = newMhm(10);
    run(state, (ctx) => {
      mhitmAdtyping(ctx, famine, atk, golem, a);
      mhitmAdtyping(ctx, famine, atk, jackal, b);
    });
    expect(a.damage).toBe(0);
    expect(b.damage).toBe(10);
  });
});

describe("a Rider's corpse", () => {
  /** Death's corpse at the hero's feet, with its timer. */
  function corpse(state: GameState): EntityId {
    let id: EntityId = 0;
    run(state, (ctx) => {
      const at = nextTo(state);
      id = mkcorpse(ctx, ctx.defs.monster(DEATH as DefId), {
        at: { level: state.currentLevel, x: at.x, y: at.y },
      });
      startCorpseTimeout(ctx, id);
    });
    return id;
  }

  test('always gets a revival timer, and Death rises within 67 turns in view', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const state = game(seed);
      const c = corpse(state);
      const t = state.timers.filter((x) => (x.data as { id?: number } | null)?.id === c);
      expect(t.map((x) => x.kind)).toEqual(['nh:revive_mon']);
      const seen: string[] = [];
      for (let i = 0; i < 80 && state.entities[String(c)]; i++)
        seen.push(...texts(engine.step(state, { type: 'search' }).events));
      expect(state.entities[String(c)]).toBeUndefined();
      expect(monsOf(state, DEATH).length).toBe(1);
      expect(seen).toContain('Death rises from the dead in a whirl of spectral skulls!');
    }
  });

  test('handling it makes it revive: "At your touch, the corpse suddenly moves..."', () => {
    const state = game(3);
    const c = corpse(state);
    let r = false;
    const msgs = run(state, (ctx) => {
      r = riderCorpseRevival(ctx, ent(state, c), false);
    });
    expect(r).toBe(true);
    expect(msgs[0]).toBe('At your touch, the corpse suddenly moves...');
    expect(state.entities[String(c)]).toBeUndefined();
    expect(monsOf(state, DEATH).length).toBe(1);
  });

  test('eating one is instantly fatal', () => {
    const state = game(4);
    const msgs = run(state, (ctx) => cprefxMon(ctx, ctx.defs.monster(FAMINE as DefId)));
    expect(msgs).toContain('Eating that is instantly fatal.');
    expect(state.gameOver?.killer).toBe('!@killer.rider.ate_body|=@nh:famine');
  });
});

describe('player monsters', () => {
  /** A player monster of `kind` next to the hero on the Astral Plane (special) or DL1. */
  function mplayer(seed: number, kind: string, special: boolean): { state: GameState; m: Entity } {
    const state = game(seed);
    let lev = state.currentLevel;
    if (special) {
      const sp = dungeonLayout(state, PLANES).special.find((s) => s.id === PLANE_LEVELS.astral)!;
      setU({ state }, { amuletWish: true });
      run(state, (ctx) => {
        mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), { init: true, carriedBy: state.playerId });
      });
      run(state, (ctx) => ctx.goToLevel({ dungeon: PLANES, dlevel: sp.dlevel }, 'random'));
      lev = state.currentLevel;
    }
    let id: EntityId | null = null;
    run(state, (ctx) => {
      id = mkMplayer(ctx, ctx.defs.monster(kind as DefId), nextTo(state), special, lev);
    });
    return { state, m: ent(state, id!) };
  }
  const items = (state: GameState, m: Entity): string[] =>
    inventoryOf(state, m.id).map((o) => o.def);

  test('outside the endgame: level 1..16, no imitation Amulet, no name', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { state, m } = mplayer(seed, 'nh:knight', false);
      expect(m.c.monster!.level).toBeGreaterThanOrEqual(1);
      expect(m.c.monster!.level).toBeLessThanOrEqual(16);
      expect(m.c.hp!.max).toBeGreaterThanOrEqual(30 + m.c.monster!.level);
      expect(items(state, m)).not.toContain('nh:fake_amulet_of_yendor');
      expect(mplayerName({ state }, m.id)).toBe('');
    }
  });

  test("the endgame gear by role: a monk's robe, a wizard's cloak of magic resistance", () => {
    let mr = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const monk = mplayer(seed, 'nh:monk', true);
      const mi = items(monk.state, monk.m);
      expect(mi).toContain('nh:robe');
      expect(mi).toContain('nh:fake_amulet_of_yendor');
      // the endgame gear is worn (m_dowear()): the robe as its cloak
      const robe = inventoryOf(monk.state, monk.m.id).find((o) => o.def === 'nh:robe');
      expect(robe?.c.item?.equipped).toBe('cloak');
      const wiz = mplayer(seed, 'nh:wizard', true);
      if (items(wiz.state, wiz.m).includes('nh:cloak_of_magic_resistance')) mr++;
    }
    expect(mr).toBeGreaterThan(0);
  });

  test('in the endgame a hostile one taunts: "Talk? -- ..."', () => {
    const { state, m } = mplayer(1, 'nh:samurai', true);
    const msgs = run(state, (ctx) => void domonnoise(ctx, m.id));
    expect(msgs[0]).toMatch(/^"Talk\? -- /);
  });

  test('a valkyrie with a war hammer has gauntlets of power; a female name', () => {
    let hammer = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { state, m } = mplayer(seed, 'nh:valkyrie', true);
      const it = items(state, m);
      if (it.includes('nh:war_hammer')) {
        expect(it).toContain('nh:gauntlets_of_power');
        hammer++;
      }
      const n = mplayerName({ state }, m.id);
      expect(['Eve', 'Maud', 'Janet']).toContain(n);
    }
    expect(hammer).toBeGreaterThan(0);
  });
});

describe('talking to them', () => {
  test('"Who do you think you are, War?" (Death in capitals)', () => {
    const state = game(5);
    const famine = pinned(state, FAMINE);
    const msgs = run(state, (ctx) => void domonnoise(ctx, famine));
    expect(msgs).toEqual(['"Who do you think you are, War?"']);
    let war = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const st = game(seed);
      const death = pinned(st, DEATH);
      const m = run(st, (ctx) => void domonnoise(ctx, death));
      if (m[0] === 'WHO DO YOU THINK YOU ARE, WAR?') war++;
      else expect(m[0]).toBe('Death is busy reading a copy of Sandman #8.');
    }
    expect(war).toBeGreaterThan(5);
  });
});
