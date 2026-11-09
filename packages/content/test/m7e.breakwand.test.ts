// m7e step 7: breaking wands, explode(), magical traps blowing up. Each do_break_wand() case,
// the explosion's damage with and without resistance, cancellation at a magic trap and a
// teleportation trap, digging down on a level teleporter. Monsters are pinned (asleep, speed
// 0, many hit points) and outcomes are asserted over several seeds, never on one lucky seed.
// ref: src/apply.c do_break_wand(), broken_wand_explode(); src/explode.c explode();
// src/zap.c maybe_explode_trap(), zap_map(); src/dig.c dighole()
import {
  createEngine,
  getPlayer,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { APPLY_ID } from '../src/apply';
import { explode } from '../src/explode';
import { mksobj } from '../src/items';
import { isKnown } from '../src/o_init';
import { P, setIntrinsic } from '../src/props';
import { T, terrainIdAt } from '../src/terrain';
import { TRAP } from '../src/trap';
import { isMtrapped, setMtrapped, utrap } from '../src/trapstate';
import { weffects } from '../src/zap';
import { addMon } from './helpers';
import { obj, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'bw',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'bw:run',
      labelKey: 'bw',
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
function run(state: GameState, fn: (ctx: Ctx) => void): GameEvent[] {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'bw:run' }).events;
}

/** A 9 x 9 lit room inside walls with the hero in the middle (5, 5). */
const ROOM = [
  '-----------',
  '|.........|',
  '|.........|',
  '|.........|',
  '|.........|',
  '|....@....|',
  '|.........|',
  '|.........|',
  '|.........|',
  '|.........|',
  '-----------',
];
type M = ReturnType<typeof mapSetup>;

function setupHero(seed: number, rows = ROOM): M {
  const m = mapSetup(rows, { seed });
  const h = getPlayer(m.state);
  h.c.hp = { cur: 500, max: 500 };
  // no resistances unless a test gives one (a Valkyrie is born cold resistant)
  setIntrinsic(h, P.COLD_RES, false);
  return m;
}
function giveWand(m: M, def: string, spe: number): EntityId {
  const id = mksobj(m.ctx, obj(def), { init: false, carriedBy: m.state.playerId });
  m.state.entities[String(id)]!.c.item!.spe = spe;
  return id;
}
/** A sleeping, unmoving hostile monster with many hit points. */
function pinned(m: M, def: string, x: number, y: number, hp = 1000): Entity {
  const id = addMon(m.state, def, x, y, { asleep: true });
  const mon = m.state.entities[String(id)]!;
  mon.c.hp = { cur: hp, max: hp };
  mon.c.actor!.speed = 0;
  return mon;
}
const hpOf = (m: M): number => getPlayer(m.state).c.hp!.cur;
const breakIt = (m: M, id: EntityId, yes: unknown = true): string[] => {
  const asked = engine.stepAll(m.state, { type: 'mod', action: APPLY_ID, args: { item: id } });
  const p = m.state.pendingPrompt?.prompt;
  if (!p) return texts(asked.events);
  const r: StepResult = engine.stepAll(m.state, {
    type: 'answer',
    promptId: p.id,
    value: yes as never,
  });
  return [...texts(asked.events), ...texts(r.events)];
};
const gone = (m: M, id: EntityId): boolean => m.state.entities[String(id)] === undefined;
const heroPos = (m: M): { x: number; y: number } => {
  const p = getPlayer(m.state).c.pos!;
  return { x: p.x, y: p.y };
};

describe('the Break offer and its question', () => {
  test('a carried wand offers "Break" (an #apply), asks, and "no" keeps it', () => {
    const m = setupHero(1);
    const id = giveWand(m, 'nh:wand_of_fire', 4);
    const offers = engine.query(m.state).actionsFor({ kind: 'item', id });
    const brk = offers.find((o) => o.labelKey === 'action.nh:break');
    expect(brk?.action).toEqual({ type: 'mod', action: APPLY_ID, args: { item: id } });
    const before = m.state.turn;
    const msgs = breakIt(m, id, false);
    expect(msgs).toEqual([]);
    expect(gone(m, id)).toBe(false);
    expect(m.state.turn).toBe(before);
  });

  test('the question names the wand; too weak or a welded two-hander refuses', () => {
    const m = setupHero(1);
    const id = giveWand(m, 'nh:wand_of_striking', 2);
    engine.stepAll(m.state, { type: 'mod', action: APPLY_ID, args: { item: id } });
    const p = m.state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('yn');
    expect(render({ key: p!.key, params: p!.params ?? {} })).toMatch(
      /^Are you really sure you want to break your .*wand.*\?$/,
    );
    const w = setupHero(2);
    getPlayer(w.state).c.attributes!.str = 6;
    const wid = giveWand(w, 'nh:wand_of_striking', 2);
    const app = w.state.appearances['nh:wand_of_striking'];
    const fragile = app === 'nh:balsa_wand' || app === 'nh:glass_wand';
    const msgs = breakIt(w, wid);
    if (fragile) expect(msgs[0]).toMatch(/snap it in two/);
    else expect(msgs).toEqual([expect.stringMatching(/^You don't have the strength to break/)]);
  });
});

describe('breaking: nothing else happens', () => {
  test('a wand with no charges left breaks with nothing else, taking a turn', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const m = setupHero(seed);
      const id = giveWand(m, 'nh:wand_of_fire', -1);
      const before = m.state.turn;
      const msgs = breakIt(m, id);
      expect(msgs).toEqual([
        expect.stringMatching(
          /^Raising your .* high above your head, you (break|snap) it in two!$/,
        ),
        'But nothing else happens...',
      ]);
      expect(gone(m, id)).toBe(true);
      expect(m.state.turn).toBe(before + 1);
      expect(hpOf(m)).toBe(500);
    }
  });

  test('opening, locking, probing, nothing...: nothing else happens', () => {
    for (const def of ['nh:wand_of_opening', 'nh:wand_of_locking', 'nh:wand_of_nothing']) {
      const m = setupHero(3);
      const id = giveWand(m, def, 3);
      expect(breakIt(m, id).slice(1)).toEqual(['But nothing else happens...']);
      expect(gone(m, id)).toBe(true);
    }
  });
});

describe('explosions of attack wands', () => {
  test('fire: spe * 8 to her and each monster, fire resistance shields, cold resistance doubles', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const m = setupHero(seed);
      const newt = pinned(m, 'nh:newt', 4, 5);
      const red = pinned(m, 'nh:red_mold', 6, 5); // fire resistant
      const brown = pinned(m, 'nh:brown_mold', 5, 4); // cold resistant
      const far = pinned(m, 'nh:newt', 8, 5);
      const id = giveWand(m, 'nh:wand_of_fire', 3);
      // a spare move: the turn does not end, so no HP regeneration hides the damage
      getPlayer(m.state).c.actor!.energy += 12;
      const msgs = breakIt(m, id);
      const dam = 3 * 4 * 2;
      expect(msgs).toContain('Boom!');
      expect(msgs).toContain('You are caught in the fireball!');
      expect(msgs).toContain('The newt is caught in the fireball!');
      expect(newt.c.hp!.cur).toBe(1000 - dam);
      expect(red.c.hp!.cur).toBe(1000);
      expect(brown.c.hp!.cur).toBe(1000 - 2 * dam);
      expect(far.c.hp!.cur).toBe(1000);
      expect(hpOf(m)).toBe(500 - dam);
      expect(isKnown(m.state, engine.registry, 'nh:wand_of_fire')).toBe(true);
      expect(gone(m, id)).toBe(true);
    }
  });

  test('fire resistance keeps her unharmed; the explosion is a box of 9 cells', () => {
    const m = setupHero(5);
    setIntrinsic(getPlayer(m.state), P.FIRE_RES, true);
    const id = giveWand(m, 'nh:wand_of_fire', 2);
    engine.stepAll(m.state, { type: 'mod', action: APPLY_ID, args: { item: id } });
    const p = m.state.pendingPrompt!.prompt;
    const events = engine.stepAll(m.state, { type: 'answer', promptId: p.id, value: true }).events;
    expect(hpOf(m)).toBe(500);
    const box = events.find((e) => e.type === 'ray');
    expect(box).toMatchObject({ type: 'ray', kind: 'explosion', fg: '#ff8800' });
    if (box?.type !== 'ray') throw new Error('no explosion');
    expect(box.path).toHaveLength(9);
    expect(box.path[0]).toEqual({ x: 4, y: 4, dx: -1, dy: -1 });
    expect(box.path[4]).toEqual({ x: 5, y: 5, dx: 0, dy: 0 });
  });

  test('cold: a frosty ball of cold; a cold-resistant hero is unharmed', () => {
    const m = setupHero(6);
    setIntrinsic(getPlayer(m.state), P.COLD_RES, true);
    const newt = pinned(m, 'nh:newt', 5, 6);
    const brown = pinned(m, 'nh:brown_mold', 4, 4);
    const id = giveWand(m, 'nh:wand_of_cold', 1);
    const msgs = breakIt(m, id);
    expect(msgs).toContain('You are caught in the ball of cold!');
    expect(hpOf(m)).toBe(500);
    expect(newt.c.hp!.cur).toBe(1000 - 8);
    expect(brown.c.hp!.cur).toBe(1000);
  });

  test('a weak monster dies and she gets the kill; a fatal blast ends the game', () => {
    const m = setupHero(7);
    const newt = pinned(m, 'nh:newt', 4, 5, 3);
    const xp = getPlayer(m.state).c.experience!.points;
    const id = giveWand(m, 'nh:wand_of_magic_missile', 2);
    const msgs = breakIt(m, id);
    expect(msgs).toContain('You are caught in the magical blast!');
    expect(msgs).toContain('You kill the newt!');
    expect(gone(m, newt.id)).toBe(true);
    expect(getPlayer(m.state).c.experience!.points).toBeGreaterThan(xp);

    const d = setupHero(8);
    getPlayer(d.state).c.hp = { cur: 5, max: 5 };
    const did = giveWand(d, 'nh:wand_of_lightning', 3);
    const dm = breakIt(d, did);
    expect(dm).toContain('You are caught in the ball of lightning!');
    expect(d.state.gameOver).toMatchObject({
      kind: 'died',
      killer: '!@killer.explode.own.elec',
    });
  });
});

describe('the other wands: an explosion, then each square', () => {
  test('striking: a wall of force; a closed door next to her crashes open', () => {
    const rows = ['-----', '|...|', '|.@+.', '|...|', '-----'];
    for (let seed = 1; seed <= 3; seed++) {
      const m = setupHero(seed, rows);
      const id = giveWand(m, 'nh:wand_of_striking', 2);
      const msgs = breakIt(m, id);
      expect(msgs[1]).toBe('A wall of force smashes down around you!');
      expect(msgs).toContain('You are caught in the magical blast!');
      expect(msgs).toContain('The door crashes open!');
      expect(terrainIdAt(m.level, 3, 2)).toBe(T.doorway);
      expect(hpOf(m)).toBeLessThan(500); // the blast, then d(1 + spe, 6) for her
    }
  });

  test('digging: pits all around her and under her (few charges)', () => {
    const m = setupHero(1);
    const id = giveWand(m, 'nh:wand_of_digging', 2);
    breakIt(m, id);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) expect(trapAt(m.level, 5 + dx, 5 + dy)?.def).toBe(TRAP.pit);
    expect(utrap(m.ctx as unknown as Ctx)?.type).toBe('pit');
    // do_break_wand() does not makeknown() a wand of digging
    expect(isKnown(m.state, engine.registry, 'nh:wand_of_digging')).toBe(false);
  });

  test('digging with many charges makes holes too; walls next to her become doorways', () => {
    const rows = ROOM.map((r) => r.replace('@', '.'));
    rows[5] = '|........@|';
    let holes = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const m = setupHero(seed, rows);
      const id = giveWand(m, 'nh:wand_of_digging', 30);
      breakIt(m, id);
      for (const y of [4, 5, 6]) {
        expect(terrainIdAt(m.level, 10, y)).toBe(T.doorway);
        expect(trapAt(m.level, 10, y)).toBeUndefined(); // core keeps traps off doorways
      }
      const lv = m.state.levels['dlvl1']!;
      for (const t of lv.traps) if (t.def === TRAP.hole) holes++;
    }
    expect(holes).toBeGreaterThan(0);
  });

  test('teleportation: the monsters next to her are sent away', () => {
    let moved = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const m = setupHero(seed);
      const a = pinned(m, 'nh:newt', 4, 5);
      const b = pinned(m, 'nh:newt', 6, 6);
      const id = giveWand(m, 'nh:wand_of_teleportation', 2);
      breakIt(m, id);
      for (const [mon, x, y] of [
        [a, 4, 5],
        [b, 6, 6],
      ] as const)
        if (mon.c.pos && (mon.c.pos.x !== x || mon.c.pos.y !== y)) moved++;
    }
    // rloc() may put one back on its own square now and then
    expect(moved).toBeGreaterThanOrEqual(6);
  });

  test('create monster: monsters appear around her', () => {
    const m = setupHero(2);
    const count = (): number => Object.values(m.state.entities).filter((e) => e?.c.monster).length;
    const before = count();
    const id = giveWand(m, 'nh:wand_of_create_monster', 2);
    breakIt(m, id);
    expect(count()).toBeGreaterThan(before);
  });
});

describe('magical traps blow up', () => {
  const ROW = ['---------', '|@......|', '---------'];
  test('cancellation zapped at a magic trap or a teleportation trap explodes it', () => {
    for (const def of [TRAP.magic, TRAP.tele] as DefId[]) {
      for (let seed = 1; seed <= 3; seed++) {
        const m = setupHero(seed, ROW);
        m.level.traps.push({ def, x: 4, y: 1, seen: true });
        const newt = pinned(m, 'nh:newt', 5, 1);
        const id = giveWand(m, 'nh:wand_of_cancellation', 3);
        const msgs = texts(run(m.state, (ctx) => weffects(ctx, ctx.state.playerId, id, 'e')));
        expect(trapAt(m.level, 4, 1)).toBeUndefined();
        expect(msgs).toContain('Boom!');
        expect(msgs).toContain('The newt is caught in the magical blast!');
        expect(newt.c.hp!.cur).toBeLessThanOrEqual(1000 - 12); // 20 + d(3, 6), maybe halved
        expect(hpOf(m)).toBe(500); // two squares away
        expect(isKnown(m.state, engine.registry, 'nh:wand_of_cancellation')).toBe(true);
      }
    }
  });

  test('digging down on a level teleporter blows it up instead of digging', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const m = setupHero(seed, ROW);
      m.level.traps.push({ def: TRAP.levelTele, x: 1, y: 1, seen: true });
      const id = giveWand(m, 'nh:wand_of_digging', 3);
      const msgs = texts(run(m.state, (ctx) => weffects(ctx, ctx.state.playerId, id, 'down')));
      expect(msgs).toContain('You are caught in the magical blast!');
      expect(trapAt(m.level, 1, 1)).toBeUndefined();
      expect(m.state.currentLevel).toBe('dlvl1');
      expect(heroPos(m)).toEqual({ x: 1, y: 1 });
      const lost = 500 - hpOf(m);
      expect(lost).toBeGreaterThanOrEqual(23);
      expect(lost).toBeLessThanOrEqual(38);
    }
  });

  test('an explosion she cannot see is only heard', () => {
    const m = setupHero(1, ['---------', '|@......|', '---------', '', '', '', '         ']);
    const msgs = texts(
      run(m.state, (ctx) => explode(ctx, 4, 5, { trap: true, by: 'hero' }, 10, 'magical')),
    );
    expect(msgs).toContain('You hear a blast.');
    expect(msgs).not.toContain('Boom!');
    expect(itemsAt(engine.registry, m.state, 'dlvl1', 4, 5)).toEqual([]);
  });
});

describe('the wand of opening frees a monster from a bear trap', () => {
  test('an adjacent one is grateful now and then (reward_untrap(), 1 in 2 tried)', () => {
    let grateful = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = setupHero(seed, ['---------', '|@......|', '---------']);
      m.level.traps.push({ def: TRAP.bear, x: 2, y: 1, seen: true });
      const jackal = addMon(m.state, 'nh:jackal', 2, 1);
      m.state.entities[String(jackal)]!.c.actor!.speed = 0;
      setMtrapped(m.ctx as unknown as Ctx, jackal, true);
      const id = giveWand(m, 'nh:wand_of_opening', 3);
      const msgs = texts(run(m.state, (ctx) => weffects(ctx, ctx.state.playerId, id, 'e')));
      expect(msgs[0]).toBe('The jackal is released from the bear trap.');
      expect(isMtrapped(m.ctx as unknown as Ctx, jackal)).toBe(false);
      if (msgs.includes('The jackal is grateful.')) {
        grateful++;
        expect(m.state.entities[String(jackal)]!.c.monster!.peaceful).toBe(true);
      }
    }
    expect(grateful).toBeGreaterThan(0);
    expect(grateful).toBeLessThan(20);
  });
});
