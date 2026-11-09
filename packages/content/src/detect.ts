// Mapping the hero's memory from the real map: magic mapping's per-cell step and the periodic
// clairvoyance a temple donation gives. ref: src/detect.c show_map_spot(), do_vicinity_map();
// src/allmain.c moveloop_core() (`seer_turn`)
//
// Only terrain is mapped: the hero's memory holds no objects or monsters apart from what the
// view already shows, so clairvoyance reveals no objects and no "remembered, unseen" monsters,
// and never says "You sense your surroundings." (DEVIATIONS).
import {
  getLevel,
  getPlayer,
  newMemory,
  sortedIds,
  type Ctx,
  type Entity,
  type Level,
  type ModApi,
} from '@nh/core';
import { BOULDER, boulderCells } from './boulder';
import { nhData } from './items';
import { P, heroClairvoyant, heroHas } from './props';
import { T, setTerrain } from './terrain';

/**
 * Puts the real terrain of x,y into the hero's memory; a secret corridor is found (a secret door
 * is not: it stays remembered as the wall it looks like). Confused, 6 cells in 7 are skipped.
 * ref: src/detect.c show_map_spot() (no engravings, no #overview)
 */
export function showMapSpot(ctx: Ctx, level: Level, x: number, y: number, cnf: boolean): void {
  if (cnf && ctx.rng.rn2(7)) return;
  const memory = (ctx.state.memory[level.id] ??= newMemory(level));
  const i = y * level.width + x;
  if (level.palette[level.cells[i] ?? 0] === T.scorr) setTerrain(level, x, y, T.corr);
  memory[i] = level.cells[i] ?? 0;
}

/**
 * A `premapped` level (Sokoban) is known from the start: every cell but stone goes into the
 * hero's memory, every boulder is remembered and every trap is seen. NetHack skips only stone
 * that is non-diggable or non-passwall, which solidify_map() makes of all of Sokoban's stone, so
 * all stone is skipped here. Run when the level is made, after its contents and fixups.
 * ref: src/detect.c premap_detect(), skip_premap_detect(); src/sp_lev.c load_special()
 * (`if (gc.coder->premapped) premap_detect()`)
 */
export function premapDetect(ctx: Ctx, level: Level): void {
  const memory = (ctx.state.memory[level.id] ??= newMemory(level));
  const objMemory = (ctx.state.objectMemory[level.id] ??= {});
  const boulders = boulderCells(ctx, level);
  for (let i = 0; i < level.cells.length; i++) {
    const t = level.cells[i] ?? 0;
    if (level.palette[t] === T.stone) continue;
    memory[i] = t;
    if (boulders.has(i)) objMemory[String(i)] = BOULDER; // map_object(sobj_at(BOULDER))
  }
  for (const t of level.traps) t.seen = true; // tseen = 1; map_trap()
}

/**
 * Clairvoyance: maps the area around the hero, 9 columns to her left and 10 to her right, 5 rows
 * above and 6 below (never column 0). ref: src/detect.c do_vicinity_map() with no spellbook
 * (the random farsight of allmain.c)
 */
export function doVicinityMap(ctx: Ctx): void {
  const pos = getPlayer(ctx.state).c.pos;
  if (!pos) return;
  const level = getLevel(ctx.state);
  const loY = Math.max(pos.y - 5, 0);
  const hiY = pos.y + 6 >= level.height ? level.height - 1 : pos.y + 6;
  const loX = Math.max(pos.x - 9, 1);
  const hiX = pos.x + 10 >= level.width ? level.width - 1 : pos.x + 10;
  const cnf = heroHas(ctx.state, P.CONFUSION);
  for (let x = loX; x <= hiX; x++)
    for (let y = loY; y <= hiY; y++) showMapSpot(ctx, level, x, y, cnf);
}

/**
 * While the hero is clairvoyant, the area around her is mapped every 15 to 45 turns.
 * ref: src/allmain.c moveloop_core(): `if (moves >= seer_turn) { if (Clairvoyant)
 * do_vicinity_map(); seer_turn = moves + rn1(31, 15); }`. The counter only runs while she is
 * clairvoyant (C rolls it in every game; here that would move every replay), so the first
 * vision comes at once (DEVIATIONS).
 */
export function registerClairvoyance(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    if (!heroClairvoyant(ctx.state)) return;
    const d = nhData(ctx);
    if (ctx.state.turn < (d.seerTurn ?? 0)) return;
    doVicinityMap(ctx);
    d.seerTurn = ctx.state.turn + ctx.rng.rn2(31) + 15;
  });
}

/**
 * Detect monsters with no object: every monster of the level goes into the hero's monster
 * memory at its cell (it stays shown until the cell is seen again, where NetHack redraws the
 * map after browse_map()) and "You sense the presence of monsters." Returns true, saying
 * nothing, when the level has no monster (the caller gives its own feeling).
 * ref: src/detect.c monster_detect() with no class
 */
export function monsterDetect(ctx: Ctx): boolean {
  const level = getLevel(ctx.state);
  const mons: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (!e?.c.monster || id === ctx.state.playerId || e.c.pos?.level !== level.id) continue;
    mons.push(e);
  }
  if (mons.length === 0) return true;
  const memory = (ctx.state.monsterMemory[level.id] ??= {});
  for (const e of mons) {
    const p = e.c.pos;
    if (p) memory[String(p.y * level.width + p.x)] = e.def;
  }
  ctx.emit({ type: 'msg', key: 'cast.sense_monsters' });
  return false;
}
