import type { Mod } from '@nh/core';
import { ACTIONS } from './actions';
import { BRAINS } from './brains';
import { MONSTERS } from './monsters';
import { OBJECTS, APPEARANCES } from './objects';
import { STATUE, statueAppearanceOf, statueAppearances } from './statuestate';
import { registerStatues } from './statue';
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
import { registerRevive } from './revive';
import { registerHero } from './hero';
import { ROLES } from './roles';
import { TERRAIN } from './terrain';
import { TRAVEL_ACTIONS } from './travel';
import { RUN_ACTIONS } from './run';
import { registerGeneration } from './generation';
import { registerMklev } from './mklev';
import { registerSpLev } from './sp_lev';
import { registerPriest } from './priest';
import { registerLeaveShops, registerRooms } from './rooms';
import { registerShops } from './shknam';
import { registerZoo } from './zoo';
import { POTION_ACTIONS, POTION_USES } from './potion';
import { READ_ACTIONS, SCROLL_USES } from './read';
import { THROW_ACTIONS } from './dothrow';
import { KICK_ACTIONS, registerKick } from './dokick';
import { CHAT_ACTIONS } from './chat';
import { PAY_ACTIONS } from './pay';
import { registerClairvoyance } from './detect';
import { registerMonflee } from './monflee';
import { FIRE_ACTIONS } from './fire';
import { CALL_ACTIONS } from './call';
import { enhanceAction } from './skills';
import { registerTeleportitis, registerTraps, teleAction } from './trap';
import { registerMagicTraps } from './magictrap';
import { registerPolyTimeout, registerPolyTrap, registerPolymorphitis } from './polyself';
import { registerHmonas } from './hmonas';
import { registerRollingBoulders } from './rollboulder';
import { registerLandmines } from './landmine';
import { JEWELRY_ACTIONS, registerJewelry } from './jewelry';
import { registerStoning } from './stoning';
import { registerSliming } from './slime';
import { registerDigestFood } from './digestfood';
import { registerLevitation } from './levitation';
import { registerAutosearch } from './actions';
import { WAND_ZAPS, ZAP_ACTIONS } from './zap';
import { APPLY_ACTIONS } from './apply';
import { DIG_ACTIONS } from './dig';
import { LOOT_ACTIONS } from './container';
import { FORCE_ACTIONS } from './force';
import { UNTRAP_ACTIONS } from './untrap';
import { registerShopDamage } from './shkdamage';
import { shkDamageAction } from './shkpay';
import { FOUNTAIN_ACTIONS } from './fountain';
import { registerLock } from './lock';
import { registerLight } from './light';
import { registerSpells } from './spell';
import { registerCast } from './cast';
import { jumpAction } from './jump';
import { monsterAction } from './monability';
import { registerEnd } from './disclose';
import { QUIT_ACTIONS } from './quit';
import { DUNGEONS, LEVELS, SPLEV_FIXUPS } from './dungeon';

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
    for (const a of CHAT_ACTIONS) api.defineAction(a);
    for (const a of PAY_ACTIONS) api.defineAction(a);
    for (const a of FIRE_ACTIONS) api.defineAction(a);
    for (const a of CALL_ACTIONS) api.defineAction(a);
    for (const a of PRAY_ACTIONS) api.defineAction(a);
    for (const a of JEWELRY_ACTIONS) api.defineAction(a);
    for (const a of ZAP_ACTIONS) api.defineAction(a);
    api.defineAction(teleAction); // the controlled teleport prompts' answers
    for (const a of APPLY_ACTIONS) api.defineAction(a);
    for (const a of DIG_ACTIONS) api.defineAction(a);
    for (const a of LOOT_ACTIONS) api.defineAction(a);
    for (const a of FORCE_ACTIONS) api.defineAction(a);
    for (const a of UNTRAP_ACTIONS) api.defineAction(a);
    api.defineAction(shkDamageAction);
    for (const a of FOUNTAIN_ACTIONS) api.defineAction(a);
    registerLock(api);
    registerLight(api);
    registerSpells(api);
    registerCast(api);
    api.defineAction(jumpAction); // #jump and the jump prompts' answers
    api.defineAction(monsterAction); // #monster: a polymorphed form's ability
    api.defineAction(enhanceAction);
    registerNomul(api);
    registerProps(api);
    registerPerception(api);
    registerMState(api);
    registerLeaveShops(api); // before the pets follow, as goto_level()'s check_special_room(TRUE)
    registerDog(api);
    registerLuck(api);
    registerPray(api);
    registerKick(api);
    registerClairvoyance(api);
    registerMonflee(api);
    registerTraps(api);
    registerMagicTraps();
    registerPolyTrap();
    registerHmonas();
    registerRollingBoulders();
    registerLandmines();
    registerDigestFood();
    registerStoning(api); // ahead of the strangling timer, as nh_timeout()
    registerSliming(api); // slime_dialogue() after stoned_dialogue()
    registerJewelry(api);
    registerLevitation(api);
    registerPolyTimeout(api); // u.mtimedone after levitation_dialogue(), as nh_timeout()
    registerAutosearch(api);
    for (const a of EAT_ACTIONS) api.defineAction(a);
    registerCorpses(api);
    registerRevive(api);
    registerHunger(api);
    registerEat(api);
    registerEnd(api);
    for (const a of QUIT_ACTIONS) api.defineAction(a);
    for (const b of BRAINS) api.defineBrain(b);
    for (const m of MONSTERS) api.defineMonster(m);
    for (const o of OBJECTS) {
      const use = USES[o.id];
      const zap = WAND_ZAPS[o.id];
      const appearanceOf = o.id === STATUE ? statueAppearanceOf : undefined;
      api.defineObject({
        ...o,
        ...(use ? { use } : {}),
        ...(zap ? { zap } : {}),
        ...(appearanceOf ? { appearanceOf } : {}),
      });
    }
    for (const a of APPEARANCES) api.defineAppearance(a);
    const statueFg = OBJECTS.find((o) => o.id === STATUE)?.glyph.fg ?? '#ffffff';
    for (const a of statueAppearances(MONSTERS, statueFg)) api.defineAppearance(a);
    registerStatues(api);
    api.setItemNamer(nameItem);
    registerStats(api);
    registerShuffle(api);
    registerHero(api);
    registerTeleportitis(api); // after regen_pw(), as moveloop_core()
    registerPolymorphitis(api); // after teleportitis, as moveloop_core()
    registerGeneration(api);
    registerMklev(api);
    registerPriest(api); // before the LevelDef contents, as create_altar()
    registerSpLev(api, SPLEV_FIXUPS);
    registerShops(api); // after the LevelDef contents, as fill_special_room()
    registerZoo(api); // likewise
    registerRooms(api); // after the pets arrive, as goto_level()
    registerShopDamage(api); // after check_special_room(FALSE), as goto_level()
  },
};

export { TERRAIN, T } from './terrain';
export {
  wizardMod,
  WIZ_LEVELPORT,
  WIZ_MAP,
  WIZ_WHERE,
  WIZ_WISH,
  WIZ_IDENTIFY,
  WIZ_GENESIS,
  WIZ_DIE,
  WIZ_CAST,
  WIZ_LEVELCHANGE,
  WIZ_POLYSELF,
  WIZ_TELEPORT,
  parseGenesis,
  OPEN_DUNGEON_LEVELS,
  doMapping,
  levelportLevels,
  printDungeon,
} from './wizard';
export { askPosition, positionAnswer, type AskPositionOptions } from './getpos';
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
export {
  experienceFor,
  gainExperience,
  newuexp,
  newhp,
  newpw,
  pluslvl,
  regenPw,
  MAXULEV,
} from './hero';
export { pwOf, setPw, uspellOf, setUspell, type Pw, type USpell } from './uenergy';
export { CAST_ID, CAST_ACTIONS, CAST_BOOKS, spelleffects, castProtection } from './cast';
export { MONSTER_ID, monAbility, domonability } from './monability';
export { JUMP_ID, jump, isValidJumpPos, validJumpPositions, walkPath } from './jump';
export { SPELL_INFO, ROLE_SPELL, percentSuccess, isqrt, spellLevPw } from './spellcalc';
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
  conflictOn,
  resistConflict,
} from './props';
export { poisoned, adjattrib } from './attrib';
export {
  A_NONE,
  A_CHAOTIC,
  A_NEUTRAL,
  A_LAWFUL,
  ALGN_SINNED,
  ALGN_DEVOUT,
  aAlign,
  alignGname,
  alignStr,
  altarAlign,
  altarWrath,
  doaltarobj,
  godvoice,
  monFloorEffects,
  onAltar,
  onShrine,
  type Aligntyp,
} from './align';
export { mdamageu, hitmuAd, magicNegation } from './mhitu';
export { passive } from './uhitm_passive';
export { ustuck, setUstuck } from './hackmove';
export {
  monNam,
  canSpotMon,
  telepathSenses,
  registerPerception,
  warningLevel,
  warningShown,
  WARNING_PERCEPTION,
} from './perception';
export { mattackm, fightm, monkilled, mondied, growUp, GROWS_INTO, M_ATTK } from './mhitm';
export {
  isFrozen,
  frozenTime,
  paralyzeMonst,
  isMStunned,
  setMStunned,
  isMConfused,
  setMConfused,
} from './mstate';
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
export { readobjnam, wishNames, makesingular, mungspaces, SPE_LIM, WRPSYM } from './objnam_read';
export type { WishSpec, WishWhat, WishNames, ObjName } from './objnam_read';
export { nameToMon, nameToMonplus } from './mondata';
export type { MonName } from './mondata';
export { mkWished, holdAnotherObject, askWish, answerWish, MAXWISHTRY } from './wish';
export type { WishData, WishOpts } from './wish';
export { hitval } from './combat';
export { nhData } from './items';
export { rndmonst, makemon, registerGeneration } from './generation';
export { mcalcmove, clearPath, disturb, dochug, mfndpos, moveSpecial, priMove } from './monmove';
export {
  ALIGNED_CLERIC,
  TEMPLE,
  epriOf,
  findpriest,
  hasShrine,
  histempleAt,
  forgetTempleEntry,
  inYourSanctuary,
  inhistemple,
  pCoaligned,
  templeOccupied,
  type Epri,
} from './epri';
export { ghodHitsu, intemple, priestDonate, priestTalk, priestini, templePriests } from './priest';
export type { PriestOffer } from './priest';
export { moneyCnt, money2mon, money2u } from './money';
export { urexp, moreExperienced, finalScore, finalGold, deepestLevel } from './urexp';
export { countKill, deaths, vanquishedLines } from './vanquished';
export {
  BILLSZ,
  SHOPKEEPER,
  SHOP_TYPES,
  costlySpot,
  eshkOf,
  inhishop,
  insideShop,
  isShopType,
  setEshk,
  shkName,
  shknameIsPname,
  shopDoors,
  shopKeeper,
  billOf,
  onbill,
  uShops,
  type BillEntry,
  type Eshk,
} from './eshk';
export {
  getCost,
  getprice,
  isUnpaid,
  oidPriceAdjustment,
  setCost,
  shopItemCost,
  unpaidCost,
} from './price';
export { PAY_ACTIONS, PAY_ID } from './pay';
export {
  SHTYPES,
  getShopItem,
  mkshop,
  nameshk,
  saleable,
  shkinit,
  shopType,
  stockRoom,
  stockShops,
  veggyItem,
  type ShopItem,
  type ShopType,
} from './shknam';
export { doVicinityMap, showMapSpot } from './detect';
export { afterShkMove, checkSpecialRoom, leaveShops } from './rooms';
export { emptyShops, specialRoomsAt, uRooms, uShopRooms } from './urooms';
export {
  addtobill,
  billUsedUp,
  costlyAlteration,
  hello,
  pacifyShk,
  checkShopObj,
  checkUnpaid,
  plname,
  sellAnswer,
  sellobj,
  sellobjState,
  shkname,
  stolenValue,
  subfrombill,
  uEnteredShop,
  uLeftShop,
  addupbill,
  hotPursuit,
  makeAngryShk,
  makeHappyShk,
  rileShk,
  setpaid,
  shkChat,
  shkgone,
  type SellHow,
  type SellOffer,
  type SellState,
} from './shk';
export { buzzFrom, type Ray, type RaySource } from './buzz';
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
export {
  fillOrdinaryRoom,
  mkSpecialRoom,
  somexyspace,
  mktrap,
  traptypeRnd,
  mkfount,
} from './mklev';
export {
  FTN_MAGIC,
  FTN_LOOTED,
  FTN_WARNED,
  fountainBits,
  setFountainBits,
  heroOnFountain,
  drinkfountain,
  dipfountain,
  DIP_ID,
  FOUNTAIN_ACTIONS,
  dryup,
  dogushforth,
} from './fountain';
export { waterDamage, type WaterResult } from './water';
export { somegold } from './steal';
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
  forgetMonster,
} from './mongear';
export { xkilledCorpse, corpseChance, startCorpseTimeout, rnz, ROT_AGE } from './corpses';
export { KICK_ACTIONS, KICK_ID, setWoundedLegs } from './dokick';
export { CHAT_ACTIONS, CHAT_ID, domonnoise } from './chat';
export { monflee, isFleeing, fleeTime, stopFleeing } from './monflee';
export { needsAttackConfirm, setmangry, wakeup } from './peaceful';
export {
  WATCHMAN,
  WATCH_CAPTAIN,
  angryGuards,
  isWatch,
  pacifyGuards,
  watchmanDoorDamage,
  watchmanThiefArrest,
} from './watch';
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
  TELE_ID,
  teleControlled,
} from './trap';
export type { TrapResult } from './trap';
export { utrap, isMtrapped, monKnowsTraps } from './trapstate';
export { levitating, canReachFloor, floatUp, floatDown } from './levitation';
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
export { BOULDER, boulderAt, blockersOf } from './boulder';
export { moverock, couldMoveOntoBoulder } from './moverock';
export { newcham, polyok } from './newcham';
export { polyObj } from './polyobj';
export { polyself, polymon, newman, rehumanize, youWere, POLYSELF_ID } from './polyself';
export { heroForm, heroFormId, upolyOf, upolyd, type UPoly } from './upoly';
