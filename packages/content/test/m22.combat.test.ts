// m22 step 6: role rules in combat. Through the test seam (`setRoleRaceForTest`): martial arts
// for Monks and Samurai (skill bonuses, rnd(4) bare hands, the name "martial arts", the kick),
// the staggering blow and the double punch of skilled bare hands, the Monk's suit penalty and
// unarmed bonus, the Knight's and Samurai's conduct, the Rogue's backstab, the Healer's knife and
// the roles' volley bonuses. Pinned monsters (speed 0, many hit points) and outcomes over many
// blows, never a lucky seed.
// ref: src/uhitm.c find_roll_to_hit(), check_caitiff(), missum(), hitum(), double_punch(),
// hmon_hitmon_barehands(), hmon_hitmon_weapon_melee(), backstabbable(), hmon_hitmon_stagger();
// src/weapon.c weapon_hit_bonus(), weapon_dam_bonus(), P_NAME(); src/dokick.c martial(),
// kickdmg(); src/dothrow.c multishot_class_bonus(), thitmonst()
import {
  getPlayer,
  inventoryOf,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Msg,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  checkCaitiff,
  findRollToHit,
  heroAttack,
  heroWeapon,
  knownHitum,
  type RollState,
} from '../src/combat';
import { multishotClassBonus } from '../src/dothrow';
import { nhData } from '../src/items';
import { setU, uState } from '../src/luck';
import { monflee } from '../src/monflee';
import { isMStunned } from '../src/mstate';
import { countKill } from '../src/vanquished';
import {
  BARE_HANDED,
  P_BASIC,
  P_EXPERT,
  P_GRAND_MASTER,
  P_MASTER,
  P_SKILLED,
  P_UNSKILLED,
  enhanceAction,
  martialBonus,
  skillNameKey,
  weaponDamBonus,
  weaponHitBonus,
} from '../src/skills';
import { ROLE_ORDER } from '../src/roletab';
import { setRoleRaceForTest, type RoleKey } from '../src/urole';
import { addMon } from './helpers';
import { engine, levelSetup, plainKit, render } from './itemHelpers';

const ROOM = ['.........', '.........', '...@.....', '.........', '.........'];
type S = ReturnType<typeof levelSetup>;

/** A plain room for a hero of `role` (a Valkyrie's new game, then the seam). */
function setup(role: RoleKey, seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  setRoleRaceForTest(s.state, role);
  const a = getPlayer(s.state).c.attributes;
  if (a) Object.assign(a, { str: 10, dex: 10, con: 10 }); // no Str damage bonus
  return s;
}

/** Drops everything: bare hands, no suit, no shield. */
function strip(s: S): void {
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
}

const setSkill = (s: S, skill: string, lvl: number): void => {
  (nhData(s.ctx).skills ??= {})[skill] = lvl;
};

/** Carries a new `id` and puts it in `slot` (weapon, body, shield). */
function equip(s: S, id: string, slot: string): EntityId {
  const o = s.carry(id);
  const it = s.state.entities[String(o)]?.c.item;
  if (it) it.equipped = slot as never;
  return o;
}

const ent = (s: S, id: EntityId): Entity => {
  const e = s.state.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};

/** A pinned monster east of the hero: speed 0 and 1000 hit points. */
function pin(
  s: S,
  def: string,
  o: { asleep?: boolean; peaceful?: boolean; x?: number } = {},
): EntityId {
  const id = addMon(s.state, def, o.x ?? 4, 2, o);
  const e = ent(s, id);
  if (e.c.actor) e.c.actor.speed = 0;
  e.c.hp = { cur: 1000, max: 1000 };
  return id;
}

/** Puts the pinned monster back (a stagger may have moved it) with full hit points. */
function reset(s: S, id: EntityId, x = 4): void {
  const e = ent(s, id);
  if (e.c.pos) Object.assign(e.c.pos, { x, y: 2 });
  e.c.hp = { cur: 1000, max: 1000 };
}

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** The messages `fn` emits through the setup's context. */
function said(s: S, fn: () => void): string[] {
  const events = s.ctx.events as GameEvent[];
  const from = events.length;
  fn();
  return texts(events.slice(from));
}

describe('martial arts: P_MASTER, P_GRAND_MASTER and the skill bonuses', () => {
  test('the levels and martial_bonus() for Samurai and Monks only', () => {
    expect([P_MASTER, P_GRAND_MASTER]).toEqual([5, 6]);
    const s = setup('valkyrie');
    for (const role of ROLE_ORDER) {
      setRoleRaceForTest(s.state, role);
      expect(martialBonus(s.state)).toBe(role === 'samurai' || role === 'monk');
    }
  });

  test("weapon_hit_bonus() and weapon_dam_bonus() bare-handed (weapon.c's tables)", () => {
    const levels = [P_UNSKILLED, P_BASIC, P_SKILLED, P_EXPERT, P_MASTER, P_GRAND_MASTER];
    expect(levels.map((l) => weaponHitBonus(l, null))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(levels.slice(1).map((l) => weaponHitBonus(l, null, true))).toEqual([3, 4, 5, 6, 7]);
    expect(levels.map((l) => weaponDamBonus(l, null))).toEqual([0, 1, 1, 2, 2, 3]);
    expect(levels.slice(1).map((l) => weaponDamBonus(l, null, true))).toEqual([3, 4, 6, 7, 9]);
  });

  test('bare-handed combat is "martial arts" for a Monk, in #enhance too', () => {
    const s = setup('monk');
    expect(skillNameKey(s.state, BARE_HANDED)).toBe('skill.martial_arts');
    expect(skillNameKey(s.state, 'dagger')).toBe('skill.dagger');
    const lines = said(s, () => enhanceAction.perform(s.ctx as never, {} as never));
    expect(lines).toEqual([]); // a list, not a message
    const list = (s.ctx.events as GameEvent[]).filter((e) => e.type === 'list').at(-1);
    const items = list?.type === 'list' ? list.items : [];
    const names = items.map((m: Msg) => render(m));
    expect(names.some((t) => t.includes('martial arts'))).toBe(true);
    expect(names.some((t) => t.includes('bare handed combat'))).toBe(false);
    setRoleRaceForTest(s.state, 'valkyrie');
    expect(skillNameKey(s.state, BARE_HANDED)).toBe('skill.bare_handed');
  });
});

describe('bare-handed blows', () => {
  /** The damage of `n` bare-handed hits at `skill` by a stripped hero of `role`. */
  function blows(role: RoleKey, skill: number, n = 200): Set<number> {
    const s = setup(role);
    strip(s);
    setSkill(s, BARE_HANDED, skill);
    const id = pin(s, 'nh:jackal');
    const out = new Set<number>();
    for (let i = 0; i < n; i++) {
      reset(s, id);
      knownHitum(s.ctx as never, id, null, true, null);
      out.add(1000 - (ent(s, id).c.hp?.cur ?? 0));
    }
    return out;
  }

  test('a martial artist does rnd(4) plus the tripled skill bonus; others rnd(2)', () => {
    expect([...blows('monk', P_BASIC)].sort()).toEqual([4, 5, 6, 7]);
    expect([...blows('samurai', P_SKILLED)].sort()).toEqual([5, 6, 7, 8]);
    expect([...blows('valkyrie', P_BASIC)].sort()).toEqual([2, 3]);
    expect([...blows('valkyrie', P_UNSKILLED)].sort()).toEqual([1, 2]);
  });

  /** How many of `n` unarmed hits staggered the monster, and whether each moved and stunned it. */
  function staggers(s: S, def: string, n = 400): number {
    const id = pin(s, def);
    let count = 0;
    for (let i = 0; i < n; i++) {
      reset(s, id);
      const lines = said(s, () => knownHitum(s.ctx as never, id, null, true, null));
      if (lines.some((t) => t.includes('from your powerful strike!'))) {
        count++;
        expect(lines.some((t) => /^You hit/.test(t))).toBe(false);
        expect(ent(s, id).c.pos).toMatchObject({ x: 5, y: 2 }); // hurtled a square away
        expect(isMStunned(s.ctx, id)).toBe(true);
      }
    }
    return count;
  }

  test('an unarmed blow sometimes staggers a smaller monster (rnd(100) < skill)', () => {
    const monk = setup('monk');
    strip(monk);
    setSkill(monk, BARE_HANDED, P_GRAND_MASTER);
    expect(staggers(monk, 'nh:jackal')).toBeGreaterThan(0);
    expect(staggers(monk, 'nh:hill_giant')).toBe(0); // big
    // a suit or a shield is not unarmed
    const suited = setup('monk');
    strip(suited);
    setSkill(suited, BARE_HANDED, P_GRAND_MASTER);
    equip(suited, 'nh:leather_armor', 'body');
    expect(staggers(suited, 'nh:jackal')).toBe(0);
    // Unskilled: rnd(100) is never below 1
    const valk = setup('valkyrie');
    strip(valk);
    setSkill(valk, BARE_HANDED, P_UNSKILLED);
    expect(staggers(valk, 'nh:jackal')).toBe(0);
  });

  /** The blows (hits, misses, staggers) of each of `n` bare-handed attacks. */
  function blowsPerRound(role: RoleKey, skill: number, n = 150): number[] {
    const s = setup(role);
    strip(s);
    setSkill(s, BARE_HANDED, skill);
    const id = pin(s, 'nh:jackal');
    const counts: number[] = [];
    for (let i = 0; i < n; i++) {
      reset(s, id);
      const lines = said(s, () => heroAttack(s.ctx as never, id));
      counts.push(
        lines.filter((t) => /^You (hit|miss)|from your powerful strike!$/.test(t)).length,
      );
    }
    return counts;
  }

  test('skilled bare hands punch twice at times (double_punch()); Basic never', () => {
    const gm = blowsPerRound('monk', P_GRAND_MASTER);
    expect(gm.some((c) => c === 2)).toBe(true);
    expect(gm.every((c) => c === 1 || c === 2)).toBe(true);
    expect(blowsPerRound('valkyrie', P_BASIC).every((c) => c === 1)).toBe(true);
    // a shield takes the second punch away
    const s = setup('monk');
    strip(s);
    setSkill(s, BARE_HANDED, P_GRAND_MASTER);
    equip(s, 'nh:small_shield', 'shield');
    const id = pin(s, 'nh:jackal');
    for (let i = 0; i < 50; i++) {
      reset(s, id);
      const lines = said(s, () => heroAttack(s.ctx as never, id));
      expect(lines.filter((t) => /^You (hit|miss)/.test(t)).length).toBe(1);
    }
  });
});

describe("the Monk's to-hit", () => {
  const roll = (s: S, id: EntityId, r?: RollState): number => {
    const uwep = inventoryOf(s.state, s.state.playerId).find(
      (o) => o.c.item?.equipped === 'weapon',
    );
    return findRollToHit(s.ctx as never, id, 'weapon', heroWeapon(s.ctx as never, uwep ?? null), r);
  };

  test('a suit costs spelarmr (20); no weapon and no shield gives ulevel / 3 + 2', () => {
    for (const level of [1, 9, 14]) {
      const s = setup('monk');
      strip(s);
      setSkill(s, BARE_HANDED, P_BASIC);
      const xp = getPlayer(s.state).c.experience;
      if (xp) xp.level = level;
      const id = pin(s, 'nh:jackal');
      const bonus = Math.trunc(level / 3) + 2;
      const bare = roll(s, id);
      const shield = equip(s, 'nh:small_shield', 'shield');
      expect(bare - roll(s, id)).toBe(bonus);
      delete s.state.entities[String(shield)];
      equip(s, 'nh:leather_armor', 'body');
      const r: RollState = { attknum: 0, armorpenalty: 0 };
      expect(bare - roll(s, id, r)).toBe(bonus + 20);
      expect(r.armorpenalty).toBe(20);
    }
  });

  test('wielding a weapon loses the bonus: the same to-hit as a Valkyrie', () => {
    const s = setup('monk');
    strip(s);
    equip(s, 'nh:dagger', 'weapon');
    setSkill(s, 'dagger', P_BASIC);
    setSkill(s, BARE_HANDED, P_BASIC);
    const id = pin(s, 'nh:jackal');
    const monk = roll(s, id);
    setRoleRaceForTest(s.state, 'valkyrie');
    expect(roll(s, id)).toBe(monk);
  });

  test('"Your armor is rather cumbersome..." only on a miss the suit caused', () => {
    const run = (suit: boolean): string[][] => {
      const s = setup('monk');
      strip(s);
      setSkill(s, BARE_HANDED, P_BASIC);
      if (suit) equip(s, 'nh:leather_armor', 'body');
      const id = pin(s, 'nh:jackal');
      const rounds: string[][] = [];
      for (let i = 0; i < 60; i++) {
        reset(s, id);
        rounds.push(said(s, () => heroAttack(s.ctx as never, id)));
      }
      return rounds;
    };
    const cumbersome = 'Your armor is rather cumbersome...';
    // level 1 against a jackal: the suit's -20 turns every blow into a miss
    const suited = run(true);
    expect(suited.some((r) => r.includes(cumbersome))).toBe(true);
    for (const r of suited) {
      expect(r.some((t) => /^You hit/.test(t))).toBe(false);
      const i = r.indexOf(cumbersome);
      if (i >= 0) expect(r[i + 1]).toBe('You miss the jackal.');
    }
    expect(run(false).some((r) => r.includes(cumbersome))).toBe(false);
  });
});

describe("the Knight's and Samurai's conduct (check_caitiff())", () => {
  function knight(o: { align?: number; record?: number } = {}): S {
    const s = setup('knight');
    setU(s.ctx, { alignType: o.align ?? 1, alignRecord: o.record ?? 10 });
    return s;
  }
  const caitiff = (s: S, id: EntityId): string[] =>
    said(s, () => checkCaitiff(s.ctx as never, ent(s, id)));

  test('a lawful Knight attacking a helpless or fleeing monster: "You caitiff!", -1', () => {
    const s = knight();
    const asleep = pin(s, 'nh:jackal', { asleep: true });
    expect(said(s, () => heroAttack(s.ctx as never, asleep))[0]).toBe('You caitiff!');
    expect(uState(s.state).alignRecord).toBe(9);
    const fleeing = pin(s, 'nh:jackal', { x: 2 });
    monflee(s.ctx as never, fleeing, 0, true, false);
    expect(caitiff(s, fleeing)).toEqual(['You caitiff!']);
    expect(uState(s.state).alignRecord).toBe(8);
    // an awake, unafraid monster, an undead one, a neutral Knight, a record at -10
    expect(caitiff(s, pin(s, 'nh:jackal', { x: 3 }))).toEqual([]);
    expect(caitiff(s, pin(s, 'nh:kobold_zombie', { asleep: true, x: 5 }))).toEqual([]);
    const neutral = knight({ align: 0 });
    expect(caitiff(neutral, pin(neutral, 'nh:jackal', { asleep: true }))).toEqual([]);
    const fallen = knight({ record: -10 });
    expect(caitiff(fallen, pin(fallen, 'nh:jackal', { asleep: true }))).toEqual([]);
    expect(uState(fallen.state).alignRecord).toBe(-10);
    // a Valkyrie hitting a sleeping monster has no such code
    const valk = setup('valkyrie');
    expect(caitiff(valk, pin(valk, 'nh:jackal', { asleep: true }))).toEqual([]);
  });

  test('a Samurai attacking a peaceful monster "dishonorably attack[s] the innocent!"', () => {
    const s = setup('samurai');
    setU(s.ctx, { alignType: 1, alignRecord: 10 });
    const id = pin(s, 'nh:jackal', { peaceful: true });
    expect(caitiff(s, id)).toEqual(['You dishonorably attack the innocent!']);
    expect(uState(s.state).alignRecord).toBe(9);
    expect(caitiff(s, pin(s, 'nh:jackal', { asleep: true, x: 2 }))).toEqual([]); // no Knight
  });

  test('once per round of attacks: the first roll only (attk_count)', () => {
    const s = knight();
    const id = pin(s, 'nh:jackal', { asleep: true });
    const r: RollState = { attknum: 0, armorpenalty: 0 };
    const lines = said(s, () => {
      findRollToHit(s.ctx as never, id, 'weapon', null, r);
      findRollToHit(s.ctx as never, id, 'claw', null, r);
    });
    expect(lines).toEqual(['You caitiff!']);
  });

  test('kicking a fleeing monster and throwing at a sleeping one are just as unchivalrous', () => {
    // (a kick's noise wakes the monster first: wake_nearby(); a slow newt cannot evade it)
    const k = knight();
    monflee(k.ctx as never, pin(k, 'nh:newt'), 0, true, false);
    const kick = k.text(k.mod('nh:kick', { dir: 'e' }));
    expect(kick).toContain('You caitiff!');
    expect(uState(k.state).alignRecord).toBe(9);

    const t = knight();
    pin(t, 'nh:jackal', { asleep: true, x: 6 });
    const dagger = t.carry('nh:dagger');
    t.mod('nh:throw', { item: dagger });
    const prompt = t.state.pendingPrompt?.prompt;
    if (!prompt) throw new Error('no prompt');
    const thrown = t.text(
      engine.stepAll(t.state, { type: 'answer', promptId: prompt.id, value: 'e' }),
    );
    expect(thrown).toContain('You caitiff!');
    expect(uState(t.state).alignRecord).toBe(9);
  });
});

describe("the Rogue's backstab and the Healer's knife", () => {
  /** The messages and damage of `n` dagger hits by a level-10 hero of `role` on `def`. */
  function stabs(
    role: RoleKey,
    def: string,
    o: { flee?: boolean; asleep?: boolean } = {},
    n = 60,
  ): { backstabs: number; most: number } {
    const s = setup(role);
    strip(s);
    const xp = getPlayer(s.state).c.experience;
    if (xp) xp.level = 10;
    const dagger = equip(s, 'nh:dagger', 'weapon');
    setSkill(s, 'dagger', P_BASIC);
    const id = pin(s, def, { asleep: o.asleep ?? false });
    let backstabs = 0;
    let most = 0;
    for (let i = 0; i < n; i++) {
      reset(s, id);
      if (o.flee) monflee(s.ctx as never, id, 0, true, false);
      const lines = said(s, () =>
        knownHitum(s.ctx as never, id, heroWeapon(s.ctx as never, ent(s, dagger)), true, null),
      );
      if (lines.some((t) => t.startsWith('You strike the '))) {
        backstabs++;
        expect(lines.some((t) => /^You hit/.test(t))).toBe(false);
      }
      most = Math.max(most, 1000 - (ent(s, id).c.hp?.cur ?? 0));
    }
    return { backstabs, most };
  }

  test('"You strike the jackal from behind!" (+rnd(level)) at a fleeing or helpless one', () => {
    const fleeing = stabs('rogue', 'nh:jackal', { flee: true });
    expect(fleeing.backstabs).toBeGreaterThan(0);
    expect(fleeing.most).toBeGreaterThan(4); // a dagger's d4, no other bonus
    expect(stabs('rogue', 'nh:jackal', { asleep: true }).backstabs).toBeGreaterThan(0);
    // not an awake, unafraid one, not a blob, not a Valkyrie
    expect(stabs('rogue', 'nh:jackal').backstabs).toBe(0);
    expect(stabs('rogue', 'nh:acid_blob', { flee: true }).backstabs).toBe(0);
    const valk = stabs('valkyrie', 'nh:jackal', { flee: true });
    expect(valk.backstabs).toBe(0);
    expect(valk.most).toBeLessThanOrEqual(4);
  });

  test("a Healer's knife adds min(3, died / 6) of the monster's kind", () => {
    const most = (role: RoleKey, died: number): number => {
      const s = setup(role);
      strip(s);
      const knife = equip(s, 'nh:scalpel', 'weapon');
      setSkill(s, 'knife', P_BASIC);
      for (let i = 0; i < died; i++) countKill(s.ctx, 'nh:jackal' as DefId);
      const id = pin(s, 'nh:jackal');
      const dmg = new Set<number>();
      for (let i = 0; i < 80; i++) {
        reset(s, id);
        knownHitum(s.ctx as never, id, heroWeapon(s.ctx as never, ent(s, knife)), true, null);
        dmg.add(1000 - (ent(s, id).c.hp?.cur ?? 0));
      }
      return Math.max(...dmg);
    };
    const scalpel = most('valkyrie', 0); // d3, +2 to hit only
    expect(most('healer', 0)).toBe(scalpel);
    expect(most('healer', 12)).toBe(scalpel + 2);
    expect(most('healer', 60)).toBe(scalpel + 3);
    expect(most('valkyrie', 60)).toBe(scalpel);
  });
});

describe('martial kicks', () => {
  test("a Monk's kick trains martial arts; a Valkyrie's (no boots) does not", () => {
    const practice = (role: RoleKey): number => {
      const s = setup(role);
      strip(s);
      setSkill(s, BARE_HANDED, P_BASIC);
      const before = nhData(s.ctx).skillAdvance?.[BARE_HANDED] ?? 0;
      const id = pin(s, 'nh:jackal');
      for (let i = 0; i < 30; i++) {
        reset(s, id);
        s.mod('nh:kick', { dir: 'e' });
      }
      return (nhData(s.ctx).skillAdvance?.[BARE_HANDED] ?? 0) - before;
    };
    expect(practice('monk')).toBeGreaterThan(0);
    expect(practice('samurai')).toBeGreaterThan(0);
    expect(practice('valkyrie')).toBe(0);
  });

  test("a martial artist's kick may send a small monster reeling", () => {
    const s = setup('samurai');
    strip(s);
    const id = pin(s, 'nh:jackal');
    let reeled = 0;
    for (let i = 0; i < 40; i++) {
      reset(s, id);
      if (s.text(s.mod('nh:kick', { dir: 'e' })).some((t) => t.endsWith('reels from the blow.')))
        reeled++;
    }
    expect(reeled).toBeGreaterThan(0);
  });
});

describe('volleys (multishot_class_bonus())', () => {
  test("each role's own missiles", () => {
    const s = setup('valkyrie');
    const o = (id: string): Entity => ent(s, s.carry(id));
    const bonus = (role: RoleKey, ammo: string, launcher?: string): number => {
      setRoleRaceForTest(s.state, role);
      return multishotClassBonus(s.ctx as never, o(ammo), launcher ? o(launcher) : null);
    };
    expect(bonus('caveman', 'nh:flint_stone')).toBe(1);
    expect(bonus('caveman', 'nh:spear')).toBe(1);
    expect(bonus('caveman', 'nh:arrow')).toBe(0);
    expect(bonus('monk', 'nh:shuriken')).toBe(1);
    expect(bonus('monk', 'nh:dart')).toBe(0);
    expect(bonus('ranger', 'nh:arrow')).toBe(1);
    expect(bonus('ranger', 'nh:dagger')).toBe(0);
    expect(bonus('rogue', 'nh:dagger')).toBe(1);
    expect(bonus('rogue', 'nh:dart')).toBe(0);
    expect(bonus('samurai', 'nh:ya', 'nh:yumi')).toBe(1);
    expect(bonus('samurai', 'nh:ya', 'nh:bow')).toBe(0);
    expect(bonus('samurai', 'nh:ya')).toBe(0);
    for (const role of ['valkyrie', 'wizard', 'knight'] as const)
      expect(bonus(role, 'nh:dagger')).toBe(0);
  });

  test('a Rogue throws two daggers at times at Basic; a Valkyrie one', () => {
    const thrown = (role: RoleKey, seed: number): number => {
      const s = setup(role, seed);
      setSkill(s, 'dagger', P_BASIC);
      const daggers = s.carry('nh:dagger', { quantity: 10 });
      // (merged with the kit's dagger)
      const stack = s.state.entities[String(daggers)]?.c.item?.quantity ?? 0;
      s.mod('nh:throw', { item: daggers });
      const prompt = s.state.pendingPrompt?.prompt;
      if (!prompt) throw new Error('no prompt');
      engine.stepAll(s.state, { type: 'answer', promptId: prompt.id, value: 'e' });
      return stack - (s.state.entities[String(daggers)]?.c.item?.quantity ?? 0);
    };
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const rogue = seeds.map((seed) => thrown('rogue', seed));
    expect(rogue.every((n) => n === 1 || n === 2)).toBe(true);
    expect(rogue).toContain(2);
    expect(seeds.every((seed) => thrown('valkyrie', seed) === 1)).toBe(true);
  });
});
