// m21 step 2: the Rogue level's generation. Its rooms are filled without fountains, sinks,
// altars, graves, statues, boxes or graffiti; random objects come from Rogue's seven classes and
// random traps from its seven kinds; random monsters are drawn with uppercase letters and are made
// without any gear; polymorph, shapeshifters and nasties prefer uppercase forms; a sleeping ghost
// lies on the tribute pile; the first arrival has its line. Outcomes over many seeds.
// ref: src/mklev.c fill_ordinary_room(), traptype_roguelvl(), mktrap(); src/mkobj.c rogueprobs[];
// src/makemon.c rndmonst_adj(), m_initweap(), m_initinv(), set_mimic_sym(); src/mon.c
// pick_animal(), pickvampshape(), select_newcham_form(), newcham(); src/wizard.c pick_nasty();
// src/extralev.c makerogueghost(); src/do.c goto_level()
import {
  createEngine,
  getLevel,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Room,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { engravingsOn } from '../src/engr';
import { makemon, rndmonst } from '../src/generation';
import { vanillaMod } from '../src/index';
import { isRogueLevel } from '../src/levelflags';
import { mimicShownAs } from '../src/mimicstate';
import { mktrap, traptypeRogue } from '../src/mklev';
import { mkobj } from '../src/mkobj';
import { upperSym } from '../src/mondata';
import { pickNasty } from '../src/nasty';
import { newcham, pickAnimal, pickvampshape } from '../src/newcham';
import { setCham } from '../src/chamstate';
import { T, terrainIdAt } from '../src/terrain';
import { TRAP } from '../src/trap';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'rg',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'rg:run',
      labelKey: 'rg',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): GameEvent[] => {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'rg:run' as DefId }).events;
};

const rogueDlevel = (state: GameState): number =>
  state.dungeons[0]?.special.find((s) => s.id === 'nh:rogue')?.dlevel ?? -1;

/** A new game and the Rogue level as it was just made (checked before anything moves). */
function rogueLevel(
  seed: number,
  check: (ctx: Ctx, level: Level) => void = () => undefined,
): { state: GameState; level: Level; events: GameEvent[] } {
  const { state } = engine.newGame({ seed });
  const events = run(state, (ctx) => {
    ctx.goToLevel({ dungeon: 'nh:main', dlevel: rogueDlevel(state) }, 'random');
    check(ctx, getLevel(ctx.state));
  });
  return { state, level: getLevel(state), events };
}

const monstersOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[id] as Entity)
    .filter((e) => e.c.monster && e.c.pos?.level === level.id);
const floorItemsOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[id] as Entity)
    .filter((e) => e.c.item && e.c.item.carriedBy === null && e.c.pos?.level === level.id);

const SEEDS = Array.from({ length: 24 }, (_, i) => 2101 + i);
const GHOST: DefId = 'nh:ghost';
const ROGUE_CLASSES = ['weapon', 'armor', 'food', 'potion', 'scroll', 'wand', 'ring'];
const ROGUE_TRAPS: readonly DefId[] = [
  TRAP.bear,
  TRAP.arrow,
  TRAP.dart,
  TRAP.trapdoor,
  TRAP.pit,
  TRAP.sleepGas,
  TRAP.rust,
];
/** The only terrain makeroguerooms() and the stairs make. */
const ROGUE_TERRAIN: ReadonlySet<DefId> = new Set([
  T.stone,
  T.vwall,
  T.hwall,
  T.tlcorn,
  T.trcorn,
  T.blcorn,
  T.brcorn,
  T.floor,
  T.corr,
  T.scorr,
  T.doorway,
  T.sdoor_h,
  T.sdoor_v,
  T.stairs_up,
  T.stairs_down,
]);

describe("the Rogue level's fill", () => {
  test('rooms without furniture, engravings, statues or boxes; seven object classes, seven traps', () => {
    let objects = 0;
    let traps = 0;
    for (const seed of SEEDS)
      rogueLevel(seed, (ctx, level) => {
        expect(isRogueLevel(level)).toBe(true);
        const { state } = ctx;
        for (let y = 0; y < level.height; y++)
          for (let x = 0; x < level.width; x++)
            expect(ROGUE_TERRAIN.has(terrainIdAt(level, x, y) as DefId)).toBe(true);
        expect(engravingsOn(ctx, level)).toEqual([]);
        const ghost = monstersOn(state, level).find((m) => m.def === GHOST);
        for (const o of floorItemsOn(state, level)) {
          const p = o.c.pos;
          if (ghost && p && p.x === ghost.c.pos?.x && p.y === ghost.c.pos.y) continue;
          const cls = ctx.defs.object(o.def).class;
          expect(cls === 'coin' || ROGUE_CLASSES.includes(cls), `${seed} ${o.def}`).toBe(true);
          if (cls !== 'coin') objects++;
        }
        for (const t of level.traps) expect(ROGUE_TRAPS).toContain(t.def);
        traps += level.traps.length;
      });
    // the fill did make things (so the checks above saw something)
    expect(objects).toBeGreaterThan(10);
    expect(traps).toBeGreaterThan(3);
  });

  test('random monsters are uppercase and carry nothing; the ghost sleeps on its pile', () => {
    let monsters = 0;
    let food = 0;
    let amulets = 0;
    let maces = 0;
    let ringMail = 0;
    for (const seed of SEEDS)
      rogueLevel(seed, (ctx, level) => {
        const { state } = ctx;
        // (the hero's pet may have come along)
        const mons = monstersOn(state, level).filter((m) => !m.c.monster?.tame);
        const ghosts = mons.filter((m) => m.def === GHOST);
        expect(ghosts.length, `seed ${seed}`).toBe(1);
        for (const m of mons) {
          expect(inventoryOf(state, m.id), `${seed} ${m.def}`).toEqual([]);
          if (m.def === GHOST) continue;
          monsters++;
          expect(upperSym(ctx.defs.monster(m.def).glyph.ch), `${seed} ${m.def}`).toBe(true);
        }
        const ghost = ghosts[0] as Entity;
        expect(ghost.c.monster?.asleep).toBe(true);
        const gp = ghost.c.pos;
        expect(
          level.rooms.some(
            (r: Room) => gp && gp.x >= r.lx && gp.x <= r.hx && gp.y >= r.ly && gp.y <= r.hy,
          ),
        ).toBe(true);
        const pile = floorItemsOn(state, level).filter(
          (o) => o.c.pos?.x === gp?.x && o.c.pos?.y === gp?.y,
        );
        const of = (id: string): Entity[] => pile.filter((o) => o.def === id);
        const one = (ids: string[]): Entity => {
          const found = pile.filter((o) => ids.includes(o.def));
          expect(found.length, `${seed} ${ids.join('/')}`).toBe(1);
          return found[0] as Entity;
        };
        const weapon = one(['nh:mace', 'nh:two_handed_sword']);
        const spe = weapon.c.item?.spe ?? NaN;
        if (weapon.def === 'nh:mace') {
          maces++;
          expect(spe).toBeGreaterThanOrEqual(1);
          expect(spe).toBeLessThanOrEqual(3);
        } else {
          expect(spe).toBeGreaterThanOrEqual(-1);
          expect(spe).toBeLessThanOrEqual(3);
        }
        expect(one(['nh:bow']).c.item?.spe).toBe(1);
        const arrows = one(['nh:arrow']).c.item;
        expect(arrows?.spe).toBe(0);
        expect(arrows?.quantity).toBeGreaterThanOrEqual(25);
        expect(arrows?.quantity).toBeLessThanOrEqual(34);
        const mail = one(['nh:ring_mail', 'nh:plate_mail']);
        const mspe = mail.c.item?.spe ?? NaN;
        if (mail.def === 'nh:ring_mail') {
          ringMail++;
          expect(mspe).toBeGreaterThanOrEqual(0);
          expect(mspe).toBeLessThanOrEqual(2);
        } else {
          expect(mspe).toBeGreaterThanOrEqual(-1);
          expect(mspe).toBeLessThanOrEqual(3);
        }
        // food rations: 3 times in 4, never cursed (the fill's own rations may join the pile)
        for (const f of of('nh:food_ration')) {
          food++;
          expect(f.c.item?.quantity).toBeGreaterThanOrEqual(1);
          expect(f.c.item?.buc).not.toBe('cursed');
        }
        for (const a of of('nh:fake_amulet_of_yendor')) {
          amulets++;
          expect(a.c.item?.known.spe).toBe(true);
        }
        // (the fill's own gold may land on the pile too)
        for (const o of pile)
          expect([
            'nh:gold_piece',
            'nh:food_ration',
            'nh:fake_amulet_of_yendor',
            weapon.def,
            'nh:bow',
            'nh:arrow',
            mail.def,
          ]).toContain(o.def);
      });
    expect(monsters).toBeGreaterThan(5);
    // both sides of each coin over 24 levels
    expect(food).toBeGreaterThan(0);
    expect(amulets).toBeGreaterThan(0);
    expect(amulets).toBeLessThan(SEEDS.length);
    expect(maces).toBeGreaterThan(0);
    expect(maces).toBeLessThan(SEEDS.length);
    expect(ringMail).toBeGreaterThan(0);
    expect(ringMail).toBeLessThan(SEEDS.length);
  });

  test('the arrival line on the first arrival only', () => {
    const { state, events } = rogueLevel(SEEDS[0] as number);
    const lines = (ev: GameEvent[]): number =>
      ev.filter((e) => e.type === 'msg' && e.key === 'rogue.arrive').length;
    expect(lines(events)).toBe(1);
    const dl = rogueDlevel(state);
    const away = run(state, (ctx) =>
      ctx.goToLevel({ dungeon: 'nh:main', dlevel: dl - 1 }, 'random'),
    );
    expect(lines(away)).toBe(0);
    const back = run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: dl }, 'random'));
    expect(lines(back)).toBe(0);
  });
});

describe('generation rules on the Rogue level', () => {
  /** A Rogue level that is the hero's current level, and a room of it. */
  const onRogue = (seed: number, fn: (ctx: Ctx, level: Level, room: Room) => void): void => {
    const { state } = rogueLevel(seed);
    run(state, (ctx) => {
      const level = getLevel(ctx.state);
      fn(ctx, level, level.rooms[0] as Room);
    });
  };
  /** The level above it, an ordinary one. */
  const onOrdinary = (seed: number, fn: (ctx: Ctx, level: Level) => void): void => {
    const { state } = engine.newGame({ seed });
    run(state, (ctx) => {
      ctx.goToLevel({ dungeon: 'nh:main', dlevel: rogueDlevel(state) - 1 }, 'random');
      fn(ctx, getLevel(ctx.state));
    });
  };

  test('rndmonst() picks only uppercase kinds there', () => {
    onRogue(SEEDS[1] as number, (ctx, level) => {
      for (let i = 0; i < 300; i++) {
        const m = rndmonst(ctx, level.depth, 0, 0, level);
        if (m) expect(upperSym(m.glyph.ch), m.id).toBe(true);
      }
    });
  });

  test('mkobj() rolls only the seven classes, about 22% food', () => {
    onRogue(SEEDS[2] as number, (ctx, level) => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1500; i++) {
        const id = mkobj(ctx, 'random', { level: level.id });
        if (id === null) continue;
        const cls = ctx.defs.object((ctx.state.entities[String(id)] as Entity).def).class;
        expect(ROGUE_CLASSES).toContain(cls);
        counts[cls] = (counts[cls] ?? 0) + 1;
        ctx.remove(id);
      }
      expect(counts['food'] ?? 0).toBeGreaterThan(1500 * 0.16);
      expect(counts['food'] ?? 0).toBeLessThan(1500 * 0.28);
      expect(counts['ring'] ?? 0).toBeGreaterThan(0);
    });
  });

  test('mktrap() makes only the seven kinds, every one of them', () => {
    const seen = new Set<DefId>();
    onRogue(SEEDS[3] as number, (ctx, level, room) => {
      for (let i = 0; i < 300; i++) seen.add(traptypeRogue(ctx));
      for (let i = 0; i < 40; i++) mktrap(ctx, level, room);
      for (const t of level.traps) expect(ROGUE_TRAPS).toContain(t.def);
    });
    expect([...seen].sort()).toEqual([...ROGUE_TRAPS].sort());
  });

  test('monsters are made without gear there and with it elsewhere', () => {
    const gear = (ctx: Ctx, level: Level): number => {
      let n = 0;
      const room = level.rooms[0] as Room;
      for (let i = 0; i < 12; i++) {
        const id = makemon(
          ctx,
          ctx.defs.monster('nh:soldier'),
          { x: room.lx, y: room.ly },
          { level: level.id, adjacentOk: true },
        );
        if (id === null) continue;
        n += inventoryOf(ctx.state, id).length;
      }
      return n;
    };
    onRogue(SEEDS[4] as number, (ctx, level) => expect(gear(ctx, level)).toBe(0));
    onOrdinary(SEEDS[4] as number, (ctx, level) => expect(gear(ctx, level)).toBeGreaterThan(0));
  });

  test('random polymorph forms are mostly uppercase there, much less often elsewhere', () => {
    const share = (ctx: Ctx, level: Level): number => {
      const room = level.rooms[0] as Room;
      let upper = 0;
      let changed = 0;
      for (let i = 0; i < 150; i++) {
        const id = makemon(
          ctx,
          ctx.defs.monster('nh:newt'),
          { x: room.lx, y: room.ly },
          { level: level.id, adjacentOk: true },
        );
        const mon = id === null ? undefined : ctx.state.entities[String(id)];
        if (!mon) continue;
        if (newcham(ctx, mon, null)) {
          changed++;
          if (upperSym(ctx.defs.monster(mon.def).glyph.ch)) upper++;
        }
        ctx.remove(mon.id);
      }
      expect(changed).toBeGreaterThan(100);
      return upper / changed;
    };
    let rogue = 0;
    let ordinary = 1;
    onRogue(SEEDS[5] as number, (ctx, level) => (rogue = share(ctx, level)));
    onOrdinary(SEEDS[5] as number, (ctx, level) => (ordinary = share(ctx, level)));
    expect(rogue).toBeGreaterThan(0.75);
    expect(ordinary).toBeLessThan(0.6);
  });

  test('a vampire lord there only takes the bat shape; nasties and animals lean uppercase', () => {
    const vamp = (ctx: Ctx, level: Level): Set<DefId> => {
      const room = level.rooms[0] as Room;
      const id = makemon(
        ctx,
        ctx.defs.monster('nh:vampire_lord'),
        { x: room.lx, y: room.ly },
        { level: level.id, adjacentOk: true },
      );
      const mon = ctx.state.entities[String(id)] as Entity;
      setCham(ctx, mon.id, 'nh:vampire_lord');
      const shapes = new Set<DefId>();
      for (let i = 0; i < 200; i++) {
        const s = pickvampshape(ctx, mon);
        if (s !== null) shapes.add(s);
      }
      return shapes;
    };
    const nastyShare = (ctx: Ctx): number => {
      let up = 0;
      for (let i = 0; i < 1000; i++) {
        const id = pickNasty(ctx, 0);
        if (ctx.defs.isMonster(id) && upperSym(ctx.defs.monster(id).glyph.ch)) up++;
      }
      return up / 1000;
    };
    const animalShare = (ctx: Ctx, rogue: boolean): number => {
      let up = 0;
      for (let i = 0; i < 1000; i++) {
        const m = pickAnimal(ctx, rogue);
        if (m && upperSym(m.glyph.ch)) up++;
      }
      return up / 1000;
    };
    let rogueNasty = 0;
    let ordNasty = 1;
    onRogue(SEEDS[6] as number, (ctx, level) => {
      expect([...vamp(ctx, level)].sort()).toEqual(['nh:vampire_bat', 'nh:vampire_lord']);
      rogueNasty = nastyShare(ctx);
      expect(animalShare(ctx, true)).toBeGreaterThan(animalShare(ctx, false) + 0.1);
    });
    onOrdinary(SEEDS[6] as number, (ctx, level) => {
      expect(vamp(ctx, level).has('nh:wolf')).toBe(true);
      ordNasty = nastyShare(ctx);
    });
    expect(rogueNasty).toBeGreaterThan(ordNasty + 0.1);
  });

  test('a mimic on a doorway there looks like the wall, not a door', () => {
    let horiz = 0;
    let vert = 0;
    for (const seed of SEEDS.slice(0, 6))
      onRogue(seed, (ctx, level) => {
        for (let y = 0; y < level.height; y++)
          for (let x = 0; x < level.width; x++) {
            if (terrainIdAt(level, x, y) !== T.doorway) continue;
            const id = makemon(
              ctx,
              ctx.defs.monster('nh:giant_mimic'),
              { x, y },
              { level: level.id },
            );
            if (id === null) continue;
            const mon = ctx.state.entities[String(id)] as Entity;
            const left = terrainIdAt(level, x - 1, y);
            const want =
              left === T.hwall || left === T.tlcorn || left === T.blcorn ? T.hwall : T.vwall;
            expect(mimicShownAs(ctx.state, ctx.defs, mon)).toBe(want);
            if (want === T.hwall) horiz++;
            else vert++;
            ctx.remove(id);
          }
      });
    expect(horiz).toBeGreaterThan(0);
    expect(vert).toBeGreaterThan(0);
  });
});
