// m20 step 2: naming a particular object (#name > "a particular object in inventory", the slip
// and the artifacts it makes), the Lady of the Lake, and artifacts by wish (names, bare artifact
// names, the refusal and the quest refusal). Random outcomes are reached by burning draws (or
// over seeds) and recognised by their effect, never by a lucky seed.
import {
  createEngine,
  createRng,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { restrictName } from '../src/artiname';
import {
  ARTIFACTS,
  DIP_ID,
  T,
  artiExists,
  artiInfo,
  artifactOrigin,
  answerWish,
  dipfountain,
  discover,
  messagesEn,
  mksobj,
  readobjnam,
  undiscoveredArtifact,
  vanillaMod,
  wishNames,
} from '../src/index';
import { setU, uState } from '../src/luck';
import { setTerrain } from '../src/terrain';
import { roleDefId } from '../src/urole';
import { addMon, setup } from './helpers';
import { ctxFor, defs, levelSetup, plainKit, render } from './itemHelpers';

const answer = (s: ReturnType<typeof levelSetup>, value: unknown): StepResult =>
  s.step({
    type: 'answer',
    promptId: s.state.pendingPrompt?.prompt.id ?? '',
    value: value as never,
  });
const itemOf = (st: GameState, id: EntityId) => st.entities[String(id)]?.c.item;
const nameOf = (st: GameState, id: EntityId): string =>
  render(defs.itemName(st, st.entities[String(id)]!));

function naming(seed = 1) {
  const s = levelSetup(undefined, seed);
  plainKit(s.state);
  return s;
}

/** #name > a particular object > the item > the name; returns the last step's result. */
function nameIt(s: ReturnType<typeof naming>, id: EntityId, name: string | null): StepResult {
  expect(s.mod('nh:call').prompt?.id).toBe('call-what');
  expect(answer(s, 'i').prompt?.id).toBe('name-pick');
  expect(answer(s, id).prompt?.id).toBe('name-text');
  return answer(s, name);
}

describe('#name a particular object', () => {
  test('the menu has the two inventory entries; objects but gold, artifacts last', () => {
    const s = naming();
    const what = s.mod('nh:call').prompt;
    expect(what?.options?.map((o) => [o.letter, render({ key: o.key })])).toEqual([
      ['i', 'a particular object in inventory'],
      ['o', 'the type of an object in inventory'],
    ]);
    expect(render({ key: what!.key })).toBe('What do you want to name?');
    answer(s, null);
    const sting = s.carry('nh:elven_dagger');
    nameIt(s, sting, 'Sting');
    s.carry('nh:gold_piece', { quantity: 20 });
    s.mod('nh:call');
    const ids = answer(s, 'i').prompt?.options?.map((o) => o.value) ?? [];
    expect(ids.at(-1)).toBe(sting);
    expect(ids.some((id) => s.state.entities[String(id)]?.def === 'nh:gold_piece')).toBe(false);
    expect(ids).toHaveLength(inventoryOf(s.state, s.state.playerId).length - 1);
  });

  test('naming an elven dagger Sting makes the artifact: canonical case, found, not discovered', () => {
    const s = naming();
    const d = s.carry('nh:elven_dagger');
    s.mod('nh:call');
    answer(s, 'i');
    const q = answer(s, d).prompt!;
    expect(render({ key: q.key, ...(q.params ? { params: q.params } : {}) })).toBe(
      'What do you want to name this elven dagger?',
    );
    expect(s.text(answer(s, 'sTiNg'))).toEqual([]);
    expect(itemOf(s.state, d)).toMatchObject({ name: 'Sting', artifact: 'nh:sting' });
    expect(artiInfo(s.state, 'nh:sting')).toEqual({ origin: 'named', found: true });
    expect(undiscoveredArtifact(s.state, 'nh:sting')).toBe(true);
    expect(nameOf(s.state, d)).toBe('elven dagger named Sting');
    // Orcrist on an elven broadsword likewise
    const b = s.carry('nh:elven_broadsword');
    nameIt(s, b, 'orcrist');
    expect(itemOf(s.state, b)?.artifact).toBe('nh:orcrist');
  });

  test('a second elven dagger slips: one or two letters scuffed, no artifact', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = naming(seed);
      nameIt(s, s.carry('nh:elven_dagger'), 'Sting');
      const d2 = s.carry('nh:elven_dagger');
      const r = nameIt(s, d2, 'sting');
      const it = itemOf(s.state, d2)!;
      expect(it.artifact).toBeUndefined();
      expect(it.name).not.toBe('Sting');
      expect(s.text(r)).toEqual([
        'While engraving, your hand slips.',
        `You engrave: "${it.name}".`,
      ]);
      const diff = [...'Sting'].filter((c, i) => it.name![i] !== c).length;
      expect(diff).toBeGreaterThanOrEqual(1);
      expect(diff).toBeLessThanOrEqual(2 + 'Sting'.length - it.name!.length);
      seen.add(it.name!);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('restricted names slip: Excalibur on a long sword, a stack, an unidentified runesword', () => {
    const s = naming();
    const sword = s.carry('nh:long_sword');
    const r = nameIt(s, sword, 'excalibur');
    expect(s.text(r)[0]).toBe('While engraving, your hand slips.');
    expect(itemOf(s.state, sword)?.artifact).toBeUndefined();
    expect(artiExists(s.state, 'nh:excalibur')).toBe(false);
    // "the" is kept and only the rest scuffed
    const staff = s.carry('nh:quarterstaff');
    nameIt(s, staff, 'staff of aesculapius');
    expect(itemOf(s.state, staff)?.name).toMatch(/^The /);
    expect(itemOf(s.state, staff)?.name).not.toBe('The Staff of Aesculapius');
    // a stack of two elven daggers may not be Sting (restrict_name()'s quan > 1)
    const two = s.carry('nh:elven_dagger', { quantity: 2 });
    expect(restrictName(s.ctx, s.state.entities[String(two)]!, 'Sting')).toBe(true);
    // an elven broadsword looks like a runesword ("runed broadsword") until it is identified
    s.state.discovered = s.state.discovered.filter(
      (d) => d !== 'nh:runesword' && d !== 'nh:elven_broadsword',
    );
    const eb = s.carry('nh:elven_broadsword');
    const ebE = s.state.entities[String(eb)]!;
    expect(restrictName(s.ctx, ebE, 'Stormbringer')).toBe(true);
    // Orcrist is not restricted, so a runesword just gets the name
    const rune = s.carry('nh:runesword');
    expect(restrictName(s.ctx, s.state.entities[String(rune)]!, 'Orcrist')).toBe(false);
    nameIt(s, rune, 'Orcrist');
    expect(itemOf(s.state, rune)).toMatchObject({ name: 'Orcrist' });
    expect(itemOf(s.state, rune)?.artifact).toBeUndefined();
    discover(s.ctx, 'nh:elven_broadsword');
    expect(restrictName(s.ctx, ebE, 'Stormbringer')).toBe(false);
    nameIt(s, eb, 'stormbringer');
    expect(itemOf(s.state, eb)).toMatchObject({ name: 'stormbringer' });
    // a plain name on the wrong type is kept as typed
    const dag = s.carry('nh:dagger');
    nameIt(s, dag, 'sting');
    expect(itemOf(s.state, dag)).toMatchObject({ name: 'sting' });
    expect(itemOf(s.state, dag)?.artifact).toBeUndefined();
  });

  test('an artifact resists; blanks remove a name; Escape keeps it; a leading @ is dropped', () => {
    const s = naming();
    const d = s.carry('nh:elven_dagger');
    nameIt(s, d, 'Sting');
    expect(s.text(nameIt(s, d, 'Pointy'))).toEqual(['Sting resists the attempt.']);
    expect(itemOf(s.state, d)?.name).toBe('Sting');
    const c = s.carry('nh:dagger');
    nameIt(s, c, '  my   knife ');
    expect(itemOf(s.state, c)?.name).toBe('my knife');
    nameIt(s, c, '');
    expect(itemOf(s.state, c)?.name).toBe('my knife');
    nameIt(s, c, '   ');
    expect(itemOf(s.state, c)?.name).toBeUndefined();
    nameIt(s, c, '@welcome');
    expect(itemOf(s.state, c)?.name).toBe('welcome');
    const pile = s.carry('nh:dart', { quantity: 3 });
    s.mod('nh:call');
    answer(s, 'i');
    const q = answer(s, pile).prompt!;
    expect(render({ key: q.key, ...(q.params ? { params: q.params } : {}) })).toBe(
      'What do you want to name these darts?',
    );
  });
});

// ---- the Lady of the Lake ----

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'arti-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'arti-probe:run',
      labelKey: 'arti-probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const probeEngine = createEngine([vanillaMod, probeMod]);
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return probeEngine
    .step(state, { type: 'mod', action: 'arti-probe:run' as DefId })
    .events.flatMap((e) =>
      e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
    );
}

const ROOM = [
  '-------------',
  '|...........|',
  '|...........|',
  '|.....@.....|',
  '|...........|',
  '|...........|',
  '-------------',
];
const F = { x: 6, y: 3 };

function fountainRoom(o: { lawful?: boolean; knight?: boolean; town?: boolean } = {}) {
  const s = setup(ROOM, 1);
  s.level.rooms = [{ lx: 1, ly: 1, hx: 11, hy: 5, lit: true }];
  if (o.town) s.level.town = true;
  setTerrain(s.level, F.x, F.y, T.fountain);
  const hero = getPlayer(s.state);
  hero.c.experience!.level = 5;
  if (o.knight) hero.c.player!.role = roleDefId('knight');
  if (o.lawful) setU({ state: s.state }, { alignType: 1 });
  const sword = mksobj(ctxFor(s.state), defs.object('nh:long_sword' as DefId), {
    init: false,
    carriedBy: s.state.playerId,
  });
  return { s, sword };
}

/** Dips the sword after `k` burnt draws on a copy; `n` is what the Lady's rn2() will draw. */
function dipAt(state: GameState, k: number, sword: EntityId, mod: number) {
  const st = structuredClone(state);
  let n = -1;
  const text = run(st, (ctx) => {
    for (let i = 0; i < k; i++) ctx.rng.rn2(2);
    n = createRng(structuredClone(ctx.state.rng.core)).rn2(mod);
    dipfountain(ctx, DIP_ID, st.entities[String(sword)]!);
  });
  return { st, text, n };
}

const fountainGone = (st: GameState): boolean => {
  const lv = st.levels['dlvl1']!;
  return lv.palette[lv.cells[F.y * lv.width + F.x] ?? 0] === T.floor;
};

describe('the Lady of the Lake', () => {
  test('a lawful hero of level 5 gets Excalibur: blessed, rustproof, discovered; the fountain goes', () => {
    const { s, sword } = fountainRoom({ lawful: true });
    const it0 = s.state.entities[String(sword)]!.c.item!;
    it0.erosion = { e1: 2, e2: 0 };
    it0.buc = 'cursed';
    let got = 0;
    for (let k = 0; k < 120; k++) {
      const d = dipAt(s.state, k, sword, 30);
      const it = itemOf(d.st, sword)!;
      if (d.n !== 0) {
        expect(it.artifact).toBeUndefined();
        continue;
      }
      got++;
      expect(d.text).toEqual([
        'From the murky depths, a hand reaches up to bless the sword.',
        'As the hand retreats, the fountain disappears!',
      ]);
      expect(it).toMatchObject({ artifact: 'nh:excalibur', name: 'Excalibur', buc: 'blessed' });
      expect(it.erodeproof).toBe(true);
      expect(it.erosion).toBeUndefined();
      expect(artiInfo(d.st, 'nh:excalibur')).toEqual({ origin: 'viadip', found: true });
      expect(undiscoveredArtifact(d.st, 'nh:excalibur')).toBe(false);
      expect(fountainGone(d.st)).toBe(true);
    }
    expect(got).toBeGreaterThan(0);
  });

  test('a Knight meets her 1 time in 6; never while Excalibur exists', () => {
    const { s, sword } = fountainRoom({ lawful: true, knight: true });
    let got = 0;
    for (let k = 0; k < 60; k++) {
      const d = dipAt(s.state, k, sword, 6);
      expect(itemOf(d.st, sword)?.artifact === 'nh:excalibur').toBe(d.n === 0);
      if (d.n === 0) got++;
    }
    expect(got).toBeGreaterThan(3);
    artifactOrigin({ state: s.state }, 'nh:excalibur', 'random');
    for (let k = 0; k < 30; k++) {
      const d = dipAt(s.state, k, sword, 6);
      expect(itemOf(d.st, sword)?.artifact).toBeUndefined();
      expect(d.text[0]).not.toContain('murky depths');
    }
  });

  test('in town the Watch gets angry', () => {
    const { s, sword } = fountainRoom({ lawful: true, knight: true, town: true });
    const w = addMon(s.state, 'nh:watchman', 2, 1, { peaceful: true });
    s.state.entities[String(w)]!.c.actor!.speed = 0;
    let k = 0;
    while (dipAt(s.state, k, sword, 6).n !== 0) k++;
    const d = dipAt(s.state, k, sword, 6);
    expect(itemOf(d.st, sword)?.artifact).toBe('nh:excalibur');
    expect(d.st.entities[String(w)]?.c.monster?.peaceful).toBe(false);
  });

  test('the neutral hero is still refused (a cursed sword)', () => {
    const { s, sword } = fountainRoom({ knight: true });
    expect(uState(s.state).alignType).toBe(0);
    let k = 0;
    while (dipAt(s.state, k, sword, 6).n !== 0) k++;
    const d = dipAt(s.state, k, sword, 6);
    expect(d.text[0]).toBe('A freezing mist rises from the water and envelopes the sword.');
    expect(itemOf(d.st, sword)).toMatchObject({ buc: 'cursed' });
    expect(itemOf(d.st, sword)?.artifact).toBeUndefined();
    expect(artiExists(d.st, 'nh:excalibur')).toBe(false);
  });
});

// ---- wishes ----

describe('wishing for artifacts', () => {
  const names = (st: GameState) => wishNames(st, defs, messagesEn);
  /** A hero with an empty pack, so nothing wished for merges into her kit. */
  const bare = (): GameState => {
    const st = naming().state;
    for (const e of inventoryOf(st, st.playerId)) delete st.entities[String(e.id)];
    return st;
  };

  test('readobjnam(): bare artifact names give their base and canonical name; "named" keeps case', () => {
    const st = naming().state;
    for (const a of ARTIFACTS) {
      for (const typed of [a.name, a.name.toLowerCase(), a.name.replace(/^The /, '')]) {
        const spec = readobjnam(typed, names(st));
        expect(spec !== null && spec !== 'nothing' && spec.what, typed).toEqual({
          kind: 'type',
          type: a.base,
        });
        expect(spec !== null && spec !== 'nothing' && spec.name, typed).toBe(a.name);
      }
    }
    const fuzzy = readobjnam('the vorpal-blade', names(st));
    expect(fuzzy !== null && fuzzy !== 'nothing' && fuzzy.name).toBe('Vorpal Blade');
    const named = readobjnam('blessed +2 Dagger named Mr. Pointy', names(st));
    expect(named).toMatchObject({
      name: 'Mr. Pointy',
      blessed: true,
      spe: 2,
    });
    expect(readobjnam('long sword', names(st))).toMatchObject({ name: null });
  });

  /** Wishes for `text` on a copy after `k` burnt draws; the new or refused object. */
  function wish(state: GameState, text: string, o: { k?: number; wizard?: boolean } = {}) {
    const st = structuredClone(state);
    const before = new Set(inventoryOf(st, st.playerId).map((e) => e.id));
    const bless0 = uState(st).ublesscnt;
    const msgs = run(st, (ctx) => {
      for (let i = 0; i < (o.k ?? 0); i++) ctx.rng.rn2(2);
      answerWish(ctx, 'arti-probe:run' as DefId, text, { tries: 0, wizard: o.wizard ?? false });
    });
    const got = inventoryOf(st, st.playerId).filter((e) => !before.has(e.id));
    return { st, msgs, got, prayed: uState(st).ublesscnt !== bless0 };
  }

  test('"Excalibur", "the vorpal blade", "long sword named Excalibur", "3 elven daggers named sting"', () => {
    const st = bare();
    for (const [text, id] of [
      ['Excalibur', 'nh:excalibur'],
      ['the vorpal blade', 'nh:vorpal_blade'],
      ['long sword named Excalibur', 'nh:excalibur'],
      ['3 elven daggers named sting', 'nh:sting'],
    ] as const) {
      const w = wish(st, text);
      expect(w.got, text).toHaveLength(1);
      const it = w.got[0]!.c.item!;
      expect(it.artifact, text).toBe(id);
      expect(it.quantity).toBe(1);
      expect(artiInfo(w.st, id)).toEqual({ origin: 'wish', found: true });
      expect(w.prayed).toBe(true);
    }
  });

  test('"dagger named Sting" is just a name; an existing artifact gives a plain object', () => {
    const st = bare();
    const w = wish(st, '2 daggers named Sting');
    const it = w.got[0]!.c.item!;
    expect(it.artifact).toBeUndefined();
    expect(it.name).toBe('Sting');
    artifactOrigin({ state: st }, 'nh:excalibur', 'random');
    const x = wish(st, 'Excalibur');
    expect(x.got).toHaveLength(1);
    expect(x.got[0]!.def).toBe('nh:long_sword');
    expect(x.got[0]!.c.item?.artifact).toBeUndefined();
    expect(x.got[0]!.c.item?.name).toBeUndefined();
  });

  test('with 3 artifacts existing about half the wishes are refused; wizard mode always gets it', () => {
    const st = bare();
    for (const id of ['nh:excalibur', 'nh:sting', 'nh:orcrist'] as const)
      artifactOrigin({ state: st }, id, 'random');
    let refused = 0;
    const tries = 80;
    for (let k = 0; k < tries; k++) {
      const w = wish(st, 'Magicbane', { k });
      if (w.got.length === 0) {
        refused++;
        expect(w.msgs).toContain(
          'For a moment, you feel something in your hands, but it disappears!',
        );
        expect(artiExists(w.st, 'nh:magicbane')).toBe(false);
        expect(w.prayed).toBe(false); // the wish is spent, the gods take no notice
      } else expect(w.got[0]!.c.item?.artifact).toBe('nh:magicbane');
    }
    // rn2(4) > 1 with Magicbane the fourth: 1 time in 2
    expect(refused).toBeGreaterThan(tries * 0.3);
    expect(refused).toBeLessThan(tries * 0.7);
    for (let k = 0; k < 20; k++)
      expect(wish(st, 'Magicbane', { k, wizard: true }).got[0]?.c.item?.artifact).toBe(
        'nh:magicbane',
      );
    // with one or two existing (the new one counted) never
    const fresh = bare();
    for (let k = 0; k < 20; k++) expect(wish(fresh, 'Magicbane', { k }).got).toHaveLength(1);
  });

  test('her own quest artifact is always refused (a Priest and the Mitre of Holiness)', () => {
    const st = bare();
    getPlayer(st).c.player!.role = roleDefId('priest');
    for (let k = 0; k < 10; k++) {
      const w = wish(st, 'the Mitre of Holiness', { k });
      expect(w.got).toHaveLength(0);
      expect(artiExists(w.st, 'nh:mitre_of_holiness')).toBe(false);
    }
    expect(wish(st, 'the Mitre of Holiness', { wizard: true }).got[0]?.c.item?.artifact).toBe(
      'nh:mitre_of_holiness',
    );
    // another role's quest artifact is an ordinary wish
    getPlayer(st).c.player!.role = roleDefId('valkyrie');
    expect(wish(st, 'the Mitre of Holiness').got[0]?.c.item?.artifact).toBe('nh:mitre_of_holiness');
  });
});
