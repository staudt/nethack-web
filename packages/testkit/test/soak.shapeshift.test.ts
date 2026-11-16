// The soak bot among shapeshifters: every few turns a vampire, vampire lord, chameleon or
// doppelganger is made near the hero while fewer than four shapeshifters live on her level, so the
// invariants are checked while they change form on their own, shift back when hurt, rise again
// when killed in another form, slip under doors as fog and follow her between levels. Every turn
// each `cham` entry (a shapeshifter's true kind) must name a living monster and a shapeshifter
// kind.
import { chamOf, makemon, vanillaMod } from '@nh/content';
import { cellRules, getLevel, getPlayer, sortedIds, type Mod, type Pos } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const KINDS = ['nh:vampire', 'nh:chameleon', 'nh:vampire_lord', 'nh:chameleon', 'nh:doppelganger'];

let made = 0;
let shifts = 0;
let chamErrors: string[] = [];
let lastForm: Record<string, string> = {};
const shapeshiftMod: Mod = {
  id: 'testkit-shapeshift',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // a sturdy hero, so the run outlives the shapeshifters
    api.on(
      'newGame',
      (ctx) => {
        const h = getPlayer(ctx.state);
        if (h.c.hp) h.c.hp = { cur: 3000, max: 3000 };
        // resistant to the instant deaths of the shapes they take (drain below level 1, stoning,
        // sliming, poison, disintegration)
        for (const prop of ['drain_res', 'stone_res', 'unchanging', 'poison_res', 'disint_res'])
          (h.c.props ??= {})[prop] = { intrinsic: true, timeout: 0 };
      },
      { priority: -100 },
    );
    // after the vanilla end of turn (its mstate cleanup drops the dead monsters' entries)
    api.on(
      'endOfTurn',
      (ctx) => {
        if (ctx.state.gameOver) return;
        const nh = ctx.state.modData['nh'] as Record<string, unknown> | undefined;
        const table = (nh?.['cham'] ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(table).sort()) {
          const mon = ctx.state.entities[key];
          const kind = table[key];
          if (!mon?.c.monster)
            chamErrors.push(`turn ${ctx.state.turn}: cham ${key} names no monster`);
          else if (
            typeof kind !== 'string' ||
            !ctx.defs.isMonster(kind as never) ||
            !ctx.defs.monster(kind as never).flags.includes('shapeshifter')
          )
            chamErrors.push(`turn ${ctx.state.turn}: cham ${key} is ${String(kind)}`);
        }
        // she is healed every turn: the run is about the shapeshifters, not her survival
        const h = getPlayer(ctx.state);
        if (h.c.hp) h.c.hp.cur = h.c.hp.max;
        const hp = h.c.pos;
        if (!hp) return;
        let here = 0;
        for (const id of sortedIds(ctx.state)) {
          const e = ctx.state.entities[String(id)];
          if (!e?.c.monster || chamOf(ctx, id) === null) continue;
          if (lastForm[String(id)] !== undefined && lastForm[String(id)] !== e.def) shifts++;
          lastForm[String(id)] = e.def;
          if (e.c.pos?.level === hp.level) here++;
        }
        if (ctx.state.turn % 6 !== 0 || here >= 4) return;
        // a free floor square two or three steps from her
        const level = getLevel(ctx.state, hp.level);
        const rules = cellRules(level, ctx.defs);
        let near: Pos | null = null;
        for (const [dx, dy] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
          [3, 1],
          [-3, -1],
          [1, 3],
          [-1, -3],
        ]) {
          const x = hp.x + (dx ?? 0);
          const y = hp.y + (dy ?? 0);
          if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
          if (!rules.passable[level.cells[y * level.width + x] ?? 0]) continue;
          near = { x, y };
          break;
        }
        if (!near) return;
        const kind = KINDS[made % KINDS.length] ?? 'nh:chameleon';
        if (makemon(ctx, ctx.defs.monster(kind as never), near, { adjacentOk: true }) !== null)
          made++;
      },
      { priority: -100 },
    );
  },
};

describe('shapeshifter soak', () => {
  // seeds whose runs reach turn 2000 (searched over 31..50 in m18 step 3: the others die, mostly
  // of rotten corpses the bot eats or of a doppelganger's nasty forms, despite the healing; 47
  // replaced 36 in m18 step 6, whose four Kop rows shift the random forms: 36 died at turn 1339
  // and reaches 2000 with the Kop rows filtered and the cream pie's prob 0, as 47 does with and
  // without them; 69 replaced 32 in m19 step 1, whose 17 object rows shift the stream: 32 died at
  // turn 387 and reaches 2000 with the rows filtered, as 47 and 69 do with and without them)
  for (const seed of [47, 69]) {
    test(
      `seed ${seed}: 2000 turns among vampires, chameleons and doppelgangers`,
      { timeout: 240000 },
      () => {
        made = 0;
        shifts = 0;
        chamErrors = [];
        lastForm = {};
        const r = soak([vanillaMod, shapeshiftMod], { seed, turns: 2000, checkEvery: 1 });
        console.log(
          `shapeshift soak seed=${seed}: made=${made} shifts=${shifts} kills=${r.kills} turns=${r.turns} outcome=${r.outcome}`,
        );
        expect(r.violations).toBeNull();
        expect(chamErrors).toEqual([]);
        expect(made).toBeGreaterThan(5);
        expect(shifts).toBeGreaterThan(20);
        expect(r.turns).toBeGreaterThanOrEqual(2000);
      },
    );
  }
});
