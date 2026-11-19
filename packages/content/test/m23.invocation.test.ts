// m23 step 4: the Bell of Opening and the invocation. The Bell (its row, three charges, its wish
// outside wizard mode, recharging), ringing it (charged on the vibrating square, uncharged there,
// blessed opening what is around, uncursed finding, cursed raising the dead, engulfed), the Book
// of the Dead's relics on the square (each relic missing, cursed, unprimed, all primed), the
// invocation's area and stairs, and the Sanctum reached afterwards by the stairs, a level
// teleport and the bottom holes and random teleports reach. Outcomes over searched seeds.
// ref: src/apply.c use_bell(); src/detect.c openit(), openone(); src/read.c recharge();
// src/spell.c deadbook(); src/mklev.c mkinvokearea(), mkinvpos(), mkinvk_check_wall();
// src/trap.c dng_bottom(); src/teleport.c level_tele(), random_teleport_level();
// src/objnam.c readobjnam()
import {
  createEngine,
  depthOf,
  dungeonLayout,
  getLevel,
  getPlayer,
  inventoryOf,
  mazeMax,
  trapAt,
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
import { P, vanillaMod } from '../src/index';
import { deadbook } from '../src/deadbook';
import { setUswallow, uswallow } from '../src/engulfstate';
import { setUstuck } from '../src/hackmove';
import { makemon } from '../src/generation';
import { mksobj } from '../src/items';
import { GEHENNOM, dngBottom } from '../src/levelflags';
import { useCandelabrum } from '../src/light';
import { setU, uState } from '../src/luck';
import { messagesEn } from '../src/messages.en';
import { readobjnam, wishNames } from '../src/objnam_read';
import { setIntrinsic } from '../src/props';
import { recharge } from '../src/seffect';
import { randomTeleportLevel } from '../src/teleport';
import { T, isStwallId, setTerrain, terrainIdAt } from '../src/terrain';
import { TRAP } from '../src/trap';
import { BELL_OF_OPENING, BOOK_OF_THE_DEAD, CANDELABRUM } from '../src/uhave';
import { mkWished } from '../src/wish';
import { addMon } from './helpers';
import { levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'iv',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'iv:run',
      labelKey: 'iv',
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
  return texts(engine.step(state, { type: 'mod', action: 'iv:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const hell = (state: GameState) => dungeonLayout(state, GEHENNOM);
const where = (state: GameState): [string, number] => {
  const l = getLevel(state);
  return [l.dungeon, l.dlevel];
};

/** Gives the hero `def` (not initialized, uncursed), returning it. */
function give(state: GameState, def: DefId, spe?: number): Entity {
  let id: EntityId = 0;
  run(state, (ctx) => {
    id = mksobj(ctx, ctx.defs.object(def), { init: false, carriedBy: state.playerId });
  });
  const e = ent(state, id);
  e.c.item!.buc = 'uncursed';
  if (spe !== undefined) e.c.item!.spe = spe;
  return e;
}

const apply = (state: GameState, item: Entity): string[] =>
  texts(
    engine.step(state, { type: 'mod', action: 'nh:apply' as DefId, args: { item: item.id } })
      .events,
  );

/**
 * A new game on the invocation level, the hero (sturdy, her kit plain) standing on the vibrating
 * square with no monster on the level.
 */
function onSquare(seed: number): { state: GameState; level: Level; sq: Pos; n: number } {
  const { state } = engine.newGame({ seed });
  plainKit(state);
  const n = hell(state).levels!;
  run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: n - 1 }, 'random'));
  const level = getLevel(state);
  const t = level.traps.find((x) => x.def === TRAP.vibrating)!;
  run(state, (ctx) => {
    for (const e of Object.values(state.entities))
      if (e.c.monster && e.c.pos?.level === level.id) ctx.remove(e.id);
  });
  const h = getPlayer(state);
  h.c.hp = { cur: 999, max: 999 };
  Object.assign(h.c.pos!, { x: t.x, y: t.y });
  return { state, level, sq: { x: t.x, y: t.y }, n };
}

/** The three relics, the Candelabrum lit with its seven candles, the Bell charged. */
function relics(state: GameState): { bell: Entity; menorah: Entity; book: Entity } {
  const bell = give(state, BELL_OF_OPENING, 3);
  const menorah = give(state, CANDELABRUM, 7);
  menorah.c.item!.age = 400;
  run(state, (ctx) => useCandelabrum(ctx, menorah));
  expect(menorah.c.item!.lit).toBe(true);
  const book = give(state, BOOK_OF_THE_DEAD);
  return { bell, menorah, book };
}

/** The ring of mkinvokearea() a square `dx, dy` from the middle belongs to (wider than high). */
const ringOf = (dx: number, dy: number): number => {
  const ady = Math.abs(dy);
  return Math.max(Math.abs(dx), ady <= 2 ? ady : ady + 1);
};

describe('the Bell of Opening', () => {
  test('three charges; a wish makes an ordinary bell outside wizard mode; recharging', () => {
    const { state } = engine.newGame({ seed: 1 });
    let made: Entity | undefined;
    run(state, (ctx) => {
      made = ent(state, mksobj(ctx, ctx.defs.object(BELL_OF_OPENING), { init: true }));
    });
    expect(made!.c.item!.spe).toBe(3);
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
    expect(wished('Bell of Opening', false)).toBe('nh:bell');
    expect(wished('Bell of Opening', true)).toBe(BELL_OF_OPENING);
    expect(wished('silver bell', true)).toBe(BELL_OF_OPENING);
    // "opening" never matches "bell of opening"
    for (let i = 0; i < 20; i++) expect(wished('opening', true)).toBe('nh:wand_of_opening');
    // recharging: +1, blessed +1d3, never past 5; cursed strips it
    const bell = give(state, BELL_OF_OPENING, 0);
    const it = bell.c.item!;
    const silent = run(state, (ctx) => recharge(ctx, bell, 0));
    expect(it.spe).toBe(1);
    expect(silent.filter((m) => /bell|glow/i.test(m))).toEqual([]);
    run(state, (ctx) => recharge(ctx, bell, 1));
    expect(it.spe).toBeGreaterThanOrEqual(2);
    expect(it.spe).toBeLessThanOrEqual(4);
    it.spe = 5;
    run(state, (ctx) => recharge(ctx, bell, 1));
    expect(it.spe).toBe(5);
    run(state, (ctx) => recharge(ctx, bell, -1));
    expect(it.spe).toBe(0);
    expect(it.recharged).toBe(4);
  });

  test('on the vibrating square: the shrill sound primes it; uncharged it makes no sound', () => {
    const { state } = onSquare(1);
    const bell = give(state, BELL_OF_OPENING, 2);
    const t = apply(state, bell);
    expect(t).toContain('You ring the silver bell.');
    expect(t).toContain('The silver bell issues an unsettling shrill sound...');
    expect(bell.c.item!.spe).toBe(1);
    expect(state.turn - bell.c.item!.age!).toBeLessThan(5);
    // now known, charges and all: "the Bell of Opening (0:1)"
    expect(render(engine.registry.itemName(state, bell))).toBe('the Bell of Opening (0:1)');
    bell.c.item!.spe = 0;
    const u = apply(state, bell);
    expect(u).toEqual(['You ring the Bell of Opening.', 'But it makes no sound.']);
  });

  test('blessed: locked doors and boxes, secret doors and corridors open; "Things open..."', () => {
    const s = levelSetup(['...........', '.....@.....', '...........', '...........']);
    const level = getLevel(s.state);
    setTerrain(level, 2, 0, T.door_locked);
    setTerrain(level, 8, 2, T.sdoor_v);
    setTerrain(level, 9, 3, T.scorr);
    const box = s.floor('nh:large_box');
    ent(s.state, box).c.item!.locked = true;
    const bell = give(s.state, BELL_OF_OPENING, 3);
    bell.c.item!.buc = 'blessed';
    const t = apply(s.state, bell);
    expect(t).toContain('Things open around you...');
    expect(terrainIdAt(level, 2, 0)).toMatch(/^nh:door_open_/);
    expect(terrainIdAt(level, 8, 2)).toMatch(/^nh:door_(open|closed)/);
    expect(terrainIdAt(level, 9, 3)).toBe(T.corr);
    expect(ent(s.state, box).c.item!.locked).toBeFalsy();
    expect(bell.c.item!.spe).toBe(2);
    // nothing left to open: "Nothing happens."
    const again = apply(s.state, bell);
    expect(again).toContain('Nothing happens.');
    // one thing: "Something opens..."
    setTerrain(level, 0, 0, T.door_locked);
    expect(apply(s.state, bell)).toContain('Something opens...');
  });

  test('uncursed: hidden things are found; cursed: the dead rise around her', () => {
    const s = levelSetup(['.........', '....@....', '.........']);
    const level = getLevel(s.state);
    setTerrain(level, 1, 2, T.scorr);
    const bell = give(s.state, BELL_OF_OPENING, 3);
    expect(apply(s.state, bell)).toContain('You reveal a secret corridor!');
    expect(terrainIdAt(level, 1, 2)).toBe(T.corr);
    expect(apply(s.state, bell)).toContain("You don't find anything.");
    bell.c.item!.buc = 'cursed';
    const before = Object.values(s.state.entities).filter((e) => e.c.monster).length;
    apply(s.state, bell);
    const after = Object.values(s.state.entities).filter((e) => e.c.monster).length;
    expect(after).toBeGreaterThan(before);
    expect(bell.c.item!.spe).toBe(0);
  });

  test('engulfed: a charged Bell opens the engulfer; an uncharged one is muffled', () => {
    const s = levelSetup(['.......', '...@...', '.......']);
    const worm = addMon(s.state, 'nh:purple_worm', s.here.x, s.here.y);
    run(s.state, (ctx) => {
      setUstuck(ctx, worm);
      setUswallow(ctx, { mon: worm, tim: 20 });
    });
    const bell = give(s.state, BELL_OF_OPENING, 0);
    expect(apply(s.state, bell)).toContain('But the sound is muffled.');
    bell.c.item!.spe = 1;
    const t = apply(s.state, bell);
    expect(t).toContain('The purple worm opens its mouth!');
    expect(t).not.toContain('But the sound is muffled.');
    expect(uswallow({ state: s.state })).toBeNull();
    expect(bell.c.item!.spe).toBe(0);
  });
});

describe('the Book of the Dead on the vibrating square', () => {
  test('without the Candelabrum: a chill and only its hint', () => {
    const { state } = onSquare(1);
    give(state, BELL_OF_OPENING, 3);
    const book = give(state, BOOK_OF_THE_DEAD);
    expect(run(state, (ctx) => deadbook(ctx, book))).toEqual([
      'You turn the pages of the Book of the Dead...',
      'A chill runs down your spine.',
      "Vlad's doppelganger is amused.",
    ]);
  });

  test('a cursed relic: "The invocation fails!"', () => {
    const { state } = onSquare(2);
    const { bell, menorah, book } = relics(state);
    apply(state, bell);
    menorah.c.item!.buc = 'cursed';
    expect(run(state, (ctx) => deadbook(ctx, book))).toEqual([
      'You turn the pages of the Book of the Dead...',
      'The invocation fails!',
      'At least one of your relics is cursed...',
    ]);
    expect(uState(state).invoked).toBeUndefined();
  });

  test('the Bell not rung within 5 moves, or fewer candles: something is amiss, the dead rise', () => {
    for (const unprimed of ['bell', 'candles'] as const) {
      const { state, level, sq } = onSquare(3);
      const { bell, menorah, book } = relics(state);
      apply(state, bell);
      if (unprimed === 'bell') bell.c.item!.age = state.turn - 5;
      else menorah.c.item!.spe = 6;
      const t = run(state, (ctx) => deadbook(ctx, book));
      expect(t.slice(0, 3)).toEqual([
        'You turn the pages of the Book of the Dead...',
        'You have a feeling that something is amiss...',
        'You raised the dead!',
      ]);
      expect(uState(state).invoked).toBeUndefined();
      expect(trapAt(level, sq.x, sq.y)?.def).toBe(TRAP.vibrating);
    }
  });

  test('all primed: the invocation opens the area and makes the stairs down', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { state, level, sq } = onSquare(seed);
      // a boulder in ring 2 is left as rocks; a monster in the moat ring meets the water
      const { bell, book } = relics(state);
      apply(state, bell);
      const t = run(state, (ctx) => deadbook(ctx, book));
      expect(t[0]).toBe('You turn the pages of the Book of the Dead...');
      expect(t[1]).toBe('The floor shakes violently under you!');
      expect(t).toContain('The walls around you begin to bend and crumble!');
      expect(t[t.length - 1]).toBe('You are standing at the top of a stairwell leading down!');
      // the stairs down where the vibrating square was
      expect(terrainIdAt(level, sq.x, sq.y)).toBe(T.stairs_down);
      expect(level.down).toEqual(sq);
      expect(level.traps.some((x) => x.def === TRAP.vibrating)).toBe(false);
      // the rings: fire traps (seen) at 1, moat at 4 and 5, floor elsewhere; lit but the last
      const max = mazeMax(level.width, level.height);
      for (let dy = -5; dy <= 5; dy++)
        for (let dx = -6; dx <= 6; dx++) {
          const x = sq.x + dx;
          const y = sq.y + dy;
          if ((dx === 0 && dy === 0) || x < 1 || y < 2 || x > max.x - 1 || y > max.y) continue;
          const ring = ringOf(dx, dy);
          const id = terrainIdAt(level, x, y);
          expect(isStwallId(id)).toBe(false);
          if (ring === 4 || ring === 5) expect(id).toBe(T.moat);
          else if (ring === 1) {
            if (id !== T.moat && id !== T.pool && id !== T.water) {
              expect(id).toBe(T.floor);
              expect(trapAt(level, x, y)).toMatchObject({ def: TRAP.fire, seen: true });
            }
          } else expect(id).toBe(T.floor);
          if (ring < 6) expect(level.lit[y * level.width + x]).toBe(1);
        }
      // u.uevent.invoked, udemigod, the next intervene() in 2..12 turns
      const u = uState(state);
      expect(u.invoked).toBe(true);
      expect(u.udemigod).toBe(true);
      expect(u.udgCnt).toBeGreaterThanOrEqual(2);
      expect(u.udgCnt).toBeLessThanOrEqual(12);
    }
  });

  test('a monster standing in the area meets the moat or the fire', () => {
    const { state, level, sq } = onSquare(4);
    const { bell, book } = relics(state);
    apply(state, bell);
    // a hill orc where the moat goes (ring 4), unable to swim: it drowns
    const at = { x: sq.x + 4, y: sq.y };
    setTerrain(level, at.x, at.y, T.floor);
    let orc: EntityId | null = null;
    run(state, (ctx) => {
      orc = makemon(ctx, ctx.defs.monster('nh:hill_orc' as DefId), at, { noInventory: true });
    });
    expect(state.entities[String(orc)]?.c.pos).toMatchObject(at);
    run(state, (ctx) => deadbook(ctx, book));
    expect(terrainIdAt(level, at.x, at.y)).toBe(T.moat);
    expect(state.entities[String(orc)]).toBeUndefined();
  });

  test('an earlier udg_cnt that is sooner is kept', () => {
    const { state } = onSquare(5);
    const { bell, book } = relics(state);
    run(state, (ctx) => setU(ctx, { udgCnt: 1 }));
    apply(state, bell);
    run(state, (ctx) => deadbook(ctx, book));
    expect(uState(state).udgCnt).toBe(1);
  });
});

describe('the Sanctum after the invocation', () => {
  test('the stairs lead down to its up stairs, and back', () => {
    const { state, n } = onSquare(6);
    const { bell, book } = relics(state);
    apply(state, bell);
    run(state, (ctx) => deadbook(ctx, book));
    const d = texts(engine.step(state, { type: 'mod', action: 'nh:down' as DefId }).events);
    expect(d).not.toContain("You can't go down here yet.");
    expect(where(state)).toEqual([GEHENNOM, n]);
    const sanctum = getLevel(state);
    expect(sanctum.def).toBe('nh:sanctum');
    expect(getPlayer(state).c.pos).toMatchObject(sanctum.up!);
    engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
    expect(where(state)).toEqual([GEHENNOM, n - 1]);
  });

  test('holes, random level teleports and a controlled level teleport reach it', () => {
    const { state } = engine.newGame({ seed: 7 });
    plainKit(state);
    const n = hell(state).levels!;
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: n - 3 }, 'random'));
    const level = getLevel(state);
    const bottom = depthOf(state, { dungeon: GEHENNOM, dlevel: n });
    run(state, (ctx) => setU(ctx, { invoked: true }));
    expect(dngBottom(state, level)).toBe(n);
    let deepest = 0;
    run(state, (ctx) => {
      for (let i = 0; i < 300; i++) deepest = Math.max(deepest, randomTeleportLevel(ctx, level));
    });
    expect(deepest).toBe(bottom);
    setIntrinsic(getPlayer(state), P.TELEPORT_CONTROL, true);
    const scroll = give(state, 'nh:scroll_of_teleportation' as DefId);
    scroll.c.item!.buc = 'cursed';
    engine.step(state, { type: 'mod', action: 'nh:read' as DefId, args: { item: scroll.id } });
    expect(state.pendingPrompt?.prompt.id).toBe('tele-level');
    const t = texts(
      engine.step(state, { type: 'answer', promptId: 'tele-level', value: String(bottom) }).events,
    );
    expect(t).not.toContain('Sorry...');
    expect(where(state)).toEqual([GEHENNOM, n]);
    expect(getLevel(state).def).toBe('nh:sanctum');
    expect(inventoryOf(state, state.playerId).length).toBeGreaterThan(0);
  });
});
