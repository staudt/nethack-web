import type { Mod } from '@nh/core';
import { ACTIONS } from './actions';
import { BRAINS } from './brains';
import { MONSTERS } from './monsters';
import { OBJECTS, APPEARANCES } from './objects';
import { registerShuffle } from './o_init';
import { nameItem } from './objnam';
import { registerProps } from './props';
import { registerPerception } from './perception';
import { registerMState } from './mstate';
import { registerDog } from './dog';
import { registerLuck } from './luck';
import { PRAY_ACTIONS, registerPray } from './pray';
import { registerStats } from './stats';
import { ITEM_ACTIONS } from './itemactions';
import { registerNomul } from './nomul';
import { EAT_ACTIONS, registerEat } from './eat';
import { registerHunger } from './hunger';
import { registerCorpses } from './corpses';
import { registerHero } from './hero';
import { ROLES } from './roles';
import { TERRAIN } from './terrain';
import { TRAVEL_ACTIONS } from './travel';
import { RUN_ACTIONS } from './run';
import { registerGeneration } from './generation';
import { registerMklev } from './mklev';
import { registerSpLev } from './sp_lev';
import { POTION_ACTIONS, POTION_USES } from './potion';
import { READ_ACTIONS, SCROLL_USES } from './read';
import { THROW_ACTIONS } from './dothrow';
import { KICK_ACTIONS, registerKick } from './dokick';
import { registerMonflee } from './monflee';
import { FIRE_ACTIONS } from './fire';
import { CALL_ACTIONS } from './call';
import { enhanceAction } from './skills';
import { registerTraps } from './trap';
import { JEWELRY_ACTIONS, registerJewelry } from './jewelry';
import { registerAutosearch } from './actions';
import { WAND_ZAPS, ZAP_ACTIONS } from './zap';
import { APPLY_ACTIONS } from './apply';
import { LOOT_ACTIONS } from './container';
import { registerLock } from './lock';
import { registerLight } from './light';
import { registerSpells } from './spell';
import { DUNGEONS, LEVELS } from './dungeon';

/** Potion and scroll effects, attached to the object defs (ObjectDef.use). */
const USES = { ...POTION_USES, ...SCROLL_USES };

export const CONTENT_VERSION = 1;

export const vanillaMod: Mod = {
  id: 'nh',
  version: '0.1.0',
  register(api) {
    for (const t of TERRAIN) api.defineTerrain(t);
    for (const l of LEVELS) api.defineLevel(l);
    for (const d of DUNGEONS) api.defineDungeon(d);
    for (const r of ROLES) api.defineRole(r);
    for (const a of ACTIONS) api.defineAction(a);
    for (const a of TRAVEL_ACTIONS) api.defineAction(a);
    for (const a of RUN_ACTIONS) api.defineAction(a);
    for (const a of ITEM_ACTIONS) api.defineAction(a);
    for (const a of POTION_ACTIONS) api.defineAction(a);
    for (const a of READ_ACTIONS) api.defineAction(a);
    for (const a of THROW_ACTIONS) api.defineAction(a);
    for (const a of KICK_ACTIONS) api.defineAction(a);
    for (const a of FIRE_ACTIONS) api.defineAction(a);
    for (const a of CALL_ACTIONS) api.defineAction(a);
    for (const a of PRAY_ACTIONS) api.defineAction(a);
    for (const a of JEWELRY_ACTIONS) api.defineAction(a);
    for (const a of ZAP_ACTIONS) api.defineAction(a);
    for (const a of APPLY_ACTIONS) api.defineAction(a);
    for (const a of LOOT_ACTIONS) api.defineAction(a);
    registerLock(api);
    registerLight(api);
    registerSpells(api);
    api.defineAction(enhanceAction);
    registerNomul(api);
    registerProps(api);
    registerPerception(api);
    registerMState(api);
    registerDog(api);
    registerLuck(api);
    registerPray(api);
    registerKick(api);
    registerMonflee(api);
    registerTraps(api);
    registerJewelry(api);
    registerAutosearch(api);
    for (const a of EAT_ACTIONS) api.defineAction(a);
    registerCorpses(api);
    registerHunger(api);
    registerEat(api);
    for (const b of BRAINS) api.defineBrain(b);
    for (const m of MONSTERS) api.defineMonster(m);
    for (const o of OBJECTS) {
      const use = USES[o.id];
      const zap = WAND_ZAPS[o.id];
      api.defineObject({ ...o, ...(use ? { use } : {}), ...(zap ? { zap } : {}) });
    }
    for (const a of APPEARANCES) api.defineAppearance(a);
    api.setItemNamer(nameItem);
    registerStats(api);
    registerShuffle(api);
    registerHero(api);
    registerGeneration(api);
    registerMklev(api);
    registerSpLev(api);
  },
};

export { TERRAIN, T } from './terrain';
export {
  wizardMod,
  WIZ_LEVELPORT,
  WIZ_MAP,
  WIZ_WHERE,
  OPEN_DUNGEON_LEVELS,
  doMapping,
  levelportLevels,
  printDungeon,
} from './wizard';
export { ACTIONS } from './actions';
export { TRAVEL_ACTIONS } from './travel';
export { RUN_ACTIONS, RUN_MODES } from './run';
export type { RunMode } from './run';
export { ROLES } from './roles';
export { MONSTERS } from './monsters';
export { BRAINS } from './brains';
export {
  heroAttack,
  monsterAttack,
  heroToHit,
  monsterToHit,
  dmgval,
  abon,
  dbon,
  acValue,
} from './combat';
export { experienceFor, gainExperience, newuexp, newhp, MAXULEV } from './hero';
export { messagesEn } from './messages.en';
export { ITEM_ACTIONS, lookHere, encumberMsg } from './itemactions';
export { nomul } from './nomul';
export {
  P,
  hasProp,
  heroHas,
  hasIntrinsic,
  timeoutLeft,
  setIntrinsic,
  setItimeout,
  incrItimeout,
  makeStunned,
  makeConfused,
  makeBlinded,
  makeHallucinated,
  adjabil,
  hasExtrinsic,
  isStrangled,
  ringBonus,
  updateWornProps,
  wornIn,
} from './props';
export { poisoned, adjattrib } from './attrib';
export { mdamageu, hitmuAd, magicNegation } from './mhitu';
export { passive } from './uhitm_passive';
export { ustuck, setUstuck } from './hackmove';
export { monNam, canSpotMon, telepathSenses, registerPerception } from './perception';
export { mattackm, monkilled, mondied, growUp, GROWS_INTO, M_ATTK } from './mhitm';
export { isFrozen, frozenTime, paralyzeMonst, isMStunned, setMStunned } from './mstate';
export {
  makedog,
  initedog,
  tamedog,
  abuseDog,
  dogfood,
  edogOf,
  meating,
  isTame,
  tameness,
  isDomestic,
  DOGFOOD,
  CADAVER,
  ACCFOOD,
  MANFOOD,
  APPORT,
  POISON,
  UNDEF,
  TABU,
} from './dog';
export type { Edog } from './dog';
export { dogMove, dogEat } from './dogmove';
export {
  uState,
  setU,
  luckOf,
  changeLuck,
  adjalign,
  alignLim,
  malign,
  xkilledPenalties,
  HERO_ALIGN_TYPE,
  LUCKMIN,
  LUCKMAX,
} from './luck';
export type { UState } from './luck';
export { PRAY_ACTIONS, PRAY_ID, inTrouble, invulnerable } from './pray';
export { givit, shouldGivit, corpseIntrinsic, cpostfxOf } from './givit';
export { giveStartingKit, VALKYRIE_KIT } from './kit';
export {
  skillInit,
  skillLevel,
  weaponHitBonus,
  weaponDamBonus,
  SKILL_V,
  P_RESTRICTED,
  P_UNSKILLED,
  P_BASIC,
  P_SKILLED,
  P_EXPERT,
  BARE_HANDED,
  useSkill,
  addWeaponSkill,
  canAdvance,
  couldAdvance,
  slotsRequired,
  weaponSlots,
  practiceNeededToAdvance,
  P_SKILL_LIMIT,
  SKILL_GROUPS,
  enhanceAction,
} from './skills';
export { swapWep, setSwapWep, isSwapWep } from './wield';
export { CALL_ACTIONS } from './call';
export { xnameOf } from './objnam';
export { hitval } from './combat';
export { nhData } from './items';
export { rndmonst, makemon, registerGeneration } from './generation';
export { mcalcmove, clearPath, disturb, dochug, mfndpos } from './monmove';
export { OBJECTS, APPEARANCES } from './objects';
export {
  rne,
  mksobj,
  mkcorpse,
  mkgold,
  weight,
  mergable,
  merged,
  assigninvlet,
  invCount,
  addToInventory,
  removeFromInventory,
  placeOnFloor,
  splitStack,
  bcsign,
  NOINVSYM,
} from './items';
export type { ItemCtx, MksobjOpts } from './items';
export { shuffleAll, discover, isKnown } from './o_init';
export { doname, nameItem } from './objnam';
export {
  findAc,
  findMac,
  moneyCount,
  acurrstr,
  weightCap,
  invWeight,
  calcCapacity,
  nearCapacity,
  heroMovement,
  ENCUMBRANCE_NAMES,
} from './stats';
export { healup, cureSick, POTION_ACTIONS } from './potion';
export { READ_ACTIONS } from './read';
export { THROW_ACTIONS } from './dothrow';
export { FIRE_ACTIONS, FIRE_ID } from './fire';
export { thrwmu, selectRwep, linedUp, shouldMulchMissile } from './mthrowu';
export {
  gethungry,
  newuhs,
  lesshungry,
  morehungry,
  makeSick,
  makeVomiting,
  vomit,
  isSick,
  hungerData,
} from './hunger';
export { EAT_ACTIONS, stopOccupation, losehp } from './eat';
export { mkobj, mkobjAt, mksobjFull, mkboxCnts, rndmonnum, MKOBJ_PROBS, BOX_PROBS } from './mkobj';
export { fillOrdinaryRoom, somexyspace, mktrap, traptypeRnd } from './mklev';
export { monsterDied } from './mondeath';
export {
  mongets,
  mInitWeap,
  mInitInv,
  mDoWear,
  selectHwep,
  monWieldItem,
  monWep,
  minvent,
  mpickstuff,
  relobj,
} from './mongear';
export { xkilledCorpse, corpseChance, startCorpseTimeout, rnz, ROT_AGE } from './corpses';
export { KICK_ACTIONS, KICK_ID, setWoundedLegs } from './dokick';
export { monflee, isFleeing, fleeTime, stopFleeing } from './monflee';
export { needsAttackConfirm, setmangry, wakeup } from './peaceful';
export {
  TRAP,
  TRAPS,
  TRAP_ACTIONS,
  maketrap,
  holeDestination,
  canFallThru,
  DUNGEON_BOTTOM,
  dotrap,
  mintrap,
  mHarmlessTrap,
  isHole,
} from './trap';
export type { TrapResult } from './trap';
export { utrap, isMtrapped, monKnowsTraps } from './trapstate';
export {
  JEWELRY_ACTIONS,
  PUTON_ID,
  REMOVE_ID,
  ringGone,
  useupAmulet,
  registerJewelry,
} from './jewelry';
export { done } from './end';
export type { How } from './end';
export { JEWELRY_CLASSES, SPELLBOOK_CLASSES, WAND_CLASSES } from './o_init';
export { CHARGED_RINGS } from './objects';
export { ZAP_ID, WAN, ZAP_ACTIONS, weffects, learnwand } from './zap';
export { mspeed, setMspeed } from './mstate';
export { APPLY_ID, APPLY_ACTIONS, WHISTLE, applicable } from './apply';
export { LOOT_ID, LOOT_ACTIONS, BOX, useContainer, floorContainers } from './container';
export { LOCK_ID, PICKLOCK_ID, KEY, autokey } from './lock';
export { LAMP, beginBurn, endBurn, igniteItems, lampLights, snuffLit } from './light';
export { objKnown, setObjKnown, setLknown, setCknown } from './items';
