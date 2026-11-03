import { type ActionDef, type Ctx, type DungeonLayout } from '@nh/core';

export const WIZ_WHERE = 'wiz:where';

/**
 * Says each dungeon's depth range and, under it, the branch stairs leaving it.
 * ref: src/dungeon.c print_dungeon(), print_branch() (bymenu false), as messages instead of a
 * window; there are no special levels or portals to list yet.
 */
export function printDungeon(ctx: Ctx): void {
  const dungeons: readonly DungeonLayout[] = ctx.state.dungeons;
  for (const d of dungeons) {
    const dungeon = '@' + ctx.defs.dungeon(d.id).nameKey;
    const start = d.depthStart;
    if (d.levels === null)
      ctx.emit({ type: 'msg', key: 'wiz.where.open', params: { dungeon, start } });
    else if (d.levels > 1)
      ctx.emit({
        type: 'msg',
        key: 'wiz.where.levels',
        params: { dungeon, start, end: start + d.levels - 1 },
      });
    else ctx.emit({ type: 'msg', key: 'wiz.where.level', params: { dungeon, start } });
    for (const b of d.branches)
      ctx.emit({
        type: 'msg',
        key: 'wiz.where.branch',
        params: { dungeon: '@' + ctx.defs.dungeon(b.to).nameKey, depth: start + b.dlevel - 1 },
      });
  }
}

/** #wizwhere; takes no time (ECMD_OK). ref: src/wizcmds.c wiz_where() */
export const wizWhere: ActionDef = {
  id: WIZ_WHERE,
  labelKey: 'action.wiz:where',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_WHERE }, labelKey: 'action.wiz:where' }]
      : [],
  perform(ctx) {
    printDungeon(ctx);
    return 0;
  },
};
