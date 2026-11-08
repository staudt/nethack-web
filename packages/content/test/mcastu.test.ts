// m7a step 5: monster spellcasting (castmu) and the mage spells. Outcomes are found by searching
// RNG offsets (burning draws before the cast, the same as a seed search) with pinned casters.
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type EntityId,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { monsterAttack } from '../src/combat';
import { MCAST_DATA, castmu, spellWouldBeUseless, type McastSpell } from '../src/mcastu';
import { dochug } from '../src/monmove';
import { mspeed, mspecUsed, setMspecUsed } from '../src/mstate';
import { P, hasProp, makeConfused, setIntrinsic, timeoutLeft } from '../src/props';
import { updateWornProps } from '../src/index';
import { addMon } from './helpers';
import { defs, itemOf, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mc-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mc-probe:run',
      labelKey: 'mc-probe',
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
  const r = engine.step(state, { type: 'mod', action: 'mc-probe:run' });
  return r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
}

/**
 * Every outcome of `fn` over the first `tries` RNG offsets: `fn` runs on a copy of `state`
 * after `k` draws have been burnt.
 */
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

const SPEL: AttackDef = { at: 'magic', ad: 'spel', n: 0, d: 0 };
const CLRC: AttackDef = { at: 'magic', ad: 'clrc', n: 0, d: 0 };
const SHAMAN = 'nh:kobold_shaman';
const CLERIC = 'nh:aligned_cleric';

/** A lit room with the hero at (3,3) and a pinned caster (`def`) of level `ml` at (x,y). */
function setup(ml: number, x = 4, y = 3, hp = 100, def = SHAMAN) {
  const s = levelSetup(['.........', '.........', '.........', '...@.....', '.........']);
  const h = getPlayer(s.state);
  if (h.c.hp) h.c.hp = { cur: 500, max: 500 };
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: hp, max: 100 };
  e.c.actor!.speed = 0;
  e.c.monster!.level = ml;
  s.step({ type: 'wait' }); // see the level
  return { s, id };
}
const heroHp = (st: GameState): number => getPlayer(st).c.hp?.cur ?? -1;
const monHp = (st: GameState, id: EntityId): number => st.entities[String(id)]?.c.hp?.cur ?? -1;

const PSI: [number, string][] = [
  [5, 'You get a slight headache.'],
  [10, 'Your brain is on fire!'],
  [20, 'Your head suddenly aches painfully!'],
  [Infinity, 'Your head suddenly aches very painfully!'],
];
const psiText = (dmg: number): string => PSI.find(([max]) => dmg <= max)?.[1] ?? '';

describe('the kobold shaman', () => {
  test('matches include/monsters.h', () => {
    expect(defs.monster('nh:kobold_shaman' as never)).toMatchObject({
      glyph: { ch: 'k', fg: '#5555ff' },
      level: 2,
      speed: 6,
      ac: 6,
      mr: 10,
      alignment: -4,
      attacks: [{ at: 'magic', ad: 'spel', n: 0, d: 0 }],
      size: 'small',
      frequency: 1,
      difficulty: 4,
      weight: 450,
      nutrition: 150,
      resists: ['poison'],
    });
  });

  test('at level 2 every cast fumbles: the air crackles and the delay is set', () => {
    const { s, id } = setup(2);
    for (const o of outcomes(s.state, (ctx) => monsterAttack(ctx, id), 40)) {
      expect(o.text).toEqual(['The air crackles around the kobold shaman.']);
      expect(heroHp(o.state)).toBe(500);
      expect(mspecUsed({ state: o.state }, id)).toBe(8); // 10 - m_lev
    }
  });
});

describe('castmu', () => {
  test('psi bolt: d(ml/2 + 1, 6) damage with the damage-tier message', () => {
    const { s, id } = setup(5);
    const seen = new Set<string>();
    let fumbles = 0;
    for (const o of outcomes(s.state, (ctx) => monsterAttack(ctx, id))) {
      if (o.text[0] === 'The air crackles around the kobold shaman.') {
        fumbles++;
        expect(heroHp(o.state)).toBe(500);
        continue;
      }
      if (o.text[1] === undefined || (!o.text[1].includes('head') && !o.text[1].includes('brain')))
        continue; // another spell
      expect(o.text[0]).toBe('The kobold shaman casts a spell at you!');
      const dmg = 500 - heroHp(o.state);
      expect(dmg).toBeGreaterThanOrEqual(3);
      expect(dmg).toBeLessThanOrEqual(18); // d(3, 6)
      expect(o.text[1]).toBe(psiText(dmg));
      expect(mspecUsed({ state: o.state }, id)).toBe(5);
      seen.add(o.text[1]);
    }
    expect(fumbles).toBeGreaterThan(0);
    expect([...seen].sort()).toEqual(
      [psiText(5), psiText(10), psiText(20)].sort(), // d(3,6) never reaches 21
    );
  });

  test('psi bolt with magic resistance does half (rounded up)', () => {
    const { s, id } = setup(5);
    setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true);
    let n = 0;
    for (const o of outcomes(s.state, (ctx) => monsterAttack(ctx, id))) {
      if (!o.text[1]?.includes('head') && !o.text[1]?.includes('brain')) continue;
      const dmg = 500 - heroHp(o.state);
      expect(dmg).toBeGreaterThanOrEqual(2);
      expect(dmg).toBeLessThanOrEqual(9);
      expect(o.text[1]).toBe(psiText(dmg));
      n++;
    }
    expect(n).toBeGreaterThan(0);
  });

  test('while the delay runs it points and curses; the delay counts down each turn', () => {
    const { s, id } = setup(5);
    run(s.state, (ctx) => setMspecUsed(ctx, id, 3));
    // (at you for a directed spell, all around for an undirected one: the spell is rolled)
    const said = run(s.state, (ctx) => monsterAttack(ctx, id));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^The kobold shaman points (at you|all around), then curses\.$/);
    expect(heroHp(s.state)).toBe(500);
    s.step({ type: 'wait' });
    expect(mspecUsed({ state: s.state }, id)).toBe(2);
    s.step({ type: 'wait' });
    s.step({ type: 'wait' });
    expect(mspecUsed({ state: s.state }, id)).toBe(0);
    expect(s.state.modData['nh']).not.toHaveProperty(['mspecUsed', String(id)]);
  });

  test('an unseen caster in its delay mumbles a curse, sometimes', () => {
    const { s, id } = setup(5);
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' });
    run(s.state, (ctx) => setMspecUsed(ctx, id, 5));
    const texts = outcomes(s.state, (ctx) => monsterAttack(ctx, id), 40).map((o) => o.text);
    for (const t of texts) expect(['', 'You hear a mumbled curse.']).toContain(t.join());
    expect(texts.some((t) => t.join() === 'You hear a mumbled curse.')).toBe(true);
    // `!(moves % 4) || !rn2(4)`: always on every 4th turn, else 1 time in 4
    expect(texts.some((t) => t.length === 0)).toBe(s.state.turn % 4 !== 0);
  });

  test('cure self when hurt: undirected, heals d(3,6), no damage to the hero', () => {
    const { s, id } = setup(3, 4, 3, 50);
    const cures = outcomes(s.state, (ctx) => monsterAttack(ctx, id)).filter((o) =>
      o.text.includes('The kobold shaman looks better.'),
    );
    expect(cures.length).toBeGreaterThan(0);
    for (const o of cures) {
      expect(o.text).toEqual([
        'The kobold shaman casts a spell!',
        'The kobold shaman looks better.',
      ]);
      const healed = monHp(o.state, id) - 50;
      expect(healed).toBeGreaterThanOrEqual(3);
      expect(healed).toBeLessThanOrEqual(18);
      expect(heroHp(o.state)).toBe(500);
    }
  });

  test('a hurt caster 5 squares away casts cure self instead of moving (dochug)', () => {
    const { s, id } = setup(3, 8, 0, 50);
    const all = outcomes(s.state, (ctx) => dochug(ctx, id));
    const cures = all.filter((o) => o.text.includes('The kobold shaman looks better.'));
    expect(cures.length).toBeGreaterThan(0);
    for (const o of cures) {
      expect(o.text[0]).toBe('The kobold shaman casts a spell!');
      expect(o.state.entities[String(id)]?.c.pos).toMatchObject({ x: 8, y: 0 }); // MMOVE_DONE
      expect(monHp(o.state, id)).toBeGreaterThan(50);
    }
    // never a directed spell from there: nothing but cure self, haste self or a fumble
    for (const o of all)
      for (const t of o.text)
        expect([
          'The kobold shaman casts a spell!',
          'The kobold shaman looks better.',
          'The kobold shaman is suddenly moving faster.',
          'The air crackles around the kobold shaman.',
        ]).toContain(t);
  });

  test('a caster at full health far away never casts cure self', () => {
    const { s, id } = setup(1, 8, 0);
    // level 1: rn2(1) is 0, so the choice is psi bolt (directed): nothing is cast
    for (const o of outcomes(s.state, (ctx) => castmu(ctx, id, SPEL, false, false), 30)) {
      expect(o.text).toEqual([]);
      expect(mspecUsed({ state: o.state }, id)).toBe(0);
    }
  });

  test('haste self only once', () => {
    const { s, id } = setup(3);
    const haste = outcomes(s.state, (ctx) => monsterAttack(ctx, id)).find((o) =>
      o.text.includes('The kobold shaman is suddenly moving faster.'),
    );
    expect(haste?.text[0]).toBe('The kobold shaman casts a spell!');
    const st = haste!.state;
    expect(mspeed({ state: st }, id)).toBe('fast');
    run(st, (ctx) => setMspecUsed(ctx, id, 0));
    for (const o of outcomes(st, (ctx) => monsterAttack(ctx, id), 200))
      expect(o.text).not.toContain('The kobold shaman is suddenly moving faster.');
  });
});

describe('the higher mage spells (a level-forced caster)', () => {
  /** The outcome whose text includes `msg`, at caster level `ml`. */
  function find(ml: number, msg: string, prep: (s: ReturnType<typeof setup>) => void = () => {}) {
    const st = setup(ml);
    prep(st);
    const o = outcomes(st.s.state, (ctx) => monsterAttack(ctx, st.id), 400).find((x) =>
      x.text.includes(msg),
    );
    expect(o, msg).toBeDefined();
    return { ...st, o: o! };
  }

  test('stun you: d(4,4) (Dex 12+) turns of stun', () => {
    const { o } = find(4, 'You reel...');
    expect(o.text[0]).toBe('The kobold shaman casts a spell at you!');
    const h = getPlayer(o.state);
    const left = (h.c.props?.[P.STUNNED]?.timeout ?? 0) - o.state.turn;
    expect(left).toBeGreaterThanOrEqual(4);
    expect(left).toBeLessThanOrEqual(16);
  });

  test('stun you with Free action: momentarily disoriented, 1 turn', () => {
    const { o } = find(4, 'You feel momentarily disoriented.', ({ s }) =>
      setIntrinsic(getPlayer(s.state), P.FREE_ACTION, true),
    );
    const h = getPlayer(o.state);
    expect((h.c.props?.[P.STUNNED]?.timeout ?? 0) - o.state.turn).toBe(1);
  });

  test('weaken you: Str drops by 1..m_lev-6', () => {
    const { s, o } = find(9, 'You suddenly feel weaker!');
    const before = getPlayer(s.state).c.attributes?.str ?? 0;
    const after = getPlayer(o.state).c.attributes?.str ?? 0;
    expect(before - after).toBeGreaterThanOrEqual(1);
    expect(before - after).toBeLessThanOrEqual(3);
  });

  test('curse items: "need some help" and the malignant aura curses carried items', () => {
    const { s, o } = find(11, 'You feel as if you need some help.', ({ s }) => {
      for (const e of inventoryOf(s.state, s.state.playerId))
        if (e.c.item) e.c.item.buc = 'uncursed';
    });
    expect(o.text).toContain('You feel a malignant aura surround you.');
    const cursed = (st: GameState) =>
      inventoryOf(st, st.playerId).filter((e) => e.c.item?.buc === 'cursed').length;
    expect(cursed(s.state)).toBe(0);
    expect(cursed(o.state)).toBeGreaterThan(0);
  });

  test('aggravation wakes the sleeping monsters', () => {
    let sleeper = 0;
    const { o } = find(14, 'You feel that monsters are aware of your presence.', ({ s }) => {
      sleeper = addMon(s.state, 'nh:jackal', 0, 0, { asleep: true });
    });
    expect(o.text[0]).toBe('The kobold shaman casts a spell!'); // undirected
    expect(o.state.entities[String(sleeper)]?.c.monster?.asleep).toBe(false);
  });

  test('a level 20 caster never picks destroy armor, summon or the Wizard spells', () => {
    const { s, id } = setup(20);
    run(s.state, () => undefined);
    // (disappear is ported since 7f-b: useful while the caster is visible, see m7f.apparxy)
    const useless: McastSpell[] = ['destry_armr', 'summon_mons', 'clone_wiz', 'death_touch'];
    run(s.state, (ctx) => {
      const mon = ctx.state.entities[String(id)]!;
      for (const sp of useless) expect(spellWouldBeUseless(ctx, mon, sp)).toBe(true);
    });
    // every cast has a visible effect after "casts a spell": none of the no-op spells was chosen
    let casts = 0;
    for (const o of outcomes(s.state, (ctx) => monsterAttack(ctx, id))) {
      const i = o.text.findIndex((t) => t.startsWith('The kobold shaman casts a spell'));
      if (i < 0) continue;
      casts++;
      expect(o.text.length, o.text.join(' | ')).toBeGreaterThan(i + 1);
    }
    expect(casts).toBeGreaterThan(0);
  });

  test('the spell table follows include/mcastu.h', () => {
    expect(MCAST_DATA.psi_bolt).toEqual({ level: 0, indirect: false, sight: true, hostile: true });
    expect(MCAST_DATA.cure_self).toEqual({
      level: 1,
      indirect: true,
      sight: false,
      hostile: false,
    });
    expect(MCAST_DATA.aggravation).toEqual({
      level: 13,
      indirect: true,
      sight: true,
      hostile: true,
    });
    expect(MCAST_DATA.death_touch.level).toBe(20);
  });
});

describe('the clerical spells (a level-forced aligned cleric casting AD_CLRC)', () => {
  /** The first outcome of the cleric's cast whose text includes `msg`, at caster level `ml`. */
  function find(ml: number, msg: string, prep: (s: ReturnType<typeof setup>) => void = () => {}) {
    const st = setup(ml, 4, 3, 100, CLERIC);
    prep(st);
    const o = outcomes(st.s.state, (ctx) => castmu(ctx, st.id, CLRC, true, true), 400).find((x) =>
      x.text.includes(msg),
    );
    expect(o, msg).toBeDefined();
    return { ...st, o: o! };
  }
  const lost = (o: { state: GameState }): number => 500 - heroHp(o.state);
  const left = (st: GameState, p: string): number => timeoutLeft(st, getPlayer(st), p);

  test('the priest has his AT_MAGC AD_CLRC attack (include/monsters.h)', () => {
    expect(defs.monster(CLERIC as never).attacks).toEqual([
      { at: 'weapon', ad: 'phys', n: 4, d: 10 },
      { at: 'kick', ad: 'phys', n: 1, d: 4 },
      { at: 'magic', ad: 'clrc', n: 0, d: 0 },
    ]);
  });

  const WOUNDS: [number, string][] = [
    [5, 'Your skin itches badly for a moment.'],
    [10, 'Wounds appear on your body!'],
    [20, 'Severe wounds appear on your body!'],
    [Infinity, 'Your body is covered with painful wounds!'],
  ];
  const woundsText = (dmg: number): string => WOUNDS.find(([max]) => dmg <= max)?.[1] ?? '';

  test('open wounds: d(ml/2 + 1, 6) with the damage-tier message, halved by magic resistance', () => {
    for (const mr of [false, true]) {
      const { s, id } = setup(9, 4, 3, 100, CLERIC);
      setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, mr);
      const seen = new Set<string>();
      for (const o of outcomes(s.state, (ctx) => castmu(ctx, id, CLRC, true, true))) {
        const msg = o.text[1];
        if (!msg || !WOUNDS.some(([, t]) => t === msg)) continue;
        expect(o.text[0]).toBe('The priest casts a spell at you!');
        const dmg = lost(o);
        expect(dmg).toBeGreaterThanOrEqual(mr ? 3 : 5);
        expect(dmg).toBeLessThanOrEqual(mr ? 15 : 30); // d(5, 6)
        expect(msg).toBe(woundsText(dmg));
        seen.add(msg);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  test('confuse you: m_lev more turns of confusion; magic resistance stops it', () => {
    const { o } = find(3, 'You feel confused!');
    expect(o.text[0]).toBe('The priest casts a spell at you!');
    expect(left(o.state, P.CONFUSION)).toBe(3);
    expect(lost(o)).toBe(0);
    const more = find(3, 'You feel more confused!', ({ s }) =>
      run(s.state, (ctx) => makeConfused(ctx, 4, false)),
    );
    expect(left(more.o.state, P.CONFUSION)).toBe(7);
    const mr = find(3, 'You feel momentarily dizzy.', ({ s }) =>
      setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true),
    );
    expect(hasProp(getPlayer(mr.o.state), P.CONFUSION)).toBe(false);
  });

  test('paralyze: frozen for 4 + m_lev turns, which is also the damage', () => {
    // no natural regeneration during the helpless turns (level + con > rn2(100) never holds)
    const { s, o } = find(5, 'You are frozen in place!', ({ s }) => {
      const h = getPlayer(s.state);
      h.c.attributes!.con = 0;
      h.c.experience!.level = 0;
    });
    expect(o.text[0]).toBe('The priest casts a spell at you!');
    const h = getPlayer(o.state);
    expect(h.c.helpless?.reasonKey).toBe('helpless.paralyzed_monster');
    // the step runs on through her helpless turns: `until` counts from the cast's turn
    expect((h.c.helpless?.until ?? 0) - s.state.turn).toBe(1 + 9);
    expect(o.state.turn).toBeGreaterThan(s.state.turn);
    expect(lost(o)).toBe(9);
  });

  test('paralyze with Free action: you stiffen briefly, 1 turn and 1 point', () => {
    const { s, o } = find(5, 'You stiffen briefly.', ({ s }) => {
      const h = getPlayer(s.state);
      setIntrinsic(h, P.FREE_ACTION, true);
      // max HP one below current: after the 1 point she is at max, so the turn of helplessness
      // cannot regenerate it away (regen_hp() only runs below max)
      if (h.c.hp) h.c.hp.max = 499;
    });
    const h = getPlayer(o.state);
    expect((h.c.helpless?.until ?? 0) - s.state.turn).toBe(1 + 1);
    expect(lost(o)).toBe(1);
  });

  test('paralyze while already helpless: no message, a longer freeze is kept', () => {
    const { s, id } = setup(5, 4, 3, 100, CLERIC);
    run(s.state, (ctx) => {
      getPlayer(ctx.state).c.helpless = {
        until: ctx.state.turn + 30,
        reasonKey: 'helpless.asleep',
      };
    });
    // the paralyze branch: the only one that sets multi_reason (a 9-point wound is not it)
    const o = outcomes(s.state, (ctx) => castmu(ctx, id, CLRC, true, true)).find(
      (x) =>
        lost(x) === 9 && getPlayer(x.state).c.helpless?.reasonKey === 'helpless.paralyzed_monster',
    );
    expect(o).toBeDefined();
    expect(o!.text).toEqual(['The priest casts a spell at you!']);
    const h = getPlayer(o!.state);
    expect((h.c.helpless?.until ?? 0) - o!.state.turn).toBe(30);
    expect(h.c.helpless?.reasonKey).toBe('helpless.paralyzed_monster'); // multi_reason
  });

  test('blind you: scales cover her eyes for 200 turns', () => {
    const { s, id, o } = find(7, 'Scales cover your eyes!');
    expect(o.text[0]).toBe('The priest casts a spell at you!');
    expect(left(o.state, P.BLINDED)).toBe(200);
    expect(lost(o)).toBe(0);
    // never cast at a blinded hero
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    run(s.state, (ctx) => {
      const mon = ctx.state.entities[String(id)]!;
      expect(spellWouldBeUseless(ctx, mon, 'blind_you')).toBe(true);
    });
  });

  /** S_ANT monsters: mkclass(S_ANT) picks giant ants, killer bees, soldier and fire ants... */
  const ants = (st: GameState) =>
    Object.values(st.entities).filter(
      (e) => defs.isMonster(e.def) && defs.monster(e.def).glyph.ch === 'a',
    );

  test('insects: quan + 1 awake hostile ants around her (quan >= 3)', () => {
    const { o } = find(9, 'The priest summons insects!');
    expect(o.text[0]).toBe('The priest casts a spell!'); // undirected
    const made = ants(o.state);
    expect(made.length).toBeGreaterThanOrEqual(4);
    expect(made.length).toBeLessThanOrEqual(5); // rnd(9 / 2) + 1 at most
    for (const a of made) {
      expect(a.c.monster).toMatchObject({ peaceful: false, asleep: false });
      expect(a.c.monster?.tame).toBeUndefined();
    }
  });

  test('insects: mkclass(S_ANT) also makes killer bees and soldier ants, not only giant ants', () => {
    const st = setup(9, 4, 3, 100, CLERIC);
    const kinds = new Set<string>();
    for (const o of outcomes(st.s.state, (ctx) => castmu(ctx, st.id, CLRC, true, true), 400))
      if (o.text.includes('The priest summons insects!'))
        for (const a of ants(o.state)) kinds.add(a.def);
    expect(kinds).toContain('nh:giant_ant');
    expect(kinds).toContain('nh:killer_bee');
    expect(kinds).toContain('nh:soldier_ant');
  });

  test('insects from an unseen caster: she only hears the summoning', () => {
    const { o } = find(9, 'You hear someone summoning insects.', ({ s }) => {
      setIntrinsic(getPlayer(s.state), P.BLINDED, true);
      s.step({ type: 'wait' });
    });
    expect(o.text).toEqual(['You hear someone summoning insects.']); // undirected: no "casts"
    expect(ants(o.state).length).toBeGreaterThanOrEqual(4);
  });

  test('lightning: d(8,6) and the flash blinds her', () => {
    const { o } = find(12, 'A bolt of lightning strikes down at you from above!');
    expect(o.text).toContain('You are blinded by the flash!');
    expect(lost(o)).toBeGreaterThanOrEqual(8);
    expect(lost(o)).toBeLessThanOrEqual(48);
    const b = left(o.state, P.BLINDED);
    expect(b).toBeGreaterThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(100);
  });

  test('lightning with shock resistance: no damage, but the flash', () => {
    const { o } = find(12, 'A bolt of lightning strikes down at you from above!', ({ s }) =>
      setIntrinsic(getPlayer(s.state), P.SHOCK_RES, true),
    );
    expect(lost(o)).toBe(0);
    expect(o.text).toContain('You are blinded by the flash!');
  });

  test('lightning with reflection: it bounces off, no damage and no flash', () => {
    const { o } = find(12, 'It bounces off your medallion.', ({ s }) => {
      const am = s.carry('nh:amulet_of_reflection');
      itemOf(s.state, am).equipped = 'amulet';
      updateWornProps(s.state, defs, s.state.playerId);
    });
    expect(lost(o)).toBe(0);
    expect(o.text).not.toContain('You are blinded by the flash!');
    expect(left(o.state, P.BLINDED)).toBe(0);
  });

  test('fire pillar: d(8,6), none with fire resistance', () => {
    const { o } = find(13, 'A pillar of fire strikes all around you!');
    expect(lost(o)).toBeGreaterThanOrEqual(8);
    expect(lost(o)).toBeLessThanOrEqual(48);
    const res = find(13, 'A pillar of fire strikes all around you!', ({ s }) =>
      setIntrinsic(getPlayer(s.state), P.FIRE_RES, true),
    );
    expect(lost(res.o)).toBe(0);
  });

  test('geyser: d(8,6) physical damage, whatever she resists', () => {
    const { o } = find(14, 'A sudden geyser slams into you from nowhere!', ({ s }) => {
      for (const p of [P.FIRE_RES, P.SHOCK_RES, P.ANTIMAGIC])
        setIntrinsic(getPlayer(s.state), p, true);
    });
    expect(lost(o)).toBeGreaterThanOrEqual(8);
    expect(lost(o)).toBeLessThanOrEqual(48);
  });
});
