// The level temperature: Gehennom is hot (+1) but for its temperate levels (the Valley) and the
// cold mazes hellfill makes (-1); elsewhere 0. It gives the arrival lines, breaks potions landing
// on the hot ground (flooreffects.ts), favours fire- or cold-resistant random monsters
// (generation.ts) and makes lava walls freeze for a moment more or less often (ice.ts).
// A leaf over levelflags.ts.
// ref: src/mklev.c makelevel() (`temperature = In_hell(&u.uz) ? 1 : 0`); src/sp_lev.c
// lspo_level_flags() ("temperate", "hot", "cold"); src/do.c hellish_smoke_mesg(),
// temperature_change_msg(); src/makemon.c temperature_shift()
import type { Ctx, Level, MonsterDef } from '@nh/core';
import { inHell, levelFlags, madeLevelFlags } from './levelflags';
import { olfaction } from './mondata';

/**
 * The level's temperature: what it got when made (hellfill's "cold"), else 0 for a "temperate"
 * level, else 1 in Gehennom and 0 elsewhere.
 */
export function levelTemperature(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Readonly<Level>,
): -1 | 0 | 1 {
  const made = madeLevelFlags(ctx.state, level.id).temperature;
  if (made !== undefined) return made;
  if (levelFlags(ctx, level).temperate === true) return 0;
  return inHell(ctx.state, level) ? 1 : 0;
}

/**
 * A random monster's extra weight on a hot level for a fire resistant kind, on a cold one for a
 * cold resistant kind: 3, else 0. ref: src/makemon.c temperature_shift()
 */
export function temperatureShift(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  level: Readonly<Level>,
  def: MonsterDef,
): number {
  const t = levelTemperature(ctx, level);
  if (t === 0) return 0;
  return def.resists.includes(t > 0 ? 'fire' : 'cold') ? 3 : 0;
}

const say = (ctx: Ctx, key: string, params?: Record<string, string>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * "It is hot here." or "It is cold here.", then in Gehennom on a hot level "You smell smoke..."
 * ("sense" in a form without a sense of smell). ref: src/do.c hellish_smoke_mesg()
 */
export function hellishSmokeMesg(ctx: Ctx, level: Readonly<Level>, form: MonsterDef | null): void {
  const t = levelTemperature(ctx, level);
  if (t) say(ctx, t > 0 ? 'temperature.hot' : 'temperature.cold');
  if (inHell(ctx.state, level) && t > 0)
    say(ctx, 'temperature.smoke', { verb: !form || olfaction(form) ? 'smell' : 'sense' });
}

/**
 * On a level change: when the temperature differs from the previous level's, the new level's
 * lines, else "The heat and smoke are gone." (leaving Gehennom's heat; "The heat is gone." from
 * a hot level outside it) or "You are out of the cold.". ref: src/do.c temperature_change_msg()
 */
export function temperatureChangeMsg(
  ctx: Ctx,
  from: Readonly<Level>,
  to: Readonly<Level>,
  form: MonsterDef | null,
): void {
  const prev = levelTemperature(ctx, from);
  const now = levelTemperature(ctx, to);
  if (prev === now) return;
  if (now) hellishSmokeMesg(ctx, to, form);
  else if (prev > 0)
    say(ctx, inHell(ctx.state, from) ? 'temperature.heat_smoke_gone' : 'temperature.heat_gone');
  else if (prev < 0) say(ctx, 'temperature.out_of_cold');
}
