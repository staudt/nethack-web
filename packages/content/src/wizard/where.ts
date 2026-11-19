import { type ActionDef, type Ctx, type DungeonLayout, getLevel } from '@nh/core';
import { knoxSource } from '../knoxstate';
import { LUDIOS } from '../levelflags';

export const WIZ_WHERE = 'wiz:where';

/**
 * Says each dungeon's depth range and, under it, its special levels and the branch stairs
 * leaving it, by level (a branch before a special level on the same one); the level the hero
 * is on is marked `*`.
 * ref: src/dungeon.c print_dungeon(), print_branch(), chr_u_on_lvl() (bymenu false), as
 * messages instead of a window, with the overview's "Stairs up"/"Stairs down" (br_string2())
 * for C's "Stair", C's "Connection" for a branch with no stairs on this end (BR_NO_END1) and its
 * "One way stair" for one going up (BR_NO_END2: the Elemental Planes from DL1), and its "Portal"
 * for a portal branch (BR_PORTAL: the Quest).
 * Fort Ludios's branch is listed as C's "Portal" on the level whose vault holds its portal
 * (mk_knox_portal() re-inserts it there); its rolled level is only C's placeholder, never listed,
 * and while no vault has the portal the parent's list ends with "Portal to Fort Ludios: not
 * placed" (C lists nothing).
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
    // Fort Ludios's floating entrance: its rolled level is only C's placeholder
    // (fixup_level_locations() makes its end1 bogus, which print_branch() skips); its portal's
    // level once placed
    const knox = d.branches.some((b) => b.to === LUDIOS) ? knoxSource(ctx.state) : null;
    const lines = [
      ...d.branches
        .filter((b) => b.to !== LUDIOS)
        .map((b) => ({
          dlevel: b.dlevel,
          special: false,
          id: b.to,
          up: b.dir === 'up',
          connection: b.stairs === 'child',
          portal: b.stairs === 'portal',
        })),
      ...(knox
        ? [
            {
              dlevel: knox.dlevel,
              special: false,
              id: LUDIOS,
              up: false,
              connection: false,
              portal: true,
            },
          ]
        : []),
      ...d.special.map((s) => ({
        dlevel: s.dlevel,
        special: true,
        id: s.id,
        up: false,
        connection: false,
        portal: false,
      })),
    ].sort((a, b) => a.dlevel - b.dlevel || Number(a.special) - Number(b.special));
    for (const l of lines) {
      const depth = start + l.dlevel - 1;
      if (!l.special) {
        ctx.emit({
          type: 'msg',
          key: l.portal
            ? 'wiz.where.portal'
            : l.connection
              ? l.up
                ? 'wiz.where.one_way'
                : 'wiz.where.connection'
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
    if (!knox && d.branches.some((b) => b.to === LUDIOS))
      ctx.emit({
        type: 'msg',
        key: 'wiz.where.portal_unplaced',
        params: { dungeon: '@' + ctx.defs.dungeon(LUDIOS).nameKey },
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
