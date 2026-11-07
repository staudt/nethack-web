// Sokoban's prize, beside the treasure zoo of its top level. Kept apart from zoo.ts, which the
// room-entry code (rooms.ts) needs below the level builder. ref: dat/soko1-1.lua, dat/soko1-2.lua
import type { Ctx, DefId, Level, LevelDef } from '@nh/core';
import { mksobjFull } from './mkobj';
import { mapToLevel, type SpLevFixup } from './sp_lev';

type Spot = readonly [x: number, y: number];

/**
 * Sokoban's prize, beside the zoo on the top level: at one of the listed map spots
 * (`selection.rndcoord(place)`, x then y order), a bag of holding `chance` percent of the time,
 * else an amulet of reflection, not cursed. Its Elbereth engraving and cursed scroll of scare
 * monster are not ported (DEVIATIONS.md "Sokoban"); no achievement is recorded.
 * ref: dat/soko1-1.lua, dat/soko1-2.lua ("Rewards"); src/sp_lev.c create_object() buc
 * "not-cursed"
 */
function sokobanPrize(chance: number, place: readonly Spot[]): SpLevFixup {
  return {
    after(ctx: Ctx, level: Level, def: LevelDef): void {
      const spot = place[ctx.rng.rn2(place.length)];
      if (!spot) return;
      const id = ctx.rng.rn2(100) < chance ? 'nh:bag_of_holding' : 'nh:amulet_of_reflection';
      const p = mapToLevel(def, level, spot[0], spot[1]);
      const e = mksobjFull(
        ctx,
        ctx.defs.object(id),
        { at: { level: level.id, x: p.x, y: p.y } },
        { level: level.id, inMklev: true },
      );
      const item = ctx.state.entities[String(e)]?.c.item;
      if (item?.buc === 'cursed') item.buc = 'uncursed'; // case 4 "not cursed": uncurse()
    },
  };
}

/** The prize fixups of the two top-level variants (soko1-2's bag is the 25% case). */
export const SOKOBAN_PRIZE_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  'nh:soko1-1': sokobanPrize(75, [
    [16, 11],
    [16, 13],
    [16, 15],
  ]),
  'nh:soko1-2': sokobanPrize(25, [
    [16, 10],
    [16, 12],
    [16, 14],
  ]),
};
