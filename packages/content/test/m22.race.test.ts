// m22 step 5: race rules. Through the test seam (`setRoleRaceForTest`), the hero's race decides
// who is always peaceful or hostile (and a dwarf or gnome meets fewer of her kind in the Mines),
// cannibalism, racial food, infravision, polymorph and genocide of her own kind, racial volleys
// and bow skill, and a dwarf's digging. Outcomes over seeds, never a lucky seed.
// ref: src/makemon.c peace_minded(), makemon(); src/sp_lev.c create_monster(); src/eat.c
// maybe_cannibal(), adj_victual_nutrition(), fprefx(), fpostfx(); src/polyself.c set_uasmon(),
// newman(), rehumanize(); src/read.c do_genocide(); src/dothrow.c throw_obj(), thitmonst();
// src/dig.c dig(); src/shk.c append_honorific(); src/sounds.c domonnoise()
import {
  buildSnapshot,
  cellRules,
  computeVisible,
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Json,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, heroHas, ownFormProps, setFormProps } from '../src/props';
import { peaceMinded } from '../src/generation';
import { mkcorpse, nhData } from '../src/items';
import { luckOf } from '../src/luck';
import { endHow } from '../src/endstate';
import { isGenocided } from '../src/vanquished';
import { polymon, rehumanize } from '../src/polyself';
import { diggingOf } from '../src/digstate';
import { sameRace } from '../src/race';
import { setRoleRaceForTest, vanillaMod, type RaceKey, type RoleKey } from '../src/index';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
/** The seam written before vanilla's u_init hook, and a probe action. */
const seam: { role: RoleKey | null; race: RaceKey | null } = { role: null, race: null };
const raceMod: Mod = {
  id: 'rt',
  version: '1',
  register(api) {
    api.on('newGame', (ctx) => setRoleRaceForTest(ctx.state, seam.role, seam.race), {
      priority: 1000,
    });
    api.defineAction({
      id: 'rt:run',
      labelKey: 'rt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, raceMod]);

function newGameAs(role: RoleKey | null, race: RaceKey, seed: number): GameState {
  seam.role = role;
  seam.race = race;
  try {
    return eng.newGame({ seed }).state;
  } finally {
    seam.role = null;
    seam.race = null;
  }
}

const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(state, { type: 'mod', action: 'rt:run' }).events);
}

type S = ReturnType<typeof levelSetup>;
const ROOM = ['...............', '...............', '.......@.......', '...............'];
/** A plain room for a hero of `race` (and `role`), set after the Valkyrie's new game. */
function room(race: RaceKey, role: RoleKey | null = null, seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  setRoleRaceForTest(s.state, role, race);
  s.step({ type: 'wait' });
  return s;
}
const hero = (s: S): Entity => getPlayer(s.state);
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Monster defs with any of `flags` that peace_minded() does not decide by M2_PEACEFUL/HOSTILE. */
const kinds = (flags: readonly string[]) =>
  defs.monsters.filter(
    (m) =>
      flags.some((f) => m.flags.includes(f)) &&
      !m.flags.includes('peaceful') &&
      !m.flags.includes('hostile') &&
      m.id !== 'nh:erinys',
  );

describe('always peaceful and always hostile by race (peace_minded())', () => {
  const minded = (race: RaceKey, id: DefId, seed: number): boolean => {
    const state = levelSetup(ROOM, seed).state;
    setRoleRaceForTest(state, null, race);
    return peaceMinded(ctxFor(state) as unknown as Ctx, defs.monster(id));
  };

  test("a dwarf's and a gnome's kin (dwarves and gnomes) are always peaceful", () => {
    const kin = kinds(['dwarf', 'gnome']);
    expect(kin.map((m) => m.id)).toEqual(expect.arrayContaining(['nh:dwarf', 'nh:gnome_lord']));
    for (const race of ['dwarf', 'gnome'] as const)
      for (const m of kin) for (const seed of seeds(5)) expect(minded(race, m.id, seed)).toBe(true);
  });

  test('a gnome hates humans; an orc hates humans, elves and dwarves; an elf orcs', () => {
    const humans = kinds(['human']);
    expect(humans.length).toBeGreaterThan(3);
    for (const m of humans)
      for (const seed of seeds(5)) expect(minded('gnome', m.id, seed)).toBe(false);
    for (const m of kinds(['human', 'elf', 'dwarf']))
      for (const seed of seeds(5)) expect(minded('orc', m.id, seed)).toBe(false);
    for (const m of kinds(['orc']))
      for (const seed of seeds(5)) expect(minded('elf', m.id, seed)).toBe(false);
    // a human hero meets some of the same humans in peace: the race made the difference
    expect(humans.some((m) => seeds(20).some((seed) => minded('human', m.id, seed)))).toBe(true);
  });

  test('the human hero is as before: gnomes and orcs always hostile', () => {
    for (const m of kinds(['gnome', 'orc']))
      for (const seed of seeds(5)) expect(minded('human', m.id, seed)).toBe(false);
  });
});

describe('the Gnomish Mines for a dwarf (create_monster(), peace_minded())', () => {
  /** The monsters made with the first Mines level, for a new game of `race`. */
  function minesLevel(race: RaceKey, seed: number): Entity[] {
    const state = newGameAs(null, race, seed);
    run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: 1 }, 'up'));
    const lv = getLevel(state);
    expect(lv.dungeon).toBe('nh:mines');
    return Object.values(state.entities).filter(
      (e): e is Entity => !!e?.c.monster && e.c.pos?.level === lv.id && !(e.c.monster.tame ?? 0),
    );
  }
  const kin = (e: Entity): boolean => {
    const f = defs.monster(e.def).flags;
    return f.includes('dwarf') || f.includes('gnome');
  };

  test('her gnomes and dwarves are peaceful; a human meets them hostile', () => {
    let dwarfKin = 0;
    let humanKin = 0;
    for (const seed of seeds(6)) {
      for (const m of minesLevel('dwarf', seed).filter(kin)) {
        dwarfKin++;
        expect(m.c.monster?.peaceful).toBe(true);
      }
      for (const m of minesLevel('human', seed).filter(kin)) {
        humanKin++;
        expect(m.c.monster?.peaceful).toBe(false);
      }
    }
    expect(dwarfKin).toBeGreaterThan(20);
    expect(humanKin).toBeGreaterThan(20);
  });

  test('2 in 3 of her own kind (dwarves for a dwarf) are made as random monsters instead', () => {
    const dwarves = (race: RaceKey): number =>
      seeds(12).reduce(
        (n, seed) => n + minesLevel(race, seed).filter((e) => e.def === 'nh:dwarf').length,
        0,
      );
    const human = dwarves('human');
    expect(human).toBeGreaterThan(20); // two per minefill, and some of the 'h'
    expect(dwarves('dwarf') * 2).toBeLessThan(human);
  });
});

describe('cannibalism (maybe_cannibal(), CANNIBAL_ALLOWED())', () => {
  /** Eats a fresh `of` corpse; null when the bite was rotten (the meal stops before). */
  function eat(race: RaceKey, role: RoleKey | null, of: string, seed: number): string[] | null {
    const s = room(race, role, seed);
    const corpse = mkcorpse(s.ctx, defs.monster(of as DefId), { carriedBy: s.state.playerId });
    const t = s.text(s.mod('nh:eat', { item: corpse }));
    return t.includes('Blecch!  Rotten food!') ? null : t;
  }
  const cannibal = (race: RaceKey, role: RoleKey | null, of: string): boolean => {
    for (const seed of seeds(30)) {
      const t = eat(race, role, of, seed);
      if (t) return t.includes('You cannibal!  You will regret this!');
    }
    throw new Error('every bite was rotten');
  };

  test('an orc eats an orc, a Caveman a human, without guilt; an elf an elf, a dwarf a dwarf, not', () => {
    expect(cannibal('orc', 'barbarian', 'nh:hill_orc')).toBe(false);
    expect(cannibal('human', 'caveman', 'nh:human')).toBe(false);
    expect(cannibal('elf', 'ranger', 'nh:woodland_elf')).toBe(true);
    expect(cannibal('dwarf', 'valkyrie', 'nh:dwarf')).toBe(true);
    expect(cannibal('dwarf', 'valkyrie', 'nh:human')).toBe(false);
    expect(cannibal('human', null, 'nh:human')).toBe(true);
  });

  test('the Luck and aggravation follow the guilt only', () => {
    const s = room('orc', 'barbarian');
    const corpse = mkcorpse(s.ctx, defs.monster('nh:hill_orc'), { carriedBy: s.state.playerId });
    s.mod('nh:eat', { item: corpse });
    expect(luckOf(s.state)).toBe(0);
    expect(heroHas(s.state, P.AGGRAVATE_MONSTER)).toBe(false);
  });

  test('a cannibal may eat a kitten; others feel it was a bad idea', () => {
    const t = (race: RaceKey, role: RoleKey | null): string[] => {
      for (const seed of seeds(30)) {
        const r = eat(race, role, 'nh:kitten', seed);
        if (r) return r;
      }
      throw new Error('every bite was rotten');
    };
    expect(t('orc', 'barbarian').some((l) => l.includes('was a bad idea'))).toBe(false);
    expect(t('elf', 'ranger').some((l) => l.includes('was a bad idea'))).toBe(true);
  });

  test('polymorphed, eating her own race also gives "a bad feeling deep inside"', () => {
    for (const seed of seeds(30)) {
      const s = room('dwarf', 'valkyrie', seed);
      run(s.state, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
      const corpse = mkcorpse(s.ctx, defs.monster('nh:dwarf'), { carriedBy: s.state.playerId });
      const t = s.text(s.mod('nh:eat', { item: corpse }));
      if (t.includes('Blecch!  Rotten food!')) continue;
      expect(t).toContain('You have a bad feeling deep inside.');
      expect(t).toContain('You cannibal!  You will regret this!');
      return;
    }
    throw new Error('every bite was rotten');
  });
});

describe('racial food (adj_victual_nutrition(), fprefx())', () => {
  /** Nutrition gained from a whole `food` (one burned per turn added back), and the texts. */
  function meal(race: RaceKey, food: string): { gained: number; text: string[] } {
    const s = room(race, race === 'orc' ? 'barbarian' : null);
    const h = hero(s).c.hunger!;
    h.nutrition = 100;
    const id = s.carry(food);
    const t0 = s.state.turn;
    const text = s.text(s.mod('nh:eat', { item: id }));
    expect(s.state.entities[String(id)]).toBeUndefined();
    return { gained: h.nutrition - 100 + (s.state.turn - t0), text };
  }

  test('lembas: an elf gets 1000, a human 800, an orc 600', () => {
    const elf = meal('elf', 'nh:lembas_wafer');
    expect(elf.gained).toBe(1000);
    expect(elf.text).toContain('A little goes a long way.');
    expect(meal('human', 'nh:lembas_wafer').gained).toBe(800);
    const orc = meal('orc', 'nh:lembas_wafer');
    expect(orc.gained).toBe(600);
    expect(orc.text).toContain('!#?&* elf kibble!');
  });

  test('cram: a dwarf gets 700 (699: three bites of 233), a human 600', () => {
    expect(meal('dwarf', 'nh:cram_ration').gained).toBe(699);
    expect(meal('human', 'nh:cram_ration').gained).toBe(600);
  });

  test('tripe: an orc likes it ("Mmm, tripe... not bad!") and never vomits', () => {
    for (const seed of seeds(10)) {
      const s = room('orc', 'barbarian', seed);
      const t = s.text(s.mod('nh:eat', { item: s.carry('nh:tripe_ration') }));
      expect(t).toContain('Mmm, tripe... not bad!');
      expect(t.some((l) => l.includes('Yak'))).toBe(false);
    }
  });

  test('a cursed apple: a dwarf hallucinating skips work today', () => {
    const s = room('dwarf');
    run(s.state, (ctx) => {
      const p = (getPlayer(ctx.state).c.props ??= {});
      p[P.HALLUC] = { intrinsic: false, timeout: 100 };
    });
    const apple = s.carry('nh:apple');
    s.state.entities[String(apple)]!.c.item!.buc = 'cursed';
    const t = s.text(s.mod('nh:eat', { item: apple }));
    expect(t).toContain('"Heigh-ho, ho-hum, I think I\'ll skip work today."');
  });
});

describe('infravision from the race (set_uasmon())', () => {
  test('a new dwarf or gnome has infravision from her race, a human none', () => {
    expect(heroHas(newGameAs(null, 'dwarf', 1), P.INFRAVISION)).toBe(true);
    expect(heroHas(newGameAs('wizard', 'gnome', 1), P.INFRAVISION)).toBe(true);
    expect(heroHas(newGameAs('wizard', 'elf', 1), P.INFRAVISION)).toBe(true);
    expect(heroHas(eng.newGame({ seed: 1 }).state, P.INFRAVISION)).toBe(false);
  });

  test('a dwarf sees an infravisible jackal in the dark; back from a form she still does', () => {
    const s = room('dwarf');
    const lvl = s.state.levels['dlvl1']!;
    lvl.lit = lvl.lit.map(() => 0);
    const jackal = addMon(s.state, 'nh:jackal', s.here.x + 3, s.here.y, { asleep: true });
    s.state.entities[String(jackal)]!.c.actor!.speed = 0;
    const seen = (): boolean => {
      s.state.visible = computeVisible(lvl, cellRules(lvl, defs), s.here);
      return buildSnapshot(eng.registry, s.state).entities.some((e) => e.id === jackal);
    };
    expect(seen()).toBe(false); // the seam came after her new game
    setFormProps(hero(s), ownFormProps(s.ctx));
    expect(seen()).toBe(true);
    run(s.state, (ctx) => polymon(ctx, 'nh:newt' as DefId, false)); // a newt has none
    expect(seen()).toBe(false);
    const t = run(s.state, (ctx) => rehumanize(ctx));
    expect(t).toContain('You return to dwarven form!');
    expect(seen()).toBe(true);
  });
});

describe('her own race in polymorph and genocide', () => {
  function read(s: S, buc: 'uncursed' | 'blessed', answer: Json): string[] {
    const id = s.carry('nh:scroll_of_genocide');
    s.state.entities[String(id)]!.c.item!.buc = buc;
    s.mod('nh:read', { item: id });
    const p = s.state.pendingPrompt?.prompt;
    if (!p) throw new Error('no prompt');
    return s.text(s.step({ type: 'answer', promptId: p.id, value: answer }));
  }

  test('a dwarf who genocides dwarves dies; gnomes she survives', () => {
    const s = room('dwarf');
    read(s, 'uncursed', 'dwarf');
    expect(s.state.gameOver?.killer).toBe('@killer.scroll_of_genocide');
    expect(endHow(s.state)).toBe('genocided');
    const t = room('dwarf');
    read(t, 'uncursed', 'gnome');
    expect(t.state.gameOver).toBeNull();
    expect(isGenocided(t.state, 'nh:gnome')).toBe(true);
  });

  test("a gnome's class genocide of G takes her too", () => {
    const s = room('gnome', 'wizard');
    const t = read(s, 'blessed', 'G');
    expect(t.some((l) => l.startsWith('Wiped out all'))).toBe(true);
    expect(s.state.gameOver?.killer).toBeDefined();
    expect(endHow(s.state)).toBe('genocided');
  });

  test('a polymorphed elf returns to elven form', () => {
    const s = room('elf', 'wizard');
    run(s.state, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
    expect(run(s.state, (ctx) => rehumanize(ctx))).toContain('You return to elven form!');
  });
});

describe('racial volleys and bow skill (throw_obj(), thitmonst())', () => {
  const ROW = ['....................', '..@.................'];
  /** How many of 6 arrows fly at once, with `launcher` wielded, over seeds. */
  function volleys(
    race: RaceKey,
    role: RoleKey | null,
    launcher: string,
    ammo: string,
  ): Set<number> {
    const seen = new Set<number>();
    for (const seed of seeds(40)) {
      const s = levelSetup(ROW, seed);
      plainKit(s.state);
      setRoleRaceForTest(s.state, role, race);
      for (const e of inventoryOf(s.state, s.state.playerId))
        if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
      const bow = s.carry(launcher);
      s.state.entities[String(bow)]!.c.item!.equipped = 'weapon';
      const a = hero(s).c.attributes!;
      a.dex = 14;
      a.str = 18;
      const d = nhData(s.ctx);
      if (d.skills) d.skills['bow'] = 1; // Basic: no skill volley
      if (d.skills) d.skills['crossbow'] = 1;
      const stack: EntityId = s.carry(ammo, { quantity: 6 });
      s.mod('nh:fire', { item: stack });
      const p = s.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no prompt');
      eng.step(s.state, { type: 'answer', promptId: p.id, value: 'e' });
      seen.add(6 - (s.state.entities[String(stack)]?.c.item?.quantity ?? 0));
    }
    return seen;
  }

  // (role null: the Valkyrie, who has no volley bonus of her own; a Ranger's comes on top)
  test("an elf's elven arrows from an elven bow, an orc's orcish ones, a gnome's bolts: +1", () => {
    expect([...volleys('elf', null, 'nh:elven_bow', 'nh:elven_arrow')].sort()).toEqual([1, 2]);
    expect([...volleys('orc', null, 'nh:orcish_bow', 'nh:orcish_arrow')].sort()).toEqual([1, 2]);
    expect([...volleys('gnome', null, 'nh:crossbow', 'nh:crossbow_bolt')].sort()).toEqual([1, 2]);
    // multishot_class_bonus(): a Ranger's arrows add 1 more (m22 step 6)
    expect([...volleys('elf', 'ranger', 'nh:elven_bow', 'nh:elven_arrow')].sort()).toEqual([
      1, 2, 3,
    ]);
  });

  test('no bonus with the wrong pair, for a human, or for a Wizard', () => {
    expect([...volleys('orc', null, 'nh:elven_bow', 'nh:elven_arrow')]).toEqual([1]);
    expect([...volleys('human', null, 'nh:elven_bow', 'nh:elven_arrow')]).toEqual([1]);
    expect([...volleys('elf', 'wizard', 'nh:elven_bow', 'nh:elven_arrow')]).toEqual([1]);
  });
});

describe('a dwarf digs twice as hard (dig())', () => {
  test('the same swing makes twice the effort', () => {
    for (const seed of seeds(5)) {
      const effort = (race: RaceKey): number => {
        const s = levelSetup(['.@ '], seed);
        setRoleRaceForTest(s.state, null, race);
        const h = hero(s);
        h.c.attributes = { str: 16, int: 10, wis: 10, dex: 10, con: 10, cha: 10 };
        for (const e of inventoryOf(s.state, s.state.playerId))
          if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
        const pick = s.carry('nh:pick_axe');
        s.state.entities[String(pick)]!.c.item!.equipped = 'weapon';
        s.state.entities[String(pick)]!.c.item!.buc = 'uncursed';
        s.mod('nh:apply', { item: pick });
        const p = s.state.pendingPrompt?.prompt;
        if (!p) throw new Error('no prompt');
        eng.step(s.state, { type: 'answer', promptId: p.id, value: 'e' }); // "You start digging."
        eng.step(s.state, { type: 'continue' }); // the first swing
        return diggingOf(s.ctx)?.effort ?? 0;
      };
      const human = effort('human');
      expect(human).toBeGreaterThanOrEqual(11);
      expect(human).toBeLessThanOrEqual(15);
      expect(effort('dwarf')).toBe(2 * human);
    }
  });
});

describe('words for her race', () => {
  test('species: an elf is not a human, gnome lords are gnomes, imps are not demons', () => {
    const m = (id: string) => defs.monster(id as DefId);
    expect(sameRace(defs, m('nh:gnome_lord'), m('nh:gnome'))).toBe(true);
    expect(sameRace(defs, m('nh:elf'), m('nh:human'))).toBe(false);
    expect(sameRace(defs, m('nh:jackal'), m('nh:coyote'))).toBe(false);
    expect(sameRace(defs, m('nh:imp'), m('nh:hezrou'))).toBe(false);
    expect(sameRace(defs, m('nh:vrock'), m('nh:hezrou'))).toBe(true);
    expect(sameRace(defs, m('nh:kobold_zombie'), m('nh:large_kobold'))).toBe(true);
  });

  test('a peaceful hill orc talks to an orc (MS_ORC as humanoid), grunts at a human', () => {
    const talk = (race: RaceKey): string[] => {
      const s = room(race, 'barbarian');
      const orc = addMon(s.state, 'nh:hill_orc', s.here.x + 1, s.here.y, {
        asleep: false,
        peaceful: true,
      });
      s.state.entities[String(orc)]!.c.actor!.speed = 0;
      s.mod('nh:chat');
      const p = s.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no prompt');
      return s.text(s.step({ type: 'answer', promptId: p.id, value: 'e' }));
    };
    expect(talk('human').some((l) => l.includes('grunts'))).toBe(true);
    expect(talk('orc').some((l) => l.includes('grunts'))).toBe(false);
  });
});
