import type { Pos } from '../types/common';
import type { Rng } from '../types/rng';
import { dosdoor, finddpos } from './corridors';
import { Grid, T, type IRoom } from './grid';
import type { RectList } from './rect';
import { addRoom, checkRoom, createVault } from './rooms';

/**
 * The treasure vault of an ordinary level, made after the corridors so it stays unjoined: the
 * spot makeRooms() kept must still have stone round it (else one more free rectangle is tried),
 * then the 2x2 lit walled room is drawn and, 1 time in 3, the vault teleporter's niche. The vault
 * is not put in `g.rooms` (the mod that owns vaults types it: `Level.vaultSpot`); it counts in
 * `nroom` for the niche's room roll, as in C. Returns the vault's top-left floor square and the
 * niche square, or null when no vault was made.
 * ref: src/mklev.c makelevel() do_vault() block (no Fort Ludios portal: mk_knox_portal() draws
 * nothing), makevtele()
 */
export function makeVault(
  g: Grid,
  rng: Rng,
  depth: number,
  rects: RectList,
  spot: Pos,
): { vault: Pos; tele: Pos | null } | null {
  let box = checkRoom(g, rng, { lowx: spot.x, ddx: 1, lowy: spot.y, ddy: 1 }, true);
  if (!box && rects.rnd(rng)) {
    const again = createVault(g, rects, rng);
    if (again) box = checkRoom(g, rng, { lowx: again.x, ddx: 1, lowy: again.y, ddy: 1 }, true);
  }
  if (!box) return null;
  addRoom(g, box.lowx, box.lowy, box.lowx + box.ddx, box.lowy + box.ddy, true);
  g.rooms.pop(); // drawn, but the owning mod adds the room
  const nroom = g.rooms.length + 1; // the vault is the last of C's rooms[]
  // fill_special_room(VAULT) (the gold) is the owning mod's; !level.flags.noteleport holds here
  const tele = rng.rn2(3) === 0 ? makeniche(g, rng, depth, nroom) : null;
  return { vault: { x: box.lowx, y: box.lowy }, tele };
}

/** Doors on the room's walls (C's `doorct`, which counts each door square once). */
function doorct(g: Grid, r: IRoom): number {
  let n = 0;
  const door = (x: number, y: number): void => {
    const t = g.get(x, y);
    if (t === T.DOOR || t === T.SDOOR) n++;
  };
  for (let x = r.lx; x <= r.hx; x++) {
    door(x, r.ly - 1);
    door(x, r.hy + 1);
  }
  for (let y = r.ly; y <= r.hy; y++) {
    door(r.lx - 1, y);
    door(r.hx + 1, y);
  }
  return n;
}

/** A floor square of the room next to x,y (N, S, E or W). ref: src/mklev.c cardinal_nextto_room() */
function cardinalNexttoRoom(r: IRoom, x: number, y: number): boolean {
  const inside = (px: number, py: number): boolean =>
    px >= r.lx && px <= r.hx && py >= r.ly && py <= r.hy;
  return inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1);
}

/**
 * The vault teleporter's niche: up to 8 tries at a random room (the vault and rooms with one door
 * 4 times in 5 are passed over), a door spot on its top or bottom wall with stone behind; that
 * square becomes a secret corridor behind a secret door. Returns the niche square (where the
 * once-only teleportation trap goes), or null. ref: src/mklev.c makeniche(TELEP_TRAP),
 * place_niche() (no "ad aerarium" engraving)
 */
function makeniche(g: Grid, rng: Rng, depth: number, nroom: number): Pos | null {
  for (let vct = 8; vct-- > 0;) {
    const aroom = g.rooms[rng.rn2(nroom)];
    if (!aroom) continue; // the vault: not an ordinary room
    if (doorct(g, aroom) === 1 && rng.rn2(5) !== 0) continue;
    // place_niche()
    const dy = rng.rn2(2) !== 0 ? 1 : -1;
    const dd = finddpos(g, rng, dy === 1 ? 'S' : 'N', aroom);
    if (!dd) continue;
    const { x: xx, y: yy } = dd;
    if (!(
      g.isok(xx, yy + dy) &&
      g.get(xx, yy + dy) === T.STONE &&
      g.isok(xx, yy - dy) &&
      g.get(xx, yy - dy) !== T.FURN && // !IS_POOL && !IS_FURNITURE
      cardinalNexttoRoom(aroom, xx, yy)
    ))
      continue;
    g.set(xx, yy + dy, T.SCORR);
    dosdoor(g, rng, depth, xx, yy, true);
    return { x: xx, y: yy + dy };
  }
  return null;
}
