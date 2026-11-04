import { getPlayer, type EntityId, type Json, type StepResult } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { nhData } from '../src/items';
import { P, setItimeout } from '../src/props';
import { P_UNSKILLED } from '../src/skills';
import { KEEN } from '../src/spell';
import { findAc } from '../src/stats';
import { pwOf, setPw, uspellOf } from '../src/uenergy';
import { addMon } from './helpers';
import { defs, engine, levelSetup } from './itemHelpers';

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

  test('force bolt, sleep, healing and confuse monster are not castable yet (no cost)', () => {
    const s = caster();
    know(s, [FORCE_BOLT, SLEEP, HEALING, CONFUSE]);
    for (let i = 0; i < 4; i++) {
      const t0 = s.state.turn;
      expect(castText(s, i)).toEqual(['Nothing happens.']);
      expect(s.state.turn).toBe(t0);
      expect(pwOf(s.state).uen).toBe(100);
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

    // a 0% chance (Wis 3) always fails too
    const w = caster();
    know(w, [LIGHT]);
    hero(w).c.attributes!.wis = 3;
    expect(castText(w)).toEqual(['You fail to cast the spell correctly.']);
    expect(pwOf(w.state).uen).toBe(98);
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
