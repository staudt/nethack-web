// m23 step 6: monsters and the Amulet of Yendor; the Wizard's harassment. Covetous monsters go
// for the Amulet first (sparing the Wizard and temple priests who hold it) and for the quest
// artifact first once the gate is open; the Wizard's claws steal the Amulet, the Bell, the
// Candelabrum; a monster carrying the Amulet cannot level teleport, zaps her away instead of
// itself, may be held back by the mysterious force, and does not follow her off the level, while
// the Wizard follows her from anywhere when she carries it. The Wizard's death makes her a
// demigod: every udg_cnt turns intervene() (each case), and resurrect() both ways; amulet()'s
// wake, cuss()'s "Relinquish the amulet", the clone's fake, the bribe and the spawn odds.
// Outcomes over RNG offsets.
// ref: src/wizard.c strategy(), target_on(), amulet(), wizdeadorgone(), intervene(),
// resurrect(), clonewiz(), cuss(); src/steal.c stealamulet(); src/muse.c m_tele(),
// find_defensive(), use_defensive(); src/teleport.c mlevel_tele_trap(); src/dog.c keepdogs();
// src/mondata.c levl_follower(); src/minion.c demon_talk(); src/allmain.c
// maybe_generate_rnd_mon(), moveloop_core()
import {
  createEngine,
  dungeonLayout,
  getLevel,
  getPlayer,
  inventoryOf,
  levelIdFor,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { oname, vanillaMod } from '../src/index';
import { tactics } from '../src/covetous';
import { cuss } from '../src/cuss';
import { demonTalk } from '../src/demontalk';
import { makemon, spawnOdds } from '../src/generation';
import { amulet, intervene, resurrect, wizdeadorgone } from '../src/harass';
import { mksobj } from '../src/items';
import { GEHENNOM, PLANES } from '../src/levelflags';
import { setU, uState } from '../src/luck';
import { mondead, mongone } from '../src/mondeath';
import { isMrevived, mstratOf, setStrat } from '../src/mstate';
import { findDefensive, useDefensive } from '../src/muse';
import { clonewiz } from '../src/nasty';
import { maketrap, mintrap, TRAP } from '../src/trap';
import { trapTable } from '../src/trapstate';
import { stealamulet } from '../src/steal';
import { AMULET_OF_YENDOR, BELL_OF_OPENING, BOOK_OF_THE_DEAD, CANDELABRUM } from '../src/uhave';
import { isWiz, noOfWizards, WIZARD_OF_YENDOR } from '../src/wizstate';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'har',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'har:run',
      labelKey: 'har',
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
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'har:run' as DefId }).events);
}

/** Every outcome of `fn` over the first `tries` RNG offsets, each on a copy of `state`. */
function outcomes(
  state: GameState,
  fn: (ctx: Ctx) => void,
  tries = 100,
): { k: number; state: GameState; text: string[] }[] {
  const out = [];
  for (let k = 0; k < tries; k++) {
    const st = structuredClone(state);
    const text = run(st, (ctx) => {
      for (let i = 0; i < k; i++) ctx.rng.rn2(2);
      fn(ctx);
    });
    out.push({ k, state: st, text });
  }
  return out;
}

const ent = (st: GameState, id: EntityId): Entity => st.entities[String(id)]!;
const next2 = (p: { x: number; y: number }, q: { x: number; y: number }): boolean =>
  Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) === 1;

const ROOM = [
  '..............................',
  '..............................',
  '..............................',
  '...@..........................',
  '..............................',
  '..............................',
];

/** A lit room, the hero at (3,3) with 500 HP; the Amulet's wish already granted. */
function room(rows = ROOM) {
  const s = levelSetup(rows);
  plainKit(s.state);
  setU({ state: s.state }, { amuletWish: true });
  s.step({ type: 'wait' }); // see the level
  return s;
}

/** A monster made by makemon() at (x, y), pinned (speed 0), with plenty of HP. */
function made(st: GameState, def: string, x: number, y: number, o = {}): Entity {
  let id: number | null = null;
  run(st, (ctx) => {
    id = makemon(ctx, defs.monster(def as DefId), { x, y }, o);
  });
  const e = ent(st, id!);
  e.c.actor!.speed = 0;
  e.c.hp = { cur: 300, max: 300 };
  return e;
}

/** A new object of `def` for `who` (null: the floor at `at`); the Amulet made as NetHack makes it. */
function give(st: GameState, def: string, who: EntityId | null, at?: { x: number; y: number }) {
  let id: EntityId = 0;
  run(st, (ctx) => {
    id = mksobj(ctx, ctx.defs.object(def as DefId), {
      init: def === AMULET_OF_YENDOR,
      ...(who !== null ? { carriedBy: who } : { at: { level: st.currentLevel, ...at! } }),
    });
  });
  return ent(st, id);
}

const wizards = (st: GameState): Entity[] =>
  sortedIds(st)
    .map((i) => ent(st, i))
    .filter((e) => e.c.monster && isWiz({ state: st }, e.id));

describe('covetous monsters and the Amulet', () => {
  // the demon princes want the Amulet (M3_WANTSAMUL); the liches only the Book
  test('once made, the Amulet is the first target: a demon prince comes next to her for it', () => {
    const s = room();
    const yeen = made(s.state, 'nh:yeenoghu', 25, 1, { noWait: true });
    const lich = made(s.state, 'nh:arch_lich', 25, 5, { noWait: true });
    give(s.state, AMULET_OF_YENDOR, s.state.playerId);
    run(s.state, (ctx) => void tactics(ctx, yeen.id));
    expect(mstratOf({ state: s.state }, yeen.id)).toMatchObject({
      strat: 'player',
      want: 'wantsamul',
    });
    expect(next2(yeen.c.pos!, { x: 3, y: 3 })).toBe(true);
    run(s.state, (ctx) => void tactics(ctx, lich.id));
    expect(mstratOf({ state: s.state }, lich.id).strat).toBeUndefined();
    // the Wizard: the Amulet before the Book on the floor
    const s2 = room();
    const wiz = made(s2.state, WIZARD_OF_YENDOR, 25, 1, { noWait: true });
    give(s2.state, BOOK_OF_THE_DEAD, null, { x: 20, y: 5 });
    give(s2.state, AMULET_OF_YENDOR, s2.state.playerId);
    run(s2.state, (ctx) => void tactics(ctx, wiz.id));
    expect(mstratOf({ state: s2.state }, wiz.id)).toMatchObject({
      strat: 'player',
      want: 'wantsamul',
    });
  });

  test('a monster holding it is a target, but not the Wizard or a priest in his temple', () => {
    const s = room();
    const yeen = made(s.state, 'nh:yeenoghu', 25, 1, { noWait: true });
    const jackal = made(s.state, 'nh:jackal', 15, 4);
    give(s.state, AMULET_OF_YENDOR, jackal.id);
    run(s.state, (ctx) => void tactics(ctx, yeen.id));
    expect(mstratOf({ state: s.state }, yeen.id)).toMatchObject({
      strat: 'monstr',
      want: 'wantsamul',
    });
    expect(next2(yeen.c.pos!, { x: 15, y: 4 })).toBe(true);

    const s2 = room();
    const y2 = made(s2.state, 'nh:yeenoghu', 25, 1, { noWait: true });
    const wiz = made(s2.state, WIZARD_OF_YENDOR, 15, 4, { noWait: true });
    give(s2.state, AMULET_OF_YENDOR, wiz.id);
    run(s2.state, (ctx) => void tactics(ctx, y2.id));
    expect(mstratOf({ state: s2.state }, y2.id).strat).toBeUndefined();
  });

  test('before the invocation the Book comes before a quest artifact; after it, the reverse', () => {
    for (const invoked of [false, true]) {
      const s = room();
      const wiz = made(s.state, WIZARD_OF_YENDOR, 25, 1, { noWait: true });
      give(s.state, BOOK_OF_THE_DEAD, null, { x: 20, y: 5 });
      const key = give(s.state, 'nh:skeleton_key', null, { x: 10, y: 0 });
      run(s.state, (ctx) => void oname(ctx, key, 'The Master Key of Thievery', 'wish', true));
      if (invoked) setU({ state: s.state }, { invoked: true });
      run(s.state, (ctx) => void tactics(ctx, wiz.id));
      expect(wiz.c.pos).toMatchObject(invoked ? { x: 10, y: 0 } : { x: 20, y: 5 });
    }
  });
});

describe('stealing the Amulet', () => {
  test('the Amulet before the Bell, the Book and the Candelabrum; then he teleports away', () => {
    const s = room();
    const wiz = made(s.state, WIZARD_OF_YENDOR, 4, 3, { noWait: true });
    for (const d of [CANDELABRUM, BOOK_OF_THE_DEAD, BELL_OF_OPENING, AMULET_OF_YENDOR])
      give(s.state, d, s.state.playerId);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const before = inventoryOf(s.state, wiz.id).map((o) => o.def);
      const t = run(s.state, (ctx) => stealamulet(ctx, ent(ctx.state, wiz.id)));
      const got = inventoryOf(s.state, wiz.id).find((o) => !before.includes(o.def))!;
      order.push(got.def);
      if (i === 0) expect(t[0]).toMatch(/^The Wizard of Yendor steals the Amulet of Yendor!$/);
    }
    expect(order).toEqual([AMULET_OF_YENDOR, BELL_OF_OPENING, BOOK_OF_THE_DEAD, CANDELABRUM]);
    expect(wiz.c.pos!.x !== 4 || wiz.c.pos!.y !== 3).toBe(true);
  });

  test('a fake Amulet fools any thief but the Wizard', () => {
    const fakes = (thief: string): number => {
      const s = room();
      const m = made(s.state, thief, 4, 3, { noWait: true });
      give(s.state, AMULET_OF_YENDOR, s.state.playerId);
      give(s.state, 'nh:fake_amulet_of_yendor', s.state.playerId);
      return outcomes(s.state, (ctx) => stealamulet(ctx, ent(ctx.state, m.id)), 40).filter((o) =>
        inventoryOf(o.state, m.id).some((x) => x.def === 'nh:fake_amulet_of_yendor'),
      ).length;
    };
    expect(fakes(WIZARD_OF_YENDOR)).toBe(0);
    const n = fakes('nh:jackal');
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(40);
  });
});

describe('monsters carrying the Amulet', () => {
  test('on a level teleporter it only "seems very disoriented for a moment."', () => {
    const s = room();
    const j = made(s.state, 'nh:jackal', 6, 3);
    give(s.state, AMULET_OF_YENDOR, j.id);
    run(s.state, (ctx) => void maketrap(ctx, 'dlvl1', 6, 3, TRAP.levelTele));
    const t = run(s.state, (ctx) => void mintrap(ctx, j.id, { force: true }));
    expect(t).toContain('The jackal seems very disoriented for a moment.');
    expect(j.c.pos).toMatchObject({ level: 'dlvl1', x: 6, y: 3 });
  });

  test('a wounded one zaps its wand of teleportation at her, not at itself', () => {
    const s = room();
    const orc = made(s.state, 'nh:hill_orc', 6, 3);
    orc.c.hp = { cur: 2, max: 20 };
    give(s.state, AMULET_OF_YENDOR, orc.id);
    const w = give(s.state, 'nh:wand_of_teleportation', orc.id);
    w.c.item!.spe = 3;
    let kind = '';
    run(s.state, (ctx) => {
      const c = findDefensive(ctx, orc.id, false);
      kind = c?.kind ?? '';
      if (c) useDefensive(ctx, orc.id, c);
    });
    expect(kind).toBe('wan_tele');
    expect(orc.c.pos).toMatchObject({ x: 6, y: 3 });
  });

  test("fleeing up Gehennom's stairs, the mysterious force sends it down 1 time in 4", () => {
    const { state } = engine.newGame({ seed: 5 });
    setU({ state }, { amuletWish: true });
    getPlayer(state).c.hp = { cur: 999, max: 999 };
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 5 }, 'up'));
    const level = getLevel(state);
    const up = level.up!;
    const hero = getPlayer(state);
    // the hero steps off the stairs; a gnome lord stands on them with the Amulet
    let spot = { x: 0, y: 0 };
    run(state, (ctx) => {
      for (const id of sortedIds(ctx.state))
        if (id !== ctx.state.playerId && ctx.state.entities[String(id)]?.c.monster?.tame)
          ctx.remove(id);
      const id = makemon(ctx, ctx.defs.monster('nh:gnome_lord' as DefId), up, {
        adjacentOk: true,
      })!;
      spot = { ...ent(ctx.state, id).c.pos! };
      ent(ctx.state, id).c.pos = { level: level.id, ...up };
      hero.c.pos = { level: level.id, ...spot };
    });
    const g = sortedIds(state)
      .map((i) => ent(state, i))
      .find((e) => e.def === 'nh:gnome_lord' && e.c.pos?.x === up.x && e.c.pos.y === up.y)!;
    give(state, AMULET_OF_YENDOR, g.id);
    const res = outcomes(
      state,
      (ctx) => void useDefensive(ctx, g.id, { kind: 'upstairs', obj: null }),
      80,
    );
    const dest = (o: { state: GameState }) =>
      trapTable({ state: o.state }, 'migrating', false)?.[String(g.id)];
    const down = res.filter(
      (o) => dest(o) === levelIdFor(o.state, { dungeon: GEHENNOM, dlevel: 6 }),
    );
    const upd = res.filter(
      (o) => dest(o) === levelIdFor(o.state, { dungeon: GEHENNOM, dlevel: 4 }),
    );
    expect(down.length + upd.length).toBe(res.length);
    expect(down.length).toBeGreaterThan(5);
    expect(down.length).toBeLessThan(res.length / 2);
    expect(down[0]!.text).toContain(
      'As the gnome lord climbs the stairs, a mysterious force momentarily surrounds him...',
    );
    expect(upd[0]!.text).toContain('The gnome lord escapes upstairs!');
  });

  test('a demon prince with the Amulet asks more than she has', () => {
    const s = room();
    const asm = made(s.state, 'nh:asmodeus', 4, 3);
    asm.c.monster!.peaceful = true;
    give(s.state, AMULET_OF_YENDOR, asm.id);
    give(s.state, 'nh:gold_piece', s.state.playerId).c.item!.quantity = 100;
    const t = run(s.state, (ctx) => void demonTalk(ctx, asm.id));
    const n = Number(/demands (\d+) zorkmids/.exec(t.join(' '))?.[1]);
    expect(n).toBeGreaterThanOrEqual(100 + 125);
    expect(n).toBeLessThanOrEqual(100 + 1124);
  });
});

describe('changing levels with the Amulet', () => {
  test('the Wizard follows her from across the level; a monster carrying it stays behind', () => {
    const { state } = engine.newGame({ seed: 7 });
    plainKit(state);
    setU({ state }, { amuletWish: true });
    getPlayer(state).c.hp = { cur: 999, max: 999 };
    const hp = getPlayer(state).c.pos!;
    let wizId = 0;
    let carrier = 0;
    run(state, (ctx) => {
      // the Wizard far away, a tame jackal (a follower) next to her holding the Amulet
      wizId = makemon(ctx, ctx.defs.monster(WIZARD_OF_YENDOR), null, { noWait: true })!;
      ent(ctx.state, wizId).c.monster!.asleep = false;
      carrier = makemon(ctx, ctx.defs.monster('nh:jackal' as DefId), hp, { adjacentOk: true })!;
      ent(ctx.state, carrier).c.monster!.asleep = false;
      ent(ctx.state, carrier).c.monster!.tame = 10;
    });
    give(state, AMULET_OF_YENDOR, carrier);
    const w = ent(state, wizId);
    expect(next2(w.c.pos!, hp)).toBe(false);
    // without the Amulet the far Wizard stays; the one holding it never follows
    const s0 = structuredClone(state);
    run(s0, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'random'));
    expect(ent(s0, wizId).c.pos!.level).toBe(levelIdFor(s0, { dungeon: 'nh:main', dlevel: 1 }));
    expect(ent(s0, carrier).c.pos!.level).toBe(levelIdFor(s0, { dungeon: 'nh:main', dlevel: 1 }));
    // with it, he comes from anywhere
    give(state, AMULET_OF_YENDOR, state.playerId);
    const t = run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'random'));
    expect(t).toContain('The jackal seems very disoriented for a moment.');
    const here = getPlayer(state).c.pos!;
    expect(w.c.pos!.level).toBe(here.level);
    expect(next2(w.c.pos!, here)).toBe(true);
    expect(ent(state, carrier).c.pos!.level).not.toBe(here.level);
  });
});

describe('the Wizard dead or gone: a demigod', () => {
  test('his death or escape makes her a demigod once, with the harassment 50-299 turns away', () => {
    for (const how of ['dead', 'gone'] as const) {
      const s = room();
      const w = made(s.state, WIZARD_OF_YENDOR, 10, 3, { noWait: true });
      run(s.state, (ctx) => (how === 'dead' ? mondead(ctx, w.id) : mongone(ctx, w.id)));
      const u = uState(s.state);
      expect(u.udemigod).toBe(true);
      expect(u.udgCnt).toBeGreaterThanOrEqual(50);
      expect(u.udgCnt).toBeLessThanOrEqual(299);
      // a second Wizard's death leaves the count alone
      setU({ state: s.state }, { udgCnt: 7 });
      run(s.state, (ctx) => wizdeadorgone(ctx));
      expect(uState(s.state).udgCnt).toBe(7);
    }
  });

  test('the count runs down each turn; at 0 intervene() and a new count of 50-249', () => {
    const s = room();
    setU({ state: s.state }, { udemigod: true, udgCnt: 2 });
    s.step({ type: 'wait' });
    expect(uState(s.state).udgCnt).toBe(1);
    s.step({ type: 'wait' });
    const n = uState(s.state).udgCnt!;
    expect(n).toBeGreaterThanOrEqual(50);
    expect(n).toBeLessThanOrEqual(249);
    // not while a prayer makes her invulnerable
    setU({ state: s.state }, { udgCnt: 5, uinvulnerable: true });
    s.step({ type: 'wait' });
    expect(uState(s.state).udgCnt).toBe(5);
  });

  test('intervene(): nervous, a black glow and curses, aggravation, nasties, the Wizard back', () => {
    const s = room();
    const jackal = made(s.state, 'nh:jackal', 28, 0, { asleep: true });
    jackal.c.monster!.asleep = true;
    const before = sortedIds(s.state).filter((i) => ent(s.state, i).c.monster).length;
    const kinds = new Set<string>();
    for (const o of outcomes(s.state, (ctx) => intervene(ctx), 150)) {
      const mons = sortedIds(o.state).filter((i) => o.state.entities[String(i)]?.c.monster);
      const woke = !ent(o.state, jackal.id).c.monster!.asleep;
      let kind: string;
      if (o.text.includes('You feel vaguely nervous.')) kind = 'nervous';
      else if (o.text.includes('You notice a black glow surrounding you.')) {
        expect(o.text).toContain('You feel a malignant aura surround you.');
        kind = 'glow';
      } else if (wizards(o.state).length) {
        expect(o.text).toEqual([
          'A voice booms out...',
          '"So thou thought thou couldst kill me, fool."',
        ]);
        kind = 'wizard';
      } else if (mons.length > before) kind = 'nasty';
      else {
        expect(woke).toBe(true);
        kind = 'aggravate';
      }
      if (kind !== 'aggravate' && kind !== 'nasty') expect(woke).toBe(false);
      kinds.add(kind);
    }
    expect([...kinds].sort()).toEqual(['aggravate', 'glow', 'nasty', 'nervous', 'wizard']);
  });

  test('on the Astral Plane intervene() never brings the Wizard back', () => {
    const { state } = engine.newGame({ seed: 3 });
    getPlayer(state).c.hp = { cur: 999, max: 999 };
    const astral = dungeonLayout(state, PLANES).special.find((x) => x.id === 'nh:plane-astral')!;
    run(state, (ctx) => ctx.goToLevel({ dungeon: PLANES, dlevel: astral.dlevel }, 'random'));
    let seen = 0;
    for (const o of outcomes(state, (ctx) => intervene(ctx), 60)) {
      expect(wizards(o.state)).toHaveLength(0);
      if (o.text.includes('You feel vaguely nervous.')) seen++;
    }
    // rnd(4): case 1 is still the nervous feeling, 1 time in 4
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(30);
  });
});

describe('resurrect()', () => {
  test('with no Wizard in play: a new one next to her, "So thou thought thou couldst kill me"', () => {
    const s = room();
    const t = run(s.state, (ctx) => resurrect(ctx));
    expect(t).toEqual(['A voice booms out...', '"So thou thought thou couldst kill me, fool."']);
    const [w] = wizards(s.state);
    expect(next2(w!.c.pos!, { x: 3, y: 3 })).toBe(true);
    expect(isMrevived({ state: s.state }, w!.id)).toBe(true);
    expect(w!.c.monster!.peaceful).toBe(false);
    expect(mstratOf({ state: s.state }, w!.id).waitForU).toBeUndefined();
  });

  test('a Wizard on another level comes to her ("elude"), unless he holds the Amulet', () => {
    for (const holds of [false, true]) {
      const { state } = engine.newGame({ seed: 4 });
      plainKit(state);
      setU({ state }, { amuletWish: true });
      run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'random'));
      let wizId = 0;
      run(state, (ctx) => {
        wizId = makemon(ctx, ctx.defs.monster(WIZARD_OF_YENDOR), null, { noWait: true })!;
        ent(ctx.state, wizId).c.monster!.asleep = false;
        setStrat(ctx, wizId, 'waitForU');
      });
      if (holds) give(state, AMULET_OF_YENDOR, wizId);
      run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 1 }, 'random'));
      state.turn += 100;
      expect(noOfWizards({ state })).toBe(1);
      const t = run(state, (ctx) => resurrect(ctx));
      const w = ent(state, wizId);
      const hp = getPlayer(state).c.pos!;
      if (holds) {
        expect(t).toEqual([]);
        expect(w.c.pos!.level).not.toBe(hp.level);
      } else {
        expect(t).toEqual([
          'A voice booms out...',
          '"So thou thought thou couldst elude me, fool."',
        ]);
        expect(w.c.pos!.level).toBe(hp.level);
        expect(next2(w.c.pos!, hp)).toBe(true);
        expect(mstratOf({ state }, wizId).waitForU).toBeUndefined();
      }
    }
  });
});

describe('the Wizard and the hero with the Amulet', () => {
  test('a sleeping Wizard on her level wakes 1 time in 40: "You get the creepy feeling..."', () => {
    const s = room();
    const w = made(s.state, WIZARD_OF_YENDOR, 25, 1, { noWait: true });
    w.c.monster!.asleep = true;
    give(s.state, AMULET_OF_YENDOR, s.state.playerId);
    const res = outcomes(s.state, (ctx) => amulet(ctx), 120);
    const woke = res.filter((o) => !ent(o.state, w.id).c.monster!.asleep);
    expect(woke.length).toBeGreaterThan(0);
    expect(woke.length).toBeLessThan(15);
    expect(woke[0]!.text).toEqual([
      'You get the creepy feeling that somebody noticed your taking the Amulet.',
    ]);
    for (const o of res.filter((x) => ent(x.state, w.id).c.monster!.asleep))
      expect(o.text).toEqual([]);
  });

  test('"Relinquish the amulet, ...!" only while she carries it', () => {
    const lines = (amu: boolean): string[] => {
      const s = room();
      const w = made(s.state, WIZARD_OF_YENDOR, 5, 3, { noWait: true });
      if (amu) give(s.state, AMULET_OF_YENDOR, s.state.playerId);
      return outcomes(s.state, (ctx) => cuss(ctx, ent(ctx.state, w.id)), 300).flatMap(
        (o) => o.text,
      );
    };
    const rel = (t: string[]) => t.filter((x) => x.startsWith('"Relinquish the amulet, '));
    expect(rel(lines(false))).toHaveLength(0);
    expect(rel(lines(true)).length).toBeGreaterThan(0);
  });

  test('the clone never carries a fake Amulet while she has the real one', () => {
    const fakes = (amu: boolean): number => {
      const s = room();
      if (amu) give(s.state, AMULET_OF_YENDOR, s.state.playerId);
      return outcomes(s.state, (ctx) => clonewiz(ctx), 30).filter((o) =>
        wizards(o.state).some((w) =>
          inventoryOf(o.state, w.id).some((x) => x.def === 'nh:fake_amulet_of_yendor'),
        ),
      ).length;
    };
    expect(fakes(true)).toBe(0);
    expect(fakes(false)).toBeGreaterThan(0);
  });
});

describe('a demigod', () => {
  test('random monsters 1 turn in 25 (1 in 50 below the Castle, 1 in 70 above)', () => {
    const { state } = engine.newGame({ seed: 2 });
    expect(spawnOdds(state)).toBe(70);
    run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 2 }, 'random'));
    expect(spawnOdds(state)).toBe(50);
    setU({ state }, { udemigod: true });
    expect(spawnOdds(state)).toBe(25);
  });
});
