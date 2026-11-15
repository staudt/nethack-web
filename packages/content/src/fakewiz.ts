// The two fake Wizard's Towers: a small moated tower in a maze, a lich on its middle with a
// vampire lord and a kraken, squeaky boards around it; the first one's middle is the magic portal
// into the real tower's bottom level (wizard3), the second one keeps an amulet there.
// ref: dat/fakewiz1.lua, dat/fakewiz2.lua
//
// Translation notes (DEVIATIONS.md "The Wizard's Tower (m17)"): as the real tower (wiztower.ts),
// each LevelDef is unlit stone with its map, placeholder stairs and its teleport region; the
// `before` fixup lays the maze grid, the map again and walks the maze; the `after` fixup runs
// hell_tweaks(), joins the walls and puts the stairs, the branch and (fakewiz1) the portal in
// their level regions. fakewiz1's irregular arrival room makes no Room (an unlit area here).
// "vampire lord" is a random monster until vampires exist.
import type { DefId, LevelContent, LevelDef } from '@nh/core';
import { desMazeGrid } from './hellfill';
import { GEHENNOM_SPECIALS as G } from './levelflags';
import { spLevMap } from './mazefill';
import { mazewalk } from './mazewalk';
import { liftStairs, type SpLevFixup } from './sp_lev';
import { finishTower, relayMap } from './wiztower';

/** ref: dat/fakewiz1.lua, dat/fakewiz2.lua (the same map) */
const FAKEWIZ: readonly string[] = [
  '.........',
  '.}}}}}}}.',
  '.}}---}}.',
  '.}--.--}.',
  '.}|...|}.',
  '.}--.--}.',
  '.}}---}}.',
  '.}}}}}}}.',
  '.........',
];

const at = (x: number, y: number) => ({ x, y });
const board = (x: number, y: number): LevelContent => ({
  kind: 'trap',
  id: 'nh:squeaky_board',
  ...at(x, y),
});

/** The monsters and boards of both fake towers. */
const RESIDENTS: readonly LevelContent[] = [
  { kind: 'monster', class: 'L', ...at(4, 4) },
  { kind: 'monster', ...at(3, 4) }, // "vampire lord": a random monster until vampires exist
  { kind: 'monster', id: 'nh:kraken' as DefId, ...at(6, 6) },
  // And to make things a little harder.
  board(4, 3),
  board(4, 5),
  board(3, 4),
  board(5, 4),
];

const fakeDef = (id: DefId, contents: LevelContent[], arrival: boolean): LevelDef => ({
  id,
  // des.level_init({ style = "mazegrid", bg = "-" }): the fixup's, before the map
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  map: { rows: [...FAKEWIZ], halign: 'center', valign: 'center' },
  // des.region({ region = {04,03,06,06}, lit = 0, type = "ordinary", irregular = 1,
  // arrival_room = true }): an unlit area here
  ...(arrival ? { regions: [{ area: [4, 3, 6, 6], lit: false }] } : {}),
  // placeholders (Level column 0 is stone in the grid); the fixups make the stairs
  stairs: {
    up: { x: 0, y: 0, coords: 'level' },
    down: { x: 0, y: 1, coords: 'level' },
    branch: { x: 0, y: 2, coords: 'level' },
  },
  // des.teleport_region({ region = {01,00,79,20}, region_islev = 1, exclude = {2,2,6,6} })
  teleportRegions: [{ area: [0, 0, 78, 20], coords: 'level', exclude: [2, 2, 6, 6] }],
  contents,
});

/** ref: dat/fakewiz1.lua. Its id is its special level's (no monster has it). */
export const FAKEWIZ1: LevelDef = fakeDef(G.fakewiz1, [...RESIDENTS], true);

/** ref: dat/fakewiz2.lua */
export const FAKEWIZ2: LevelDef = fakeDef(
  G.fakewiz2,
  [
    ...RESIDENTS,
    // treasures
    { kind: 'object', class: 'amulet', ...at(4, 4) },
  ],
  false,
);

/** Both fake towers: the script in its order around the LevelDef's contents. */
const fixup = (portalTo?: DefId): SpLevFixup => ({
  before(ctx, level, def) {
    liftStairs(level);
    desMazeGrid(level);
    relayMap(level, def, FAKEWIZ);
    mazewalk(ctx, level, def, 8, 5, 'east', true, true, spLevMap(level, def));
  },
  after(ctx, level, def) {
    // des.levregion({ region = {01,00,79,20}, region_islev = 1, exclude = {0,0,8,8}, ... }) and
    // fakewiz1's des.levregion({ region = {4,4,4,4}, type = "portal", name = "wizard3" })
    finishTower(ctx, level, def, FAKEWIZ, [0, 0, 8, 8], portalTo);
  },
});

export const FAKEWIZ1_FIXUP: SpLevFixup = fixup(G.wizard3);
export const FAKEWIZ2_FIXUP: SpLevFixup = fixup();
