import {
  P,
  T,
  amphibious,
  breathless,
  cantDrown,
  flying,
  hasProp,
  isLava,
  isPool,
  isSwimmer,
  levitating,
  likesLava,
  likesLavaId,
  mInAir,
  makemon,
  mksobj,
  swimming,
  uinwater,
  vanillaMod,
  wwalking,
  heroForm,
} from '@nh/content';
import {
  cellIndex,
  coversObjects,
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { soak } from '../src/index';

/**
 * A game mod for this soak: on the first level the hero's room gets water around her start (pools
 * and a moat in a ring two squares out, molten lava three squares east), boulders next to her,
 * a giant eel and a piranha in the water, a gremlin (all peaceful), and wands of cold, fire and digging in her
 * pack, so the bot meets water, lava, ice and boulders within a few moves.
 */
const waterStartMod: Mod = {
  id: 'testkit-water-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const level = getLevel(ctx.state);
        const p = getPlayer(ctx.state).c.pos;
        if (!p) return;
        const floor = (x: number, y: number): boolean =>
          x >= 0 &&
          y >= 0 &&
          x < level.width &&
          y < level.height &&
          level.palette[level.cells[cellIndex(level, x, y)] ?? -1] === T.floor &&
          !level.traps.some((t) => t.x === x && t.y === y) &&
          // no monster made with the level stands there
          !sortedIds(ctx.state).some((id) => {
            const q = ctx.state.entities[String(id)]?.c.pos;
            return q?.level === level.id && q.x === x && q.y === y;
          });
        const set = (x: number, y: number, id: DefId): void => {
          let pi = level.palette.indexOf(id);
          if (pi === -1) pi = level.palette.push(id) - 1;
          level.cells[cellIndex(level, x, y)] = pi;
        };
        const water: { x: number; y: number }[] = [];
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
            const x = p.x + dx;
            const y = p.y + dy;
            if (!floor(x, y) || (dx === 0 && dy === -2)) continue; // a way out to the north
            set(x, y, dy === 2 ? T.moat : T.pool);
            water.push({ x, y });
          }
        if (floor(p.x + 3, p.y)) set(p.x + 3, p.y, T.lava);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
        ] as const)
          if (floor(p.x + dx, p.y + dy))
            mksobj(ctx, ctx.defs.object('nh:boulder'), {
              init: false,
              at: { level: level.id, x: p.x + dx, y: p.y + dy },
            });
        const monAt = (id: DefId, at: { x: number; y: number } | undefined): void => {
          if (!at) return;
          // peaceful: the bot is to roam the water, not to be killed at once
          const m = makemon(ctx, ctx.defs.monster(id), at, { level: level.id });
          const e = m === null ? undefined : ctx.state.entities[String(m)];
          if (e?.c.monster) e.c.monster.peaceful = true;
        };
        monAt('nh:giant_eel', water[0]);
        monAt('nh:piranha', water[water.length - 1]);
        if (floor(p.x, p.y + 1)) monAt('nh:gremlin', { x: p.x, y: p.y + 1 });
        // sturdy enough to meet them for a while
        getPlayer(ctx.state).c.hp = { cur: 300, max: 300 };
        for (const w of ['nh:wand_of_cold', 'nh:wand_of_fire', 'nh:wand_of_digging'] as const)
          mksobj(ctx, ctx.defs.object(w), { carriedBy: ctx.state.playerId });
      },
      { priority: -100 },
    );
  },
};

/** What this soak checks at the end of every turn, beyond the testkit invariants. */
const errors: string[] = [];
/** The liquid cells of the hero's level at the previous end of turn. */
const liquidBefore: { level: string; cells: Set<number> } = { level: '', cells: new Set() };
let killer: string | null = null;

function waterErrors(ctx: Ctx): string[] {
  const out: string[] = [];
  const s = ctx.state;
  if (s.gameOver) return out;
  const level = getLevel(s);
  // nothing in a pool or in lava is shown: no object is remembered on a liquid cell in sight
  // (core refreshes the memory after the turn's end, so a cell that turned liquid during this
  // turn, as ice melting on its timer, is checked from the next turn on)
  const mem = s.objectMemory[level.id] ?? {};
  const wasLiquid = liquidBefore.level === level.id ? liquidBefore.cells : new Set<number>();
  const liquidNow = new Set<number>();
  for (let i = 0; i < level.cells.length; i++)
    if (coversObjects(ctx.defs, level, i)) liquidNow.add(i);
  liquidBefore.level = level.id;
  liquidBefore.cells = liquidNow;
  for (const i of s.visible)
    if (liquidNow.has(i) && wasLiquid.has(i) && mem[String(i)] !== undefined)
      out.push(`turn ${s.turn}: object shown on liquid cell ${i}`);
  // the hero never ends a turn in water or lava she cannot survive
  const h = getPlayer(s);
  const p = h.c.pos;
  if (p && p.level === level.id && !levitating(ctx) && !flying(ctx)) {
    if (isPool(ctx, level, p.x, p.y)) {
      const ok =
        wwalking(ctx) || (uinwater(ctx) && (swimming(ctx) || amphibious(ctx) || breathless(ctx)));
      if (!ok) out.push(`turn ${s.turn}: hero in water at ${p.x},${p.y}`);
    } else if (isLava(ctx, level, p.x, p.y)) {
      const ok = likesLavaId(heroForm(ctx)?.id) || hasProp(h, P.FIRE_RES) || wwalking(ctx);
      if (!ok) out.push(`turn ${s.turn}: hero in lava at ${p.x},${p.y}`);
    }
  }
  // monsters are in water or lava only when they may be there
  for (const id of sortedIds(s)) {
    const e = s.entities[String(id)];
    const mp = e?.c.pos;
    if (!e?.c.monster || id === s.playerId || !mp || mp.level !== level.id) continue;
    const def = ctx.defs.monster(e.def);
    if (isPool(ctx, level, mp.x, mp.y) && !(isSwimmer(def) || cantDrown(def) || mInAir(ctx, e)))
      out.push(`turn ${s.turn}: ${e.def} #${id} in water at ${mp.x},${mp.y}`);
    if (
      isLava(ctx, level, mp.x, mp.y) &&
      !(likesLava(def) || mInAir(ctx, e) || def.resists.includes('fire'))
    )
      out.push(`turn ${s.turn}: ${e.def} #${id} in lava at ${mp.x},${mp.y}`);
  }
  return out;
}

const checkMod: Mod = {
  id: 'testkit-water-check',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on('endOfTurn', (ctx) => void errors.push(...waterErrors(ctx)), { priority: -100 });
    api.on('beforeGameOver', (_ctx, over) => {
      killer = over.killer ?? null;
      return 'continue';
    });
  },
};

// The bot on a level with pools, a moat and lava, with eels, a gremlin and boulders (m15 step
// 3): the testkit invariants (no trap on water among them) and the water ones above hold. Some
// runs end early: the bot answers yes to "Really step into the water?" and may drown or burn.
describe('soak by the water', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    test(`seed ${seed}: 300 turns by the water`, { timeout: 60000 }, () => {
      errors.length = 0;
      killer = null;
      liquidBefore.level = '';
      const r = soak([vanillaMod, waterStartMod, checkMod], { seed, turns: 300, checkEvery: 1 });
      console.log(
        `soak water seed=${seed}: outcome=${r.outcome} turns=${r.turns} killer=${killer} zapped=${r.zapped} pushes=${r.boulderPushes}`,
      );
      expect(r.violations).toBeNull();
      expect(errors).toEqual([]);
    });
  }
});
