// Shared by the soak.endgame*.test.ts files: the planes are spread over two files so vitest runs
// them on parallel workers.
import { P, mksobj, setIntrinsic, setU, vanillaMod } from '@nh/content';
import { getLevel, getPlayer, type Level, type Mod } from '@nh/core';
import { expect, test } from 'vitest';
import { soak } from '../../src/index';

const PLANES = 'nh:planes';
export const PLANE_IDS = {
  earth: 'nh:plane-earth',
  air: 'nh:plane-air',
  fire: 'nh:plane-fire',
  water: 'nh:plane-water',
  astral: 'nh:plane-astral',
} as const;
export type Plane = keyof typeof PLANE_IDS;

interface Bubble {
  x: number;
  y: number;
  n: number;
}
/** Each bubble shape's width and height (bubbles.ts BUBBLE_SHAPES, C's bmask). */
const SIZE: readonly (readonly [number, number])[] = [
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 3],
  [6, 4],
  [7, 4],
  [8, 4],
];

/**
 * A game mod for this soak: at new game the hero, carrying the Amulet of Yendor, goes to a random
 * spot of one of the Planes, sturdy (breathing water, resisting fire and magic) enough to last a while
 * among its monsters (her hit points restored each turn). Each turn on Water or Air every bubble
 * must be inside the level's bubble
 * bounds (bubbles.ts bubbleBounds(): x 4..width-3, y 2..height-2).
 */
function endgameStartMod(plane: Plane): Mod {
  return {
    id: 'testkit-endgame-start',
    version: '1',
    dependsOn: ['nh'],
    register(api) {
      api.on(
        'levelChange',
        (ctx, change) => {
          if (change.from !== null) return;
          const d = ctx.state.dungeons.find((x) => x.id === PLANES);
          const sp = d?.special.find((s) => s.id === PLANE_IDS[plane]);
          if (!sp) return;
          const hero = getPlayer(ctx.state);
          setU(ctx, { amuletWish: true });
          mksobj(ctx, ctx.defs.object('nh:amulet_of_yendor'), {
            init: true,
            carriedBy: hero.id,
          });
          setIntrinsic(hero, P.MAGICAL_BREATHING, true);
          setIntrinsic(hero, P.FIRE_RES, true);
          setIntrinsic(hero, P.ANTIMAGIC, true);
          hero.c.hp = { cur: 5000, max: 5000 };
          ctx.goToLevel({ dungeon: PLANES, dlevel: sp.dlevel }, 'random');
        },
        { priority: -100 },
      );
      api.on(
        'endOfTurn',
        (ctx) => {
          // her wounds close each turn: the Planes' crowds would kill her in a few dozen turns
          const hp = getPlayer(ctx.state).c.hp;
          if (hp && hp.cur > 0) hp.cur = hp.max;
          const level: Level = getLevel(ctx.state);
          const nh = ctx.state.modData['nh'] as
            { bubbles?: Record<string, { list: Bubble[] }> } | undefined;
          const bl = nh?.bubbles?.[level.id];
          if (!bl) return;
          for (const b of bl.list) {
            const [w, h] = SIZE[b.n] ?? [0, 0];
            if (
              b.x < 4 ||
              b.y < 2 ||
              b.x + w - 1 > level.width - 3 ||
              b.y + h - 1 > level.height - 2
            )
              throw new Error(`bubble out of bounds: ${JSON.stringify(b)} on ${level.id}`);
          }
        },
        { priority: -100 },
      );
    },
  };
}

/**
 * Two 300-turn soaks (seeds 1 and 2) per plane: the hero starts there (endgameStartMod) with the
 * Amulet and the bot plays, with every invariant checked as it goes (no monster or object on
 * rock, the hero on a passable cell or in the water) and the bubbles kept in bounds.
 */
export function endgameSoaks(planes: readonly Plane[]): void {
  for (const plane of planes) {
    for (const seed of [1, 2]) {
      test(`${plane}, seed ${seed}: 300 turns`, { timeout: 240000 }, () => {
        const r = soak([vanillaMod, endgameStartMod(plane)], { seed, turns: 300, checkEvery: 5 });
        console.log(
          `soak endgame ${plane} seed=${seed}: outcome=${r.outcome} turns=${r.turns} kills=${r.kills}`,
        );
        expect(r.violations).toBeNull();
        expect(r.specialLevels).toContain(PLANE_IDS[plane]);
      });
    }
  }
}
