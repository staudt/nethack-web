import { getPlayer, type DefId, type EntityId, type GameState, type Pos } from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  P_BASIC,
  P_SKILLED,
  P_UNSKILLED,
  adjabil,
  canAdvance,
  couldAdvance,
  nhData,
  practiceNeededToAdvance,
  skillLevel,
  slotsRequired,
  useSkill,
  weaponHitBonus,
  weaponSlots,
} from '../src/index';
import { defs, engine, levelSetup, plainKit, render } from './itemHelpers';

const setup = () => {
  const s = levelSetup(['.....', '..@..', '.....']);
  plainKit(s.state);
  return s;
};
type Setup = ReturnType<typeof setup>;

const monster = (state: GameState, pos: Pos, hp: number): EntityId => {
  const d = defs.monster('nh:newt' as DefId);
  const id = state.nextEntityId++;
  state.entities[String(id)] = {
    id,
    def: 'nh:newt' as DefId,
    c: {
      pos: { level: 'dlvl1', ...pos },
      actor: { energy: 0, speed: 0 },
      hp: { cur: hp, max: hp },
      monster: { level: d.level, peaceful: false, asleep: true, lastHero: null },
    },
  };
  return id;
};
const advance = (s: Setup, skill: string): number => nhData(s.ctx).skillAdvance?.[skill] ?? -1;
const texts = (s: Setup, r: ReturnType<Setup['step']>) => s.text(r);

describe('skill practice and thresholds', () => {
  test('practice needed is level^2 * 20; the kit starts at the previous level threshold', () => {
    expect([1, 2, 3, 4].map(practiceNeededToAdvance)).toEqual([20, 80, 180, 320]);
    const s = setup();
    expect(advance(s, 'spear')).toBe(20); // Basic: practice_needed(Basic - 1)
    expect(advance(s, 'dagger')).toBe(20);
    expect(advance(s, 'axe')).toBe(0); // Unskilled
    expect(weaponSlots(s.ctx)).toBe(2);
  });

  test('a Basic skill needs 80 practice and 2 slots for Skilled', () => {
    const s = setup();
    expect(slotsRequired(s.ctx, 'spear')).toBe(2);
    expect(slotsRequired(s.ctx, 'axe')).toBe(1);
    expect(slotsRequired(s.ctx, 'bare_handed')).toBe(1); // (1 + 1) / 2
    nhData(s.ctx).skillAdvance!['spear'] = 79;
    expect(canAdvance(s.ctx, 'spear')).toBe(false);
    nhData(s.ctx).skillAdvance!['spear'] = 80;
    expect(canAdvance(s.ctx, 'spear')).toBe(true);
    nhData(s.ctx).weaponSlots = 1;
    expect(canAdvance(s.ctx, 'spear')).toBe(false);
    expect(couldAdvance(s.ctx, 'spear')).toBe(true); // practiced, but short of slots
  });

  test('restricted skills never train or advance', () => {
    const s = setup();
    useSkill(s.ctx, 'whip', 500);
    expect(skillLevel(s.ctx, 'whip')).toBe(0);
    expect(nhData(s.ctx).skillAdvance?.['whip']).toBeUndefined();
  });

  test('use_skill gives "more confident" once, when a skill becomes advanceable', () => {
    const s = setup();
    nhData(s.ctx).skillAdvance!['spear'] = 78;
    useSkill(s.ctx, 'spear', 1);
    expect(s.ctx.events).toEqual([]);
    useSkill(s.ctx, 'spear', 1);
    expect(s.ctx.events.map((e) => (e.type === 'msg' ? render({ key: e.key }) : ''))).toEqual([
      'You feel more confident in your weapon skills.',
    ]);
    useSkill(s.ctx, 'spear', 1);
    expect(s.ctx.events).toHaveLength(1);
  });

  test('gaining a level gives a slot, and a message if that makes a skill advanceable', () => {
    const s = setup();
    nhData(s.ctx).skillAdvance!['spear'] = 80;
    nhData(s.ctx).weaponSlots = 1;
    adjabil(s.ctx as never, s.state.playerId, 1, 2);
    expect(weaponSlots(s.ctx)).toBe(2);
    expect(s.ctx.events.map((e) => e.type === 'msg' && e.key)).toContain('skill.confident');
    adjabil(s.ctx as never, s.state.playerId, 2, 3);
    expect(weaponSlots(s.ctx)).toBe(3);
  });

  test('hit and damage bonuses follow the new level', () => {
    const spear = defs.object('nh:spear' as DefId);
    expect(weaponHitBonus(P_BASIC, spear)).toBe(0);
    expect(weaponHitBonus(P_SKILLED, spear)).toBe(2);
    expect(weaponHitBonus(P_UNSKILLED, spear)).toBe(-4);
  });

  test('skills survive a JSON round trip', () => {
    const s = setup();
    nhData(s.ctx).skillAdvance!['spear'] = 99;
    nhData(s.ctx).weaponSlots = 5;
    const copy = JSON.parse(JSON.stringify(s.state)) as GameState;
    expect(skillLevel({ state: copy }, 'spear')).toBe(P_BASIC);
    expect(nhData({ state: copy }).skillAdvance?.['spear']).toBe(99);
    expect(weaponSlots({ state: copy })).toBe(5);
  });
});

describe('training by use', () => {
  test('melee hits that do more than 1 point train the wielded weapon skill', () => {
    const s = setup();
    const before = advance(s, 'spear');
    const m = monster(s.state, { x: 3, y: 1 }, 100000);
    for (let i = 0; i < 60; i++) {
      s.step({ type: 'move', dir: 'e' });
      const hp = s.state.entities[String(m)]?.c.hp;
      if (hp) hp.cur = 100000;
    }
    expect(advance(s, 'spear')).toBeGreaterThan(before);
    expect(advance(s, 'dagger')).toBe(20); // not the alternate
  });

  test('bare-handed hits that roll 2 train bare-handed combat', () => {
    const s = setup();
    s.mod('nh:wield', { item: null });
    const m = monster(s.state, { x: 3, y: 1 }, 100000);
    for (let i = 0; i < 60; i++) {
      s.step({ type: 'move', dir: 'e' });
      const hp = s.state.entities[String(m)]?.c.hp;
      if (hp) hp.cur = 100000;
    }
    expect(advance(s, 'bare_handed')).toBeGreaterThan(0);
  });

  test('the message comes when a hit makes the skill advanceable', () => {
    const s = setup();
    nhData(s.ctx).skillAdvance!['spear'] = 79;
    const m = monster(s.state, { x: 3, y: 1 }, 100000);
    const seen: string[] = [];
    for (let i = 0; i < 60 && seen.length === 0; i++) {
      seen.push(...texts(s, s.step({ type: 'move', dir: 'e' })).filter((t) => /confident/.test(t)));
      const hp = s.state.entities[String(m)]?.c.hp;
      if (hp) hp.cur = 100000;
    }
    expect(seen).toEqual(['You feel more confident in your weapon skills.']);
    expect(canAdvance(s.ctx, 'spear')).toBe(true);
  });

  test('thrown daggers and fired arrows train their skill', () => {
    const s = setup();
    const m = monster(s.state, { x: 3, y: 1 }, 100000);
    const dag = s.byLetter('b');
    for (let i = 0; i < 40; i++) {
      s.mod('nh:throw', { item: dag });
      const p = s.state.pendingPrompt?.prompt;
      if (!p) break;
      engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' });
      const hp = s.state.entities[String(m)]?.c.hp;
      if (hp) hp.cur = 100000;
      if (!s.state.entities[String(dag)]?.c.item?.carriedBy) {
        // pick the dagger up again from the floor
        const pos = getPlayer(s.state).c.pos;
        const e = s.state.entities[String(dag)];
        if (e?.c.item && pos) {
          e.c.item.carriedBy = s.state.playerId;
          delete e.c.pos;
        }
      }
    }
    expect(advance(s, 'dagger')).toBeGreaterThan(20);
  });
});

describe('#enhance', () => {
  const enhance = (s: Setup) => s.mod('nh:enhance');

  test('is always a self offer', () => {
    const s = setup();
    const offers = engine.query(s.state).actionsFor({ kind: 'self' });
    expect(offers.map((o) => o.action.type === 'mod' && o.action.action)).toContain('nh:enhance');
  });

  test('with nothing advanceable it lists the current skills', () => {
    const s = setup();
    const r = enhance(s);
    expect(r.prompt).toBeNull();
    const ev = r.events.find((e) => e.type === 'list');
    expect(ev?.type === 'list' && ev.titleKey).toBe('enhance.current');
    const lines = ev?.type === 'list' ? ev.items.map((m) => render(m)) : [];
    expect(lines).toContain('Fighting Skills');
    expect(lines).toContain('Weapon Skills');
    expect(lines).toContain('Spellcasting Skills');
    expect(lines).toContain('spear [Basic]');
    expect(lines).toContain('dagger [Basic]');
    expect(lines).toContain('axe [Unskilled]');
    expect(lines).not.toContain('whip [Unskilled]');
    expect(s.state.turn).toBe(1);
  });

  test('practiced skills without slots are flagged "*" with the legend; maxed ones "#"', () => {
    const s = setup();
    nhData(s.ctx).skillAdvance!['spear'] = 80;
    nhData(s.ctx).weaponSlots = 0;
    nhData(s.ctx).skills!['saber'] = P_BASIC; // saber's maximum is Basic
    nhData(s.ctx).skillAdvance!['saber'] = 80;
    const ev = enhance(s).events.find((e) => e.type === 'list');
    const lines = ev?.type === 'list' ? ev.items.map((m) => render(m)) : [];
    expect(lines).toContain(
      '(Skill flagged by "*" may be enhanced when you\'re more experienced.)',
    );
    expect(lines).toContain('(Skill flagged by "#" cannot be enhanced any further.)');
    expect(lines).toContain('* spear [Basic]');
    expect(lines).toContain('# saber [Basic]');
    expect(lines).toContain('  dagger [Basic]');
  });

  test('a single-choice menu of the advanceable skills; advancing spends the slots', () => {
    const s = setup();
    nhData(s.ctx).skillAdvance!['spear'] = 80;
    const r = enhance(s);
    expect(r.prompt?.kind).toBe('menu');
    expect(r.prompt?.multi).toBeFalsy();
    expect(r.prompt?.options?.map((o) => o.value)).toEqual(['spear']);
    expect(render({ key: r.prompt?.key ?? '' })).toBe('Pick a skill to advance:');
    expect(render({ key: 'enhance.entry', params: r.prompt?.options?.[0]?.params ?? {} })).toBe(
      'spear [Basic]',
    );
    const turn = s.state.turn;
    const a = s.step({ type: 'answer', promptId: r.prompt?.id ?? '', value: 'spear' });
    expect(s.text(a)).toEqual(['You are now more skilled in spear.']);
    expect(skillLevel(s.ctx, 'spear')).toBe(P_SKILLED);
    expect(weaponSlots(s.ctx)).toBe(0);
    expect(nhData(s.ctx).skillsAdvanced).toBe(1);
    expect(s.state.turn).toBe(turn); // free action
  });

  test('"most skilled" at the maximum, and a nudge when another skill can still advance', () => {
    const s = setup();
    nhData(s.ctx).skills!['spear'] = P_SKILLED;
    nhData(s.ctx).skillAdvance!['spear'] = 180;
    nhData(s.ctx).skillAdvance!['dagger'] = 80;
    nhData(s.ctx).weaponSlots = 5; // spear needs 3, dagger 2
    const r = enhance(s);
    expect(r.prompt?.options?.map((o) => o.value)).toEqual(['dagger', 'spear']);
    const a = s.step({ type: 'answer', promptId: r.prompt?.id ?? '', value: 'spear' });
    expect(s.text(a)).toEqual([
      'You are now most skilled in spear.',
      'You feel you could be more dangerous!',
    ]);
    expect(skillLevel(s.ctx, 'spear')).toBe(4);
    // re-run: only the dagger is left, then nothing
    const r2 = enhance(s);
    expect(r2.prompt?.options?.map((o) => o.value)).toEqual(['dagger']);
    s.step({ type: 'answer', promptId: r2.prompt?.id ?? '', value: 'dagger' });
    expect(weaponSlots(s.ctx)).toBe(0);
    expect(enhance(s).prompt).toBeNull();
  });

  test('answers that cannot advance are ignored', () => {
    const s = setup();
    const r = engine.step(s.state, { type: 'mod', action: 'nh:enhance' as DefId });
    expect(r.prompt).toBeNull();
    nhData(s.ctx).skillAdvance!['spear'] = 80;
    const r2 = enhance(s);
    s.step({ type: 'answer', promptId: r2.prompt?.id ?? '', value: 'whip' });
    expect(skillLevel(s.ctx, 'whip')).toBe(0);
    expect(weaponSlots(s.ctx)).toBe(2);
  });
});
