// m9 step 8: sliming (a green slime's touch, the ten-turn countdown ending as a green slime, fire,
// prayer and polymorph cures, monsters turned into slime), the nurse's healing and mind flayers'
// brain eating (helmets, Intelligence, spells and skills, brainlessness, the other tentacles
// skipped), in all three directions. Outcomes are checked over many tries, never on a lucky seed.
import {
  getPlayer,
  inventoryOf,
  type AttackDef,
  type DefId,
  type Entity,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mhitmAdtyping, newMhm, type Mhm } from '../src/adtyping';
import { monsterAttack } from '../src/combat';
import { endHow } from '../src/endstate';
import { inTrouble, setU } from '../src/index';
import { mattackm } from '../src/mhitm';
import { isFleeing } from '../src/monflee';
import { setCancelled } from '../src/mstate';
import { polymon } from '../src/polyself';
import { P, setIntrinsic } from '../src/props';
import { drainWeaponSkill } from '../src/skills';
import { isSlimed, makeSlimed, slimedKiller } from '../src/slimestate';
import { knownSpells, losespells } from '../src/spell';
import { heroFormId } from '../src/upoly';
import { ctxFor, defs, engine, levelSetup, plainKit, render } from './itemHelpers';
import { alive, mon, room, type FullCtx } from './m9helpers';

const hero = (state: GameState): Entity => getPlayer(state);
const attackOf = (id: string, ad: string): AttackDef =>
  defs.monster(id as DefId).attacks.find((a) => a.ad === ad)!;
const SLIM = attackOf('nh:green_slime', 'slim');
const HEAL = attackOf('nh:nurse', 'heal');
const DRIN = attackOf('nh:mind_flayer', 'drin');
const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

function hit(s: ReturnType<typeof room>, magr: number, at: AttackDef, mdef?: number, dmg = 0) {
  const mhm: Mhm = newMhm(dmg);
  mhitmAdtyping(s.ctx, magr, at, mdef ?? s.state.playerId, mhm, { vis: true, mwep: null });
  return mhm;
}

const unequipAll = (state: GameState): void => {
  for (const o of inventoryOf(state, state.playerId)) if (o.c.item) o.c.item.equipped = null;
};

function plain(seed = 1) {
  const s = levelSetup(['.......', '...@...', '.......'], seed);
  plainKit(s.state);
  return s;
}

describe('sliming', () => {
  test('a green slime\'s touch: "You don\'t feel very well.", then "Yuck!"', () => {
    const s = room();
    const g = mon(s.state, 'nh:green_slime');
    hit(s, g.id, SLIM);
    expect(texts(s.ctx)).toContain("You don't feel very well.");
    expect(isSlimed(s.state)).toBe(true);
    expect(slimedKiller(s.state)).toBe('@nh:green_slime');
    s.ctx.events.length = 0;
    hit(s, g.id, SLIM);
    expect(texts(s.ctx)).toEqual(['Yuck!']);
  });

  test('Unchanging leaves her unaffected; a cancelled slime does nothing', () => {
    const s = room();
    const g = mon(s.state, 'nh:green_slime');
    setIntrinsic(hero(s.state), P.UNCHANGING, true);
    hit(s, g.id, SLIM);
    expect(texts(s.ctx)).toEqual(['You are unaffected.']);
    setIntrinsic(hero(s.state), P.UNCHANGING, false);
    s.ctx.events.length = 0;
    setCancelled(s.ctx, g.id);
    hit(s, g.id, SLIM);
    expect(texts(s.ctx)).toEqual([]);
    expect(isSlimed(s.state)).toBe(false);
  });

  test('the countdown: five lines, then she turns into a green slime and dies', () => {
    const s = plain();
    makeSlimed(s.ctx, 10, null, '@nh:green_slime');
    const t: string[] = [];
    for (let i = 0; i < 12 && !s.state.gameOver; i++) t.push(...s.text(s.step({ type: 'wait' })));
    const stages = [
      'You are turning a little green.',
      'Your limbs are getting oozy.',
      'Your skin begins to peel away.',
      'You are turning into a green slime.',
      'You have become a green slime.',
    ];
    expect(t.filter((l) => stages.includes(l))).toEqual(stages);
    expect(t).toContain('You turn into a green slime!');
    expect(s.state.gameOver?.killer).toBe('@nh:green_slime');
    expect(endHow(s.state)).toBe('turned_slime');
    expect(render({ key: 'end.killer.turned_slime', params: { killer: 'a green slime' } })).toBe(
      'turned to slime by a green slime',
    );
  });

  test('life saved, she stays a green slime', () => {
    const s = plain();
    const a = s.carry('nh:amulet_of_life_saving');
    s.state.entities[String(a)]!.c.item!.equipped = 'amulet';
    makeSlimed(s.ctx, 10, null, '@nh:green_slime');
    const t: string[] = [];
    for (let i = 0; i < 12; i++) t.push(...s.text(s.step({ type: 'wait' })));
    expect(t).toContain('But wait...');
    expect(s.state.gameOver).toBeNull();
    expect(heroFormId(s.state)).toBe('nh:green_slime');
    expect(isSlimed(s.state)).toBe(false);
  });

  test('fire burns it away: "The slime that covers you is burned away!"', () => {
    const s = room();
    makeSlimed(s.ctx, 10, null, '@nh:green_slime');
    const j = mon(s.state, 'nh:jackal');
    hit(s, j.id, { at: 'touch', ad: 'fire', n: 1, d: 4 });
    expect(texts(s.ctx)).toContain('The slime that covers you is burned away!');
    expect(isSlimed(s.state)).toBe(false);
    expect(slimedKiller(s.state)).toBeUndefined();
  });

  test('prayer fixes it (TROUBLE_SLIMED): "The slime disappears."', () => {
    const s = plain();
    setU(s.ctx, { ublesscnt: 0, alignRecord: 5 });
    makeSlimed(s.ctx, 10, null, '@nh:green_slime');
    expect(inTrouble(ctxFor(s.state) as never)).toBe(13);
    const ask = engine.step(s.state, { type: 'mod', action: 'nh:pray' as DefId });
    const r = engine.step(s.state, { type: 'answer', promptId: ask.prompt!.id, value: true });
    expect(s.text(r)).toContain('The slime disappears.');
    expect(isSlimed(s.state)).toBe(false);
  });

  test('turning into a flaming form burns it; into a green slime cures it silently', () => {
    const s = room();
    makeSlimed(s.ctx, 10, null, '@nh:green_slime');
    polymon(s.ctx, 'nh:fire_elemental' as DefId, false);
    expect(texts(s.ctx)).toContain('The slime burns away!');
    expect(isSlimed(s.state)).toBe(false);
    makeSlimed(s.ctx, 10, null, '@nh:green_slime');
    s.ctx.events.length = 0;
    polymon(s.ctx, 'nh:green_slime' as DefId, false);
    expect(isSlimed(s.state)).toBe(false);
    expect(texts(s.ctx).some((l) => l.includes('slime') && l.includes('burn'))).toBe(false);
  });

  test('a green slime turns a monster into a green slime, 1 time in 4', () => {
    const s = room();
    const g = mon(s.state, 'nh:green_slime');
    const j = mon(s.state, 'nh:jackal', 4, 2);
    let n = 0;
    while (j.def === 'nh:jackal' && n++ < 200) hit(s, g.id, SLIM, j.id);
    expect(j.def).toBe('nh:green_slime');
    expect(n).toBeGreaterThan(0);
    // a slimeproof defender stays itself
    const f = mon(s.state, 'nh:flaming_sphere', 4, 3);
    for (let i = 0; i < 100; i++) hit(s, g.id, SLIM, f.id);
    expect(f.def).toBe('nh:flaming_sphere');
  });

  test('the hero as a green slime: "You turn the jackal into slime."', () => {
    const s = room();
    polymon(s.ctx, 'nh:green_slime' as DefId, false);
    const j = mon(s.state, 'nh:jackal');
    for (let n = 0; j.def === 'nh:jackal' && n < 200; n++) hit(s, s.state.playerId, SLIM, j.id);
    expect(j.def).toBe('nh:green_slime');
    expect(texts(s.ctx)).toContain('You turn the jackal into slime.');
  });
});

describe('the nurse (AD_HEAL)', () => {
  test('an unarmed, unarmored hero is healed and her maximum grows, until the nurse leaves', () => {
    const s = room();
    hero(s.state).c.hp = { cur: 1, max: 10 };
    unequipAll(s.state);
    const nurse = mon(s.state, 'nh:nurse');
    let mhm = newMhm(0);
    let n = 0;
    while (!mhm.done && n++ < 2000) mhm = hit(s, nurse.id, HEAL, undefined, 5);
    expect(mhm.done).toBe(true);
    expect(texts(s.ctx)).toContain("The nurse hits!  (I hope you don't mind.)");
    expect(hero(s.state).c.hp!.cur).toBeGreaterThan(1);
    expect(hero(s.state).c.hp!.max).toBeGreaterThan(10);
    // gone for good, or teleported and fleeing
    const gone = !alive(s.state, nurse.id);
    expect(gone || isFleeing(s.ctx, nurse.id)).toBe(true);
  });

  test('armor: a plain hit; a Healer is asked to cooperate every fifth turn', () => {
    const s = room();
    const nurse = mon(s.state, 'nh:nurse');
    const helm = s.carry('nh:orcish_helm');
    s.state.entities[String(helm)]!.c.item!.equipped = 'helm';
    let mhm = hit(s, nurse.id, HEAL, undefined, 5);
    expect(texts(s.ctx)).toEqual(['The nurse hits!']);
    expect(mhm.damage).toBe(5);
    hero(s.state).c.player!.role = 'nh:healer' as DefId;
    s.state.turn = 10;
    s.ctx.events.length = 0;
    mhm = hit(s, nurse.id, HEAL, undefined, 5);
    expect(texts(s.ctx)).toEqual(['"Doc, I can\'t help you unless you cooperate."']);
    expect(mhm.damage).toBe(0);
  });

  test('a cancelled nurse just hits', () => {
    const s = room();
    hero(s.state).c.hp = { cur: 1, max: 10 };
    const nurse = mon(s.state, 'nh:nurse');
    setCancelled(s.ctx, nurse.id);
    const mhm = hit(s, nurse.id, HEAL, undefined, 5);
    expect(texts(s.ctx)).toEqual(['The nurse hits!']);
    expect(mhm.damage).toBe(5);
    expect(hero(s.state).c.hp!.cur).toBe(1);
  });

  test('#chat: "Relax, this won\'t hurt a bit." or "Please undress so I can examine you."', () => {
    const s = plain();
    const nurse = mon(s.state, 'nh:nurse', 4, 1);
    nurse.c.monster!.peaceful = true;
    nurse.c.actor!.speed = 0; // keep it still
    unequipAll(s.state);
    const chat = (): string[] => s.text(s.mod('nh:chat', { dir: 'e' }));
    expect(chat()).toContain('"Relax, this won\'t hurt a bit."');
    const helm = s.carry('nh:orcish_helm');
    s.state.entities[String(helm)]!.c.item!.equipped = 'helm';
    expect(chat()).toContain('"Please undress so I can examine you."');
  });
});

describe('mind flayers (AD_DRIN)', () => {
  test('a helmet blocks 7 times in 8; else her brain is eaten and she loses Intelligence', () => {
    const s = room();
    const f = mon(s.state, 'nh:mind_flayer');
    const helm = s.carry('nh:orcish_helm');
    s.state.entities[String(helm)]!.c.item!.equipped = 'helm';
    hero(s.state).c.attributes!.int = 18;
    let blocked = 0;
    let eaten = 0;
    for (let i = 0; i < 80; i++) {
      s.ctx.events.length = 0;
      hit(s, f.id, DRIN, undefined, 2);
      const t = texts(s.ctx);
      if (t.includes('Your helm blocks the attack to your head.')) blocked++;
      if (t.includes('Your brain is eaten!')) eaten++;
    }
    expect(blocked).toBeGreaterThan(eaten);
    expect(eaten).toBeGreaterThan(0);
    expect(hero(s.state).c.attributes!.int).toBeLessThan(18);
  });

  test('at minimum Intelligence she dies of brainlessness', () => {
    const s = room();
    const f = mon(s.state, 'nh:mind_flayer');
    hero(s.state).c.attributes!.int = 3;
    hit(s, f.id, DRIN, undefined, 2);
    expect(texts(s.ctx)).toContain('Your last thought fades away.');
    expect(s.state.gameOver?.killer).toBe('@killer.brainlessness');
  });

  test('a headless form "doesn\'t seem harmed" and the other tentacles are skipped', () => {
    const s = room();
    polymon(s.ctx, 'nh:lichen' as DefId, false);
    hero(s.state).c.hp = { cur: 5000, max: 5000 };
    const f = mon(s.state, 'nh:mind_flayer');
    let total = 0;
    for (let i = 0; i < 20; i++) {
      s.ctx.events.length = 0;
      monsterAttack(s.ctx, f.id);
      const n = texts(s.ctx).filter((l) => l === "You don't seem harmed.").length;
      expect(n).toBeLessThanOrEqual(1);
      total += n;
    }
    expect(total).toBeGreaterThan(0);
  });

  test('monster vs monster: the brain is eaten for more damage; a headless one is unharmed', () => {
    const s = room();
    const f = mon(s.state, 'nh:mind_flayer');
    const j = mon(s.state, 'nh:jackal', 4, 2);
    const mhm = hit(s, f.id, DRIN, j.id, 2);
    expect(texts(s.ctx)).toContain("The jackal's brain is eaten!");
    expect(mhm.damage).toBeGreaterThan(2);
    const spore = mon(s.state, 'nh:gas_spore', 4, 3);
    s.ctx.events.length = 0;
    const m2 = hit(s, f.id, DRIN, spore.id, 2);
    expect(texts(s.ctx)).toEqual(["The gas spore doesn't seem harmed."]);
    expect(m2.damage).toBe(0);
    // a whole round against the gas spore says it once
    let total = 0;
    for (let i = 0; i < 10 && alive(s.state, spore.id); i++) {
      s.ctx.events.length = 0;
      mattackm(s.ctx, f.id, spore.id);
      const n = texts(s.ctx).filter((l) => l === "The gas spore doesn't seem harmed.").length;
      expect(n).toBeLessThanOrEqual(1);
      total += n;
    }
    expect(total).toBeGreaterThan(0);
  });

  test('the hero as a mind flayer eats brains: "You eat the jackal\'s brain!"', () => {
    const s = room();
    polymon(s.ctx, 'nh:mind_flayer' as DefId, false);
    const j = mon(s.state, 'nh:jackal');
    const before = hero(s.state).c.hunger!.nutrition;
    const mhm = hit(s, s.state.playerId, DRIN, j.id, 2);
    expect(texts(s.ctx)).toContain("You eat the jackal's brain!");
    expect(mhm.damage).toBeGreaterThan(2);
    expect(hero(s.state).c.hunger!.nutrition).toBeGreaterThan(before);
  });

  test('losespells() forgets some spells; drain_weapon_skill() takes back advanced skills', () => {
    const s = room();
    const nh = s.state.modData['nh'] as Record<string, unknown>;
    nh['spells'] = [
      { id: 'nh:spellbook_of_force_bolt', retention: 20000 },
      { id: 'nh:spellbook_of_sleep', retention: 20000 },
    ];
    let n = 0;
    while (knownSpells(s.ctx).every((sp) => sp.retention > 0) && n++ < 100) losespells(s.ctx);
    expect(knownSpells(s.ctx).some((sp) => sp.retention === 0)).toBe(true);
    expect(knownSpells(s.ctx)).toHaveLength(2);
    nh['skills'] = { dagger: 3 };
    nh['skillRecord'] = ['dagger', 'dagger'];
    nh['skillsAdvanced'] = 2;
    nh['skillAdvance'] = { dagger: 200 };
    nh['weaponSlots'] = 0;
    drainWeaponSkill(s.ctx, 1);
    expect((nh['skills'] as Record<string, number>)['dagger']).toBe(2);
    expect(nh['skillsAdvanced']).toBe(1);
    expect(nh['weaponSlots']).toBe(2);
    expect(texts(s.ctx)).toContain('You forget some of your training in dagger.');
  });
});
