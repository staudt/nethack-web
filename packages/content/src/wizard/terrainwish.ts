import { getLevel, getPlayer, type Ctx, type DefId } from '@nh/core';
import { showMapSpot } from '../detect';
import { FTN_LOOTED, FTN_MAGIC, setFountainBits } from '../fountain';
import { T, setTerrain, terrainIdAt } from '../terrain';
import { setThroneLooted } from '../thronestate';

/** The altar of each alignment word (align_str()). */
const ALTARS: Readonly<Record<string, DefId>> = {
  chaotic: T.altar_chaotic,
  neutral: T.altar_neutral,
  lawful: T.altar_lawful,
  unaligned: T.altar_unaligned,
};

/** The words readobjnam_preparse() takes off the front that matter here (or are ignored). */
const PREFIXES = ['looted ', 'blessed ', 'uncursed ', 'cursed '] as const;

/**
 * Wizard mode's terrain wishes, for the terrain that exists: "fountain" ("magic fountain",
 * "blessed fountain", "looted fountain"), "throne" ("looted throne"), "sink", "altar" ("chaotic",
 * "neutral", "lawful" or "unaligned altar"; else unaligned 1 time in 6, otherwise a random one of
 * the three), "tree" and "iron bars", made under the hero ("use at your own risk": stairs and
 * traps are not checked). True when the wish named terrain. Pools, lava, ice, graves, clouds,
 * doors, walls, secret corridors and floor are not offered, nor `set_wallprop_from_str()`'s
 * nondiggable and nonpasswall words. ref: src/objnam.c wizterrainwish() (after the traps)
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
  return true;
}
