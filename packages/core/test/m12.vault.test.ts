// Vaults in level generation (m12 step 6): the 2x2 walled, lit, unjoined room makerooms() rolls
// for and makelevel() makes after the corridors, and the vault teleporter's niche.
// ref: src/mklev.c makerooms(), makelevel(), makevtele(), makeniche(); src/sp_lev.c create_room()
import { describe, expect, test } from 'vitest';
import { createRng, newRngStates } from '../src/rng';
import { generateLevel, VANILLA_TERRAIN } from '../src/levelgen/index';
import { PAL } from '../src/levelgen/terrain';
import type { Level } from '../src/types/level';

function gen(seed: number, depth: number, width = 80, height = 21): Level {
  return generateLevel(createRng(newRngStates(seed).core), {
    id: 'test',
    depth,
    width,
    height,
    terrain: VANILLA_TERRAIN,
  });
}

const at = (l: Level, x: number, y: number): number => l.cells[y * l.width + x] ?? -1;

/** Squares reachable from (sx, sy) through anything but rock, walls and secret squares. */
function reach(l: Level, sx: number, sy: number): boolean[] {
  const blocked = new Set<number>([
    PAL.stone,
    PAL.vwall,
    PAL.hwall,
    PAL.tlcorn,
    PAL.trcorn,
    PAL.blcorn,
    PAL.brcorn,
    PAL.sdoor_h,
    PAL.sdoor_v,
    PAL.sdoor_locked_h,
    PAL.sdoor_locked_v,
    PAL.scorr,
  ]);
  const seen = new Array<boolean>(l.width * l.height).fill(false);
  const stack = [[sx, sy] as const];
  seen[sy * l.width + sx] = true;
  for (let p = stack.pop(); p; p = stack.pop()) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p[0] + dx;
      const y = p[1] + dy;
      if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
      const i = y * l.width + x;
      if (seen[i] || blocked.has(at(l, x, y))) continue;
      seen[i] = true;
      stack.push([x, y]);
    }
  }
  return seen;
}

describe('vaults', () => {
  const levels = Array.from({ length: 300 }, (_, i) => gen(i + 1, 1 + (i % 12)));

  test('a third to half of the ordinary levels get a vault, a third of those a teleporter', () => {
    const vaults = levels.filter((l) => l.vaultSpot);
    const teles = levels.filter((l) => l.vaultTeleSpot);
    // makerooms() flips a coin once six rooms are made; the spot must still be clear later
    expect(vaults.length).toBeGreaterThan(levels.length * 0.25);
    expect(vaults.length).toBeLessThan(levels.length * 0.75);
    // !rn2(3), and the niche can fail
    expect(teles.length).toBeGreaterThan(vaults.length * 0.15);
    expect(teles.length).toBeLessThan(vaults.length * 0.5);
    for (const l of teles) expect(l.vaultSpot).toBeDefined();
  });

  test('a vault is a closed, lit 2x2 room, not in rooms[], unreachable from the stairs', () => {
    for (const l of levels) {
      const v = l.vaultSpot;
      if (!v) continue;
      for (let y = v.y - 1; y <= v.y + 2; y++)
        for (let x = v.x - 1; x <= v.x + 2; x++) {
          const floor = x >= v.x && x <= v.x + 1 && y >= v.y && y <= v.y + 1;
          const t = at(l, x, y);
          if (floor) expect(t).toBe(PAL.floor);
          else if (x === v.x - 1 && y === v.y - 1) expect(t).toBe(PAL.tlcorn);
          else if (x === v.x + 2 && y === v.y - 1) expect(t).toBe(PAL.trcorn);
          else if (x === v.x - 1 && y === v.y + 2) expect(t).toBe(PAL.blcorn);
          else if (x === v.x + 2 && y === v.y + 2) expect(t).toBe(PAL.brcorn);
          else expect(t).toBe(y === v.y - 1 || y === v.y + 2 ? PAL.hwall : PAL.vwall);
          expect(l.lit[y * l.width + x]).toBe(1);
        }
      for (const r of l.rooms)
        expect(r.lx > v.x + 2 || r.hx < v.x - 1 || r.ly > v.y + 2 || r.hy < v.y - 1).toBe(true);
      const up = l.up ?? l.down;
      if (!up) throw new Error('no stairs');
      const seen = reach(l, up.x, up.y);
      expect(seen[v.y * l.width + v.x]).toBe(false);
      // the stairs are never in the vault
      for (const s of [l.up, l.down])
        if (s) expect(s.x >= v.x && s.x <= v.x + 1 && s.y >= v.y && s.y <= v.y + 1).toBe(false);
    }
  });

  test('the teleporter niche is a secret corridor behind a door in a room wall', () => {
    let secret = 0;
    let n = 0;
    for (const l of levels) {
      const t = l.vaultTeleSpot;
      if (!t) continue;
      n++;
      expect(at(l, t.x, t.y)).toBe(PAL.scorr);
      const above = at(l, t.x, t.y - 1);
      const below = at(l, t.x, t.y + 1);
      const doors: number[] = [
        PAL.sdoor_h,
        PAL.sdoor_locked_h,
        PAL.doorway,
        PAL.door_open_h,
        PAL.door_closed,
        PAL.door_locked,
      ];
      const dy = doors.includes(above) ? -1 : 1;
      const door = dy === -1 ? above : below;
      expect(doors).toContain(door);
      if (door === PAL.sdoor_h || door === PAL.sdoor_locked_h) secret++;
      // the room's floor lies beyond the door
      const room = l.rooms.find(
        (r) => t.x >= r.lx && t.x <= r.hx && t.y + 2 * dy >= r.ly && t.y + 2 * dy <= r.hy,
      );
      expect(room).toBeDefined();
    }
    expect(n).toBeGreaterThan(0);
    // dosdoor(SDOOR) keeps a secret door unless the spot was already a door
    expect(secret).toBeGreaterThan(n / 2);
  });

  test('levels with few rooms never roll for a vault', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const l = gen(seed, 3, 20, 12);
      // a sixth of the (scaled) room cap of 40 is never reached on a 20x12 map
      expect(l.vaultSpot).toBeUndefined();
    }
  });

  test('larger maps get vaults too', () => {
    const big = Array.from({ length: 20 }, (_, i) => gen(i + 1, 5, 160, 42));
    expect(big.some((l) => l.vaultSpot)).toBe(true);
  });
});
