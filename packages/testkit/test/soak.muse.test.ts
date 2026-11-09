// The soak bot among monsters that use items (m14): every few turns a hostile hill orc or gnome
// lord carrying one of a rotation of muse items (attack and escape wands, the potions it drinks
// or hurls, the scrolls it reads, a unicorn horn, a lizard corpse, a bullwhip, an amulet of life
// saving) is made near the hero while fewer than four such monsters live on her level. Besides
// the general invariants (every item in exactly one place: carried, on the floor or contained),
// each turn checks: no wand a monster carries has fewer than 0 charges, and every migrating
// monster (fled down or up the stairs, through a hole or a trap door) is off the map.
import { makemon, mksobj, vanillaMod } from '@nh/content';
import {
  cellRules,
  getLevel,
  getPlayer,
  sortedIds,
  type DefId,
  type EntityId,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

const ITEMS: readonly DefId[] = [
  'nh:wand_of_striking',
  'nh:potion_of_healing',
  'nh:wand_of_magic_missile',
  'nh:scroll_of_teleportation',
  'nh:potion_of_sleeping',
  'nh:wand_of_digging',
  'nh:potion_of_blindness',
  'nh:wand_of_fire',
  'nh:scroll_of_create_monster',
  'nh:potion_of_speed',
  'nh:wand_of_sleep',
  'nh:potion_of_extra_healing',
  'nh:potion_of_invisibility',
  'nh:unicorn_horn',
  'nh:potion_of_confusion',
  'nh:wand_of_teleportation',
  'nh:potion_of_gain_level',
  'nh:corpse',
  'nh:scroll_of_earth',
  'nh:bullwhip',
  'nh:amulet_of_life_saving',
  'nh:potion_of_acid',
  'nh:wand_of_create_monster',
  'nh:potion_of_paralysis',
];
const CARRIERS: readonly DefId[] = ['nh:hill_orc', 'nh:gnome_lord'];

let made = 0;
let used = 0;
const errors: string[] = [];
/** The items given, with their carrier and charges then. */
let given: { item: EntityId; mon: EntityId; spe: number }[] = [];

const museMod: Mod = {
  id: 'testkit-muse',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // a sturdy hero, so the run outlives the wands
    api.on(
      'newGame',
      (ctx) => {
        const h = getPlayer(ctx.state);
        if (h.c.hp) h.c.hp = { cur: 3000, max: 3000 };
      },
      { priority: -100 },
    );
    api.on('endOfTurn', (ctx) => {
      const st = ctx.state;
      // the invariants
      const migrating = (st.modData['nh'] as { migrating?: Record<string, string> } | undefined)
        ?.migrating;
      for (const k of Object.keys(migrating ?? {}).sort()) {
        const m = st.entities[k];
        if (m?.c.pos) errors.push(`turn ${st.turn}: migrating monster ${k} is on ${m.c.pos.level}`);
      }
      for (const id of sortedIds(st)) {
        const it = st.entities[String(id)]?.c.item;
        if (!it || it.carriedBy === null || it.carriedBy === st.playerId) continue;
        const e = st.entities[String(id)]!;
        if (ctx.defs.object(e.def).class === 'wand' && it.spe < 0)
          errors.push(`turn ${st.turn}: ${e.def} ${id} carried by ${it.carriedBy} has ${it.spe}`);
      }
      // what has been used: a given item gone (drunk, read, eaten) while its carrier lives, or a
      // wand with fewer charges
      given = given.filter((g) => {
        const o = st.entities[String(g.item)];
        if (!st.entities[String(g.mon)]) return false;
        if (!o) {
          used++;
          return false;
        }
        if ((o.c.item?.spe ?? 0) < g.spe) {
          used++;
          return false;
        }
        return true;
      });
      if (st.turn % 4 !== 0 || st.gameOver) return;
      const hp = getPlayer(st).c.pos;
      if (!hp) return;
      let carriers = 0;
      for (const id of sortedIds(st)) {
        const e = st.entities[String(id)];
        if (e?.c.pos?.level === hp.level && CARRIERS.includes(e.def)) carriers++;
      }
      if (carriers >= 4) return;
      const level = getLevel(st, hp.level);
      const rules = cellRules(level, ctx.defs);
      let near: Pos | null = null;
      for (const [dx, dy] of [
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3],
        [2, 2],
        [-2, -2],
        [2, -2],
        [-2, 2],
      ]) {
        const x = hp.x + (dx ?? 0);
        const y = hp.y + (dy ?? 0);
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        if (!rules.passable[level.cells[y * level.width + x] ?? 0]) continue;
        near = { x, y };
        break;
      }
      if (!near) return;
      const def = ctx.defs.monster(CARRIERS[made % CARRIERS.length]!);
      const mon = makemon(ctx, def, near, { adjacentOk: true, angry: true, nogroup: true });
      if (mon === null) return;
      const otyp = ITEMS[made % ITEMS.length]!;
      const item = mksobj(ctx, ctx.defs.object(otyp), {
        carriedBy: mon,
        ...(otyp === 'nh:corpse' ? { corpseOf: 'nh:lizard' } : {}),
      });
      const it = st.entities[String(item)]?.c.item;
      if (it && ctx.defs.object(otyp).class === 'wand') it.spe = Math.max(it.spe, 2);
      // a hurt carrier, so the healing and escape items come into play
      const m = st.entities[String(mon)];
      if (m?.c.hp && made % 3 === 0) m.c.hp.cur = Math.max(1, Math.trunc(m.c.hp.max / 4));
      given.push({ item, mon, spe: it?.spe ?? 0 });
      made++;
    });
  },
};

describe('muse soak', () => {
  for (const seed of [31, 32]) {
    test(`seed ${seed}: 400 turns among monsters using items`, { timeout: 90000 }, () => {
      made = 0;
      used = 0;
      errors.length = 0;
      given = [];
      const r = soak([vanillaMod, museMod], { seed, turns: 400, checkEvery: 1 });
      console.log(
        `muse soak seed=${seed}: made=${made} used=${used} kills=${r.kills} turns=${r.turns} outcome=${r.outcome}`,
      );
      expect(r.violations).toBeNull();
      expect(errors).toEqual([]);
      expect(made).toBeGreaterThan(10);
      expect(used).toBeGreaterThan(3);
    });
  }
});
