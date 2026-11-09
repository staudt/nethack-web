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

// ---------------------------------------------------------------------------------------------
// body predicates (ref: include/mondata.h), used for monsters and for the polymorphed hero's form

const has = (def: MonsterDef, f: string): boolean => def.flags.includes(f);

/** ref: include/monflag.h MZ_TINY..MZ_GIGANTIC: the msize numbers (MZ_HUMAN is MZ_MEDIUM) */
const MSIZE: Readonly<Record<MonsterDef['size'], number>> = {
  tiny: 0,
  small: 1,
  medium: 2,
  large: 3,
  huge: 4,
  gigantic: 7,
};
/** ref: include/mondata.h ptr->msize */
export const msize = (def: MonsterDef): number => MSIZE[def.size];
/** ref: include/monflag.h MZ_HUMAN */
export const MZ_HUMAN = 2;
/** ref: include/monflag.h MZ_HUGE */
export const MZ_HUGE = 4;
/** ref: include/weight.h WT_HUMAN */
export const WT_HUMAN = 1450;

/** ref: include/mondata.h verysmall() */
export const verysmall = (def: MonsterDef): boolean => def.size === 'tiny';
/** ref: include/mondata.h noncorporeal(): S_GHOST */
export const noncorporeal = (def: MonsterDef): boolean => def.glyph.ch === ' ';
/** ref: include/mondata.h is_whirly(): vortices and the air elemental */
export const isWhirlyDef = (def: MonsterDef): boolean =>
  def.glyph.ch === 'v' || def.id === 'nh:air_elemental';
const smallOrUnder = (def: MonsterDef): boolean => def.size === 'tiny' || def.size === 'small';

/** ref: include/mondata.h nolimbs(): M1_NOLIMBS (which has the M1_NOHANDS and M1_NOHEAD bits) */
export const nolimbs = (def: MonsterDef): boolean => has(def, 'nolimbs');
/** ref: include/mondata.h nohands(): M1_NOHANDS, also set by M1_NOLIMBS */
export const nohands = (def: MonsterDef): boolean => has(def, 'nohands') || nolimbs(def);
/** ref: include/mondata.h has_head(): no M1_NOHEAD bit (M1_NOLIMBS has it) */
export const hasHead = (def: MonsterDef): boolean => !has(def, 'nohead') && !nolimbs(def);
/** ref: include/mondata.h notake() */
export const notake = (def: MonsterDef): boolean => has(def, 'notake');
/** ref: include/mondata.h cantwield(): nohands or verysmall */
export const cantwield = (def: MonsterDef): boolean => nohands(def) || verysmall(def);
/** ref: include/mondata.h slithy() */
export const slithy = (def: MonsterDef): boolean => has(def, 'slithy');
/** ref: include/mondata.h humanoid() */
export const humanoid = (def: MonsterDef): boolean => has(def, 'humanoid');
/** ref: include/mondata.h strongmonst() */
export const strongmonst = (def: MonsterDef): boolean => has(def, 'strong');
/** ref: include/mondata.h is_flyer() */
export const isFlyer = (def: MonsterDef): boolean => has(def, 'fly');
/** ref: include/mondata.h is_clinger() */
export const isClinger = (def: MonsterDef): boolean => has(def, 'cling');
/** ref: include/mondata.h carnivorous(): M1_CARNIVORE (M1_OMNIVORE has it) */
export const carnivorous = (def: MonsterDef): boolean =>
  has(def, 'carnivore') || has(def, 'omnivore');
/** ref: include/mondata.h herbivorous(): M1_HERBIVORE (M1_OMNIVORE has it) */
export const herbivorous = (def: MonsterDef): boolean =>
  has(def, 'herbivore') || has(def, 'omnivore');

/**
 * ref: include/mondata.h vegan(): blobs, jellies, fungi, vortices, lights, elementals but the
 * stalker, noncorporeal monsters (no golems in the roster)
 */
export function vegan(def: MonsterDef): boolean {
  const ch = def.glyph.ch;
  if ('bjFvy '.includes(ch)) return true;
  return ch === 'E' && def.id !== 'nh:stalker';
}

/** ref: src/mondata.c sliparm(): whirly, small or under, or noncorporeal */
export const sliparm = (def: MonsterDef): boolean =>
  isWhirlyDef(def) || smallOrUnder(def) || noncorporeal(def);

/** ref: src/mondata.c breakarm(): creatures that break out of armor */
export const breakarm = (def: MonsterDef): boolean =>
  !sliparm(def) &&
  (isBig(def) ||
    (!smallOrUnder(def) && !humanoid(def)) ||
    def.id === 'nh:marilith' ||
    def.id === 'nh:winged_gargoyle');

/** ref: include/mondata.h cantweararm(): breakarm() or sliparm() */
export const cantweararm = (def: MonsterDef): boolean => breakarm(def) || sliparm(def);

const HORNED: readonly string[] = [
  'nh:horned_devil',
  'nh:minotaur',
  'nh:asmodeus',
  'nh:balrog',
  'nh:white_unicorn',
  'nh:gray_unicorn',
  'nh:black_unicorn',
  'nh:ki_rin',
];
/** ref: src/mondata.c num_horns(): 1 for the unicorns and the ki-rin, 2 for the others */
export const numHorns = (def: MonsterDef): number =>
  !HORNED.includes(def.id) ? 0 : def.glyph.ch === 'u' || def.id === 'nh:ki_rin' ? 1 : 2;
/** ref: include/mondata.h has_horns() */
export const hasHorns = (def: MonsterDef): boolean => numHorns(def) > 0;

/** ref: include/obj.h WrappingAllowed() */
export const wrappingAllowed = (def: MonsterDef): boolean =>
  humanoid(def) &&
  def.size !== 'tiny' &&
  def.size !== 'gigantic' &&
  !noncorporeal(def) &&
  def.glyph.ch !== 'C' &&
  def.id !== 'nh:winged_gargoyle' &&
  def.id !== 'nh:marilith';

/** ref: include/mondata.h amorphous(): M1_AMORPHOUS */
export const amorphous = (def: MonsterDef): boolean => has(def, 'amorphous');

/**
 * True if the monster type is especially affected by silver weapons: were creatures (both
 * forms), vampires, demons, the shade and the imps but the tengu. mon_hates_silver() adds
 * vampire shapeshifters, which do not exist yet, so it is this test on the monster's def.
 * ref: src/mondata.c hates_silver(), mon_hates_silver()
 */
export const hatesSilver = (def: MonsterDef): boolean =>
  has(def, 'were') ||
  def.glyph.ch === 'V' ||
  has(def, 'demon') ||
  def.id === 'nh:shade' ||
  (def.glyph.ch === 'i' && def.id !== 'nh:tengu');

/**
 * The monster has a sense of smell: not golems, spheres, jellies, puddings, blobs, vortices,
 * elementals, fungi or lights. ref: src/mondata.c olfaction()
 */
export const olfaction = (def: MonsterDef): boolean => !"'ejPbvEFy".includes(def.glyph.ch);
