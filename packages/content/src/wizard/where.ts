import { type ActionDef, type Ctx, type DungeonLayout, getLevel } from '@nh/core';

export const WIZ_WHERE = 'wiz:where';

/**
 * Says each dungeon's depth range and, under it, its special levels and the branch stairs
 * leaving it, by level (a branch before a special level on the same one); the level the hero
 * is on is marked `*`.
 * ref: src/dungeon.c print_dungeon(), print_branch(), chr_u_on_lvl() (bymenu false), as
 * messages instead of a window; there are no portals to list yet.
 */
export function printDungeon(ctx: Ctx): void {
  const dungeons: readonly DungeonLayout[] = ctx.state.dungeons;
  const here = getLevel(ctx.state);
  for (const d of dungeons) {
    const def = ctx.defs.dungeon(d.id);
    const dungeon = '@' + def.nameKey;
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
    const lines = [
      ...d.branches.map((b) => ({ dlevel: b.dlevel, special: false, id: b.to })),
      ...d.special.map((s) => ({ dlevel: s.dlevel, special: true, id: s.id })),
    ].sort((a, b) => a.dlevel - b.dlevel || Number(a.special) - Number(b.special));
    for (const l of lines) {
      const depth = start + l.dlevel - 1;
      if (!l.special) {
        ctx.emit({
          type: 'msg',
          key: 'wiz.where.branch',
          params: { dungeon: '@' + ctx.defs.dungeon(l.id).nameKey, depth },
        });
        continue;
      }
      const sp = def.special?.find((s) => s.id === l.id);
      const on = here.dungeon === d.id && here.dlevel === l.dlevel;
      ctx.emit({
        type: 'msg',
        key: on ? 'wiz.where.special_here' : 'wiz.where.special',
        params: { name: '@' + (sp?.nameKey ?? l.id), depth },
      });
    }
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
