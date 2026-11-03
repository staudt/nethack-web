import { getLevel, newMemory, type ActionDef, type Ctx, type Level } from '@nh/core';
import { setTerrain } from '../actions';
import { T } from '../terrain';

export const WIZ_MAP = 'wiz:map';

/**
 * Magic mapping, unconfused: every cell's real terrain goes into the hero's memory, and secret
 * corridors are found (secret doors are not: they stay remembered as the wall they look like).
 * Seen traps stay shown, and remembered objects and monsters are kept, as the view already does.
 * There is no exercise(A_WIS) (attribute exercise is not implemented) and no lit/unlit
 * distinction in memory (an unlit room is remembered as floor).
 * ref: src/detect.c do_mapping(), show_map_spot() (cnf false), src/display.c magic_map_background()
 */
export function doMapping(ctx: Ctx, level: Level): void {
  const memory = (ctx.state.memory[level.id] ??= newMemory(level));
  for (let x = 0; x < level.width; x++)
    for (let y = 0; y < level.height; y++) {
      const i = y * level.width + x;
      // Secret corridors are found, but not secret doors.
      if (level.palette[level.cells[i] ?? 0] === T.scorr) setTerrain(level, x, y, T.corr);
      memory[i] = level.cells[i] ?? 0;
    }
}

/**
 * #wizmap: reveal the level map and every trap on it; takes no time (ECMD_OK).
 * ref: src/wizcmds.c wiz_map() (no engravings: they do not exist yet)
 */
export const wizMap: ActionDef = {
  id: WIZ_MAP,
  labelKey: 'action.wiz:map',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_MAP }, labelKey: 'action.wiz:map' }]
      : [],
  perform(ctx) {
    const level = getLevel(ctx.state);
    for (const t of level.traps) t.seen = true;
    doMapping(ctx, level);
    return 0;
  },
};
