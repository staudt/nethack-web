// m9 step 7: lycanthropy. A were creature's bite makes the hero feverish (she resists drain from
// then on), a human-form corpse does it too; prayer and holy water cure it; were creatures change
// form at C's daytime rates (dropping their weapon as beasts), summon their animals when they
// attack, and die in their human form. Outcomes are checked over many tries, never on a lucky
// seed.
import { getPlayer, type DefId, type Entity, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { mhitmAdtyping, newMhm } from '../src/adtyping';
import { monsterAttack } from '../src/combat';
import { enlightenment } from '../src/enlightenment';
import { cpostfxOf } from '../src/givit';
import { inTrouble } from '../src/index';
import { mondied } from '../src/mondeath';
import { mongets } from '../src/mongear';
import { POTION_USES } from '../src/potion';
import { newWere, summonWereMu, wereChange } from '../src/were';
import { restoreWereForm, setUlycn, ulycn } from '../src/werestate';
import { defs, render } from './itemHelpers';
import { alive, keys, mon, room, type FullCtx } from './m9helpers';

const BITE = defs.monster('nh:werejackal' as DefId).attacks[0]!;
const hero = (state: GameState): Entity => getPlayer(state);
const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

describe('catching lycanthropy', () => {
  test('a were bite: "You feel feverish." about 1 time in 4, once', () => {
    let caught = 0;
    for (let i = 0; i < 120; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:werejackal');
      mhitmAdtyping(s.ctx, w.id, BITE, s.state.playerId, newMhm(2), { vis: true, mwep: null });
      if (ulycn(s.state) !== null) {
        caught++;
        expect(ulycn(s.state)).toBe('nh:werejackal');
        expect(texts(s.ctx)).toEqual(['You feel feverish.']);
        // a second bite says nothing more
        s.ctx.events.length = 0;
        for (let j = 0; j < 20; j++) mhitmAdtyping(s.ctx, w.id, BITE, s.state.playerId, newMhm(2));
        expect(keys(s.ctx)).not.toContain('were.feverish');
      }
    }
    expect(caught).toBeGreaterThan(15);
    expect(caught).toBeLessThan(50);
  });

  test('a were bite on a monster is a plain bite', () => {
    const s = room();
    const w = mon(s.state, 'nh:werejackal');
    const j = mon(s.state, 'nh:jackal', 4, 2);
    const mhm = newMhm(3);
    mhitmAdtyping(s.ctx, w.id, BITE, j.id, mhm, { vis: true, mwep: null });
    expect(mhm.damage).toBe(3);
    expect(ulycn(s.state)).toBeNull();
  });

  test('eating a human-form were corpse; the beast form leaves none', () => {
    const s = room();
    cpostfxOf(s.ctx, defs.monster('nh:human_wererat' as DefId));
    expect(ulycn(s.state)).toBe('nh:wererat');
    expect(defs.monster('nh:wererat' as DefId).genFlags).toContain('nocorpse');
  });

  test('enlightenment lists it, and she resists level drain', () => {
    const s = room();
    setUlycn(s.ctx, 'nh:werewolf' as DefId);
    const lines = enlightenment(s.ctx).map((m) => render(m));
    expect(lines).toContain('You are level-drain resistant.');
    expect(lines).toContain('You are a werewolf.');
  });
});

describe('cures', () => {
  test('prayer: lycanthropy is a major trouble, fixed with "You feel purified."', () => {
    const s = room();
    expect(inTrouble(s.ctx)).toBe(0);
    setUlycn(s.ctx, 'nh:wererat' as DefId);
    expect(inTrouble(s.ctx)).toBe(6); // TROUBLE_LYCANTHROPE
  });

  test('holy water: "You feel full of awe." and purified', () => {
    const s = room();
    setUlycn(s.ctx, 'nh:wererat' as DefId);
    const id = s.carry('nh:potion_of_water');
    s.state.entities[String(id)]!.c.item!.buc = 'blessed';
    POTION_USES['nh:potion_of_water']!(s.ctx, s.state.playerId, id);
    expect(texts(s.ctx)).toEqual(['You feel full of awe.', 'You feel purified.']);
    expect(ulycn(s.state)).toBeNull();
  });
});

describe('were creatures changing form', () => {
  test('a human form changes 1 time in 50, a beast changes back 1 time in 30', () => {
    let changed = 0;
    for (let i = 0; i < 500; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:human_wererat');
      wereChange(s.ctx, w);
      if (w.def === 'nh:wererat') {
        changed++;
        expect(texts(s.ctx)).toEqual(['The wererat changes into a rat.']);
        expect(w.c.actor?.speed).toBe(12);
      }
    }
    expect(changed).toBeGreaterThan(3);
    expect(changed).toBeLessThan(25);
    let back = 0;
    for (let i = 0; i < 300; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:wererat');
      wereChange(s.ctx, w);
      if (w.def === 'nh:human_wererat') {
        back++;
        expect(texts(s.ctx)).toEqual(['The wererat changes into a human.']);
      }
    }
    expect(back).toBeGreaterThan(3);
    expect(back).toBeLessThan(25);
  });

  test('the beast drops its weapon, wakes, and regains a quarter of its lost hit points', () => {
    const s = room();
    const w = mon(s.state, 'nh:human_werejackal');
    const sword = mongets(s.ctx, w.id, 'nh:long_sword')!;
    s.state.entities[String(sword)]!.c.item!.equipped = 'weapon';
    delete s.state.entities[String(sword)]!.c.item!.erosion; // pinned: mksobj() may rust it
    w.c.monster!.asleep = true;
    w.c.hp = { cur: 20, max: 100 };
    newWere(s.ctx, w);
    expect(w.def).toBe('nh:werejackal');
    expect(texts(s.ctx)).toEqual([
      'The werejackal changes into a jackal.',
      'The werejackal drops a long sword.',
    ]);
    expect(w.c.monster!.asleep).toBe(false);
    expect(w.c.hp.cur).toBe(40);
    expect(s.state.entities[String(sword)]!.c.item!.carriedBy).toBeNull();
    expect(s.state.entities[String(sword)]!.c.pos).toMatchObject({ x: 3, y: 2 });
  });

  test('it dies in its human form: the corpse is the human one', () => {
    const s = room();
    const w = mon(s.state, 'nh:wererat', 4, 2);
    restoreWereForm(s.ctx, w);
    expect(w.def).toBe('nh:human_wererat');
    let corpses = 0;
    for (let i = 0; i < 30; i++) {
      const t = room(i + 1);
      const b = mon(t.state, 'nh:werewolf', 5, 2);
      mondied(t.ctx, b.id);
      expect(alive(t.state, b.id)).toBe(false);
      for (const e of Object.values(t.state.entities))
        if (e.def === 'nh:corpse' && e.c.pos?.x === 5) {
          corpses++;
          expect(e.c.item?.corpseOf).toBe('nh:human_werewolf');
        }
    }
    expect(corpses).toBeGreaterThan(0);
  });
});

describe('summoning help (summonmu)', () => {
  test('1 time in 10 it summons 1 to 5 rats next to her: "The wererat summons help!"', () => {
    let summoned = 0;
    for (let i = 0; i < 150; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:wererat');
      const before = Object.values(s.state.entities).filter((e) => e.c.monster).length;
      summonWereMu(s.ctx, w, true);
      if (keys(s.ctx).includes('were.summons_help')) {
        summoned++;
        const rats = Object.values(s.state.entities).filter(
          (e) => e.c.monster && /rat$/.test(e.def) && e.id !== w.id,
        );
        const made = Object.values(s.state.entities).filter((e) => e.c.monster).length - before;
        expect(made).toBeGreaterThanOrEqual(1);
        expect(made).toBeLessThanOrEqual(5);
        expect(rats.length).toBe(made);
        const hp = hero(s.state).c.pos!;
        for (const r of rats)
          expect(Math.max(Math.abs(r.c.pos!.x - hp.x), Math.abs(r.c.pos!.y - hp.y))).toBeLessThan(
            4,
          );
      }
    }
    expect(summoned).toBeGreaterThan(5);
    expect(summoned).toBeLessThan(35);
  });

  test('a human form attacking her turns into the beast about 1 time in 5', () => {
    let turned = 0;
    for (let i = 0; i < 100; i++) {
      const s = room(i + 1);
      const w = mon(s.state, 'nh:human_werejackal');
      monsterAttack(s.ctx, w.id);
      if (w.def === 'nh:werejackal') turned++;
    }
    expect(turned).toBeGreaterThan(8);
    expect(turned).toBeLessThan(35);
  });
});
