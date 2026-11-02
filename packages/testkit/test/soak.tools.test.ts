// The soak bot with wands, a ring and a key in the kit and a locked box under the hero, so it
// zaps, loots, unlocks and puts on rings without waiting for lucky finds.
import { BOX, KEY, WAN, vanillaMod } from '@nh/content';
import {
  getPlayer,
  inventoryOf,
  putIn,
  type Ctx,
  type DefId,
  type EntityId,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const toolsKitMod: Mod = {
  id: 'testkit-tools-kit',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    const make = (ctx: Ctx, def: string, spe: number): EntityId => {
      const id = ctx.state.nextEntityId++;
      ctx.state.entities[String(id)] = {
        id,
        def: def as DefId,
        c: {
          item: {
            quantity: 1,
            buc: 'uncursed',
            spe,
            known: { buc: true, spe: true },
            carriedBy: null,
            letter: null,
            equipped: null,
            placed: ctx.state.seq++,
            age: 1,
          },
        },
      };
      return id;
    };
    api.on(
      'newGame',
      (ctx, heroId) => {
        const used = new Set(inventoryOf(ctx.state, heroId).map((e) => e.c.item?.letter));
        const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
          .split('')
          .filter((l) => !used.has(l));
        for (const [def, spe] of [
          [WAN.striking, 8],
          [WAN.sleep, 8],
          [KEY.skeleton, 0],
          ['nh:ring_of_protection', 2],
        ] as const) {
          const it = ctx.state.entities[String(make(ctx, def, spe))]!.c.item!;
          it.carriedBy = heroId;
          it.letter = letters.shift() ?? null;
        }
      },
      { priority: -100 },
    );
    // the hero is placed after the newGame hooks: drop the box on her first arrival
    api.on('levelChange', (ctx, change) => {
      if (change.from !== null) return;
      const p = getPlayer(ctx.state).c.pos!;
      const box = make(ctx, BOX.large, 0);
      ctx.state.entities[String(box)]!.c.pos = { ...p };
      ctx.state.entities[String(box)]!.c.item!.locked = true;
      putIn(ctx.defs, ctx.state, box, make(ctx, 'nh:apple', 0));
    });
  },
};

describe('tools soak', () => {
  const totals = { zapped: 0, looted: 0, putOn: 0 };
  for (const seed of [201, 202, 203]) {
    test(
      `seed ${seed}: 1000 turns with wands, a ring, a key and a locked box`,
      { timeout: 60000 },
      () => {
        const r = soak([vanillaMod, toolsKitMod], { seed, turns: 1000, checkEvery: 5 });
        console.log(
          `tools soak seed=${seed}: zapped=${r.zapped} looted=${r.looted} putOn=${r.putOn} turns=${r.turns} outcome=${r.outcome}`,
        );
        expect(r.violations).toBeNull();
        totals.zapped += r.zapped;
        totals.looted += r.looted;
        totals.putOn += r.putOn;
      },
    );
  }
  test('across the seeds the bot zapped, looted and put on a ring', () => {
    expect(totals.zapped).toBeGreaterThan(0);
    expect(totals.looted).toBeGreaterThan(0);
    expect(totals.putOn).toBeGreaterThan(0);
  });
});
