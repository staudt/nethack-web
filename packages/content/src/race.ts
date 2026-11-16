// The hero's race against monsters: your_race(), race_peaceful(), race_hostile(), the
// maybe_polyd() race tests, CANNIBAL_ALLOWED() and same_race(). A near-leaf (core, urole,
// racetab, upoly, eggstate, golem, mondata): peace_minded(), eating, polymorph, genocide,
// throwing and chatting ask it.
// ref: include/mondata.h your_race(), race_peaceful(), race_hostile(); src/mondata.c same_race();
// src/eat.c CANNIBAL_ALLOWED()
import type { Ctx, DefId, GameState, MonsterDef, Registry } from '@nh/core';
import { bigToLittle, littleToBig } from './eggstate';
import { isGolem } from './golem';
import { isDemon, isUnicorn } from './mondata';
import { RACES_TAB } from './racetab';
import { heroForm } from './upoly';
import { type RaceKey, raceIs, roleIs, urace } from './urole';

const has = (def: MonsterDef, f: string): boolean => def.flags.includes(f);
const anyOf = (def: MonsterDef, flags: readonly string[]): boolean =>
  flags.some((f) => has(def, f));

/** The monster is of the hero's own race (`mflags2 & urace.selfmask`). ref: include/mondata.h */
export const yourRace = (state: Readonly<GameState>, def: MonsterDef): boolean =>
  anyOf(def, RACES_TAB[urace(state)].selfmask);

/** Her race is always at peace with the monster's (`urace.lovemask`). ref: include/mondata.h */
export const racePeaceful = (state: Readonly<GameState>, def: MonsterDef): boolean =>
  anyOf(def, RACES_TAB[urace(state)].lovemask);

/** Her race is always at war with the monster's (`urace.hatemask`). ref: include/mondata.h */
export const raceHostile = (state: Readonly<GameState>, def: MonsterDef): boolean =>
  anyOf(def, RACES_TAB[urace(state)].hatemask);

/**
 * `maybe_polyd(is_<race>(youmonst.data), Race_if(PM_<RACE>))`: while polymorphed her form's race
 * flag decides, else her own race. ref: include/youprop.h maybe_polyd()
 */
export function polydRace(ctx: Pick<Ctx, 'state' | 'defs'>, race: RaceKey): boolean {
  const form = heroForm(ctx);
  return form ? has(form, RACES_TAB[race].monFlag) : urace(ctx.state) === race;
}

/** Cave dwellers and orcs may eat their own kind. ref: src/eat.c CANNIBAL_ALLOWED() */
export const cannibalAllowed = (state: Readonly<GameState>): boolean =>
  roleIs(state, 'caveman') || raceIs(state, 'orc');

/** Her race's monster (`mons[urace.mnum]`). */
export const raceMonId = (state: Readonly<GameState>): DefId => RACES_TAB[urace(state)].mnum;

const MIND_FLAYERS: readonly DefId[] = ['nh:mind_flayer', 'nh:master_mind_flayer'];
const RIDERS: readonly DefId[] = ['nh:death', 'nh:pestilence', 'nh:famine'];
const KOBOLDISH: readonly DefId[] = ['nh:kobold_zombie', 'nh:kobold_mummy'];
const GARGOYLES: readonly DefId[] = ['nh:gargoyle', 'nh:winged_gargoyle'];
const BEES: readonly DefId[] = ['nh:killer_bee', 'nh:queen_bee'];
const LONG_WORMS: readonly DefId[] = ['nh:long_worm', 'nh:long_worm_tail'];
/** The undead classes same_race() matches by letter: Z M V L W and the ghost's blank. */
const UNDEAD_LETS = 'ZMVLW ';

/** Two monster types are of the same species. ref: src/mondata.c same_race() */
export function sameRace(
  defs: Pick<Registry, 'isMonster'>,
  pm1: MonsterDef,
  pm2: MonsterDef,
): boolean {
  const let1 = pm1.glyph.ch;
  const let2 = pm2.glyph.ch;
  if (pm1.id === pm2.id) return true; // exact match
  // player races have their own predicates
  for (const f of ['human', 'elf', 'dwarf', 'gnome', 'orc']) if (has(pm1, f)) return has(pm2, f);
  // other creatures are less precise
  if (has(pm1, 'giant')) return has(pm2, 'giant'); // open to quibbling here
  if (isGolem(pm1)) return isGolem(pm2); // even moreso...
  if (MIND_FLAYERS.includes(pm1.id)) return MIND_FLAYERS.includes(pm2.id);
  if (let1 === 'k' || KOBOLDISH.includes(pm1.id)) return let2 === 'k' || KOBOLDISH.includes(pm2.id);
  if (let1 === 'O') return let2 === 'O';
  if (let1 === 'n') return let2 === 'n';
  if (let1 === 'C') return let2 === 'C';
  if (isUnicorn(pm1)) return isUnicorn(pm2);
  if (let1 === 'D') return let2 === 'D';
  if (let1 === 'N') return let2 === 'N';
  // other critters get steadily messier
  if (RIDERS.includes(pm1.id)) return RIDERS.includes(pm2.id); // debatable
  if (has(pm1, 'minion')) return has(pm2, 'minion'); // [needs work?]
  // tengu don't match imps (first test handled case of both being tengu)
  if (pm1.id === 'nh:tengu' || pm2.id === 'nh:tengu') return false;
  if (let1 === 'i') return let2 === 'i';
  // and minor demons (imps) don't match major demons
  else if (let2 === 'i') return false;
  if (isDemon(pm1)) return isDemon(pm2);
  if (has(pm1, 'undead')) {
    if (UNDEAD_LETS.includes(let1)) return let2 === let1;
  } else if (has(pm2, 'undead')) return false;
  // check for monsters which grow into more mature forms
  if (let1 === let2) {
    for (let prv = pm1.id, nxt = bigToLittle(defs, prv); nxt !== prv;) {
      if (nxt === pm2.id) return true;
      prv = nxt;
      nxt = bigToLittle(defs, nxt);
    }
    for (let prv = pm1.id, nxt = littleToBig(defs, prv); nxt !== prv;) {
      if (nxt === pm2.id) return true;
      prv = nxt;
      nxt = littleToBig(defs, nxt);
    }
  }
  // not caught by little/big handling
  if (GARGOYLES.includes(pm1.id)) return GARGOYLES.includes(pm2.id);
  if (BEES.includes(pm1.id)) return BEES.includes(pm2.id);
  if (LONG_WORMS.includes(pm1.id)) return LONG_WORMS.includes(pm2.id); // handles tail
  return false;
}
