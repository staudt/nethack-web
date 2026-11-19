// m20 step 1: the artifact table, existence and discovery, object names, mk_artifact by type,
// mksobj's artif roll, merging, prices and the discoveries list.
import {
  createEngine,
  getPlayer,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type ItemComponent,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  ARTIFACTS,
  QUEST_ARTIFACT,
  artiAlign,
  artiCost,
  artiExists,
  artiInfo,
  artiRole,
  artifactName,
  artifactOrigin,
  artifactRow,
  discover,
  discoverArtifact,
  existArtifact,
  getCost,
  getprice,
  isQuestRow,
  merged,
  mergable,
  mkArtifactConvert,
  mksobj,
  nameItem,
  nartifactExist,
  notFullyIdentified,
  oname,
  splitStack,
  uncreateArtifact,
  undiscoveredArtifact,
  vanillaMod,
} from '../src/index';
import { raceDefId, roleDefId, type RaceKey, type RoleKey } from '../src/urole';
import { bareState, ctxFor, defs, itemOf, levelSetup, obj, render } from './itemHelpers';

const sentence = (s: GameState, id: EntityId): string =>
  render(
    { key: 't', params: { item: nameItem(s, defs, s.entities[String(id)]!) } },
    {
      ...messages,
      t: '{item|an}',
    },
  );
import { messagesEn as messages } from '../src/index';

const ent = (s: GameState, id: EntityId) => {
  const e = s.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};

const charEngine = createEngine([vanillaMod]);
const newGameAs = (role: RoleKey, race: RaceKey, align?: -1 | 0 | 1): GameState =>
  charEngine.newGame({
    seed: 3,
    character: {
      role: roleDefId(role),
      race: raceDefId(race),
      ...(align !== undefined ? { align } : {}),
    },
  }).state;

describe('the artifact table (include/artilist.h)', () => {
  test('33 rows in artilist.h order, unique ids, every base object exists', () => {
    expect(ARTIFACTS.map((a) => a.name)).toEqual([
      'Excalibur',
      'Stormbringer',
      'Mjollnir',
      'Cleaver',
      'Grimtooth',
      'Orcrist',
      'Sting',
      'Magicbane',
      'Frost Brand',
      'Fire Brand',
      'Dragonbane',
      'Demonbane',
      'Werebane',
      'Grayswandir',
      'Giantslayer',
      'Ogresmasher',
      'Trollsbane',
      'Vorpal Blade',
      'Snickersnee',
      'Sunsword',
      'The Orb of Detection',
      'The Heart of Ahriman',
      'The Sceptre of Might',
      'The Staff of Aesculapius',
      'The Magic Mirror of Merlin',
      'The Eyes of the Overworld',
      'The Mitre of Holiness',
      'The Longbow of Diana',
      'The Master Key of Thievery',
      'The Tsurugi of Muramasa',
      'The Platinum Yendorian Express Card',
      'The Orb of Fate',
      'The Eye of the Aethiopica',
    ]);
    expect(new Set(ARTIFACTS.map((a) => a.id)).size).toBe(33);
    for (const a of ARTIFACTS) expect(defs.isObject(a.base), a.id).toBe(true);
    expect(artifactRow('nh:heart_of_ahriman').base).toBe('nh:luckstone');
    expect(artifactRow('nh:demonbane').base).toBe('nh:silver_mace');
  });

  test('the fields of some rows as artilist.h has them', () => {
    expect(artifactRow('nh:mjollnir')).toMatchObject({
      attk: { ad: 'elec', damn: 5, damd: 24 },
      align: 0,
      role: 'valkyrie',
      genSpe: 0,
      giftValue: 8,
      cost: 4000,
    });
    expect(artifactRow('nh:grimtooth')).toMatchObject({
      spfx: ['restr', 'warn'],
      bane: { kind: 'flag', flag: 'elf' },
      defn: 'drst',
      invoke: 'fling_poison',
      align: -1,
      race: 'orc',
      color: 'red',
    });
    expect(artifactRow('nh:sting')).toMatchObject({ genSpe: 3, giftValue: 1, cost: 800 });
    expect(artifactRow('nh:frost_brand')).toMatchObject({ align: -128, invoke: 'snowstorm' });
    expect(artifactRow('nh:platinum_yendorian_express_card')).toMatchObject({
      cspfx: ['esp', 'hspdam'],
      cary: 'magm',
      invoke: 'charge_obj',
      role: 'tourist',
    });
  });

  test('the quest rows: self-willed, never random, gift value 12; each role names its own', () => {
    const quest = ARTIFACTS.filter(isQuestRow);
    expect(quest).toHaveLength(13);
    expect(quest[0]?.id).toBe('nh:orb_of_detection');
    for (const a of quest) {
      expect(a.spfx).toEqual(expect.arrayContaining(['nogen', 'restr', 'intel']));
      expect([a.giftValue, a.genSpe]).toEqual([12, 0]);
      expect(Object.values(QUEST_ARTIFACT)).toContain(a.id);
    }
    expect(isQuestRow(artifactRow('nh:sunsword'))).toBe(false);
    expect(Object.keys(QUEST_ARTIFACT)).toHaveLength(13);
    // every role's quest artifact has its row now
    expect(new Set(quest.map((a) => a.id))).toEqual(new Set(Object.values(QUEST_ARTIFACT)));
  });

  test('artifact_name(): "the" optional, case-blind, fuzzy spaces and dashes', () => {
    expect(artifactName('excalibur', false)?.id).toBe('nh:excalibur');
    expect(artifactName('the vorpal blade', false)?.id).toBe('nh:vorpal_blade');
    expect(artifactName('heart of ahriman', false)?.id).toBe('nh:heart_of_ahriman');
    expect(artifactName('vorpalblade', false)).toBeNull();
    expect(artifactName('vorpal-blade', true)?.id).toBe('nh:vorpal_blade');
  });
});

describe('hack_artifacts(): the hero role gift and quest artifact', () => {
  const row = artifactRow;
  test('the neutral Valkyrie: Mjollnir hers and neutral, Excalibur any lawful one', () => {
    const s = newGameAs('valkyrie', 'human');
    expect([artiAlign(s, row('nh:mjollnir')), artiRole(s, row('nh:mjollnir'))]).toEqual([
      0,
      'valkyrie',
    ]);
    expect(artiRole(s, row('nh:excalibur'))).toBeNull();
    expect(artiAlign(s, row('nh:excalibur'))).toBe(1);
  });

  test('a Knight keeps Excalibur; a chaotic Barbarian takes Cleaver and the Heart chaotic', () => {
    const k = newGameAs('knight', 'human');
    expect(artiRole(k, row('nh:excalibur'))).toBe('knight');
    const b = newGameAs('barbarian', 'orc', -1);
    expect(artiAlign(b, row('nh:cleaver'))).toBe(-1);
    expect(artiAlign(b, row('nh:heart_of_ahriman'))).toBe(-1);
    expect(artiRole(b, row('nh:heart_of_ahriman'))).toBe('barbarian');
    // another role's rows are as the table has them
    expect(artiAlign(b, row('nh:magicbane'))).toBe(0);
    expect(artiAlign(b, row('nh:frost_brand'))).toBe(-128);
  });

  test('a chaotic Wizard: Magicbane and the Eye of the Aethiopica chaotic', () => {
    const w = newGameAs('wizard', 'elf', -1);
    expect(artiAlign(w, row('nh:magicbane'))).toBe(-1);
    expect(artiAlign(w, row('nh:eye_of_the_aethiopica'))).toBe(-1);
    // an unaligned row stays unaligned even for its role (`alignment != A_NONE`)
    expect(artiAlign(w, row('nh:frost_brand'))).toBe(-128);
  });
});

/** A plain new item component of `base`, as mksobj() makes it before init. */
const fresh = (spe = 0): ItemComponent => ({
  quantity: 1,
  buc: 'uncursed',
  spe,
  known: { buc: false, spe: false },
  carriedBy: null,
  letter: null,
  equipped: null,
  placed: 0,
  age: 5,
  erosion: { e1: 2, e2: 1 },
});

describe('mk_artifact() for a given object (A_NONE)', () => {
  test('only rows of its type, never NOGEN, an existing one never again; erosion cleared', () => {
    const LONG = [
      'nh:frost_brand',
      'nh:fire_brand',
      'nh:giantslayer',
      'nh:vorpal_blade',
      'nh:sunsword',
    ];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = bareState(seed);
      const ctx = ctxFor(s);
      const made: string[] = [];
      for (let i = 0; i < 6; i++) {
        const it = fresh();
        mkArtifactConvert(ctx, 'nh:long_sword', it, true);
        if (i < 5) {
          expect(it.artifact).toBeDefined();
          made.push(it.artifact!);
          expect(it.name).toBe(artifactRow(it.artifact!).name);
          expect(it.erosion).toBeUndefined();
          expect(it.age).toBe(0);
          expect(artiInfo(s, it.artifact!)).toEqual({ origin: 'random' });
        } else {
          // every eligible long sword exists: the sword stays as it was, and no draw is made
          const before = s.rng.core.slice();
          const r = ctxFor(s);
          mkArtifactConvert(r, 'nh:long_sword', it, true);
          expect(it.artifact).toBeUndefined();
          expect(it.erosion).toEqual({ e1: 2, e2: 1 });
          expect(s.rng.core).toEqual(before);
        }
      }
      expect([...made].sort()).toEqual([...LONG].sort());
      seen.add(made[0]!);
      expect(nartifactExist(s)).toBe(5);
    }
    // the first pick is rn2(5) over the table order: every row comes first on some seed
    expect([...seen].sort()).toEqual([...LONG].sort());
  });

  test('gen_spe is added unless the result leaves -10..9', () => {
    const s = bareState(1);
    const ctx = ctxFor(s);
    const sting = fresh(2);
    mkArtifactConvert(ctx, 'nh:elven_dagger', sting, true); // Sting is the only elven dagger row
    expect([sting.artifact, sting.spe]).toEqual(['nh:sting', 5]);
    const orcrist = fresh(7);
    mkArtifactConvert(ctx, 'nh:elven_broadsword', orcrist, true);
    expect([orcrist.artifact, orcrist.spe]).toEqual(['nh:orcrist', 7]); // 10 is out of range
    // Sting exists now: a second elven dagger stays plain
    const again = fresh(1);
    mkArtifactConvert(ctx, 'nh:elven_dagger', again, true);
    expect([again.artifact, again.spe]).toEqual([undefined, 1]);
    // without adjust_spe the enchantment stays
    const s2 = bareState(2);
    const k = fresh(1);
    mkArtifactConvert(ctxFor(s2), 'nh:elven_dagger', k, false);
    expect([k.artifact, k.spe]).toEqual(['nh:sting', 1]);
  });

  test('a type with no row (or only NOGEN rows) is left alone', () => {
    const s = bareState(1);
    const it = fresh();
    mkArtifactConvert(ctxFor(s), 'nh:dagger', it, true);
    mkArtifactConvert(ctxFor(s), 'nh:tsurugi', it, true); // the Tsurugi of Muramasa is NOGEN
    expect(it.artifact).toBeUndefined();
    expect(nartifactExist(s)).toBe(0);
  });
});

describe("mksobj_init()'s artif roll", () => {
  /** How many of `n` artif long swords became artifacts with `exists` artifacts kept existing. */
  function rate(n: number, exists: DefId[]): number {
    const s = bareState(7);
    const ctx = ctxFor(s);
    let made = 0;
    for (let i = 0; i < n; i++) {
      const nh = s.modData['nh'] as { arti?: { exist: Record<string, unknown> } } | undefined;
      if (nh?.arti) nh.arti.exist = {};
      for (const id of exists) artifactOrigin(ctx, id, 'random');
      const id = mksobj(ctx, obj('nh:long_sword'), { artif: true });
      const it = itemOf(s, id);
      if (it.artifact) {
        made++;
        expect(it.erosion).toBeUndefined(); // artifacts cannot be generated eroded
        expect(it.name).toBe(artifactRow(it.artifact).name);
      }
      delete s.entities[String(id)];
    }
    return made;
  }

  test('1 in 20 of the weapons rolled with artif while none exists, then 1 in 30', () => {
    // binomial: 4000 draws at 1/20 -> 200 (sd 14); at 1/30 -> 133 (sd 11)
    const none = rate(4000, []);
    expect(none).toBeGreaterThan(150);
    expect(none).toBeLessThan(250);
    const one = rate(4000, ['nh:sting']);
    expect(one).toBeGreaterThan(90);
    expect(one).toBeLessThan(180);
  });

  test('without artif no artifact is ever made', () => {
    const s = bareState(7);
    const ctx = ctxFor(s);
    for (let i = 0; i < 500; i++) {
      const id = mksobj(ctx, obj('nh:long_sword'));
      expect(itemOf(s, id).artifact).toBeUndefined();
      delete s.entities[String(id)];
    }
  });
});

describe('oname()', () => {
  test('the right name on the right type makes the artifact; a second one is refused', () => {
    const s = bareState(1);
    const ctx = ctxFor(s);
    const a = mksobj(ctx, obj('nh:elven_dagger'), { init: false });
    oname(ctx, ent(s, a), 'Sting', 'named', true);
    expect(itemOf(s, a)).toMatchObject({ name: 'Sting', artifact: 'nh:sting', age: 0 });
    expect(artiInfo(s, 'nh:sting')).toEqual({ origin: 'named', found: true });
    expect(existArtifact(s, 'nh:elven_dagger', 'Sting')).toBe(true);
    // the named artifact exists: another elven dagger keeps no name
    const b = mksobj(ctx, obj('nh:elven_dagger'), { init: false });
    oname(ctx, ent(s, b), 'Sting');
    expect(itemOf(s, b).name).toBeUndefined();
    // an artifact keeps its name
    oname(ctx, ent(s, a), 'Fred');
    expect(itemOf(s, a).name).toBe('Sting');
    // on another type the name is just a name; case matters
    const c = mksobj(ctx, obj('nh:dagger'), { init: false });
    oname(ctx, ent(s, c), 'Sting');
    expect(itemOf(s, c)).toMatchObject({ name: 'Sting' });
    expect(itemOf(s, c).artifact).toBeUndefined();
    const d = mksobj(ctx, obj('nh:elven_broadsword'), { init: false });
    oname(ctx, ent(s, d), 'orcrist');
    expect(itemOf(s, d).artifact).toBeUndefined();
    // an empty name removes it; a long one is cut at 62 characters
    oname(ctx, ent(s, c), '');
    expect(itemOf(s, c).name).toBeUndefined();
    oname(ctx, ent(s, c), 'x'.repeat(80));
    expect(itemOf(s, c).name).toHaveLength(62);
    expect(nartifactExist(s)).toBe(1);
  });

  test('un-creating (a refused wish) makes the row available again', () => {
    const s = bareState(1);
    const ctx = ctxFor(s);
    const a = mksobj(ctx, obj('nh:long_sword'), { init: false });
    oname(ctx, ent(s, a), 'Excalibur', 'wish', true);
    expect(artiExists(s, 'nh:excalibur')).toBe(true);
    uncreateArtifact(ctx, ent(s, a));
    expect(artiExists(s, 'nh:excalibur')).toBe(false);
    expect(itemOf(s, a).artifact).toBeUndefined();
    expect(nartifactExist(s)).toBe(0);
  });
});

describe('names (objnam.c xname(), doname(), obj_is_pname())', () => {
  test('"named X"; the artifact name alone once fully identified and discovered', () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const id = mksobj(ctx, obj('nh:long_sword'), { init: false });
    discover(ctx, 'nh:long_sword');
    oname(ctx, ent(s, id), 'Excalibur', 'wish', true);
    expect(sentence(s, id)).toBe('a long sword named Excalibur');
    const it = itemOf(s, id);
    it.known = { buc: true, spe: true };
    it.spe = 2;
    // fully known but not yet a discovered artifact
    expect(notFullyIdentified(s, defs, ent(s, id))).toBe(true);
    expect(sentence(s, id)).toBe('an uncursed +2 long sword named Excalibur');
    discoverArtifact(ctx, 'nh:excalibur');
    expect(undiscoveredArtifact(s, 'nh:excalibur')).toBe(false);
    expect(notFullyIdentified(s, defs, ent(s, id))).toBe(false);
    expect(sentence(s, id)).toBe('the uncursed +2 Excalibur');
  });

  test('a quest artifact: "named the Heart of Ahriman", then "the Heart of Ahriman"', () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const id = mksobj(ctx, obj('nh:luckstone'), { init: false });
    oname(ctx, ent(s, id), 'The Heart of Ahriman', 'lvldef');
    expect(itemOf(s, id).artifact).toBe('nh:heart_of_ahriman');
    expect(sentence(s, id)).toBe('a gray stone named the Heart of Ahriman');
    discover(ctx, 'nh:luckstone');
    itemOf(s, id).known = { buc: true, spe: true };
    discoverArtifact(ctx, 'nh:heart_of_ahriman');
    expect(sentence(s, id)).toBe('the uncursed Heart of Ahriman');
  });

  test('ordinary names: stacks keep theirs, and a split part takes it along', () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const id = mksobj(ctx, obj('nh:dagger'), { init: false, quantity: 3 });
    oname(ctx, ent(s, id), 'Pointy');
    expect(sentence(s, id)).toBe('3 daggers named Pointy');
    const part = splitStack(ctx, id, 1);
    expect(sentence(s, part)).toBe('a dagger named Pointy');
  });
});

describe('merging (invent.c mergable(), merged())', () => {
  test('different names never merge; a name passes to an unnamed stack', () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const mk = (name?: string): EntityId => {
      const id = mksobj(ctx, obj('nh:dagger'), { init: false });
      if (name) oname(ctx, ent(s, id), name);
      return id;
    };
    const [a, b, c] = [mk('Foo'), mk('Bar'), mk()];
    expect(mergable(defs, ent(s, a), ent(s, b), s)).toBe(false);
    expect(mergable(defs, ent(s, a), ent(s, mk('Foo')), s)).toBe(true);
    expect(mergable(defs, ent(s, c), ent(s, a), s)).toBe(true);
    expect(merged(ctx, ent(s, c), ent(s, a))).toBe(true);
    expect(itemOf(s, c)).toMatchObject({ quantity: 2, name: 'Foo' });
  });

  test('a named corpse never joins an unnamed one; an artifact never merges', () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const corpse = (): EntityId =>
      mksobj(ctx, obj('nh:corpse'), { init: false, corpseOf: 'nh:newt' });
    const [x, y] = [corpse(), corpse()];
    oname(ctx, ent(s, x), 'Newton');
    expect(mergable(defs, ent(s, y), ent(s, x), s)).toBe(false);
    const stone = (): EntityId => mksobj(ctx, obj('nh:luckstone'), { init: false });
    const [heart, plain] = [stone(), stone()];
    expect(mergable(defs, ent(s, plain), ent(s, heart), s)).toBe(true);
    oname(ctx, ent(s, heart), 'The Heart of Ahriman');
    expect(mergable(defs, ent(s, plain), ent(s, heart), s)).toBe(false);
  });
});

describe('prices (shk.c getprice(), get_cost(); artifact.c arti_cost())', () => {
  test("the row's cost, a quarter when the shopkeeper buys, four times when he sells", () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const hero = getPlayer(s);
    if (hero.c.attributes) hero.c.attributes.cha = 11; // no Charisma adjustment
    discover(ctx, 'nh:long_sword');
    const id = mksobj(ctx, obj('nh:long_sword'), { init: false });
    oname(ctx, ent(s, id), 'Vorpal Blade');
    itemOf(s, id).spe = 1;
    expect(artiCost(defs, ent(s, id))).toBe(4000);
    expect(getprice(s, defs, ent(s, id), false)).toBe(4010); // + 10 per point of enchantment
    expect(getprice(s, defs, ent(s, id), true)).toBe(1010);
    expect(getCost(s, defs, ent(s, id), null)).toBe(16040);
    const plain = mksobj(ctx, obj('nh:long_sword'), { init: false });
    expect(getCost(s, defs, ent(s, plain), null)).toBe(15);
  });
});

describe('discoveries (artifact.c disp_artifact_discoveries())', () => {
  test('"Artifacts" first, in discovery order, with the alignment and simple type name', () => {
    const s = levelSetup();
    const ctx = ctxFor(s.state);
    for (const id of ['nh:frost_brand', 'nh:mjollnir', 'nh:excalibur'] as const) {
      artifactOrigin(ctx, id, 'random');
      discoverArtifact(ctx, id);
    }
    discoverArtifact(ctx, 'nh:mjollnir'); // once only
    const r = s.mod('nh:discoveries');
    const ev = r.events.find((e): e is Extract<GameEvent, { type: 'list' }> => e.type === 'list');
    const text = ev?.items.map((m) => render(m)) ?? [];
    expect(text.slice(0, 5)).toEqual([
      'Artifacts',
      '  Frost Brand [non-aligned long sword]',
      '  Mjollnir [neutral war hammer]',
      '  Excalibur [lawful long sword]',
      'Weapons',
    ]);
  });
});

describe('the namer is pure; the state stays plain data', () => {
  test('naming an artifact draws nothing and changes no state', () => {
    const s = bareState(3);
    const ctx = ctxFor(s);
    const id = mksobj(ctx, obj('nh:elven_dagger'), { init: false });
    oname(ctx, ent(s, id), 'Sting', 'named', true);
    const before = JSON.stringify(s);
    sentence(s, id);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.parse(before)).toEqual(s);
  });
});
