// m19 step 6: the instruments. Every instrument applied: "Improvise?" (never for a drum), the
// magic flute's sleep in range, the wooden flute and harp's snake charming and nymph calming
// (and their failure at a low level), the tooled horn's wake and fright, the magic harp's taming,
// the mundane twin of an empty or impaired magic instrument, the fire and frost horns' rays (a
// direction; at herself; none), the drum of earthquake's chasms, collapsing doors and fallen
// fountains in range, and monsters blowing horns at her, picking them up and burning off slime
// with a fire horn or a potion of oil. Monsters are pinned (speed 0); random rolls are bounded
// over many seeds. ref: src/music.c do_play_instrument(), do_improvisation(),
// put_monsters_to_sleep(), charm_snakes(), calm_nymphs(), charm_monsters(), awaken_monsters(),
// do_earthquake(), do_pit(); src/invent.c consume_obj_charge(); src/muse.c find_offensive(),
// use_offensive(), mplayhorn(), muse_unslime(), searches_for_item()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { findOffensive, munslime, useOffensive } from '../src/muse';
import { searchesForItem } from '../src/musestate';
import { isFleeing } from '../src/monflee';
import { isFrozen } from '../src/mstate';
import { isKnown } from '../src/o_init';
import { P, setIntrinsic } from '../src/props';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { isMtrapped, utrap } from '../src/trapstate';
import { messagesEn } from '../src/messages.en';
import { addMon } from './helpers';
import { levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mu',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mu:run',
      labelKey: 'mu',
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
/** Runs `fn` with the engine's own Ctx and returns the step. */
function run(s: { state: GameState }, fn: (ctx: Ctx) => void): StepResult {
  probe.fn = fn;
  return engine.step(s.state, { type: 'mod', action: 'mu:run' as DefId });
}

/** A lit 41 x 21 room, the hero in its middle (20, 10). */
const ROOM = Array.from({ length: 21 }, (_, y) =>
  y === 0 || y === 20 ? ' '.repeat(41) : ` ${'.'.repeat(39)} `,
).map((r, y) => (y === 10 ? `${r.slice(0, 20)}@${r.slice(21)}` : r));
const HX = 20;
const HY = 10;

type S = ReturnType<typeof levelSetup>;
function make(seed = 1, ulevel = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  s.step({ type: 'wait' });
  const h = getPlayer(s.state);
  if (h.c.experience) h.c.experience.level = ulevel;
  if (h.c.attributes) Object.assign(h.c.attributes, { str: 16, dex: 14 });
  return s;
}
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
const msgs = (r: { events: readonly GameEvent[] }): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg'
      ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) }, messagesEn)]
      : [],
  );

/** A new carried object (uncursed unless given), with `spe` charges. */
function carry(s: S, otyp: string, spe?: number, buc?: 'blessed' | 'cursed'): EntityId {
  const id = s.carry(otyp);
  const it = ent(s.state, id)!.c.item!;
  it.buc = buc ?? 'uncursed';
  if (spe !== undefined) it.spe = spe;
  return id;
}
/** A pinned monster (speed 0) at (x, y) with `hp` hit points. */
function pin(
  s: S,
  def: string,
  x: number,
  y: number,
  o: { asleep?: boolean; hp?: number; peaceful?: boolean } = {},
): EntityId {
  const id = addMon(s.state, def, x, y, {
    asleep: o.asleep ?? false,
    peaceful: o.peaceful ?? false,
  });
  const e = ent(s.state, id)!;
  e.c.actor!.speed = 0;
  e.c.hp = { cur: o.hp ?? 5, max: o.hp ?? 5 };
  return id;
}
const apply = (s: S, item: EntityId): StepResult =>
  engine.stepAll(s.state, { type: 'mod', action: 'nh:apply' as DefId, args: { item } });
const answer = (s: S, value: unknown): StepResult =>
  engine.stepAll(s.state, {
    type: 'answer',
    promptId: s.state.pendingPrompt!.prompt.id,
    value: value as never,
  });
/** Applies `item` and says yes to "Improvise?"; the messages of both. */
function improvise(s: S, item: EntityId): { r: StepResult; out: string[] } {
  const r1 = apply(s, item);
  expect(r1.prompt?.id).toBe('music-improvise');
  const r2 = answer(s, true);
  return { r: r2, out: [...msgs(r1), ...msgs(r2)] };
}
const mon = (s: S, id: EntityId) => ent(s.state, id)?.c.monster;

const INSTRUMENTS = [
  'nh:wooden_flute',
  'nh:magic_flute',
  'nh:tooled_horn',
  'nh:frost_horn',
  'nh:fire_horn',
  'nh:wooden_harp',
  'nh:magic_harp',
  'nh:bugle',
  'nh:leather_drum',
  'nh:drum_of_earthquake',
];

describe('playing', () => {
  test('Apply is offered on every instrument; drums are never asked "Improvise?"', () => {
    for (const otyp of INSTRUMENTS) {
      const s = make();
      const id = carry(s, otyp, 4);
      const offers = engine
        .query(s.state)
        .actionsFor({ kind: 'item', id })
        .map((o) => o.action);
      expect(offers).toContainEqual({ type: 'mod', action: 'nh:apply', args: { item: id } });
      const r = apply(s, id);
      if (otyp.endsWith('drum') || otyp === 'nh:drum_of_earthquake')
        expect(r.prompt?.id).not.toBe('music-improvise');
      else expect(r.prompt?.id).toBe('music-improvise');
    }
  });

  test('the leather drum beats a deafening row and wakes monsters within ulevel * 40', () => {
    const s = make(1, 1);
    const near = pin(s, 'nh:jackal', HX + 6, HY, { asleep: true }); // 36 < 40
    const far = pin(s, 'nh:jackal', HX + 7, HY, { asleep: true }); // 49
    const out = msgs(apply(s, carry(s, 'nh:leather_drum')));
    expect(out).toContain('You beat a deafening row!');
    expect(mon(s, near)?.asleep).toBe(false);
    expect(mon(s, far)?.asleep).toBe(true);
  });

  test('"Improvise?" cancelled is "Never mind." and takes no time', () => {
    const s = make();
    const id = carry(s, 'nh:magic_flute', 3);
    apply(s, id);
    const turn = s.state.turn;
    expect(msgs(answer(s, null))).toEqual(['Never mind.']);
    expect(s.state.turn).toBe(turn);
    expect(ent(s.state, id)?.c.item?.spe).toBe(3);
  });
});

describe('the flutes', () => {
  test('a magic flute puts monsters within ulevel * 5 to sleep for 10d10 turns', () => {
    const s = make(1, 1);
    const a = pin(s, 'nh:jackal', HX + 2, HY); // 4
    const b = pin(s, 'nh:jackal', HX + 1, HY + 1); // 2
    const c = pin(s, 'nh:jackal', HX + 2, HY + 1); // 5: out of range
    const flute = carry(s, 'nh:magic_flute', 5);
    const { out } = improvise(s, flute);
    expect(out).toContain('You produce soft music.');
    for (const id of [a, b]) {
      expect(mon(s, id)?.asleep).toBe(true);
      expect(isFrozen({ state: s.state }, id)).toBe(true);
    }
    expect(mon(s, c)?.asleep).toBe(false);
    expect(isFrozen({ state: s.state }, c)).toBe(false);
    expect(ent(s.state, flute)?.c.item?.spe).toBe(4);
  });

  test('a magic flute without charges, or played stunned, toots as a wooden flute', () => {
    const s = make(1, 1);
    const a = pin(s, 'nh:jackal', HX + 1, HY);
    const flute = carry(s, 'nh:magic_flute', 0);
    const { out } = improvise(s, flute);
    // rn2(Dex) + ulevel > 25 never holds at level 1: it toots
    expect(out).toContain('The flute toots.');
    expect(mon(s, a)?.asleep).toBe(false);
    expect(ent(s.state, flute)?.c.item?.spe).toBe(0);

    const s2 = make(1, 1);
    const b = pin(s2, 'nh:jackal', HX + 1, HY);
    const f2 = carry(s2, 'nh:magic_flute', 4);
    setIntrinsic(getPlayer(s2.state), P.STUNNED, true);
    // stunned: no "Improvise?", the mundane twin, no charge used
    const out2 = msgs(apply(s2, f2));
    expect(out2).toContain('The flute toots.');
    expect(mon(s2, b)?.asleep).toBe(false);
    expect(ent(s2.state, f2)?.c.item?.spe).toBe(4);
  });

  test('a skilled wooden flute charms snakes within ulevel * 3 (peaceful, not tame)', () => {
    const s = make(1, 26); // rn2(Dex) + 26 > 25 always
    const snake = pin(s, 'nh:snake', HX + 5, HY);
    const jackal = pin(s, 'nh:jackal', HX + 4, HY);
    const { out } = improvise(s, carry(s, 'nh:wooden_flute'));
    expect(out).toContain('The flute trills.');
    expect(out).toContain('The snake freezes, then sways with the music, and now seems quieter.');
    expect(mon(s, snake)?.peaceful).toBe(true);
    expect(mon(s, snake)?.tame).toBeUndefined();
    expect(mon(s, jackal)?.peaceful).toBe(false);
    // at level 1 it only toots
    const s2 = make(1, 1);
    const snake2 = pin(s2, 'nh:snake', HX + 1, HY);
    expect(improvise(s2, carry(s2, 'nh:wooden_flute')).out).toContain('The flute toots.');
    expect(mon(s2, snake2)?.peaceful).toBe(false);
  });
});

describe('the harps', () => {
  test('a skilled wooden harp calms nymphs; unskilled it twangs', () => {
    const s = make(1, 26);
    const nymph = pin(s, 'nh:water_nymph', HX + 3, HY, { asleep: true });
    const { out } = improvise(s, carry(s, 'nh:wooden_harp'));
    expect(out).toContain('Your harp produces a lilting melody.');
    expect(out).toContain('The water nymph listens cheerfully to the music, then seems quieter.');
    expect(mon(s, nymph)?.peaceful).toBe(true);
    expect(mon(s, nymph)?.asleep).toBe(false);
    const s2 = make(1, 1);
    const n2 = pin(s2, 'nh:water_nymph', HX + 1, HY);
    expect(improvise(s2, carry(s2, 'nh:wooden_harp')).out).toContain('Your harp twangs.');
    expect(mon(s2, n2)?.peaceful).toBe(false);
  });

  test('a magic harp tames the monsters within (ulevel - 1) / 3 + 1 that fail to resist', () => {
    // level 1: distance 1, the orthogonal neighbours only
    const s = make(1, 1);
    const near = pin(s, 'nh:jackal', HX + 1, HY);
    const diag = pin(s, 'nh:jackal', HX + 1, HY + 1);
    const harp = carry(s, 'nh:magic_harp', 3);
    const { out } = improvise(s, harp);
    expect(out).toContain('The harp produces very attractive music.');
    expect(mon(s, near)?.tame).toBeGreaterThan(0);
    expect(mon(s, diag)?.tame).toBeUndefined();
    expect(ent(s.state, harp)?.c.item?.spe).toBe(2);
    // level 4: distance 2 reaches the diagonal
    const s2 = make(1, 4);
    const d2 = pin(s2, 'nh:jackal', HX + 1, HY + 1);
    improvise(s2, carry(s2, 'nh:magic_harp', 3));
    expect(mon(s2, d2)?.tame).toBeGreaterThan(0);
  });
});

describe('the horns', () => {
  test('the tooled horn wakes monsters within ulevel * 30 and frightens those within a third', () => {
    const s = make(1, 1);
    const scared = pin(s, 'nh:jackal', HX + 2, HY, { asleep: true }); // 4 < 10
    const woken = pin(s, 'nh:jackal', HX + 4, HY, { asleep: true }); // 16 < 30
    const sleeper = pin(s, 'nh:jackal', HX + 6, HY, { asleep: true }); // 36
    const { out } = improvise(s, carry(s, 'nh:tooled_horn'));
    expect(out).toContain('You produce a frightful, grave sound.');
    expect(mon(s, scared)?.asleep).toBe(false);
    expect(isFleeing({ state: s.state }, scared)).toBe(true);
    expect(mon(s, woken)?.asleep).toBe(false);
    expect(isFleeing({ state: s.state }, woken)).toBe(false);
    expect(mon(s, sleeper)?.asleep).toBe(true);
  });

  test('a fire horn asks a direction and its bolt kills a pinned monster in line', () => {
    let kills = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed, 1);
      const target = pin(s, 'nh:jackal', HX + 3, HY, { hp: 5 });
      const horn = carry(s, 'nh:fire_horn', 4);
      const { r, out } = improvise(s, horn);
      expect(r.prompt?.id).toBe('music-horn');
      expect(ent(s.state, horn)?.c.item?.spe).toBe(3); // the charge is used before the prompt
      const r2 = answer(s, 'e');
      expect(out).toContain('You start playing your horn.'); // not yet known
      expect(msgs(r2)).toContain('A bolt of fire blasts out of the horn!');
      expect(r2.events.some((e) => e.type === 'ray' && e.kind === 'fire')).toBe(true);
      expect(isKnown(s.state, engine.registry, 'nh:fire_horn' as DefId)).toBe(true);
      if (!ent(s.state, target)?.c.monster) kills++;
    }
    // 6..11 d6 against 5 hit points: only a missed bolt spares it
    expect(kills).toBeGreaterThanOrEqual(15);
  });

  test('a fire horn at herself burns her; a frost horn chills; no direction: it vibrates', () => {
    const s = make(1, 1);
    const hp0 = getPlayer(s.state).c.hp!.cur;
    improvise(s, carry(s, 'nh:fire_horn', 4));
    const out = msgs(answer(s, 'self'));
    expect(out).toContain("You've set yourself afire!");
    expect(getPlayer(s.state).c.hp!.cur).toBeLessThanOrEqual(hp0 - 12); // d(12, 6)

    const s2 = make(1, 1);
    setIntrinsic(getPlayer(s2.state), P.COLD_RES, true);
    const hp2 = getPlayer(s2.state).c.hp!.cur;
    improvise(s2, carry(s2, 'nh:frost_horn', 4));
    expect(msgs(answer(s2, 'self'))).toContain('You feel a little chill.');
    expect(getPlayer(s2.state).c.hp!.cur).toBe(hp2);

    const s3 = make(1, 1);
    const horn = carry(s3, 'nh:frost_horn', 4);
    improvise(s3, horn);
    const turn = s3.state.turn;
    expect(msgs(answer(s3, null))).toEqual(['The horn vibrates.']);
    expect(s3.state.turn).toBeGreaterThan(turn); // it takes the move
    expect(ent(s3.state, horn)?.c.item?.spe).toBe(3);
    expect(isKnown(s3.state, engine.registry, 'nh:frost_horn' as DefId)).toBe(false);
  });

  test('an empty fire horn plays as a tooled horn', () => {
    const s = make(1, 1);
    const scared = pin(s, 'nh:jackal', HX + 2, HY, { asleep: true });
    const { r, out } = improvise(s, carry(s, 'nh:fire_horn', 0));
    expect(r.prompt).toBeFalsy();
    expect(out).toContain('You produce a frightful, grave sound.');
    expect(isFleeing({ state: s.state }, scared)).toBe(true);
  });
});

describe('the drum of earthquake', () => {
  /** Plays a drum of earthquake at level 13 (force 5: 10 squares, a chasm 1 time in 9). */
  function quake(seed: number) {
    const s = make(seed, 13);
    const door = { x: HX + 3, y: HY - 2 };
    setTerrain(s.state.levels['dlvl1']!, door.x, door.y, T.door_closed);
    const ftn = { x: HX - 4, y: HY + 1 };
    setTerrain(s.state.levels['dlvl1']!, ftn.x, ftn.y, T.fountain);
    const victim = pin(s, 'nh:jackal', HX + 5, HY + 3, { hp: 100 });
    const drum = carry(s, 'nh:drum_of_earthquake', 4);
    const r = apply(s, drum);
    return { s, r, out: msgs(r), door, ftn, victim, drum };
  }

  test('chasms open only within force * 2; what lies in them falls in', () => {
    let pits = 0;
    let doors = 0;
    let fountains = 0;
    let falls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { s, out, door, ftn, victim, drum } = quake(seed);
      expect(out).toContain('You produce a heavy, thunderous rolling!');
      expect(out).toContain('The entire dungeon is shaking around you!');
      expect(ent(s.state, drum)?.c.item?.spe).toBe(3);
      expect(isKnown(s.state, engine.registry, 'nh:drum_of_earthquake' as DefId)).toBe(true);
      const level = s.state.levels['dlvl1']!;
      for (const t of level.traps) {
        expect(t.def).toBe('nh:pit');
        expect(t.seen).toBe(true);
        expect(Math.abs(t.x - HX)).toBeLessThanOrEqual(10);
        expect(Math.abs(t.y - HY)).toBeLessThanOrEqual(10);
        pits++;
      }
      if (terrainIdAt(level, door.x, door.y) === T.doorway) {
        doors++;
        expect(out).toContain('The door collapses.');
      } else expect(terrainIdAt(level, door.x, door.y)).toBe(T.door_closed);
      if (trapAt(level, ftn.x, ftn.y)) {
        fountains++;
        expect(terrainIdAt(level, ftn.x, ftn.y)).toBe(T.floor);
        expect(out).toContain('The fountain falls into a chasm.');
      } else expect(terrainIdAt(level, ftn.x, ftn.y)).toBe(T.fountain);
      const v = ent(s.state, victim)!;
      const vp = v.c.pos!;
      if (trapAt(level, vp.x, vp.y)) {
        falls++;
        expect(isMtrapped({ state: s.state }, victim)).toBe(true);
        expect(v.c.hp!.cur).toBeLessThan(100);
        expect(out).toContain('The jackal falls into a chasm!');
      } else expect(isMtrapped({ state: s.state }, victim)).toBe(false);
      // the hero: a chasm under her traps her
      if (trapAt(level, HX, HY)) {
        expect(utrap({ state: s.state })?.type).toBe('pit');
        expect(out).toContain('You fall into a chasm!');
      }
    }
    // 21 x 21 squares, 1 in 9 (the hero's room is 39 x 19)
    expect(pits / 40).toBeGreaterThan(30);
    expect(pits / 40).toBeLessThan(60);
    expect(doors).toBeGreaterThan(0);
    expect(fountains).toBeGreaterThan(0);
    expect(falls).toBeGreaterThan(0);
  });

  test('an empty drum of earthquake plays as a leather drum', () => {
    const s = make(1, 13);
    const out = msgs(apply(s, carry(s, 'nh:drum_of_earthquake', 0)));
    expect(out).not.toContain('You produce a heavy, thunderous rolling!');
    expect(out.some((m) => /^You (butcher|manage|pull off) an? /.test(m))).toBe(true);
    expect(s.state.levels['dlvl1']!.traps).toHaveLength(0);
  });
});

describe('monsters and horns', () => {
  test('a monster blows its frost horn at her (find_offensive, mplayhorn)', () => {
    const s = make(1, 1);
    const orc = pin(s, 'nh:hill_orc', HX + 3, HY, { hp: 20 });
    const horn = s.give('nh:frost_horn', { carriedBy: orc });
    ent(s.state, horn)!.c.item!.spe = 3;
    const r = run(s, (ctx) => {
      const c = findOffensive(ctx, orc);
      expect(c?.kind).toBe('frost_horn');
      if (c) useOffensive(ctx, orc, c);
    });
    const out = msgs(r);
    expect(out).toContain('The hill orc plays a horn directed at you!');
    expect(r.events.some((e) => e.type === 'ray' && e.kind === 'cold')).toBe(true);
    expect(ent(s.state, horn)?.c.item?.spe).toBe(2);
    expect(isKnown(s.state, engine.registry, 'nh:frost_horn' as DefId)).toBe(true);
    // an empty horn is not chosen
    ent(s.state, horn)!.c.item!.spe = 0;
    run(s, (ctx) => expect(findOffensive(ctx, orc)).toBeNull());
  });

  test('monsters want charged fire and frost horns they can blow', () => {
    const s = make(1, 1);
    const orc = pin(s, 'nh:hill_orc', HX + 3, HY);
    const horn = s.floor('nh:fire_horn');
    run(s, (ctx) => {
      const o = ent(ctx.state, orc)!;
      const h = ent(ctx.state, horn)!;
      h.c.item!.spe = 2;
      expect(searchesForItem(ctx, o, h)).toBe(true);
      h.c.item!.spe = 0;
      expect(searchesForItem(ctx, o, h)).toBe(false);
    });
  });

  test('a slimed monster burns the slime off with a fire horn or a burning potion of oil', () => {
    const s = make(1, 1);
    const orc = pin(s, 'nh:hill_orc', HX + 2, HY, { hp: 60 });
    const horn = s.give('nh:fire_horn', { carriedBy: orc });
    ent(s.state, horn)!.c.item!.spe = 2;
    const out = msgs(
      run(s, (ctx) => expect(munslime(ctx, ent(ctx.state, orc)!, false)).toBe(true)),
    );
    expect(out).toContain('The hill orc plays a horn directed at itself!');
    expect(ent(s.state, horn)?.c.item?.spe).toBe(1);

    const s2 = make(1, 1);
    const orc2 = pin(s2, 'nh:hill_orc', HX + 2, HY, { hp: 60 });
    const oil = s2.give('nh:potion_of_oil', { carriedBy: orc2 });
    ent(s2.state, oil)!.c.item!.quantity = 2;
    const out2 = msgs(
      run(s2, (ctx) => expect(munslime(ctx, ent(ctx.state, orc2)!, false)).toBe(true)),
    );
    expect(out2.some((m) => /^The hill orc ignites a .*potion\.$/.test(m))).toBe(true);
    expect(out2.some((m) => /^He quaffs a burning .*potion/.test(m))).toBe(true);
    expect(out2).toContain("The hill orc's slime is burned away!");
    expect(ent(s2.state, oil)?.c.item?.quantity).toBe(1); // one of the two is used up
    expect(ent(s2.state, oil)?.c.item?.lit).toBeFalsy();
  });
});
