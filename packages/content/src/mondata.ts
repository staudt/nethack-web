// Monster data predicates. ref: include/mondata.h
import type { MonsterDef } from '@nh/core';

/** ref: include/mondata.h bigmonst(): MZ_LARGE and bigger. */
export function isBig(def: MonsterDef): boolean {
  return def.size === 'large' || def.size === 'huge' || def.size === 'gigantic';
}

/** ref: include/mondata.h nonliving(): undead and manes (our data has no other cases). */
export function nonliving(def: MonsterDef): boolean {
  return def.flags.includes('undead') || def.id === 'nh:manes';
}
