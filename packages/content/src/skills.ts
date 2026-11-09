// Weapon skills. ref: src/weapon.c skill_init(), use_skill(), enhance_weapon_skill(), weapon_hit_bonus(), weapon_dam_bonus();
// src/u_init.c Skill_V
import { type ActionDef, type Ctx, type Msg, type ObjectDef, inventoryOf } from '@nh/core';
import { nhData } from './items';

/** ref: include/skills.h P_ISRESTRICTED..P_GRAND_MASTER */
export const P_RESTRICTED = 0;
export const P_UNSKILLED = 1;
export const P_BASIC = 2;
export const P_SKILLED = 3;
export const P_EXPERT = 4;

/** The pseudo-skill for fighting without a weapon. ref: include/skills.h P_BARE_HANDED_COMBAT */
export const BARE_HANDED = 'bare_handed';

/**
 * The Valkyrie's skill maximums. ref: src/u_init.c Skill_V[]. Skills not listed are restricted.
 * The spell, riding and two-weapon entries are kept for completeness; nothing uses them yet.
 */
export const SKILL_V: Readonly<Record<string, number>> = {
  dagger: P_EXPERT,
  axe: P_EXPERT,
  pick_axe: P_SKILLED,
  short_sword: P_SKILLED,
  broad_sword: P_SKILLED,
  long_sword: P_EXPERT,
  two_handed_sword: P_EXPERT,
  saber: P_BASIC,
  hammer: P_EXPERT,
  quarterstaff: P_BASIC,
  polearms: P_SKILLED,
  spear: P_EXPERT,
  trident: P_BASIC,
  lance: P_SKILLED,
  sling: P_BASIC,
  attack_spell: P_BASIC,
  escape_spell: P_BASIC,
  riding: P_SKILLED,
  two_weapon: P_SKILLED,
  [BARE_HANDED]: P_EXPERT,
};

/** ref: include/global.h MAXULEV (hero.ts has the same constant; importing it would make a cycle) */
const MAXULEV = 30;

/** ref: include/skills.h P_SKILL_LIMIT: the most advancements ever made */
export const P_SKILL_LIMIT = 60;

/** ref: include/skills.h practice_needed_to_advance(level) */
export const practiceNeededToAdvance = (level: number): number => level * level * 20;

/**
 * Every skill in NetHack's menu order: fighting skills, weapons, spells. ref: include/skills.h
 * P_FIRST_H_TO_H.., P_FIRST_WEAPON..P_LAST_WEAPON, P_FIRST_SPELL..P_LAST_SPELL and
 * src/weapon.c skill_ranges[]. Skills no role entry mentions simply stay restricted.
 */
export const SKILL_GROUPS: readonly { id: string; skills: readonly string[] }[] = [
  { id: 'fighting', skills: [BARE_HANDED, 'two_weapon', 'riding'] },
  {
    id: 'weapon',
    skills: [
      'dagger',
      'knife',
      'axe',
      'pick_axe',
      'short_sword',
      'broad_sword',
      'long_sword',
      'two_handed_sword',
      'saber',
      'club',
      'mace',
      'morning_star',
      'flail',
      'hammer',
      'quarterstaff',
      'polearms',
      'spear',
      'trident',
      'lance',
      'bow',
      'sling',
      'crossbow',
      'dart',
      'shuriken',
      'boomerang',
      'whip',
      'unicorn_horn',
    ],
  },
  {
    id: 'spell',
    skills: [
      'attack_spell',
      'healing_spell',
      'divination_spell',
      'enchantment_spell',
      'cleric_spell',
      'escape_spell',
      'matter_spell',
    ],
  },
];

type SkillCtx = Pick<Ctx, 'state'>;

/** The skill's group id: 'fighting', 'weapon' or 'spell'. */
const groupOf = (skill: string): string =>
  SKILL_GROUPS.find((g) => g.skills.includes(skill))?.id ?? 'weapon';

/**
 * Sets the hero's starting skills: every skill is restricted, weapons in the inventory are
 * Basic, then the role's skills not already set become Unskilled; each skill's maximum and
 * practice counter are set, and the hero starts with 2 unused slots.
 * ref: src/weapon.c skill_init(), src/u_init.c u_init() (u.weapon_slots = 2).
 * Skipped: the ammo exception (ammo is skipped only for launchers we lack), magic skills,
 * riding a steed, unrestrict_weapon_skill() for the role's special spell.
 */
export function skillInit(ctx: Pick<Ctx, 'state' | 'defs'>, heroId: number): void {
  const skills: Record<string, number> = {};
  for (const o of inventoryOf(ctx.state, heroId)) {
    const w = ctx.defs.object(o.def).weapon;
    if (w) skills[w.skill] = P_BASIC;
  }
  const maxima: Record<string, number> = {};
  for (const name of Object.keys(SKILL_V).sort()) {
    maxima[name] = SKILL_V[name] ?? P_RESTRICTED;
    if (skills[name] === undefined) skills[name] = P_UNSKILLED;
  }
  // "High potential fighters already know how to use their hands": only when max > Expert.
  const advance: Record<string, number> = {};
  for (const name of Object.keys(skills).sort()) {
    advance[name] = practiceNeededToAdvance((skills[name] ?? P_UNSKILLED) - 1);
  }
  const data = nhData(ctx);
  data.skills = skills;
  data.skillMax = maxima;
  data.skillAdvance = advance;
  data.weaponSlots = 2;
  data.skillsAdvanced = 0;
}

/**
 * A bladed weapon: a weapon-class object of the dagger .. saber skills (daggers and the dwarvish
 * mattock included, axes and polearms not). ref: include/obj.h is_blade()
 */
export function isBlade(def: ObjectDef): boolean {
  const weapons = SKILL_GROUPS.find((g) => g.id === 'weapon')?.skills ?? [];
  const sk = def.weapon ? weapons.indexOf(def.weapon.skill) : -1;
  return (
    def.class === 'weapon' && sk >= weapons.indexOf('dagger') && sk <= weapons.indexOf('saber')
  );
}

/**
 * A polearm or lance: a weapon or tool of the P_POLEARMS or P_LANCE skill, applied at range.
 * ref: include/obj.h is_pole()
 */
export const isPole = (def: ObjectDef): boolean =>
  (def.class === 'weapon' || def.class === 'tool') &&
  (def.weapon?.skill === 'polearms' || def.weapon?.skill === 'lance');

/** The hero's current level in a skill (restricted = 0 when absent). */
export function skillLevel(ctx: SkillCtx, skill: string): number {
  return nhData(ctx).skills?.[skill] ?? P_RESTRICTED;
}

const skillMax = (ctx: SkillCtx, skill: string): number =>
  nhData(ctx).skillMax?.[skill] ?? SKILL_V[skill] ?? P_RESTRICTED;

const skillAdvance = (ctx: SkillCtx, skill: string): number =>
  nhData(ctx).skillAdvance?.[skill] ?? 0;

/** Unused skill slots. ref: u.weapon_slots */
export const weaponSlots = (ctx: SkillCtx): number => nhData(ctx).weaponSlots ?? 0;

/**
 * Slots needed to advance the skill one level. ref: src/weapon.c slots_required():
 * weapons and two-weapon combat cost the current level, the rest (fighting, riding, spells)
 * cost (level + 1) / 2.
 */
export function slotsRequired(ctx: SkillCtx, skill: string): number {
  const tmp = skillLevel(ctx, skill);
  if (groupOf(skill) === 'weapon' || skill === 'two_weapon') return tmp;
  return Math.trunc((tmp + 1) / 2);
}

/** Whether the skill has the practice for its next level (the shared part of can/could). */
function practiced(ctx: SkillCtx, skill: string): boolean {
  const lvl = skillLevel(ctx, skill);
  if (lvl === P_RESTRICTED || lvl >= skillMax(ctx, skill)) return false;
  if ((nhData(ctx).skillsAdvanced ?? 0) >= P_SKILL_LIMIT) return false;
  return skillAdvance(ctx, skill) >= practiceNeededToAdvance(lvl);
}

/** ref: src/weapon.c can_advance(): practiced enough and the slots are there. */
export function canAdvance(ctx: SkillCtx, skill: string): boolean {
  return practiced(ctx, skill) && weaponSlots(ctx) >= slotsRequired(ctx, skill);
}

/** ref: src/weapon.c could_advance(): practiced enough, but too few slots. */
export function couldAdvance(ctx: SkillCtx, skill: string): boolean {
  return practiced(ctx, skill);
}

/** ref: src/weapon.c peaked_skill(): at its maximum with enough practice for more. */
export function peakedSkill(ctx: SkillCtx, skill: string): boolean {
  const lvl = skillLevel(ctx, skill);
  if (lvl === P_RESTRICTED) return false;
  return lvl >= skillMax(ctx, skill) && skillAdvance(ctx, skill) >= practiceNeededToAdvance(lvl);
}

/** "You feel more confident in your weapon skills." ref: src/weapon.c give_may_advance_msg() */
function giveMayAdvanceMsg(ctx: Pick<Ctx, 'emit'>, skill: string | null): void {
  ctx.emit({
    type: 'msg',
    key:
      skill === null
        ? 'skill.confident'
        : groupOf(skill) === 'weapon'
          ? 'skill.confident.weapon'
          : groupOf(skill) === 'spell'
            ? 'skill.confident.spell'
            : 'skill.confident.fighting',
  });
}

/**
 * The skill was used: `degree` practice points, and the "more confident" message when this
 * made it advanceable. ref: src/weapon.c use_skill()
 */
export function useSkill(ctx: Pick<Ctx, 'state' | 'emit'>, skill: string, degree: number): void {
  if (skillLevel(ctx, skill) === P_RESTRICTED) return;
  const before = canAdvance(ctx, skill);
  const data = nhData(ctx);
  const adv = (data.skillAdvance ??= {});
  adv[skill] = (adv[skill] ?? 0) + degree;
  if (!before && canAdvance(ctx, skill)) giveMayAdvanceMsg(ctx, skill);
}

/** All unrestricted skills, in menu order. */
function knownSkills(ctx: SkillCtx): string[] {
  return SKILL_GROUPS.flatMap((g) => g.skills).filter((s) => skillLevel(ctx, s) !== P_RESTRICTED);
}

/**
 * Gains `n` skill slots (a level was gained); says so when that made more skills advanceable.
 * ref: src/weapon.c add_weapon_skill()
 */
export function addWeaponSkill(ctx: Pick<Ctx, 'state' | 'emit'>, n: number): void {
  const all = knownSkills(ctx);
  const before = all.filter((s) => canAdvance(ctx, s)).length;
  const data = nhData(ctx);
  data.weaponSlots = (data.weaponSlots ?? 0) + n;
  const after = all.filter((s) => canAdvance(ctx, s)).length;
  if (before < after) giveMayAdvanceMsg(ctx, null);
}

/**
 * Loses `n` skill slots (levels were drained): first the unused ones, then the last skill
 * advanced drops a level and refunds the rest of the slots it took. An advancement made before
 * m9 step 7 (an older save) has no record and is not taken back.
 * ref: src/weapon.c lose_weapon_skill()
 */
export function loseWeaponSkill(ctx: Pick<Ctx, 'state'>, n: number): void {
  const data = nhData(ctx);
  while (--n >= 0) {
    // deduct first from unused slots then from last placed one, if any
    if (weaponSlots(ctx)) {
      data.weaponSlots = weaponSlots(ctx) - 1;
    } else if (data.skillsAdvanced && data.skillRecord?.length) {
      const skill = data.skillRecord.pop()!;
      data.skillsAdvanced--;
      const skills = (data.skills ??= {});
      skills[skill] = (skills[skill] ?? P_UNSKILLED + 1) - 1; // drop skill one level
      // Lost skill might have taken more than one slot; refund rest.
      data.weaponSlots = slotsRequired(ctx, skill) - 1;
    }
  }
}

/**
 * Forgets `n` of the skills advanced (picked at random from those on record): each drops a level,
 * refunds its slots and keeps only the practice of the level below; "You forget some of your
 * training in long sword." An advancement made before m9 step 7 (an older save) has no record.
 * ref: src/weapon.c drain_weapon_skill()
 */
export function drainWeaponSkill(ctx: Pick<Ctx, 'state' | 'emit' | 'rng'>, n: number): void {
  const data = nhData(ctx);
  const drained = new Set<string>();
  while (--n >= 0) {
    const record = data.skillRecord ?? [];
    if (!data.skillsAdvanced || !record.length) continue;
    // pick a random skill, deleting it from the list
    const i = ctx.rng.rn2(record.length);
    const skill = record[i]!;
    record.splice(i, 1);
    drained.add(skill);
    data.skillsAdvanced--;
    const skills = (data.skills ??= {});
    const lvl = (skills[skill] ?? P_UNSKILLED + 1) - 1; // drop skill one level
    skills[skill] = lvl;
    // refund slots used for skill
    data.weaponSlots = weaponSlots(ctx) + slotsRequired(ctx, skill);
    // drain skill training to a value appropriate for new level
    const curradv = practiceNeededToAdvance(lvl);
    const prevadv = practiceNeededToAdvance(lvl - 1);
    const adv = (data.skillAdvance ??= {});
    if ((adv[skill] ?? 0) >= curradv) adv[skill] = prevadv + ctx.rng.rn2(curradv - prevadv);
  }
  // in skill-number order: weapons, spells, then the fighting skills
  const order = [...SKILL_GROUPS.slice(1), ...SKILL_GROUPS.slice(0, 1)].flatMap((g) => g.skills);
  for (const skill of order)
    if (drained.has(skill))
      ctx.emit({
        type: 'msg',
        key: (data.skills?.[skill] ?? 0) >= P_BASIC ? 'skill.forget.some' : 'skill.forget',
        params: { skill: { key: `skill.${skill}` } },
      });
}

/** ref: src/weapon.c skill_advance(): spends the slots and raises the level. */
function skillAdvanceNow(ctx: Pick<Ctx, 'state' | 'emit'>, skill: string): void {
  const data = nhData(ctx);
  data.weaponSlots = weaponSlots(ctx) - slotsRequired(ctx, skill);
  const skills = (data.skills ??= {});
  skills[skill] = (skills[skill] ?? P_UNSKILLED) + 1;
  (data.skillRecord ??= []).push(skill); // u.skill_record[u.skills_advanced++]
  data.skillsAdvanced = (data.skillsAdvanced ?? 0) + 1;
  ctx.emit({
    type: 'msg',
    key: (skills[skill] ?? 0) >= skillMax(ctx, skill) ? 'skill.advanced.most' : 'skill.advanced',
    params: { skill: { key: `skill.${skill}` } },
  });
}

const LEVEL_NAMES = ['', 'unskilled', 'basic', 'skilled', 'expert', 'master', 'grand_master'];

/** One menu line: "dagger [Basic]" with NetHack's "*" / "#" flags. ref: add_skills_to_menu() */
function skillLine(ctx: SkillCtx, skill: string, flags: boolean): Msg {
  let mark = '';
  if (flags && !canAdvance(ctx, skill)) {
    mark = couldAdvance(ctx, skill) ? '* ' : peakedSkill(ctx, skill) ? '# ' : '  ';
  }
  return {
    key: 'enhance.entry',
    params: {
      mark,
      skill: { key: `skill.${skill}` },
      level: { key: `skill.level.${LEVEL_NAMES[skillLevel(ctx, skill)] ?? 'unskilled'}` },
    },
  };
}

/**
 * `#enhance`. ref: src/weapon.c enhance_weapon_skill(): when any skill can be advanced a
 * single-choice menu "Pick a skill to advance:" is shown, and choosing one spends the slots
 * (the command is free); otherwise the current skills are listed. After an advance, "You feel
 * you could be more dangerous!" says another skill can still be advanced. The menu lists only
 * the advanceable skills (a prompt option cannot be a non-selectable line), and the skills
 * that cannot be advanced yet are listed by the no-choice form.
 */
export const enhanceAction: ActionDef = {
  id: 'nh:enhance',
  labelKey: 'action.nh:enhance',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: 'nh:enhance' }, labelKey: 'action.nh:enhance' }]
      : [],
  perform(ctx) {
    const skills = knownSkills(ctx);
    const adv = skills.filter((s) => canAdvance(ctx, s));
    if (adv.length > 0) {
      ctx.ask(
        {
          id: 'enhance-menu',
          kind: 'menu',
          key: 'enhance.pick',
          cancellable: true,
          options: adv.map((s) => ({
            value: s,
            key: 'enhance.entry',
            params: skillLine(ctx, s, false).params ?? {},
          })),
        },
        'nh:enhance',
        null,
      );
      return 0;
    }
    const eventually = skills.filter((s) => couldAdvance(ctx, s)).length;
    const maxxed = skills.filter((s) => peakedSkill(ctx, s)).length;
    const items: Msg[] = [];
    if (eventually > 0) {
      items.push({
        key: `enhance.legend.star${eventually === 1 ? '' : '_pl'}`,
        params: {
          when: {
            key:
              (ctx.state.entities[String(ctx.state.playerId)]?.c.experience?.level ?? 1) < MAXULEV
                ? 'enhance.when_experienced'
                : 'enhance.when_slots',
          },
        },
      });
    }
    if (maxxed > 0) items.push({ key: `enhance.legend.hash${maxxed === 1 ? '' : '_pl'}` });
    if (items.length > 0) items.push({ key: 'enhance.blank' });
    for (const g of SKILL_GROUPS) {
      items.push({ key: `enhance.group.${g.id}` });
      for (const s of g.skills) {
        if (skillLevel(ctx, s) !== P_RESTRICTED) {
          items.push(skillLine(ctx, s, eventually + maxxed > 0));
        }
      }
    }
    ctx.emit({ type: 'list', titleKey: 'enhance.current', items });
    return 0;
  },
  answer(ctx, value) {
    if (typeof value !== 'string' || !canAdvance(ctx, value)) return 0;
    skillAdvanceNow(ctx, value);
    // "check for more skills able to advance"
    if (knownSkills(ctx).some((s) => canAdvance(ctx, s))) {
      ctx.emit({ type: 'msg', key: 'enhance.more' });
    }
    return 0;
  },
};

/**
 * To-hit modifier for fighting with `weapon` (null = bare hands). ref: src/weapon.c
 * weapon_hit_bonus(). Restricted counts as Unskilled. Not a weapon: 0. Two-weapon combat and
 * riding are not implemented.
 */
export function weaponHitBonus(level: number, weapon: ObjectDef | null): number {
  if (weapon === null) {
    // bare-handed: ((max(skill, unskilled) - 1) + 2) / 2 (no martial arts)
    return Math.trunc((Math.max(level, P_UNSKILLED) - 1 + 2) / 2);
  }
  if (!weapon.weapon) return 0; // weapon_type() == P_NONE
  switch (level) {
    case P_BASIC:
      return 0;
    case P_SKILLED:
      return 2;
    case P_EXPERT:
      return 3;
    default:
      return -4; // restricted or unskilled
  }
}

/** Damage modifier for fighting with `weapon` (null = bare hands). ref: src/weapon.c weapon_dam_bonus() */
export function weaponDamBonus(level: number, weapon: ObjectDef | null): number {
  if (weapon === null) return Math.trunc((Math.max(level, P_UNSKILLED) - 1 + 1) / 2);
  if (!weapon.weapon) return 0;
  switch (level) {
    case P_BASIC:
      return 0;
    case P_SKILLED:
      return 1;
    case P_EXPERT:
      return 2;
    default:
      return -2;
  }
}
