// m20 step 7: #offer and the gods' gifts. Corpse values (fresh, old, eaten, acid blobs), a
// sacrifice on her own god's altar (anger, absolution, prayer timeout, the gift, Luck), the gift
// by alignment (her role's first, then aligned or unaligned rows by skill), another god's altar
// (converting it, or her when her god is angry), her own race, unicorns, the imitation Amulet.
// Outcomes over many seeds, never a lucky seed.
// ref: src/pray.c dosacrifice(), offer_corpse(), eval_offering(), sacrifice_value(),
// bestow_artifact(), offer_different_alignment_altar(), sacrifice_your_race(),
// offer_fake_amulet(); src/artifact.c mk_artifact(); src/attrib.c uchangealign()
import {
  cellIndex,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  type DefId,
  type Entity,
  type EntityId,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  A_CHAOTIC,
  A_LAWFUL,
  A_NEUTRAL,
  A_NONE,
  ARTIFACTS,
  P,
  T,
  artiAlign,
  artiExists,
  artiInfo,
  artifactOrigin,
  epriOf,
  mkArtifactByAlign,
  oname,
  priestini,
  sacrificeValue,
  setItimeout,
  setU,
  uState,
  undiscoveredArtifact,
} from '../src/index';
import { TEMPLE } from '../src/epri';
import { checkSpecialRoom } from '../src/rooms';
import { nhData } from '../src/items';
import { RACES_TAB } from '../src/racetab';
import { raceHostile } from '../src/race';
import { P_RESTRICTED, skillLevel } from '../src/skills';
import { playAs } from './helpers';
import { defs, engine, levelSetup, plainKit } from './itemHelpers';

const ROOM = ['.........', '.........', '....@....', '.........', '.........'];
type S = ReturnType<typeof levelSetup>;

/** The hero (a neutral human Valkyrie unless changed) on an altar of `altar`. */
function setup(altar: DefId | null, seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  if (altar) paint(s, altar);
  setU(s.ctx, { ublesscnt: 0, alignRecord: 5, luck: 0, ugangr: 0 });
  s.step({ type: 'wait' }); // see the level
  return s;
}

function paint(s: S, id: DefId): void {
  const level = getLevel(s.state);
  let i = level.palette.indexOf(id);
  if (i === -1) i = level.palette.push(id) - 1;
  level.cells[cellIndex(level, s.here.x, s.here.y)] = i;
}

const terrain = (s: S): DefId => {
  const level = getLevel(s.state);
  return level.palette[level.cells[cellIndex(level, s.here.x, s.here.y)]!]!;
};

const hero = (s: S): Entity => getPlayer(s.state);
const setLevel = (s: S, lvl: number): void => {
  hero(s).c.experience!.level = lvl;
};
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];

/** A corpse of `mon` (fresh now, or `age` turns old) here or carried. */
function corpse(s: S, mon: string, o: { carried?: boolean; age?: number } = {}): EntityId {
  const id = o.carried
    ? s.carry('nh:corpse', { corpseOf: mon as DefId })
    : s.floor('nh:corpse', { corpseOf: mon as DefId });
  const it = ent(s, id)!.c.item!;
  it.age = s.state.turn - (o.age ?? 0);
  return id;
}

/** #offer, choosing `id` in the menu: the rendered messages. */
function offer(s: S, id: EntityId): string[] {
  const r1 = s.mod('nh:offer');
  const p = s.state.pendingPrompt?.prompt;
  if (!p) return s.text(r1);
  expect(p.kind).toBe('menu');
  const r2 = s.step({ type: 'answer', promptId: p.id, value: id });
  return [...s.text(r1), ...s.text(r2)];
}

/** The artifacts lying at her feet. */
const artisHere = (s: S): Entity[] =>
  itemsAt(defs, s.state, s.here.level, s.here.x, s.here.y).filter(
    (e) => e.c.item?.artifact !== undefined,
  );

describe('sacrifice_value()', () => {
  test('difficulty + 1 while fresh, 0 after 50 turns, an acid blob always, eaten scaled', () => {
    const s = setup(null);
    s.state.turn = 1000;
    const newt = defs.monster('nh:newt');
    const ant = defs.monster('nh:soldier_ant');
    expect(sacrificeValue(s.ctx, ent(s, corpse(s, 'nh:soldier_ant', { age: 50 }))!)).toBe(
      ant.difficulty + 1,
    );
    expect(sacrificeValue(s.ctx, ent(s, corpse(s, 'nh:soldier_ant', { age: 51 }))!)).toBe(0);
    expect(sacrificeValue(s.ctx, ent(s, corpse(s, 'nh:newt', { age: 0 }))!)).toBe(
      newt.difficulty + 1,
    );
    const blob = defs.monster('nh:acid_blob');
    expect(sacrificeValue(s.ctx, ent(s, corpse(s, 'nh:acid_blob', { age: 500 }))!)).toBe(
      blob.difficulty + 1,
    );
    // half eaten: half the value (at least 1)
    const half = ent(s, corpse(s, 'nh:soldier_ant'))!;
    half.c.item!.eaten = Math.trunc(ant.nutrition / 2);
    expect(sacrificeValue(s.ctx, half)).toBe(
      Math.trunc(((ant.difficulty + 1) * half.c.item!.eaten) / ant.nutrition),
    );
    const crumb = ent(s, corpse(s, 'nh:soldier_ant'))!;
    crumb.c.item!.eaten = 1;
    expect(sacrificeValue(s.ctx, crumb)).toBe(1);
  });
});

describe('#offer', () => {
  test('offered only on an altar; impaired or with nothing to offer it takes no time', () => {
    const offered = (s: S): boolean =>
      engine
        .query(s.state)
        .actionsFor({ kind: 'self' })
        .some((o) => o.action.type === 'mod' && o.action.action === 'nh:offer');
    const off = setup(null);
    expect(offered(off)).toBe(false);
    expect(off.text(off.mod('nh:offer'))).toEqual(['You are not on an altar.']);
    const on = setup(T.altar_neutral);
    expect(offered(on)).toBe(true);
    const t0 = on.state.turn;
    expect(on.text(on.mod('nh:offer'))).toEqual(["You don't have anything to sacrifice."]);
    expect(on.state.turn).toBe(t0);
    setItimeout(on.state, hero(on), P.CONFUSION, 5);
    corpse(on, 'nh:newt');
    expect(on.text(on.mod('nh:offer'))).toEqual(['You are too impaired to perform the rite.']);
    expect(on.state.pendingPrompt).toBeNull();
  });

  test('the menu lists the corpses here, then her corpses and imitation Amulets', () => {
    const s = setup(T.altar_neutral);
    const here = corpse(s, 'nh:newt');
    const mine = corpse(s, 'nh:jackal', { carried: true });
    const amulet = s.carry('nh:fake_amulet_of_yendor');
    s.carry('nh:apple');
    s.mod('nh:offer');
    const p = s.state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('menu');
    const values = p?.kind === 'menu' ? (p.options ?? []).map((o) => o.value) : [];
    expect(values).toEqual([here, mine, amulet]);
  });
});

describe('a sacrifice on her own god’s altar', () => {
  test('an old corpse: "Nothing happens." and it stays', () => {
    const s = setup(T.altar_neutral);
    s.state.turn = 500;
    const c = corpse(s, 'nh:soldier_ant', { age: 100 });
    const t = offer(s, c);
    expect(t).toContain('Nothing happens.');
    expect(ent(s, c)).toBeDefined();
    expect(uState(s.state).luck).toBe(0);
  });

  test('a fresh corpse: consumed in a plume of smoke, Luck up by its share, the clover', () => {
    const s = setup(T.altar_neutral);
    const c = corpse(s, 'nh:soldier_ant');
    const v = defs.monster('nh:soldier_ant').difficulty + 1;
    const t = offer(s, c);
    expect(t).toContain('Your sacrifice is consumed in a plume of smoke!');
    expect(t).toContain('You glimpse a four-leaf clover at your feet.');
    expect(ent(s, c)).toBeUndefined();
    expect(uState(s.state).luck).toBe(Math.trunc((v * 10) / 48));
  });

  test('Luck never rises above the value of the sacrifice', () => {
    const s = setup(T.altar_neutral);
    const v = defs.monster('nh:soldier_ant').difficulty + 1;
    setU(s.ctx, { luck: v - 1 });
    offer(s, corpse(s, 'nh:soldier_ant'));
    expect(uState(s.state).luck).toBe(v);
    // already above it: nothing, no clover
    const s2 = setup(T.altar_neutral);
    setU(s2.ctx, { luck: v + 1 });
    const t = offer(s2, corpse(s2, 'nh:soldier_ant'));
    expect(uState(s2.state).luck).toBe(v + 1);
    expect(t).not.toContain('You glimpse a four-leaf clover at your feet.');
  });

  test('the prayer timeout goes down by value * 300 / 24 ("You have a hopeful feeling.")', () => {
    const s = setup(T.altar_neutral);
    setU(s.ctx, { ublesscnt: 300, luck: -2 });
    const v = defs.monster('nh:soldier_ant').difficulty + 1;
    const before = uState(s.state).ublesscnt;
    const t = offer(s, corpse(s, 'nh:soldier_ant'));
    expect(t).toContain('You have a hopeful feeling.');
    // the turn's own countdown may have run once
    const after = uState(s.state).ublesscnt;
    const expected = before - Math.trunc((v * 300) / 24);
    expect(after === expected || after === expected - 1).toBe(true);
    expect(uState(s.state).luck).toBe(-1); // bad Luck eased by one
    // the last of it: reconciliation and bad Luck gone
    const s2 = setup(T.altar_neutral);
    setU(s2.ctx, { ublesscnt: 10, luck: -2 });
    expect(offer(s2, corpse(s2, 'nh:soldier_ant'))).toContain(
      'You have a feeling of reconciliation.',
    );
    expect(uState(s2.state).ublesscnt).toBe(0);
    expect(uState(s2.state).luck).toBe(0);
  });

  test('an angry god is mollified, partly or wholly; a negative record is absolved', () => {
    const s = setup(T.altar_neutral);
    setU(s.ctx, { ugangr: 1, luck: -3 });
    const t = offer(s, corpse(s, 'nh:soldier_ant')); // 8 * 3 / 24 = 1
    expect(t).toContain('Odin seems mollified.');
    expect(uState(s.state).ugangr).toBe(0);
    expect(uState(s.state).luck).toBe(0);
    const s2 = setup(T.altar_neutral);
    setU(s2.ctx, { ugangr: 5 });
    expect(offer(s2, corpse(s2, 'nh:soldier_ant'))).toContain('Odin seems slightly mollified.');
    expect(uState(s2.state).ugangr).toBe(4);
    const s3 = setup(T.altar_neutral);
    setU(s3.ctx, { ugangr: 1 });
    expect(offer(s3, corpse(s3, 'nh:newt'))).toContain('You have a feeling of inadequacy.');
    const s4 = setup(T.altar_neutral);
    setU(s4.ctx, { alignRecord: -3 });
    expect(offer(s4, corpse(s4, 'nh:soldier_ant'))).toContain('You feel partially absolved.');
    expect(uState(s4.state).alignRecord).toBe(0);
  });

  test('the gift: Mjollnir for a Valkyrie of level 3+, one time in 6 the first time', () => {
    let gifts = 0;
    let tries = 0;
    let seen: S | null = null;
    let text: string[] = [];
    for (let seed = 1; seed <= 90; seed++) {
      const s = setup(T.altar_neutral, seed);
      setLevel(s, 3);
      const t = offer(s, corpse(s, 'nh:soldier_ant'));
      tries++;
      if (artisHere(s).length > 0) {
        gifts++;
        if (!seen) {
          seen = s;
          text = t;
        }
      } else expect(uState(s.state).luck).toBeGreaterThan(0); // the Luck instead
    }
    expect(gifts).toBeGreaterThan(tries / 6 / 3);
    expect(gifts).toBeLessThan((tries / 6) * 2.5);
    const s = seen!;
    const [m] = artisHere(s);
    expect(m!.c.item!.artifact).toBe('nh:mjollnir');
    expect(text).toContain('A war hammer named Mjollnir appears at your feet!');
    expect(text.some((x) => /^The voice of Odin [a-z ]+: "Use my gift wisely!"$/.test(x))).toBe(
      true,
    );
    expect(m!.c.item!.erodeproof).toBe(true);
    expect(m!.c.item!.spe).toBeGreaterThanOrEqual(0);
    expect(m!.c.item!.buc).not.toBe('cursed');
    expect(artiInfo(s.state, 'nh:mjollnir')).toEqual({ origin: 'gift', found: true });
    expect(undiscoveredArtifact(s.state, 'nh:mjollnir')).toBe(false);
    expect(s.state.discovered).toContain('nh:war_hammer');
    expect(uState(s.state).ugifts).toBe(1);
    expect(uState(s.state).ublesscnt).toBeGreaterThan(0);
    expect(uState(s.state).luck).toBe(0); // no Luck with the gift
  });

  test('no gift below level 3 or with bad Luck; the second gift is rarer', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(T.altar_neutral, seed);
      setLevel(s, 2);
      offer(s, corpse(s, 'nh:soldier_ant'));
      expect(artisHere(s)).toHaveLength(0);
    }
    // ugifts 1 and one artifact existing: 1 in 8
    let gifts = 0;
    for (let seed = 1; seed <= 160; seed++) {
      const s = setup(T.altar_neutral, seed);
      setLevel(s, 5);
      setU(s.ctx, { ugifts: 1 });
      artifactOrigin(s.ctx, 'nh:mjollnir', 'gift', true);
      offer(s, corpse(s, 'nh:soldier_ant'));
      const a = artisHere(s);
      if (a.length > 0) {
        gifts++;
        expect(uState(s.state).ugifts).toBe(2);
      }
    }
    expect(gifts).toBeGreaterThan(160 / 8 / 3);
    expect(gifts).toBeLessThan((160 / 8) * 2.5);
  });
});

describe('mk_artifact() by alignment', () => {
  /** The rows a hero may be given for `align`, as mk_artifact()'s eligibility rules say. */
  const eligible = (s: S, align: number): Set<string> =>
    new Set(
      ARTIFACTS.filter((a) => {
        if (artiExists(s.state, a.id) || a.spfx.includes('nogen')) return false;
        const al = artiAlign(s.state, a);
        if (al !== align && al !== A_NONE) return false;
        return a.race === null || !raceHostile(s.state, defs.monster(RACES_TAB[a.race].mnum));
      }).map((a) => a.id),
    );

  test("her role's own first: Mjollnir for a Valkyrie, Magicbane for a Wizard", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = setup(null, seed);
      expect(mkArtifactByAlign(s.ctx as never, A_NEUTRAL, 24)?.c.item?.artifact).toBe(
        'nh:mjollnir',
      );
      const w = setup(null, seed);
      playAs(w.state, 'wizard');
      getPlayer(w.state).c.player!.align = A_CHAOTIC;
      expect(mkArtifactByAlign(w.ctx as never, A_CHAOTIC, 24)?.c.item?.artifact).toBe(
        'nh:magicbane',
      );
    }
  });

  test('then a row of her alignment or none, never an existing one, both kinds over seeds', () => {
    const got = new Set<string>();
    let aligned = 0;
    let none = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const s = setup(null, seed);
      artifactOrigin(s.ctx, 'nh:mjollnir', 'gift', true);
      const ok = eligible(s, A_NEUTRAL);
      const o = mkArtifactByAlign(s.ctx as never, A_NEUTRAL, 24);
      expect(o).not.toBeNull();
      const id = o!.c.item!.artifact!;
      expect(ok.has(id)).toBe(true);
      expect(artiInfo(s.state, id)?.origin).toBe('random');
      expect(o!.c.item!.erosion).toBeUndefined();
      got.add(id);
      const row = ARTIFACTS.find((a) => a.id === id)!;
      if (artiAlign(s.state, row) === A_NONE) none++;
      else aligned++;
    }
    expect(got.has('nh:mjollnir')).toBe(false);
    expect(aligned).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(0);
  });

  test('a chaotic orc never gets Sting or Orcrist; a chaotic elf never Grimtooth', () => {
    const orcGot = new Set<string>();
    const elfGot = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const o = setup(null, seed);
      playAs(o.state, 'barbarian', 'orc');
      getPlayer(o.state).c.player!.align = A_CHAOTIC;
      artifactOrigin(o.ctx, 'nh:cleaver', 'gift', true); // her role's first choice is gone
      const a = mkArtifactByAlign(o.ctx as never, A_CHAOTIC, 24);
      if (a) orcGot.add(a.c.item!.artifact!);
      const e = setup(null, seed);
      playAs(e.state, 'ranger', 'elf');
      getPlayer(e.state).c.player!.align = A_CHAOTIC;
      const b = mkArtifactByAlign(e.ctx as never, A_CHAOTIC, 24);
      if (b) elfGot.add(b.c.item!.artifact!);
    }
    expect(orcGot.has('nh:sting')).toBe(false);
    expect(orcGot.has('nh:orcrist')).toBe(false);
    expect(orcGot.has('nh:grimtooth')).toBe(true);
    expect(elfGot.has('nh:grimtooth')).toBe(false);
    expect([...elfGot].some((x) => x === 'nh:sting' || x === 'nh:orcrist')).toBe(true);
  });

  test('none left of her alignment or none: nothing (and the gift is Luck instead)', () => {
    const s = setup(T.altar_neutral);
    for (const a of ARTIFACTS) artifactOrigin(s.ctx, a.id, 'random');
    expect(mkArtifactByAlign(s.ctx as never, A_NEUTRAL, 99)).toBeNull();
  });

  test('a gift she cannot use gets its skill unrestricted', () => {
    // a Valkyrie's quarterstaff skill is restricted: force a Magicbane gift by making it the
    // only neutral-or-none row left that is not existing
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = setup(T.altar_neutral, seed);
      setLevel(s, 5);
      for (const a of ARTIFACTS) if (a.id !== 'nh:magicbane') artifactOrigin(s.ctx, a.id, 'random');
      expect(skillLevel(s.ctx, 'dagger')).not.toBe(P_RESTRICTED); // (her dagger skill)
      const before = nhData(s.ctx).skills?.['dagger'];
      offer(s, corpse(s, 'nh:soldier_ant'));
      if (artisHere(s).some((e) => e.c.item!.artifact === 'nh:magicbane')) {
        found = true;
        expect(nhData(s.ctx).skills?.['dagger']).toBe(before); // athame: a dagger
      }
    }
    expect(found).toBe(true);
  });
});

describe('another god’s altar', () => {
  test('converting the altar ("The altar glows gray.") or not ("Unluckily...")', () => {
    let converted = 0;
    let failed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(T.altar_lawful, seed);
      const t = offer(s, corpse(s, 'nh:soldier_ant'));
      expect(t).toContain('Your sacrifice is consumed in a plume of smoke!');
      expect(t).toContain('You sense a conflict between Odin and Tyr.');
      if (t.includes('The altar glows gray.')) {
        converted++;
        expect(t).toContain('You feel the power of Odin increase.');
        expect(terrain(s)).toBe(T.altar_neutral);
        expect(uState(s.state).luck).toBe(1);
      } else {
        failed++;
        expect(t).toContain('Unluckily, you feel the power of Odin decrease.');
        expect(terrain(s)).toBe(T.altar_lawful);
        expect(uState(s.state).luck).toBe(-1);
      }
    }
    // rn2(8 + 1) > 5: 3 in 9
    expect(converted).toBeGreaterThan(4);
    expect(failed).toBeGreaterThan(converted);
  });

  test("a converted temple altar keeps its shrine and angers the temple's priest", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(null, seed);
      const level = getLevel(s.state);
      level.rooms.push({ lx: 0, ly: 0, hx: 8, hy: 4, lit: true, type: TEMPLE } as never);
      paint(s, T.altar_lawful);
      level.shrines = [{ x: s.here.x, y: s.here.y }];
      const pid = priestini(s.ctx as never, level, 0, { x: s.here.x, y: s.here.y });
      expect(pid).not.toBeNull();
      expect(ent(s, pid!)!.c.monster!.peaceful).toBe(true);
      checkSpecialRoom(s.ctx as never, false); // u.urooms: she is in the temple
      const t = offer(s, corpse(s, 'nh:soldier_ant'));
      if (!t.includes('The altar glows gray.')) continue;
      expect(terrain(s)).toBe(T.altar_neutral);
      expect(level.shrines).toEqual([{ x: s.here.x, y: s.here.y }]);
      expect(ent(s, pid!)!.c.monster!.peaceful).toBe(false);
      expect(epriOf(s.ctx, pid!)).not.toBeNull();
      return;
    }
    throw new Error('no conversion in 40 seeds');
  });

  test('with her god angry she converts, once: Tyr accepts her allegiance', () => {
    const s = setup(T.altar_lawful);
    setU(s.ctx, { alignRecord: -1, ublesscnt: 0 });
    const t = offer(s, corpse(s, 'nh:soldier_ant'));
    expect(t).toContain('You have a strong feeling that Odin is angry...');
    expect(t).toContain('Your sacrifice is consumed in a plume of smoke!');
    expect(t).toContain('Tyr accepts your allegiance.');
    expect(t).toContain('You have a sudden sense of a new direction.');
    const u = uState(s.state);
    expect(u.alignType).toBe(A_LAWFUL);
    expect(u.alignCur).toBe(A_LAWFUL);
    expect(u.alignBase ?? 0).toBe(A_NEUTRAL); // the original stays
    expect(u.alignRecord).toBe(0);
    expect(u.luck).toBe(-3);
    expect(u.ublesscnt).toBeGreaterThanOrEqual(299);
    expect(getPlayer(s.state).c.player!.align).toBe(A_NEUTRAL);
    // a second time, on Odin's altar with Tyr angry: rejected
    paint(s, T.altar_neutral);
    setU(s.ctx, { alignRecord: -1 });
    for (let seed = 1; seed <= 20; seed++) {
      const c = corpse(s, 'nh:soldier_ant');
      const t2 = offer(s, c);
      if (s.state.gameOver) return;
      expect(t2).toContain('Odin rejects your sacrifice!');
      expect(t2.some((x) => /^The voice of Odin [a-z ]+: "Suffer, infidel!"$/.test(x))).toBe(true);
      expect(uState(s.state).alignType).toBe(A_LAWFUL);
      expect(ent(s, c)).toBeDefined(); // not consumed
      expect(uState(s.state).ugangr).toBe(3);
      return;
    }
  });

  test('converting, she must touch her artifacts again: Stormbringer blasts a lawful hand', () => {
    const s = setup(T.altar_lawful);
    setU(s.ctx, { alignType: A_CHAOTIC, alignBase: A_CHAOTIC, alignRecord: -1 });
    getPlayer(s.state).c.player!.align = A_CHAOTIC;
    const sb = ent(s, s.carry('nh:runesword'))!;
    oname(s.ctx as never, sb, 'Stormbringer', 'wish', true);
    sb.c.item!.equipped = 'weapon';
    const hp0 = hero(s).c.hp!.cur;
    const t = offer(s, corpse(s, 'nh:soldier_ant'));
    expect(t).toContain('Tyr accepts your allegiance.');
    expect(uState(s.state).alignType).toBe(A_LAWFUL);
    // self-willed and now of another alignment: always blasted, d(4,10); no class, so it stays
    expect(t).toContain("You are blasted by the runesword named Stormbringer's power!");
    expect(hp0 - hero(s).c.hp!.cur).toBeGreaterThanOrEqual(4);
    expect(sb.c.item!.equipped).toBe('weapon');
  });

  test('a helm of opposite alignment keeps the alignment it gave her', () => {
    const s = setup(T.altar_lawful);
    setU(s.ctx, { alignType: A_CHAOTIC, alignRecord: -1 });
    const helm = ent(s, s.carry('nh:helm_of_opposite_alignment'))!;
    helm.c.item!.equipped = 'helm';
    const t = offer(s, corpse(s, 'nh:soldier_ant'));
    expect(t).toContain('You have a sense of a new direction.');
    expect(uState(s.state).alignCur).toBe(A_LAWFUL);
    expect(uState(s.state).alignType).toBe(A_CHAOTIC);
  });
});

describe('her own race', () => {
  test('a neutral altar is stained with human blood and becomes chaotic', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(null, seed);
      paint(s, T.altar_neutral);
      getLevel(s.state).shrines = [{ x: s.here.x, y: s.here.y }];
      s.state.turn = 500;
      const t = offer(s, corpse(s, 'nh:human', { age: 400 })); // too old does not matter
      if (s.state.gameOver) continue; // the angry god's bolt
      expect(t).toContain("You'll regret this infamous offense!");
      expect(t).toContain('The altar is stained with human blood.');
      expect(terrain(s)).toBe(T.altar_chaotic);
      expect(getLevel(s.state).shrines).toBeUndefined();
      const u = uState(s.state);
      expect(u.ugangr).toBe(3);
      expect(u.luck).toBe(-5);
      expect(u.alignRecord).toBeLessThanOrEqual(0);
      return;
    }
    throw new Error('no survivor');
  });

  test('a chaotic altar vanishes in a black cloud, and a demon lord may answer', () => {
    let demons = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(T.altar_chaotic, seed);
      const t = offer(s, corpse(s, 'nh:human'));
      if (s.state.gameOver) continue;
      expect(t).toContain('The blood floods the altar, which vanishes in a black cloud!');
      expect(terrain(s)).toBe(T.floor);
      const summoned = t.find((x) => x.startsWith('You have summoned'));
      if (summoned) {
        demons++;
        expect(t).toContain('You are terrified, and unable to move.');
        const d = Object.values(s.state.entities).find(
          (e) => e?.def === 'nh:juiblex' || e?.def === 'nh:yeenoghu',
        );
        expect(d?.c.monster?.peaceful).toBe(false); // she is neutral
      } else expect(t).toContain('The cloud dissipates.');
    }
    expect(demons).toBeGreaterThan(0);
  });

  test('a chaotic hero on a chaotic altar: the blood covers it, Luck +2, alignment +5', () => {
    const s = setup(T.altar_chaotic);
    setU(s.ctx, { alignType: A_CHAOTIC, alignRecord: 0 });
    const t = offer(s, corpse(s, 'nh:human'));
    expect(t).toContain('The blood covers the altar!');
    expect(t).not.toContain("You'll regret this infamous offense!");
    expect(terrain(s)).toBe(T.altar_chaotic);
    expect(uState(s.state).luck).toBe(2);
    expect(uState(s.state).alignRecord).toBe(5);
  });
});

describe('unicorns', () => {
  test("of the altar's alignment: an insult (gods upset)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(T.altar_neutral, seed);
      const t = offer(s, corpse(s, 'nh:gray_unicorn'));
      if (s.state.gameOver) continue;
      expect(t).toContain('Such an action is an insult to balance!');
      expect(uState(s.state).ugangr).toBe(1);
      return;
    }
    throw new Error('no survivor');
  });

  test('another alignment on her own altar: "You feel appropriately neutral." and +3', () => {
    const s = setup(T.altar_neutral);
    setU(s.ctx, { alignRecord: 0 });
    const v = defs.monster('nh:white_unicorn').difficulty + 1 + 3;
    const t = offer(s, corpse(s, 'nh:white_unicorn'));
    expect(t).toContain('You feel appropriately neutral.');
    expect(uState(s.state).alignRecord).toBeGreaterThanOrEqual(5);
    expect(uState(s.state).luck).toBe(Math.min(Math.trunc((v * 10) / 48), v));
  });

  test('her own alignment on another altar: her god is angry, so she converts', () => {
    const s = setup(T.altar_lawful);
    const t = offer(s, corpse(s, 'nh:gray_unicorn'));
    expect(t).toContain('You have a strong feeling that Odin is angry...');
    expect(uState(s.state).alignType).toBe(A_LAWFUL);
  });
});

describe('the imitation Amulet', () => {
  test('not known to be fake: offered too soon; known: thunder and an angry god', () => {
    const s = setup(T.altar_neutral);
    const a = s.carry('nh:fake_amulet_of_yendor');
    expect(offer(s, a)).toContain('You feel an urge to return to the surface.');
    const s2 = setup(T.altar_lawful);
    expect(offer(s2, s2.carry('nh:fake_amulet_of_yendor'))).toContain('You feel ashamed.');
    for (let seed = 1; seed <= 20; seed++) {
      const s3 = setup(T.altar_neutral, seed);
      const b = s3.carry('nh:fake_amulet_of_yendor');
      ent(s3, b)!.c.item!.known.spe = true;
      const t = offer(s3, b);
      if (s3.state.gameOver) continue;
      expect(t).toContain('You hear a nearby thunderclap.');
      expect(uState(s3.state).luck).toBe(-3);
      expect(uState(s3.state).ugangr).toBe(4); // 3, then gods_upset()
      expect(inventoryOf(s3.state, s3.state.playerId).some((e) => e.id === b)).toBe(true);
      return;
    }
    throw new Error('no survivor');
  });
});
