import { type ActionDef, type Ctx, type DungeonLayout, getLevel } from '@nh/core';
import { LUDIOS } from '../levelflags';

export const WIZ_WHERE = 'wiz:where';

/**
 * Says each dungeon's depth range and, under it, its special levels and the branch stairs
 * leaving it, by level (a branch before a special level on the same one); the level the hero
 * is on is marked `*`.
 * ref: src/dungeon.c print_dungeon(), print_branch(), chr_u_on_lvl() (bymenu false), as
 * messages instead of a window, with the overview's "Stairs up"/"Stairs down" (br_string2())
 * for C's "Stair" and C's "Connection" for a branch with no stairs on this end (BR_NO_END1);
 * there are no portals to list yet (Fort Ludios's unplaced branch is not listed).
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
      // Fort Ludios's floating entrance is not listed: its rolled level is only C's placeholder
      // (fixup_level_locations() makes its end1 bogus, which print_branch() skips)
      ...d.branches
        .filter((b) => b.to !== LUDIOS)
        .map((b) => ({
          dlevel: b.dlevel,
          special: false,
          id: b.to,
          up: b.dir === 'up',
          connection: b.stairs === 'child',
        })),
      ...d.special.map((s) => ({
        dlevel: s.dlevel,
        special: true,
        id: s.id,
        up: false,
        connection: false,
      })),
    ].sort((a, b) => a.dlevel - b.dlevel || Number(a.special) - Number(b.special));
    for (const l of lines) {
      const depth = start + l.dlevel - 1;
      if (!l.special) {
        ctx.emit({
          type: 'msg',
          key: l.connection
            ? 'wiz.where.connection'
            : l.up
              ? 'wiz.where.branch_up'
              : 'wiz.where.branch',
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
