// m20 step 5: touching artifacts and what they give. The blast on pickup and wield (self-willed
// d(4,10), a restricted one d(4,4) one time in four), the ones that evade her grasp, the
// retouch after her form or alignment changed (a bane she now is, silver she now hates);
// artifact extrinsics in the worn-property cache (carried, worn or wielded), Grayswandir and
// hallucination, Dragonbane's reflection, Sting's glow by count, Sunsword's light, the
// Tsurugi's Luck, the Master Key, half damage and Stormbringer's bloodthirst.
// Outcomes over many seeds or with pinned monsters, never a lucky seed.
// ref: src/artifact.c touch_artifact(), retouch_object(), retouch_equipment(),
// set_artifact_intrinsic(), Sting_effects(), artifact_light(), confers_luck(), is_magic_key();
// src/uhitm.c attack_checks()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { hasMagicKey } from '../src/artifact';
import { retouchEquipment } from '../src/artitouch';
import { moreluck } from '../src/gem';
import { objLights } from '../src/light';
import { oname, vanillaMod } from '../src/index';
import { losexp } from '../src/exper';
import { setU, uState } from '../src/luck';
import { canSpotMon } from '../src/perception';
import {
  P,
  hasExtrinsic,
  hasProp,
  maybeHalfPhys,
  refreshWornProps,
  setItimeout,
} from '../src/props';
import { ureflects } from '../src/reflect';
import { setUlycn } from '../src/werestate';
import { addMon, playAs } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const ROOM = ['.............', '.............', '...@.........', '.............'];
type S = ReturnType<typeof levelSetup>;

function setup(seed = 1, role: Parameters<typeof playAs>[1] = 'valkyrie'): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  playAs(s.state, role);
  for (const e of inventoryOf(s.state, s.state.playerId))
    if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
  return s;
}

const ent = (s: S, id: EntityId): Entity => {
  const e = s.state.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};
const hero = (s: S): Entity => getPlayer(s.state);
const hp = (s: S): number => hero(s).c.hp?.cur ?? 0;

/** The artifact `name` on a new `base`: on her square, or carried (and wielded). */
function arti(s: S, base: string, name: string, where: 'floor' | 'carried' | 'wielded'): Entity {
  const id = s.give(base, where === 'floor' ? { at: s.here } : { carriedBy: s.state.playerId });
  const e = ent(s, id);
  oname(s.ctx as never, e, name, 'wish', true);
  expect(e.c.item?.artifact).toBeDefined();
  if (e.c.item) {
    e.c.item.buc = 'uncursed';
    e.c.item.spe = 0;
    if (where === 'wielded') e.c.item.equipped = 'weapon';
  }
  return e;
}

const carried = (s: S, e: Entity): boolean => e.c.item?.carriedBy === s.state.playerId;

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);
/** Runs `fn` with the engine's own Ctx and returns the messages (the hooks run after it). */
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return eng
    .step(s.state, { type: 'mod', action: 'pt:run' as DefId })
    .events.flatMap((e) =>
      e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : [],
    );
}

/** A pinned monster (speed 0). */
function pin(s: S, def: string, x: number, y: number, o: { peaceful?: boolean } = {}): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id);
  if (e.c.actor) e.c.actor.speed = 0;
  e.c.hp = { cur: 1000, max: 1000 };
  if (o.peaceful && e.c.monster) e.c.monster.peaceful = true;
  return id;
}

describe('touching artifacts', () => {
  test('a neutral hero picking up Stormbringer is blasted d(4,10) and keeps it', () => {
    const dmg = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed);
      const sb = arti(s, 'nh:runesword', 'Stormbringer', 'floor');
      const before = hp(s);
      const t = s.text(s.mod('nh:pickup'));
      // (the type is not identified: "the runesword named Stormbringer's power")
      expect(t[0]).toMatch(/^You are blasted by the runesword named Stormbringer's power!$/);
      expect(carried(s, sb)).toBe(true);
      const d = before - hp(s);
      expect(d).toBeGreaterThanOrEqual(4);
      expect(d).toBeLessThanOrEqual(40);
      dmg.add(d);
    }
    expect(dmg.size).toBeGreaterThan(5);
  });

  test('the Tsurugi of Muramasa (another role, lawful, self-willed) blasts her and evades her grasp', () => {
    const s = setup();
    const ts = arti(s, 'nh:tsurugi', 'The Tsurugi of Muramasa', 'floor');
    const before = hp(s);
    const t = s.text(s.mod('nh:pickup'));
    expect(t[0]).toMatch(/^You are blasted by the tsurugi named the Tsurugi of Muramasa's power!$/);
    expect(t[1]).toMatch(/^The tsurugi named the Tsurugi of Muramasa evades your grasp!$/);
    expect(carried(s, ts)).toBe(false);
    expect(ts.c.pos).toEqual(s.here);
    expect(before - hp(s)).toBeGreaterThanOrEqual(4);
    // a Samurai takes it unharmed
    const s2 = setup(1, 'samurai');
    setU({ state: s2.state }, { alignType: 1 });
    getPlayer(s2.state).c.player!.align = 1;
    const ts2 = arti(s2, 'nh:tsurugi', 'The Tsurugi of Muramasa', 'floor');
    const b2 = hp(s2);
    s2.mod('nh:pickup');
    expect(carried(s2, ts2)).toBe(true);
    expect(hp(s2)).toBe(b2);
  });

  test('Demonbane (restricted, lawful, not self-willed) blasts a neutral hero d(4,4) one time in four', () => {
    let blasted = 0;
    const n = 80;
    for (let seed = 1; seed <= n; seed++) {
      const s = setup(seed);
      const db = arti(s, 'nh:silver_mace', 'Demonbane', 'floor');
      const before = hp(s);
      s.mod('nh:pickup');
      expect(carried(s, db)).toBe(true);
      const d = before - hp(s);
      if (d > 0) {
        blasted++;
        expect(d).toBeGreaterThanOrEqual(4);
        expect(d).toBeLessThanOrEqual(16);
      }
    }
    expect(blasted).toBeGreaterThan(n / 10);
    expect(blasted).toBeLessThan(n / 2);
  });

  test('a lawful hero with a negative alignment record is blasted by Excalibur, not with 0', () => {
    for (const [record, hurt] of [
      [-1, true],
      [0, false],
    ] as const) {
      const s = setup();
      setU({ state: s.state }, { alignType: 1, alignRecord: record });
      getPlayer(s.state).c.player!.align = 1;
      const ex = arti(s, 'nh:long_sword', 'Excalibur', 'floor');
      const before = hp(s);
      s.mod('nh:pickup');
      expect(carried(s, ex)).toBe(true);
      expect(hp(s) < before).toBe(hurt);
    }
  });

  test('wielding a carried Stormbringer blasts her again; the touch takes the turn', () => {
    const s = setup(3);
    const sb = arti(s, 'nh:runesword', 'Stormbringer', 'carried');
    const before = hp(s);
    const t = s.text(s.mod('nh:wield', { item: sb.id }));
    expect(t[0]).toMatch(/^You are blasted by .*Stormbringer's power!$/);
    expect(sb.c.item?.equipped).toBe('weapon');
    expect(hp(s)).toBeLessThan(before);
  });

  test('killed by the blast: "touching Stormbringer"', () => {
    const s = setup(2);
    arti(s, 'nh:runesword', 'Stormbringer', 'floor');
    hero(s).c.hp = { cur: 1, max: 1 };
    s.mod('nh:pickup');
    expect(s.state.gameOver?.killer).toBe('@killer.touching_artifact|=Stormbringer');
  });

  test('catching lycanthropy: Werebane is dropped, silver rings come off', () => {
    let hurt = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = setup(seed);
      const wb = arti(s, 'nh:silver_saber', 'Werebane', 'wielded');
      const before = hp(s);
      const t = run(s, (ctx) => {
        setUlycn(ctx, 'nh:werewolf' as DefId);
        retouchEquipment(ctx, 2);
      });
      expect(t).toContain("You can't handle your silver saber named Werebane anymore!");
      expect(t.some((m) => m.endsWith('falls to the floor.'))).toBe(true);
      expect(carried(s, wb)).toBe(false);
      expect(wb.c.pos).toEqual(s.here);
      if (hp(s) < before) hurt++;
    }
    expect(hurt).toBe(10);
  });
});

describe('what artifacts give', () => {
  test('Magicbane and Frost Brand give their resistance only while wielded (DFNS, no CARY)', () => {
    const s = setup();
    const mb = arti(s, 'nh:athame', 'Magicbane', 'carried');
    refreshWornProps(s.ctx as never);
    expect(hasProp(hero(s), P.ANTIMAGIC)).toBe(false);
    mb.c.item!.equipped = 'weapon';
    refreshWornProps(s.ctx as never);
    expect(hasProp(hero(s), P.ANTIMAGIC)).toBe(true);
    mb.c.item!.equipped = null;
    const fb = arti(s, 'nh:long_sword', 'Frost Brand', 'carried');
    refreshWornProps(s.ctx as never);
    expect(hasExtrinsic(hero(s), P.COLD_RES)).toBe(false);
    fb.c.item!.equipped = 'weapon';
    refreshWornProps(s.ctx as never);
    expect(hasExtrinsic(hero(s), P.COLD_RES)).toBe(true);
  });

  test('Excalibur wielded gives searching and drain resistance (losexp resisted)', () => {
    const s = setup();
    setU({ state: s.state }, { alignType: 1 });
    getPlayer(s.state).c.player!.align = 1;
    arti(s, 'nh:long_sword', 'Excalibur', 'wielded');
    refreshWornProps(s.ctx as never);
    expect(hasProp(hero(s), P.SEARCHING)).toBe(true);
    hero(s).c.experience!.level = 5;
    run(s, (ctx) => losexp(ctx, '@killer.life_drainage'));
    expect(hero(s).c.experience!.level).toBe(5);
  });

  test('Trollsbane wielded regenerates; the Master Key carried halves physical damage', () => {
    const s = setup();
    arti(s, 'nh:morning_star', 'Trollsbane', 'wielded');
    arti(s, 'nh:skeleton_key', 'The Master Key of Thievery', 'carried');
    refreshWornProps(s.ctx as never);
    expect(hasProp(hero(s), P.REGENERATION)).toBe(true);
    expect(hasProp(hero(s), P.TELEPORT_CONTROL)).toBe(true);
    expect(hasProp(hero(s), P.WARNING)).toBe(true);
    expect(maybeHalfPhys(s.state, 9)).toBe(5);
  });

  test('Grayswandir stops hallucination while wielded', () => {
    const s = setup();
    setItimeout(s.state, hero(s), P.HALLUC, 100);
    const gw = arti(s, 'nh:silver_saber', 'Grayswandir', 'carried');
    gw.c.item!.buc = 'uncursed';
    setU({ state: s.state }, { alignType: 1 });
    getPlayer(s.state).c.player!.align = 1;
    refreshWornProps(s.ctx as never);
    expect(hasProp(hero(s), P.HALLUC)).toBe(true);
    let t = s.text(s.mod('nh:wield', { item: gw.id }));
    expect(t).toContain('Everything looks SO boring now.');
    expect(hasProp(hero(s), P.HALLUC)).toBe(false);
    t = s.text(s.mod('nh:unwield', { item: gw.id }));
    expect(t).toContain('Oh wow!  Everything looks so cosmic!');
    expect(hasProp(hero(s), P.HALLUC)).toBe(true);
  });

  test('Dragonbane reflects while wielded, not while just carried', () => {
    const s = setup();
    const db = arti(s, 'nh:broadsword', 'Dragonbane', 'carried');
    refreshWornProps(s.ctx as never);
    expect(ureflects(s.ctx as never, null)).toBe(false);
    db.c.item!.equipped = 'weapon';
    refreshWornProps(s.ctx as never);
    expect(hasExtrinsic(hero(s), P.REFLECTING)).toBe(true);
    const t = run(s, (ctx) => ureflects(ctx, 'zap.ray.reflects', { ray: '' }));
    expect(t.join(' ')).toContain('weapon');
  });

  test('the Tsurugi of Muramasa adds Luck like a luckstone', () => {
    const s = setup(1, 'samurai');
    expect(moreluck(s.state)).toBe(0);
    arti(s, 'nh:tsurugi', 'The Tsurugi of Muramasa', 'carried');
    expect(moreluck(s.state)).toBe(3);
  });

  test('the Master Key is a magic key blessed, or not cursed for a Rogue', () => {
    const s = setup();
    const k = arti(s, 'nh:skeleton_key', 'The Master Key of Thievery', 'carried');
    expect(hasMagicKey(s.ctx as never, s.state.playerId)).toBeNull();
    k.c.item!.buc = 'blessed';
    expect(hasMagicKey(s.ctx as never, s.state.playerId)?.id).toBe(k.id);
    const r = setup(1, 'rogue');
    const k2 = arti(r, 'nh:skeleton_key', 'The Master Key of Thievery', 'carried');
    expect(hasMagicKey(r.ctx as never, r.state.playerId)?.id).toBe(k2.id);
    k2.c.item!.buc = 'cursed';
    expect(hasMagicKey(r.ctx as never, r.state.playerId)).toBeNull();
  });
});

describe("Sting's glow and Sunsword's light", () => {
  test('Sting glows by the number of orcs on her level and stops when they are gone', () => {
    const s = setup();
    const sting = arti(s, 'nh:elven_dagger', 'Sting', 'carried');
    const orcs = [pin(s, 'nh:hill_orc', 12, 0)];
    let t = s.text(s.mod('nh:wield', { item: sting.id }));
    expect(t).toContain('Sting flickers light blue!');
    expect(uState(s.state).warnObjCnt).toBe(1);
    // warned of: the orc is sensed wherever it is
    expect(canSpotMon(s.ctx as never, ent(s, orcs[0]!))).toBe(true);
    for (let i = 0; i < 4; i++) orcs.push(pin(s, 'nh:hill_orc', 6 + i, 3));
    t = s.text(s.step({ type: 'search' }));
    expect(t).toContain('Sting glimmers light blue!');
    for (let i = 0; i < 8; i++) orcs.push(pin(s, 'nh:hill_orc', i, 0));
    t = s.text(s.step({ type: 'search' }));
    expect(t).toContain('Sting gleams light blue!');
    for (const id of orcs.slice(1)) delete s.state.entities[String(id)];
    t = s.text(s.step({ type: 'search' }));
    expect(t).toContain('Sting flickers light blue.');
    delete s.state.entities[String(orcs[0]!)];
    t = s.text(s.step({ type: 'search' }));
    expect(t).toContain('Sting stops flickering.');
    expect(uState(s.state).warnObjCnt).toBe(0);
  });

  test('blind, Sting only quivers slightly', () => {
    const s = setup();
    const sting = arti(s, 'nh:elven_dagger', 'Sting', 'carried');
    pin(s, 'nh:hill_orc', 12, 0);
    setItimeout(s.state, hero(s), P.BLINDED, 100);
    const t = s.text(s.mod('nh:wield', { item: sting.id }));
    expect(t).toContain('Sting quivers slightly.');
  });

  test('Sunsword shines while wielded: a light source of radius 2 (uncursed)', () => {
    const s = setup();
    setU({ state: s.state }, { alignType: 1 });
    getPlayer(s.state).c.player!.align = 1;
    const sun = arti(s, 'nh:long_sword', 'Sunsword', 'carried');
    expect(objLights(s.state)).toEqual([]);
    let t = s.text(s.mod('nh:wield', { item: sun.id }));
    expect(t.some((m) => m.endsWith('begins to shine brightly!'))).toBe(true);
    expect(objLights(s.state)).toEqual([{ ...s.here, radius: 2 }]);
    t = s.text(s.mod('nh:unwield', { item: sun.id }));
    expect(t.some((m) => m.endsWith('stops shining.'))).toBe(true);
    expect(objLights(s.state)).toEqual([]);
  });
});

describe("Stormbringer's bloodthirst", () => {
  test('she attacks a peaceful monster without being asked', () => {
    const s = setup(4);
    arti(s, 'nh:runesword', 'Stormbringer', 'wielded');
    const gnome = pin(s, 'nh:gnome_lord', 4, 2, { peaceful: true });
    const r = s.step({ type: 'move', dir: 'e' });
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.text(r)).toContain('Your bloodthirsty blade attacks!');
    expect(ent(s, gnome).c.monster?.peaceful).toBe(false);
  });
});

test('defs: the artifact bases used here exist', () => {
  for (const id of ['nh:runesword', 'nh:tsurugi', 'nh:silver_mace', 'nh:silver_saber'])
    expect(defs.isObject(id as DefId)).toBe(true);
});
