// m22 step 7: the other role rules, through `playAs()` (helpers.ts; the test seam until m22 step 8). The Priest's
// BUC sight, the Samurai's Japanese names, the Archeologist's statues and fedora, the Knight's
// gluttony and the Monk's guilt for meat, the Wizard's spell hunger and cornuthaum, the Priest's
// clerical light, the Healer's immunity, pet healing and hearing, the Tourist's experience for
// new levels, the Rogue's and Monk's catching, Goodbye(), and the rank and alignment statuses.
// Outcomes, not lucky seeds.
// ref: src/objnam.c xname(), doname_base(), Japanese_item_name(); src/o_init.c disco_typename();
// src/zap.c break_statue(); src/do_wear.c Helmet_on(), Helmet_off(); src/timeout.c nh_timeout();
// src/eat.c choke(), violated_vegetarian(); src/spell.c spelleffects_check(); src/role.c
// role_init(), Goodbye(); src/potion.c peffect_sickness(); src/zap.c bhitm() healing;
// src/do.c goto_level(); src/botl.c do_statusline1(), rank_of()
import {
  buildSnapshot,
  getLevel,
  getPlayer,
  inventoryOf,
  type DefId,
  type EntityId,
  type Json,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { goodbyeKey, rankOf, xlevToRank } from '../src/botl';
import { mkcorpse } from '../src/items';
import { setU, uState } from '../src/luck';
import { clairvoyanceBlocked } from '../src/props';
import { spellSkill } from '../src/spellcalc';
import { breakStatue, mkcorpstat } from '../src/statue';
import { setPw } from '../src/uenergy';
import { setHeroFemale } from '../src/gender';
import { KEEN } from '../src/spell';
import { type RoleKey } from '../src/urole';
import { addMon, playAs } from './helpers';
import { defs, engine, freshState, invLine, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

function setup(role: RoleKey, rows?: string[], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  playAs(s.state, role);
  return s;
}

/** A carried `id` with its BUC unknown. */
function carried(s: S, id: string, buc: 'blessed' | 'uncursed' | 'cursed', quantity = 1): EntityId {
  const o = s.carry(id);
  const it = s.state.entities[String(o)]!.c.item!;
  it.buc = buc;
  it.known.buc = false;
  it.quantity = quantity;
  return o;
}
const line = (s: S, id: EntityId): string => invLine(s.state, s.state.entities[String(id)]!);

describe('the Priest sees the BUC of everything (xname() bknown)', () => {
  test('cursed and blessed shown without being learned; uncursed implied', () => {
    const s = setup('priest');
    expect(line(s, carried(s, 'nh:short_sword', 'cursed'))).toMatch(/ - a cursed short sword$/);
    expect(line(s, carried(s, 'nh:food_ration', 'blessed'))).toMatch(/ - a blessed food ration$/);
    expect(line(s, carried(s, 'nh:mace', 'uncursed'))).toMatch(/ - a mace$/);
  });

  test('a Valkyrie sees no BUC she has not learned, and "uncursed" when she has', () => {
    const s = setup('valkyrie');
    const sword = carried(s, 'nh:short_sword', 'cursed');
    expect(line(s, sword)).toMatch(/ - a short sword$/);
    const dagger = carried(s, 'nh:mace', 'uncursed');
    s.state.entities[String(dagger)]!.c.item!.known.buc = true;
    expect(line(s, dagger)).toMatch(/ - an uncursed mace$/);
  });

  test('a known cursed weapon in her hand cannot be unwielded by the Priest', () => {
    const s = setup('priest');
    const sword = carried(s, 'nh:short_sword', 'cursed');
    s.state.entities[String(sword)]!.c.item!.equipped = 'weapon';
    const offers = engine
      .query(s.state)
      .actionsFor({ kind: 'item', id: sword })
      .filter((o) => o.action.type === 'mod' && o.action.action === 'nh:unwield');
    expect(offers).toEqual([]);
  });
});

describe("the Samurai's Japanese names (Japanese_item_name())", () => {
  test('in her inventory, singular and plural; others keep the English names', () => {
    const s = setup('samurai');
    expect(line(s, carried(s, 'nh:short_sword', 'uncursed'))).toMatch(/ - a wakizashi$/);
    expect(line(s, carried(s, 'nh:broadsword', 'uncursed', 2))).toMatch(/ - 2 ninja-tos$/);
    expect(line(s, carried(s, 'nh:food_ration', 'uncursed', 3))).toMatch(/ - 3 gunyoki$/);
    expect(line(s, carried(s, 'nh:leather_gloves', 'uncursed'))).toMatch(/ - a pair of yugake$/);
    const v = setup('valkyrie');
    expect(line(v, carried(v, 'nh:short_sword', 'uncursed'))).toMatch(/ - a short sword$/);
  });

  test('an unidentified harp is a koto; known booze is sake', () => {
    const s = setup('samurai');
    s.state.discovered = s.state.discovered.filter((d) => d !== 'nh:magic_harp');
    expect(line(s, carried(s, 'nh:magic_harp', 'uncursed'))).toMatch(/ - a koto$/);
    if (!s.state.discovered.includes('nh:potion_of_booze'))
      s.state.discovered.push('nh:potion_of_booze');
    expect(line(s, carried(s, 'nh:potion_of_booze', 'uncursed'))).toMatch(/ - a potion of sake$/);
  });

  test('the discoveries list names them with the English name in brackets', () => {
    const s = setup('samurai');
    const r = s.mod('nh:discoveries');
    const list = r.events.find((e) => e.type === 'list');
    expect(list?.type).toBe('list');
    const lines = list?.type === 'list' ? list.items.map((m) => render(m)) : [];
    expect(lines).toContain('  wakizashi [short sword]');
    expect(lines).toContain('  gunyoki [food ration]');
    expect(lines.some((l) => l.startsWith('  kabuto [helmet] ('))).toBe(true);
    expect(lines.some((l) => l.includes('magic koto'))).toBe(false); // not discovered
  });
});

describe('the Archeologist', () => {
  test('feels guilty breaking a historic statue (-1 alignment); a Valkyrie does not', () => {
    for (const role of ['archeologist', 'valkyrie'] as const) {
      const s = setup(role);
      setU(s.ctx, { alignRecord: 5 });
      const st = mkcorpstat(s.ctx, 'nh:gnome_king' as DefId, s.here, { historic: true });
      const name = render(defs.itemName(s.state, s.state.entities[String(st)]!));
      expect(name.startsWith('historic statue')).toBe(role === 'archeologist');
      expect(breakStatue(s.ctx as never, s.state.entities[String(st)]!)).toBe(true);
      const guilt = s.ctx.events.some((e) => e.type === 'msg' && e.key === 'statue.historic_guilt');
      expect(guilt).toBe(role === 'archeologist');
      expect(uState(s.state).alignRecord).toBe(role === 'archeologist' ? 4 : 5);
    }
  });

  test('a fedora gives her +1 Luck while worn', () => {
    const s = setup('archeologist');
    for (const e of inventoryOf(s.state, s.state.playerId))
      if (e.c.item?.equipped === 'helm') e.c.item.equipped = null;
    const hat = carried(s, 'nh:fedora', 'uncursed');
    s.mod('nh:wear', { item: hat });
    expect(uState(s.state).luck).toBe(1);
    s.mod('nh:takeoff', { item: hat });
    expect(uState(s.state).luck).toBe(0);
    const v = setup('valkyrie');
    v.mod('nh:wear', { item: carried(v, 'nh:fedora', 'uncursed') });
    expect(uState(v.state).luck).toBe(0);
  });
});

describe('food rules (eat.c)', () => {
  test('a lawful Knight who stuffs himself feels like a glutton (-1 alignment)', () => {
    for (const [role, align, glutton] of [
      ['knight', 1, true],
      ['knight', 0, false],
      ['valkyrie', 1, false],
    ] as const) {
      const s = setup(role);
      setU(s.ctx, { alignType: align, alignRecord: 5 });
      const h = getPlayer(s.state).c.hunger!;
      h.nutrition = 1900;
      h.state = 'satiated';
      const ration = carried(s, 'nh:food_ration', 'uncursed');
      const keys = s.msgKeys(s.mod('nh:eat', { item: ration }));
      expect(keys.includes('eat.glutton')).toBe(glutton);
      expect(uState(s.state).alignRecord).toBe(glutton ? 4 : 5);
    }
  });

  test('a Monk feels guilty eating meat, not a lichen; a Valkyrie never', () => {
    for (const [role, of, guilty] of [
      ['monk', 'nh:jackal', true],
      ['monk', 'nh:lichen', false],
      ['valkyrie', 'nh:jackal', false],
    ] as const) {
      const s = setup(role);
      setU(s.ctx, { alignRecord: 5 });
      const corpse = mkcorpse(s.ctx, defs.monster(of as DefId), { carriedBy: s.state.playerId });
      const t = s.text(s.mod('nh:eat', { item: corpse }));
      expect(t.includes('You feel guilty.')).toBe(guilty);
      expect(uState(s.state).alignRecord).toBe(guilty ? 4 : 5);
    }
  });
});

describe('spells', () => {
  const FORCE_BOLT = 'nh:spellbook_of_force_bolt';
  /** Casts force bolt at nothing (east) and returns the nutrition it cost. */
  function boltHunger(role: RoleKey, int: number): number {
    const s = setup(role, ['@.....']);
    (s.state.modData['nh'] as Record<string, Json>)['spells'] = [
      { id: FORCE_BOLT, retention: KEEN },
    ];
    setPw(s.ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
    const h = getPlayer(s.state);
    h.c.attributes!.int = int;
    h.c.hunger!.nutrition = 900;
    s.mod('nh:cast');
    const p = s.state.pendingPrompt?.prompt;
    if (p) engine.step(s.state, { type: 'answer', promptId: p.id, value: 0 });
    const d = s.state.pendingPrompt?.prompt;
    if (d) engine.step(s.state, { type: 'answer', promptId: d.id, value: 'e' });
    return 900 - (getPlayer(s.state).c.hunger?.nutrition ?? 0);
  }

  test("a Wizard's Intelligence lowers the hunger of casting (17+: none, 16: 1/4, 15: 1/2)", () => {
    const plain = boltHunger('valkyrie', 18);
    expect(plain).toBeGreaterThanOrEqual(10); // 2 * 5 Pw
    const turn = plain - 10; // the turn's own hunger
    expect(boltHunger('wizard', 18)).toBe(turn);
    expect(boltHunger('wizard', 16)).toBe(turn + 2);
    expect(boltHunger('wizard', 15)).toBe(turn + 5);
    expect(boltHunger('wizard', 14)).toBe(turn + 10);
  });

  test("a Priest's light is a clerical spell", () => {
    const s = setup('priest');
    expect(spellSkill('nh:spellbook_of_light', s.state)).toBe('cleric_spell');
    playAs(s.state, 'wizard');
    expect(spellSkill('nh:spellbook_of_light', s.state)).toBe('divination_spell');
  });

  test("a cornuthaum blocks a Wizard's clairvoyance only for others", () => {
    const s = setup('wizard');
    const hat = carried(s, 'nh:cornuthaum', 'uncursed');
    s.state.entities[String(hat)]!.c.item!.equipped = 'helm';
    expect(clairvoyanceBlocked(s.state)).toBe(false);
    playAs(s.state, 'valkyrie');
    expect(clairvoyanceBlocked(s.state)).toBe(true);
  });
});

describe('the Healer', () => {
  test('is immunized against the potion of sickness', () => {
    const s = setup('healer');
    const hp = getPlayer(s.state).c.hp!.cur;
    const potion = carried(s, 'nh:potion_of_sickness', 'uncursed');
    const t = s.text(s.mod('nh:quaff', { item: potion }));
    expect(t).toContain('Fortunately, you have been immunized.');
    expect(getPlayer(s.state).c.hp!.cur).toBe(hp);
  });

  test('healing her pet gives experience for the hit points restored and +1 alignment', () => {
    let checked = 0;
    for (let seed = 1; seed <= 20 && checked < 3; seed++) {
      const s = setup('healer', ['@.....'], seed);
      (s.state.modData['nh'] as Record<string, Json>)['spells'] = [
        { id: 'nh:spellbook_of_healing', retention: KEEN },
      ];
      setPw(s.ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
      setU(s.ctx, { alignType: 0, alignRecord: 0 });
      const m = addMon(s.state, 'nh:kitten', 2, 0, { asleep: true });
      const mon = s.state.entities[String(m)]!;
      mon.c.hp = { cur: 1, max: 50 };
      mon.c.actor!.speed = 0;
      mon.c.monster!.tame = 10;
      const xp0 = getPlayer(s.state).c.experience!.points;
      s.mod('nh:cast');
      const p = s.state.pendingPrompt?.prompt;
      if (p) engine.step(s.state, { type: 'answer', promptId: p.id, value: 0 });
      const d = s.state.pendingPrompt?.prompt;
      if (d) engine.step(s.state, { type: 'answer', promptId: d.id, value: 'e' });
      const healed = (s.state.entities[String(m)]?.c.hp?.cur ?? 1) - 1;
      if (healed <= 0) continue; // the spell failed
      expect(getPlayer(s.state).c.experience!.points - xp0).toBe(healed);
      expect(uState(s.state).alignRecord).toBe(1); // a Healer's +1, not sgn(neutral) = 0
      checked++;
    }
    expect(checked).toBe(3);
  });
});

describe('the Tourist', () => {
  test('gains level_difficulty() experience entering a new level, not an old one', () => {
    const gain = (role: RoleKey): number[] => {
      const state = freshState(3);
      playAs(state, role);
      const out: number[] = [];
      const xp = () => getPlayer(state).c.experience!.points;
      const go = (stairs: 'down' | 'up', action: string): void => {
        const level = getLevel(state);
        const at = level[stairs]!;
        getPlayer(state).c.pos = { level: level.id, x: at.x, y: at.y };
        const before = xp();
        engine.step(state, { type: 'mod', action: action as DefId });
        out.push(xp() - before);
      };
      go('down', 'nh:down'); // a new level 2
      go('up', 'nh:up'); // back to level 1
      go('down', 'nh:down'); // level 2 again
      return out;
    };
    expect(gain('tourist')).toEqual([2, 0, 0]);
    expect(gain('valkyrie')).toEqual([0, 0, 0]);
  });
});

describe('ranks, alignment and farewells (botl.c, role.c)', () => {
  test('xlev_to_rank() as C', () => {
    expect([1, 2, 3, 5, 6, 9, 10, 13, 26, 29, 30].map(xlevToRank)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 7, 7, 8,
    ]);
  });

  test("the Valkyrie's statuses: Stripling, Neutral; Skirmisher at XL3", () => {
    const state = freshState(1);
    const snap = () => buildSnapshot(engine.registry, state).status;
    expect(snap()['rank']).toBe('rank.valkyrie.1');
    expect(render({ key: String(snap()['rank']) })).toBe('Stripling');
    expect(render({ key: String(snap()['align']) })).toBe('Neutral');
    getPlayer(state).c.experience!.level = 3;
    expect(render({ key: String(snap()['rank']) })).toBe('Skirmisher');
  });

  test('female titles where a role has them; alignment by sign', () => {
    const state = freshState(1);
    playAs(state, 'priest');
    expect(render({ key: rankOf(state, 1, true) })).toBe('Aspirant');
    expect(render({ key: rankOf(state, 30, true) })).toBe('High Priestess');
    expect(render({ key: rankOf(state, 30, false) })).toBe('High Priest');
    playAs(state, 'caveman');
    setHeroFemale(state, false);
    expect(render({ key: String(buildSnapshot(engine.registry, state).status['rank']) })).toBe(
      'Troglodyte',
    );
    const ctx = { state } as never;
    setU(ctx, { alignType: -1 });
    expect(render({ key: String(buildSnapshot(engine.registry, state).status['align']) })).toBe(
      'Chaotic',
    );
    setU(ctx, { alignType: 1 });
    expect(render({ key: String(buildSnapshot(engine.registry, state).status['align']) })).toBe(
      'Lawful',
    );
  });

  test('Goodbye() by role, in the level-loss line too', () => {
    const state = freshState(1);
    const bye = (r: RoleKey): string => {
      playAs(state, r);
      return render({ key: goodbyeKey(state) });
    };
    expect(bye('valkyrie')).toBe('Farvel');
    expect(bye('knight')).toBe('Fare thee well');
    expect(bye('samurai')).toBe('Sayonara');
    expect(bye('tourist')).toBe('Aloha');
    expect(bye('wizard')).toBe('Goodbye');
    expect(render({ key: 'exp.goodbye', params: { bye: '@goodbye.samurai', level: 4 } })).toBe(
      'Sayonara level 4.',
    );
  });

  test('the end screen gets the farewell and the gendered role name', () => {
    const state = freshState(1);
    playAs(state, 'priest');
    state.gameOver = { how: 'quit' } as never;
    const st = buildSnapshot(engine.registry, state).status;
    expect(st['goodbye']).toBe('goodbye.default');
    expect(render({ key: String(st['role']) })).toBe('Priestess');
    expect(st['rank']).toBeUndefined();
  });
});
