// m24 step 1: the quest monsters and the roles' quest table. The table against role.c; role_init()'s
// overlay per role (her leader peaceful, close and aligned with her; another role's leader its own
// row; her nemesis hostile, waiting, wanting the artifact; the Master of Thieves the Tourist's
// nemesis); makemon()'s leader id, the nemesis's Bell of Opening, the guardians' and the ninja's
// gear; the new-game gender draws (Archeologist and Wizard only); pets sparing the leader; the
// chat sounds; a statue of another role's guardian; a wished-for guardian corpse; the Chromatic
// Dragon's random breath. Outcomes over seeds.
// ref: include/monsters.h; src/role.c roles[], role_init(); src/makemon.c makemon(), m_initweap(),
// peace_minded(), set_malign(); src/sounds.c domonnoise(); src/dogmove.c dog_move(); src/dog.c
// tamedog(); src/trap.c animate_statue(); src/objnam.c readobjnam(); src/mondata.c
// get_atkdam_type()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  type Character,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { QUEST_ARTIFACT } from '../src/artilist';
import { chamOf } from '../src/chamstate';
import { domonnoise } from '../src/chat';
import { makemon, peaceMinded } from '../src/generation';
import { vanillaMod } from '../src/index';
import { malign } from '../src/luck';
import { messagesEn } from '../src/messages.en';
import { mstratOf } from '../src/mstate';
import { getAtkdamType } from '../src/mthrowu';
import { readobjnam, wishNames } from '../src/objnam_read';
import {
  isQuestGuardian,
  isQuestLeader,
  isQuestNemesis,
  questGender,
  questMalign,
  questMonDef,
  roleInitQuest,
} from '../src/questmon';
import { questStatus } from '../src/queststate';
import { MIN_QUEST_ALIGN, MIN_QUEST_LEVEL, QUEST_ROLES } from '../src/questtab';
import { animateStatue, mkcorpstat } from '../src/statue';
import { BELL_OF_OPENING } from '../src/uhave';
import { ROLE_ORDER, raceDefId, roleDefId, type RoleKey } from '../src/urole';
import { mkWished } from '../src/wish';
import { addMon, setup } from './helpers';
import { initedog } from '../src/dog';
import { ctxFor, defs, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'qm',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'qm:run',
      labelKey: 'qm',
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
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'qm:run' as DefId }).events);
};
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;
const row = (id: string) => engine.registry.monster(id as DefId);

const RACE: Readonly<Record<RoleKey, string>> = Object.fromEntries(
  ROLE_ORDER.map((r) => [r, 'human']),
) as Record<RoleKey, string>;
const as = (role: RoleKey, more: Partial<Character> = {}): Partial<Character> => ({
  role: roleDefId(role),
  race: raceDefId(RACE[role] as 'human'),
  ...more,
});
const game = (role: RoleKey, seed = 1, more: Partial<Character> = {}): GameState =>
  engine.newGame({ seed, character: as(role, more) }).state;

/** A free floor spot on the hero's level, away from her. */
function freeSpot(state: GameState): Pos {
  const l = getLevel(state);
  const taken = new Set(
    Object.values(state.entities).flatMap((e) =>
      e.c.pos && e.c.pos.level === l.id ? [`${e.c.pos.x},${e.c.pos.y}`] : [],
    ),
  );
  for (let y = 1; y < l.height - 1; y++)
    for (let x = 1; x < l.width - 1; x++)
      if (l.palette[l.cells[y * l.width + x]!] === 'nh:floor' && !taken.has(`${x},${y}`))
        return { x, y };
  throw new Error('no free spot');
}

/** Makes `def` on a free spot of the hero's level. */
function make(state: GameState, def: string): Entity {
  let id: EntityId | null = null;
  run(state, (ctx) => {
    id = makemon(ctx, row(def), freeSpot(state), {});
  });
  expect(id).not.toBeNull();
  return ent(state, id!);
}

const carries = (state: GameState, mon: Entity): string[] =>
  inventoryOf(state, mon.id).map((o) => o.def);

describe('the quest table (role.c roles[])', () => {
  test('every role names existing leaders, guardians, nemeses, enemies and its artifact', () => {
    for (const role of ROLE_ORDER) {
      const q = QUEST_ROLES[role];
      expect(row(q.leader).sound).toBe('leader');
      expect(row(q.guardian).sound).toBe('guardian');
      // the Master of Thieves leads the Rogues and is the Tourists' nemesis
      expect(row(q.nemesis).sound).toBe(role === 'tourist' ? 'leader' : 'nemesis');
      for (const e of [q.enemy1, q.enemy2]) if (e !== null) expect(row(e).id).toBe(e);
      for (const c of [q.enemy1sym, q.enemy2sym])
        expect(engine.registry.monsters.some((m) => m.glyph.ch === c)).toBe(true);
      expect(q.artifact).toBe(QUEST_ARTIFACT[role]);
      expect(render({ key: q.home })).not.toBe(q.home);
      expect(render({ key: q.intermed })).not.toBe(q.intermed);
    }
    const v = QUEST_ROLES.valkyrie;
    expect(v).toMatchObject({
      filecode: 'Val',
      leader: 'nh:norn',
      guardian: 'nh:warrior',
      nemesis: 'nh:lord_surtur',
      enemy1: 'nh:fire_ant',
      enemy2: 'nh:fire_giant',
      enemy1sym: 'a',
      enemy2sym: 'H',
      artifact: 'nh:orb_of_fate',
    });
    expect(render({ key: v.home })).toBe('the Shrine of Destiny');
    expect(render({ key: v.intermed })).toBe('the cave of Surtur');
    expect(QUEST_ROLES.archeologist.enemy1).toBeNull();
    expect([MIN_QUEST_LEVEL, MIN_QUEST_ALIGN]).toEqual([14, 20]);
  });

  test('the 40 rows are never generated at random', () => {
    const quest = engine.registry.monsters.filter(
      (m) =>
        ['leader', 'nemesis', 'guardian'].includes(m.sound ?? '') ||
        m.id === 'nh:ninja' ||
        m.id === 'nh:prisoner',
    );
    expect(quest).toHaveLength(40);
    for (const m of quest) expect(m.genFlags).toContain('nogen');
  });
});

describe("role_init()'s overlay", () => {
  test("a Valkyrie's Norn: MS_LEADER, peaceful, close, aligned with her times 3", () => {
    for (const align of [1, 0] as const) {
      const s = game('valkyrie', 1, { align });
      const norn = questMonDef(s, row('nh:norn'));
      expect(norn.sound).toBe('leader');
      expect(norn.flags).toEqual(expect.arrayContaining(['peaceful', 'close']));
      expect(norn.alignment).toBe(align * 3);
      expect(questMalign(s, 'nh:norn')).toBe(align * 3);
      expect(questMalign(s, 'nh:warrior')).toBe(align * 3);
      expect(questMonDef(s, row('nh:warrior')).flags).toContain('peaceful');
      // her leader is always -20 to kill; her guardians as always-peaceful ones
      expect(malign(norn, true, align)).toBe(-20);
      expect(malign(questMonDef(s, row('nh:warrior')), true, align)).toBe(-15);
    }
  });

  test("a Barbarian's Norn and Lord Surtur are their rows", () => {
    const s = game('barbarian');
    expect(questMonDef(s, row('nh:norn'))).toBe(row('nh:norn'));
    expect(questMonDef(s, row('nh:lord_surtur'))).toBe(row('nh:lord_surtur'));
    expect(questMalign(s, 'nh:norn')).toBeNull();
    expect(isQuestLeader(s, 'nh:pelias')).toBe(true);
    expect(isQuestGuardian(s, 'nh:chieftain')).toBe(true);
    expect(isQuestNemesis(s, 'nh:thoth_amon')).toBe(true);
  });

  test("Lord Surtur is a Valkyrie's nemesis: hostile, nasty, stalking, waiting, wanting the Orb", () => {
    const s = game('valkyrie');
    const d = questMonDef(s, row('nh:lord_surtur'));
    expect(d.sound).toBe('nemesis');
    expect(d.flags).toEqual(
      expect.arrayContaining(['hostile', 'nasty', 'stalk', 'waitforu', 'wantsarti']),
    );
    expect(d.flags).not.toContain('peaceful');
    expect(d.flags).not.toContain('close');
  });

  test("the Master of Thieves: a Rogue's leader, a Tourist's nemesis", () => {
    const rogue = questMonDef(game('rogue'), row('nh:master_of_thieves'));
    expect(rogue.sound).toBe('leader');
    expect(rogue.flags).toContain('peaceful');
    const tou = questMonDef(game('tourist'), row('nh:master_of_thieves'));
    expect(tou.sound).toBe('nemesis');
    expect(tou.flags).not.toContain('peaceful');
    expect(tou.flags).not.toContain('close');
    expect(tou.flags).toEqual(expect.arrayContaining(['hostile', 'wantsarti', 'waitforu']));
  });

  test('peace_minded(): leaders and guardians peaceful, nemeses hostile, for every role', () => {
    const s = game('valkyrie');
    run(s, (ctx) => {
      expect(peaceMinded(ctx, row('nh:norn'))).toBe(true);
      expect(peaceMinded(ctx, row('nh:king_arthur'))).toBe(true); // another role's leader
      expect(peaceMinded(ctx, row('nh:student'))).toBe(true); // another role's guardian
      expect(peaceMinded(ctx, row('nh:lord_surtur'))).toBe(false);
      expect(peaceMinded(ctx, row('nh:dark_one'))).toBe(false);
    });
    run(game('tourist'), (ctx) => {
      expect(peaceMinded(ctx, row('nh:master_of_thieves'))).toBe(false);
    });
  });
});

describe("makemon(): the quest's monsters", () => {
  test("her leader: peaceful, his id recorded, waiting close; another role's leader is not hers", () => {
    const s = game('valkyrie');
    const norn = make(s, 'nh:norn');
    expect(norn.c.monster!.peaceful).toBe(true);
    expect(questStatus(s).leaderId).toBe(norn.id);
    expect(mstratOf({ state: s } as Ctx, norn.id)).toMatchObject({ close: true });
    const arthur = make(s, 'nh:king_arthur');
    expect(arthur.c.monster!.peaceful).toBe(true);
    expect(questStatus(s).leaderId).toBe(norn.id);
    expect(carries(s, arthur)).not.toContain(BELL_OF_OPENING);
  });

  test('every nemesis is born with the Bell of Opening, hostile and waiting for her', () => {
    const s = game('valkyrie');
    for (const role of ROLE_ORDER) {
      if (role === 'tourist') continue; // the Master of Thieves is a Valkyrie's Rogue leader
      const n = make(s, QUEST_ROLES[role].nemesis);
      expect(carries(s, n)).toContain(BELL_OF_OPENING);
      expect(n.c.monster!.peaceful).toBe(false);
    }
    const surtur = Object.values(s.entities).find((e) => e.def === 'nh:lord_surtur')!;
    expect(mstratOf({ state: s } as Ctx, surtur.id)).toMatchObject({ waitForU: true });
    const t = game('tourist');
    const mot = make(t, 'nh:master_of_thieves');
    expect(carries(t, mot)).toContain(BELL_OF_OPENING);
    expect(mot.c.monster!.peaceful).toBe(false);
  });

  test("the guardians' and the ninja's gear", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = game('valkyrie', seed);
      const w = carries(s, make(s, 'nh:warrior'));
      expect(w.some((o) => o === 'nh:long_sword' || o === 'nh:short_sword')).toBe(true);
      expect(w.some((o) => o === 'nh:chain_mail' || o === 'nh:leather_armor')).toBe(true);
      const h = carries(s, make(s, 'nh:hunter'));
      expect(h).toEqual(expect.arrayContaining(['nh:bow', 'nh:arrow']));
      const n = carries(s, make(s, 'nh:neanderthal'));
      expect(n).toEqual(expect.arrayContaining(['nh:club', 'nh:leather_armor']));
      const j = carries(s, make(s, 'nh:ninja'));
      expect(j.some((o) => o === 'nh:shuriken' || o === 'nh:dart')).toBe(true);
      expect(j.some((o) => o === 'nh:short_sword' || o === 'nh:axe')).toBe(true);
    }
  });

  test("a Priest's Arch Priest gets a mace and a robe or cloak (quest_mon_represents_role)", () => {
    const s = game('priest');
    const ap = carries(s, make(s, 'nh:arch_priest'));
    expect(ap).toContain('nh:mace');
    expect(ap).toContain('nh:small_shield');
    const v = game('valkyrie');
    expect(carries(v, make(v, 'nh:arch_priest'))).not.toContain('nh:mace');
  });
});

describe("role_init()'s gender draws", () => {
  test('only an Archeologist (Minion of Huhetotl) or a Wizard (Dark One) game draws', () => {
    for (const role of ROLE_ORDER) {
      const s = game(role);
      let draws = 0;
      run(s, (ctx) => {
        const rng = Object.create(ctx.rng) as Ctx['rng'];
        rng.rn2 = (n: number) => {
          draws++;
          return ctx.rng.rn2(n);
        };
        roleInitQuest({ state: ctx.state, defs: ctx.defs, rng });
      });
      expect([role, draws]).toEqual([role, role === 'archeologist' || role === 'wizard' ? 1 : 0]);
    }
  });

  test("the drawn gender is the nemesis's; a fixed one is the row's", () => {
    const genders = new Set<number>();
    for (let seed = 1; seed <= 12; seed++)
      run(game('wizard', seed), (ctx) => genders.add(questGender(ctx, 'nemesis')));
    expect([...genders].sort()).toEqual([0, 1]);
    run(game('valkyrie'), (ctx) => {
      expect(questGender(ctx, 'leader')).toBe(1); // the Norn
      expect(questGender(ctx, 'nemesis')).toBe(0); // Lord Surtur
    });
    // nothing is stored for a Valkyrie
    expect(questStatus(game('valkyrie'))).toEqual({});
  });
});

describe('pets and the quest', () => {
  const ROOM = ['-----------', '|.........|', '|.@.......|', '|.........|', '-----------'];

  /** A strong pet next to a pinned peaceful monster: how often it is hit over 30 turns. */
  function petHits(def: string): number {
    let hits = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = setup(ROOM, seed);
      const p = addMon(s.state, 'nh:large_dog', 5, 2);
      const pet = s.state.entities[String(p)]!;
      pet.c.monster!.level = 30;
      pet.c.hp = { cur: 300, max: 300 };
      initedog(ctxFor(s.state) as unknown as Ctx, p, true);
      const t = addMon(s.state, def, 6, 2, { peaceful: true });
      const target = s.state.entities[String(t)]!;
      target.c.hp = { cur: 999, max: 999 };
      target.c.actor!.speed = 0;
      target.c.monster!.level = 1;
      for (let i = 0; i < 30; i++) s.wait();
      if ((s.state.entities[String(t)]?.c.hp?.cur ?? 0) < 999) hits++;
    }
    return hits;
  }

  test('a pet never attacks a peaceful quest leader or guardian; another peaceful it may', () => {
    expect(petHits('nh:norn')).toBe(0);
    expect(petHits('nh:student')).toBe(0);
    expect(petHits('nh:watchman')).toBeGreaterThan(0);
  });
});

describe('chatting', () => {
  test("her leader says nothing yet (the quest's talk); another role's guardian is a human", () => {
    const s = game('valkyrie');
    const norn = make(s, 'nh:norn');
    const student = make(s, 'nh:student');
    let r: unknown;
    const said = run(s, (ctx) => {
      r = domonnoise(ctx, norn.id);
    });
    expect([r, said]).toEqual([0, []]);
    const lines = run(s, (ctx) => {
      domonnoise(ctx, student.id);
    });
    expect(lines.length).toBe(1);
  });
});

describe("another role's guardian statue", () => {
  test('comes to life as a doppelganger in its shape; her own as itself', () => {
    const s = game('valkyrie');
    const p = getPlayer(s).c.pos!;
    const spot = freeSpot(s);
    let student: Entity | null = null;
    let warrior: Entity | null = null;
    run(s, (ctx) => {
      const st = mkcorpstat(ctx, 'nh:student', { level: p.level, ...spot });
      student = animateStatue(ctx, ent(s, st), spot.x, spot.y, 'spell').mon;
      const st2 = mkcorpstat(ctx, 'nh:warrior', { level: p.level, ...freeSpot(s) });
      const at = ent(s, st2).c.pos!;
      warrior = animateStatue(ctx, ent(s, st2), at.x, at.y, 'spell').mon;
    });
    expect(student!.def).toBe('nh:student');
    expect(chamOf({ state: s } as Ctx, student!.id)).toBe('nh:doppelganger');
    expect(warrior!.def).toBe('nh:warrior');
    expect(chamOf({ state: s } as Ctx, warrior!.id)).toBeNull();
  });
});

describe('the rest', () => {
  test("a wished-for guardian's corpse is its role's (genus(mntmp, 1))", () => {
    const s = game('valkyrie');
    run(s, (ctx) => {
      const spec = readobjnam('student corpse', wishNames(s, defs, messagesEn), { wizard: true });
      if (spec === null || spec === 'nothing') throw new Error('no spec');
      const id = mkWished(ctx, spec, { wizard: true })!;
      expect(ent(s, id).c.item!.corpseOf).toBe('nh:archeologist');
    });
  });

  test("the Chromatic Dragon's breath is any of the eight (get_atkdam_type())", () => {
    const s = game('valkyrie');
    const seen = new Set<string>();
    run(s, (ctx) => {
      for (let i = 0; i < 200; i++) seen.add(getAtkdamType(ctx, 'rbre'));
      expect(getAtkdamType(ctx, 'fire')).toBe('fire');
    });
    expect([...seen].sort()).toEqual(
      ['acid', 'cold', 'disn', 'drst', 'elec', 'fire', 'magm', 'slee'].sort(),
    );
  });
});
