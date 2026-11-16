// m19 step 8: towels and slippery fingers. Glib drops her rings and weapon each turn and runs
// out; its sources (cursed oil, a cursed towel, a greasy tin) and cures (a towel, washing her
// hands, gloves coming off); its gates (gloves, rings under gloves, tins, markers); applying a
// towel (hands, the cream on her face, the cursed outcomes over many seeds), wearing one, wet
// towels (water, drying when used, thrown or burnt, the lash), the engraving wipe, the vapors a
// worn wet towel keeps off. Random outcomes are asserted over many seeds, never a lucky one.
// ref: src/apply.c use_towel(); src/do_wear.c glibr(), Blindf_on(); src/weapon.c wet_a_towel(),
// dry_a_towel(); src/uhitm.c hmon_hitmon_misc_obj(); src/engrave.c doengrave_sfx_item()
import {
  buildSnapshot,
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { setUcreamed, ucreamed } from '../src/creamed';
import { armorOff } from '../src/dowear';
import { engrAt, makeEngrAt } from '../src/engr';
import { enlightenment } from '../src/enlightenment';
import { washHands } from '../src/fountain';
import { glibTimeout, isGlib, makeGlib } from '../src/glib';
import { discover } from '../src/o_init';
import { potionbreathe } from '../src/potionhit';
import { P, hasProp, makeBlinded } from '../src/props';
import { startTin } from '../src/tin';
import { potionDip } from '../src/dip';
import { waterDamage } from '../src/water';
import { addMon } from './helpers';
import { itemOf, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'tw',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'tw:run',
      labelKey: 'tw',
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
const defs = eng.registry;
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` as an action that takes no time; its messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(state, { type: 'mod', action: 'tw:run' as DefId }).events);
}

type S = ReturnType<typeof levelSetup>;
/** A lit room with the hero, no monsters and nothing in her pack. */
function make(seed = 1): S {
  const s = levelSetup(['.........', '....@....', '.........'], seed);
  for (const k of Object.keys(s.state.entities)) {
    const e = s.state.entities[k];
    if (e?.c.monster) delete s.state.entities[k];
  }
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  return s;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)];
function carry(
  s: S,
  id: string,
  o: { spe?: number; buc?: 'blessed' | 'cursed'; quantity?: number; equipped?: string } = {},
): EntityId {
  const e = s.carry(id);
  const it = itemOf(s.state, e);
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  if (o.quantity !== undefined) it.quantity = o.quantity;
  if (o.equipped !== undefined) it.equipped = o.equipped as never;
  return e;
}
const answer = (s: S, value: unknown) =>
  s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never });
const onFloor = (s: S, id: EntityId): boolean =>
  ent(s, id)?.c.item?.carriedBy === null && ent(s, id)?.c.pos?.x === s.here.x;
const glib = (s: S, turns: number) => run(s.state, (ctx) => makeGlib(ctx, turns));
const blind = (s: S): boolean => hasProp(getPlayer(s.state), P.BLINDED);
const applyT = (s: S, towel: EntityId) => s.text(s.mod('nh:apply', { item: towel }));

describe('the offers', () => {
  test('a towel: "Clean yourself off", Put on, "Wipe the floor"', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    const offers = eng.query(s.state).actionsFor({ kind: 'item', id: towel });
    const label = (a: string) =>
      offers.find((o) => o.action.type === 'mod' && o.action.action === a)?.labelKey;
    expect(label('nh:apply')).toBe('action.nh:apply.towel');
    expect(label('nh:puton')).toBe('action.nh:puton');
    expect(label('nh:engrave_with')).toBe('action.nh:engrave_with.towel');
  });

  test('the Slippery status condition and the enlightenment line', () => {
    const s = make();
    expect(buildSnapshot(defs, s.state).status['glib']).toBeUndefined();
    glib(s, 10);
    expect(buildSnapshot(defs, s.state).status['glib']).toBe(1);
    const lines: string[] = [];
    run(s.state, (ctx) => {
      for (const m of enlightenment(ctx)) lines.push(render(m));
    });
    expect(lines).toContain('You have slippery fingers.');
  });
});

describe('slippery fingers each turn (glibr)', () => {
  test('the wielded weapon slips and is dropped; it runs out silently', () => {
    const s = make();
    const dagger = carry(s, 'nh:dagger', { equipped: 'weapon' });
    glib(s, 3);
    expect(s.text(s.step({ type: 'wait' }))).toEqual(['Your dagger slips from your hand.']);
    expect(onFloor(s, dagger)).toBe(true);
    expect(itemOf(s.state, dagger).equipped).toBeNull();
    for (let i = 0; i < 3; i++) expect(s.text(s.step({ type: 'wait' }))).toEqual([]);
    expect(isGlib(s.state)).toBe(false);
  });

  test('a two-hander slips from her hands; several daggers slip; a welded one stays', () => {
    const s = make();
    const sword = carry(s, 'nh:two_handed_sword', { equipped: 'weapon' });
    glib(s, 5);
    expect(s.text(s.step({ type: 'wait' }))).toEqual(['Your sword slips from your hands.']);
    expect(onFloor(s, sword)).toBe(true);
    carry(s, 'nh:dagger', { equipped: 'weapon', quantity: 3 });
    // "Your daggers slip from your hand." (the test renderer has no makeplural())
    expect(s.msgKeys(s.step({ type: 'wait' }))).toEqual(['glib.wep_slip_pl']);
    const cursed = carry(s, 'nh:mace', { equipped: 'weapon', buc: 'cursed' });
    expect(s.text(s.step({ type: 'wait' }))).toEqual([]);
    expect(itemOf(s.state, cursed).equipped).toBe('weapon');
    expect(itemOf(s.state, cursed).known.buc).toBe(true);
  });

  test('uncursed rings slip off bare fingers, then the weapon "also"; gloves keep them on', () => {
    const s = make();
    const left = carry(s, 'nh:ring_of_regeneration', { equipped: 'ringL' });
    const right = carry(s, 'nh:ring_of_searching', { equipped: 'ringR' });
    carry(s, 'nh:dagger', { equipped: 'weapon' });
    glib(s, 5);
    expect(s.text(s.step({ type: 'wait' }))).toEqual([
      'Your rings slip off your fingers.',
      'Your dagger also slips from your hand.',
    ]);
    expect(onFloor(s, left) && onFloor(s, right)).toBe(true);

    const s2 = make();
    carry(s2, 'nh:ring_of_regeneration', { equipped: 'ringL', buc: 'cursed' });
    const r2 = carry(s2, 'nh:ring_of_searching', { equipped: 'ringR' });
    glib(s2, 5);
    expect(s2.text(s2.step({ type: 'wait' }))).toEqual(['Your ring slips off your finger.']);
    expect(onFloor(s2, r2)).toBe(true);
    expect(inventoryOf(s2.state, s2.state.playerId)).toHaveLength(1); // the cursed one stays

    const s3 = make();
    carry(s3, 'nh:leather_gloves', { equipped: 'gloves' });
    const r3 = carry(s3, 'nh:ring_of_searching', { equipped: 'ringR' });
    glib(s3, 5);
    expect(s3.text(s3.step({ type: 'wait' }))).toEqual([]);
    expect(itemOf(s3.state, r3).equipped).toBe('ringR');
  });
});

describe('what Glib keeps her from doing, and what cures it', () => {
  test('slippery gloves: no taking them off, no rings on or off; no gloves on slippery fingers', () => {
    const s = make();
    const gloves = carry(s, 'nh:leather_gloves', { equipped: 'gloves' });
    const ring = carry(s, 'nh:ring_of_searching', { equipped: 'ringL' });
    const ring2 = carry(s, 'nh:ring_of_regeneration');
    glib(s, 20);
    expect(s.text(s.mod('nh:takeoff', { item: gloves }))).toEqual([
      'Your gloves are too slippery to take off.',
    ]);
    expect(s.text(s.mod('nh:remove', { item: ring }))).toEqual([
      'You cannot take off your slippery gloves to remove the ring.',
    ]);
    const turn = s.state.turn;
    expect(s.text(s.mod('nh:puton', { item: ring2 }))).toEqual([
      'Your gloves are too slippery to remove, so you cannot put on the ring.',
    ]);
    expect(s.state.turn).toBe(turn + 1); // always uses the move
    // gloves coming off anyway take the slipperiness with them
    run(s.state, (ctx) => {
      itemOf(ctx.state, gloves).equipped = null;
      armorOff(ctx, ent(s, gloves)!, 'gloves');
    });
    expect(isGlib(s.state)).toBe(false);
    glib(s, 20);
    const offers = eng.query(s.state).actionsFor({ kind: 'item', id: gloves });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:wear')).toBe(
      false,
    );
    expect(s.text(s.mod('nh:wear', { item: gloves }))).toEqual([
      'Your fingers are too slippery to pull on gloves.',
    ]);
  });

  test('a tin slips from her fingers (one of a stack); a marker slips and is dropped', () => {
    const s = make();
    const tins = carry(s, 'nh:tin', { quantity: 2 });
    glib(s, 20);
    expect(run(s.state, (ctx) => startTin(ctx, ent(s, tins)!))).toEqual([
      'It is not so easy to open this tin.',
      'The tin slips from your fingers.',
    ]);
    expect(itemOf(s.state, tins).quantity).toBe(1);
    expect(s.state.occupation).toBeNull();
    const pen = carry(s, 'nh:magic_marker', { spe: 50 });
    expect(s.text(s.mod('nh:apply', { item: pen }))).toEqual([
      'The magic marker slips from your fingers.',
    ]);
    expect(onFloor(s, pen)).toBe(true);
  });

  test('a cursed oil lamp may spill over her fingers (or gloves): 2..20 more turns', () => {
    let spills = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const s = make(seed);
      if (seed % 2) carry(s, 'nh:leather_gloves', { equipped: 'gloves' });
      const lamp = carry(s, 'nh:oil_lamp', { buc: 'cursed' });
      itemOf(s.state, lamp).age = 1500;
      const t = s.text(s.mod('nh:apply', { item: lamp }));
      if (!t[0]?.startsWith('The lamp spills')) {
        expect(isGlib(s.state)).toBe(false);
        continue;
      }
      spills++;
      const gloves = seed % 2 === 1;
      expect(t[0]).toBe(
        `The lamp spills and covers your ${gloves ? 'gloves' : 'fingers'} with oil.`,
      );
      expect(glibTimeout(s.state)).toBeGreaterThanOrEqual(1);
      expect(glibTimeout(s.state)).toBeLessThanOrEqual(20);
    }
    expect(spills).toBeGreaterThan(4); // 1 in 6
  });

  test('washing her hands cures it ("greased" for the fountain), gloved or not', () => {
    const s = make();
    glib(s, 20);
    let res = '';
    expect(
      run(s.state, (ctx) => {
        res = washHands(ctx);
      }),
    ).toEqual(['You wash your hands in the water.', 'Your fingers are no longer slippery.']);
    expect(res).toBe('greased');
    expect(isGlib(s.state)).toBe(false);
    run(s.state, (ctx) => {
      res = washHands(ctx);
    });
    expect(res).toBe('nothing');
    const g = carry(s, 'nh:gauntlets_of_power', { equipped: 'gloves' });
    run(s.state, (ctx) => discover(ctx, ctx.defs.object(ent(s, g)!.def)));
    glib(s, 20);
    expect(run(s.state, (ctx) => void washHands(ctx))[1]).toBe(
      'Your gauntlets are no longer slippery.',
    );
  });
});

describe('applying a towel', () => {
  test('clean hands and face: "already clean", no time', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    const turn = s.state.turn;
    expect(applyT(s, towel)).toEqual(['Your face and hands are already clean.']);
    expect(s.state.turn).toBe(turn);
  });

  test('it wipes slippery hands (or gloves) first, then the cream off her face', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    glib(s, 20);
    run(s.state, (ctx) => {
      setUcreamed(ctx.state, 10);
      makeBlinded(ctx, 10, false);
    });
    const turn = s.state.turn;
    expect(applyT(s, towel)).toEqual(['You wipe off your hands.']);
    expect(s.state.turn).toBe(turn + 1);
    expect(isGlib(s.state)).toBe(false);
    expect(applyT(s, towel)).toEqual(["You've got the glop off.", 'You can see again.']);
    expect(ucreamed(s.state)).toBe(0);
    expect(blind(s)).toBe(false);
    carry(s, 'nh:leather_gloves', { equipped: 'gloves' });
    glib(s, 20);
    expect(applyT(s, towel)).toEqual(['You wipe off your gloves.']);
  });

  test('cream under a longer blindness: "Your face feels clean now."', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    run(s.state, (ctx) => {
      setUcreamed(ctx.state, 5);
      makeBlinded(ctx, 30, false);
    });
    expect(applyT(s, towel)).toEqual(['Your face feels clean now.']);
    expect(blind(s)).toBe(true);
    expect(ucreamed(s.state)).toBe(0);
  });

  test('no free hand, or wearing it: refused at no cost', () => {
    const s = make();
    const towel = carry(s, 'nh:towel', { equipped: 'blindfold' });
    expect(applyT(s, towel)).toEqual(["You cannot use it while you're wearing it!"]);
    const s2 = make();
    carry(s2, 'nh:two_handed_sword', { equipped: 'weapon', buc: 'cursed' });
    const t2 = carry(s2, 'nh:towel');
    expect(applyT(s2, t2)).toEqual(['You have no free hand!']);
  });

  test('a cursed towel: greasy hands, gunk on her face, or no harm, about a third each', () => {
    const seen = { slimy: 0, gunk: 0, clean: 0 };
    for (let seed = 1; seed <= 90; seed++) {
      const s = make(seed);
      const towel = carry(s, 'nh:towel', { buc: 'cursed' });
      const t = applyT(s, towel);
      if (t[0] === 'Your hands get slimy!') {
        seen.slimy++;
        // the move ends with 3..12 turns of Glib (one of them already gone)
        expect(glibTimeout(s.state)).toBeGreaterThanOrEqual(2);
        expect(glibTimeout(s.state)).toBeLessThanOrEqual(11);
      } else if (t[0] === 'Yecch!  Your face now has gunk on it!') {
        seen.gunk++;
        expect(t[1]).toBe('A cloud of darkness falls upon you.');
        expect(blind(s)).toBe(true);
        expect(ucreamed(s.state)).toBeGreaterThan(0);
      } else {
        expect(t).toEqual(['Your face and hands are already clean.']);
        seen.clean++;
      }
    }
    for (const n of Object.values(seen)) expect(n).toBeGreaterThan(15);
  });

  test('a cursed towel pushes her blindfold off (dropped), or a cursed one crooked', () => {
    let off = 0;
    let crooked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const bbuc of ['uncursed', 'cursed'] as const) {
        const s = make(seed);
        const towel = carry(s, 'nh:towel', { buc: 'cursed' });
        const bf = carry(s, 'nh:blindfold');
        s.mod('nh:puton', { item: bf });
        itemOf(s.state, bf).buc = bbuc;
        const t = applyT(s, towel);
        if (t[0] === 'You push your blindfold off.') {
          off++;
          expect(onFloor(s, bf)).toBe(true);
          expect(t).toContain('You can see again.');
        } else if (/^You push your blindfold (cock-eyed|crooked)\.$/.test(t[0] ?? '')) {
          crooked++;
          expect(bbuc).toBe('cursed');
          expect(itemOf(s.state, bf).equipped).toBe('blindfold');
        }
      }
    }
    expect(off).toBeGreaterThan(5);
    expect(crooked).toBeGreaterThan(5);
  });
});

describe('wearing a towel', () => {
  test('"around your head": it blinds her and covers her face', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    const bf = carry(s, 'nh:blindfold');
    expect(s.text(s.mod('nh:puton', { item: towel }))).toEqual([
      'You are now wearing a towel around your head.',
      "You can't see any more.",
    ]);
    expect(blind(s)).toBe(true);
    expect(s.text(s.mod('nh:puton', { item: bf }))).toEqual([
      'Your face is already covered by a towel.',
    ]);
    expect(applyT(s, bf)).toEqual(['You are already covered by a towel.']);
    s.mod('nh:remove', { item: towel });
    expect(blind(s)).toBe(false);
  });

  test('a worn wet towel keeps potion vapors off; a dry one does not', () => {
    const s = make();
    const towel = carry(s, 'nh:towel', { equipped: 'blindfold', spe: 3 });
    const pot = carry(s, 'nh:potion_of_sleeping');
    expect(run(s.state, (ctx) => potionbreathe(ctx, ent(s, pot)!))).toEqual([
      'Some vapor passes harmlessly around you.',
    ]);
    expect(getPlayer(s.state).c.helpless).toBeUndefined();
    itemOf(s.state, towel).spe = 0;
    expect(run(s.state, (ctx) => potionbreathe(ctx, ent(s, pot)!))).not.toContain(
      'Some vapor passes harmlessly around you.',
    );
    expect(getPlayer(s.state).c.helpless).toBeDefined();
  });
});

describe('wet towels', () => {
  test('water wets a towel (1..7), wetter each time, never past 7', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const towel = carry(s, 'nh:towel');
      const t = run(s.state, (ctx) => void waterDamage(ctx, ent(s, towel)!, null, true));
      const spe = itemOf(s.state, towel).spe;
      expect(spe).toBeGreaterThanOrEqual(1);
      expect(spe).toBeLessThanOrEqual(7);
      expect(t).toEqual([`Your towel gets ${spe < 3 ? 'damp' : 'wet'}.`]);
      const t2 = run(s.state, (ctx) => void waterDamage(ctx, ent(s, towel)!, null, true));
      if (spe < 7) {
        expect(itemOf(s.state, towel).spe).toBeGreaterThan(spe);
        expect(t2[0]).toMatch(/^Your (moist|wet) towel gets (damper|wetter)\.$/);
      } else expect(itemOf(s.state, towel).spe).toBe(7);
    }
  });

  test('dipped into water it soaks it up', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    const water = carry(s, 'nh:potion_of_water');
    const t = run(s.state, (ctx) => void potionDip(ctx, ent(s, towel)!, ent(s, water)!));
    expect(t).toContain('The towel soaks it up!');
    expect(itemOf(s.state, towel).spe).toBeGreaterThan(0);
    expect(ent(s, water)).toBeUndefined();
  });

  test('using it dries it (said when wielded); throwing it dries it quietly', () => {
    const s = make();
    const towel = carry(s, 'nh:towel', { spe: 3, equipped: 'weapon' });
    glib(s, 20);
    expect(applyT(s, towel)).toEqual(['You wipe off your hands.', 'Your wet towel dries.']);
    expect(itemOf(s.state, towel).spe).toBe(2);
    itemOf(s.state, towel).equipped = null;
    glib(s, 20);
    expect(applyT(s, towel)).toEqual(['You wipe off your hands.']);
    expect(itemOf(s.state, towel).spe).toBe(1);
    s.mod('nh:throw', { item: towel });
    answer(s, 'e');
    expect(itemOf(s.state, towel).spe).toBe(0);
  });

  test('a wielded wet towel lashes (damage by wetness) and dries as it hits', () => {
    const s = make(3);
    const towel = carry(s, 'nh:towel', { spe: 7, equipped: 'weapon' });
    const jackal = addMon(s.state, 'nh:jackal', s.here.x + 1, s.here.y);
    ent(s, jackal)!.c.actor!.speed = 0;
    ent(s, jackal)!.c.hp = { cur: 1000, max: 1000 };
    let lashes = 0;
    for (let i = 0; i < 60 && itemOf(s.state, towel).spe > 0; i++) {
      const before = ent(s, jackal)!.c.hp!.cur;
      const spe = itemOf(s.state, towel).spe;
      const t = s.text(s.step({ type: 'move', dir: 'e' }));
      if (!t.some((l) => /^You lash the jackal[.!]$/.test(l))) continue;
      lashes++;
      const dmg = before - ent(s, jackal)!.c.hp!.cur;
      expect(dmg).toBeGreaterThanOrEqual(1);
      expect(dmg).toBeLessThanOrEqual(1 + spe + 6); // rnd(1 + spe) plus the Str bonus
    }
    expect(lashes).toBeGreaterThan(0);
    expect(itemOf(s.state, towel).spe).toBeLessThan(7);
  });
});

describe('wiping an engraving', () => {
  const here = (s: S) => engrAt(s.ctx, s.state.levels['dlvl1']!, s.here.x, s.here.y);
  const engr = (s: S, type: 'dust' | 'burn' | 'mark') =>
    run(s.state, (ctx) => {
      makeEngrAt(ctx, ctx.state.levels['dlvl1']!, s.here.x, s.here.y, 'Elbereth', null, 1, type);
    });

  test('dust and graffiti are wiped (a wet towel dries); a burned one is not', () => {
    for (const type of ['dust', 'mark'] as const) {
      const s = make();
      const towel = carry(s, 'nh:towel', { spe: 2 });
      engr(s, type);
      const turn = s.state.turn;
      expect(s.text(s.mod('nh:engrave_with', { item: towel }))).toEqual([
        'Your moist towel dries.',
        'You wipe out the message here.',
      ]);
      expect(here(s)).toBeNull();
      expect(s.state.turn).toBe(turn + 1);
      expect(itemOf(s.state, towel).spe).toBe(1);
    }
    const s = make();
    const towel = carry(s, 'nh:towel');
    engr(s, 'burn');
    expect(s.text(s.mod('nh:engrave_with', { item: towel }))).toEqual([
      "Your towel can't wipe out this engraving.",
    ]);
    expect(here(s)).not.toBeNull();
  });

  test('nothing to wipe: "Your towel gets dusty."', () => {
    const s = make();
    const towel = carry(s, 'nh:towel');
    expect(s.text(s.mod('nh:engrave_with', { item: towel }))).toEqual(['Your towel gets dusty.']);
  });

  test('sitting on a towel', () => {
    const s = make();
    s.floor('nh:towel');
    expect(s.text(s.mod('nh:sit'))).toEqual(["It's probably not a good time for a picnic..."]);
  });
});
