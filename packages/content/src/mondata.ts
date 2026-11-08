// Monster data predicates. ref: include/mondata.h
import type { DefId, MonsterDef } from '@nh/core';

/** ref: include/mondata.h bigmonst(): MZ_LARGE and bigger. */
export function isBig(def: MonsterDef): boolean {
  return def.size === 'large' || def.size === 'huge' || def.size === 'gigantic';
}

/** ref: include/mondata.h nonliving(): undead and manes (our data has no other cases). */
export function nonliving(def: MonsterDef): boolean {
  return def.flags.includes('undead') || def.id === 'nh:manes';
}

/**
 * ref: include/mondata.h vegetarian(): vegan (blobs, jellies, fungi, vortices, lights,
 * elementals but stalkers; no golems or ghosts in the roster) or a pudding but the black one
 */
export function vegetarian(def: MonsterDef): boolean {
  const ch = def.glyph.ch;
  if ('bjFvy'.includes(ch)) return true;
  if (ch === 'E') return def.id !== 'nh:stalker';
  return ch === 'P' && def.id !== 'nh:black_pudding';
}

/** A monster type's name as the player types it (lower case). */
export interface MonName {
  id: DefId;
  name: string;
}

/**
 * The monster type a typed name starts with, and the text after the matched part. The longest
 * name that is the whole string, or is followed by a space, "s", "'", "'s" or "es", wins; an
 * exact match ends the search. "a "/"an "/"the " are skipped and "-ies"/"-ves"/"vortices" plurals
 * are folded first. `names` is in registry order, lower case (see objnam_read.ts wishNames()).
 * ref: src/mondata.c name_to_monplus(), without the alternate spellings table, gendered names
 * and rank titles (title_to_mon())
 */
export function nameToMonplus(
  names: readonly MonName[],
  input: string,
): { mon: DefId; rest: string } | null {
  const lower = input.toLowerCase();
  const art = /^(a|an|the) /.exec(lower)?.[0] ?? '';
  let str = lower.slice(art.length);
  const vort = str.indexOf('vortices');
  if (vort >= 0) str = str.slice(0, vort + 4) + 'ex' + str.slice(vort + 8);
  else if (str.length > 3 && str.endsWith('ies') && !(str.length >= 7 && str.endsWith('zombies')))
    str = str.slice(0, -3) + 'y';
  else if (str.length > 3 && str.endsWith('ves')) str = str.slice(0, -3) + 'f';
  let best: MonName | null = null;
  let len = 0;
  for (const m of names) {
    const n = m.name.length;
    if (n <= len || n === 0 || !str.startsWith(m.name)) continue;
    if (n === str.length) {
      best = m;
      len = n;
      break; // exact match
    }
    const after = str.slice(n);
    if (
      after[0] === ' ' ||
      after === 's' ||
      after.startsWith('s ') ||
      after === "'" ||
      after.startsWith("' ") ||
      after === "'s" ||
      after.startsWith("'s ") ||
      after === 'es' ||
      after.startsWith('es ')
    ) {
      best = m;
      len = n;
    }
  }
  if (!best) return null;
  return { mon: best.id, rest: input.slice(art.length + len) };
}

/** ref: src/mondata.c name_to_mon(): the monster type a typed name starts with, or null */
export const nameToMon = (names: readonly MonName[], input: string): DefId | null =>
  nameToMonplus(names, input)?.mon ?? null;
