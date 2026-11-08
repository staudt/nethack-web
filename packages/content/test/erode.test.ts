// Erosion and elemental item destruction.
import {
  createRng,
  seedRng,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type EntityId,
  type GameEvent,
  type GameState,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, doname, findAc, hitmuAd, setItimeout } from '../src/index';
import { dmgvalSized } from '../src/combat';
import { destroyItems, erodeArmor, erodeObj } from '../src/erode';
import { rknown } from '../src/items';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, obj, plainKit, render } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;

/** A Ctx with everything the content functions touch, over a state. */
function fullCtx(state: GameState): Ctx & { events: GameEvent[] } {
  return Object.assign(ctxFor(state), {
    interrupt() {},
    endGame(over: NonNullable<GameState['gameOver']>) {
      state.gameOver = over;
    },
  }) as unknown as Ctx & { events: GameEvent[] };
}

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const ent = (s: Setup, id: EntityId) => {
  const e = s.state.entities[String(id)];
  if (!e?.c.item) throw new Error(`no item ${id}`);
  return e;
};
const name = (s: Setup, id: EntityId) => render(doname(s.state, defs, ent(s, id)));
const spear = (s: Setup) => s.byLetter('a');
const quantityOf = (s: Setup, id: EntityId) => s.state.entities[String(id)]?.c.item?.quantity ?? 0;
/** Hero items with no BUC luck: everything uncursed. */
function plain(seed = 1): Setup {
  const s = levelSetup(undefined, seed);
  plainKit(s.state);
  return s;
}

describe('erode_obj', () => {
  test('an iron spear rusts one level at a time, then looks completely rusted', () => {
    const s = plain();
    const ctx = fullCtx(s.state);
    const sp = ent(s, spear(s));
    const results = [1, 2, 3, 4].map(() => erodeObj(ctx, sp, null, 'rust', { verbose: true }));
    expect(results).toEqual(['damaged', 'damaged', 'damaged', 'nothing']);
    expect(sp.c.item?.erosion).toEqual({ e1: 3, e2: 0 });
    expect(texts(ctx.events)).toEqual([
      'Your spear rusts!',
      'Your spear rusts further!',
      'Your spear rusts completely!',
      'Your spear looks completely rusted.',
    ]);
    expect(name(s, sp.id)).toBe('uncursed thoroughly rusty +1 spear (weapon in hand)');
  });

  test('materials: wood burns and rots but does not rust; corrosion is the second track', () => {
    const s = plain();
    const ctx = fullCtx(s.state);
    const club = ent(s, s.carry('nh:club'));
    expect(erodeObj(ctx, club, null, 'rust', { verbose: true })).toBe('nothing');
    expect(texts(ctx.events)).toEqual(['Your club is not affected by oxidation.']);
    expect(erodeObj(ctx, club, null, 'burn')).toBe('damaged');
    expect(erodeObj(ctx, club, null, 'rot')).toBe('damaged');
    expect(erodeObj(ctx, club, null, 'rot')).toBe('damaged');
    expect(club.c.item?.erosion).toEqual({ e1: 1, e2: 2 });
    const sp = ent(s, spear(s));
    erodeObj(ctx, sp, null, 'rust');
    erodeObj(ctx, sp, null, 'corrode');
    erodeObj(ctx, sp, null, 'corrode');
    expect(sp.c.item?.erosion).toEqual({ e1: 1, e2: 2 });
    expect(name(s, sp.id)).toBe('uncursed rusty very corroded +1 spear (weapon in hand)');
    // potions and scrolls do not erode
    const potion = ent(s, s.carry('nh:potion_of_water'));
    expect(erodeObj(ctx, potion, null, 'burn')).toBe('nothing');
    expect(potion.c.item?.erosion).toBeUndefined();
  });

  test('an erodeproof item resists, and the hero learns it is rustproof', () => {
    const s = plain();
    const ctx = fullCtx(s.state);
    const sp = ent(s, spear(s));
    sp.c.item!.erodeproof = true;
    expect(name(s, sp.id)).toBe('uncursed +1 spear (weapon in hand)');
    expect(erodeObj(ctx, sp, null, 'rust')).toBe('nothing');
    expect(rknown(s.state, sp.id)).toBe(true);
    expect(erodeObj(ctx, sp, null, 'rust', { verbose: true })).toBe('nothing');
    expect(texts(ctx.events)).toEqual([
      'Somehow, your spear is not affected by the oxidation.',
      'Your spear is not affected by oxidation.',
    ]);
    expect(sp.c.item?.erosion).toBeUndefined();
    expect(name(s, sp.id)).toBe('uncursed rustproof +1 spear (weapon in hand)');
  });

  test('a blessed item resists about a quarter of the time (Luck 0)', () => {
    let resisted = 0;
    const n = 200;
    for (let seed = 1; seed <= n; seed++) {
      const s = plain(seed);
      const sp = ent(s, spear(s));
      sp.c.item!.buc = 'blessed';
      if (erodeObj(fullCtx(s.state), sp, null, 'rust') === 'nothing') resisted++;
    }
    expect(resisted).toBeGreaterThan(n * 0.15);
    expect(resisted).toBeLessThan(n * 0.35);
  });

  test('a rusty weapon does less damage, never below 1', () => {
    const s = plain();
    const sp = ent(s, spear(s));
    const def = obj('nh:spear');
    for (let seed = 1; seed <= 50; seed++) {
      delete sp.c.item!.erosion;
      const clean = dmgvalSized(createRng(seedRng(seed)), sp, def, false);
      sp.c.item!.erosion = { e1: 2, e2: 1 };
      const rusty = dmgvalSized(createRng(seedRng(seed)), sp, def, false);
      expect(rusty).toBe(Math.max(1, clean - 2));
    }
  });

  test('eroded armor gives less AC, capped at its base bonus', () => {
    const s = plain();
    const shield = ent(s, s.byLetter('c')); // small shield (wood), AC 1, worn
    expect(shield.c.item?.equipped).toBe('shield');
    const spe = shield.c.item!.spe;
    const ac0 = findAc(s.state, defs, s.state.playerId); // the shield gives 1 + spe
    shield.c.item!.erosion = { e1: 1, e2: 0 };
    expect(findAc(s.state, defs, s.state.playerId)).toBe(ac0 + 1);
    // base 1 + spe - min(3, 1): erosion never takes more than the base bonus
    shield.c.item!.erosion = { e1: 3, e2: 0 };
    expect(findAc(s.state, defs, s.state.playerId)).toBe(ac0 + 1);
    shield.c.item!.spe = spe + 2;
    expect(findAc(s.state, defs, s.state.playerId)).toBe(ac0 - 1);
    shield.c.item!.spe = spe;
    const mail = ent(s, s.carry('nh:ring_mail')); // iron, AC 3
    mail.c.item!.equipped = 'body';
    const withMail = findAc(s.state, defs, s.state.playerId);
    mail.c.item!.erosion = { e1: 2, e2: 0 };
    expect(findAc(s.state, defs, s.state.playerId)).toBe(withMail + 2);
  });

  test('erode_armor picks a worn piece; the body is always a target', () => {
    const s = plain();
    const ctx = fullCtx(s.state);
    const mail = ent(s, s.carry('nh:ring_mail'));
    mail.c.item!.equipped = 'body';
    for (let i = 0; i < 30; i++) erodeArmor(ctx, s.state.playerId, 'corrode');
    // ring mail (iron) corrodes; the wooden shield cannot, so every call ended on the mail
    expect(mail.c.item?.erosion?.e2).toBe(3);
    expect(ent(s, s.byLetter('c')).c.item?.erosion).toBeUndefined();
  });

  test('stacks with different erosion do not merge', async () => {
    const { mergable } = await import('../src/items');
    const s = plain();
    const a = ent(s, s.carry('nh:dart', { quantity: 3 }));
    const b = ent(s, s.floor('nh:dart', { quantity: 2 }));
    b.c.item!.buc = a.c.item!.buc;
    b.c.item!.spe = a.c.item!.spe;
    expect(mergable(defs, a, b)).toBe(true);
    b.c.item!.erosion = { e1: 1, e2: 0 };
    expect(mergable(defs, a, b)).toBe(false);
    delete b.c.item!.erosion;
    b.c.item!.erodeproof = true;
    expect(mergable(defs, a, b)).toBe(false);
  });
});

describe('destroy_items', () => {
  test('fire burns scrolls and boils potions; the hero takes the damage', () => {
    let burned = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = plain(seed);
      const ctx = fullCtx(s.state);
      const scrolls = s.carry('nh:scroll_of_light', { quantity: 3 });
      const potions = s.carry('nh:potion_of_water', { quantity: 2 });
      const hp0 = s.hero.c.hp!.cur;
      destroyItems(ctx, s.state.playerId, 'fire', 10); // limit 2: both stacks are picked
      const lostS = 3 - quantityOf(s, scrolls);
      const lostP = 2 - quantityOf(s, potions);
      const msgs = texts(ctx.events);
      if (lostS) {
        burned++;
        expect(msgs.some((m) => /catch(es)? fire and burns?!$/.test(m))).toBe(true);
      }
      if (lostP) expect(msgs.some((m) => /potions? boils? and explodes?!$/.test(m))).toBe(true);
      // a scroll stack does 1, a potion stack rnd(6), whatever the count
      const lost = hp0 - s.hero.c.hp!.cur;
      expect(lost).toBeGreaterThanOrEqual((lostS ? 1 : 0) + (lostP ? 1 : 0));
      expect(lost).toBeLessThanOrEqual((lostS ? 1 : 0) + (lostP ? 6 : 0));
    }
    expect(burned).toBeGreaterThan(10);
  });

  test('fire resistance spares the hero the burning scrolls', () => {
    let seen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = plain(seed);
      const ctx = fullCtx(s.state);
      setItimeout(s.state, s.hero, P.FIRE_RES, 10000);
      const scrolls = s.carry('nh:scroll_of_light', { quantity: 3 });
      const hp0 = s.hero.c.hp!.cur;
      destroyItems(ctx, s.state.playerId, 'fire', 5);
      if (quantityOf(s, scrolls) < 3) {
        seen++;
        expect(texts(ctx.events)).toContain("You aren't hurt!");
        expect(s.hero.c.hp!.cur).toBe(hp0);
      }
    }
    expect(seen).toBeGreaterThan(3);
  });

  test('cold shatters potions (not scrolls); a small hit may destroy nothing', () => {
    let shattered = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = plain(seed);
      const ctx = fullCtx(s.state);
      const scrolls = s.carry('nh:scroll_of_light', { quantity: 3 });
      const potion = s.carry('nh:potion_of_water');
      destroyItems(ctx, s.state.playerId, 'cold', 5);
      expect(quantityOf(s, scrolls)).toBe(3);
      if (!s.state.entities[String(potion)]) {
        shattered++;
        expect(texts(ctx.events).some((m) => /^Your .*potion freezes and shatters!$/.test(m))).toBe(
          true,
        );
      }
      // damage 0: limit 0 (0 % 5 > rn2(5) never holds)
      const ctx0 = fullCtx(s.state);
      const before = inventoryOf(s.state, s.state.playerId).length;
      expect(destroyItems(ctx0, s.state.playerId, 'cold', 0)).toBe(0);
      expect(inventoryOf(s.state, s.state.playerId)).toHaveLength(before);
    }
    expect(shattered).toBeGreaterThan(5);
  });

  test("a monster's potions boil from fire; the damage is returned", () => {
    let seen = false;
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      const s = plain(seed);
      const ctx = fullCtx(s.state);
      const mon = addMon(s.state, 'nh:jackal', 3, 1, { asleep: true });
      s.step({ type: 'wait' }); // see it
      const p = s.give('nh:potion_of_water', { carriedBy: mon, quantity: 1 });
      const dmg = destroyItems(ctx, mon, 'fire', 5);
      if (s.state.entities[String(p)]) continue;
      seen = true;
      expect(dmg).toBeGreaterThanOrEqual(1);
      expect(dmg).toBeLessThanOrEqual(6);
      expect(texts(ctx.events).some((m) => /^The .*potion boils and explodes!$/.test(m))).toBe(
        true,
      );
    }
    expect(seen).toBe(true);
  });
});

describe('call sites', () => {
  test('a fire attack can burn a carried scroll (m_lev > rn2(20))', () => {
    const fire: AttackDef = { at: 'bite', ad: 'fire', n: 1, d: 4 };
    let burned = false;
    for (let seed = 1; seed <= 60 && !burned; seed++) {
      const s = plain(seed);
      const ctx = fullCtx(s.state);
      const mon = addMon(s.state, 'nh:jackal', 3, 1);
      s.state.entities[String(mon)]!.c.monster!.level = 19;
      const scroll = s.carry('nh:scroll_of_light');
      const label = name(s, scroll).replace(/^uncursed /, '');
      const hp0 = s.hero.c.hp!.cur;
      const dmg = hitmuAd(ctx, s.state.entities[String(mon)]!, fire, 10);
      if (s.state.entities[String(scroll)]) continue;
      burned = true;
      expect(dmg).toBe(10); // the attack's own damage is applied by the caller
      expect(texts(ctx.events)).toContain(`Your ${label} catches fire and burns!`);
      expect(hp0 - s.hero.c.hp!.cur).toBe(1);
    }
    expect(burned).toBe(true);
  });

  test("a red mold's passive fire burns the wooden club that hits it", () => {
    let burnt = false;
    for (let seed = 1; seed <= 200 && !burnt; seed++) {
      const s = plain(seed);
      const club = ent(s, s.carry('nh:club'));
      ent(s, spear(s)).c.item!.equipped = null;
      club.c.item!.equipped = 'weapon';
      const mon = addMon(s.state, 'nh:red_mold', s.here.x + 1, s.here.y);
      const m = s.state.entities[String(mon)]!;
      m.c.hp = { cur: 100000, max: 100000 };
      const r = s.step({ type: 'move', dir: 'e' });
      if (!club.c.item?.erosion) continue;
      burnt = true;
      expect(club.c.item.erosion).toEqual({ e1: 1, e2: 0 });
      expect(s.text(r)).toContain('Your club smoulders!');
    }
    expect(burnt).toBe(true);
  });

  test('confused enchant weapon erodeproofs and repairs; cursed removes the proofing', () => {
    const s = plain();
    setItimeout(s.state, s.hero, P.CONFUSION, s.state.turn + 100);
    const sp = ent(s, spear(s));
    sp.c.item!.erosion = { e1: 2, e2: 1 };
    const scroll = s.carry('nh:scroll_of_enchant_weapon');
    const r = s.mod('nh:read', { item: scroll });
    expect(s.text(r)).toContain('Your spear looks as good as new!');
    expect(sp.c.item?.erodeproof).toBe(true);
    expect(sp.c.item?.erosion).toBeUndefined();
    expect(sp.c.item?.spe).toBe(1);
    expect(name(s, sp.id)).toBe('uncursed rustproof +1 spear (weapon in hand)');
    const cursed = s.carry('nh:scroll_of_enchant_weapon');
    ent(s, cursed).c.item!.buc = 'cursed';
    s.mod('nh:read', { item: cursed });
    expect(sp.c.item?.erodeproof).toBeUndefined();
    expect(name(s, sp.id)).toBe('uncursed +1 spear (weapon in hand)');
  });
});
