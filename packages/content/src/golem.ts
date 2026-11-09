// Golem data: fixed hit points per kind and the golem-only predicates. A leaf (types only) so
// generation, polymorph, drain and the damage types share it.
// ref: src/makemon.c golemhp(); include/mondata.h is_golem(), completelyburns(), completelyrots(),
// completelyrusts(), poly_when_stoned()
import type { DefId, MonsterDef } from '@nh/core';

/** ref: src/makemon.c golemhp(): a golem's fixed hit points (0 for anything else) */
const GOLEM_HP: Readonly<Record<string, number>> = {
  'nh:straw_golem': 20,
  'nh:paper_golem': 20,
  'nh:rope_golem': 30,
  'nh:leather_golem': 40,
  'nh:gold_golem': 60,
  'nh:wood_golem': 50,
  'nh:flesh_golem': 40,
  'nh:clay_golem': 70,
  'nh:stone_golem': 100,
  'nh:glass_golem': 80,
  'nh:iron_golem': 120,
};

/** ref: src/makemon.c golemhp() */
export function golemhp(id: DefId): number {
  return GOLEM_HP[id] ?? 0;
}

/** ref: include/mondata.h is_golem(): S_GOLEM (`'`) */
export const isGolem = (d: MonsterDef): boolean => d.glyph.ch === "'";

/** ref: include/mondata.h completelyburns(): paper and straw golems */
export const completelyburns = (id: DefId): boolean =>
  id === 'nh:paper_golem' || id === 'nh:straw_golem';

/** ref: include/mondata.h completelyrots(): wood and leather golems */
export const completelyrots = (id: DefId): boolean =>
  id === 'nh:wood_golem' || id === 'nh:leather_golem';

/** ref: include/mondata.h completelyrusts(): iron golems */
export const completelyrusts = (id: DefId): boolean => id === 'nh:iron_golem';

/**
 * A golem other than a stone golem turns into one instead of to stone, while stone golems are
 * not genocided. ref: include/mondata.h poly_when_stoned()
 */
export const polyWhenStoned = (d: MonsterDef, stoneGolemGenocided: boolean): boolean =>
  isGolem(d) && d.id !== 'nh:stone_golem' && !stoneGolemGenocided;
