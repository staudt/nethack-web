// m20 step 8: crowning and the spellbook gift. gcrownu() per alignment (the gift at her feet, the
// wielded one praised, Excalibur from a wielded long sword, nothing left to give), the class gifts
// of Wizards and Monks, the intrinsics and the skill slot; give_spell()'s book or spell; pleased()
// reaching them by prayer, a second crowning never, and the longer prayer timeout once crowned.
// Outcomes over many seeds, never a lucky seed.
// ref: src/pray.c pleased(), gcrownu(), give_spell(), at_your_feet(); src/spell.c known_spell(),
// force_learn_spell()
import {
  getPlayer,
  inventoryOf,
  itemsAt,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { A_CHAOTIC, A_LAWFUL, P, artiExists, oname, setU, uState } from '../src/index';
import { enlightenment } from '../src/enlightenment';
import { gcrownu, giveSpell } from '../src/crown';
import { undiscoveredArtifact } from '../src/artistate';
import { nhData, rknown } from '../src/items';
import { hasIntrinsic, setIntrinsic } from '../src/props';
import { regenPw } from '../src/hero';
import { pwOf, setPw } from '../src/uenergy';
import { P_RESTRICTED, P_UNSKILLED, skillLevel, weaponSlots } from '../src/skills';
import {
  KEEN,
  SPE_FORGOTTEN,
  SPE_FRESH,
  SPE_GOING_STALE,
  SPE_UNKNOWN,
  forceLearnSpell,
  initialspell,
  knownSpell,
  knownSpells,
} from '../src/spell';
import { playAs } from './helpers';
import { defs, engine, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;
const FOD = 'nh:spellbook_of_finger_of_death' as DefId;

/** The hero (a neutral human Valkyrie wielding her spear unless changed) in a lit room. */
function setup(seed = 1): S {
  const s = levelSetup(['.......', '.......', '...@...', '.......', '.......'], seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}

const hero = (s: S): Entity => getPlayer(s.state);
const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
const uwep = (s: S): Entity | undefined =>
  inventoryOf(s.state, s.state.playerId).find((o) => o.c.item?.equipped === 'weapon');
const here = (s: S): Entity[] => itemsAt(defs, s.state, s.here.level, s.here.x, s.here.y);

/** Runs `fn` on the setup's context and returns its rendered messages. */
function call(s: S, fn: (ctx: S['ctx']) => void): string[] {
  s.ctx.events.length = 0;
  fn(s.ctx);
  return s.ctx.events.flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));
}
const crown = (s: S): string[] => call(s, (ctx) => gcrownu(ctx as never));

/** Wields a new object of `def` (named `name`, making the artifact when it is one). */
function wield(s: S, def: string, name?: string): Entity {
  const old = uwep(s);
  if (old?.c.item) old.c.item.equipped = null;
  const o = ent(s, s.carry(def));
  if (name) oname(s.ctx as never, o, name, 'wish', true);
  o.c.item!.equipped = 'weapon';
  return o;
}

describe('gcrownu()', () => {
  test('a neutral hero: the intrinsics, "Envoy of Balance", Vorpal Blade at her feet', () => {
    const s = setup();
    const spear = uwep(s)!;
    const slots = weaponSlots(s.ctx);
    const t = crown(s);
    expect(t).toContain('"Thou shalt be my Envoy of Balance!"');
    expect(t).toContain('A sword appears at your feet!');
    expect(t).not.toContain('You feel unworthy.');
    for (const p of [P.SEE_INVIS, P.FIRE_RES, P.COLD_RES, P.SHOCK_RES, P.SLEEP_RES, P.POISON_RES])
      expect(hasIntrinsic(hero(s), p)).toBe(true);
    expect(uState(s.state).uhandOfElbereth).toBe(2);
    expect(uState(s.state).ugifts).toBe(1);
    const vb = here(s).find((o) => o.c.item?.artifact === 'nh:vorpal_blade')!;
    expect(vb.def).toBe('nh:long_sword');
    expect(vb.c.item!.spe).toBe(1);
    expect(vb.c.item!.buc).toBe('blessed');
    expect(vb.c.item!.erodeproof).toBe(true);
    expect(rknown(s.state, vb.id)).toBe(true);
    expect(undiscoveredArtifact(s.state, 'nh:vorpal_blade' as DefId)).toBe(false);
    // the wielded spear is not the gift
    expect(spear.c.item!.buc).toBe('uncursed');
    expect(weaponSlots(s.ctx)).toBe(slots + 1);
    // enlightenment names the title
    expect(enlightenment(s.ctx as never).map((m) => render(m))).toContain(
      'You are the Envoy of Balance.',
    );
  });

  test('a wielded Vorpal Blade goes snicker-snack; an existing one leaves the spear blessed', () => {
    const s = setup();
    const vb = wield(s, 'nh:long_sword', 'Vorpal Blade');
    vb.c.item!.spe = -2;
    const t = crown(s);
    expect(t.some((l) => /goes snicker-snack!$/.test(l))).toBe(true);
    expect(here(s)).toHaveLength(0);
    expect(vb.c.item!.buc).toBe('blessed');
    expect(vb.c.item!.spe).toBe(1);
    expect(uState(s.state).ugifts ?? 0).toBe(0);

    const s2 = setup();
    const other = ent(s2, s2.floor('nh:long_sword'));
    oname(s2.ctx as never, other, 'Vorpal Blade', 'random', false);
    const spear = uwep(s2)!;
    const t2 = crown(s2);
    expect(t2).not.toContain('A sword appears at your feet!');
    expect(spear.c.item!.buc).toBe('blessed');
    expect(spear.c.item!.erodeproof).toBe(true);
    expect(spear.c.item!.spe).toBeGreaterThanOrEqual(1);
  });

  test('nothing to bless: "You feel unworthy." (and still the skill slot)', () => {
    const s = setup();
    uwep(s)!.c.item!.equipped = null;
    const other = ent(s, s.floor('nh:long_sword'));
    oname(s.ctx as never, other, 'Vorpal Blade', 'random', false);
    const slots = weaponSlots(s.ctx);
    expect(crown(s)).toContain('You feel unworthy.');
    expect(weaponSlots(s.ctx)).toBe(slots + 1);
  });

  test('a restricted long sword skill is unrestricted with the gift', () => {
    const s = setup();
    playAs(s.state, 'healer');
    delete nhData(s.ctx).skills!['long_sword'];
    expect(skillLevel(s.ctx, 'long_sword')).toBe(P_RESTRICTED);
    crown(s);
    expect(skillLevel(s.ctx, 'long_sword')).toBe(P_UNSKILLED);
  });

  test('a lawful hero: her wielded long sword becomes Excalibur; a dagger is only blessed', () => {
    const s = setup();
    setU(s.ctx, { alignType: A_LAWFUL });
    const sword = wield(s, 'nh:long_sword');
    const t = crown(s);
    expect(t).toContain('"I crown thee...  The Hand of Elbereth!"');
    expect(t).toContain('Your sword shines brightly for a moment.');
    expect(sword.c.item!.artifact).toBe('nh:excalibur');
    expect(sword.c.item!.buc).toBe('blessed');
    expect(sword.c.item!.spe).toBe(1);
    expect(undiscoveredArtifact(s.state, 'nh:excalibur' as DefId)).toBe(false);
    expect(uState(s.state).uhandOfElbereth).toBe(1);
    expect(uState(s.state).ugifts).toBe(1);

    const s2 = setup();
    setU(s2.ctx, { alignType: A_LAWFUL });
    const dagger = wield(s2, 'nh:dagger');
    const t2 = crown(s2);
    expect(t2).not.toContain('Your sword shines brightly for a moment.');
    expect(dagger.c.item!.artifact).toBeUndefined();
    expect(dagger.c.item!.buc).toBe('blessed');
    expect(here(s2)).toHaveLength(0);
    expect(artiExists(s2.state, 'nh:excalibur' as DefId)).toBe(false);
  });

  test('a chaotic hero: Stormbringer at her feet, or "take lives" when it exists elsewhere', () => {
    const s = setup();
    setU(s.ctx, { alignType: A_CHAOTIC });
    const t = crown(s);
    expect(t).toContain('"Thou art chosen to steal souls for My Glory!"');
    expect(t).toContain('A black sword appears at your feet!');
    const sb = here(s).find((o) => o.c.item?.artifact === 'nh:stormbringer')!;
    expect(sb.def).toBe('nh:runesword');
    expect(sb.c.item!.buc).toBe('blessed');
    expect(uState(s.state).uhandOfElbereth).toBe(3);

    const s2 = setup();
    setU(s2.ctx, { alignType: A_CHAOTIC });
    oname(s2.ctx as never, ent(s2, s2.floor('nh:runesword')), 'Stormbringer', 'random', false);
    expect(crown(s2)).toContain('"Thou art chosen to take lives for My Glory!"');
    expect(here(s2).filter((o) => o.c.item?.artifact)).toHaveLength(1);

    const s3 = setup();
    setU(s3.ctx, { alignType: A_CHAOTIC });
    wield(s3, 'nh:runesword', 'Stormbringer');
    expect(crown(s3)).toContain('Your black sword hums ominously!');
  });

  test("a Wizard's gift is the spellbook of finger of death; a known spell blesses the weapon", () => {
    const s = setup();
    playAs(s.state, 'wizard');
    const spear = uwep(s)!;
    const t = crown(s);
    expect(t.some((l) => /appears at your feet!$/.test(l))).toBe(true);
    expect(t).not.toContain('A sword appears at your feet!');
    const book = here(s).find((o) => o.def === FOD)!;
    expect(book.c.item!.buc).toBe('blessed');
    expect(book.c.item!.known.buc).toBe(true);
    expect(spear.c.item!.buc).toBe('uncursed');
    expect(t).not.toContain('You feel unworthy.');
    expect(uState(s.state).ugifts).toBe(1);

    const s2 = setup();
    playAs(s2.state, 'wizard');
    initialspell(s2.ctx, FOD);
    const spear2 = uwep(s2)!;
    crown(s2);
    expect(here(s2).some((o) => o.def === FOD)).toBe(true);
    expect(spear2.c.item!.buc).toBe('blessed');

    // carrying the book, or wielding Vorpal Blade: the neutral gift instead
    const s3 = setup();
    playAs(s3.state, 'wizard');
    s3.carry(FOD);
    expect(crown(s3)).toContain('A sword appears at your feet!');
  });

  test("a Monk without an artifact in hand gets restore ability; a chaotic one's words", () => {
    const s = setup();
    playAs(s.state, 'monk');
    setU(s.ctx, { alignType: A_CHAOTIC });
    const t = crown(s);
    expect(t).toContain('"Thou art chosen to take lives for My Glory!"');
    expect(here(s).some((o) => o.def === 'nh:spellbook_of_restore_ability')).toBe(true);
    expect(here(s).some((o) => o.c.item?.artifact)).toBe(false);
  });
});

describe('give_spell()', () => {
  test('known_spell() and force_learn_spell()', () => {
    const s = setup();
    const id = 'nh:spellbook_of_sleep' as DefId;
    expect(knownSpell(s.ctx, id)).toBe(SPE_UNKNOWN);
    const letter = forceLearnSpell(s.ctx, id);
    expect(letter).toBe(String.fromCharCode(96 + knownSpells(s.ctx).length));
    expect(knownSpell(s.ctx, id)).toBe(SPE_FRESH);
    expect(forceLearnSpell(s.ctx, id)).toBe(''); // already fresh
    const k = knownSpells(s.ctx).find((x) => x.id === id)!;
    (k as { retention: number }).retention = KEEN / 10;
    expect(knownSpell(s.ctx, id)).toBe(SPE_GOING_STALE);
    (k as { retention: number }).retention = 0;
    expect(knownSpell(s.ctx, id)).toBe(SPE_FORGOTTEN);
    expect(forceLearnSpell(s.ctx, id)).toBe(letter); // the same letter, refreshed
    expect(k.retention).toBe(KEEN);
    expect(forceLearnSpell(s.ctx, 'nh:spellbook_of_blank_paper' as DefId)).toBe('');
  });

  test('a blessed spellbook at her feet, or now and then the spell straight into her mind', () => {
    let book = false;
    let learned = false;
    for (let seed = 1; seed <= 80 && !(book && learned); seed++) {
      const s = setup(seed);
      const before = knownSpells(s.ctx).length;
      const t = call(s, (ctx) => giveSpell(ctx as never));
      const books = here(s).filter((o) => defs.object(o.def).class === 'spellbook');
      const now = knownSpells(s.ctx);
      if (books.length) {
        book = true;
        expect(books).toHaveLength(1);
        expect(books[0]!.c.item!.buc).toBe('blessed');
        expect(books[0]!.c.item!.known.buc).toBe(false);
        expect(t.some((l) => /appears at your feet!$/.test(l))).toBe(true);
        expect(now).toHaveLength(before);
      } else {
        learned = true;
        expect(now).toHaveLength(before + 1);
        const sp = now[now.length - 1]!;
        expect(sp.retention).toBe(KEEN);
        expect(t).toHaveLength(1);
        expect(t[0]).toMatch(/^Divine knowledge of [a-z ]+ fills your mind! {2}Spell '[a-z]'\.$/);
        // the book is gone
        expect(
          Object.values(s.state.entities).filter(
            (e) => e.c.item && defs.object(e.def).class === 'spellbook',
          ),
        ).toHaveLength(0);
      }
    }
    expect(book).toBe(true);
    expect(learned).toBe(true);
  });
});

/** Prays (yes to the confirmation): every message of the prayer. */
function pray(state: GameState): string[] {
  const texts = (r: StepResult): string[] =>
    r.events.flatMap((e) => (e.type === 'msg' ? [render(e as never)] : []));
  const ask = engine.stepAll(state, { type: 'mod', action: 'nh:pray' as DefId });
  const id = state.pendingPrompt?.prompt.id;
  if (!id) throw new Error('no prayer prompt');
  return [
    ...texts(ask),
    ...texts(engine.stepAll(state, { type: 'answer', promptId: id, value: true })),
  ];
}

/** A pious, lucky hero whose prayer timeout ran out. */
function pious(seed: number, luck: number): S {
  const s = setup(seed);
  setU(s.ctx, { ublesscnt: 0, alignRecord: 20, luck, ugangr: 0 });
  return s;
}

describe('pleased()', () => {
  test('a pious hero with Luck 10 is crowned now and then by prayer, and never twice', () => {
    let crowned: number | null = null;
    for (let seed = 1; seed <= 300 && crowned === null; seed++) {
      const s = pious(seed, 10);
      const t = pray(s.state);
      if (t.includes('"Thou shalt be my Envoy of Balance!"')) {
        crowned = seed;
        expect(uState(s.state).uhandOfElbereth).toBe(2);
        expect(here(s).some((o) => o.c.item?.artifact === 'nh:vorpal_blade')).toBe(true);
      }
    }
    expect(crowned).not.toBeNull();
    // the same prayer once crowned: the spellbook favor instead
    const s = pious(crowned!, 10);
    setU(s.ctx, { uhandOfElbereth: 2 });
    const spells = knownSpells(s.ctx).length;
    const t = pray(s.state);
    expect(t).not.toContain('"Thou shalt be my Envoy of Balance!"');
    expect(uState(s.state).uhandOfElbereth).toBe(2);
    const book = here(s).some((o) => defs.object(o.def).class === 'spellbook');
    expect(book || knownSpells(s.ctx).length > spells).toBe(true);
  });

  test('with Luck below 8 the favors stop at the intrinsic gift: no crowning, no spellbook', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = pious(seed, 7);
      const spells = knownSpells(s.ctx).length;
      const t = pray(s.state);
      expect(t).not.toContain('"Thou shalt be my Envoy of Balance!"');
      expect(here(s).some((o) => defs.object(o.def).class === 'spellbook')).toBe(false);
      expect(knownSpells(s.ctx)).toHaveLength(spells);
    }
  });

  test('once crowned the new prayer timeout is longer by rnz(1000)', () => {
    const a = pious(3, 0);
    const b = JSON.parse(JSON.stringify(a.state)) as GameState;
    (b.modData['nh'] as { u: { uhandOfElbereth?: number } }).u.uhandOfElbereth = 1;
    pray(a.state);
    pray(b);
    expect(uState(b).ublesscnt).toBeGreaterThan(uState(a.state).ublesscnt);
    expect(a.state.turn).toBe(b.turn);
  });
});

describe('the m20 leads', () => {
  test("a Wizard's energy comes back on every (MAXULEV + 8 - ulevel) * 3 / 6th turn", () => {
    // level 1: every 18th turn for a Wizard, every 24th for anyone else
    const at = (role: 'wizard' | 'valkyrie', turn: number): boolean => {
      const s = setup();
      playAs(s.state, role);
      setPw(s.ctx, { uen: 0, uenmax: 50 });
      s.state.turn = turn;
      regenPw(s.ctx as never);
      return pwOf(s.state).uen > 0;
    };
    expect(at('wizard', 18 * 7)).toBe(true);
    expect(at('valkyrie', 18 * 7)).toBe(false);
    expect(at('valkyrie', 24 * 5)).toBe(true);
    expect(at('wizard', 24 * 5)).toBe(false);
  });

  test("a wielded artifact's regeneration costs no food; her own does", () => {
    const a = setup();
    hero(a).c.hunger = { nutrition: 900, state: 'not_hungry' };
    const troll = JSON.parse(JSON.stringify(a.state)) as GameState;
    const own = JSON.parse(JSON.stringify(a.state)) as GameState;
    const tb = Object.values(troll.entities).find((e) => e.c.item?.equipped === 'weapon')!;
    tb.def = 'nh:morning_star';
    tb.c.item!.artifact = 'nh:trollsbane' as DefId;
    setIntrinsic(getPlayer(own), P.REGENERATION, true);
    for (let i = 0; i < 40; i++) {
      engine.stepAll(a.state, { type: 'wait' });
      engine.stepAll(troll, { type: 'wait' });
      engine.stepAll(own, { type: 'wait' });
    }
    expect(getPlayer(troll).c.props?.['regeneration:worn']).toBeDefined();
    const n = (st: GameState): number => getPlayer(st).c.hunger!.nutrition;
    expect(n(troll)).toBe(n(a.state));
    expect(n(own)).toBeLessThan(n(a.state));
  });
});
