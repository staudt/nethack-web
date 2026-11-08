// m9 step 1: the damage-type dispatcher (adtyping.ts), erosion and status damage types in both
// directions, the passives that rust, corrode and disenchant, monster blindness, and the rust
// monster and quantum mechanic. Outcomes are checked over many independent tries (each draw is
// fresh), never on a lucky seed.
import {
  getLevel,
  getPlayer,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type EquipSlot,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK, canBlnd, mhitmAdtyping, newMhm, type Mhm } from '../src/adtyping';
import { hitmuAd } from '../src/mhitu';
import { mattackm } from '../src/mhitm';
import { monsterAttack } from '../src/combat';
import { P, hasProp, setIntrinsic, setItimeout, timeoutLeft } from '../src/props';
import {
  isMConfused,
  mblinded,
  mcansee,
  mspecUsed,
  mspeed,
  setCancelled,
  setMblinded,
} from '../src/mstate';
import { hungerData, makeSick, vomit, SICK_NONVOMITABLE } from '../src/hunger';
import { pwOf, setPw } from '../src/uenergy';
import { woundedLegSides, BOTH_SIDES } from '../src/legs';
import { addMon } from './helpers';
import { ctxFor, defs, itemOf, levelSetup, plainKit } from './itemHelpers';

const ROOM = ['..........', '..........', '..@.......', '..........', '..........', '..........'];

type FullCtx = Ctx & { events: GameEvent[] };

/** A Ctx with everything the attack functions touch, over a state. */
function fullCtx(state: GameState): FullCtx {
  return Object.assign(ctxFor(state), {
    interrupt() {},
    endGame(over: NonNullable<GameState['gameOver']>) {
      state.gameOver = over;
    },
    goToLevel() {},
  }) as unknown as FullCtx;
}

const keys = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

/** The hero with a plain kit and lots of HP, no worn armor; a fresh ctx. */
function room(seed = 1) {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const o of inventoryOf(s.state, s.state.playerId))
    if (o.c.item?.equipped && o.c.item.equipped !== 'weapon') o.c.item.equipped = null;
  s.hero.c.hp = { cur: 5000, max: 5000 };
  s.step({ type: 'wait' }); // see the room
  return { ...s, ctx: fullCtx(s.state) };
}

/** A monster of `id` at (x, y) with its real level and lots of HP. */
function mon(state: GameState, id: string, x = 3, y = 2): Entity {
  const e = state.entities[String(addMon(state, id, x, y))]!;
  e.c.monster!.level = defs.monster(id as DefId).level;
  e.c.hp = { cur: 1000, max: 1000 };
  return e;
}

/** Puts an item on (wears or wields) for `who`. */
function wear(s: ReturnType<typeof room>, who: EntityId, id: string, slot: EquipSlot, spe = 0) {
  const o = s.give(id, { carriedBy: who });
  const it = itemOf(s.state, o);
  it.equipped = slot;
  it.spe = spe;
  it.buc = 'uncursed';
  return o;
}

const atk = (at: AttackDef['at'], ad: string, n = 1, d = 4): AttackDef => ({ at, ad, n, d });

/** One damage-type resolution against `mdef`; returns the mhitm_data. */
function hit(ctx: FullCtx, magr: Entity, a: AttackDef, mdef: EntityId, dmg = 4): Mhm {
  const mhm = newMhm(dmg);
  mhitmAdtyping(ctx, magr.id, a, mdef, mhm, { vis: true, mwep: null });
  return mhm;
}

const erosion = (state: GameState, id: EntityId) => itemOf(state, id).erosion ?? { e1: 0, e2: 0 };

// ---------------------------------------------------------------------------------------------

describe('the rust monster (AD_RUST, AD_CORR, AD_DCAY)', () => {
  test('its touch rusts each worn iron armor slot and only that; nothing is eaten', () => {
    const s = room();
    const pieces = {
      helm: wear(s, s.hero.id, 'nh:orcish_helm', 'helm'),
      body: wear(s, s.hero.id, 'nh:ring_mail', 'body'),
      shield: wear(s, s.hero.id, 'nh:orcish_shield', 'shield'),
      boots: wear(s, s.hero.id, 'nh:iron_shoes', 'boots'),
      gloves: wear(s, s.hero.id, 'nh:leather_gloves', 'gloves'),
    };
    const rm = mon(s.state, 'nh:rust_monster');
    const count = inventoryOf(s.state, s.hero.id).length;
    for (let i = 0; i < 60; i++) {
      const mhm = hit(
        s.ctx,
        rm,
        defs.monster('nh:rust_monster' as DefId).attacks[0]!,
        s.hero.id,
        0,
      );
      expect(mhm.damage).toBe(0);
    }
    for (const slot of ['helm', 'body', 'shield', 'boots'] as const)
      expect(erosion(s.state, pieces[slot]).e1, slot).toBeGreaterThan(0);
    expect(erosion(s.state, pieces.gloves)).toEqual({ e1: 0, e2: 0 }); // leather does not rust
    expect(keys(s.ctx)).toContain('erode.erodes');
    expect(inventoryOf(s.state, s.hero.id).length).toBe(count);
  });

  test('a cancelled rust monster rusts nothing', () => {
    const s = room();
    const helm = wear(s, s.hero.id, 'nh:orcish_helm', 'helm');
    const rm = mon(s.state, 'nh:rust_monster');
    setCancelled(s.ctx, rm.id);
    for (let i = 0; i < 40; i++) hit(s.ctx, rm, atk('touch', 'rust', 0, 0), s.hero.id, 0);
    expect(erosion(s.state, helm)).toEqual({ e1: 0, e2: 0 });
  });

  test('corrosion and rot raise the second erosion level of the right materials', () => {
    const s = room();
    const body = wear(s, s.hero.id, 'nh:leather_armor', 'body');
    const helm = wear(s, s.hero.id, 'nh:orcish_helm', 'helm');
    const m = mon(s.state, 'nh:newt');
    for (let i = 0; i < 40; i++) hit(s.ctx, m, atk('touch', 'dcay', 0, 0), s.hero.id, 0);
    expect(erosion(s.state, body).e2).toBeGreaterThan(0); // leather rots
    expect(erosion(s.state, helm).e2).toBe(0); // iron does not
    for (let i = 0; i < 40; i++) hit(s.ctx, m, atk('touch', 'corr', 0, 0), s.hero.id, 0);
    expect(erosion(s.state, helm).e2).toBeGreaterThan(0); // iron corrodes
  });

  test('against a monster: its worn iron rusts and the touch does no damage', () => {
    const s = room();
    const rm = mon(s.state, 'nh:rust_monster');
    const dwarf = mon(s.state, 'nh:dwarf', 4, 2);
    const helm = wear(s, dwarf.id, 'nh:dwarvish_iron_helm', 'helm');
    for (let i = 0; i < 60; i++) {
      const mhm = hit(s.ctx, rm, atk('touch', 'rust', 1, 4), dwarf.id);
      expect(mhm.damage).toBe(0);
    }
    expect(erosion(s.state, helm).e1).toBeGreaterThan(0);
  });

  test('passive: hitting it with an iron weapon rusts the weapon', () => {
    const s = room();
    const sword = inventoryOf(s.state, s.hero.id).find((o) => o.c.item?.equipped === 'weapon')!;
    expect(defs.object(sword.def).material).toBe('iron');
    const rm = mon(s.state, 'nh:rust_monster');
    rm.c.monster!.asleep = true;
    for (let i = 0; i < 40 && !(sword.c.item?.erosion?.e1 ?? 0); i++)
      s.step({ type: 'move', dir: 'e' });
    expect(sword.c.item?.erosion?.e1 ?? 0).toBeGreaterThan(0);
  });

  test("a monster's iron weapon rusts on a rust monster (rustm())", () => {
    const s = room();
    const dwarf = mon(s.state, 'nh:dwarf');
    const axe = wear(s, dwarf.id, 'nh:axe', 'weapon');
    const rm = mon(s.state, 'nh:rust_monster', 4, 2);
    for (let i = 0; i < 60 && !erosion(s.state, axe).e1; i++) mattackm(s.ctx, dwarf.id, rm.id);
    expect(erosion(s.state, axe).e1).toBeGreaterThan(0);
  });
});

describe('the quantum mechanic (AD_TLPT)', () => {
  test('its claw teleports the hero: "Your position suddenly seems very uncertain!"', () => {
    const s = room();
    const qm = mon(s.state, 'nh:quantum_mechanic');
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      const p0 = { ...getPlayer(s.state).c.pos! };
      s.ctx.events.length = 0;
      const dmg = hitmuAd(s.ctx, qm, atk('claw', 'tlpt', 1, 4), 4);
      const p = getPlayer(s.state).c.pos!;
      if (keys(s.ctx).includes('adtyp.position_uncertain')) {
        expect(dmg).toBe(4);
        if (p.x !== p0.x || p.y !== p0.y) moved++;
      } else expect(keys(s.ctx)).toEqual(['adtyp.you_not_affected']); // MC never blocks (0)
    }
    expect(moved).toBeGreaterThan(10);
  });

  test('a cancelled one only says "You are not affected."', () => {
    const s = room();
    const qm = mon(s.state, 'nh:quantum_mechanic');
    setCancelled(s.ctx, qm.id);
    const p0 = { ...getPlayer(s.state).c.pos! };
    hitmuAd(s.ctx, qm, atk('claw', 'tlpt', 1, 4), 4);
    expect(keys(s.ctx)).toEqual(['adtyp.you_not_affected']);
    expect(getPlayer(s.state).c.pos).toMatchObject(p0);
  });

  test('on a no-teleport level she stays put', () => {
    const s = room();
    getLevel(s.state).def = 'nh:soko1-1' as DefId;
    const qm = mon(s.state, 'nh:quantum_mechanic');
    const p0 = { ...getPlayer(s.state).c.pos! };
    hitmuAd(s.ctx, qm, atk('claw', 'tlpt', 1, 4), 4);
    expect(keys(s.ctx)).toEqual(['adtyp.position_uncertain', 'tele.mysterious_force']);
    expect(getPlayer(s.state).c.pos).toMatchObject(p0);
  });

  test('the damage after the teleport is never fatal', () => {
    const s = room();
    const qm = mon(s.state, 'nh:quantum_mechanic');
    s.hero.c.hp = { cur: 1, max: 10 };
    const dmg = hitmuAd(s.ctx, qm, atk('claw', 'tlpt', 1, 4), 4);
    expect(dmg).toBe(1);
    expect(s.hero.c.hp.cur).toBe(2); // the caller takes the 1 back off
  });

  test('a full attack: the to-hit, the hit message, then the teleport', () => {
    let tele = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      mon(s.state, 'nh:quantum_mechanic');
      const id = Number(
        Object.keys(s.state.entities).find(
          (k) => s.state.entities[k]?.def === 'nh:quantum_mechanic',
        ),
      );
      monsterAttack(s.ctx, id);
      const k = keys(s.ctx);
      if (k.includes('combat.mon_hits')) {
        expect(k.indexOf('combat.mon_hits')).toBeLessThan(k.indexOf('adtyp.position_uncertain'));
        tele++;
      }
      expect(s.state.gameOver).toBeFalsy();
    }
    expect(tele).toBeGreaterThan(0);
  });

  test('against a monster: it lands elsewhere, unless the level forbids it', () => {
    const s = room();
    const qm = mon(s.state, 'nh:quantum_mechanic');
    const newt = mon(s.state, 'nh:newt', 4, 2);
    let gone = 0;
    for (let i = 0; i < 30; i++) {
      newt.c.pos = { level: 'dlvl1', x: 4, y: 2 };
      hit(s.ctx, qm, atk('claw', 'tlpt'), newt.id);
      if (newt.c.pos.x !== 4 || newt.c.pos.y !== 2) gone++;
    }
    expect(gone).toBeGreaterThan(15);
    getLevel(s.state).def = 'nh:soko1-1' as DefId;
    s.ctx.events.length = 0;
    newt.c.pos = { level: 'dlvl1', x: 4, y: 2 };
    hit(s.ctx, qm, atk('claw', 'tlpt'), newt.id);
    expect(newt.c.pos).toMatchObject({ x: 4, y: 2 });
    expect(keys(s.ctx)).toEqual(['adtyp.tele_restrict']);
  });
});

describe('status damage types against the hero', () => {
  test('AD_BLND blinds her for the damage, adding to the time left; a blindfold stops a claw', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    const mhm = hit(s.ctx, m, atk('claw', 'blnd'), s.hero.id, 7);
    expect(mhm.damage).toBe(0);
    expect(keys(s.ctx)).toEqual(['adtyp.blinds_you']);
    expect(timeoutLeft(s.state, s.hero, P.BLINDED)).toBe(7);
    hit(s.ctx, m, atk('claw', 'blnd'), s.hero.id, 5);
    expect(timeoutLeft(s.state, s.hero, P.BLINDED)).toBe(12);
    const t = room();
    wear(t, t.hero.id, 'nh:blindfold', 'blindfold');
    expect(canBlnd(t.ctx, m, t.hero, 'claw')).toBe(false);
    expect(canBlnd(t.ctx, m, t.hero, 'bite')).toBe(true);
  });

  test('AD_CONF: one hit in four confuses her and keeps the monster from doing it again', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    let n = 0;
    for (let i = 0; i < 40 && !n; i++) {
      hit(s.ctx, m, atk('claw', 'conf'), s.hero.id, 3);
      if (hasProp(s.hero, P.CONFUSION)) n++;
    }
    expect(n).toBe(1);
    expect(keys(s.ctx)).toEqual(['adtyp.getting_confused']);
    expect(timeoutLeft(s.state, s.hero, P.CONFUSION)).toBe(3);
    expect(mspecUsed(s.ctx, m.id)).toBeGreaterThanOrEqual(3);
    // mspec_used blocks it until it runs out
    for (let i = 0; i < 20; i++) hit(s.ctx, m, atk('claw', 'conf'), s.hero.id, 3);
    expect(timeoutLeft(s.state, s.hero, P.CONFUSION)).toBe(3);
  });

  test('AD_HALU does nothing to the hero (no hit message either)', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    expect(hit(s.ctx, m, atk('bite', 'halu'), s.hero.id).damage).toBe(0);
    expect(keys(s.ctx)).toEqual([]);
  });

  test('AD_LEGS: a pricked leg is wounded; boots may stop it; levitating she is out of reach', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    hit(s.ctx, m, atk('bite', 'legs', 1, 4), s.hero.id);
    expect(keys(s.ctx)).toEqual(['adtyp.pricks']);
    expect(hasProp(s.hero, P.WOUNDED_LEGS)).toBe(true);
    for (let i = 0; i < 30 && woundedLegSides(s.ctx) !== BOTH_SIDES; i++)
      hit(s.ctx, m, atk('bite', 'legs', 1, 4), s.hero.id);
    expect(woundedLegSides(s.ctx)).toBe(BOTH_SIDES);
    const t = room();
    wear(t, t.hero.id, 'nh:iron_shoes', 'boots');
    const m2 = mon(t.state, 'nh:newt');
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      t.ctx.events.length = 0;
      const mhm = hit(t.ctx, m2, atk('bite', 'legs', 1, 4), t.hero.id);
      const k = keys(t.ctx).filter((x) => x.startsWith('adtyp.'))[0]!;
      seen.add(k);
      if (k === 'adtyp.scratches_boot') expect(mhm.damage).toBe(0);
    }
    expect([...seen].sort()).toEqual([
      'adtyp.pricks_boot',
      'adtyp.pricks_exposed',
      'adtyp.scratches_boot',
    ]);
    const u = room();
    setItimeout(u.state, u.hero, P.LEVITATION, 50);
    const m3 = mon(u.state, 'nh:newt');
    expect(hit(u.ctx, m3, atk('bite', 'legs'), u.hero.id).damage).toBe(0);
    expect(keys(u.ctx)).toEqual(['adtyp.tries_to_reach']);
    expect(hasProp(u.hero, P.WOUNDED_LEGS)).toBe(false);
  });

  test('AD_SLOW takes away intrinsic speed one time in four', () => {
    const s = room();
    setIntrinsic(s.hero, P.FAST, true);
    const m = mon(s.state, 'nh:newt');
    let tries = 0;
    while (hasProp(s.hero, P.FAST) && tries < 60) {
      hit(s.ctx, m, atk('touch', 'slow'), s.hero.id);
      tries++;
    }
    expect(hasProp(s.hero, P.FAST)).toBe(false);
    expect(keys(s.ctx)).toEqual(['zap.slow_down']);
  });

  test('AD_DREN drains her energy one time in four and does no damage', () => {
    const s = room();
    setPw(s.ctx, { uen: 50, uenmax: 50 });
    const m = mon(s.state, 'nh:newt');
    for (let i = 0; i < 40 && pwOf(s.state).uen === 50; i++)
      expect(hit(s.ctx, m, atk('touch', 'dren', 1, 4), s.hero.id, 4).damage).toBe(0);
    expect(pwOf(s.state).uen).toBe(46);
    expect(keys(s.ctx)).toEqual(['antimagic.drain_away']);
  });

  test('AD_DISE: a non-vomitable illness that vomiting does not cure and prayer would', () => {
    const s = room();
    s.hero.c.attributes!.con = 18;
    const m = mon(s.state, 'nh:newt');
    hit(s.ctx, m, atk('bite', 'dise'), s.hero.id);
    expect(keys(s.ctx)).toEqual(['sick.deathly']);
    const sick = hungerData(s.ctx).sick!;
    expect(sick.type).toBe(SICK_NONVOMITABLE);
    expect(sick.remaining).toBeGreaterThanOrEqual(20);
    expect(sick.remaining).toBeLessThan(38);
    vomit(s.ctx);
    expect(hungerData(s.ctx).sick).not.toBeNull();
    // already sick: a third of the time left, plus one
    const left = hungerData(s.ctx).sick!.remaining;
    hit(s.ctx, m, atk('bite', 'dise'), s.hero.id);
    expect(hungerData(s.ctx).sick!.remaining).toBe(Math.trunc(left / 3) + 1);
    makeSick(s.ctx, 0, '', false); // prayer's TROUBLE_SICK: SICK_ALL
    expect(hungerData(s.ctx).sick).toBeNull();
  });

  test('the illness runs its course: no Con roll saves her', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = room(seed);
      s.hero.c.attributes!.con = 25;
      makeSick(s.ctx, 2, '@nh:newt', true, SICK_NONVOMITABLE);
      const seen: string[] = [];
      for (let i = 0; i < 4 && !s.state.gameOver; i++)
        seen.push(...s.msgKeys(s.step({ type: 'wait' })));
      expect(seen).toContain('sick.die');
      expect(s.state.gameOver?.killer).toBe('@nh:newt');
    }
  });

  test('food poisoning and illness together: curing one leaves the other', () => {
    const s = room();
    makeSick(s.ctx, 30, '@x', true);
    makeSick(s.ctx, 30, '@y', true, SICK_NONVOMITABLE);
    s.ctx.events.length = 0;
    vomit(s.ctx);
    expect(keys(s.ctx)).toContain('sick.somewhat_better');
    expect(hungerData(s.ctx).sick?.type).toBe(SICK_NONVOMITABLE);
  });

  test('AD_ENCH drains a worn piece of armor ("Your X seems less effective.")', () => {
    const s = room();
    const body = wear(s, s.hero.id, 'nh:ring_mail', 'body', 3);
    const m = mon(s.state, 'nh:newt');
    for (let i = 0; i < 40 && itemOf(s.state, body).spe === 3; i++)
      hit(s.ctx, m, atk('touch', 'ench'), s.hero.id);
    expect(itemOf(s.state, body).spe).toBe(2);
    expect(keys(s.ctx)).toContain('adtyp.less_effective');
  });

  test('magic cancellation: a cancelled attacker never drains, confuses or slows', () => {
    const s = room();
    setPw(s.ctx, { uen: 50, uenmax: 50 });
    setIntrinsic(s.hero, P.FAST, true);
    const m = mon(s.state, 'nh:newt');
    setCancelled(s.ctx, m.id);
    for (let i = 0; i < 40; i++) {
      hit(s.ctx, m, atk('touch', 'dren'), s.hero.id);
      hit(s.ctx, m, atk('touch', 'conf'), s.hero.id);
      hit(s.ctx, m, atk('touch', 'slow'), s.hero.id);
    }
    expect(pwOf(s.state).uen).toBe(50);
    expect(hasProp(s.hero, P.CONFUSION)).toBe(false);
    expect(hasProp(s.hero, P.FAST)).toBe(true);
  });
});

describe('status damage types against monsters', () => {
  test('AD_BLND blinds a monster for d(n, d) turns; the blindness wears off', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    const jackal = mon(s.state, 'nh:jackal', 4, 2);
    hit(s.ctx, m, atk('claw', 'blnd', 1, 4), jackal.id);
    expect(mcansee(s.ctx, jackal.id)).toBe(false);
    const n = mblinded(s.ctx, jackal.id);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
    expect(keys(s.ctx)).toEqual(['adtyp.is_blinded']);
    jackal.c.monster!.asleep = true; // pinned
    for (let i = 0; i < n; i++) s.step({ type: 'wait' });
    expect(mcansee(s.ctx, jackal.id)).toBe(true);
  });

  test('a permanently blind monster cannot be blinded again; an eyeless one never', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    const jackal = mon(s.state, 'nh:jackal', 4, 2);
    setMblinded(s.ctx, jackal.id, 0);
    expect(canBlnd(s.ctx, m, jackal, 'claw')).toBe(false);
    const lichen = mon(s.state, 'nh:lichen', 3, 3);
    expect(canBlnd(s.ctx, m, lichen, 'claw')).toBe(false);
  });

  test('AD_CONF, AD_HALU and AD_SLOW', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    const a = mon(s.state, 'nh:jackal', 4, 2);
    hit(s.ctx, m, atk('claw', 'conf'), a.id);
    expect(isMConfused(s.ctx, a.id)).toBe(true);
    const b = mon(s.state, 'nh:jackal', 3, 3);
    expect(hit(s.ctx, m, atk('claw', 'halu'), b.id).damage).toBe(0);
    expect(isMConfused(s.ctx, b.id)).toBe(true);
    const c = mon(s.state, 'nh:jackal', 4, 3);
    for (let i = 0; i < 30 && mspeed(s.ctx, c.id) !== 'slow'; i++)
      hit(s.ctx, m, atk('claw', 'slow'), c.id);
    expect(mspeed(s.ctx, c.id)).toBe('slow');
  });

  test('AD_DREN makes a spellcaster lethargic; AD_DISE spares fungi', () => {
    const s = room();
    const m = mon(s.state, 'nh:newt');
    const shaman = mon(s.state, 'nh:kobold_shaman', 4, 2);
    for (let i = 0; i < 40 && !mspecUsed(s.ctx, shaman.id); i++)
      expect(hit(s.ctx, m, atk('touch', 'dren'), shaman.id).damage).toBe(0);
    expect(mspecUsed(s.ctx, shaman.id)).toBeGreaterThanOrEqual(2);
    const lichen = mon(s.state, 'nh:lichen', 3, 3);
    expect(hit(s.ctx, m, atk('bite', 'dise'), lichen.id).damage).toBe(0);
    expect(hit(s.ctx, m, atk('bite', 'dise'), shaman.id, 3).damage).toBe(3);
  });

  test('a rust monster against a monster: no death, the hit flags stay a plain hit', () => {
    const s = room();
    const rm = mon(s.state, 'nh:rust_monster');
    const newt = mon(s.state, 'nh:newt', 4, 2);
    for (let seed = 0; seed < 10; seed++) {
      const r = mattackm(s.ctx, rm.id, newt.id);
      expect(r & M_ATTK.DEF_DIED).toBe(0);
    }
    expect(newt.c.hp?.cur).toBe(1000);
  });
});

describe('monster blindness', () => {
  test('a blind floating eye cannot defend itself', () => {
    const s = room();
    const eye = mon(s.state, 'nh:floating_eye');
    setMblinded(s.ctx, eye.id, 50);
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) {
      const r = s.step({ type: 'move', dir: 'e' });
      const k = r.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
      expect(k).not.toContain('passive.frozen_gaze');
      seen = k.includes('passive.blind_cannot_defend');
      eye.c.hp = { cur: 1000, max: 1000 };
    }
    expect(seen).toBe(true);
    expect(getPlayer(s.state).c.helpless).toBeUndefined();
  });
});
