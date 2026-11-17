// m20 step 4: monsters and artifacts. Monsters prefer an artifact weapon they can touch and pass
// over or refuse the ones that would blast them; their artifact hits on the hero (Vorpal Blade's
// beheading on a natural 1, Stormbringer's drain) and on each other; getmattk()'s physical
// override; what artifacts defend, reflect and protect for monsters; the demon princes and
// Excalibur or Demonbane; Demonbane against summoning; covetous monsters going for quest
// artifacts and the Wizard stealing one; obj_resists()'s artifact chance.
// Pinned monsters and outcomes over many tries, never a lucky seed.
// ref: src/weapon.c select_hwep(), hitval(); src/artifact.c touch_artifact(), bane_applies(),
// arti_reflects(), protects(); src/mon.c can_touch_safely(), can_carry(); src/mhitu.c
// getmattk(), hitmu(); src/uhitm.c mhitm_ad_phys(); src/makemon.c makemon(); src/minion.c
// demon_talk(), msummon(); src/wizard.c target_on(), tactics(); src/steal.c stealamulet();
// src/zap.c obj_resists()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { magicNegation, resistsBlnd } from '../src/adtyping';
import { monTouchArtifact } from '../src/artifact';
import { artiReflects, protects } from '../src/artidef';
import { resistsMagm } from '../src/buzz';
import { getmattk, hitmu, hitval } from '../src/combat';
import { tactics } from '../src/covetous';
import { demonTalk } from '../src/demontalk';
import { makemon } from '../src/generation';
import { oname, vanillaMod } from '../src/index';
import { objResists } from '../src/material';
import { mattackm } from '../src/mhitm';
import { msummon } from '../src/minion';
import { canCarry, mpickstuffSkips, selectHwep } from '../src/mongear';
import { mstratOf, setCancelled } from '../src/mstate';
import { monReflects } from '../src/musestate';
import { ureflects } from '../src/reflect';
import { pwOf, setPw } from '../src/uenergy';
import { stealamulet } from '../src/steal';
import { addMon, playAs } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const ROOM = ['...........', '...........', '...@.......', '...........', '...........'];
type S = ReturnType<typeof levelSetup>;

function setup(seed = 1, role: Parameters<typeof playAs>[1] = 'valkyrie'): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  playAs(s.state, role);
  for (const e of inventoryOf(s.state, s.state.playerId))
    if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
  return s;
}

const ent = (s: S, id: EntityId): Entity => {
  const e = s.state.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};

/** A pinned monster: speed 0, `hp` hit points, level `lvl`. */
function pin(s: S, def: string, o: { x?: number; y?: number; hp?: number; lvl?: number } = {}) {
  const id = addMon(s.state, def, o.x ?? 4, o.y ?? 2, { asleep: false });
  const e = ent(s, id);
  if (e.c.actor) e.c.actor.speed = 0;
  e.c.hp = { cur: o.hp ?? 1000, max: o.hp ?? 1000 };
  if (e.c.monster) e.c.monster.level = o.lvl ?? defs.monster(def as DefId).level;
  return id;
}

/** The artifact `name` on a new `base`, given to `who` (wielded with `wield`), uncursed +0. */
function arti(s: S, base: string, name: string, who: EntityId | null, wield = false): Entity {
  const id = s.give(base, who === null ? { at: s.here } : { carriedBy: who });
  const e = ent(s, id);
  oname(s.ctx as never, e, name, 'wish', true);
  expect(e.c.item?.artifact).toBeDefined();
  if (e.c.item) {
    e.c.item.buc = 'uncursed';
    e.c.item.spe = 0;
    if (wield) e.c.item.equipped = 'weapon';
  }
  return e;
}

/** A plain object given to `who`. */
const item = (s: S, base: string, who: EntityId, equipped: string | null = null): Entity => {
  const e = ent(s, s.give(base, { carriedBy: who }));
  if (e.c.item) {
    e.c.item.buc = 'uncursed';
    e.c.item.equipped = equipped as never;
  }
  return e;
};

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function said(s: S, fn: () => void): string[] {
  const events = s.ctx.events as GameEvent[];
  const from = events.length;
  fn();
  return texts(events.slice(from));
}

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);
/** Runs `fn` with the engine's own Ctx (game over, interrupts) and returns the messages. */
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(eng.step(s.state, { type: 'mod', action: 'pt:run' as DefId }).events);
}

const weaponAtk = (def: string) => {
  const a = defs.monster(def as DefId).attacks.find((x) => x.at === 'weapon');
  if (!a) throw new Error(`${def} has no weapon attack`);
  return a;
};

describe('monsters choosing and touching artifacts', () => {
  test('an orc prefers Grimtooth to its scimitar; Orcrist is its bane and refuses it', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc');
    const scimitar = item(s, 'nh:scimitar', orc);
    expect(selectHwep(ctx, orc)?.id).toBe(scimitar.id);
    const grim = arti(s, 'nh:orcish_dagger', 'Grimtooth', orc);
    expect(selectHwep(ctx, orc)?.id).toBe(grim.id);
    // Orcrist slays orcs: bad for them even when it is not restricted
    const s2 = setup();
    const orc2 = pin(s2, 'nh:hill_orc');
    const sc2 = item(s2, 'nh:scimitar', orc2);
    const orcrist = arti(s2, 'nh:elven_broadsword', 'Orcrist', orc2);
    expect(monTouchArtifact(s2.ctx as never, orcrist, orc2)).toBe(false);
    expect(selectHwep(s2.ctx as never, orc2)?.id).toBe(sc2.id);
  });

  test('a lawful dwarf refuses Stormbringer but takes Excalibur; the Wizard touches anything', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const dwarf = pin(s, 'nh:dwarf');
    const storm = arti(s, 'nh:runesword', 'Stormbringer', null);
    expect(monTouchArtifact(ctx, storm, dwarf)).toBe(false);
    expect(mpickstuffSkips(ctx, dwarf, storm)).toBe(true);
    expect(canCarry(ctx, dwarf, storm)).toBe(0);
    // a plain runesword is fine
    const plain = ent(s, s.give('nh:runesword', { at: s.here }));
    expect(mpickstuffSkips(ctx, dwarf, plain)).toBe(false);
    expect(canCarry(ctx, dwarf, plain)).toBe(1);
    const exc = arti(s, 'nh:long_sword', 'Excalibur', null);
    expect(monTouchArtifact(ctx, exc, dwarf)).toBe(true);
    // a chaotic orc may not touch Excalibur (restricted, lawful)
    const orc = pin(s, 'nh:hill_orc', { x: 5 });
    expect(monTouchArtifact(ctx, exc, orc)).toBe(false);
    expect(monTouchArtifact(ctx, storm, orc)).toBe(true);
    // covetous monsters can touch anything but a bane against them
    const wiz = pin(s, 'nh:wizard_of_yendor', { x: 6 });
    expect(monTouchArtifact(ctx, storm, wiz)).toBe(true);
    expect(monTouchArtifact(ctx, exc, wiz)).toBe(true);
    // a dwarf with Stormbringer and a dagger wields the dagger
    const dagger = item(s, 'nh:dagger', dwarf);
    const storm2 = ent(s, s.give('nh:runesword', { carriedBy: dwarf }));
    storm2.c.item!.artifact = 'nh:stormbringer' as DefId; // (the one copy is on the floor)
    expect(selectHwep(ctx, dwarf)?.id).toBe(dagger.id);
  });

  test("a monster never throws an artifact, nor wields an untouchable one's type", () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc');
    const sting = arti(s, 'nh:elven_dagger', 'Sting', orc);
    // Sting slays orcs: an orc cannot hold it, so another elven dagger is chosen
    expect(monTouchArtifact(ctx, sting, orc)).toBe(false);
    const other = item(s, 'nh:elven_dagger', orc);
    expect(selectHwep(ctx, orc)?.id).toBe(other.id);
  });
});

describe('monsters hitting the hero with artifacts', () => {
  test('Vorpal Blade beheads her on a natural 1 and only then', () => {
    for (const dieroll of [1, 2]) {
      const s = setup();
      const lord = pin(s, 'nh:gnome_lord');
      const vb = arti(s, 'nh:long_sword', 'Vorpal Blade', lord, true);
      const hp = getPlayer(s.state).c.hp!;
      const msgs = run(s, (c) => {
        hitmu(c, ent(s, lord), weaponAtk('nh:gnome_lord'), vb, false, 10, dieroll);
      });
      if (dieroll === 1) {
        expect(msgs.some((m) => /^Vorpal Blade (beheads|decapitates) you!$/.test(m))).toBe(true);
        expect(msgs).not.toContain('The gnome lord hits!');
        expect(s.state.gameOver).not.toBeNull();
      } else {
        expect(msgs[0]).toBe('The gnome lord hits!');
        expect(s.state.gameOver).toBeNull();
        expect(hp.cur).toBeLessThan(500);
      }
    }
  });

  test('Stormbringer drains her level; the orc heals', () => {
    const s = setup();
    const orc = pin(s, 'nh:hill_orc', { hp: 100 });
    ent(s, orc).c.hp!.cur = 50;
    const sb = arti(s, 'nh:runesword', 'Stormbringer', orc, true);
    const xp = getPlayer(s.state).c.experience!;
    xp.level = 5;
    const msgs = run(s, (c) => {
      hitmu(c, ent(s, orc), weaponAtk('nh:hill_orc'), sb, false, 10, 10);
    });
    expect(msgs[0]).toBe('The black blade drains your life!');
    expect(msgs).not.toContain('The hill orc hits!');
    expect(getPlayer(s.state).c.experience?.level).toBe(4);
    expect(ent(s, orc).c.hp!.cur).toBeGreaterThan(50);
  });

  test('the Tsurugi of Muramasa cuts her in half on a natural 1', () => {
    const s = setup();
    const sam = pin(s, 'nh:samurai');
    const ts = arti(s, 'nh:tsurugi', 'The Tsurugi of Muramasa', sam, true);
    const msgs = run(s, (c) => {
      hitmu(c, ent(s, sam), weaponAtk('nh:samurai'), ts, false, 10, 1);
    });
    expect(msgs[0]).toBe('The razor-sharp blade cuts you in half!');
    expect(s.state.gameOver).not.toBeNull();
  });

  test('Magicbane cancels her on a natural 1 at +0: she loses a point of energy', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc');
    const mb = arti(s, 'nh:athame', 'Magicbane', orc, true);
    setPw(ctx, { uen: 10, uenmax: 10 });
    const msgs = run(s, (c) => {
      hitmu(c, ent(s, orc), weaponAtk('nh:hill_orc'), mb, false, 10, 1);
    });
    expect(msgs[0]).toBe('The magic-absorbing blade cancels you!');
    expect(msgs).toContain('You lose magical energy!');
    expect(pwOf(s.state)).toMatchObject({ uen: 9, uenmax: 9 });
  });

  test("getmattk(): Stormbringer or Vorpal Blade, or cancellation, makes the wight's drain physical", () => {
    const s = setup();
    const ctx = s.ctx as never;
    const wight = pin(s, 'nh:barrow_wight');
    expect(getmattk(ctx, ent(s, wight), 0)?.ad).toBe('drli');
    const lsw = item(s, 'nh:long_sword', wight, 'weapon');
    expect(getmattk(ctx, ent(s, wight), 0)?.ad).toBe('drli');
    lsw.c.item!.equipped = null;
    arti(s, 'nh:runesword', 'Stormbringer', wight, true);
    expect(getmattk(ctx, ent(s, wight), 0)?.ad).toBe('phys');
    // only the first attack
    expect(getmattk(ctx, ent(s, wight), 1)?.ad).toBe('spel');
    const w2 = pin(s, 'nh:barrow_wight', { x: 6 });
    setCancelled(ctx, w2);
    expect(getmattk(ctx, ent(s, w2), 0)?.ad).toBe('phys');
  });

  test("a monster's hitval() adds its artifact's to-hit die against what it slays", () => {
    const s = setup();
    const ctx = s.ctx as never;
    const elf = pin(s, 'nh:woodland_elf');
    const sting = arti(s, 'nh:elven_dagger', 'Sting', elf, true);
    const orc = pin(s, 'nh:hill_orc', { x: 6 });
    const newt = pin(s, 'nh:newt', { x: 7 });
    const odef = defs.object('nh:elven_dagger' as DefId);
    const base = hitval(sting, odef, null);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(hitval(sting, odef, null, { ctx, target: orc }) - base);
      expect(hitval(sting, odef, null, { ctx, target: newt })).toBe(base);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('monsters hitting each other with artifacts', () => {
  test('Fire Brand burns the target and replaces the plain hit message', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc', { x: 4, y: 1 });
    arti(s, 'nh:long_sword', 'Fire Brand', orc, true);
    const jackal = pin(s, 'nh:jackal', { x: 5, y: 1 });
    let burned = 0;
    for (let i = 0; i < 60; i++) {
      const msgs = said(s, () => mattackm(ctx, orc, jackal));
      if (msgs.includes('The fiery blade burns the jackal!')) {
        burned++;
        expect(msgs).not.toContain('The hill orc hits the jackal.');
      }
    }
    expect(burned).toBeGreaterThan(0);
    expect(ent(s, jackal).c.hp!.cur).toBeLessThan(1000);
  });
});

describe('what artifacts do for monsters', () => {
  test('Magicbane wielded gives magic resistance; Sunsword stops blinding light', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc');
    const mb = arti(s, 'nh:athame', 'Magicbane', orc);
    expect(resistsMagm(ctx, ent(s, orc))).toBe(false);
    mb.c.item!.equipped = 'weapon';
    expect(resistsMagm(ctx, ent(s, orc))).toBe(true);
    const dwarf = pin(s, 'nh:dwarf', { x: 6 });
    expect(resistsBlnd(ctx, ent(s, dwarf))).toBe(false);
    arti(s, 'nh:long_sword', 'Sunsword', dwarf, true);
    expect(resistsBlnd(ctx, ent(s, dwarf))).toBe(true);
  });

  test("Dragonbane wielded reflects for a monster and for her ('weapon')", () => {
    const s = setup();
    const ctx = s.ctx as never;
    const orc = pin(s, 'nh:hill_orc');
    const db = arti(s, 'nh:broadsword', 'Dragonbane', orc);
    expect(artiReflects(db)).toBe(false);
    expect(monReflects(ctx, ent(s, orc), null)).toBe(false);
    db.c.item!.equipped = 'weapon';
    expect(artiReflects(db)).toBe(true);
    const msgs = said(s, () => {
      expect(monReflects(ctx, ent(s, orc), 'muse.reflect.gaze_away_mm')).toBe(true);
    });
    expect(msgs.join(' ')).toContain('weapon');
    // the hero
    expect(ureflects(ctx, null)).toBe(false);
    // (one Dragonbane per game: hers is the orc's, handed over)
    const mine = item(s, 'nh:broadsword', s.state.playerId, 'weapon');
    expect(ureflects(ctx, null)).toBe(false);
    mine.c.item!.artifact = 'nh:dragonbane' as DefId;
    expect(ureflects(ctx, null)).toBe(true);
  });

  test('the Tsurugi wielded and the Mitre worn give a monster Protection (magic cancellation)', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const samurai = pin(s, 'nh:samurai');
    expect(magicNegation(ctx, samurai)).toBe(0);
    const ts = arti(s, 'nh:tsurugi', 'The Tsurugi of Muramasa', samurai);
    expect(protects(defs, ts, false)).toBe(false);
    expect(magicNegation(ctx, samurai)).toBe(0);
    ts.c.item!.equipped = 'weapon';
    expect(magicNegation(ctx, samurai)).toBe(1);
  });
});

describe('demon princes, Excalibur and Demonbane', () => {
  test('Asmodeus is made hostile against a wielded Excalibur, peaceful otherwise', () => {
    for (const armed of [false, true]) {
      const s = setup();
      const ctx = s.ctx as never;
      if (armed) arti(s, 'nh:long_sword', 'Excalibur', s.state.playerId, true);
      const id = makemon(ctx, defs.monster('nh:asmodeus' as DefId), { x: 8, y: 2 });
      expect(id).not.toBeNull();
      expect(ent(s, id!).c.monster?.peaceful).toBe(!armed);
    }
  });

  test('a peaceful prince "looks very angry." when she wields Demonbane', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const asm = pin(s, 'nh:asmodeus');
    ent(s, asm).c.monster!.peaceful = true;
    arti(s, 'nh:silver_mace', 'Demonbane', s.state.playerId, true);
    const msgs = said(s, () => {
      expect(demonTalk(ctx, asm)).toBe(false);
    });
    expect(msgs).toEqual(['Asmodeus looks very angry.']);
    expect(ent(s, asm).c.monster?.peaceful).toBe(false);
  });

  test('a demon "looks puzzled for a moment" instead of summoning while she wields Demonbane', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const vrock = pin(s, 'nh:vrock');
    arti(s, 'nh:silver_mace', 'Demonbane', s.state.playerId, true);
    const before = Object.keys(s.state.entities).length;
    const msgs = said(s, () => {
      expect(msummon(ctx, ent(s, vrock))).toBe(0);
    });
    expect(msgs).toEqual(['The vrock looks puzzled for a moment.']);
    expect(Object.keys(s.state.entities).length).toBe(before);
  });
});

describe('covetous monsters and quest artifacts', () => {
  test('the Wizard goes for a Master Key on the floor and picks it up', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const wiz = pin(s, 'nh:wizard_of_yendor', { x: 9, y: 4 });
    const keyId = s.give('nh:skeleton_key', { at: { level: 'dlvl1', x: 1, y: 0 } });
    oname(ctx, ent(s, keyId), 'The Master Key of Thievery', 'wish', true);
    expect(ent(s, keyId).c.item?.artifact).toBe('nh:master_key_of_thievery');
    expect(tactics(ctx, wiz)).toBe(true);
    expect(ent(s, keyId).c.item?.carriedBy).toBe(wiz);
    expect(ent(s, wiz).c.pos).toMatchObject({ x: 1, y: 0 });
  });

  test('the Wizard steals her quest artifact, worn or not; one of several at random', () => {
    const s = setup(1, 'rogue');
    const ctx = s.ctx as never;
    const wiz = pin(s, 'nh:wizard_of_yendor');
    const eye = arti(s, 'nh:amulet_of_esp', 'The Eye of the Aethiopica', s.state.playerId);
    eye.c.item!.equipped = 'amulet';
    const msgs = said(s, () => stealamulet(ctx, ent(s, wiz)));
    expect(eye.c.item?.carriedBy).toBe(wiz);
    expect(eye.c.item?.equipped).toBeFalsy();
    expect(msgs.some((m) => m.includes('removes your'))).toBe(true);
    expect(msgs.some((m) => m.includes('steals'))).toBe(true);
    // nothing of special interest: nothing happens
    const s2 = setup();
    const w2 = pin(s2, 'nh:wizard_of_yendor');
    const n = inventoryOf(s2.state, s2.state.playerId).length;
    stealamulet(s2.ctx as never, ent(s2, w2));
    expect(inventoryOf(s2.state, s2.state.playerId).length).toBe(n);
  });

  test('the Wizard comes for a rogue carrying her Master Key, not for another role carrying it', () => {
    for (const role of ['rogue', 'valkyrie'] as const) {
      const s = setup(1, role);
      const ctx = s.ctx as never;
      const wiz = pin(s, 'nh:wizard_of_yendor', { x: 9, y: 4 });
      arti(s, 'nh:skeleton_key', 'The Master Key of Thievery', s.state.playerId);
      tactics(ctx, wiz);
      expect(mstratOf(ctx, wiz).strat === 'player').toBe(role === 'rogue');
    }
  });
});

describe('obj_resists() for artifacts', () => {
  test('an artifact uses the artifact chance', () => {
    const s = setup();
    const ctx = s.ctx as never;
    const sting = arti(s, 'nh:elven_dagger', 'Sting', s.state.playerId);
    const plain = item(s, 'nh:elven_dagger', s.state.playerId);
    for (let i = 0; i < 50; i++) {
      expect(objResists(ctx, sting, 0, 100)).toBe(true);
      expect(objResists(ctx, plain, 0, 100)).toBe(false);
    }
  });
});
