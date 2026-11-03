import { getLevel, type ActionDef, type Ctx, type DefId, type Json } from '@nh/core';

export const WIZ_LEVELPORT = 'wiz:levelport';

/** How many levels the menu lists for a dungeon with no bottom (the Dungeons of Doom, for now). */
export const OPEN_DUNGEON_LEVELS = 30;

/** Prompt data: null while choosing the dungeon, then the chosen dungeon. */
interface LevelportData {
  dungeon: DefId;
}

/**
 * The levels the menu offers for a dungeon: all of them, or for a dungeon with no bottom
 * 1..max(30, the deepest level generated in it + 1).
 */
export function levelportLevels(ctx: Pick<Ctx, 'state'>, dungeon: DefId): number {
  const d = ctx.state.dungeons.find((x) => x.id === dungeon);
  if (!d) return 0;
  if (d.levels !== null) return d.levels;
  let deepest = 0;
  for (const l of Object.values(ctx.state.levels))
    if (l.dungeon === dungeon) deepest = Math.max(deepest, l.dlevel);
  return Math.max(OPEN_DUNGEON_LEVELS, deepest + 1);
}

/** The menu of levels in `dungeon`, each with its absolute depth; the current one is marked. */
function askLevel(ctx: Ctx, dungeon: DefId): void {
  const d = ctx.state.dungeons.find((x) => x.id === dungeon);
  if (!d) return;
  const here = getLevel(ctx.state);
  const options = [];
  for (let dlevel = 1; dlevel <= levelportLevels(ctx, dungeon); dlevel++) {
    const current = here.dungeon === dungeon && here.dlevel === dlevel;
    options.push({
      value: dlevel,
      key: current ? 'wiz.levelport.here' : 'wiz.levelport.level',
      params: { dlevel, depth: d.depthStart + dlevel - 1 },
    });
  }
  ctx.ask(
    {
      id: 'wiz-levelport-level',
      kind: 'menu',
      key: 'wiz.levelport.pickLevel',
      params: { dungeon: '@' + ctx.defs.dungeon(dungeon).nameKey },
      cancellable: true,
      options,
    },
    WIZ_LEVELPORT,
    { dungeon } satisfies LevelportData as unknown as Json,
  );
}

/**
 * #wizlevelport: choose a dungeon (skipped when there is only one), then a level in it, and
 * arrive on a random spot there. Takes no time (ECMD_OK). Choosing the current level does
 * nothing, as deferred_goto() skips a goto onto the same level.
 * ref: src/wizcmds.c wiz_level_tele(), src/teleport.c level_tele() (wizard, levTport_menu,
 * force_dest), src/do.c deferred_goto(), goto_level() u_on_rndspot()
 */
export const wizLevelport: ActionDef = {
  id: WIZ_LEVELPORT,
  labelKey: 'action.wiz:levelport',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_LEVELPORT }, labelKey: 'action.wiz:levelport' }]
      : [],
  perform(ctx) {
    const dungeons = ctx.state.dungeons;
    if (dungeons.length === 1) {
      askLevel(ctx, dungeons[0]!.id);
      return 0;
    }
    ctx.ask(
      {
        id: 'wiz-levelport-dungeon',
        kind: 'menu',
        key: 'wiz.levelport.pickDungeon',
        cancellable: true,
        options: dungeons.map((d) => ({ value: d.id, key: ctx.defs.dungeon(d.id).nameKey })),
      },
      WIZ_LEVELPORT,
      null,
    );
    return 0;
  },
  answer(ctx, value, raw) {
    const data = raw as unknown as LevelportData | null;
    if (data === null) {
      // the dungeon was chosen (null: cancelled)
      const chosen = ctx.state.dungeons.find((d) => d.id === value);
      if (chosen) askLevel(ctx, chosen.id);
      return 0;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
    if (value < 1 || value > levelportLevels(ctx, data.dungeon)) return 0;
    const here = getLevel(ctx.state);
    if (here.dungeon === data.dungeon && here.dlevel === value) return 0;
    ctx.goToLevel({ dungeon: data.dungeon, dlevel: value }, 'random');
    // flags.verbose: schedule_goto()'s post message
    ctx.emit({ type: 'msg', key: 'wiz.levelport.arrive' });
    return 0;
  },
};
