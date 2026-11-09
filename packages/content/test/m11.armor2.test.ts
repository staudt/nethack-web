// m11 step 4: armor II. The 12 armor rows and the gloves shuffle; wearing them (do_wear.c
// Boots_on(), Gloves_on(), Helmet_on(), Cloak_on(), adj_abon(), toggle_displacement();
// attrib.c acurr() for gauntlets of power and the dunce cap, uchangealign()); Very_fast from speed
// boots (allmain.c u_calc_moveamt()); levitation boots; Fumbling's trip (timeout.c nh_timeout(),
// slip_or_trip()); displacement (monmove.c set_apparxy()); the oilskin cloak (mhitu.c
// u_slip_free()); mksobj_init()'s cursed armor; prayer troubles (pray.c in_trouble()).
// Outcomes are asserted with forced or searched rolls; monsters are pinned (speed 0).
import { getPlayer, sortedIds, type Ctx, type DefId, type EntityId, type Rng } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { setApparxy } from '../src/apparxy';
import { adjattrib, rawAttr } from '../src/attrib';
import { uSlipFree } from '../src/adtyping';
import { enlightenment } from '../src/enlightenment';
import { mksobj } from '../src/items';
import { setStoredMux } from '../src/mstate';
import { uState } from '../src/luck';
import { ARMOR_RANGES, isKnown } from '../src/o_init';
import { inTrouble } from '../src/pray';
import { P, hasProp, heroClairvoyant, setIntrinsic, setItimeout } from '../src/props';
import { heroMovement } from '../src/stats';
import { levitating } from '../src/trapstate';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, plainKit, render } from './itemHelpers';

/** A lit 15x5 room, the hero at (7,2). */
const ROOM = [
  '...............',
  '...............',
  '.......@.......',
  '...............',
  '...............',
];
type S = ReturnType<typeof levelSetup>;

/** The room, the kit uncursed and nothing worn but what the test puts on. */
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const id of sortedIds(s.state)) {
    const it = s.state.entities[String(id)]?.c.item;
    if (it?.carriedBy === s.state.playerId && it.equipped !== 'weapon') it.equipped = null;
  }
  s.step({ type: 'wait' });
  return s;
}
const wear = (s: S, item: EntityId): string[] => s.text(s.mod('nh:wear', { item }));
const takeoff = (s: S, item: EntityId): string[] => s.text(s.mod('nh:takeoff', { item }));
const enl = (s: S): string[] => enlightenment(s.ctx as unknown as Ctx).map((m) => render(m));
const hero = (s: S) => getPlayer(s.state);
const attrs = (s: S) => hero(s).c.attributes!;
const item = (s: S, id: EntityId) => s.state.entities[String(id)]!.c.item!;
/** Waits until the hero can act again. */
function settle(s: S): string[] {
  const out: string[] = [];
  for (let i = 0; i < 10 && hero(s).c.helpless; i++) out.push(...s.text(s.step({ type: 'wait' })));
  return out;
}
/** A rng whose rn2() always answers `v` (clamped below its bound). */
const fixedRn2 = (ctx: Ctx, v: number): Ctx => {
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rnd: (x) => real.rnd(x),
    d: (n, x) => real.d(n, x),
    rn2: (x) => Math.min(v, x - 1),
  };
  return { ...ctx, rng };
};

describe('the rows', () => {
  test("objects.h neighbours, the props and the gloves' shuffled descriptions", () => {
    const ids = defs.objects.map((d) => d.id as string);
    expect(ids.indexOf('nh:cornuthaum')).toBe(ids.indexOf('nh:fedora') + 1);
    expect(ids.indexOf('nh:dunce_cap')).toBe(ids.indexOf('nh:cornuthaum') + 1);
    expect(ids.indexOf('nh:gauntlets_of_dexterity')).toBe(ids.indexOf('nh:leather_gloves') + 3);
    expect(ids.indexOf('nh:levitation_boots')).toBe(ids.indexOf('nh:fumble_boots') + 1);
    expect(defs.object('nh:speed_boots' as DefId).prop).toBe(P.FAST);
    expect(defs.object('nh:gauntlets_of_fumbling' as DefId).prop).toBe(P.FUMBLING);
    expect(defs.object('nh:cloak_of_displacement' as DefId).prop).toBe(P.DISPLACED);
    expect(defs.object('nh:leather_gloves' as DefId).descKey).toBeUndefined();
    const gloves = ARMOR_RANGES.find((r) => r.objs.includes('nh:leather_gloves'))!;
    expect(gloves.looks.map((l) => render({ key: l }))).toEqual([
      'pair of old gloves',
      'pair of padded gloves',
      'pair of riding gloves',
      'pair of fencing gloves',
    ]);
    expect(render({ key: 'nh:gauntlets_of_power.plural' })).toBe('pairs of gauntlets of power');
  });

  test('mksobj_init() curses fumble and levitation boots, the helm of opposite alignment and gauntlets of fumbling 9 times in 10', () => {
    const s = room();
    const ctx = ctxFor(s.state);
    for (const id of ['nh:levitation_boots', 'nh:speed_boots']) {
      let cursed = 0;
      for (let i = 0; i < 200; i++) {
        const o = mksobj(ctx, defs.object(id as DefId));
        if (item(s, o).buc === 'cursed') cursed++;
      }
      // 90% vs 9/110 (rn2(10) && !rn2(11))
      if (id === 'nh:levitation_boots') expect(cursed).toBeGreaterThan(160);
      else expect(cursed).toBeLessThan(40);
    }
  });
});

describe('attribute armor', () => {
  test('gauntlets of power: Str 25 while worn, learned; her own Str comes back and can change meanwhile', () => {
    const s = room();
    attrs(s).str = 16;
    const gop = s.carry('nh:gauntlets_of_power');
    wear(s, gop);
    expect(attrs(s).str).toBe(125);
    expect(isKnown(s.state, defs, 'nh:gauntlets_of_power' as DefId)).toBe(true);
    // a loss while she wears them changes the hidden value only
    adjattrib(s.ctx as unknown as Ctx, 'str', -1, false);
    expect(attrs(s).str).toBe(125);
    expect(rawAttr(s.state, 'str')).toBe(15);
    takeoff(s, gop);
    settle(s);
    expect(attrs(s).str).toBe(15);
    expect(s.state.modData['nh']).not.toHaveProperty('attrHeld');
  });

  test('gauntlets of dexterity +2 and a helm of brilliance +1 add their enchantment', () => {
    const s = room();
    attrs(s).dex = 12;
    attrs(s).int = 10;
    attrs(s).wis = 11;
    const god = s.carry('nh:gauntlets_of_dexterity');
    item(s, god).spe = 2;
    wear(s, god);
    expect(attrs(s).dex).toBe(14);
    expect(isKnown(s.state, defs, 'nh:gauntlets_of_dexterity' as DefId)).toBe(true);
    const hob = s.carry('nh:helm_of_brilliance');
    item(s, hob).spe = 1;
    wear(s, hob);
    settle(s);
    expect([attrs(s).int, attrs(s).wis]).toEqual([11, 12]);
    takeoff(s, god);
    settle(s);
    takeoff(s, hob);
    settle(s);
    expect([attrs(s).dex, attrs(s).int, attrs(s).wis]).toEqual([12, 10, 11]);
  });

  test('a dunce cap: Int and Wis 6, cursed at once, "like sitting in a corner"; the cap holds Int', () => {
    const s = room();
    attrs(s).int = 14;
    attrs(s).wis = 9;
    const cap = s.carry('nh:dunce_cap');
    const out = wear(s, cap);
    expect(out).toContain('The conical hat glows black for a moment.');
    expect(out).toContain('You feel like sitting in a corner.');
    expect(item(s, cap).buc).toBe('cursed');
    expect([attrs(s).int, attrs(s).wis]).toEqual([6, 6]);
    const lines: string[] = [];
    const ctx = {
      ...(s.ctx as unknown as Ctx),
      emit: (e: { key?: string }) => lines.push(render(e as never)),
    } as Ctx;
    expect(adjattrib(ctx, 'int', 2, true)).toBe(false);
    expect(lines).toEqual(['Your cap constricts briefly, then relaxes again.']);
    // a cursed cap cannot come off
    expect(takeoff(s, cap).join(' ')).toMatch(/cursed/);
    expect(attrs(s).int).toBe(6);
  });

  test("a dumb hero's dunce cap makes her giddy (it raises her Int)", () => {
    const s = room();
    attrs(s).int = 4;
    const cap = s.carry('nh:dunce_cap');
    item(s, cap).buc = 'cursed';
    expect(wear(s, cap)).toContain('You feel giddy.');
    expect(attrs(s).int).toBe(6);
  });

  test('a cornuthaum costs a non-Wizard 1 Cha and blocks her clairvoyance', () => {
    const s = room();
    attrs(s).cha = 10;
    setIntrinsic(hero(s), P.CLAIRVOYANT, true);
    expect(heroClairvoyant(s.state)).toBe(true);
    const hat = s.carry('nh:cornuthaum');
    wear(s, hat);
    settle(s);
    expect(attrs(s).cha).toBe(9);
    expect(heroClairvoyant(s.state)).toBe(false);
    expect(enl(s)).toContain('You could be clairvoyant if not for your cornuthaum.');
    takeoff(s, hat);
    settle(s);
    expect(attrs(s).cha).toBe(10);
    expect(heroClairvoyant(s.state)).toBe(true);
  });
});

describe('boots', () => {
  test('speed boots: "You feel yourself speed up.", very fast, and slowed down when taken off', () => {
    const s = room();
    const boots = s.carry('nh:speed_boots');
    expect(wear(s, boots)).toContain('You feel yourself speed up.');
    settle(s);
    expect(enl(s).join(' ')).toMatch(/very fast/);
    // Very_fast gains a move when rn2(3) != 0; intrinsic Fast only when it is 0
    const ctx = fixedRn2(s.ctx as unknown as Ctx, 1);
    expect(heroMovement(ctx, s.state.playerId)).toBe(24);
    expect(takeoff(s, boots).join(' ')).toMatch(/You feel yourself slow down\./);
    settle(s);
    setIntrinsic(hero(s), P.FAST, true);
    expect(heroMovement(ctx, s.state.playerId)).toBe(12);
  });

  test('levitation boots lift her; cursed ones keep her up, uncursed ones let her down', () => {
    const s = room();
    const boots = s.carry('nh:levitation_boots');
    item(s, boots).buc = 'cursed';
    expect(wear(s, boots)).toContain('You start to float in the air!');
    settle(s);
    expect(levitating(s.ctx as unknown as Ctx)).toBe(true);
    expect(isKnown(s.state, defs, 'nh:levitation_boots' as DefId)).toBe(true);
    expect(inTrouble(s.ctx as unknown as Ctx)).toBe(3); // TROUBLE_CURSED_LEVITATION
    takeoff(s, boots);
    expect(levitating(s.ctx as unknown as Ctx)).toBe(true);
    item(s, boots).buc = 'uncursed';
    expect(takeoff(s, boots).join(' ')).toMatch(/You float gently to the/);
    settle(s);
    expect(levitating(s.ctx as unknown as Ctx)).toBe(false);
  });
});

describe('fumbling', () => {
  test('fumble boots start the trip timer; when it runs out after a move she trips and is helpless', () => {
    const s = room();
    const boots = s.carry('nh:fumble_boots');
    wear(s, boots);
    settle(s);
    const t = hero(s).c.props?.[P.FUMBLING]?.timeout ?? 0;
    expect(t - s.state.turn).toBeGreaterThanOrEqual(0);
    expect(t - s.state.turn).toBeLessThanOrEqual(20);
    // waiting when the timer runs out: no trip, the timer starts again
    setItimeout(s.state, hero(s), P.FUMBLING, 1);
    const waited = s.text(s.step({ type: 'wait' }));
    expect(waited.join(' ')).not.toMatch(/trip|stumble|flounder|slip/);
    expect(hero(s).c.props?.[P.FUMBLING]?.timeout ?? 0).toBeGreaterThan(s.state.turn);
    // moving: a trip (nothing lies on the floor here) and two helpless turns
    setItimeout(s.state, hero(s), P.FUMBLING, 1);
    const moved = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(
      moved.some((m) =>
        /^You (trip over your own feet|slip and nearly fall|flounder|stumble)\.$/.test(m),
      ),
    ).toBe(true);
    expect(hero(s).c.helpless?.reasonKey).toBe('helpless.fumbling');
    expect(enl(s)).toContain('You fumble.');
    // taking them off ends it
    settle(s);
    takeoff(s, boots);
    settle(s);
    expect(hasProp(hero(s), P.FUMBLING)).toBe(false);
    expect(hero(s).c.props?.[P.FUMBLING]).toBeUndefined();
  });

  test('she trips over what lies where she stepped; cursed gauntlets of fumbling are a prayer trouble', () => {
    const s = room();
    const g = s.carry('nh:gauntlets_of_fumbling');
    item(s, g).buc = 'cursed';
    wear(s, g);
    settle(s);
    expect(inTrouble(s.ctx as unknown as Ctx)).toBe(-2); // TROUBLE_FUMBLING
    s.give('nh:dagger', { at: { level: 'dlvl1', x: s.here.x + 1, y: s.here.y } });
    setItimeout(s.state, hero(s), P.FUMBLING, 1);
    const moved = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(moved).toContain('You trip over a dagger.');
  });
});

describe('cloaks', () => {
  test('a cloak of displacement: the line, then monsters that see her guess within two squares', () => {
    const s = room();
    const cloak = s.carry('nh:cloak_of_displacement');
    expect(wear(s, cloak)).toContain(
      'You feel that monsters have difficulty pinpointing your location.',
    );
    expect(enl(s).join(' ')).toMatch(/displaced/);
    const id = addMon(s.state, 'nh:jackal', s.here.x + 3, s.here.y, {});
    const mon = s.state.entities[String(id)]!;
    const u = hero(s).c.pos!;
    let wrong = 0;
    for (let i = 0; i < 60; i++) {
      // a fresh guess each time (one that found her is kept while she stays put)
      setStoredMux(s.ctx as unknown as Ctx, id, null);
      const g = setApparxy(s.ctx as unknown as Ctx, mon);
      expect(Math.max(Math.abs(g.x - u.x), Math.abs(g.y - u.y))).toBeLessThanOrEqual(2);
      if (g.x !== u.x || g.y !== u.y) wrong++;
    }
    expect(wrong).toBeGreaterThan(20); // found 1 time in 4
    expect(takeoff(s, cloak)).toContain(
      'You feel that monsters no longer have difficulty pinpointing your location.',
    );
  });

  test('an oilskin cloak fits very tightly, and a python slips off it', () => {
    const s = room();
    const cloak = s.carry('nh:oilskin_cloak');
    expect(wear(s, cloak)).toContain('The slippery cloak fits very tightly.');
    const id = addMon(s.state, 'nh:python', s.here.x + 1, s.here.y, {});
    const mon = s.state.entities[String(id)]!;
    const wrap = defs.monster('nh:python' as DefId).attacks.find((a) => a.ad === 'wrap')!;
    const lines: string[] = [];
    const ctx = {
      ...(s.ctx as unknown as Ctx),
      emit: (e: { key?: string }) => lines.push(render(e as never)),
    } as Ctx;
    expect(uSlipFree(ctx, mon, wrap)).toBe(true);
    expect(lines).toEqual(['The python slips off of your slippery cloak!']);
  });
});

describe('the helm of opposite alignment', () => {
  test('it turns a neutral hero lawful or chaotic by its id, curses itself, confuses her; off, she is neutral again', () => {
    const s = room();
    const helm = s.carry('nh:helm_of_opposite_alignment');
    const out = wear(s, helm);
    expect(out).toContain('Your mind oscillates briefly.');
    expect(out.some((m) => /glows black for a moment\.$/.test(m))).toBe(true);
    expect(uState(s.state).alignType).toBe(helm % 2 ? -1 : 1);
    expect(uState(s.state).alignRecord).toBe(0);
    expect(item(s, helm).buc).toBe('cursed');
    expect(hasProp(hero(s), P.CONFUSION)).toBe(true);
    expect(isKnown(s.state, defs, 'nh:helm_of_opposite_alignment' as DefId)).toBe(true);
    settle(s);
    item(s, helm).buc = 'uncursed';
    expect(takeoff(s, helm)).toContain('Your mind is back in sync with your body.');
    expect(uState(s.state).alignType).toBe(0);
  });
});

describe('monsters', () => {
  test('a monster wearing speed boots moves as MFAST', () => {
    const s = room();
    const id = addMon(s.state, 'nh:hill_orc', 2, 2, {});
    const brain = defs.brain('nh:melee' as DefId);
    const ctx = fixedRn2(s.ctx as unknown as Ctx, 0);
    const slow = brain.movement!(ctx, id);
    const boots = mksobj(ctxFor(s.state), defs.object('nh:speed_boots' as DefId), { init: false });
    const it = item(s, boots);
    it.carriedBy = id;
    it.equipped = 'boots';
    delete s.state.entities[String(boots)]!.c.pos;
    expect(brain.movement!(ctx, id)).toBeGreaterThan(slow);
  });
});
