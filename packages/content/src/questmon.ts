// The quest's monsters as the hero's role sees them. C's role_init() rewrites mons[] for the
// hero's own leader (MS_LEADER, peaceful, staying close, aligned with her), guardians (peaceful,
// aligned with her) and nemesis (MS_NEMESIS, hostile, nasty, stalking, waiting for her, wanting
// the artifact, never close). Registry defs are shared and immutable here, so the change is an
// overlay: `questMonDef()` is the row as C's mons[] has it after role_init(), read at the sites
// that read those fields (peace_minded(), set_malign(), makemon()'s strategies, the covetous
// wants, the stalkers, the experience for a nasty kind). Another role's leader keeps its row
// (its own MS_LEADER and M2_PEACEFUL included: role_init() only adds). A leaf (core, the role
// tables, urole, queststate). ref: src/role.c role_init(); src/sounds.c domonnoise()
import type { Ctx, DefId, EntityId, GameState, MonsterDef, MonsterSound } from '@nh/core';
import { startAlign } from './gods';
import { GUARDIAN_GENUS, QUEST_ROLES, type QuestRole } from './questtab';
import { questStatus, setQuest } from './queststate';
import { urace, urole } from './urole';

/** The hero's role's quest. */
export const questRole = (state: Readonly<GameState>): QuestRole => QUEST_ROLES[urole(state)];

/** `ptr == &mons[urole.ldrnum]`: the hero's own leader's row. */
export const isQuestLeader = (state: Readonly<GameState>, def: DefId): boolean =>
  questRole(state).leader === def;
/** `ptr == &mons[urole.guardnum]`: the hero's own guardians' row. */
export const isQuestGuardian = (state: Readonly<GameState>, def: DefId): boolean =>
  questRole(state).guardian === def;
/** `ptr == &mons[urole.neminum]`: the hero's own nemesis's row. */
export const isQuestNemesis = (state: Readonly<GameState>, def: DefId): boolean =>
  questRole(state).nemesis === def;

/**
 * The alignment role_init() aligns her leader and guardians with: the starting one
 * (`aligns[flags.initalign].value`), which conversion does not change.
 */
function initAlign(state: Readonly<GameState>): number {
  const p = state.entities[String(state.playerId)]?.c.player;
  return p ? p.align : startAlign(urole(state), urace(state));
}

/**
 * `maligntyp` of the hero's own leader and guardians after role_init() (`alignmnt * 3`), null
 * for any other row (its own alignment stands).
 */
export function questMalign(state: Readonly<GameState>, def: DefId): number | null {
  const q = questRole(state);
  return def === q.leader || def === q.guardian ? initAlign(state) * 3 : null;
}

const NEMESIS_OFF: readonly string[] = ['peaceful', 'close'];
const NEMESIS_ON: readonly string[] = ['nasty', 'stalk', 'hostile', 'wantsarti', 'waitforu'];
const add = (flags: readonly string[], more: readonly string[]): string[] => [
  ...flags,
  ...more.filter((f) => !flags.includes(f)),
];

/**
 * The row `def` as mons[] holds it after role_init() for the hero's role: her leader with
 * MS_LEADER, M2_PEACEFUL, M3_CLOSE and `maligntyp = alignment * 3`; her guardians with
 * M2_PEACEFUL and that alignment; her nemesis with MS_NEMESIS, M2_NASTY | M2_STALK |
 * M2_HOSTILE, M3_WANTSARTI | M3_WAITFORU, neither M2_PEACEFUL nor M3_CLOSE. Any other row is
 * returned as it is. ref: src/role.c role_init() "Fix up the quest leader/guardians/nemesis"
 */
export function questMonDef(state: Readonly<GameState>, def: MonsterDef): MonsterDef {
  const q = questRole(state);
  if (def.id === q.leader)
    return {
      ...def,
      sound: 'leader',
      flags: add(def.flags, ['peaceful', 'close']),
      alignment: initAlign(state) * 3,
    };
  if (def.id === q.guardian)
    return { ...def, flags: add(def.flags, ['peaceful']), alignment: initAlign(state) * 3 };
  if (def.id === q.nemesis)
    return {
      ...def,
      sound: 'nemesis',
      flags: add(
        def.flags.filter((f) => !NEMESIS_OFF.includes(f)),
        NEMESIS_ON,
      ),
    };
  return def;
}

/** C's animal noises, MS_SILENT..MS_ANIMAL (`msound <= MS_ANIMAL`). ref: include/monflag.h */
const ANIMAL_SOUNDS: readonly MonsterSound[] = [
  'silent',
  'bark',
  'mew',
  'roar',
  'bellow',
  'growl',
  'squeak',
  'sqawk',
  'chirp',
  'hiss',
  'buzz',
  'grunt',
  'neigh',
  'moo',
  'wail',
  'gurgle',
  'burble',
  'trumpet',
];

/**
 * The sound `def` makes: its `msound` after role_init() (`questMonDef()`). With the monster's
 * entity `id` (domonnoise()'s rules): her leader, even polymorphed, speaks as the leader while
 * his form can talk (`msound > MS_ANIMAL`), and another role's guardian makes the sound of the
 * player monster it stands for (genus(mndx, 1): a human's). ref: src/sounds.c domonnoise()
 */
export function monSound(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  def: MonsterDef,
  id?: EntityId,
): MonsterSound {
  const msound = questMonDef(ctx.state, def).sound ?? 'silent';
  if (id === undefined) return msound;
  if (id === questStatus(ctx.state).leaderId && !ANIMAL_SOUNDS.includes(msound)) return 'leader';
  if (msound === 'guardian' && !isQuestGuardian(ctx.state, def.id)) {
    const g = GUARDIAN_GENUS[def.id];
    return g && ctx.defs.isMonster(g) ? (ctx.defs.monster(g).sound ?? 'silent') : 'humanoid';
  }
  return msound;
}

/** One of the quest's own rows (a leader, nemesis or guardian by its row's sound). */
const isQuestSound = (s: MonsterSound | undefined): boolean =>
  s === 'leader' || s === 'nemesis' || s === 'guardian';

/**
 * Whether a quest being is the hero's own: a row with a quest sound (after role_init()) that is
 * not her role's leader, nemesis or guardians belongs to another role's quest.
 * ref: src/read.c do_class_genocide() (`quest_info(MS_LEADER) == i` ...)
 */
export function otherRolesQuestMon(state: Readonly<GameState>, def: MonsterDef): boolean {
  const s = questMonDef(state, def).sound;
  if (!isQuestSound(s)) return false;
  const q = questRole(state);
  return s === 'leader'
    ? def.id !== q.leader
    : s === 'nemesis'
      ? def.id !== q.nemesis
      : def.id !== q.guardian;
}

/** A quest row's own gender (0 male, 1 female, 2 neuter), or null when its row gives none. */
function rowGender(def: MonsterDef | null): 0 | 1 | 2 | null {
  if (!def) return 0;
  if (def.flags.includes('neuter')) return 2;
  if (def.flags.includes('female')) return 1;
  if (def.flags.includes('male')) return 0;
  return null;
}

const rowOf = (ctx: Pick<Ctx, 'defs'>, id: DefId): MonsterDef | null =>
  ctx.defs.isMonster(id) ? ctx.defs.monster(id) : null;

/**
 * At new game, before the pantheon: the genders of her leader and nemesis are drawn
 * (`rn2(100) < 50`) when their rows give none (only the Minion of Huhetotl and the Dark One:
 * the Archeologist's and the Wizard's games), for the quest texts' pronouns and the monsters
 * makemon() makes. Only a drawn gender is stored (a female one: absent is C's 0).
 * ref: src/role.c role_init() `svq.quest_status.ldrgend`, `nemgend`
 */
export function roleInitQuest(ctx: Pick<Ctx, 'state' | 'rng' | 'defs'>): void {
  const q = questRole(ctx.state);
  const draw = (id: DefId): 0 | 1 | undefined =>
    rowGender(rowOf(ctx, id)) === null ? (ctx.rng.rn2(100) < 50 ? 1 : 0) : undefined;
  const ldrgend = draw(q.leader);
  const nemgend = draw(q.nemesis);
  if (ldrgend !== undefined || nemgend !== undefined) setQuest(ctx, { ldrgend, nemgend });
}

/**
 * The gender of her leader or nemesis (0 male, 1 female, 2 neuter): its row's, else the one
 * drawn at new game. ref: src/role.c role_init(); include/quest.h ldrgend, nemgend
 */
export function questGender(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  who: 'leader' | 'nemesis',
): 0 | 1 | 2 {
  const q = questRole(ctx.state);
  const own = rowGender(rowOf(ctx, who === 'leader' ? q.leader : q.nemesis));
  const st = questStatus(ctx.state);
  return own ?? (who === 'leader' ? st.ldrgend : st.nemgend) ?? 0;
}
