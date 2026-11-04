import {
  createEngine,
  getPlayer,
  newMemory,
  type Ctx,
  type DefId,
  type EntityId,
  type Json,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { setTerrain } from '../src/actions';
import { T, vanillaMod } from '../src/index';
import { nhData } from '../src/items';
import { setU, uState } from '../src/luck';
import { confuseMonsterSpell } from '../src/cast';
import { frozenTime, isFrozen, isMConfused, setMConfused } from '../src/mstate';
import { P, setIntrinsic, setItimeout } from '../src/props';
import { P_SKILLED, P_UNSKILLED } from '../src/skills';
import { KEEN } from '../src/spell';
import { percentSuccess, spellDamageBonus, spellHitBonus } from '../src/spellcalc';
import { findAc, findMac } from '../src/stats';
import { pwOf, setPw, setUspell, uspellOf } from '../src/uenergy';
import { addMon } from './helpers';
import { ctxFor, defs, engine, levelSetup, render } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;

const FORCE_BOLT = 'nh:spellbook_of_force_bolt';
const SLEEP = 'nh:spellbook_of_sleep';
const HEALING = 'nh:spellbook_of_healing';
const CONFUSE = 'nh:spellbook_of_confuse_monster';
const LIGHT = 'nh:spellbook_of_light';
const DETECT = 'nh:spellbook_of_detect_monsters';
const CURE_BLIND = 'nh:spellbook_of_cure_blindness';
const PROTECTION = 'nh:spellbook_of_protection';

/** Sets the spells the hero knows (spl_book), all with the same retention. */
function know(s: Setup, ids: string[], retention = KEEN): void {
  (s.state.modData['nh'] as Record<string, Json>)['spells'] = ids.map((id) => ({ id, retention }));
}

/**
 * A hero who never fails a spell of the subset: Wis 25 and a robe with no metal body armor
 * (percent_success() 100 for levels 1-3), and plenty of Pw.
 */
function caster(rows?: string[], seed = 1): Setup {
  const s = levelSetup(rows, seed);
  const h = getPlayer(s.state);
  if (h.c.attributes) h.c.attributes.wis = 25;
  const robe = s.carry('nh:robe');
  s.state.entities[String(robe)]!.c.item!.equipped = 'cloak';
  setPw(s.ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
  return s;
}

const hero = (s: Setup) => getPlayer(s.state);

/** `Z`, then the spell at menu index `i`. */
function cast(s: Setup, i = 0): StepResult {
  const r = s.mod('nh:cast');
  const p = s.state.pendingPrompt?.prompt;
  if (!p) return r;
  expect(p.id).toBe('cast-menu');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: i });
}
const castText = (s: Setup, i = 0): string[] => s.text(cast(s, i));
/** Answers the pending direction prompt (null dismisses it). */
function aim(s: Setup, dir: string | null): StepResult {
  const p = s.state.pendingPrompt?.prompt;
  expect(p?.id).toBe('cast-direction');
  return engine.step(s.state, { type: 'answer', promptId: 'cast-direction', value: dir });
}
/** `Z`, the spell at menu index `i`, then the direction: all the text. */
const castAt = (s: Setup, dir: string | null, i = 0): string[] => [
  ...castText(s, i),
  ...s.text(aim(s, dir)),
];
/** A pinned monster: asleep or not, speed 0, `hp` hit points. */
function pinned(s: Setup, def: string, x: number, y: number, hp = 100, asleep = true): EntityId {
  const m = addMon(s.state, def, x, y, { asleep });
  const e = s.state.entities[String(m)]!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  return m;
}
const hpOf = (s: Setup, id: EntityId): number => s.state.entities[String(id)]?.c.hp?.cur ?? -1;

describe('the cast command', () => {
  test('offered on the hero only once she knows a spell; the menu lists the known spells', () => {
    const s = caster();
    const offered = () =>
      engine
        .query(s.state)
        .actionsFor({ kind: 'self' })
        .some((o) => o.action.type === 'mod' && o.action.action === 'nh:cast');
    expect(offered()).toBe(false);
    expect(s.text(s.mod('nh:cast'))).toEqual(["You don't know any spells right now."]);
    know(s, [LIGHT, PROTECTION]);
    expect(offered()).toBe(true);
    s.mod('nh:cast');
    const p = s.state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('menu');
    expect(p?.cancellable).toBe(true);
    expect(p?.options?.map((o) => [o.value, o.letter, o.key])).toEqual([
      [0, 'a', 'spell.entry'],
      [1, 'b', 'spell.entry'],
    ]);
  });

  test('dismissing the menu costs nothing', () => {
    const s = caster();
    know(s, [LIGHT]);
    const t0 = s.state.turn;
    s.mod('nh:cast');
    const r = engine.step(s.state, { type: 'answer', promptId: 'cast-menu', value: null });
    expect(s.text(r)).toEqual([]);
    expect(s.state.turn).toBe(t0);
    expect(pwOf(s.state).uen).toBe(100);
  });

  test('a directional spell asks its direction after the energy is spent', () => {
    const s = caster();
    // sleep is level 3: an unskilled XL1 caster has 57%; at XL30 it cannot fail
    hero(s).c.experience!.level = 30;
    know(s, [FORCE_BOLT, SLEEP, HEALING]);
    for (const b of [FORCE_BOLT, SLEEP, HEALING])
      expect(percentSuccess(s.state, defs, b as DefId)).toBe(100);
    for (let i = 0; i < 3; i++) {
      const t0 = s.state.turn;
      const uen = pwOf(s.state).uen;
      cast(s, i);
      const p = s.state.pendingPrompt?.prompt;
      expect(p?.id).toBe('cast-direction');
      expect(p?.kind).toBe('direction');
      expect(p?.options?.map((o) => o.value)).toContain('self');
      expect(s.state.turn).toBe(t0); // no time yet
      expect(pwOf(s.state).uen).toBeLessThan(uen); // the energy is gone
      aim(s, 'n'); // into the void: nothing there
      expect(s.state.turn).toBeGreaterThan(t0);
    }
  });
});

describe('rejections before the menu', () => {
  test('stunned, strangled, or no free hand', () => {
    const s = caster();
    know(s, [LIGHT]);
    setItimeout(s.state, hero(s), P.STUNNED, 5);
    expect(s.text(s.mod('nh:cast'))).toEqual(['You are too impaired to cast a spell.']);
    expect(s.state.pendingPrompt).toBeNull();
    setItimeout(s.state, hero(s), P.STUNNED, 0);
    setItimeout(s.state, hero(s), P.STRANGLED, 5);
    expect(s.text(s.mod('nh:cast'))).toEqual(['You are unable to chant the incantation.']);
    setItimeout(s.state, hero(s), P.STRANGLED, 0);
    // her long sword welded to her hand and a cursed shield: no hand free
    const sword = s.carry('nh:long_sword');
    const shield = s.carry('nh:small_shield');
    for (const o of Object.values(s.state.entities)) {
      const it = o?.c.item;
      if (it?.carriedBy === s.state.playerId && it.equipped) it.equipped = null;
    }
    const sw = s.state.entities[String(sword)]?.c.item;
    const sh = s.state.entities[String(shield)]?.c.item;
    if (!sw || !sh) throw new Error('no items');
    Object.assign(sw, { equipped: 'weapon', buc: 'cursed' });
    Object.assign(sh, { equipped: 'shield', buc: 'cursed' });
    expect(s.text(s.mod('nh:cast'))).toEqual(['Your arms are not free to cast!']);
    sh.buc = 'uncursed'; // one hand free again
    s.mod('nh:cast');
    expect(s.state.pendingPrompt?.prompt.id).toBe('cast-menu');
  });
});

describe('the cast checks', () => {
  test('a forgotten spell backfires: confusion and/or stun by spell level, some Pw lost', () => {
    // cure blindness is level 2: duration 9. The four outcomes of rn2(10) as (confusion, stun).
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = caster(undefined, seed);
      know(s, [CURE_BLIND], 0);
      setPw(s.ctx, { uen: 10, uenmax: 100, uenpeak: 100 });
      const t0 = s.state.turn;
      expect(castText(s)).toEqual([
        'Your knowledge of this spell is twisted.',
        'It invokes nightmarish images in your mind...',
      ]);
      expect(s.state.turn).toBeGreaterThan(t0); // time passes
      const left = (name: string) => {
        const t = hero(s).c.props?.[name]?.timeout ?? 0;
        return t > 0 ? t - t0 : 0;
      };
      const o = `${left(P.CONFUSION)},${left(P.STUNNED)}`;
      expect(['9,0', '6,3', '3,6', '0,9']).toContain(o);
      outcomes.add(o);
      // rnd(10) lost
      expect(pwOf(s.state).uen).toBeGreaterThanOrEqual(0);
      expect(pwOf(s.state).uen).toBeLessThan(10);
    }
    expect(outcomes.size).toBe(4);
  });

  test('the four fading warnings', () => {
    const cases: [number, string | null][] = [
      [1, 'You strain to recall the spell.'],
      [100, 'You strain to recall the spell.'],
      [101, 'You have difficulty remembering the spell.'],
      [500, 'You have difficulty remembering the spell.'],
      [1000, 'Your knowledge of this spell is growing faint.'],
      [2000, 'Your recall of this spell is gradually fading.'],
      [2001, null],
    ];
    for (const [retention, warning] of cases) {
      const s = caster();
      know(s, [LIGHT], retention);
      setPw(s.ctx, { uen: 0, uenmax: 10, uenpeak: 10 }); // stop at the energy check
      const t0 = s.state.turn;
      expect(castText(s)).toEqual([
        ...(warning ? [warning] : []),
        "You don't have enough energy to cast that spell.",
      ]);
      expect(s.state.turn).toBe(t0);
    }
  });

  test('too hungry, too weak, overloaded', () => {
    let s = caster();
    know(s, [LIGHT]);
    hero(s).c.hunger!.nutrition = 10;
    let t0 = s.state.turn;
    expect(castText(s)).toEqual(['You are too hungry to cast that spell.']);
    expect(s.state.turn).toBe(t0);
    expect(pwOf(s.state).uen).toBe(100);

    s = caster();
    know(s, [LIGHT]);
    hero(s).c.attributes!.str = 3;
    expect(castText(s)).toEqual(['You lack the strength to cast spells.']);
    expect(s.state.turn).toBe(t0);

    s = caster();
    know(s, [LIGHT]);
    s.carry('nh:arrow', { quantity: 5000 });
    t0 = s.state.turn;
    expect(castText(s)).toEqual(['Your concentration falters while carrying so much stuff.']);
    expect(s.state.turn).toBeGreaterThan(t0); // this one takes the move
    expect(pwOf(s.state).uen).toBe(100);
  });

  test('not enough energy: plain, "yet" (never had enough) and "anymore" (had once)', () => {
    const cases: [number, number, number, string][] = [
      [4, 10, 10, "You don't have enough energy to cast that spell."],
      [4, 4, 4, "You don't have enough energy to cast that spell yet."],
      [4, 4, 10, "You don't have enough energy to cast that spell anymore."],
    ];
    for (const [uen, uenmax, uenpeak, text] of cases) {
      const s = caster();
      know(s, [LIGHT]);
      setPw(s.ctx, { uen, uenmax, uenpeak });
      const t0 = s.state.turn;
      expect(castText(s)).toEqual([text]);
      expect(s.state.turn).toBe(t0);
      expect(pwOf(s.state).uen).toBe(uen);
    }
  });

  test('a failed cast costs half the energy and a move; confusion always fails', () => {
    const s = caster();
    know(s, [CURE_BLIND]); // level 2: 10 Pw
    setItimeout(s.state, hero(s), P.CONFUSION, 50);
    const t0 = s.state.turn;
    expect(castText(s)).toEqual(['You fail to cast the spell correctly.']);
    expect(s.state.turn).toBeGreaterThan(t0);
    expect(pwOf(s.state).uen).toBe(95);

    // a 0% chance (Wis 3, a level 2 spell, no robe) always fails too
    const w = caster();
    know(w, [CURE_BLIND]);
    hero(w).c.attributes!.wis = 3;
    for (const e of Object.values(w.state.entities))
      if (e.def === 'nh:robe' && e.c.item) e.c.item.equipped = null;
    expect(percentSuccess(w.state, defs, CURE_BLIND)).toBe(0);
    expect(castText(w)).toEqual(['You fail to cast the spell correctly.']);
    expect(pwOf(w.state).uen).toBe(95);
  });

  test('a successful cast costs all the energy and trains the spell school', () => {
    const s = caster();
    know(s, [LIGHT]);
    // a Valkyrie is restricted in divination: give the hero the skill to see the practice
    const d = nhData(s.ctx);
    d.skills!['divination_spell'] = P_UNSKILLED;
    const before = d.skillAdvance?.['divination_spell'] ?? 0;
    castText(s);
    expect(pwOf(s.state).uen).toBe(95);
    expect(nhData(s.ctx).skillAdvance?.['divination_spell']).toBe(before + 1); // spell level 1
    // a restricted school does not train
    const r = caster();
    know(r, [LIGHT]);
    castText(r);
    expect(nhData(r.ctx).skillAdvance?.['divination_spell']).toBeUndefined();
  });

  test('the hunger cost is twice the energy, capped to leave 3 nutrition', () => {
    const delta = (nutrition: number, doCast: boolean): number => {
      const s = caster();
      know(s, [CURE_BLIND]); // 10 Pw -> 20 nutrition
      hero(s).c.hunger!.nutrition = nutrition;
      if (doCast) castText(s);
      else s.step({ type: 'wait' });
      return nutrition - hero(s).c.hunger!.nutrition;
    };
    expect(delta(900, true) - delta(900, false)).toBe(20);
    // 15 nutrition: only 12 can go
    expect(delta(15, true) - delta(15, false)).toBe(12);
  });
});

describe('the self-targeted spells', () => {
  test('light lights the area around her', () => {
    const s = caster(['.......', '...@...', '.......']);
    know(s, [LIGHT]);
    const lv = s.state.levels['dlvl1']!;
    lv.lit = lv.lit.map(() => 0);
    expect(castText(s)).toEqual(['A lit field surrounds you!']);
    expect(lv.lit.every((v) => v === 1)).toBe(true);
  });

  test('detect monsters puts every monster of the level into her monster memory', () => {
    const rows = ['..........................', '.@........................'];
    const s = caster(rows);
    know(s, [DETECT]);
    const lv = s.state.levels['dlvl1']!;
    lv.lit = lv.lit.map(() => 0); // dark: she sees only next to her
    s.state.monsterMemory['dlvl1'] = {};
    const far: EntityId[] = [
      addMon(s.state, 'nh:newt', 20, 0, { asleep: true }),
      addMon(s.state, 'nh:jackal', 25, 1, { asleep: true }),
    ];
    for (const id of far) s.state.entities[String(id)]!.c.actor!.speed = 0;
    s.step({ type: 'wait' });
    expect(Object.keys(s.state.monsterMemory['dlvl1'] ?? {})).toEqual([]);
    expect(castText(s)).toEqual(['You sense the presence of monsters.']);
    expect(s.state.monsterMemory['dlvl1']).toEqual({
      [String(0 * 26 + 20)]: 'nh:newt',
      [String(1 * 26 + 25)]: 'nh:jackal',
    });
  });

  test('detect monsters on an empty level: "You feel threatened." (a strange feeling for beginners)', () => {
    const s = caster();
    know(s, [DETECT]);
    expect(castText(s)).toEqual(['You have a strange feeling for a moment, then it passes.']);
    const t = caster();
    know(t, [DETECT]);
    (nhData(t.ctx) as unknown as { urexp: number }).urexp = 2000; // no longer a beginner
    expect(castText(t)).toEqual(['You feel threatened.']);
    expect(pwOf(t.state).uen).toBe(95); // the energy is spent anyway
  });

  test('cure blindness', () => {
    const s = caster();
    know(s, [CURE_BLIND]);
    setItimeout(s.state, hero(s), P.BLINDED, 100);
    expect(castText(s)).toEqual(['You can see again.']);
    expect(hero(s).c.props?.[P.BLINDED]).toBeUndefined();
  });
});

describe('protection', () => {
  /**
   * A hero at experience level `xl` wearing only the robe (AC 8, `natac` 0 as for AC 10), plus
   * an AC bonus from a ring.
   */
  function bare(xl: number, ringSpe = 0): Setup {
    const s = caster();
    know(s, [PROTECTION]);
    for (const o of Object.values(s.state.entities)) {
      const it = o?.c.item;
      if (it?.carriedBy === s.state.playerId && it.equipped && o?.def !== 'nh:robe')
        it.equipped = null;
    }
    if (ringSpe) {
      const ring = s.carry('nh:ring_of_protection');
      Object.assign(s.state.entities[String(ring)]!.c.item!, { equipped: 'ringL', spe: ringSpe });
    }
    hero(s).c.experience!.level = xl;
    return s;
  }
  const ac = (s: Setup) => findAc(s.state, defs, s.state.playerId);

  /** uspellprot after each cast until a cast gains nothing ("Your skin feels warm"). */
  function series(s: Setup): number[] {
    const out = [uspellOf(s.state).uspellprot];
    for (let i = 0; i < 12; i++) {
      const t = castText(s);
      if (t[0] === 'Your skin feels warm for a moment.') return out;
      out.push(uspellOf(s.state).uspellprot);
    }
    return out;
  }

  test('the AC table rows of cast_protection()', () => {
    expect(series(bare(1))).toEqual([0, 1, 2, 3, 4]); // level 1, AC 10
    expect(series(bare(1, 8))).toEqual([0, 1, 2, 3]); // level 1, AC 0
    expect(series(bare(1, 18))).toEqual([0, 1, 2]); // level 1, AC -10
    expect(series(bare(8))).toEqual([0, 4, 7, 10, 12, 13, 14, 15, 16]); // level 8-15, AC 10
    expect(series(bare(16, 18))).toEqual([0, 5, 8, 9, 10]); // level 16-30, AC -10
  });

  test('the golden haze lowers her AC, and fades one point per 10 turns', () => {
    const s = bare(1);
    expect(ac(s)).toBe(8);
    expect(castText(s)).toEqual(['The air around you begins to shimmer with a golden haze.']);
    expect(castText(s)).toEqual(['The golden haze around you becomes more dense.']);
    expect(ac(s)).toBe(6);
    expect(uspellOf(s.state)).toEqual({ uspellprot: 2, uspmtime: 10, usptime: 8, umconf: 0 });
    const msgs: [number, string][] = [];
    for (let i = 1; i <= 20; i++) {
      for (const m of s.text(engine.step(s.state, { type: 'wait' }))) msgs.push([i, m]);
    }
    expect(msgs).toEqual([
      [8, 'The golden haze around you becomes less dense.'],
      [18, 'The golden haze around you disappears.'],
    ]);
    expect(ac(s)).toBe(8);
  });
});

describe('force bolt', () => {
  test('spell_damage_bonus by Intelligence and level', () => {
    const s = caster();
    const at = (int: number, xl: number, dmg: number): number => {
      hero(s).c.attributes!.int = int;
      hero(s).c.experience!.level = xl;
      return spellDamageBonus(s.state, dmg);
    };
    // Int 9 or less: -3, never below 1 (0 stays 0)
    expect([0, 1, 2, 3, 4, 24].map((d) => at(9, 14, d))).toEqual([0, 1, 1, 1, 1, 21]);
    expect(at(13, 30, 10)).toBe(10);
    expect(at(14, 4, 10)).toBe(10); // below XL 5: nothing
    expect(at(14, 5, 10)).toBe(11);
    expect(at(18, 5, 10)).toBe(11);
    expect(at(19, 5, 10)).toBe(12);
    expect(at(25, 13, 10)).toBe(12);
    expect(at(25, 14, 10)).toBe(13);
  });

  test('hits a pinned monster for 2d12 plus the bonus, or misses by its AC', () => {
    // [Int, XL, bonus for a roll of d]
    const cases: [number, number, (d: number) => number][] = [
      [9, 1, (d) => (d <= 3 ? 1 : d - 3)],
      [14, 5, (d) => d + 1],
      [19, 14, (d) => d + 2],
    ];
    for (const [int, xl, expected] of cases) {
      let hits = 0;
      let misses = 0;
      for (let seed = 1; seed <= 60 && (hits < 2 || misses < 1); seed++) {
        const s = caster(['@.....'], seed);
        hero(s).c.attributes!.int = int;
        hero(s).c.experience!.level = xl;
        know(s, [FORCE_BOLT]);
        const m = pinned(s, 'nh:jackal', 2, 0);
        castText(s);
        // the rolls of the beam: its range, the to-hit roll and the damage
        const c = ctxFor(structuredClone(s.state));
        c.rng.rn2(8);
        const toHit = c.rng.rnd(20);
        const dmg = c.rng.d(2, 12);
        const text = s.text(aim(s, 'e'));
        if (toHit < 10 + findMac(s.state, defs, m)) {
          hits++;
          expect(text[0]).toMatch(/^The spell hits the jackal[.!]$/);
          expect(100 - hpOf(s, m)).toBe(expected(dmg)); // the jackal has no magic resistance
          expect(s.state.entities[String(m)]!.c.monster!.asleep).toBe(false);
        } else {
          misses++;
          expect(text[0]).toBe('The spell misses the jackal.');
          expect(hpOf(s, m)).toBe(100);
        }
      }
      expect(hits).toBeGreaterThanOrEqual(2);
      expect(misses).toBeGreaterThanOrEqual(1);
    }
  });

  test('a magic-resistant monster says "Boing!" (no vanilla monster of the subset has AD_MAGM)', () => {
    const mrMod: Mod = {
      id: 't',
      version: '1.0.0',
      register(api) {
        api.defineMonster({
          ...defs.monster('nh:jackal' as DefId),
          id: 't:warded_jackal' as DefId,
          attacks: [{ at: 'bite', ad: 'magm', n: 1, d: 2 }],
        });
      },
    };
    const eng = createEngine([vanillaMod, mrMod]);
    const { state } = eng.newGame({ seed: 3 });
    for (const k of Object.keys(state.entities))
      if (Number(k) !== state.playerId && !state.entities[k]?.c.item?.carriedBy)
        delete state.entities[k];
    const level: Level = {
      id: 'dlvl1',
      depth: 1,
      dungeon: 'nh:main',
      dlevel: 1,
      width: 5,
      height: 1,
      palette: [T.stone, T.floor],
      cells: [1, 1, 1, 1, 1],
      lit: [1, 1, 1, 1, 1],
      rooms: [],
      traps: [],
      branch: null,
      up: null,
      down: null,
    };
    state.levels['dlvl1'] = level;
    state.memory['dlvl1'] = newMemory(level);
    state.currentLevel = 'dlvl1';
    const h = getPlayer(state);
    Object.assign(h.c.pos!, { level: 'dlvl1', x: 0, y: 0 });
    h.c.attributes!.wis = 25;
    for (const o of Object.values(state.entities))
      if (o?.c.item?.carriedBy === state.playerId) o.c.item.equipped = null;
    const ctx = { state };
    setPw(ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
    (state.modData['nh'] as Record<string, Json>)['spells'] = [{ id: FORCE_BOLT, retention: KEEN }];
    const m = addMon(state, 't:warded_jackal', 2, 0, { asleep: true });
    state.entities[String(m)]!.c.hp = { cur: 50, max: 50 };
    state.entities[String(m)]!.c.actor!.speed = 0;
    let boings = 0;
    for (let i = 0; i < 5; i++) {
      eng.step(state, { type: 'mod', action: 'nh:cast' as DefId });
      const menu = eng.step(state, { type: 'answer', promptId: 'cast-menu', value: 0 });
      if (!state.pendingPrompt) {
        // a failed cast (no robe here: Wis 25 gives 70%)
        expect(menu.events.some((e) => e.type === 'msg' && e.key === 'cast.fail')).toBe(true);
        continue;
      }
      const r = eng.step(state, { type: 'answer', promptId: 'cast-direction', value: 'e' });
      expect(r.events.some((e) => e.type === 'msg' && e.key === 'zap.boing')).toBe(true);
      boings++;
    }
    expect(boings).toBeGreaterThan(0);
    expect(state.entities[String(m)]!.c.hp!.cur).toBe(50);
  });

  test('breaks a closed door and fragile things on the floor', () => {
    const s = caster(['@...']);
    know(s, [FORCE_BOLT]);
    setTerrain(s.state.levels['dlvl1']!, 2, 0, T.door_closed);
    expect(castAt(s, 'e')).toContain('The door crashes open!');
    expect(s.state.levels['dlvl1']!.palette[s.state.levels['dlvl1']!.cells[2] ?? 0]).toBe(
      T.doorway,
    );
  });

  test('at herself: "You bash yourself!", and the killer is "zapped herself with a spell"', () => {
    const s = caster();
    know(s, [FORCE_BOLT]);
    const before = hero(s).c.hp!.cur;
    expect(castAt(s, 'self')).toContain('You bash yourself!');
    expect(hero(s).c.hp!.cur).toBeLessThan(before);
    const d = caster();
    know(d, [FORCE_BOLT]);
    hero(d).c.hp!.cur = 1;
    castAt(d, 'self');
    expect(d.state.gameOver?.killer).toBe('@killer.zap.self.spell');
    expect(render({ key: 'killer.zap.self.spell' })).toBe('zapped herself with a spell');
  });

  test('dismissing the direction releases the energy at herself', () => {
    const s = caster();
    know(s, [FORCE_BOLT]);
    const text = castAt(s, null);
    expect(text.slice(0, 2)).toEqual(['The magical energy is released!', 'You bash yourself!']);
    expect(pwOf(s.state).uen).toBe(95);
  });

  test('a successful cast trains attack spells', () => {
    const s = caster(['@.....']);
    know(s, [FORCE_BOLT]);
    const d = nhData(s.ctx);
    const before = d.skillAdvance?.['attack_spell'] ?? 0;
    castAt(s, 'e');
    expect(nhData(s.ctx).skillAdvance?.['attack_spell']).toBe(before + 1);
  });
});

describe('healing', () => {
  test('heals a peaceful monster without waking it; +1 alignment for a lawful hero', () => {
    const s = caster(['@.....']);
    know(s, [HEALING]);
    setU(s.ctx, { alignType: 1, alignRecord: 0 });
    const m = pinned(s, 'nh:jackal', 2, 0);
    s.state.entities[String(m)]!.c.hp = { cur: 1, max: 50 };
    s.state.entities[String(m)]!.c.monster!.peaceful = true;
    castText(s);
    const c = ctxFor(structuredClone(s.state));
    c.rng.rn2(8);
    const amt = c.rng.d(6, 4);
    expect(s.text(aim(s, 'e'))).toContain('The jackal looks better.');
    expect(hpOf(s, m)).toBe(1 + amt);
    expect(s.state.entities[String(m)]!.c.monster!.asleep).toBe(true);
    expect(uState(s.state).alignRecord).toBe(1);
    // capped at the maximum
    s.state.entities[String(m)]!.c.hp = { cur: 49, max: 50 };
    castAt(s, 'e');
    expect(hpOf(s, m)).toBe(50);
  });

  test('a hostile monster is healed too, and stays asleep; the neutral Valkyrie gains nothing', () => {
    const s = caster(['@.....']);
    know(s, [HEALING]);
    const m = pinned(s, 'nh:jackal', 1, 0);
    s.state.entities[String(m)]!.c.hp = { cur: 1, max: 50 };
    const rec = uState(s.state).alignRecord;
    castAt(s, 'e');
    expect(hpOf(s, m)).toBeGreaterThanOrEqual(7);
    expect(s.state.entities[String(m)]!.c.monster!.asleep).toBe(true);
    expect(uState(s.state).alignRecord).toBe(rec);
  });

  test('heals herself: d(6,4); blessed at Skilled it cures blindness', () => {
    const s = caster();
    know(s, [HEALING]);
    hero(s).c.hp = { cur: 10, max: 500 };
    // no natural regeneration at the end of the turn (level + con > rn2(100) never holds)
    hero(s).c.attributes!.con = 0;
    hero(s).c.experience!.level = 0;
    castText(s);
    const amt = ctxFor(structuredClone(s.state)).rng.d(6, 4);
    expect(s.text(aim(s, 'self'))).toContain('You feel better.');
    expect(hero(s).c.hp!.cur).toBe(10 + amt);
    // not Skilled: blindness stays
    setItimeout(s.state, hero(s), P.BLINDED, 100);
    castAt(s, 'self');
    expect(hero(s).c.props?.[P.BLINDED]).toBeDefined();
    const k = caster();
    know(k, [HEALING]);
    nhData(k.ctx).skills!['healing_spell'] = P_SKILLED;
    setItimeout(k.state, hero(k), P.BLINDED, 100);
    expect(castAt(k, 'self')).toEqual(['You can see again.', 'You feel better.']);
    expect(hero(k).c.props?.[P.BLINDED]).toBeUndefined();
  });
});

describe('sleep', () => {
  /**
   * Basic in enchantment (a level 3 spell is sure at XL 1 then) and Dex 25: the spell to-hit
   * bonus (0 at Basic, +11 Dex) makes every ray hit a jackal.
   */
  function sleeper(rows: string[], seed = 1): Setup {
    const s = caster(rows, seed);
    hero(s).c.attributes!.dex = 25;
    nhData(s.ctx).skills!['enchantment_spell'] = P_UNSKILLED + 1;
    know(s, [SLEEP]);
    return s;
  }

  test('spell_hit_bonus by skill and Dexterity', () => {
    const s = caster();
    const at = (skill: number, dex: number): number => {
      nhData(s.ctx).skills!['enchantment_spell'] = skill;
      hero(s).c.attributes!.dex = dex;
      return spellHitBonus(s.state, SLEEP);
    };
    expect(at(0, 10)).toBe(-4); // restricted
    expect(at(P_UNSKILLED, 3)).toBe(-7);
    expect(at(P_UNSKILLED, 5)).toBe(-6);
    expect(at(P_UNSKILLED, 7)).toBe(-5);
    expect(at(P_UNSKILLED, 13)).toBe(-4);
    expect(at(P_UNSKILLED + 1, 14)).toBe(0); // Basic
    expect(at(P_SKILLED, 16)).toBe(4);
    expect(at(P_SKILLED + 1, 18)).toBe(7); // Expert
  });

  test('the ray puts a line of monsters to sleep (u.ulevel / 2 + 1 dice of 25)', () => {
    // the ray can miss (zhitm()'s AC roll) or the jackal resist: find a cast that hits all three
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = sleeper(['@.......'], seed);
      const ms = [2, 3, 4].map((x) => pinned(s, 'nh:jackal', x, 0, 100, false));
      const text = castAt(s, 'e');
      if (text.filter((t) => t === 'The sleep ray hits the jackal.').length !== 3) continue;
      if (!ms.every((m) => isFrozen(s.ctx, m))) continue;
      found = true;
      for (const m of ms) {
        expect(frozenTime(s.ctx, m)).toBeLessThanOrEqual(25); // XL 1: one die
        expect(hpOf(s, m)).toBe(100);
      }
    }
    expect(found).toBe(true);
  });

  test('the ray bounces and puts her to sleep on the rebound, unless she resists', () => {
    let slept = 0;
    let resisted = 0;
    for (let seed = 1; seed <= 30 && (slept < 1 || resisted < 1); seed++) {
      for (const res of [false, true]) {
        const s = sleeper(['@..'], seed);
        if (res) setIntrinsic(hero(s), P.SLEEP_RES, true);
        const t0 = s.state.turn;
        const text = castAt(s, 'e');
        expect(text).toContain('The sleep ray bounces!');
        if (!text.includes('The sleep ray hits you!')) continue;
        if (res) {
          resisted++;
          expect(text).toContain("You don't feel sleepy.");
          expect(text).not.toContain('You wake up.');
        } else {
          slept++;
          expect(text.at(-1)).toBe('You wake up.');
          expect(s.state.turn - t0).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(slept).toBeGreaterThan(0);
    expect(resisted).toBeGreaterThan(0);
  });
});

describe('confuse monster', () => {
  /** A caster at Basic enchantment (the Valkyrie's school is restricted). */
  function confuser(rows?: string[], seed = 1, skill = P_UNSKILLED + 1): Setup {
    const s = caster(rows, seed);
    nhData(s.ctx).skills!['enchantment_spell'] = skill;
    know(s, [CONFUSE]);
    return s;
  }
  const umconf = (s: Setup): number => uspellOf(s.state).umconf;

  test('the hands glow red, then the glow intensifies: 1 or 2 charges a cast, for 5 Pw', () => {
    const s = confuser();
    const t0 = s.state.turn;
    expect(castText(s)).toEqual(['Your hands begin to glow red.']);
    expect(s.state.turn).toBeGreaterThan(t0);
    expect(pwOf(s.state).uen).toBe(95); // a level 1 spell
    const first = umconf(s);
    expect([1, 2]).toContain(first);
    expect(castText(s)).toEqual(['The red glow of your hands intensifies.']);
    expect([1, 2]).toContain(umconf(s) - first);
  });

  test('at Skilled (the blessed scroll) 2 to 9 charges with a brilliant glow', () => {
    const s = confuser(undefined, 1, P_SKILLED);
    expect(castText(s)).toEqual(['Your hands glow a brilliant red.']);
    const first = umconf(s);
    expect(first).toBeGreaterThanOrEqual(2);
    expect(first).toBeLessThanOrEqual(9);
    expect(castText(s)).toEqual(['Your hands glow an even more brilliant red.']);
    expect(umconf(s) - first).toBeGreaterThanOrEqual(2);
  });

  test('blind, the hands tingle', () => {
    const s = confuser();
    setItimeout(s.state, hero(s), P.BLINDED, 50);
    expect(castText(s)).toEqual(['Your hands tingle.']);
    expect(castText(s)).toEqual(['Your hands tingle even more.']);
    confuseMonsterSpell(s.ctx as unknown as Ctx, true);
    expect(umconf(s)).toBeGreaterThan(2);
  });

  test('from 40 charges on, a cast adds just one', () => {
    const s = confuser(undefined, 1, P_SKILLED);
    setUspell(s.ctx, { umconf: 40 });
    castText(s);
    expect(umconf(s)).toBe(41);
    castText(s);
    expect(umconf(s)).toBe(42);
  });

  test('cast while confused (forced): purple hands and more confusion; blessed cures it', () => {
    const s = confuser();
    setItimeout(s.state, hero(s), P.CONFUSION, 10);
    const before = hero(s).c.props?.[P.CONFUSION]?.timeout ?? 0;
    const events: string[] = [];
    const ctx = {
      ...s.ctx,
      emit: (e: { type: string; key?: string }) => events.push(e.key ?? ''),
    } as unknown as Ctx;
    confuseMonsterSpell(ctx, false);
    expect(events).toEqual(['cast.hands_begin_glow']);
    expect(hero(s).c.props?.[P.CONFUSION]?.timeout ?? 0).toBeGreaterThan(before);
    expect(umconf(s)).toBe(0);
    events.length = 0;
    confuseMonsterSpell(ctx, true);
    expect(events).toEqual(['cast.head_glow', 'conf.less_confused']);
    expect(hero(s).c.props?.[P.CONFUSION]?.timeout ?? 0).toBe(0);
  });

  /** A hero who always hits (experience level 30) with `n` charges, next to a pinned monster. */
  function puncher(def: string, n: number, seed = 1): { s: Setup; m: EntityId } {
    const s = confuser(['@.'], seed);
    hero(s).c.experience!.level = 30;
    setUspell(s.ctx, { umconf: n });
    const m = pinned(s, def, 1, 0, 1000, false);
    s.step({ type: 'wait' }); // see it
    return { s, m };
  }

  test('a hand-to-hand hit confuses the monster and uses a charge; the glow stops after the last', () => {
    const { s, m } = puncher('nh:jackal', 2); // MR 0: never resists
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('Your hands no longer glow so brightly red.');
    expect(text).toContain('The jackal appears confused.');
    expect(text.indexOf('The jackal appears confused.')).toBeGreaterThan(
      text.findIndex((t) => t.startsWith('You hit the jackal')),
    );
    expect(isMConfused(s.ctx, m)).toBe(true);
    expect(umconf(s)).toBe(1);
    // already confused: no charge is used
    s.step({ type: 'move', dir: 'e' });
    expect(umconf(s)).toBe(1);
    setMConfused(s.ctx, m, false);
    const last = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(last).toContain('Your hands stop glowing red.');
    expect(last).toContain('The jackal appears confused.');
    expect(umconf(s)).toBe(0);
    setMConfused(s.ctx, m, false);
    const none = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(none.some((t) => t.includes('confused') || t.includes('glow'))).toBe(false);
    expect(isMConfused(s.ctx, m)).toBe(false);
  });

  test('a monster may resist (magic resistance), and the charge is used all the same', () => {
    let resisted = 0;
    let confused = 0;
    for (let seed = 1; seed <= 60 && (resisted < 1 || confused < 1); seed++) {
      const { s, m } = puncher('nh:gnome_king', 1, seed); // MR 20
      const text = s.text(s.step({ type: 'move', dir: 'e' }));
      expect(text).toContain('Your hands stop glowing red.');
      expect(umconf(s)).toBe(0);
      if (isMConfused(s.ctx, m)) {
        confused++;
        expect(text).toContain('The gnome king appears confused.');
      } else {
        resisted++;
        expect(text.some((t) => t.includes('appears confused'))).toBe(false);
      }
    }
    expect(resisted).toBeGreaterThan(0);
    expect(confused).toBeGreaterThan(0);
  });

  test('a sleeping monster is confused without the message', () => {
    const s = confuser(['@.']);
    hero(s).c.experience!.level = 30;
    setUspell(s.ctx, { umconf: 1 });
    const m = pinned(s, 'nh:jackal', 1, 0, 1000, true);
    s.step({ type: 'wait' }); // see it
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(isMConfused(s.ctx, m)).toBe(true);
    expect(text.some((t) => t.includes('appears confused'))).toBe(false);
  });

  test('a thrown object does not use the glow', () => {
    const s = confuser(['@..']);
    setUspell(s.ctx, { umconf: 3 });
    hero(s).c.experience!.level = 30; // sure to hit
    const m = pinned(s, 'nh:jackal', 2, 0, 1000, false);
    s.mod('nh:throw', { item: s.byLetter('b') }); // the dagger
    const p = s.state.pendingPrompt?.prompt;
    engine.step(s.state, { type: 'answer', promptId: p!.id, value: 'e' });
    expect(hpOf(s, m)).toBeLessThan(1000);
    expect(umconf(s)).toBe(3);
    expect(isMConfused(s.ctx, m)).toBe(false);
  });
});

describe('monster confusion', () => {
  const bites = (t: string): boolean => /^(The jackal|It) (bites|misses|just misses)/.test(t);

  test('a confused monster recovers 1 time in 50 at its move', () => {
    // walled off from the hero: it only wanders
    const s = levelSetup(['@ ......']);
    const m = addMon(s.state, 'nh:jackal', 5, 0);
    setMConfused(s.ctx, m, true);
    let turns = 0;
    while (isMConfused(s.ctx, m) && turns < 2000) {
      engine.step(s.state, { type: 'wait' });
      turns++;
    }
    expect(isMConfused(s.ctx, m)).toBe(false);
    expect(s.state.entities[String(m)]).toBeDefined();
  });

  test('a confused monster wanders (appr 0) instead of closing in', () => {
    const away = (seed: number, conf: boolean): boolean => {
      const s = levelSetup(['@...........'], seed);
      const m = addMon(s.state, 'nh:jackal', 8, 0);
      let x = 8;
      for (let i = 0; i < 6; i++) {
        if (conf) setMConfused(s.ctx, m, true); // no recovery in the middle of the test
        engine.step(s.state, { type: 'wait' });
        const nx = s.state.entities[String(m)]?.c.pos?.x ?? x;
        if (nx > x) return true;
        x = nx;
      }
      return false;
    };
    for (let seed = 1; seed <= 5; seed++) expect(away(seed, false)).toBe(false);
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) found = away(seed, true);
    expect(found).toBe(true);
  });

  test('a confused monster next to the hero moves instead of attacking', () => {
    const turn = (seed: number, conf: boolean): { moved: boolean; bit: boolean } => {
      const s = levelSetup(['.....', '..@..', '.....'], seed);
      const m = addMon(s.state, 'nh:jackal', 3, 1, { energy: 12 });
      if (conf) setMConfused(s.ctx, m, true);
      const text = s.text(engine.step(s.state, { type: 'wait' }));
      const p = s.state.entities[String(m)]?.c.pos;
      return { moved: p?.x !== 3 || p?.y !== 1, bit: text.some(bites) };
    };
    for (let seed = 1; seed <= 5; seed++) {
      const t = turn(seed, false);
      expect(t.moved).toBe(false);
      expect(t.bit).toBe(true);
    }
    let moved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const t = turn(seed, true);
      if (t.moved) {
        moved++;
        expect(t.bit).toBe(false);
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  test('the state goes with the monster', () => {
    const s = levelSetup(['@ ...']);
    const m = addMon(s.state, 'nh:jackal', 3, 0);
    setMConfused(s.ctx, m, true);
    delete s.state.entities[String(m)];
    engine.step(s.state, { type: 'wait' });
    const nh = s.state.modData['nh'] as Record<string, Json>;
    expect(nh['mconf']).toEqual({});
  });
});
