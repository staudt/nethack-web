import { meltIce, registerIce } from './ice';
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
import { registerArtiGlow } from './artiglow';
import { registerPerception } from './perception';
import { registerMState } from './mstate';
import { registerDog } from './dog';
import { registerLeash } from './leash';
import { registerGenocide } from './genocide';
import { registerLuck } from './luck';
import { PRAY_ACTIONS, registerPray } from './pray';
import { registerStats } from './stats';
import { ITEM_ACTIONS } from './itemactions';
import { registerNomul } from './nomul';
import { EAT_ACTIONS, registerEat } from './eat';
import { registerHunger } from './hunger';
import { registerCorpses } from './corpses';
import { registerEggs } from './egg';
import { registerFigurines } from './figurine';
import { SIT_ACTIONS } from './dosit';
import { ENGRAVE_ACTIONS } from './engrave';
import { registerEngr } from './engr';
import { registerRevive } from './revive';
import { registerHero } from './hero';
import { registerKit } from './kit';
import { RACES, ROLES } from './roles';
import { TERRAIN } from './terrain';
import { TRAVEL_ACTIONS } from './travel';
import { RUN_ACTIONS } from './run';
import { registerGeneration } from './generation';
import { registerMklev } from './mklev';
import { registerSpLev } from './sp_lev';
import { registerPriest } from './priest';
import { registerLeaveShops, registerRooms } from './rooms';
import { registerGehennom } from './gehennom';
import { registerShops } from './shknam';
import { registerZoo } from './zoo';
import { registerVault } from './vault';
import { registerHarass } from './harass';
import { registerSeduce } from './seduce';
import { registerDemonTalk } from './demontalk';
import { registerAmuletWish } from './wish';
import { POTION_ACTIONS, POTION_USES } from './potion';
import { READ_ACTIONS, SCROLL_USES } from './read';
import { THROW_ACTIONS } from './dothrow';
import { KICK_ACTIONS, registerKick } from './dokick';
import { CHAT_ACTIONS } from './chat';
import { PAY_ACTIONS } from './pay';
import { registerClairvoyance } from './detect';
import { registerFumbling } from './fumble';
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
import { registerTowel } from './towel';
import { registerStoning } from './stoning';
import { registerSliming } from './slime';
import { registerDigestFood } from './digestfood';
import { registerLevitation } from './levitation';
import { registerDrown } from './drown';
import { registerDowear } from './dowear';
import { registerAutosearch } from './actions';
import { WAND_ZAPS, ZAP_ACTIONS } from './zap';
import { APPLY_ACTIONS } from './apply';
import { WIPE_ACTIONS } from './creampie';
import { DIG_ACTIONS } from './dig';
import { LOOT_ACTIONS } from './container';
import { FORCE_ACTIONS } from './force';
import { UNTRAP_ACTIONS } from './untrap';
import { registerShopDamage } from './shkdamage';
import { shkDamageAction } from './shkpay';
import { DIP_ACTIONS } from './dip';
import { RUB_ACTIONS } from './rub';
import { registerInvoke } from './invoke';
import { OFFER_ACTIONS } from './offer';
import { TIN_ACTIONS } from './tin';
import { registerLock } from './lock';
import { registerLight } from './light';
import { registerSpells } from './spell';
import { registerCast } from './cast';
import { jumpAction } from './jump';
import { monsterAction } from './monability';
import { registerEnd } from './disclose';
import { registerBotl } from './botl';
import { QUIT_ACTIONS } from './quit';
import { DUNGEONS, LEVELS, SPLEV_FIXUPS } from './dungeon';
import { SYMSETS } from './symset';

/** Potion and scroll effects, attached to the object defs (ObjectDef.use). */
const USES = { ...POTION_USES, ...SCROLL_USES };

export const CONTENT_VERSION = 1;

export const vanillaMod: Mod = {
  id: 'nh',
  version: '0.1.0',
  register(api) {
    for (const t of TERRAIN) api.defineTerrain(t);
    for (const l of LEVELS) api.defineLevel(l);
    for (const s of SYMSETS) api.defineSymset(s);
    for (const d of DUNGEONS) api.defineDungeon(d);
    for (const r of RACES) api.defineRace(r);
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
    for (const a of OFFER_ACTIONS) api.defineAction(a); // #offer, on an altar
    for (const a of JEWELRY_ACTIONS) api.defineAction(a);
    for (const a of ZAP_ACTIONS) api.defineAction(a);
    api.defineAction(teleAction); // the controlled teleport prompts' answers
    for (const a of APPLY_ACTIONS) api.defineAction(a);
    for (const a of WIPE_ACTIONS) api.defineAction(a);
    for (const a of DIG_ACTIONS) api.defineAction(a);
    for (const a of LOOT_ACTIONS) api.defineAction(a);
    for (const a of FORCE_ACTIONS) api.defineAction(a);
    for (const a of UNTRAP_ACTIONS) api.defineAction(a);
    api.defineAction(shkDamageAction);
    for (const a of DIP_ACTIONS) api.defineAction(a);
    for (const a of RUB_ACTIONS) api.defineAction(a);
    registerInvoke(api); // #invoke and the check on toggled powers leaving her pack
    for (const a of TIN_ACTIONS) api.defineAction(a);
    registerLock(api);
    registerLight(api);
    registerSpells(api);
    registerCast(api);
    api.defineAction(jumpAction); // #jump and the jump prompts' answers
    api.defineAction(monsterAction); // #monster: a polymorphed form's ability
    api.defineAction(enhanceAction);
    registerNomul(api);
    registerProps(api);
    registerArtiGlow(api); // after the worn-property cache's refresh
    registerPerception(api);
    registerMState(api);
    registerLeaveShops(api); // before the pets follow, as goto_level()'s check_special_room(TRUE)
    registerDog(api);
    registerLeash(api);
    registerGenocide(api); // after the pets arrive, as goto_level()'s kill_genocided_monsters()
    registerLuck(api);
    registerPray(api);
    registerKick(api);
    registerClairvoyance(api);
    registerFumbling(api);
    registerMonflee(api);
    registerTraps(api);
    registerMagicTraps(meltIce);
    registerPolyTrap();
    registerHmonas();
    registerRollingBoulders();
    registerLandmines();
    registerDigestFood();
    registerStoning(api); // ahead of the strangling timer, as nh_timeout()
    registerSliming(api); // slime_dialogue() after stoned_dialogue()
    registerJewelry(api);
    registerTowel(api); // glibr() ahead of the timeouts (its own priority)
    registerLevitation(api);
    registerDrown(api);
    registerIce(api);
    registerDowear(api);
    registerPolyTimeout(api); // u.mtimedone after levitation_dialogue(), as nh_timeout()
    registerAutosearch(api);
    for (const a of EAT_ACTIONS) api.defineAction(a);
    registerCorpses(api);
    registerEggs(api);
    registerFigurines(api);
    registerRevive(api);
    registerHunger(api);
    registerEat(api);
    registerEnd(api);
    for (const a of SIT_ACTIONS) api.defineAction(a);
    for (const a of ENGRAVE_ACTIONS) api.defineAction(a);
    registerEngr(api); // the turn's scuff, after invault() by priority
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
    registerBotl(api); // the rank, alignment and farewell statuses
    registerKit(api); // the u_init newGame hook
    registerTeleportitis(api); // after regen_pw(), as moveloop_core()
    registerPolymorphitis(api); // after teleportitis, as moveloop_core()
    registerGeneration(api);
    registerMklev(api);
    registerPriest(api); // before the LevelDef contents, as create_altar()
    registerSpLev(api, SPLEV_FIXUPS);
    registerShops(api); // after the LevelDef contents, as fill_special_room()
    registerZoo(api); // likewise
    registerVault(api); // likewise; the vault is the last room
    registerHarass(api); // amulet(), after invault() by priority
    registerRooms(api); // after the pets arrive, as goto_level()
    registerShopDamage(api); // after check_special_room(FALSE), as goto_level()
    registerGehennom(api); // the passtune right after the layout; Gehennom's arrival message
    registerDemonTalk(api);
    registerAmuletWish(api);
    registerSeduce(api);
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
  WIZ_MKROOM,
  WIZ_BORN,
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
export { RACES, ROLES } from './roles';
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
  initialAttributes,
  initAttr,
  varyInitAttr,
  pluslvl,
  regenPw,
  MAXULEV,
} from './hero';
export { pwOf, setPw, uspellOf, setUspell, type Pw, type USpell } from './uenergy';
export { CAST_ID, CAST_ACTIONS, CAST_BOOKS, spelleffects, castProtection } from './cast';
export { MONSTER_ID, monAbility, domonability } from './monability';
export { JUMP_ID, jump, isValidJumpPos, validJumpPositions, walkPath } from './jump';
export { SPELL_INFO, percentSuccess, isqrt, spellLevPw } from './spellcalc';
export {
  urole,
  urace,
  roleIs,
  raceIs,
  roleDefId,
  raceDefId,
  roleKeyOf,
  raceKeyOf,
  ROLE_ORDER,
  RACE_ORDER,
  type RoleKey,
  type RaceKey,
} from './urole';
export {
  ROLES_TAB,
  enermod,
  roleNameKey,
  rankTitleKey,
  type RoleRow,
  type RoleSpell,
  type HpAdvance,
  type Innate,
} from './roletab';
export { RACES_TAB, adjabilRace, type RaceRow } from './racetab';
export { SKILL_TAB } from './skilltab';
export { messagesEn } from './messages.en';
export { ITEM_ACTIONS, lookHere, dolook, encumberMsg } from './itemactions';
export {
  engrAt,
  makeEngrAt,
  delEngrAt,
  sengrAt,
  wipeoutText,
  wipeEngrAt,
  uWipeEngr,
  engravingsOn,
  type Engr,
  type EngrType,
} from './engr';
export { LOOK_ID, readEngrAt } from './engrave';
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
  alignGtitle,
  alignStr,
  initPantheon,
  pantheon,
  startAlign,
  uGname,
  uInitAlign,
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
export { mattackm, fightm, monkilled, mondied, growUp, M_ATTK } from './mhitm';
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
  ualignBase,
  ualignCur,
  LUCKMIN,
  LUCKMAX,
} from './luck';
export type { UState } from './luck';
export { PRAY_ACTIONS, PRAY_ID, inTrouble, invulnerable } from './pray';
export { OFFER_ACTIONS, OFFER_ID, evalOffering, mkArtifactByAlign, sacrificeValue } from './offer';
export { givit, shouldGivit, corpseIntrinsic, cpostfxOf } from './givit';
export {
  knowsClass,
  knowsObject,
  registerKit,
  uInitInventoryAttrs,
  uInitSkillsDiscoveries,
  umoney0,
} from './kit';
export { KITS, EXTRAS, INV_SUBS, type TrObj } from './kittab';
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
  P_MASTER,
  P_GRAND_MASTER,
  martialBonus,
  skillNameKey,
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
export { hatesSilver, nameToMon, nameToMonplus } from './mondata';
export type { MonName } from './mondata';
export { mkWished, holdAnotherObject, askWish, answerWish, MAXWISHTRY } from './wish';
export type { WishData, WishOpts } from './wish';
export { hitval } from './combat';
export { nhData } from './items';
export { rndmonst, makemon, registerGeneration, rndghostname } from './generation';
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
export {
  MAXMONNO,
  born,
  countKill,
  deaths,
  isExtinct,
  isGone,
  mbirthLimit,
  vanquishedLines,
} from './vanquished';
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
export { MON_POLE_DIST, thrwmu, selectRwep, linedUp, shouldMulchMissile } from './mthrowu';
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
export { cutworm } from './wormcut';
export { giveWormTail, placeWormTailRandomly, wormCross, wormMove, wormNomove } from './worm';
export {
  LONG_WORM,
  WORM_TAIL,
  countWsegs,
  isWormTail,
  mAt,
  tailOwner,
  wormHead,
  wormRec,
} from './wormstate';
export { mkobj, mkobjAt, mksobjFull, mkboxCnts, rndmonnum, MKOBJ_PROBS, BOX_PROBS } from './mkobj';
export { somexyspace, somexyspaceTry, occupied } from './somexy';
export {
  mkSpecialRoom,
  pickRoom,
  mkzoo,
  doMkroom,
  hasUpstairs,
  hasDnstairs,
  inducedAlign,
  makeTemple,
  mktemple,
  shrinePos,
} from './mkroom';
export { courtmon, squadmon, morguemon, ndemon, antholemon } from './roommon';
export {
  ZOO,
  COURT,
  LEPREHALL,
  BEEHIVE,
  MORGUE,
  BARRACKS,
  SWAMP,
  COCKNEST,
  ANTHOLE,
  FILLED_ZOO_KINDS,
  fillZoo,
  isZooKind,
  mkTtObject,
  roomDoors,
} from './zoo';
export { fillOrdinaryRoom, mktrap, traptypeRnd, mkfount, mksink, mkaltar } from './mklev';
export { VAULT, vaultRoom, pendingVaultTele } from './vaultstate';
export { mkVault, fillVault, revealVaultTele } from './vault';
export {
  FTN_MAGIC,
  FTN_LOOTED,
  FTN_WARNED,
  fountainBits,
  setFountainBits,
  heroOnFountain,
  drinkfountain,
  dipfountain,
  dryup,
  dogushforth,
} from './fountain';
export { waterDamage, type WaterResult } from './water';
export { DIP_ID, DIP_INTO_ID, DIP_ACTIONS, potionDip, mixtype, h2oPotionDip } from './dip';
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
  teleTrap,
  vaultTele,
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
export { POLE_ID, polearmRange, usePole, validPolePositions } from './pole';
export { formHatesSilver, heroHatesSilver, isSilver } from './silver';
export { LOOT_ID, LOOT_ACTIONS, BOX, useContainer, floorContainers } from './container';
export { LOCK_ID, PICKLOCK_ID, KEY, autokey } from './lock';
export {
  LAMP,
  beginBurn,
  endBurn,
  igniteItems,
  objLights,
  snuffLit,
  snuffCandle,
  catchLit,
} from './light';
export { burnRec, candleLightRange } from './burnstate';
export { explodeOil, lightCocktail } from './oil';
export { objKnown, setObjKnown, setLknown, setCknown } from './items';
export { BOULDER, boulderAt, blockersOf } from './boulder';
export { moverock, couldMoveOntoBoulder } from './moverock';
export { newcham, polyok } from './newcham';
export { decideToShapeshift, vamprises, vampStone } from './shapeshift';
export { callKops, kopsGone, makekops } from './kops';
export { WIPE_ID, useCreamPie } from './creampie';
export { ucreamed } from './creamed';
export { chamOf, isVampshifter } from './chamstate';
export { polyObj } from './polyobj';
export { polyself, polymon, newman, rehumanize, youWere, POLYSELF_ID } from './polyself';
export { heroForm, heroFormId, upolyOf, upolyd, type UPoly } from './upoly';
export { isIce, isLava, isPool, isPoolOrLava, mInAir, waterbodyName } from './liquid';
export { amphibious, breathless, likesLavaId, swimming, uinwater, wwalking } from './uwater';
export { flying } from './trapstate';
export { cantDrown, isSwimmer, likesLava } from './mondata';
export {
  ARTIFACTS,
  QUEST_ARTIFACT,
  artifactRow,
  artifactRowOrNull,
  isQuestRow,
  type ArtifactDef,
  type ArtiAd,
  type Bane,
  type InvokePower,
  type Spfx,
} from './artilist';
export {
  artiAlign,
  artiCost,
  artiExists,
  artiInfo,
  artiOf,
  artiRole,
  artifactName,
  artifactOrigin,
  bareArtifactName,
  discoverArtifact,
  discoveredArtifacts,
  existArtifact,
  findArtifact,
  isArt,
  mkArtifactConvert,
  nartifactExist,
  oname,
  onameItem,
  anyQuestArtifact,
  isQuestArtifact,
  questArtifactId,
  uWieldArt,
  uncreateArtifact,
  undiscoveredArtifact,
  type ArtiInfo,
  type ArtiOrigin,
  type ArtiState,
} from './artistate';
// m20 step 3: the artifacts' special attacks (artihit.ts registers itself with the attack code)
export { attacks, specAbility, specAbon, specApplies, specDbon } from './artifact';
// m20 step 4: monsters and artifacts
export { baneApplies, monTouchArtifact, touchVerdict, type TouchVerdict } from './artifact';
export { artiReflects, defended, defends, defendsWhenCarried, protects } from './artidef';
export { FATAL_DAMAGE_MODIFIER, artifactHit } from './artihit';
export { notFullyIdentified, objIsPname } from './objnam';
// m20 step 5: touching and intrinsics
export { retouchEquipment, retouchObject, touchArtifact } from './artitouch';
export { glowStrength, seeMonstersWarn } from './artiglow';
export { artiLightRadius } from './light';
export { maybeHalfPhys, maybeHalfSpell, refreshWornProps, warnOfMonFlags } from './props';
export { warnOfMonSenses } from './perception';
