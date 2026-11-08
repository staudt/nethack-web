// Spell numbers: each book's school and direction, the role's spellcasting table and the failure
// rate. ref: include/objects.h SPELL(); src/role.c roles[] (spelbase .. spelsbon); src/spell.c
// percent_success(), spell_skilltype(), spelltypemnemonic()
//
// A leaf module (core, skills, items, material, props): the `+` view and casting both read it.
import type { AttributesComponent, DefId, GameState, Registry, WandDir } from '@nh/core';
import { weight } from './items';
import { isMetallic } from './material';
import { wornIn } from './props';
import { P_BASIC, P_RESTRICTED, P_SKILLED, P_UNSKILLED, skillLevel } from './skills';

/** A book's spell school (oc_skill) and direction (oc_dir). */
export interface SpellInfo {
  skill: string;
  dir: WandDir;
}

/** ref: include/objects.h SPELL() for the books of the subset */
export const SPELL_INFO: Readonly<Record<DefId, SpellInfo>> = {
  'nh:spellbook_of_sleep': { skill: 'enchantment_spell', dir: 'ray' },
  'nh:spellbook_of_light': { skill: 'divination_spell', dir: 'nodir' },
  'nh:spellbook_of_detect_monsters': { skill: 'divination_spell', dir: 'nodir' },
  'nh:spellbook_of_healing': { skill: 'healing_spell', dir: 'immediate' },
  'nh:spellbook_of_force_bolt': { skill: 'attack_spell', dir: 'immediate' },
  'nh:spellbook_of_confuse_monster': { skill: 'enchantment_spell', dir: 'immediate' },
  'nh:spellbook_of_cure_blindness': { skill: 'healing_spell', dir: 'immediate' },
  'nh:spellbook_of_protection': { skill: 'cleric_spell', dir: 'nodir' },
  'nh:spellbook_of_jumping': { skill: 'escape_spell', dir: 'immediate' },
};

/** The spell school of a book, '' when unknown. ref: src/spell.c spell_skilltype() */
export const spellSkill = (book: DefId): string => SPELL_INFO[book]?.skill ?? '';

/** The school's name in the spell menus. ref: src/spell.c spelltypemnemonic() */
export const spellSchoolKey = (book: DefId): string =>
  `spell.school.${spellSkill(book).replace(/_spell$/, '')}`;

/** A role's spellcasting fields. ref: include/you.h struct Role spelbase .. spelsbon */
export interface RoleSpell {
  /** base spellcasting penalty */
  spelbase: number;
  /** penalty (-bonus) for healing spells */
  spelheal: number;
  /** penalty for wearing any shield */
  spelshld: number;
  /** penalty for wearing metal armour */
  spelarmr: number;
  /** the casting stat */
  spelstat: keyof AttributesComponent;
  /** the role's special spell (kept even when the book does not exist, for a mod to add it) */
  spelspec: DefId | null;
  /** bonus (-penalty) for the special spell */
  spelsbon: number;
}

/** ref: src/role.c roles[] Valkyrie `10, -2, 0, 9, A_WIS, SPE_CONE_OF_COLD, -4` */
export const ROLE_SPELL: Readonly<Record<DefId, RoleSpell>> = {
  'nh:valkyrie': {
    spelbase: 10,
    spelheal: -2,
    spelshld: 0,
    spelarmr: 9,
    spelstat: 'wis',
    spelspec: 'nh:spellbook_of_cone_of_cold',
    spelsbon: -4,
  },
};

/** The energy a spell of that level costs. ref: include/spell.h SPELL_LEV_PW() */
export const spellLevPw = (level: number): number => level * 5;

/** ref: src/spell.c uarmhbon, uarmgbon, uarmfbon */
const UARMHBON = 4; // Metal helmets interfere with the mind
const UARMGBON = 6; // Casting channels through the hands
const UARMFBON = 2; // All metal interferes to some degree

/** The books whose spells get the role's healing bonus (those of the subset). */
const HEALING_BONUS: ReadonlySet<DefId> = new Set([
  'nh:spellbook_of_healing',
  'nh:spellbook_of_cure_blindness',
]);

/** Integer square root, as C's simple odd-number loop. ref: src/hacklib.c isqrt() */
export function isqrt(val: number): number {
  let rt = 0;
  let odd = 1;
  while (val >= odd) {
    val -= odd;
    odd += 2;
    rt += 1;
  }
  return rt;
}

/**
 * The hero's chance (0..100) of casting the spell of `book`. ref: src/spell.c percent_success().
 * There is no Knight, so the paladin bonus never applies; no quarterstaff exists yet (the check
 * is by id); the robe is checked by id.
 */
export function percentSuccess(state: Readonly<GameState>, defs: Registry, book: DefId): number {
  const hero = state.entities[String(state.playerId)];
  const roleId: DefId = hero?.c.player?.role ?? 'nh:valkyrie';
  const role = ROLE_SPELL[roleId] ?? ROLE_SPELL['nh:valkyrie'];
  if (!hero || !role) return 0;
  const id = hero.id;
  const skilltype = spellSkill(book);
  const paladinBonus = false; // Role_if(PM_KNIGHT) && skilltype == P_CLERIC_SPELL

  let splcaster = role.spelbase;
  const special = role.spelheal;
  const statused = hero.c.attributes?.[role.spelstat] ?? 10;

  const uarm = wornIn(state, id, 'body');
  const uarmc = wornIn(state, id, 'cloak');
  const robe = uarmc?.def === 'nh:robe';
  if (uarm && isMetallic(defs.object(uarm.def)) && !paladinBonus)
    splcaster += robe ? Math.trunc(role.spelarmr / 2) : role.spelarmr;
  else if (robe) splcaster -= role.spelarmr;
  const uarms = wornIn(state, id, 'shield');
  if (uarms) splcaster += role.spelshld;

  if (wornIn(state, id, 'weapon')?.def === 'nh:quarterstaff') splcaster -= 3; // small bonus

  if (!paladinBonus) {
    const uarmh = wornIn(state, id, 'helm');
    if (uarmh && isMetallic(defs.object(uarmh.def))) splcaster += UARMHBON;
    const uarmg = wornIn(state, id, 'gloves');
    if (uarmg && isMetallic(defs.object(uarmg.def))) splcaster += UARMGBON;
    const uarmf = wornIn(state, id, 'boots');
    if (uarmf && isMetallic(defs.object(uarmf.def))) splcaster += UARMFBON;
  }

  if (book === role.spelspec) splcaster += role.spelsbon;
  // `healing spell' bonus
  if (HEALING_BONUS.has(book)) splcaster += special;
  if (splcaster > 20) splcaster = 20;

  // learned ability: the casting stat, then the difficulty by level and skill
  let chance = Math.trunc((11 * statused) / 2);
  const skill = Math.max(skillLevel({ state: state as GameState }, skilltype), P_UNSKILLED) - 1;
  const spellev = defs.object(book).spellbook?.level ?? 1;
  const ulevel = hero.c.experience?.level ?? 1;
  const difficulty = (spellev - 1) * 4 - (skill * 6 + Math.trunc(ulevel / 3) + 1);
  if (difficulty > 0) {
    chance -= isqrt(900 * difficulty + 2000); // too low level or unskilled
  } else {
    const learning = Math.trunc((15 * -difficulty) / spellev);
    chance += learning > 20 ? 20 : learning;
  }
  if (chance < 0) chance = 0;
  if (chance > 120) chance = 120;

  // anything but a light shield makes casting very awkward
  const smallShield = defs.object('nh:small_shield').weight;
  if (uarms && weight(defs, uarms, state) > smallShield) {
    chance = book === role.spelspec ? Math.trunc(chance / 2) : Math.trunc(chance / 4);
  }

  chance = Math.trunc((chance * (20 - splcaster)) / 15) - splcaster;
  if (chance > 100) chance = 100;
  if (chance < 0) chance = 0;
  return chance;
}

/**
 * A spell's damage adjusted by the hero's Intelligence (and level): -3 at Int 9 or less (never
 * below 1), +1 at Int 14-18, +2 at Int 19-24 (or Int 25 below XL 14), +3 at Int 25; no bonus
 * below XL 5. ref: src/zap.c spell_damage_bonus()
 */
export function spellDamageBonus(state: Readonly<GameState>, dmg: number): number {
  const hero = state.entities[String(state.playerId)];
  const intell = hero?.c.attributes?.int ?? 10; // ACURR(A_INT)
  const ulevel = hero?.c.experience?.level ?? 1;
  // punish low intelligence before low level else low intelligence gets punished only when
  // high level
  if (intell <= 9) {
    // -3 penalty, but never reduce combined amount below 1 (a 0 stays 0)
    if (dmg > 1) dmg = dmg <= 3 ? 1 : dmg - 3;
  } else if (intell <= 13 || ulevel < 5) {
    // no bonus or penalty
  } else if (intell <= 18) dmg += 1;
  else if (intell <= 24 || ulevel < 14) dmg += 2;
  else dmg += 3; // Int 25
  return dmg;
}

/**
 * The to-hit bonus of a spell's ray, by the hero's skill in its school and her Dexterity.
 * ref: src/zap.c spell_hit_bonus()
 */
export function spellHitBonus(state: Readonly<GameState>, book: DefId): number {
  const hero = state.entities[String(state.playerId)];
  const dex = hero?.c.attributes?.dex ?? 10; // ACURR(A_DEX)
  let hitBon: number;
  switch (skillLevel({ state: state as GameState }, spellSkill(book))) {
    case P_RESTRICTED:
    case P_UNSKILLED:
      hitBon = -4;
      break;
    case P_BASIC:
      hitBon = 0;
      break;
    case P_SKILLED:
      hitBon = 2;
      break;
    default: // P_EXPERT
      hitBon = 3;
      break;
  }
  if (dex < 4) hitBon -= 3;
  else if (dex < 6) hitBon -= 2;
  else if (dex < 8) hitBon -= 1;
  else if (dex >= 14) hitBon += dex - 14; // even increment for dexterous heroes
  return hitBon;
}
