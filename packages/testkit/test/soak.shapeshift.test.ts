// The soak bot among shapeshifters: every few turns a vampire, vampire lord, chameleon or
// doppelganger is made near the hero while fewer than four shapeshifters live on her level, so the
// invariants are checked while they change form on their own, shift back when hurt, rise again
// when killed in another form, slip under doors as fog and follow her between levels. Every turn
// each `cham` entry (a shapeshifter's true kind) must name a living monster and a shapeshifter
// kind.
import { chamOf, makemon, vanillaMod } from '@nh/content';
import { cellRules, getLevel, getPlayer, sortedIds, type Mod, type Pos } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { noteWallwalkers, soak, wallwalkRecord } from '../src/index';

const KINDS = ['nh:vampire', 'nh:chameleon', 'nh:vampire_lord', 'nh:chameleon', 'nh:doppelganger'];

let made = 0;
let shifts = 0;
let chamErrors: string[] = [];
let lastForm: Record<string, string> = {};
// the wall-walker record, observed every turn: a step can span many turns while the hero is
// helpless (fainting), and a xorn-form chameleon that enters a wall or a fog cloud that flows
// under a door may change form there before the next check
let wallwalk = wallwalkRecord();
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
    api.on(
      'endOfTurn',
      (ctx) => {
        noteWallwalkers(ctx.state, ctx.defs, wallwalk);
      },
      { priority: -1000 },
    );
  },
};

describe('shapeshifter soak', () => {
  // seeds whose runs reach turn 2000 (searched over 31..50 in m18 step 3: the others die, mostly
  // of rotten corpses the bot eats or of a doppelganger's nasty forms, despite the healing; 47
  // replaced 36 in m18 step 6, whose four Kop rows shift the random forms: 36 died at turn 1339
  // and reaches 2000 with the Kop rows filtered and the cream pie's prob 0, as 47 does with and
  // without them; 69 replaced 32 in m19 step 1, whose 17 object rows shift the stream: 32 died at
  // turn 387 and reaches 2000 with the rows filtered, as 47 and 69 do with and without them; the m19 step 3 djinni row moved the random forms
  // again: 47 and 69 then hit the in-wall bug lead (newcham inside a wall), and both pass with the
  // row filtered; 74 and 156 reach 2000 turns both ways; that bug lead, and 88's and 90's (a
  // monster in a wall or a locked door) and 48's two objects on stone at m18 step 6, were the
  // invariant's: the hero fainted, so one step spanned dozens of turns in which a xorn-form
  // chameleon entered a wall, or an ochre jelly a door, and changed form there, which C's
  // newcham() allows (no relocation: maybe_set_terrain_effects() only handles liquids), and the
  // hero then killed the former xorn in the stone, its gold staying there as in C; the record is
  // now noted every turn below and keeps those cells for objects, and 47, 69 and 88 reach 2000;
  // m21 step 1's layout draws: 74 died at turn 77, of 157..170 only 157, 158 and 167 reach 2000
  // with them, and 157 and 156 do with and without them; 174 and 177 replaced 156 and 157 in m21
  // step 4, whose Croesus row shifts the random forms: 156 ended at turn 2011 with 19 shifts and
  // 157 died at turn 569, both reaching 2000 with the row filtered; of 158..188 only 174, 175,
  // 177 and 185 reach 2000 with the row, and 174 and 177 do with and without it; 190 replaced
  // 174 in m22 step 2, whose eight kit object rows shift the stream: 174 died at turn 786; of
  // 174..190 only 177, 183, 188 and 190 reach 2000 with the rows, and 190 does with and without;
  // 201 replaced 190 in m22 step 3, whose starting kit and pet rolls shift the stream: 190 died
  // at turn 532 with 18 shifts; of 191..204 only 200, 201 and 203 reach 2000 with it, and 201
  // does with and without it; 205 and 208 replaced 177 and 201 in m22 step 6, whose staggering
  // blow draws rnd(100) when the bare-handed Valkyrie (no suit, no shield) hits for more than 1:
  // 177 died at turn 229 and 201 at turn 1210, both reaching 2000 with the draw neutralised; of
  // 202..211 only 205, 206 and 208 reach 2000 with it, and 205 does with and without it; 214 and
  // 216 replaced 205 and 208 in m22 step 8, whose valkyrie row makes tt_doppel()'s valkyrie roll
  // a valkyrie form instead of no form: 205 died at turn 1032 and 208 at turn 1431, both reaching
  // 2000 with that roll neutralised; of 209..226 only 214, 216, 218, 220 and 222 reach 2000 with
  // it, and 214, 216 and 222 do with and without it)
  for (const seed of [214, 216]) {
    test(
      `seed ${seed}: 2000 turns among vampires, chameleons and doppelgangers`,
      { timeout: 240000 },
      () => {
        made = 0;
        shifts = 0;
        chamErrors = [];
        lastForm = {};
        wallwalk = wallwalkRecord();
        const r = soak([vanillaMod, shapeshiftMod], {
          seed,
          turns: 2000,
          checkEvery: 1,
          wallwalk,
        });
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
