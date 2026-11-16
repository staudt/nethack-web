// m17 step 4: demons and hell hounds. The rows (hell hound pup, hell hound, lemure, horned and
// barbed devils, Juiblex, Orcus, Baalzebub, Asmodeus), demons gating in demons (msummon(),
// dprince(), dlord(), ndemon()), the demon court, the starting wands, the princes' attacks
// (Juiblex's diseased engulf, Baalzebub's stunning gaze, Asmodeus's frost up close and from afar),
// the barbed devil's barbs, the lemure's regeneration, the new chat sounds and a demon form's
// demon pet. Outcomes are found by burning RNG draws (a seed search) with pinned monsters.
// ref: src/minion.c msummon(), dprince(), dlord(), ndemon(); src/mhitu.c summonmu(), gulpmu(),
// gazemu(); src/mcastu.c castmu(), buzzmu(); src/makemon.c m_initweap(), m_initinv();
// src/teleport.c noteleport_level(); src/uhitm.c demonpet(), mhitm_ad_stck()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  sortedIds,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon, vanillaMod } from '../src/index';
import { mkclass } from '../src/generation';
import { heroAttack, monsterAttack } from '../src/combat';
import { castmu } from '../src/mcastu';
import { domonnoise } from '../src/chat';
import { gazemu, gulpmu } from '../src/mhitu';
import { buzzmu } from '../src/mthrowu';
import { dlord, dprince, msummon } from '../src/minion';
import { monRegen, setCancelled } from '../src/mstate';
import { M_SEEN, monstseesu } from '../src/musestate';
import { polymon } from '../src/polyself';
import { isNdemon } from '../src/mondata';
import { P, hasProp, setIntrinsic } from '../src/props';
import { hungerData } from '../src/hunger';
import { ustuck } from '../src/hackmove';
import { uswallow } from '../src/engulfstate';
import { noteleportLevel } from '../src/teleport';
import { tele } from '../src/trap';
import { addMon } from './helpers';
import { defs, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'dm-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'dm-probe:run',
      labelKey: 'dm-probe',
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

/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  const r = engine.step(state, { type: 'mod', action: 'dm-probe:run' });
  return r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}

/** Every outcome of `fn` over the first `tries` RNG offsets, each on a copy of `state`. */
function outcomes(
  state: GameState,
  fn: (ctx: Ctx) => void,
  tries = 300,
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

const ROOM = [
  '...............',
  '...............',
  '...............',
  '...@...........',
  '...............',
  '...............',
];

/** A lit room, the hero at (3,3) with 500 HP and a pinned `def` at (x,y); in Gehennom or not. */
function setup(def: string, x = 4, y = 3, hell = true) {
  const s = levelSetup(ROOM);
  if (hell) getLevel(s.state).dungeon = 'nh:gehennom';
  const h = getPlayer(s.state);
  h.c.hp = { cur: 500, max: 500 };
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: 200, max: 200 };
  e.c.actor!.speed = 0;
  e.c.monster!.level = Math.min(50, defs.monster(def as DefId).level);
  s.step({ type: 'wait' }); // see the level
  return { s, id };
}

const monsOn = (st: GameState): Entity[] =>
  sortedIds(st)
    .map((i) => st.entities[String(i)]!)
    .filter((e) => e.c.monster && e.id !== st.playerId && e.c.pos);
const atk = (at: AttackDef['at'], ad: string, n: number, d: number): AttackDef => ({
  at,
  ad,
  n,
  d,
});

describe('the rows', () => {
  test("C's order and proper names: the princes have no article", () => {
    const ids: string[] = defs.monsters.map((m) => m.id);
    const order = (a: string, b: string): boolean => ids.indexOf(a) < ids.indexOf(b);
    expect(order('nh:hell_hound_pup', 'nh:hell_hound')).toBe(true);
    expect(order('nh:imp', 'nh:lemure') && order('nh:lemure', 'nh:quasit')).toBe(true);
    const demons = ['nh:water_demon', 'nh:horned_devil', 'nh:barbed_devil', 'nh:juiblex'];
    demons.push('nh:orcus', 'nh:baalzebub', 'nh:asmodeus');
    for (let i = 1; i < demons.length; i++) expect(order(demons[i - 1]!, demons[i]!)).toBe(true);
    expect(
      render({
        key: 'minion.appears',
        params: { mon: '=@nh:orcus', cloud: '@minion.cloud', what: '@minion.smoke' },
      }),
    ).toBe('Orcus appears in a cloud of smoke!');
  });

  test('the hell hounds and devils are made only in Gehennom; the princes never at random', () => {
    for (const id of ['nh:hell_hound_pup', 'nh:hell_hound', 'nh:lemure', 'nh:horned_devil'])
      expect(defs.monster(id as DefId).genFlags).toContain('hell');
    for (const id of ['nh:juiblex', 'nh:orcus', 'nh:baalzebub', 'nh:asmodeus'])
      expect(defs.monster(id as DefId).genFlags).toEqual(expect.arrayContaining(['nogen', 'uniq']));
  });

  test('mkclass_aligned(): only demons of the alignment sign asked for', () => {
    const { s } = setup('nh:newt');
    run(s.state, (ctx) => {
      for (let i = 0; i < 200; i++) {
        const law = mkclass(ctx, '&', 30, [], { atyp: 1 });
        if (law) expect(law.alignment).toBeGreaterThan(0);
        const cha = mkclass(ctx, '&', 30, [], { atyp: -1 });
        if (cha) expect(cha.alignment).toBeLessThan(0);
      }
    });
  });
});

describe('starting gear', () => {
  test("Orcus's wand of death, Asmodeus's wands of cold and fire, the horned devil's trident or bullwhip", () => {
    const { s } = setup('nh:newt');
    const carried = (name: string, k: number): string[] => {
      let kinds: string[] = [];
      run(structuredClone(s.state), (ctx) => {
        for (let i = 0; i < k; i++) ctx.rng.rn2(2);
        const id = makemon(ctx, defs.monster(name as DefId), { x: 10, y: 1 });
        kinds = inventoryOf(ctx.state, id!).map((o) => o.def);
      });
      return kinds;
    };
    expect(carried('nh:orcus', 0)).toContain('nh:wand_of_death');
    expect(carried('nh:asmodeus', 0)).toEqual(
      expect.arrayContaining(['nh:wand_of_cold', 'nh:wand_of_fire']),
    );
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const inv = carried('nh:horned_devil', k);
      const w = inv.filter((d) => d === 'nh:trident' || d === 'nh:bullwhip');
      expect(w.length).toBeGreaterThan(0);
      for (const d of w) seen.add(d);
    }
    expect([...seen].sort()).toEqual(['nh:bullwhip', 'nh:trident']);
  });
});

describe('msummon()', () => {
  test('a horned devil gates in demons of its alignment next to her: "A horned devil appears in a cloud of smoke!"', () => {
    const { s, id } = setup('nh:horned_devil');
    const before = monsOn(s.state).length;
    let own = 0;
    for (const o of outcomes(
      s.state,
      (ctx) => void msummon(ctx, ctx.state.entities[String(id)]!),
      120,
    )) {
      const now = monsOn(o.state);
      const added = now.filter((e) => e.id !== id && e.id > id);
      expect(now.length).toBe(before + added.length);
      for (const e of added) {
        const def = defs.monster(e.def);
        expect(def.flags).toContain('demon');
        expect(def.alignment).toBeGreaterThan(0); // lawful, as the devil
        const hp = getPlayer(o.state).c.pos!;
        expect(Math.max(Math.abs(e.c.pos!.x - hp.x), Math.abs(e.c.pos!.y - hp.y))).toBe(1);
      }
      if (o.text.includes('A horned devil appears in a cloud of smoke!')) own++;
    }
    // its own kind 5 times in 6 when no lord comes (19 in 20)
    expect(own).toBeGreaterThan(80);
  });

  test('Juiblex brings chaotic demons: a prince now and then, Yeenoghu, mostly minor demons; never a second Juiblex', () => {
    const { s, id } = setup('nh:juiblex');
    const got = new Set<string>();
    let orcus = 0;
    for (const o of outcomes(
      s.state,
      (ctx) => void msummon(ctx, ctx.state.entities[String(id)]!),
      400,
    )) {
      for (const e of monsOn(o.state)) if (e.id !== id) got.add(e.def);
      if (o.text.includes('Orcus appears in a cloud of smoke!')) orcus++;
    }
    // chaotic: a prince 1 in 50 (Orcus or Demogorgon), a lord 1 in 20 (Yeenoghu: Juiblex is
    // here), else a chaotic minor demon (m18 step 4)
    expect(got.has('nh:juiblex')).toBe(false);
    for (const k of got) expect(defs.monster(k as DefId).alignment).toBeLessThan(0);
    expect(got.has('nh:yeenoghu')).toBe(true);
    expect(orcus).toBeGreaterThan(0);
    const minor = [...got].filter((k) => isNdemon(defs.monster(k as DefId)));
    expect(minor.length).toBeGreaterThan(5);
    // with every chaotic prince and lord about, only minor demons come
    addMon(s.state, 'nh:orcus', 12, 5);
    addMon(s.state, 'nh:demogorgon', 12, 4);
    addMon(s.state, 'nh:yeenoghu', 12, 3);
    let some = 0;
    for (const o of outcomes(
      s.state,
      (ctx) => void msummon(ctx, ctx.state.entities[String(id)]!),
      200,
    )) {
      const added = monsOn(o.state).slice(4);
      if (added.length) some++;
      for (const e of added) expect(isNdemon(defs.monster(e.def))).toBe(true);
    }
    expect(some).toBeGreaterThan(150);
  });

  test('dprince() and dlord() reach each prince and lord of the alignment; a gone kind is never picked', () => {
    const { s } = setup('nh:newt');
    run(s.state, (ctx) => {
      const pick = (f: () => DefId | null): string[] => {
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) seen.add(String(f()));
        return [...seen].sort();
      };
      expect(pick(() => dprince(ctx, 1))).toEqual([
        'nh:asmodeus',
        'nh:baalzebub',
        'nh:dispater',
        'nh:geryon',
      ]);
      expect(pick(() => dprince(ctx, -1))).toEqual(['nh:demogorgon', 'nh:orcus']);
      expect(pick(() => dprince(ctx, undefined))).toHaveLength(6);
      expect(pick(() => dlord(ctx, -1))).toEqual(['nh:juiblex', 'nh:yeenoghu']);
    });
    addMon(s.state, 'nh:orcus', 12, 5);
    addMon(s.state, 'nh:demogorgon', 12, 4);
    addMon(s.state, 'nh:juiblex', 12, 3);
    addMon(s.state, 'nh:yeenoghu', 12, 2);
    addMon(s.state, 'nh:geryon', 13, 5);
    run(s.state, (ctx) => {
      for (let i = 0; i < 100; i++) {
        // lawful: the three princes left
        expect(['nh:baalzebub', 'nh:asmodeus', 'nh:dispater']).toContain(dprince(ctx, 1));
        // chaotic: every prince and lord is here: a chaotic minor demon (or none found)
        for (const d of [dprince(ctx, -1), dlord(ctx, -1)]) {
          if (d === null) continue;
          expect(isNdemon(defs.monster(d))).toBe(true);
          expect(defs.monster(d).alignment).toBeLessThan(0);
        }
        // no lawful lord: a lawful minor demon (or none found)
        const l = dlord(ctx, 1);
        expect([null, 'nh:horned_devil', 'nh:erinys', 'nh:barbed_devil']).toContain(l);
      }
    });
  });

  test('the gate: an adjacent demon summons about 1 time in 10 in Gehennom, 1 in 16 elsewhere; never when cancelled', () => {
    const rate = (hell: boolean, cancel = false): number => {
      const { s, id } = setup('nh:horned_devil', 4, 3, hell);
      if (cancel) run(s.state, (ctx) => setCancelled(ctx, id));
      const n = 600;
      let got = 0;
      for (const o of outcomes(s.state, (ctx) => monsterAttack(ctx, id), n))
        if (monsOn(o.state).length > 1) got++;
      return got / n;
    };
    const inHell = rate(true);
    const outside = rate(false);
    expect(inHell).toBeGreaterThan(0.05);
    expect(inHell).toBeLessThan(0.13);
    expect(outside).toBeGreaterThan(0.025);
    expect(outside).toBeLessThan(0.085);
    expect(rate(true, true)).toBe(0);
  });
});

describe('the demon court', () => {
  test('in Gehennom no one but a lord or prince teleports while one is on the level', () => {
    const { s, id } = setup('nh:juiblex', 10, 1);
    const devil = addMon(s.state, 'nh:horned_devil', 12, 5);
    const level = getLevel(s.state);
    const ctx = { state: s.state, defs };
    expect(noteleportLevel(ctx, level, s.state.playerId)).toBe(true);
    expect(noteleportLevel(ctx, level, devil)).toBe(true);
    expect(noteleportLevel(ctx, level, id)).toBe(false);
    const t = run(s.state, (c) => tele(c));
    expect(t).toContain('A mysterious force prevents you from teleporting!');
    // outside Gehennom there is no court
    level.dungeon = 'nh:main';
    expect(noteleportLevel(ctx, level, s.state.playerId)).toBe(false);
    // and none once the lord is gone
    level.dungeon = 'nh:gehennom';
    delete s.state.entities[String(id)];
    expect(noteleportLevel(ctx, level, s.state.playerId)).toBe(false);
  });
});

describe("the princes' attacks", () => {
  test('Juiblex engulfs her and makes her sick', () => {
    const { s, id } = setup('nh:juiblex');
    const engl = defs.monster('nh:juiblex' as DefId).attacks[0]!;
    expect(engl).toMatchObject({ at: 'engulf', ad: 'dise' });
    run(s.state, (ctx) => void gulpmu(ctx, ctx.state.entities[String(id)]!, engl));
    expect(uswallow({ state: s.state } as Ctx)?.mon).toBe(id);
    expect(hungerData({ state: s.state } as Ctx).sick).toBeDefined();
  });

  test('Baalzebub stares piercingly: she is stunned', () => {
    const { s, id } = setup('nh:baalzebub');
    const gaze = defs.monster('nh:baalzebub' as DefId).attacks[1]!;
    expect(gaze).toMatchObject({ at: 'gaze', ad: 'stun' });
    const hit = outcomes(
      s.state,
      (ctx) => void gazemu(ctx, ctx.state.entities[String(id)]!, gaze),
      40,
    ).find((o) => o.text.includes('Baalzebub stares piercingly at you!'));
    expect(hit).toBeDefined();
    expect(hasProp(getPlayer(hit!.state), P.STUNNED)).toBe(true);
  });

  test('Asmodeus up close: "You\'re covered in frost.", no damage while she resists cold', () => {
    const { s, id } = setup('nh:asmodeus');
    const cold = defs.monster('nh:asmodeus' as DefId).attacks[1]!;
    expect(cold).toMatchObject({ at: 'magic', ad: 'cold' });
    const hp0 = getPlayer(s.state).c.hp!.cur;
    const cast = (): { state: GameState; text: string[] } =>
      outcomes(s.state, (ctx) => void castmu(ctx, id, cold, true, true), 20).find((o) =>
        o.text.includes("You're covered in frost."),
      )!;
    // the Valkyrie resists cold
    expect(hasProp(getPlayer(s.state), P.COLD_RES)).toBe(true);
    const resisted = cast();
    expect(resisted.text).toContain('But you resist the effects.');
    expect(getPlayer(resisted.state).c.hp!.cur).toBe(hp0);
    setIntrinsic(getPlayer(s.state), P.COLD_RES, false);
    const frost = cast();
    expect(frost.text).not.toContain('But you resist the effects.');
    expect(getPlayer(frost.state).c.hp!.cur).toBeLessThan(hp0);
    // the fire version (no such monster yet): "You're enveloped in flames."
    const flames = outcomes(
      s.state,
      (ctx) => void castmu(ctx, id, atk('magic', 'fire', 6, 6), true, true),
      20,
    );
    expect(flames.some((o) => o.text.includes("You're enveloped in flames."))).toBe(true);
  });

  test('Asmodeus from afar: "Asmodeus zaps you with a bolt of cold!"; not once he has seen her resist', () => {
    const { s, id } = setup('nh:asmodeus', 9, 3);
    const cold = defs.monster('nh:asmodeus' as DefId).attacks[1]!;
    const clear = (): boolean => true;
    const zaps = outcomes(s.state, (ctx) => void buzzmu(ctx, id, cold, clear), 30).filter((o) =>
      o.text.includes('Asmodeus zaps you with a bolt of cold!'),
    );
    // 2 times in 3 when lined up
    expect(zaps.length).toBeGreaterThan(12);
    expect(zaps.length).toBeLessThan(28);
    run(s.state, (ctx) => monstseesu(ctx, M_SEEN.cold));
    for (const o of outcomes(s.state, (ctx) => void buzzmu(ctx, id, cold, clear), 30))
      expect(o.text).not.toContain('Asmodeus zaps you with a bolt of cold!');
  });

  test('the barbed devil: "The barbs stick to you!"', () => {
    const { s, id } = setup('nh:barbed_devil');
    const stuck = outcomes(s.state, (ctx) => monsterAttack(ctx, id), 60).find((o) =>
      o.text.includes('The barbs stick to you!'),
    );
    expect(stuck).toBeDefined();
    expect(ustuck({ state: stuck!.state } as Ctx)).toBe(id);
  });

  test('a lemure regenerates every turn', () => {
    const { s, id } = setup('nh:lemure');
    const e = s.state.entities[String(id)]!;
    e.c.hp = { cur: 1, max: 20 };
    s.state.turn = 6; // not a multiple of 20 plus one
    run(s.state, (ctx) => monRegen(ctx, id));
    expect(e.c.hp.cur).toBe(2);
  });
});

describe('chat and demon pets', () => {
  test('Juiblex gurgles; a hostile Asmodeus cusses, a tame one says we are doomed (a peaceful one asks a bribe: m17.covetous)', () => {
    const j = setup('nh:juiblex');
    expect(run(j.s.state, (ctx) => void domonnoise(ctx, j.id))).toEqual(['Juiblex gurgles.']);
    const a = setup('nh:asmodeus');
    expect(run(a.s.state, (ctx) => void domonnoise(ctx, a.id)).length).toBeGreaterThan(0);
    a.s.state.entities[String(a.id)]!.c.monster!.peaceful = true;
    a.s.state.entities[String(a.id)]!.c.monster!.tame = 10;
    expect(run(a.s.state, (ctx) => void domonnoise(ctx, a.id))).toEqual(['"We\'re all doomed."']);
  });

  test('a demon form without a weapon now and then calls a tame demon: "Some hell-p has arrived!"', () => {
    const { s, id } = setup('nh:newt');
    for (const o of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(o.id)];
    run(s.state, (ctx) => polymon(ctx, 'nh:horned_devil' as DefId, false));
    const target = s.state.entities[String(id)]!;
    target.c.hp = { cur: 10000, max: 10000 };
    const help = outcomes(s.state, (ctx) => void heroAttack(ctx, id), 80).find((o) =>
      o.text.includes('Some hell-p has arrived!'),
    );
    expect(help).toBeDefined();
    const pets = monsOn(help!.state).filter((e) => e.id !== id);
    expect(pets.length).toBe(1);
    expect(pets[0]!.c.monster!.tame).toBeGreaterThan(0);
    expect(defs.monster(pets[0]!.def).flags).toContain('demon');
  });
});
