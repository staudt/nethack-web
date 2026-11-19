// m23 step 3: Moloch's Sanctum and the Amulet of Yendor. sanctum.lua built as its script says
// (the temple with its high altar and secret door, Moloch's high priest holding the Amulet, the
// nine roaming priests of Moloch, the ring of fire, the morgue, the stairs, the flags); entering
// the temple ("Infidel, you have entered Moloch's Sanctum!"); offerings on the high altar (the
// real Amulet to Moloch, the imitation, corpses, the wrath that cannot be escaped); the Amulet as
// an object (its name, its wish, made_amulet, readobjnam). Outcomes over searched seeds.
// ref: dat/sanctum.lua; src/priest.c priestini(), intemple(), mk_roamer(); src/sp_lev.c
// create_monster(), create_altar(); src/pray.c dosacrifice(), desecrate_altar(),
// offer_real_amulet(), offer_fake_amulet(), offer_corpse(), god_zaps_you(); src/allmain.c
// moveloop_core() amulet_wish; src/mkobj.c mksobj_init(); src/objnam.c readobjnam(), xname(),
// the_unique_obj(); src/zap.c makewish(); src/invent.c dfeature_at(); src/dig.c dig_check()
import {
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  inRooms,
  inventoryOf,
  levelDefPos,
  trapAt,
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
import { A_NONE } from '../src/aligntyp';
import { emin } from '../src/emin';
import { TEMPLE, epriOf } from '../src/epri';
import { HIGH_ALTARS, isHighAltar } from '../src/highaltar';
import { mksobj } from '../src/items';
import { updateWornProps } from '../src/props';
import { dfeatureAt } from '../src/itemactions';
import { GEHENNOM, isSanctum, levelFlags, nonDiggable, nonPasswall } from '../src/levelflags';
import { setU, uState } from '../src/luck';
import { readobjnam, wishNames } from '../src/objnam_read';
import { messagesEn } from '../src/messages.en';
import { HIGH_PRIEST, intemple } from '../src/priest';
import { SANCTUM } from '../src/sanctum';
import { digCheck } from '../src/dig';
import { mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { AMULET_OF_YENDOR, monHasAmulet, uHave } from '../src/uhave';
import { mkWished } from '../src/wish';
import { MORGUE } from '../src/zoo';
import { render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'st',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'st:run',
      labelKey: 'st',
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
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return textOf(engine.step(state, { type: 'mod', action: 'st:run' as DefId }));
};
const hero = (state: GameState): Entity => getPlayer(state);
const monsOn = (state: GameState, l: Level): Entity[] =>
  Object.values(state.entities).filter(
    (e) => e.c.monster && e.c.pos?.level === l.id && e.id !== state.playerId,
  );
const at = (l: Level, x: number, y: number): Pos => mapToLevel(SANCTUM, l, x, y);

/** A new game whose hero arrives on the Sanctum's up stairs. */
function toSanctum(seed: number): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  getPlayer(state).c.hp = { cur: 999, max: 999 };
  const n = dungeonLayout(state, GEHENNOM).levels!;
  const p = levelDefPos(SANCTUM, 80, 21, 63, 15, undefined, 'test');
  run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: n }, p));
  return { state, level: getLevel(state) };
}

/** Removes every monster but the hero and puts her on the high altar. */
function onHighAltar(seed: number): { state: GameState; level: Level } {
  const r = toSanctum(seed);
  run(r.state, (ctx) => {
    for (const m of monsOn(r.state, r.level)) ctx.remove(m.id);
    const a = at(r.level, 18, 8);
    const p = hero(r.state).c.pos!;
    p.x = a.x;
    p.y = a.y;
  });
  return r;
}

/**
 * Gives the hero `def` (made with init), returning its id. The Amulet's wish is taken as already
 * given unless `wish` (it would come after this very action).
 */
function give(
  state: GameState,
  def: string,
  o: Parameters<typeof mksobj>[2] = {},
  wish = false,
): EntityId {
  let id: EntityId = 0;
  run(state, (ctx) => {
    if (!wish) setU(ctx, { amuletWish: true });
    id = mksobj(ctx, ctx.defs.object(def as DefId), { carriedBy: state.playerId, ...o });
  });
  return id;
}

/** #offer, choosing `id`: the rendered messages. */
function offer(state: GameState, id: EntityId): string[] {
  const r1 = engine.step(state, { type: 'mod', action: 'nh:offer' as DefId });
  const p = state.pendingPrompt?.prompt;
  expect(p?.kind).toBe('menu');
  const r2 = engine.step(state, { type: 'answer', promptId: p!.id, value: id });
  return [...textOf(r1), ...textOf(r2)];
}

const resist = (state: GameState, ...props: string[]): void => {
  const h = hero(state);
  for (const p of props) (h.c.props ??= {})[p] = { intrinsic: true, timeout: 0 };
};

const SEEDS = [1, 2, 3, 4, 5];

describe('the Sanctum', () => {
  test('sanctum.lua: temple, high altar, high priest with the Amulet, horde, fire, stairs', () => {
    for (const seed of SEEDS) {
      const { state, level } = toSanctum(seed);
      expect(level.def).toBe('nh:sanctum');
      expect(isSanctum(state, level)).toBe(true);
      // the high altar of Moloch, a shrine, in a temple
      const altar = at(level, 18, 8);
      expect(terrainIdAt(level, altar.x, altar.y)).toBe(T.altar_unaligned);
      expect(level.shrines).toContainEqual(altar);
      run(state, (ctx) => {
        expect(isHighAltar(ctx, level, altar.x, altar.y)).toBe(true);
        expect(isHighAltar(ctx, level, altar.x + 1, altar.y)).toBe(false);
      });
      const temple = inRooms(level, altar.x, altar.y).find((r) => level.rooms[r]?.type === TEMPLE);
      expect(temple).toBeDefined();
      // its secret door, on one of its four walls
      const room = level.rooms[temple!]!;
      let sdoors = 0;
      for (let x = room.lx - 1; x <= room.hx + 1; x++)
        for (let y = room.ly - 1; y <= room.hy + 1; y++) {
          const id = terrainIdAt(level, x, y);
          if (id === T.sdoor_v || id === T.sdoor_h) sdoors++;
        }
      expect(sdoors).toBe(1);
      // the morgue
      expect(level.rooms.some((r) => r.type === MORGUE)).toBe(true);
      // Moloch's high priest, peaceful, holding the Amulet
      const mons = monsOn(state, level);
      const priests = mons.filter((m) => m.def === HIGH_PRIEST);
      expect(priests).toHaveLength(1);
      const hp = priests[0]!;
      run(state, (ctx) => {
        expect(epriOf(ctx, hp.id)?.shralign).toBe(A_NONE);
      });
      expect(hp.c.monster!.peaceful).toBe(true);
      expect(monHasAmulet(state, hp.id)?.def).toBe(AMULET_OF_YENDOR);
      expect(uHave(state, 'amulet')).toBe(false);
      expect(uState(state).madeAmulet).toBe(true);
      // Moloch's horde: nine hostile roaming priests of Moloch (minions, no temple)
      const horde = mons.filter((m) => m.def === 'nh:aligned_cleric');
      expect(horde).toHaveLength(9);
      for (const c of horde) {
        expect(emin(state, c.id)).toMatchObject({ minAlign: A_NONE, renegade: false });
        expect(c.c.monster!.peaceful).toBe(false);
        run(state, (ctx) => expect(epriOf(ctx, c.id)).toBeNull());
      }
      // the ring of fire around the temple
      for (const [x, y] of [
        [13, 5],
        [23, 5],
        [13, 12],
        [23, 12],
        [13, 8],
        [23, 9],
      ] as const) {
        const p = at(level, x, y);
        expect(trapAt(level, p.x, p.y)?.def).toBe('nh:fire_trap');
      }
      // the up stairs; no down stairs at Gehennom's bottom
      expect(level.up).toEqual(at(level, 63, 15));
      expect(level.down).toBeNull();
      // the flags
      run(state, (ctx) => {
        const f = levelFlags(ctx, level);
        expect(f).toMatchObject({ noteleport: true, hardfloor: true, maze: true, nommap: true });
        const wall = at(level, 0, 0);
        expect(nonDiggable(ctx, level, wall.x, wall.y)).toBe(true);
        const barrier = at(level, 38, 10);
        expect(nonPasswall(ctx, level, barrier.x, barrier.y)).toBe(true);
        expect(nonPasswall(ctx, level, barrier.x + 3, barrier.y)).toBe(false);
      });
    }
  });

  test('HIGH_ALTARS holds the Sanctum altar', () => {
    expect(HIGH_ALTARS['nh:sanctum']).toEqual([[18, 8]]);
  });

  test('entering the temple: "Infidel..." and the priest turns hostile, then the desecration', () => {
    for (const seed of SEEDS) {
      const { state, level } = toSanctum(seed);
      const priest = monsOn(state, level).find((m) => m.def === HIGH_PRIEST)!;
      const altar = at(level, 18, 8);
      const roomno = inRooms(level, altar.x, altar.y).find((r) => level.rooms[r]?.type === TEMPLE)!;
      const enter = (): string[] =>
        run(state, (ctx) => {
          const p = hero(state).c.pos!;
          p.x = altar.x - 2;
          p.y = altar.y;
          intemple(ctx, roomno, []);
        });
      const first = enter();
      expect(first).toContain('"Infidel, you have entered Moloch\'s Sanctum!"');
      expect(first).toContain('"Be gone!"');
      expect(first.some((m) => /forbidding|peace/.test(m))).toBe(false);
      expect(priest.c.monster!.peaceful).toBe(false);
      // the intoning names no god here
      for (const m of first.filter((t) => t.endsWith('intones:')))
        expect(m).toBe('The high priest intones:');
      const again = enter();
      expect(again).toContain('"You desecrate this place by your presence!"');
    }
  });

  test('look here: "high altar to Moloch (unaligned)"; dig_check keeps it from a broken wand', () => {
    const { state, level } = onHighAltar(1);
    const altar = at(level, 18, 8);
    run(state, (ctx) => {
      expect(render(dfeatureAt(ctx, altar.x, altar.y)!)).toBe('high altar to Moloch (unaligned)');
      expect(digCheck(ctx, level, altar.x, altar.y, true)).toBe('altar');
    });
  });
});

describe('offering on the high altar', () => {
  test('the real Amulet to Moloch: the choir, then death by his indifference', () => {
    const { state } = onHighAltar(1);
    const amu = give(state, AMULET_OF_YENDOR);
    const msgs = offer(state, amu);
    expect(msgs).toContain('You offer the Amulet of Yendor to Moloch...');
    expect(msgs).toContain('An invisible choir chants, and you are bathed in darkness...');
    expect(msgs).toContain('Moloch shrugs and retains dominion over Odin,');
    expect(msgs).toContain('then mercilessly snuffs out your life.');
    expect(state.gameOver?.kind).toBe('died');
    expect(state.gameOver?.killer).toBe('@killer.moloch_indifference');
    expect(uState(state).alignRecord).toBe(-99);
    expect(state.entities[String(amu)]).toBeUndefined();
  });

  test('life-saved: Moloch snarls and tries again; surviving that too, she escapes', () => {
    // a worn amulet of life saving saves her once: his disintegration kills her
    {
      const { state } = onHighAltar(2);
      const ls = give(state, 'nh:amulet_of_life_saving');
      run(state, (ctx) => {
        state.entities[String(ls)]!.c.item!.equipped = 'amulet';
        updateWornProps(state, ctx.defs, state.playerId);
      });
      const amu = give(state, AMULET_OF_YENDOR);
      const msgs = offer(state, amu);
      expect(msgs).toContain('Moloch snarls and tries again...');
      expect(msgs).toContain('You disintegrate into a pile of dust!');
      expect(state.gameOver?.kind).toBe('died');
      expect(state.gameOver?.killer).toBe('@killer.wrath_moloch');
    }
    // lasting life saving: a cloud of black smoke, and she escapes
    {
      const { state } = onHighAltar(2);
      resist(state, 'lifesaved');
      const amu = give(state, AMULET_OF_YENDOR);
      const msgs = offer(state, amu);
      expect(msgs).toContain('Moloch snarls and tries again...');
      expect(msgs).toContain('A cloud of black smoke surrounds you...');
      expect(state.gameOver?.kind).toBe('escaped');
    }
  });

  test('the imitation unknown: a mistake (known now, Luck -1); known: desecration', () => {
    const { state } = onHighAltar(3);
    resist(state, 'shock_res', 'disint_res');
    const fake = give(state, 'nh:fake_amulet_of_yendor');
    const luck0 = uState(state).luck;
    const m1 = offer(state, fake);
    expect(m1).toContain('You hear a nearby thunderclap.');
    expect(m1).toContain('You realize you have made a mistake.');
    expect(state.entities[String(fake)]!.c.item!.known.spe).toBe(true);
    expect(uState(state).luck).toBe(luck0 - 1);
    const anger0 = uState(state).ugangr;
    const m2 = offer(state, fake);
    expect(m2).toContain('You feel the air around you grow charged...');
    expect(m2).toContain('Suddenly, you realize that Moloch has noticed you...');
    expect(m2.some((t) => t.endsWith('"So, mortal!  You dare desecrate my High Temple!"'))).toBe(
      true,
    );
    expect(uState(state).ugangr).toBe(anger0 + 3);
  });

  test('a corpse on the high altar desecrates it; surviving, Moloch sends his servants', () => {
    let minions = 0;
    for (const seed of SEEDS) {
      const { state, level } = onHighAltar(seed);
      resist(state, 'shock_res', 'disint_res');
      const before = new Set(monsOn(state, level).map((m) => m.id));
      let corpse: EntityId = 0;
      run(state, (ctx) => {
        corpse = mksobj(ctx, ctx.defs.object('nh:corpse'), {
          carriedBy: state.playerId,
          corpseOf: 'nh:jackal' as DefId,
        });
        state.entities[String(corpse)]!.c.item!.age = state.turn;
      });
      const msgs = offer(state, corpse);
      expect(msgs).toContain('You feel the air around you grow charged...');
      expect(msgs).toContain('You bask in its black glow for a minute...');
      expect(msgs).toContain('"Thou cannot escape my wrath, mortal!"');
      expect(msgs).toContain('"Destroy her, my servants!"');
      expect(state.gameOver).toBeNull();
      // the corpse is not consumed
      expect(state.entities[String(corpse)]).toBeDefined();
      for (const m of monsOn(state, level).filter((e) => !before.has(e.id))) {
        expect(emin(state, m.id)?.minAlign).toBe(A_NONE);
        minions++;
      }
    }
    expect(minions).toBeGreaterThan(0);
  });

  test('her own race on the high altar: desecration, not a stain', () => {
    const { state, level } = onHighAltar(4);
    resist(state, 'shock_res', 'disint_res');
    let corpse: EntityId = 0;
    run(state, (ctx) => {
      corpse = mksobj(ctx, ctx.defs.object('nh:corpse'), {
        carriedBy: state.playerId,
        corpseOf: 'nh:human' as DefId,
      });
    });
    const msgs = offer(state, corpse);
    expect(msgs).toContain("You'll regret this infamous offense!");
    expect(msgs).toContain('You feel the air around you grow charged...');
    const altar = at(level, 18, 8);
    expect(terrainIdAt(level, altar.x, altar.y)).toBe(T.altar_unaligned);
    expect(state.entities[String(corpse)]).toBeDefined();
  });
});

describe('the Amulet of Yendor', () => {
  test('"The Amulet is bestowing a wish upon you!" once', () => {
    const { state } = toSanctum(1);
    run(state, (ctx) => {
      for (const m of monsOn(state, getLevel(state))) ctx.remove(m.id);
    });
    // after the action that gave it to her
    const r = engine.step(state, { type: 'search' } as never);
    expect(textOf(r)).not.toContain('The Amulet is bestowing a wish upon you!');
    const msgs = run(state, (ctx) => {
      mksobj(ctx, ctx.defs.object(AMULET_OF_YENDOR), { carriedBy: state.playerId });
    });
    expect(uHave(state, 'amulet')).toBe(true);
    expect(msgs).toContain('The Amulet is bestowing a wish upon you!');
    const p = state.pendingPrompt!;
    expect(p.prompt.id).toBe('wish');
    engine.step(state, { type: 'answer', promptId: 'wish', value: 'potion of gain level' });
    expect(
      inventoryOf(state, state.playerId).some((o) => o.def === 'nh:potion_of_gain_level'),
    ).toBe(true);
    expect(uState(state).amuletWish).toBe(true);
    const r2 = engine.step(state, { type: 'search' } as never);
    expect(textOf(r2)).not.toContain('The Amulet is bestowing a wish upon you!');
    expect(state.pendingPrompt).toBeNull();
  });

  test('its name; made_amulet; a wish gives the imitation outside wizard mode', () => {
    const { state } = toSanctum(1);
    const id = give(state, AMULET_OF_YENDOR, { init: false });
    const amu = state.entities[String(id)]!;
    amu.c.item!.buc = 'uncursed';
    expect(render(engine.registry.itemName(state, amu))).toBe('the Amulet of Yendor');
    const names = wishNames(state, engine.registry, messagesEn);
    const wished = (text: string, wizard: boolean): DefId | undefined => {
      const spec = readobjnam(text, names, { wizard });
      if (spec === null || spec === 'nothing') return undefined;
      let def: DefId | undefined;
      run(state, (ctx) => {
        const w = mkWished(ctx, spec, { wizard });
        def = w === null ? undefined : state.entities[String(w)]?.def;
      });
      return def;
    };
    expect(wished('Amulet of Yendor', false)).toBe('nh:fake_amulet_of_yendor');
    expect(wished('real Amulet of Yendor', false)).toBe('nh:fake_amulet_of_yendor');
    expect(wished('Amulet of Yendor', true)).toBe(AMULET_OF_YENDOR);
    expect(wished('fake Amulet of Yendor', true)).toBe('nh:fake_amulet_of_yendor');
    expect(wished('cheap plastic imitation of the Amulet of Yendor', true)).toBe(
      'nh:fake_amulet_of_yendor',
    );
  });
});
