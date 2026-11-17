// m20 step 3: the hero's artifact attacks. spec_applies() for every bane kind and element,
// spec_abon()/spec_dbon() ranges, dmgval()'s halved bonuses, artifact_hit() through the melee
// blow (knownHitum() with a forced d20) and the throw: the brands, Mjollnir's lightning,
// Magicbane's four effects, Vorpal Blade and the Tsurugi of Muramasa on a natural 1, the life
// drainers; the artifact hitting the hero; Mjollnir thrown and returning; Cleaver's three blows.
// Pinned monsters (speed 0, many hit points) and outcomes over many blows, never a lucky seed.
// ref: src/artifact.c spec_applies(), spec_abon(), spec_dbon(), artifact_hit(), Mb_hit();
// src/weapon.c hitval(), dmgval(); src/uhitm.c find_roll_to_hit(), hmon_hitmon_weapon_melee(),
// known_hitum(), hitum_cleave(); src/dothrow.c throw_obj(), throwit()
import {
  getPlayer,
  inventoryOf,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Rng,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { heroAttack, findRollToHit, heroWeapon, knownHitum } from '../src/combat';
import { dmgval } from '../src/dmgval';
import {
  FATAL_DAMAGE_MODIFIER,
  artifactHit,
  oname,
  specAbon,
  specApplies,
  specDbon,
  artifactRow,
} from '../src/index';
import { nhData } from '../src/items';
import { setU, uState } from '../src/luck';
import { P_BASIC } from '../src/skills';
import { isMConfused, isMStunned, isCancelled } from '../src/mstate';
import { P, hasProp, setItimeout } from '../src/props';
import { pwOf, setPw } from '../src/uenergy';
import { isFleeing } from '../src/monflee';
import { addMon, playAs } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const ROOM = ['.........', '.........', '...@.....', '.........', '.........'];
type S = ReturnType<typeof levelSetup>;

/** A plain room for a Valkyrie (or `role`) with Str 10 (no damage bonus), Basic skills. */
function setup(seed = 1, role: Parameters<typeof playAs>[1] = 'valkyrie'): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  playAs(s.state, role);
  const a = getPlayer(s.state).c.attributes;
  if (a) Object.assign(a, { str: 10, dex: 10, con: 10 });
  for (const e of inventoryOf(s.state, s.state.playerId))
    if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
  return s;
}

const ent = (s: S, id: EntityId): Entity => {
  const e = s.state.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};

/** Makes and wields the artifact `name` on base `base` (uncursed, +0). */
function wield(s: S, base: string, name: string, spe = 0): Entity {
  const id = s.carry(base);
  const e = ent(s, id);
  oname(s.ctx as never, e, name, 'wish', true);
  expect(e.c.item?.artifact).toBeDefined();
  // Basic in its skill: no skill damage bonus or penalty
  const skill = defs.object(base as DefId).weapon?.skill;
  if (skill) (nhData(s.ctx as never).skills ??= {})[skill] = P_BASIC;
  if (e.c.item) {
    e.c.item.equipped = 'weapon';
    e.c.item.buc = 'uncursed';
    e.c.item.spe = spe;
  }
  return e;
}

/** A pinned monster east of the hero: speed 0, `hp` hit points, level `lvl`. */
function pin(s: S, def: string, o: { x?: number; y?: number; hp?: number; lvl?: number } = {}) {
  const id = addMon(s.state, def, o.x ?? 4, o.y ?? 2, { asleep: false });
  const e = ent(s, id);
  if (e.c.actor) e.c.actor.speed = 0;
  e.c.hp = { cur: o.hp ?? 1000, max: o.hp ?? 1000 };
  if (e.c.monster) e.c.monster.level = o.lvl ?? defs.monster(def as DefId).level;
  return id;
}

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function said(s: S, fn: () => void): string[] {
  const events = s.ctx.events as GameEvent[];
  const from = events.length;
  fn();
  return texts(events.slice(from));
}

/** One forced hit with the wielded weapon at d20 `dieroll`; the messages and the damage. */
function blow(s: S, id: EntityId, dieroll: number): { msgs: string[]; dmg: number; hit: boolean } {
  const before = ent(s, id).c.hp?.cur ?? 0;
  const uwep = inventoryOf(s.state, s.state.playerId).find((o) => o.c.item?.equipped === 'weapon');
  const hit = { mhit: true };
  const msgs = said(s, () => {
    knownHitum(
      s.ctx as never,
      id,
      heroWeapon(s.ctx as never, uwep ?? null),
      true,
      null,
      undefined,
      {
        dieroll,
        hit,
      },
    );
  });
  const after = s.state.entities[String(id)]?.c.hp?.cur ?? 0;
  return { msgs, dmg: before - after, hit: hit.mhit };
}

const reset = (s: S, id: EntityId, hp = 1000): void => {
  ent(s, id).c.hp = { cur: hp, max: hp };
};

describe('spec_applies(), spec_abon(), spec_dbon()', () => {
  test('the banes: class, flag, alignment; Excalibur against everything', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const row = (n: string) => artifactRow(n as never);
    const on = (n: string, mon: string) => specApplies(ctx, row(n), pin(s, mon, { x: 6 }));
    expect(on('nh:sting', 'nh:hill_orc')).toBe(true);
    expect(on('nh:sting', 'nh:newt')).toBe(false);
    expect(on('nh:orcrist', 'nh:hill_orc')).toBe(true);
    expect(on('nh:giantslayer', 'nh:hill_giant')).toBe(true);
    expect(on('nh:giantslayer', 'nh:ogre')).toBe(false);
    expect(on('nh:ogresmasher', 'nh:ogre')).toBe(true);
    expect(on('nh:trollsbane', 'nh:troll')).toBe(true);
    expect(on('nh:dragonbane', 'nh:baby_gray_dragon')).toBe(true);
    expect(on('nh:dragonbane', 'nh:newt')).toBe(false);
    expect(on('nh:demonbane', 'nh:hezrou')).toBe(true);
    expect(on('nh:demonbane', 'nh:imp')).toBe(false);
    expect(on('nh:werebane', 'nh:werejackal')).toBe(true);
    expect(on('nh:sunsword', 'nh:kobold_zombie')).toBe(true);
    expect(on('nh:sunsword', 'nh:newt')).toBe(false);
    expect(on('nh:grimtooth', 'nh:newt')).toBe(false); // (its damage bonus still applies)
    // the Sceptre of Might (lawful): another alignment's kind
    expect(on('nh:sceptre_of_might', 'nh:hill_orc')).toBe(true); // chaotic
    expect(on('nh:sceptre_of_might', 'nh:newt')).toBe(true); // neutral
    // no bane, physical attack: everything
    expect(on('nh:excalibur', 'nh:newt')).toBe(true);
    expect(on('nh:vorpal_blade', 'nh:jabberwock')).toBe(true);
    // the hero: her race's own flags (an elf against Grimtooth), her alignment
    const me = s.state.playerId;
    expect(specApplies(ctx, row('nh:grimtooth'), me)).toBe(false);
    playAs(s.state, 'ranger', 'elf');
    expect(specApplies(ctx, row('nh:grimtooth'), me)).toBe(true);
    expect(specApplies(ctx, row('nh:sceptre_of_might'), me)).toBe(uState(s.state).alignType !== 1);
  });

  test('the elements: resisted or defended targets are not burned', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const row = (n: string) => artifactRow(n as never);
    expect(specApplies(ctx, row('nh:fire_brand'), pin(s, 'nh:newt'))).toBe(true);
    expect(specApplies(ctx, row('nh:fire_brand'), pin(s, 'nh:red_mold', { x: 5 }))).toBe(false);
    expect(specApplies(ctx, row('nh:frost_brand'), pin(s, 'nh:brown_mold', { x: 6 }))).toBe(false);
    // a monster wielding Fire Brand is defended against fire
    const jackal = pin(s, 'nh:jackal', { x: 7 });
    expect(specApplies(ctx, row('nh:fire_brand'), jackal)).toBe(true);
    const fb = s.give('nh:long_sword');
    oname(ctx, ent(s, fb), 'Fire Brand', 'wish', true);
    const it = ent(s, fb).c.item;
    if (it) Object.assign(it, { carriedBy: jackal, equipped: 'weapon' });
    delete ent(s, fb).c.pos;
    expect(specApplies(ctx, row('nh:fire_brand'), jackal)).toBe(false);
    // the hero: fire resistance; Stormbringer's drain against an undead form or not
    const me = s.state.playerId;
    expect(specApplies(ctx, row('nh:fire_brand'), me)).toBe(true);
    setItimeout(s.state, getPlayer(s.state), P.FIRE_RES, 0);
    const hero = getPlayer(s.state);
    hero.c.props = { ...(hero.c.props ?? {}), [P.FIRE_RES]: { intrinsic: true, timeout: 0 } };
    expect(hasProp(hero, P.FIRE_RES)).toBe(true);
    expect(specApplies(ctx, row('nh:fire_brand'), me)).toBe(false);
    expect(specApplies(ctx, row('nh:stormbringer'), me)).toBe(true);
    expect(specApplies(ctx, row('nh:stormbringer'), pin(s, 'nh:kobold_zombie', { x: 8 }))).toBe(
      false,
    );
  });

  test('spec_abon() is rnd(damn) where it applies; spec_dbon() rnd(damd) or the damage again', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc');
    const newt = pin(s, 'nh:newt', { x: 5 });
    const sting = wield(s, 'nh:elven_dagger', 'Sting');
    const grim = ent(s, s.carry('nh:orcish_dagger'));
    oname(ctx, grim, 'Grimtooth', 'wish', true);
    const exc = ent(s, s.carry('nh:long_sword'));
    oname(ctx, exc, 'Excalibur', 'wish', true);
    const abon = new Set<number>();
    const ex = new Set<number>();
    const gr = new Set<number>();
    for (let i = 0; i < 300; i++) {
      abon.add(specAbon(ctx, sting, orc));
      expect(specAbon(ctx, sting, newt)).toBe(0);
      expect(specDbon(ctx, sting, orc, 7)).toEqual({ bonus: 7, applies: true });
      expect(specDbon(ctx, sting, orc, 0)).toEqual({ bonus: 1, applies: true });
      expect(specDbon(ctx, sting, newt, 7)).toEqual({ bonus: 0, applies: false });
      ex.add(specDbon(ctx, exc, newt, 3).bonus);
      gr.add(specDbon(ctx, grim, newt, 3).bonus); // Grimtooth's against everyone
    }
    expect([...abon].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...ex].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...gr].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    // the to-hit roll: Sting adds 1..5 against the orc only
    const w = heroWeapon(ctx, sting);
    const base = findRollToHit(ctx, newt, 'weapon', w);
    const rolls = new Set<number>();
    for (let i = 0; i < 200; i++) rolls.add(findRollToHit(ctx, orc, 'weapon', w) - base);
    expect(Math.min(...rolls)).toBe(Math.max(...rolls) - 4);
  });

  test('dmgval() halves the type bonuses when the artifact will double the damage', () => {
    const s = setup();
    const max: Rng = {
      next: () => 0,
      rn2: (x) => x - 1,
      rnd: (x) => x,
      d: (n, sides) => n * sides,
    };
    // a blessed silver saber: blessed rnd(4) + silver rnd(20) against a silver-hating demon
    const saber = ent(s, s.carry('nh:silver_saber'));
    if (saber.c.item) saber.c.item.buc = 'blessed';
    const hezrou = defs.monster('nh:hezrou');
    const plain = dmgval(max, saber, defs.object('nh:silver_saber'), hezrou);
    // made an artifact (Grayswandir: double damage everywhere)
    oname(s.ctx as never, saber, 'Grayswandir', 'wish', true);
    const halved = dmgval(max, saber, defs.object('nh:silver_saber'), hezrou, false, () => 25);
    const kept = dmgval(max, saber, defs.object('nh:silver_saber'), hezrou, false, () => 10);
    expect(plain - kept).toBe(0);
    expect(plain - halved).toBe(24 - Math.trunc((24 + 1) / 2)); // 4 + 20 -> 12
  });
});

describe('the brands and Mjollnir', () => {
  test('Fire Brand burns a newt for double damage and only hits a red mold', () => {
    const s = setup();
    wield(s, 'nh:long_sword', 'Fire Brand');
    const newt = pin(s, 'nh:newt');
    const mold = pin(s, 'nh:red_mold', { x: 3, y: 1 });
    const nd = new Set<number>();
    const md = new Set<number>();
    for (let i = 0; i < 80; i++) {
      const a = blow(s, newt, 10);
      expect(a.msgs[0]).toBe('The fiery blade burns the newt!');
      nd.add(a.dmg);
      const b = blow(s, mold, 10);
      expect(b.msgs[0]).toBe('The fiery blade hits the red mold.');
      md.add(b.dmg);
      reset(s, newt);
      reset(s, mold);
    }
    // a long sword does d8 to small targets (no Str or skill bonus): doubled, 2..16, all even
    expect([...nd].every((d) => d % 2 === 0 && d >= 2 && d <= 16)).toBe(true);
    expect(Math.max(...nd)).toBeGreaterThan(8);
    expect(Math.max(...md)).toBeLessThanOrEqual(8);
  });

  test('Frost Brand freezes; a cold-resistant brown mold is only hit', () => {
    const s = setup();
    wield(s, 'nh:long_sword', 'Frost Brand');
    expect(blow(s, pin(s, 'nh:newt'), 10).msgs[0]).toBe('The ice-cold blade freezes the newt!');
    expect(blow(s, pin(s, 'nh:brown_mold', { x: 3, y: 1 }), 10).msgs[0]).toBe(
      'The ice-cold blade hits the brown mold.',
    );
  });

  test("Mjollnir's lightning strikes and wakes the monsters near the target", () => {
    const s = setup();
    wield(s, 'nh:war_hammer', 'Mjollnir');
    const newt = pin(s, 'nh:newt');
    const sleeper = pin(s, 'nh:jackal', { x: 6 }); // dist2 4 from the newt
    const far = pin(s, 'nh:sewer_rat', { x: 8 }); // dist2 16: not woken
    for (const id of [sleeper, far]) {
      const m = ent(s, id).c.monster;
      if (m) m.asleep = true;
    }
    const r = blow(s, newt, 10);
    expect(r.msgs[0]).toBe('The massive hammer hits!  Lightning strikes the newt!');
    expect(r.dmg).toBeGreaterThan(1);
    expect(ent(s, sleeper).c.monster?.asleep).toBe(false);
    expect(ent(s, far).c.monster?.asleep).toBe(true);
  });
});

describe('Magicbane', () => {
  test('a natural 1 cancels: a clay golem drops to 1 hit point and dies of the blow', () => {
    let cancelled = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed);
      wield(s, 'nh:athame', 'Magicbane');
      const golem = pin(s, 'nh:clay_golem');
      const r = blow(s, golem, 1);
      expect(r.msgs[0]).toBe('The magic-absorbing blade cancels the clay golem!');
      if (r.msgs.includes('The clay golem resists!')) {
        expect(s.state.entities[String(golem)]?.c.monster).toBeDefined();
        continue;
      }
      cancelled++;
      expect(r.msgs).toContain("Some writing vanishes from the clay golem's head!");
      expect(s.state.entities[String(golem)]?.c.monster).toBeUndefined(); // killed by the blow
    }
    expect(cancelled).toBeGreaterThan(5);
  });

  test('cancelling a caster gives the hero a point of energy', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed);
      wield(s, 'nh:athame', 'Magicbane');
      const shaman = pin(s, 'nh:kobold_shaman');
      setPw(s.ctx as never, { uen: 3, uenmax: 5, uenpeak: 5 });
      const r = blow(s, shaman, 1);
      if (r.msgs.includes('The kobold shaman resists!')) continue;
      expect(r.msgs).toContain('You absorb magical energy!');
      expect(isCancelled(s.ctx as never, shaman)).toBe(true);
      expect(pwOf(s.state)).toEqual({ uen: 4, uenmax: 6, uenpeak: 6 });
      return;
    }
    throw new Error('never cancelled');
  });

  test('3..4 scares, 5..8 stuns or probes; +6 never cancels; 9 is an ordinary hit', () => {
    const s = setup();
    const mb = wield(s, 'nh:athame', 'Magicbane');
    const newt = pin(s, 'nh:newt'); // mr 0: the stun always applies
    const r3 = blow(s, newt, 3);
    expect(r3.msgs[0]).toBe('The magic-absorbing blade scares the newt!');
    expect(isFleeing(s.ctx as never, newt) || r3.msgs.includes('The newt resists!')).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      reset(s, newt);
      const r = blow(s, newt, 6);
      seen.add(r.msgs[0] ?? '');
      if (r.msgs[0] === 'The magic-absorbing blade stuns the newt!')
        expect(isMStunned(s.ctx as never, newt)).toBe(true);
      // +0: every probe is insightful
      if (r.msgs[0] === 'The magic-absorbing blade probes the newt!')
        expect(r.msgs[1]).toBe('The probe is insightful.');
    }
    expect(seen).toEqual(
      new Set([
        'The magic-absorbing blade stuns the newt!',
        'The magic-absorbing blade probes the newt!',
      ]),
    );
    // confusion comes 1 time in 12, with its message
    let conf = false;
    for (let i = 0; i < 100 && !conf; i++) {
      reset(s, newt);
      conf = blow(s, newt, 7).msgs.some(
        (m) => m.startsWith('The newt is') && m.includes('confused'),
      );
    }
    expect(conf && isMConfused(s.ctx as never, newt)).toBe(true);
    if (mb.c.item) mb.c.item.spe = 6;
    for (let i = 0; i < 30; i++) {
      reset(s, newt);
      expect(blow(s, newt, 1).msgs[0]).not.toBe('The magic-absorbing blade cancels the newt!');
    }
    if (mb.c.item) mb.c.item.spe = 0;
    expect(blow(s, newt, 9).msgs[0]).toMatch(/^You hit the newt[.!]$/);
  });
});

describe('the beheading blades', () => {
  test('Vorpal Blade beheads on a natural 1, misses a headless monster wildly', () => {
    const s = setup();
    wield(s, 'nh:long_sword', 'Vorpal Blade');
    const newt = pin(s, 'nh:newt');
    const r = blow(s, newt, 1);
    expect(['Vorpal Blade beheads the newt!', 'Vorpal Blade decapitates the newt!']).toContain(
      r.msgs[0],
    );
    expect(r.msgs).toContain('You kill the newt!');
    expect(s.state.entities[String(newt)]).toBeUndefined();
    const lichen = pin(s, 'nh:lichen');
    const m = blow(s, lichen, 1);
    expect(m.msgs).toEqual(['Somehow, you miss the lichen wildly.']);
    expect(m.dmg).toBe(0);
    expect(m.hit).toBe(false); // known_hitum() turns it into a miss
    const ghost = pin(s, 'nh:ghost', { x: 3, y: 1 });
    const g = blow(s, ghost, 1);
    expect(g.msgs[0]).toBe("Vorpal Blade slices through the ghost's neck.");
    expect(s.state.entities[String(ghost)]?.c.monster).toBeDefined();
    // an ordinary roll: no beheading
    expect(blow(s, ghost, 2).msgs.some((t) => t.includes('Vorpal'))).toBe(false);
  });

  test('the Jabberwock loses its head to any hit', () => {
    const s = setup();
    wield(s, 'nh:long_sword', 'Vorpal Blade');
    const jw = pin(s, 'nh:jabberwock');
    const r = blow(s, jw, 17);
    expect(r.msgs[0]).toMatch(/^Vorpal Blade (beheads|decapitates) the jabberwock!$/);
    expect(r.msgs).toContain('You kill the jabberwock!');
    expect(s.state.entities[String(jw)]).toBeUndefined();
    expect(FATAL_DAMAGE_MODIFIER).toBe(200);
  });

  test('the Tsurugi cuts a small monster in half and slices deeply into a big one', () => {
    const s = setup(1, 'samurai');
    const a = getPlayer(s.state).c.attributes;
    if (a) a.str = 10;
    wield(s, 'nh:tsurugi', 'The Tsurugi of Muramasa');
    const newt = pin(s, 'nh:newt');
    expect(blow(s, newt, 1).msgs[0]).toBe('The razor-sharp blade cuts the newt in half!');
    expect(s.state.entities[String(newt)]).toBeUndefined();
    const giant = pin(s, 'nh:hill_giant');
    const r = blow(s, giant, 1);
    expect(r.msgs[0]).toBe('You slice deeply into the hill giant!');
    expect(r.dmg).toBeGreaterThan(1);
    expect(r.dmg).toBeLessThan(1000);
  });
});

describe('the life drainers', () => {
  test('Stormbringer drains a level and maximum hit points, healing her by half', () => {
    const s = setup();
    wield(s, 'nh:runesword', 'Stormbringer');
    const orc = pin(s, 'nh:hill_orc', { lvl: 3 });
    const hero = getPlayer(s.state);
    if (hero.c.hp) hero.c.hp.cur = 100;
    const r = blow(s, orc, 10);
    expect(r.msgs[0]).toBe('The black blade draws the life from the hill orc!');
    const o = ent(s, orc);
    expect(o.c.monster?.level).toBe(2);
    const drained = 1000 - (o.c.hp?.max ?? 0);
    expect(drained).toBeGreaterThanOrEqual(1);
    expect(drained).toBeLessThanOrEqual(8);
    expect(hero.c.hp?.cur).toBe(100 + Math.trunc((drained + 1) / 2));
    // a level 0 one dies
    const newt = pin(s, 'nh:newt', { lvl: 0, x: 3, y: 1 });
    expect(blow(s, newt, 10).msgs).toContain('You kill the newt!');
    // the undead resist: an ordinary hit
    const z = pin(s, 'nh:kobold_zombie', { x: 3, y: 3 });
    expect(blow(s, z, 10).msgs[0]).toMatch(/^You hit the kobold zombie/);
    expect(ent(s, z).c.hp?.max).toBe(1000);
  });
});

describe('an artifact hitting the hero', () => {
  test('Fire Brand burns her unless she resists; Stormbringer drains her level', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const me = s.state.playerId;
    const fb = ent(s, s.give('nh:long_sword'));
    oname(ctx, fb, 'Fire Brand', 'wish', true);
    let msgs: string[];
    const d = { n: 5 };
    msgs = said(s, () => artifactHit(ctx, null, me, fb, d, 10));
    expect(msgs[0]).toBe('The fiery blade burns you!');
    expect(d.n).toBe(10);
    const sb = ent(s, s.give('nh:runesword'));
    oname(ctx, sb, 'Stormbringer', 'wish', true);
    const xp = getPlayer(s.state).c.experience;
    if (xp) xp.level = 5;
    msgs = said(s, () => artifactHit(ctx, null, me, sb, { n: 3 }, 10));
    expect(msgs[0]).toBe('The black blade drains your life!');
    expect(getPlayer(s.state).c.experience?.level).toBe(4);
  });
});

describe('Mjollnir thrown', () => {
  const throwIt = (s: S, id: EntityId): string[] => {
    s.mod('nh:throw', { item: id });
    const r = s.step({
      type: 'answer',
      promptId: s.state.pendingPrompt?.prompt.id ?? '',
      value: 'e' as never,
    });
    return s.text(r);
  };

  test('only wielded and with Strength 25', () => {
    const s = setup();
    const m = wield(s, 'nh:war_hammer', 'Mjollnir');
    expect(throwIt(s, m.id)).toEqual(["It's too heavy."]);
    if (m.c.item) m.c.item.equipped = null;
    const a = getPlayer(s.state).c.attributes;
    if (a) a.str = 125;
    expect(throwIt(s, m.id)[0]).toMatch(/must be wielded before it can be thrown\.$/);
  });

  test("a Valkyrie's comes back to her hand, or else lands at her feet or hits her arm", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 60 && outcomes.size < 3; seed++) {
      const s = setup(seed);
      const a = getPlayer(s.state).c.attributes;
      if (a) a.str = 125;
      const m = wield(s, 'nh:war_hammer', 'Mjollnir');
      const newt = pin(s, 'nh:newt', { x: 6 });
      void newt;
      // confused: never caught
      if (seed % 2 === 0) setItimeout(s.state, getPlayer(s.state), P.CONFUSION, 50);
      const hp0 = getPlayer(s.state).c.hp?.cur ?? 0;
      const msgs = throwIt(s, m.id);
      const it = s.state.entities[String(m.id)]?.c.item;
      if (msgs.some((t) => t.endsWith('returns to your hand!'))) {
        expect(seed % 2).toBe(1);
        expect(it?.carriedBy).toBe(s.state.playerId);
        expect(it?.equipped).toBe('weapon');
        outcomes.add('caught');
      } else if (msgs.some((t) => t.endsWith('flies back toward you, hitting your arm!'))) {
        expect(msgs).toContain('The massive hammer hits!  Lightning strikes you!');
        expect(getPlayer(s.state).c.hp?.cur ?? 0).toBeLessThan(hp0);
        expect(ent(s, m.id).c.pos).toMatchObject({ x: 3, y: 2 });
        outcomes.add('arm');
      } else if (msgs.some((t) => t.endsWith('returns to you, landing at your feet.'))) {
        expect(ent(s, m.id).c.pos).toMatchObject({ x: 3, y: 2 });
        outcomes.add('feet');
      }
    }
    expect(outcomes).toEqual(new Set(['caught', 'arm', 'feet']));
  });

  test("anyone else's does not come back", () => {
    const s = setup(1, 'barbarian');
    const a = getPlayer(s.state).c.attributes;
    if (a) a.str = 125;
    const m = wield(s, 'nh:war_hammer', 'Mjollnir');
    const msgs = throwIt(s, m.id);
    expect(msgs.some((t) => t.includes('return'))).toBe(false);
    expect(ent(s, m.id).c.item?.carriedBy).toBeNull();
    expect(ent(s, m.id).c.pos?.x).toBeGreaterThan(3);
  });
});

describe('a thrown artifact', () => {
  test('Fire Brand thrown burns the newt it hits, with no second hit message', () => {
    let burned = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(seed);
      const fb = wield(s, 'nh:long_sword', 'Fire Brand');
      if (fb.c.item) fb.c.item.equipped = null;
      const newt = pin(s, 'nh:newt');
      s.mod('nh:throw', { item: fb.id });
      const r = s.step({
        type: 'answer',
        promptId: s.state.pendingPrompt?.prompt.id ?? '',
        value: 'e' as never,
      });
      const msgs = s.text(r);
      if (msgs.some((t) => /miss/.test(t))) continue;
      expect(msgs).toContain('The fiery blade burns the newt!');
      expect(msgs.some((t) => /long sword.* hits/.test(t))).toBe(false); // no second hit message
      expect(ent(s, newt).c.hp?.cur).toBeLessThan(1000);
      burned++;
    }
    expect(burned).toBeGreaterThan(5);
  });
});

describe('Cleaver', () => {
  test('three blows around the target, swung alternately', () => {
    const s = setup();
    wield(s, 'nh:battle_axe', 'Cleaver');
    pin(s, 'nh:newt', { x: 4, y: 1 });
    const target = pin(s, 'nh:jackal', { x: 4, y: 2 });
    pin(s, 'nh:sewer_rat', { x: 4, y: 3 });
    const order = (msgs: string[]): string[] =>
      msgs.flatMap((t) => {
        const m = /(newt|jackal|sewer rat)/.exec(t);
        return m?.[1] && /^You (hit|miss|smite)/.test(t) ? [m[1]] : [];
      });
    expect(uState(s.state).cleaveCw).toBeUndefined();
    const first = order(said(s, () => heroAttack(s.ctx as never, target, { x: 4, y: 2 })));
    expect(first).toEqual(['sewer rat', 'jackal', 'newt']); // counter-clockwise from the right
    expect(uState(s.state).cleaveCw).toBe(true);
    const second = order(said(s, () => heroAttack(s.ctx as never, target, { x: 4, y: 2 })));
    expect(second).toEqual(['newt', 'jackal', 'sewer rat']);
    setU(s.ctx as never, { cleaveCw: false });
  });
});
