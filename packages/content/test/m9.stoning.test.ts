// m9 step 6: stoning. A cockatrice's hiss and the five-turn countdown, its cures (lizard and acidic
// corpses, prayer), touching, wielding, throwing, kicking and eating cockatrice corpses, the
// passive against bare hands and feet, monsters turned to stone (a statue holding their things),
// pets keeping away, and a stoning gaze.
import {
  contents,
  getPlayer,
  inventoryOf,
  itemsAt,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK, mhitmAdtyping, newMhm, type Mhm } from '../src/adtyping';
import { POISON, dogfood } from '../src/dog';
import { endHow } from '../src/endstate';
import { inTrouble, setU } from '../src/index';
import { mkcorpse, weight } from '../src/items';
import { mattackm } from '../src/mhitm';
import { gazemu } from '../src/mhitu';
import { setCancelled } from '../src/mstate';
import { P, setIntrinsic, setItimeout, timeoutLeft } from '../src/props';
import { monstone } from '../src/stoning';
import { isStoned, makeStoned, stonedKiller } from '../src/stonestate';
import { passive } from '../src/uhitm_passive';
import { ctxFor, defs, engine, levelSetup, plainKit, render } from './itemHelpers';
import { alive, keys, mon, room, type FullCtx } from './m9helpers';

const TUCH = defs.monster('nh:chickatrice' as DefId).attacks[1]!;
const hero = (state: GameState): Entity => getPlayer(state);

const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

function hit(s: ReturnType<typeof room>, magr: EntityId, mdef?: EntityId): Mhm {
  const mhm = newMhm(0);
  mhitmAdtyping(s.ctx, magr, TUCH, mdef ?? s.state.playerId, mhm, { vis: true, mwep: null });
  return mhm;
}

/** A plain room with the hero's (uncursed) kit, without worn gloves or boots. */
function plain(seed = 1) {
  const s = levelSetup(['.......', '...@...', '.......'], seed);
  plainKit(s.state);
  return s;
}

const corpseOf = (s: ReturnType<typeof plain>, mon: string, where: 'carry' | 'floor'): EntityId =>
  mkcorpse(
    s.ctx,
    defs.monster(mon as DefId),
    where === 'carry' ? { carriedBy: s.state.playerId } : { at: s.here },
  );

function wear(s: ReturnType<typeof plain>, id: string, slot: 'gloves' | 'boots'): void {
  const g = s.carry(id);
  s.state.entities[String(g)]!.c.item!.equipped = slot;
}

const statuesAt = (state: GameState, x: number, y: number): Entity[] =>
  itemsAt(defs, state, 'dlvl1', x, y).filter((o) => o.def === 'nh:statue');

describe('the hiss (AD_STON against the hero)', () => {
  test('1 time in 3 it hisses; 1 in 10 of those starts five turns of stoning', () => {
    const s = room();
    const c = mon(s.state, 'nh:chickatrice');
    let n = 0;
    while (!isStoned(s.state) && n++ < 1000) hit(s, c.id);
    expect(isStoned(s.state)).toBe(true);
    expect(texts(s.ctx)).toContain("You hear the chickatrice's hissing!");
    expect(timeoutLeft(s.state, hero(s.state), P.STONED)).toBe(5);
    expect(stonedKiller(s.state)).toBe('@nh:chickatrice');
    // a second hiss does not restart it
    s.state.turn += 1;
    for (let i = 0; i < 200; i++) hit(s, c.id);
    expect(timeoutLeft(s.state, hero(s.state), P.STONED)).toBe(4);
  });

  test('a cancelled chickatrice only coughs; stone resistance protects', () => {
    const s = room();
    const c = mon(s.state, 'nh:chickatrice');
    setCancelled(s.ctx, c.id);
    for (let i = 0; i < 300; i++) hit(s, c.id);
    expect(isStoned(s.state)).toBe(false);
    expect(texts(s.ctx)).toContain('You hear a cough from the chickatrice!');
    const r = room(2);
    const c2 = mon(r.state, 'nh:chickatrice');
    setIntrinsic(hero(r.state), P.STONE_RES, true);
    for (let i = 0; i < 300; i++) hit(r, c2.id);
    expect(isStoned(r.state)).toBe(false);
    expect(keys(r.ctx)).toContain('stone.hissing');
  });
});

describe('the countdown', () => {
  test('five lines, unable to move from the third, then petrified by the chickatrice', () => {
    const s = plain();
    makeStoned(s.ctx, 5, null, '@nh:chickatrice');
    const stages = [
      'You are slowing down.',
      'Your limbs are stiffening.',
      'Your limbs have turned to stone.',
      'You have turned to stone.',
      'You are a statue.',
    ];
    const perStep: string[][] = [];
    for (let i = 0; i < 8 && !s.state.gameOver; i++)
      perStep.push(s.text(s.step({ type: 'wait' })).filter((l) => stages.includes(l)));
    // two turns she can act in, then a single step: she cannot move until it is over
    expect(perStep).toEqual([[stages[0]], [stages[1]], stages.slice(2)]);
    expect(s.state.gameOver?.killer).toBe('@nh:chickatrice');
    expect(endHow(s.state)).toBe('stoning');
    expect(render({ key: 'end.killer.stoning', params: { killer: 'a chickatrice' } })).toBe(
      'petrified by a chickatrice',
    );
  });

  test('life saving brings her back, no longer turning to stone', () => {
    const s = plain();
    const a = s.carry('nh:amulet_of_life_saving');
    s.state.entities[String(a)]!.c.item!.equipped = 'amulet';
    makeStoned(s.ctx, 5, null, '@nh:chickatrice');
    const t: string[] = [];
    for (let i = 0; i < 6; i++) t.push(...s.text(s.step({ type: 'wait' })));
    expect(t).toContain('You are a statue.');
    expect(t).toContain('But wait...');
    expect(s.state.gameOver).toBeNull();
    expect(isStoned(s.state)).toBe(false);
    expect(stonedKiller(s.state)).toBeUndefined();
  });

  test('intrinsic speed is lost at "You are slowing down."', () => {
    const s = plain();
    setIntrinsic(hero(s.state), P.FAST, true);
    makeStoned(s.ctx, 5, null, '@nh:chickatrice');
    s.step({ type: 'wait' });
    expect(hero(s.state).c.props?.[P.FAST]?.intrinsic ?? false).toBe(false);
  });

  for (const stage of [0, 1]) {
    test(`eating a lizard corpse after stage ${stage} cures it ("You feel limber!")`, () => {
      const s = plain();
      makeStoned(s.ctx, 5, null, '@nh:chickatrice');
      for (let i = 0; i <= stage; i++) s.step({ type: 'wait' });
      expect(isStoned(s.state)).toBe(true);
      const lizard = corpseOf(s, 'nh:lizard', 'carry');
      const t = s.text(s.mod('nh:eat', { item: lizard }));
      expect(t).toContain('You feel limber!');
      expect(isStoned(s.state)).toBe(false);
      for (let i = 0; i < 10; i++) s.step({ type: 'wait' });
      expect(s.state.gameOver).toBeNull();
    });
  }

  test('an acidic corpse cures it too', () => {
    const s = plain();
    makeStoned(s.ctx, 5, null, '@nh:chickatrice');
    s.step({ type: 'wait' });
    const blob = corpseOf(s, 'nh:acid_blob', 'carry');
    expect(s.text(s.mod('nh:eat', { item: blob }))).toContain('You feel limber!');
    expect(isStoned(s.state)).toBe(false);
  });

  test('prayer fixes it as the worst major trouble: "You feel more limber."', () => {
    const s = plain();
    setU(s.ctx, { ublesscnt: 0, alignRecord: 5 });
    makeStoned(s.ctx, 5, null, '@nh:chickatrice');
    expect(inTrouble(ctxFor(s.state) as never)).toBe(14); // TROUBLE_STONED
    const ask = engine.step(s.state, { type: 'mod', action: 'nh:pray' as DefId });
    const r = engine.step(s.state, { type: 'answer', promptId: ask.prompt!.id, value: true });
    expect(s.text(r)).toContain('You feel more limber.');
    expect(isStoned(s.state)).toBe(false);
  });

  test('lizard corpses never rot', () => {
    const s = plain();
    const before = s.state.timers.length;
    corpseOf(s, 'nh:lizard', 'floor');
    expect(s.state.timers.length).toBe(before);
  });
});

describe('cockatrice corpses', () => {
  test('picking one up bare-handed is a fatal mistake; with gloves it is fine', () => {
    const s = plain();
    corpseOf(s, 'nh:cockatrice', 'floor');
    const t = s.text(s.mod('nh:pickup'));
    expect(t).toContain('Touching a cockatrice corpse is a fatal mistake.');
    expect(t).toContain('You turn to stone...');
    expect(s.state.gameOver?.killer).toBe('@killer.ston.corpse.nh:cockatrice');
    expect(render({ key: 'killer.ston.corpse.nh:cockatrice' })).toBe('a cockatrice corpse');

    const g = plain();
    wear(g, 'nh:leather_gloves', 'gloves');
    const c = corpseOf(g, 'nh:cockatrice', 'floor');
    g.mod('nh:pickup');
    expect(g.state.gameOver).toBeNull();
    expect(g.state.entities[String(c)]?.c.item?.carriedBy).toBe(g.state.playerId);
  });

  test('wielding one bare-handed petrifies; it is offered as a weapon', () => {
    const s = plain();
    const c = corpseOf(s, 'nh:cockatrice', 'carry');
    const offers = engine.query(s.state).actionsFor({ kind: 'item', id: c });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:wield')).toBe(
      true,
    );
    const t = s.text(s.mod('nh:wield', { item: c }));
    expect(t).toContain('You wield the cockatrice corpse in your bare hands.');
    expect(s.state.gameOver?.killer).toBe('@killer.ston.wielding.nh:cockatrice');
    expect(endHow(s.state)).toBe('stoning');
  });

  test('wielded with gloves it turns a jackal to stone: a statue holding its things', () => {
    const s = plain();
    wear(s, 'nh:leather_gloves', 'gloves');
    const c = corpseOf(s, 'nh:cockatrice', 'carry');
    s.mod('nh:wield', { item: c });
    expect(s.state.entities[String(c)]?.c.item?.equipped).toBe('weapon');
    const j = mon(s.state, 'nh:jackal', 4, 1);
    j.c.monster!.asleep = true;
    const dagger = s.give('nh:dagger', { carriedBy: j.id });
    const exp0 = hero(s.state).c.experience?.points ?? 0;
    let t: string[] = [];
    for (let i = 0; i < 40 && alive(s.state, j.id); i++)
      t = t.concat(s.text(s.step({ type: 'move', dir: 'e' })));
    expect(alive(s.state, j.id)).toBe(false);
    expect(t).toContain('You hit the jackal with the cockatrice corpse.');
    expect(t).toContain('The jackal turns to stone.');
    const st = statuesAt(s.state, 4, 1);
    expect(st).toHaveLength(1);
    expect(st[0]!.c.item?.corpseOf).toBe('nh:jackal');
    expect(contents(s.state, st[0]!.id).map((o) => o.id)).toContain(dagger);
    expect(hero(s.state).c.experience?.points ?? 0).toBeGreaterThan(exp0);
    expect(s.state.gameOver).toBeNull();
  });

  test('throwing or kicking one bare-handed or barefoot petrifies', () => {
    const s = plain();
    const c = corpseOf(s, 'nh:cockatrice', 'carry');
    s.mod('nh:throw', { item: c });
    const p = s.state.pendingPrompt?.prompt;
    if (!p) throw new Error('no prompt');
    const t = s.text(engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' }));
    expect(t).toContain('You throw the cockatrice corpse with your bare hands.');
    expect(s.state.gameOver?.killer).toBe('@killer.ston.throwing.nh:cockatrice');

    const k = plain(2);
    // (kick: the corpse lies next to her)
    const c2 = k.state.entities[String(corpseOf(k, 'nh:cockatrice', 'floor'))]!;
    c2.c.pos = { level: 'dlvl1', x: 4, y: 1 };
    const kt = k.text(k.mod('nh:kick', { dir: 'e' }));
    expect(kt).toContain('You kick the cockatrice corpse with your bare feet.');
    expect(k.state.gameOver?.killer).toBe('@killer.ston.kicking.nh:cockatrice');
  });

  test('eating one is fatal ("tasting cockatrice meat") unless she resists', () => {
    const s = plain();
    const c = corpseOf(s, 'nh:cockatrice', 'carry');
    // (picking it up first would have killed her: wear gloves to hold it)
    wear(s, 'nh:leather_gloves', 'gloves');
    const t = s.text(s.mod('nh:eat', { item: c }));
    expect(t).toContain('You turn to stone.');
    expect(s.state.gameOver?.killer).toBe('@killer.ston.tasting.nh:cockatrice');
    expect(render({ key: 'killer.ston.tasting.nh:cockatrice' })).toBe('tasting cockatrice meat');

    const r = plain(2);
    setIntrinsic(hero(r.state), P.STONE_RES, true);
    const c2 = corpseOf(r, 'nh:cockatrice', 'carry');
    r.mod('nh:eat', { item: c2 });
    expect(r.state.gameOver).toBeNull();
  });
});

describe("the cockatrice's passive", () => {
  const snapOf = (s: ReturnType<typeof room>, e: Entity) => ({
    id: e.id,
    def: defs.monster(e.def),
    level: e.c.monster!.level,
    pos: { ...e.c.pos! },
    mcan: false,
  });

  test('hitting it bare-handed or kicking it barefoot turns her to stone', () => {
    const s = room();
    for (const o of inventoryOf(s.state, s.state.playerId)) o.c.item!.equipped = null;
    const c = mon(s.state, 'nh:cockatrice');
    passive(s.ctx, snapOf(s, c), true, true, null, 'weapon');
    expect(texts(s.ctx)).toContain('You turn to stone...');
    expect(s.state.gameOver?.killer).toBe('@nh:cockatrice');
    expect(endHow(s.state)).toBe('stoning');

    const k = room(2);
    const c2 = mon(k.state, 'nh:cockatrice');
    passive(k.ctx, snapOf(k, c2), true, true, null, 'kick');
    expect(k.state.gameOver?.killer).toBe('@nh:cockatrice');
  });

  test('gloves, a weapon, boots for a kick or a miss keep her safe', () => {
    const s = room();
    const c = mon(s.state, 'nh:cockatrice');
    const sword = inventoryOf(s.state, s.state.playerId).find(
      (o) => o.c.item?.equipped === 'weapon',
    );
    passive(s.ctx, snapOf(s, c), true, true, sword ?? null, 'weapon');
    passive(s.ctx, snapOf(s, c), false, true, null, 'weapon');
    const g = s.give('nh:leather_gloves', { carriedBy: s.state.playerId });
    s.state.entities[String(g)]!.c.item!.equipped = 'gloves';
    passive(s.ctx, snapOf(s, c), true, true, null, 'weapon');
    const b = s.give('nh:iron_shoes', { carriedBy: s.state.playerId });
    s.state.entities[String(b)]!.c.item!.equipped = 'boots';
    passive(s.ctx, snapOf(s, c), true, true, s.state.entities[String(b)]!, 'kick');
    expect(s.state.gameOver).toBeNull();
  });
});

describe('monsters and stoning', () => {
  test("a cockatrice's touch turns a jackal to stone; a resistant lizard only takes no damage", () => {
    const s = room();
    const c = mon(s.state, 'nh:cockatrice');
    const j = mon(s.state, 'nh:jackal', 4, 2);
    const mhm = hit(s, c.id, j.id);
    expect(mhm.hitflags & M_ATTK.DEF_DIED).toBeTruthy();
    expect(alive(s.state, j.id)).toBe(false);
    expect(texts(s.ctx)).toContain('The jackal turns to stone!');
    expect(statuesAt(s.state, 4, 2)).toHaveLength(1);
    const l = mon(s.state, 'nh:lizard', 2, 3);
    const m2 = hit(s, c.id, l.id);
    expect(alive(s.state, l.id)).toBe(true);
    expect(m2.damage).toBe(0);
  });

  test('a jackal biting a cockatrice turns to stone', () => {
    let stoned = false;
    for (let seed = 1; seed <= 30 && !stoned; seed++) {
      const s = room(seed);
      const c = mon(s.state, 'nh:cockatrice');
      const j = mon(s.state, 'nh:jackal', 4, 2);
      const res = mattackm(s.ctx, j.id, c.id);
      if (res & M_ATTK.AGR_DIED) {
        stoned = true;
        expect(alive(s.state, j.id)).toBe(false);
        expect(statuesAt(s.state, 4, 2)[0]?.c.item?.corpseOf).toBe('nh:jackal');
      }
    }
    expect(stoned).toBe(true);
  });

  test('monstone(): the statue holds the inventory and weighs 1.5 corpses plus it', () => {
    const s = room();
    const k = mon(s.state, 'nh:kobold', 4, 2);
    const dagger = s.give('nh:dagger', { carriedBy: k.id });
    monstone(s.ctx, k);
    expect(alive(s.state, k.id)).toBe(false);
    const st = statuesAt(s.state, 4, 2)[0]!;
    expect(contents(s.state, st.id).map((o) => o.id)).toEqual([dagger]);
    const kw = defs.monster('nh:kobold' as DefId).weight;
    expect(weight(defs, st, s.state)).toBe(
      Math.max(Math.trunc((3 * kw) / 2), 300) + weight(defs, s.state.entities[String(dagger)]!),
    );
    expect(render({ key: 'nh:statue.of', params: { mon: '@nh:kobold' } })).toBe(
      'statue of a kobold',
    );
  });

  test('a nymph stealing a cockatrice corpse without gloves turns to stone', () => {
    const s = room();
    for (const o of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(o.id)];
    mkcorpse(s.ctx, defs.monster('nh:cockatrice' as DefId), { carriedBy: s.state.playerId });
    const n = mon(s.state, 'nh:water_nymph');
    const sitm = defs.monster('nh:water_nymph' as DefId).attacks[0]!;
    const mhm = newMhm(0);
    mhitmAdtyping(s.ctx, n.id, sitm, s.state.playerId, mhm, { vis: true, mwep: null });
    expect(alive(s.state, n.id)).toBe(false);
    expect(mhm.hitflags).toBe(M_ATTK.AGR_DIED);
    expect(texts(s.ctx)).toContain('The water nymph turns to stone.');
  });

  test('pets do not eat petrifying corpses', () => {
    const s = room();
    const d = mon(s.state, 'nh:little_dog');
    const ck = mkcorpse(s.ctx, defs.monster('nh:cockatrice' as DefId), { at: s.here });
    const lz = mkcorpse(s.ctx, defs.monster('nh:lizard' as DefId), { at: s.here });
    expect(dogfood(s.ctx, d, s.state.entities[String(ck)]!)).toBe(POISON);
    expect(dogfood(s.ctx, d, s.state.entities[String(lz)]!)).not.toBe(POISON);
  });
});

describe('a stoning gaze (Medusa)', () => {
  const GAZE = { at: 'gaze', ad: 'ston', n: 0, d: 0 } as const;

  test('meeting it turns her to stone; blind she is safe', () => {
    const s = room();
    const j = mon(s.state, 'nh:jackal', 5, 2);
    gazemu(s.ctx, j, GAZE);
    expect(texts(s.ctx)).toEqual(["You meet the jackal's gaze.", 'You turn to stone...']);
    expect(endHow(s.state)).toBe('stoning');

    const b = room(2);
    const j2 = mon(b.state, 'nh:jackal', 5, 2);
    setItimeout(b.state, hero(b.state), P.BLINDED, 50);
    b.step({ type: 'wait' }); // vision
    gazemu(b.ctx, j2, GAZE);
    expect(b.state.gameOver).toBeNull();
  });
});
