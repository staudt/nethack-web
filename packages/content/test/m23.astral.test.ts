// m23 step 8: the Astral Plane and ascension. astral.lua built as its script says (the three high
// temples with shuffled gods and their high priests, Moloch's horde and the aligned horde, the
// opened wings with their Angels, no stairs, the flags); the arrival lines and final_level()
// (reset_hostility(), the guardian angel, Conflict's hostile Angels); the guardian angel as a pet
// with no pet record that leaves under Conflict; the hidden high priests; the Furies; offering
// the Amulet to her own god (the ascended end) or another (celestial disgrace). Outcomes over
// seeds.
// ref: dat/astral.lua; src/do.c final_level(); src/priest.c reset_hostility(), priestname();
// src/minion.c gain_guardian_angel(), lose_guardian_angel(); src/dogmove.c dog_move();
// src/attrib.c uchangealign(); src/pray.c offer_real_amulet(); src/end.c done(), really_done()
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
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { A_NONE, altarAlign } from '../src/aligntyp';
import { ASTRAL, ASTRAL_ALTARS } from '../src/astral';
import { edogOf } from '../src/dog';
import { dogMove } from '../src/dogmove';
import { uchangealign } from '../src/dowear';
import { emin } from '../src/emin';
import { epriOf, priestName } from '../src/epri';
import { isHighAltar } from '../src/highaltar';
import { vanillaMod } from '../src/index';
import { mksobj } from '../src/items';
import { PLANES, PLANE_LEVELS, levelFlags } from '../src/levelflags';
import { setU, uState } from '../src/luck';
import { mapToLevel } from '../src/sp_lev';
import { terrainIdAt } from '../src/terrain';
import { AMULET_OF_YENDOR } from '../src/uhave';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'as',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'as:run',
      labelKey: 'as',
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
  return texts(engine.step(state, { type: 'mod', action: 'as:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const status = (state: GameState) => buildSnapshot(engine.registry, state).status;

const ANGEL = 'nh:angel';
const CLERIC = 'nh:aligned_cleric';

/** A new game, the hero sturdy, carrying the Amulet (its wish granted), with `record`. */
function game(seed: number, record = 0): GameState {
  const { state } = engine.newGame({ seed });
  setU({ state }, { amuletWish: true, alignRecord: record });
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  run(state, (ctx) => {
    mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), { init: true, carriedBy: state.playerId });
  });
  return state;
}

/** To the Astral Plane (its first arrival): the messages. */
function toAstral(state: GameState): string[] {
  const sp = dungeonLayout(state, PLANES).special.find((s) => s.id === PLANE_LEVELS.astral)!;
  return run(state, (ctx) => ctx.goToLevel({ dungeon: PLANES, dlevel: sp.dlevel }, 'random'));
}

const monsOn = (state: GameState, l: Level): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.id !== state.playerId,
  );
const monAt = (state: GameState, l: Level, p: Pos): Entity | undefined =>
  monsOn(state, l).find((e) => e.c.pos!.x === p.x && e.c.pos!.y === p.y);
const at = (l: Level, x: number, y: number): Pos => mapToLevel(ASTRAL, l, x, y);

/** The three altars' alignments, in the script's order. */
const altarAligns = (l: Level): number[] =>
  ASTRAL_ALTARS.map(([x, y]) => {
    const p = at(l, x, y);
    return altarAlign(terrainIdAt(l, p.x, p.y)!)!;
  });

/** Moloch's horde: the script's noalign clerics and Angels. */
const MOLOCH_HORDE: readonly [string, number, number][] = [
  [CLERIC, 18, 9],
  [CLERIC, 19, 8],
  [CLERIC, 19, 9],
  [CLERIC, 19, 10],
  [ANGEL, 20, 9],
  [ANGEL, 20, 10],
  [CLERIC, 36, 12],
  [CLERIC, 37, 12],
  [CLERIC, 38, 12],
  [CLERIC, 36, 13],
  [ANGEL, 38, 13],
  [ANGEL, 37, 13],
  [CLERIC, 56, 9],
  [CLERIC, 55, 8],
  [CLERIC, 55, 9],
  [CLERIC, 55, 10],
  [ANGEL, 54, 9],
  [ANGEL, 54, 10],
];

/** The minions on the level serving no god other than the script's Moloch's horde. */
const hallAngels = (state: GameState, l: Level): Entity[] =>
  monsOn(state, l).filter(
    (e) =>
      e.def === ANGEL &&
      emin(state, e.id)?.minAlign === A_NONE &&
      !MOLOCH_HORDE.some(([, x, y]) => {
        const p = at(l, x, y);
        return e.c.pos!.x === p.x && e.c.pos!.y === p.y;
      }),
  );

describe('astral.lua', () => {
  test('three high temples of the three gods, each with its high priest; no stairs; the flags', () => {
    const orders = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = game(seed);
      toAstral(state);
      const l = getLevel(state);
      expect(l.def).toBe(ASTRAL.id);
      expect([l.up, l.down, l.branch]).toEqual([null, null, null]);
      // des.teleport_region({ region = {29,15,45,15}, exclude = {30,15,44,15} })
      const hp = getPlayer(state).c.pos!;
      expect([at(l, 29, 15), at(l, 45, 15)]).toContainEqual({ x: hp.x, y: hp.y });
      const aligns = altarAligns(l);
      expect([...aligns].sort()).toEqual([-1, 0, 1]);
      orders.add(aligns.join());
      expect(l.shrines).toHaveLength(3);
      run(state, (ctx) => {
        for (const [i, [x, y]] of ASTRAL_ALTARS.entries()) {
          const p = at(l, x, y);
          expect(isHighAltar(ctx, l, p.x, p.y)).toBe(true);
          // a high priest of the altar's god in the temple
          const priests = monsOn(state, l).filter((e) => {
            const ep = epriOf(ctx, e.id);
            return ep !== null && ep.shrpos.x === p.x && ep.shrpos.y === p.y;
          });
          expect(priests).toHaveLength(1);
          expect(priests[0]!.def).toBe('nh:high_priest');
          expect(epriOf(ctx, priests[0]!.id)!.shralign).toBe(aligns[i]);
          expect(Math.abs(priests[0]!.c.pos!.x - p.x)).toBeLessThanOrEqual(1);
        }
        expect(levelFlags(ctx, l)).toMatchObject({
          noteleport: true,
          hardfloor: true,
          nommap: true,
          shortsighted: true,
          nondiggable: 'all',
          nonpasswall: 'all',
        });
      });
      // Moloch's horde: hostile minions of no god at the script's spots
      for (const [def, x, y] of MOLOCH_HORDE) {
        const m = monAt(state, l, at(l, x, y));
        expect(m?.def).toBe(def);
        expect(emin(state, m!.id)?.minAlign).toBe(A_NONE);
        expect(m!.c.monster!.peaceful).toBe(false);
      }
      // the aligned horde: twelve roamers per court, four of each god
      const aligned = monsOn(state, l).filter((e) => {
        const g = emin(state, e.id)?.minAlign;
        return g !== undefined && g !== A_NONE && (e.def === ANGEL || e.def === CLERIC);
      });
      expect(aligned.length).toBeGreaterThanOrEqual(36);
      for (const g of [-1, 0, 1])
        expect(
          aligned.filter((e) => emin(state, e.id)!.minAlign === g).length,
        ).toBeGreaterThanOrEqual(12);
    }
    // the gods' places are shuffled each game
    expect(orders.size).toBeGreaterThan(1);
  });

  test('each wing opens 60% of the time, its hall holding 4 to 9 hostile Angels of no god', () => {
    const seen = { open: 0, closed: 0 };
    for (let seed = 1; seed <= 12; seed++) {
      const state = game(seed);
      toAstral(state);
      const l = getLevel(state);
      const angels = hallAngels(state, l);
      for (const [side, cell] of [
        ['west', at(l, 20, 16)],
        ['east', at(l, 54, 16)],
      ] as const) {
        const open = terrainIdAt(l, cell.x, cell.y) === 'nh:floor';
        const mid = at(l, 37, 0).x;
        const here = angels.filter((e) => (side === 'west' ? e.c.pos!.x < mid : e.c.pos!.x > mid));
        if (open) {
          seen.open++;
          expect(here.length).toBeGreaterThanOrEqual(4);
          expect(here.length).toBeLessThanOrEqual(9);
          for (const e of here) expect(e.c.monster!.peaceful).toBe(false);
        } else {
          seen.closed++;
          expect(terrainIdAt(l, cell.x, cell.y)).toBe('nh:stone');
          expect(here).toHaveLength(0);
        }
      }
    }
    expect(seen.open).toBeGreaterThan(0);
    expect(seen.closed).toBeGreaterThan(0);
  });
});

describe('arriving: final_level()', () => {
  test('the lines with her god; the roamers of other gods turn hostile; no angel unworthy', () => {
    const state = game(1, 0);
    const t = toAstral(state);
    expect(t.slice(0, 3)).toEqual([
      'You arrive on the Astral Plane!',
      'Here the High Temple of Odin is located.',
      'You sense alarm, hostility, and excitement in the air!',
    ]);
    expect(t).not.toContain('"Thou hast been worthy of me!"');
    const l = getLevel(state);
    const roamers = monsOn(state, l).filter(
      (e) => (e.def === ANGEL || e.def === CLERIC) && emin(state, e.id) !== null,
    );
    for (const e of roamers)
      if (emin(state, e.id)!.minAlign !== uState(state).alignType)
        expect(e.c.monster!.peaceful).toBe(false);
    // her own god's keep the script's placeholders: some of them are peaceful
    expect(roamers.some((e) => emin(state, e.id)!.minAlign === 0 && e.c.monster!.peaceful)).toBe(
      true,
    );
    expect(monsOn(state, l).some((e) => e.def === ANGEL && e.c.monster!.tame)).toBe(false);
    // only the first arrival
    const back = run(state, (ctx) => ctx.goToLevel({ dungeon: PLANES, dlevel: 2 }, 'random'));
    expect(back).not.toContain('You arrive on the Astral Plane!');
    expect(toAstral(state)).not.toContain('You arrive on the Astral Plane!');
  });

  test('a fervent hero gets her guardian angel: tame, strong, blessed weapon, reflection', () => {
    for (const seed of [1, 2, 3]) {
      const state = game(seed, 20);
      const t = toAstral(state);
      expect(t).toContain('A voice whispers:');
      expect(t).toContain('"Thou hast been worthy of me!"');
      expect(t).toContain('An angel appears near you.');
      const l = getLevel(state);
      const tame = monsOn(state, l).filter((e) => e.def === ANGEL && e.c.monster!.tame);
      expect(tame).toHaveLength(1);
      const a = tame[0]!;
      expect(emin(state, a.id)).toMatchObject({ minAlign: 0, renegade: false });
      expect(a.c.monster!.tame).toBe(10);
      expect(a.c.monster!.level).toBeGreaterThanOrEqual(15);
      expect(a.c.monster!.level).toBeLessThanOrEqual(22);
      expect(a.c.hp!.max).toBeGreaterThanOrEqual(a.c.monster!.level + 31);
      const hp = getPlayer(state).c.pos!;
      expect(Math.max(Math.abs(a.c.pos!.x - hp.x), Math.abs(a.c.pos!.y - hp.y))).toBe(1);
      const inv = Object.values(state.entities).filter((e) => e.c.item?.carriedBy === a.id);
      const weapon = inv.find((e) =>
        ['nh:long_sword', 'nh:silver_mace', 'nh:silver_saber'].includes(e.def),
      );
      expect(weapon?.c.item!.buc).toBe('blessed');
      expect(weapon!.c.item!.spe).toBeGreaterThanOrEqual(1);
      // its reflection, worn unless its own inventory's amulet already is (m_dowear() keeps an
      // amulet of life saving on)
      const refl = inv.find(
        (e) => e.def === 'nh:shield_of_reflection' || e.def === 'nh:amulet_of_reflection',
      );
      expect(refl).toBeDefined();
      expect(
        refl!.c.item!.equipped !== null ||
          inv.some((e) => e.def === 'nh:amulet_of_life_saving' && e.c.item!.equipped === 'amulet'),
      ).toBe(true);
      // a minion: no pet record
      expect(edogOf({ state }, a.id)).toBeNull();
    }
  });

  test('under Conflict: "Thy desire for conflict shall be fulfilled!" and hostile Angels', () => {
    const state = game(2, 20);
    const h = getPlayer(state);
    (h.c.props ??= {})['conflict'] = { intrinsic: true, timeout: 0 };
    const t = toAstral(state);
    expect(t).toContain('A voice booms:');
    expect(t).toContain('"Thy desire for conflict shall be fulfilled!"');
    expect(t).not.toContain('An angel appears near you.');
    const l = getLevel(state);
    const hp = h.c.pos!;
    const near = monsOn(state, l).filter(
      (e) =>
        e.def === ANGEL &&
        emin(state, e.id)?.minAlign === 0 &&
        emin(state, e.id)?.renegade === true &&
        Math.max(Math.abs(e.c.pos!.x - hp.x), Math.abs(e.c.pos!.y - hp.y)) <= 2,
    );
    expect(near.length).toBeGreaterThanOrEqual(2);
    expect(near.length).toBeLessThanOrEqual(4);
    for (const e of near) expect(e.c.monster!.peaceful).toBe(false);
    expect(monsOn(state, l).some((e) => e.c.monster!.tame && e.def === ANGEL)).toBe(false);
  });
});

describe('the guardian angel', () => {
  /** A fervent hero on Astral with her guardian angel; every other monster but it removed. */
  function withAngel(seed: number): { state: GameState; angel: Entity } {
    const state = game(seed, 20);
    toAstral(state);
    const l = getLevel(state);
    const angel = monsOn(state, l).find((e) => e.def === ANGEL && e.c.monster!.tame)!;
    run(state, (ctx) => {
      for (const m of monsOn(state, l)) if (m.id !== angel.id) ctx.remove(m.id);
    });
    return { state, angel };
  }

  test('it follows her, eats nothing and never gets a pet record', () => {
    const { state, angel } = withAngel(3);
    const h = getPlayer(state);
    for (let i = 0; i < 20; i++) {
      run(state, (ctx) => {
        dogMove(ctx, angel.id);
      });
      const a = ent(state, angel.id);
      const hp = h.c.pos!;
      // a guardian stays close by choice
      expect(
        Math.max(Math.abs(a.c.pos!.x - hp.x), Math.abs(a.c.pos!.y - hp.y)),
      ).toBeLessThanOrEqual(4);
    }
    expect(edogOf({ state }, angel.id)).toBeNull();
  });

  test('Conflict: it rebukes her and leaves, and 2 to 4 hostile Angels come instead', () => {
    const { state, angel } = withAngel(1);
    const h = getPlayer(state);
    (h.c.props ??= {})['conflict'] = { intrinsic: true, timeout: 0 };
    // an experienced, charismatic hero: the Angel resists her Conflict only 1 time in 20
    h.c.experience!.level = 30;
    h.c.attributes!.cha = 18;
    let t: string[] = [];
    for (let i = 0; i < 10 && state.entities[String(angel.id)]; i++)
      t = run(state, (ctx) => {
        dogMove(ctx, angel.id);
      });
    expect(state.entities[String(angel.id)]).toBeUndefined();
    expect(t).toContain('The Angel rebukes you, saying:');
    expect(t).toContain('"Since you desire conflict, have some more!"');
    const l = getLevel(state);
    const angels = monsOn(state, l).filter((e) => e.def === ANGEL);
    expect(angels.length).toBeGreaterThanOrEqual(2);
    expect(angels.length).toBeLessThanOrEqual(4);
    for (const e of angels) {
      expect(e.c.monster!.peaceful).toBe(false);
      expect(emin(state, e.id)?.minAlign).toBe(0);
    }
  });
});

describe('the endgame high priests and the Furies', () => {
  test('a high priest on the Astral Plane is named for his god only next to her', () => {
    const state = game(4);
    toAstral(state);
    const l = getLevel(state);
    run(state, (ctx) => {
      const [x, y] = ASTRAL_ALTARS[1]!;
      const p = at(l, x, y);
      const priest = monsOn(state, l).find((e) => epriOf(ctx, e.id)?.shrpos.x === p.x)!;
      const ep = epriOf(ctx, priest.id)!;
      expect(priestName(state, ep, priest)).toBe('@nh:high_priest');
      const hp = getPlayer(state).c.pos!;
      hp.x = priest.c.pos!.x;
      hp.y = priest.c.pos!.y + 1;
      expect(priestName(state, ep, priest)).toMatch(/^@priest\.high_of\./);
    });
  });

  test('putting on a helm of opposite alignment there calls every remaining erinys', () => {
    const state = game(5);
    toAstral(state);
    const l = getLevel(state);
    run(state, (ctx) => uchangealign(ctx, 1, 'helm_on'));
    expect(monsOn(state, l).filter((e) => e.def === 'nh:erinys')).toHaveLength(3);
  });
});

describe('offering the Amulet on a high altar of the Astral Plane', () => {
  /** On Astral alone, standing on the altar of god `align`. */
  function onAltar(seed: number, align: number): GameState {
    const state = game(seed, 5);
    toAstral(state);
    const l = getLevel(state);
    const i = altarAligns(l).indexOf(align);
    const [x, y] = ASTRAL_ALTARS[i]!;
    run(state, (ctx) => {
      for (const m of monsOn(state, l)) ctx.remove(m.id);
      const p = at(l, x, y);
      Object.assign(getPlayer(state).c.pos!, { x: p.x, y: p.y });
    });
    return state;
  }
  const amuletOf = (state: GameState): EntityId =>
    Object.values(state.entities).find(
      (e) => e.def === AMULET_OF_YENDOR && e.c.item?.carriedBy === state.playerId,
    )!.id;
  function offer(state: GameState, id: EntityId): string[] {
    const r1 = engine.step(state, { type: 'mod', action: 'nh:offer' as DefId });
    const p = state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('menu');
    // offer_ok(): on the Astral Plane the Amulet comes first
    if (p?.kind === 'menu') expect(p.options?.[0]?.value).toBe(id);
    const r2 = engine.step(state, { type: 'answer', promptId: p!.id, value: id });
    return [...texts(r1.events), ...texts(r2.events)];
  }

  test('to her own god: the choir, Immortality, and she ascends', () => {
    const state = onAltar(1, 0);
    run(state, (ctx) => {
      mksobj(ctx, ctx.defs.object('nh:corpse' as DefId), {
        carriedBy: state.playerId,
        corpseOf: 'nh:newt' as DefId,
      });
    });
    const t = offer(state, amuletOf(state));
    expect(t).toContain('You offer the Amulet of Yendor to Odin...');
    expect(t).toContain('An invisible choir sings, and you are bathed in radiance...');
    expect(t.some((s) => s.endsWith('"Mortal, thou hast done well!"'))).toBe(true);
    expect(t).toContain('"In return for thy service, I grant thee the gift of Immortality!"');
    expect(t).toContain('You ascend to the status of Demigoddess...');
    expect(state.gameOver).toMatchObject({ kind: 'escaped', killer: 'ascended' });
    expect(uState(state).ascended).toBe(true);
    expect(uState(state).alignRecord).toBeGreaterThan(5); // adjalign(10), within ALIGNLIM
    const st = status(state);
    expect(st['endHow']).toBe('ascended');
    expect(st['role']).toBe('end.demigoddess');
    expect(st['deathSuffix'] ?? null).toBeNull();
    expect(st['endDungeon']).toBe('end.astral_plane');
    expect(st['endPlane']).toBe('end.on_plane.astral');
  });

  test('to another god: dominion over hers, and an escape in celestial disgrace', () => {
    const state = onAltar(2, 1);
    const t = offer(state, amuletOf(state));
    expect(t).toEqual(
      expect.arrayContaining([
        'You offer the Amulet of Yendor to Tyr...',
        'Tyr accepts your gift, and gains dominion over Odin...',
        'Odin is enraged...',
        'Fortunately, Tyr permits you to live...',
        'A cloud of orange smoke surrounds you...',
      ]),
    );
    expect(state.gameOver).toMatchObject({ kind: 'escaped', killer: 'escaped' });
    expect(uState(state).ascended).toBeUndefined();
    expect(uState(state).alignRecord).toBe(5 - 99);
    const st = status(state);
    expect(st['endHow']).toBe('escaped');
    expect(st['deathSuffix']).toBe('end.celestial_disgrace');
    expect(st['role']).toBe('role.valkyrie');
  });
});
