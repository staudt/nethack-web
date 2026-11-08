// m9 step 3: theft. Leprechauns taking gold (from her purse or from under her feet), nymphs
// charming her out of an item (worn armor over several turns, finished through afternmv),
// monkeys snatching one item, monsters robbing monsters, the leprechaun keeping away, and the
// fountain's water nymph.
import { getPlayer, inventoryOf, type EntityId, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { M_ATTK, hitmsgFor, mhitmAdtyping, newMhm, type Mhm } from '../src/adtyping';
import { domonnoise } from '../src/chat';
import { makemon } from '../src/generation';
import { mattackm } from '../src/mhitm';
import { mondead } from '../src/mondeath';
import { isFleeing } from '../src/monflee';
import { moneyCnt } from '../src/money';
import { unmulNow } from '../src/nomul';
import { setCancelled } from '../src/mstate';
import { couldSeduce, somegold } from '../src/steal';
import { defs, render } from './itemHelpers';
import { atk, keys, mon, room, type FullCtx } from './m9helpers';

const SITM = defs.monster('nh:water_nymph' as never).attacks[0]!;
const SEDU = defs.monster('nh:water_nymph' as never).attacks[1]!;
const SGLD = defs.monster('nh:leprechaun' as never).attacks[0]!;
const MONKEY_SITM = defs.monster('nh:monkey' as never).attacks[0]!;

/** Text of the messages so far. */
const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

/** A room whose hero carries nothing. */
function bare(seed = 1) {
  const s = room(seed);
  for (const o of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(o.id)];
  return s;
}

const carrier = (st: GameState, id: EntityId): number | null | undefined =>
  st.entities[String(id)]?.c.item?.carriedBy;

const posKey = (st: GameState, id: EntityId): string => {
  const p = st.entities[String(id)]!.c.pos!;
  return `${p.x},${p.y}`;
};

function hit(s: ReturnType<typeof room>, magr: EntityId, a = SITM, mdef?: EntityId): Mhm {
  const mhm = newMhm(0);
  mhitmAdtyping(s.ctx, magr, a, mdef ?? s.state.playerId, mhm, { vis: true, mwep: null });
  return mhm;
}

describe('leprechauns (AD_SGLD)', () => {
  test('"Your purse feels lighter.": somegold() of her gold, then it teleports and flees', () => {
    const s = bare();
    s.carry('nh:gold_piece', { quantity: 100 });
    const lep = mon(s.state, 'nh:leprechaun');
    hit(s, lep.id, SGLD);
    expect(keys(s.ctx)).toContain('steal.purse_lighter');
    const took = moneyCnt(s.ctx, lep.id);
    expect(took).toBeGreaterThanOrEqual(50); // somegold(100): rn1(51, 50)
    expect(took + moneyCnt(s.ctx, s.state.playerId)).toBe(100);
    expect(posKey(s.state, lep.id)).not.toBe('3,2');
    expect(isFleeing(s.ctx, lep.id)).toBe(true);
  });

  test('gold under her feet goes first when she has none', () => {
    const s = bare();
    s.floor('nh:gold_piece', { quantity: 30 });
    const lep = mon(s.state, 'nh:leprechaun');
    hit(s, lep.id, SGLD);
    expect(texts(s.ctx)[0]).toBe(
      'The leprechaun quickly snatches some gold from between your feet!',
    );
    expect(moneyCnt(s.ctx, lep.id)).toBe(30);
    expect(posKey(s.state, lep.id)).not.toBe('3,2'); // no gold of hers: it always leaves
  });

  test('a cancelled leprechaun takes nothing', () => {
    const s = bare();
    s.carry('nh:gold_piece', { quantity: 100 });
    const lep = mon(s.state, 'nh:leprechaun');
    setCancelled(s.ctx, lep.id);
    hit(s, lep.id, SGLD);
    expect(moneyCnt(s.ctx, s.state.playerId)).toBe(100);
    expect(keys(s.ctx)).toEqual([]);
  });

  test('somegold(): all of it under 50, else at least the floor of its band', () => {
    const s = bare();
    expect(somegold(s.ctx, 49)).toBe(49);
    for (let i = 0; i < 30; i++) {
      const g = somegold(s.ctx, 700);
      expect(g).toBeGreaterThanOrEqual(100);
      expect(g).toBeLessThanOrEqual(700);
    }
  });

  test('one with more gold than her keeps away and does not attack her', () => {
    let attacks = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = bare(seed);
      const lep = mon(s.state, 'nh:leprechaun');
      s.ctx.events.length = 0;
      const lg = s.state.entities[String(lep.id)]!;
      // its own gold, none for her
      s.give('nh:gold_piece', { quantity: 50, carriedBy: lg.id });
      for (let t = 0; t < 6; t++) {
        const r = s.step({ type: 'wait' });
        attacks += s.msgKeys(r).filter((k) => k.startsWith('combat.mon_')).length;
      }
    }
    expect(attacks).toBe(0);
    // while she has gold, it comes for it
    let tries = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = bare(seed);
      s.carry('nh:gold_piece', { quantity: 50 });
      mon(s.state, 'nh:leprechaun');
      for (let t = 0; t < 6; t++) {
        const r = s.step({ type: 'wait' });
        tries += s.msgKeys(r).filter((k) => k.startsWith('combat.mon_')).length;
      }
    }
    expect(tries).toBeGreaterThan(0);
  });
});

describe('nymphs (AD_SITM, AD_SEDU)', () => {
  test('"The water nymph stole a dagger.": she takes it and teleports away', () => {
    const s = bare(3); // a seed whose rloc() lands her not next to the hero
    const dagger = s.carry('nh:dagger');
    const ny = mon(s.state, 'nh:water_nymph');
    const mhm = hit(s, ny.id);
    // then rloc()'s RLOC_MSG line
    expect(texts(s.ctx)).toEqual([
      'The water nymph stole a dagger.',
      'The water nymph vanishes and reappears close by.',
    ]);
    expect(carrier(s.state, dagger)).toBe(ny.id);
    expect(mhm.done).toBe(true);
    expect(mhm.hitflags).toBe(M_ATTK.AGR_DONE);
    expect(posKey(s.state, ny.id)).not.toBe('3,2');
    expect(isFleeing(s.ctx, ny.id)).toBe(true);
  });

  test('a cloak with no delay: "She charms you.  You gladly hand over your cloak."', () => {
    const s = bare(3); // a seed whose rloc() lands her not next to the hero
    const cloak = s.carry('nh:orcish_cloak');
    s.state.entities[String(cloak)]!.c.item!.equipped = 'cloak';
    const ny = mon(s.state, 'nh:water_nymph');
    hit(s, ny.id, SEDU);
    expect(texts(s.ctx)).toEqual([
      'The water nymph charms you.  You gladly hand over your cloak.',
      'She stole a coarse mantelet.',
      'The water nymph vanishes and reappears close by.',
    ]);
    expect(carrier(s.state, cloak)).toBe(ny.id);
    expect(s.state.entities[String(cloak)]!.c.item!.equipped).toBe(null);
  });

  test('a suit takes 5 turns to take off; then stealarm() hands it over', () => {
    const s = bare(3); // a seed whose rloc() lands her not next to the hero
    const mail = s.carry('nh:ring_mail');
    s.state.entities[String(mail)]!.c.item!.equipped = 'body';
    const ny = mon(s.state, 'nh:water_nymph');
    const mhm = hit(s, ny.id);
    expect(texts(s.ctx)).toEqual([
      'The water nymph charms you.  You gladly start removing your suit.',
    ]);
    expect(mhm.done).toBe(false); // she stays next to her
    const hero = getPlayer(s.state);
    expect(hero.c.helpless?.reasonKey).toBe('helpless.taking_off_clothes');
    expect(hero.c.helpless!.until).toBe(s.state.turn + 6);
    expect(carrier(s.state, mail)).toBe(s.state.playerId);
    expect(s.state.entities[String(mail)]!.c.item!.equipped).toBe(null);
    s.ctx.events.length = 0;
    unmulNow(s.ctx);
    expect(texts(s.ctx)).toEqual([
      'You can move again.',
      'The water nymph steals a ring mail!',
      'The water nymph vanishes and reappears close by.',
    ]);
    expect(carrier(s.state, mail)).toBe(ny.id);
    expect(posKey(s.state, ny.id)).not.toBe('3,2');
  });

  test('the thief dies meanwhile: "You finish taking off your suit."', () => {
    const s = bare();
    const mail = s.carry('nh:ring_mail');
    s.state.entities[String(mail)]!.c.item!.equipped = 'body';
    const ny = mon(s.state, 'nh:water_nymph');
    hit(s, ny.id);
    mondead(s.ctx, ny.id);
    s.ctx.events.length = 0;
    unmulNow(s.ctx);
    expect(texts(s.ctx)).toEqual(['You finish taking off your suit.']);
    expect(carrier(s.state, mail)).toBe(s.state.playerId);
  });

  test('the thief walks away meanwhile: nothing is taken', () => {
    const s = bare();
    const mail = s.carry('nh:ring_mail');
    s.state.entities[String(mail)]!.c.item!.equipped = 'body';
    const ny = mon(s.state, 'nh:water_nymph');
    hit(s, ny.id);
    ny.c.pos!.x = 7;
    s.ctx.events.length = 0;
    unmulNow(s.ctx);
    expect(keys(s.ctx)).toEqual(['eat.can_move_again']);
    expect(carrier(s.state, mail)).toBe(s.state.playerId);
  });

  test('a paralyzed hero cannot be charmed: she takes the cloak off herself', () => {
    const s = bare();
    const cloak = s.carry('nh:orcish_cloak');
    s.state.entities[String(cloak)]!.c.item!.equipped = 'cloak';
    getPlayer(s.state).c.helpless = { until: s.state.turn + 10, reasonKey: 'helpless.paralyzed' };
    const ny = mon(s.state, 'nh:water_nymph');
    const mhm = hit(s, ny.id);
    expect(texts(s.ctx)).toEqual([
      'The water nymph takes off your coarse mantelet.',
      'She stole a coarse mantelet.',
    ]);
    expect(carrier(s.state, cloak)).toBe(ny.id);
    expect(mhm.done).toBe(false); // she is helpless: the nymph stays for more
  });

  test('worn things weigh 5, the rest 1; a worn suit under a cloak is not picked', () => {
    let cloaks = 0;
    let daggers = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = bare(seed);
      const cloak = s.carry('nh:orcish_cloak');
      const mail = s.carry('nh:ring_mail');
      const dagger = s.carry('nh:dagger');
      s.state.entities[String(cloak)]!.c.item!.equipped = 'cloak';
      s.state.entities[String(mail)]!.c.item!.equipped = 'body';
      const ny = mon(s.state, 'nh:water_nymph');
      hit(s, ny.id);
      expect(carrier(s.state, mail)).toBe(s.state.playerId);
      if (carrier(s.state, cloak) === ny.id) cloaks++;
      if (carrier(s.state, dagger) === ny.id) daggers++;
    }
    expect(cloaks + daggers).toBe(60);
    expect(cloaks).toBeGreaterThan(daggers * 2);
  });

  test('a cancelled nymph: "The plain water nymph tries to charm you ..."', () => {
    const s = bare();
    s.carry('nh:dagger');
    const ny = mon(s.state, 'nh:water_nymph');
    setCancelled(s.ctx, ny.id);
    hit(s, ny.id);
    expect(texts(s.ctx)[0]).toBe(
      'The plain water nymph tries to charm you, but you seem unaffected.',
    );
    expect(inventoryOf(s.state, ny.id)).toEqual([]);
  });

  test('nothing to steal: gold only, or nothing at all', () => {
    const s = bare();
    const ny = mon(s.state, 'nh:water_nymph');
    hit(s, ny.id);
    expect(texts(s.ctx)[0]).toBe(
      'The water nymph tries to rob you, but there is nothing to steal!',
    );
    const t = bare();
    t.carry('nh:gold_piece', { quantity: 5 });
    const ny2 = mon(t.state, 'nh:water_nymph');
    hit(t, ny2.id);
    expect(texts(t.ctx)[0]).toBe("The water nymph tries to rob you, but isn't interested in gold.");
  });

  test('a nymph theft gives no hit message; a monkey gets one', () => {
    expect(hitmsgFor(SITM, false)).toBe(false);
    expect(hitmsgFor(SEDU, false)).toBe(false);
    expect(hitmsgFor(MONKEY_SITM, true)).toBe(true);
    expect(hitmsgFor(SGLD, false)).toBe(true);
    expect(hitmsgFor(atk('claw', 'ssex'), false)).toBe(false);
  });

  test('could_seduce(): a nymph and the (female) hero, "engagingly"; male monsters 1', () => {
    const s = bare();
    const ny = mon(s.state, 'nh:water_nymph');
    const jackal = mon(s.state, 'nh:jackal', 5, 4);
    const monkey = mon(s.state, 'nh:monkey', 6, 4);
    expect(couldSeduce(s.ctx, ny, getPlayer(s.state), SITM)).toBe(2);
    expect(couldSeduce(s.ctx, ny, jackal, SEDU)).toBe(1);
    expect(couldSeduce(s.ctx, ny, jackal, atk('claw', 'phys'))).toBe(0);
    expect(couldSeduce(s.ctx, monkey, jackal, MONKEY_SITM)).toBe(0);
  });
});

describe('in play', () => {
  test('a nymph next to her steals within a few turns, with no hit message', () => {
    let stolen = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = bare(seed);
      const dagger = s.carry('nh:dagger');
      const ny = mon(s.state, 'nh:water_nymph');
      for (let t = 0; t < 8 && carrier(s.state, dagger) === s.state.playerId; t++) {
        const r = s.step({ type: 'wait' });
        expect(s.msgKeys(r)).not.toContain('combat.mon_hits');
      }
      if (carrier(s.state, dagger) === ny.id) stolen++;
    }
    expect(stolen).toBeGreaterThan(2);
  });

  test('a leprechaun hits ("The leprechaun hits!") and her purse feels lighter', () => {
    let robbed = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = bare(seed);
      s.carry('nh:gold_piece', { quantity: 80 });
      mon(s.state, 'nh:leprechaun');
      for (let t = 0; t < 8; t++) {
        const k = s.msgKeys(s.step({ type: 'wait' }));
        const i = k.indexOf('steal.purse_lighter');
        if (i < 0) continue;
        expect(k[i - 1]).toBe('combat.mon_hits');
        robbed++;
        break;
      }
    }
    expect(robbed).toBeGreaterThan(2);
  });
});

describe('monkeys (AD_SITM, animal)', () => {
  test('one item, no teleport: "The monkey tries to run away with your dagger."', () => {
    const s = bare();
    const dagger = s.carry('nh:dagger');
    const mk = mon(s.state, 'nh:monkey');
    hit(s, mk.id, MONKEY_SITM);
    expect(texts(s.ctx)).toEqual([
      'The monkey stole a dagger.',
      'The monkey tries to run away with your dagger.',
    ]);
    expect(carrier(s.state, dagger)).toBe(mk.id);
    expect(posKey(s.state, mk.id)).toBe('3,2');
    expect(isFleeing(s.ctx, mk.id)).toBe(true);
  });

  test('it cannot take a cursed worn item: "... but gives up."', () => {
    const s = bare();
    const cloak = s.carry('nh:orcish_cloak');
    const c = s.state.entities[String(cloak)]!.c.item!;
    c.equipped = 'cloak';
    c.buc = 'cursed';
    const mk = mon(s.state, 'nh:monkey');
    hit(s, mk.id, MONKEY_SITM);
    expect(texts(s.ctx)[0]).toMatch(
      /^The monkey tries to (steal|snatch|grab|take) your cloak but gives up\.$/,
    );
    expect(carrier(s.state, cloak)).toBe(s.state.playerId);
  });
});

describe('monsters robbing monsters', () => {
  test('a nymph steals the newest item of a monster and vanishes', () => {
    const s = bare();
    const ny = mon(s.state, 'nh:water_nymph', 5, 4);
    const kob = mon(s.state, 'nh:kobold', 6, 4);
    const dagger = s.give('nh:dagger', { carriedBy: kob.id });
    const mhm = hit(s, ny.id, SITM, kob.id);
    expect(texts(s.ctx)[0]).toBe('The water nymph steals a dagger from the kobold!');
    expect(carrier(s.state, dagger)).toBe(ny.id);
    expect(mhm.hitflags).toBe(M_ATTK.AGR_DONE);
    expect(posKey(s.state, ny.id)).not.toBe('5,4');
  });

  test("a leprechaun takes a monster's gold", () => {
    const s = bare();
    const lep = mon(s.state, 'nh:leprechaun', 5, 4);
    const kob = mon(s.state, 'nh:kobold', 6, 4);
    s.give('nh:gold_piece', { quantity: 12, carriedBy: kob.id });
    hit(s, lep.id, SGLD, kob.id);
    expect(texts(s.ctx)[0]).toBe('The leprechaun steals some gold from the kobold.');
    expect(moneyCnt(s.ctx, lep.id)).toBe(12);
  });

  test('a nymph smiles at its victim (or pretends to be friendly when it misses)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = bare(seed);
      const ny = mon(s.state, 'nh:water_nymph', 5, 4);
      const jackal = mon(s.state, 'nh:jackal', 6, 4);
      mattackm(s.ctx, ny.id, jackal.id);
      const k = keys(s.ctx);
      expect(k).not.toContain('mhitm.hits');
      expect(k).not.toContain('mhitm.misses');
      seen += k.filter((x) => x === 'mhitm.smiles_at' || x === 'mhitm.pretends_friendly').length;
    }
    expect(seen).toBeGreaterThan(5);
  });
});

describe('generation and talk', () => {
  test('a leprechaun is made asleep with d(depth, 30) gold; nymphs mostly asleep', () => {
    let asleep = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = bare(seed);
      const id = makemon(s.ctx, defs.monster('nh:leprechaun' as never), { x: 6, y: 4 })!;
      const e = s.state.entities[String(id)]!;
      expect(e.c.monster!.asleep).toBe(true);
      const g = moneyCnt(s.ctx, id);
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(30);
      const n = makemon(s.ctx, defs.monster('nh:wood_nymph' as never), { x: 7, y: 4 })!;
      if (s.state.entities[String(n)]!.c.monster!.asleep) asleep++;
    }
    expect(asleep).toBeGreaterThan(10);
    expect(asleep).toBeLessThan(20);
  });

  test('#chat: a nymph cajoles her, a leprechaun laughs', () => {
    const s = bare();
    const ny = mon(s.state, 'nh:mountain_nymph');
    domonnoise(s.ctx, ny.id);
    expect(texts(s.ctx)).toEqual(['The mountain nymph cajoles you.']);
    const t = bare();
    const lep = mon(t.state, 'nh:leprechaun');
    domonnoise(t.ctx, lep.id);
    expect(texts(t.ctx)[0]).toMatch(/^The leprechaun (giggles|chuckles|snickers|laughs)\.$/);
  });
});
