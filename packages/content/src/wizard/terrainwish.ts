import { getLevel, getPlayer, itemsAt, type Ctx, type DefId } from '@nh/core';
import { showMapSpot } from '../detect';
import { FTN_LOOTED, FTN_MAGIC, setFountainBits } from '../fountain';
import { T, setTerrain, terrainIdAt } from '../terrain';
import { setThroneLooted } from '../thronestate';
import { isPool, waterbodyName } from '../liquid';
import { poolEffects, setUinwater, uinwater } from '../uwater';
import { waterDamageChain } from '../water';
import { flying, levitating } from '../trapstate';

/** The altar of each alignment word (align_str()). */
const ALTARS: Readonly<Record<string, DefId>> = {
  chaotic: T.altar_chaotic,
  neutral: T.altar_neutral,
  lawful: T.altar_lawful,
  unaligned: T.altar_unaligned,
};

/** The words readobjnam_preparse() takes off the front that matter here (or are ignored). */
const PREFIXES = ['looted ', 'blessed ', 'uncursed ', 'cursed '] as const;

/** "pool", "moat", "wall of water" (plain "water" is the potion). */
const WATERS: readonly [string, DefId][] = [
  ['wall of water', T.water],
  ['pool', T.pool],
  ['moat', T.moat],
];

/**
 * Wizard mode's terrain wishes, for the terrain that exists: "fountain" ("magic fountain",
 * "blessed fountain", "looted fountain"), "throne" ("looted throne"), "sink", "pool", "moat",
 * "wall of water" (what lies there gets wet), "lava" and "wall of lava" (she falls in unless
 * floating: pooleffects()), "ice", "altar" ("chaotic", "neutral", "lawful" or "unaligned altar";
 * else unaligned 1 time in 6, otherwise a random one of the three), "tree" and "iron bars", made
 * under the hero ("use at your own risk": stairs and traps are not checked). Leaving water she
 * was in takes her out of it. True when the wish named terrain. Graves, clouds, doors, walls,
 * secret corridors and floor are not offered, nor `set_wallprop_from_str()`'s nondiggable and
 * nonpasswall words; "melting ice" melts nothing yet (m15 step 3), lava burns nothing yet.
 * ref: src/objnam.c wizterrainwish() (after the traps)
 */
export function wizTerrainWish(ctx: Ctx, buf: string): boolean {
  let bp = buf.toLowerCase().replace(/^(an?|the) /, '');
  let looted = false;
  let blessed = false;
  for (let more = true; more;) {
    more = false;
    for (const p of PREFIXES) {
      if (!bp.startsWith(p)) continue;
      if (p === 'looted ') looted = true;
      if (p === 'blessed ') blessed = true;
      bp = bp.slice(p.length);
      more = true;
    }
  }
  const pos = getPlayer(ctx.state).c.pos;
  if (!pos) return false;
  const level = getLevel(ctx.state, pos.level);
  const { x, y } = pos;
  const oldtyp = terrainIdAt(level, x, y);
  const say = (key: string): void => ctx.emit({ type: 'msg', key });
  const say2 = (key: string, params: Record<string, string>): void =>
    ctx.emit({ type: 'msg', key, params });
  let made: DefId;
  if (bp.endsWith('fountain')) {
    made = T.fountain;
    setTerrain(level, x, y, made);
    const magic = blessed || bp.startsWith('magic ');
    setFountainBits(ctx, level.id, x, y, (looted ? FTN_LOOTED : 0) | (magic ? FTN_MAGIC : 0));
    say(magic ? 'wiz.terrain.magic_fountain' : 'wiz.terrain.fountain');
  } else if (bp.endsWith('throne')) {
    made = T.throne;
    setTerrain(level, x, y, made);
    setThroneLooted(ctx, level.id, x, y, looted);
    say('wiz.terrain.throne');
  } else if (bp.endsWith('sink')) {
    made = T.sink;
    setTerrain(level, x, y, made);
    say('wiz.terrain.sink');
  } else if (WATERS.some(([w]) => bp.endsWith(w))) {
    made = (WATERS.find(([w]) => bp.endsWith(w)) as [string, DefId])[1];
    setTerrain(level, x, y, made);
    say2('wiz.terrain.liquid', { what: `@${waterbodyName(ctx, level, x, y)}` });
    waterDamageChain(ctx, itemsAt(ctx.defs, ctx.state, level.id, x, y));
  } else if (bp.endsWith('lava')) {
    // also matches "molten lava"
    made = bp.endsWith('wall of lava') ? T.lavawall : T.lava;
    setTerrain(level, x, y, made);
    say(made === T.lava ? 'wiz.terrain.lava' : 'wiz.terrain.lavawall');
    if (!(levitating(ctx) || flying(ctx)) || made === T.lavawall) poolEffects(ctx, false);
  } else if (bp.endsWith('ice')) {
    made = T.ice;
    setTerrain(level, x, y, made);
    say('wiz.terrain.ice');
  } else if (bp.endsWith('altar')) {
    let al: string;
    if (bp.startsWith('chaotic ')) al = 'chaotic';
    else if (bp.startsWith('neutral ')) al = 'neutral';
    else if (bp.startsWith('lawful ')) al = 'lawful';
    else if (bp.startsWith('unaligned ')) al = 'unaligned';
    else if (!ctx.rng.rn2(6)) al = 'unaligned';
    else {
      const a = ctx.rng.rn2(3) - 1; // -1 - A_CHAOTIC, 0 - A_NEUTRAL, 1 - A_LAWFUL
      al = a < 0 ? 'chaotic' : a > 0 ? 'lawful' : 'neutral';
    }
    made = ALTARS[al] ?? T.altar_unaligned;
    setTerrain(level, x, y, made);
    say(`wiz.terrain.altar.${al}`);
  } else if (bp.endsWith('tree')) {
    made = T.tree;
    setTerrain(level, x, y, made);
    say('wiz.terrain.tree');
  } else if (bp.endsWith('bars')) {
    made = T.iron_bars;
    setTerrain(level, x, y, made);
    say('wiz.terrain.bars');
  } else return false;
  // the replaced terrain's flags go with it (lev->flags is overlaid)
  if (oldtyp === T.fountain && made !== T.fountain) setFountainBits(ctx, level.id, x, y, 0);
  if (oldtyp === T.throne && made !== T.throne) setThroneLooted(ctx, level.id, x, y, false);
  showMapSpot(ctx, level, x, y, false); // feel_newsym(): map the spot where the wish occurred
  // she might not be in the water any more
  const here = getPlayer(ctx.state).c.pos;
  if (uinwater(ctx) && here && !isPool(ctx, getLevel(ctx.state, here.level), here.x, here.y))
    setUinwater(ctx, false);
  return true;
}
