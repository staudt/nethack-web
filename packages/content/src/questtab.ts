// The roles' quest fields: home base, intermediate goal, leader, guardians, nemesis, the two
// quest enemies and their classes, the quest artifact. A leaf (core types and the role tables
// only): questmon.ts, questpgr.ts and the quest levels read it. ref: src/role.c roles[] (the
// quest fields); include/quest.h
import type { DefId } from '@nh/core';
import { QUEST_ARTIFACT } from './artilist';
import { ROLES_TAB } from './roletab';
import { ROLE_ORDER, type RoleKey } from './urole';

/** One role's quest. ref: include/you.h struct Role (filecode .. questarti) */
export interface QuestRole {
  /** 'Val' (roletab's): the role's quest level files and texts */
  filecode: string;
  /** the leader's location (questpgr.c homebase()): message key `quest.home.<role>` */
  home: string;
  /** the intermediate goal (questpgr.c intermed()): message key `quest.intermed.<role>` */
  intermed: string;
  /** PM_ of the quest leader, guardians and nemesis */
  leader: DefId;
  guardian: DefId;
  nemesis: DefId;
  /** specific quest enemies (null: NON_PM, a random one of the class) */
  enemy1: DefId | null;
  enemy2: DefId | null;
  /** the quest enemies by class (S_ symbols) */
  enemy1sym: string;
  enemy2sym: string;
  /** the quest artifact (urole.questarti) */
  artifact: DefId;
}

/** ref: include/quest.h MIN_QUEST_ALIGN: at least this alignment record to start */
export const MIN_QUEST_ALIGN = 20;
/** ref: include/quest.h MIN_QUEST_LEVEL: at least this experience level to start */
export const MIN_QUEST_LEVEL = 14;

type Row = Omit<QuestRole, 'filecode' | 'home' | 'intermed' | 'artifact'>;

/** ref: src/role.c roles[] ldrnum .. enemy2sym, in roles[] order */
const ROWS: Readonly<Record<RoleKey, Row>> = {
  archeologist: {
    leader: 'nh:lord_carnarvon',
    guardian: 'nh:student',
    nemesis: 'nh:minion_of_huhetotl',
    enemy1: null,
    enemy2: 'nh:human_mummy',
    enemy1sym: 'S', // S_SNAKE
    enemy2sym: 'M', // S_MUMMY
  },
  barbarian: {
    leader: 'nh:pelias',
    guardian: 'nh:chieftain',
    nemesis: 'nh:thoth_amon',
    enemy1: 'nh:ogre',
    enemy2: 'nh:troll',
    enemy1sym: 'O', // S_OGRE
    enemy2sym: 'T', // S_TROLL
  },
  caveman: {
    leader: 'nh:shaman_karnov',
    guardian: 'nh:neanderthal',
    nemesis: 'nh:chromatic_dragon',
    enemy1: 'nh:bugbear',
    enemy2: 'nh:hill_giant',
    enemy1sym: 'h', // S_HUMANOID
    enemy2sym: 'H', // S_GIANT
  },
  healer: {
    leader: 'nh:hippocrates',
    guardian: 'nh:attendant',
    nemesis: 'nh:cyclops',
    enemy1: 'nh:giant_rat',
    enemy2: 'nh:snake',
    enemy1sym: 'r', // S_RODENT
    enemy2sym: 'Y', // S_YETI
  },
  knight: {
    leader: 'nh:king_arthur',
    guardian: 'nh:page',
    nemesis: 'nh:ixoth',
    enemy1: 'nh:quasit',
    enemy2: 'nh:ochre_jelly',
    enemy1sym: 'i', // S_IMP
    enemy2sym: 'j', // S_JELLY
  },
  monk: {
    leader: 'nh:grand_master',
    guardian: 'nh:abbot',
    nemesis: 'nh:master_kaen',
    enemy1: 'nh:earth_elemental',
    enemy2: 'nh:xorn',
    enemy1sym: 'E', // S_ELEMENTAL
    enemy2sym: 'X', // S_XORN
  },
  priest: {
    leader: 'nh:arch_priest',
    guardian: 'nh:acolyte',
    nemesis: 'nh:nalzok',
    enemy1: 'nh:human_zombie',
    enemy2: 'nh:wraith',
    enemy1sym: 'Z', // S_ZOMBIE
    enemy2sym: 'W', // S_WRAITH
  },
  rogue: {
    leader: 'nh:master_of_thieves',
    guardian: 'nh:thug',
    nemesis: 'nh:master_assassin',
    enemy1: 'nh:leprechaun',
    enemy2: 'nh:guardian_naga',
    enemy1sym: 'n', // S_NYMPH
    enemy2sym: 'N', // S_NAGA
  },
  ranger: {
    leader: 'nh:orion',
    guardian: 'nh:hunter',
    nemesis: 'nh:scorpius',
    enemy1: 'nh:forest_centaur',
    enemy2: 'nh:scorpion',
    enemy1sym: 'C', // S_CENTAUR
    enemy2sym: 's', // S_SPIDER
  },
  samurai: {
    leader: 'nh:lord_sato',
    guardian: 'nh:roshi',
    nemesis: 'nh:ashikaga_takauji',
    enemy1: 'nh:wolf',
    enemy2: 'nh:stalker',
    enemy1sym: 'd', // S_DOG
    enemy2sym: 'E', // S_ELEMENTAL
  },
  tourist: {
    leader: 'nh:twoflower',
    guardian: 'nh:guide',
    nemesis: 'nh:master_of_thieves',
    enemy1: 'nh:giant_spider',
    enemy2: 'nh:forest_centaur',
    enemy1sym: 's', // S_SPIDER
    enemy2sym: 'C', // S_CENTAUR
  },
  valkyrie: {
    leader: 'nh:norn',
    guardian: 'nh:warrior',
    nemesis: 'nh:lord_surtur',
    enemy1: 'nh:fire_ant',
    enemy2: 'nh:fire_giant',
    enemy1sym: 'a', // S_ANT
    enemy2sym: 'H', // S_GIANT
  },
  wizard: {
    leader: 'nh:neferet_the_green',
    guardian: 'nh:apprentice',
    nemesis: 'nh:dark_one',
    enemy1: 'nh:vampire_bat',
    enemy2: 'nh:xorn',
    enemy1sym: 'B', // S_BAT
    enemy2sym: 'W', // S_WRAITH
  },
};

/** Each role's quest. ref: src/role.c roles[] */
export const QUEST_ROLES: Readonly<Record<RoleKey, QuestRole>> = Object.fromEntries(
  ROLE_ORDER.map((k) => [
    k,
    {
      filecode: ROLES_TAB[k].filecode,
      home: `quest.home.${k}`,
      intermed: `quest.intermed.${k}`,
      ...ROWS[k],
      artifact: QUEST_ARTIFACT[k],
    },
  ]),
) as Record<RoleKey, QuestRole>;

/**
 * The player monster a quest guardian stands for (genus(mndx, 1)): another role's guardian
 * chats as that role's monster. ref: src/mon.c genus()
 */
export const GUARDIAN_GENUS: Readonly<Record<DefId, DefId>> = {
  'nh:student': 'nh:archeologist',
  'nh:chieftain': 'nh:barbarian',
  'nh:neanderthal': 'nh:caveman',
  'nh:attendant': 'nh:healer',
  'nh:page': 'nh:knight',
  'nh:abbot': 'nh:monk',
  'nh:acolyte': 'nh:cleric',
  'nh:hunter': 'nh:ranger',
  'nh:thug': 'nh:rogue',
  'nh:roshi': 'nh:samurai',
  'nh:guide': 'nh:tourist',
  'nh:apprentice': 'nh:wizard',
  'nh:warrior': 'nh:valkyrie',
};
