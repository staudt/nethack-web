// The magic portals at the two ends of a portal branch (dungeon.lua branchtype "portal": the
// Quest): the main dungeon's end is placed where makelevel() places a branch (a room found as
// for stairs, a free spot in it), the branch's first level's end in its branch level region (or
// anywhere when its LevelDef has none). Fort Ludios's portals are vault.ts's and knox.ts's.
// A leaf (core, levelflags.ts, portal.ts, somexy.ts, trap.ts): mklev.ts, rogue.ts and sp_lev.ts
// call it.
// ref: src/mklev.c place_branch() (BR_PORTAL), find_branch_room(),
// generate_stairs_find_room(), generate_stairs_room_good(); src/mkmaze.c mkportal(),
// fixup_special() (place_lregion() LR_BRANCH)
import {
  dungeonLayout,
  insideRoom,
  type Ctx,
  type GameState,
  type Level,
  type LevelRef,
  type Pos,
  type Room,
} from '@nh/core';
import { LUDIOS } from './levelflags';
import { MAGIC_PORTAL, findPortal, portalData } from './portal';
import { somexyspaceTry } from './somexy';
import { maketrap } from './trap';

/**
 * Where the portal on `level` leads when a portal branch ends there (C's Is_branchlev() of a
 * BR_PORTAL branch: the parent's level leads to the branch's entry level, the entry level back),
 * else null. Fort Ludios is left to vault.ts and knox.ts (its main dungeon end floats until a
 * vault holds it).
 */
export function portalBranchDest(
  state: Readonly<GameState>,
  level: Readonly<Pick<Level, 'dungeon' | 'dlevel'>>,
): LevelRef | null {
  for (const d of state.dungeons)
    for (const b of d.branches) {
      if (b.stairs !== 'portal' || b.to === LUDIOS) continue;
      const child = dungeonLayout(state, b.to);
      if (d.id === level.dungeon && b.dlevel === level.dlevel)
        return { dungeon: b.to, dlevel: child.entry ?? 1 };
      if (b.to === level.dungeon && level.dlevel === (child.entry ?? 1))
        return { dungeon: d.id, dlevel: b.dlevel };
    }
  return null;
}

/**
 * A room for the branch: an ordinary top-level room without stairs, else an ordinary one, else
 * any (no themed rooms here, and every room is joined, so phases 2 and 1 and phases 0 and -1 are
 * alike). ref: src/mklev.c generate_stairs_find_room()
 */
function branchRoom(ctx: Pick<Ctx, 'rng'>, level: Readonly<Level>): Room | null {
  const rooms = level.rooms.filter((r) => r.parent === undefined);
  if (rooms.length === 0) return null;
  const stairs = [level.up, level.down, level.branch?.pos].filter((p): p is Pos => !!p);
  for (let phase = 2; phase > -1; phase--) {
    const ok = rooms.filter(
      (r) => r.type === undefined && (phase < 1 || !stairs.some((p) => insideRoom(r, p.x, p.y))),
    );
    if (ok.length > 0) return ok[ctx.rng.rn2(ok.length)] as Room;
  }
  return rooms[ctx.rng.rn2(rooms.length)] as Room;
}

/**
 * place_branch() for a portal branch ending on `level`: at `at`, or (omitted) in a room found as
 * for stairs on a free spot (somexyspace(), its last try even when it failed: "Can't place
 * branch!"), a magic portal to the other end. Nothing when no portal branch ends here, when the
 * level already has its portal (C's `made_branch`), or with no spot.
 * With no rooms and no `at`, the caller finds the spot (place_lregion() over the whole level).
 * ref: src/mklev.c place_branch(), find_branch_room(); src/mkmaze.c mkportal()
 */
export function placeBranchPortal(ctx: Ctx, level: Level, at?: Pos | null): void {
  const dst = portalBranchDest(ctx.state, level);
  if (!dst || findPortal(level)) return;
  let p: Pos | null = at ?? null;
  if (at === undefined) {
    const room = branchRoom(ctx, level);
    if (!room) return;
    p = somexyspaceTry(ctx, level, room).pos;
  }
  if (!p) return;
  const t = maketrap(ctx, level.id, p.x, p.y, MAGIC_PORTAL, { inMklev: true });
  t.data = portalData(dst);
}
