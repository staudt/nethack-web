// #offer: sacrificing corpses (and the imitation Amulet) on an altar, and the gods' gifts.
// A fresh corpse on her own god's altar mollifies an angry god, shortens the prayer timeout,
// gives an artifact now and then (from experience level 3 with Luck not negative) or raises
// Luck; on another god's altar it converts the altar (or, while her own god is angry and she
// has never converted, converts her); her own race is a grave offense (the altar is stained or
// vanishes, a demon may answer on a chaotic altar); unicorns count by their alignment.
// ref: src/pray.c dosacrifice(), offer_corpse(), eval_offering(), sacrifice_value(),
// consume_offering(), bestow_artifact(), offer_different_alignment_altar(),
// sacrifice_your_race(), offer_fake_amulet(), offer_negative_valued(), offer_too_soon(),
// at_your_feet(); src/artifact.c mk_artifact() (by alignment); src/eat.c floorfood(),
// offer_ok(), sacrifice_value()'s eaten_stat() and peek_at_iced_corpse_age()
//
// On a high altar (highaltar.ts) another god's altar is desecrated, never converted, and the real
// Amulet may be offered (offer_real_amulet()): to Moloch it ends her, to another god on the
// Astral Plane it is an escape in celestial disgrace, to her own god her ascension.
//
// Not ported (DEVIATIONS.md "Sacrifice"): the Riders' revival, former pets' corpses (a corpse
// does not remember its monster), the conducts and livelog, Wisdom exercise, Deafness ("Oh,
// no."), body parts (always feet), the atheism conduct. The choice is one menu of the corpses
// here and then the carried corpses and Amulets (C asks about each floor corpse, then
// getobj()).
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  rnl,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
  type PromptOption,
} from '@nh/core';
import {
  A_CHAOTIC,
  A_LAWFUL,
  A_NEUTRAL,
  A_NONE,
  aAlign,
  alignGname,
  alignStr,
  godvoice,
  onAltar,
  uGname,
} from './align';
import { altarOf, type Aligntyp } from './aligntyp';
import { T, setTerrain } from './terrain';
import { ARTIFACTS, type ArtifactDef } from './artilist';
import {
  artiAlign,
  artiExists,
  artiRoleIs,
  artifactOrigin,
  bareArtifactName,
  discoverArtifact,
  nartifactExist,
  onameItem,
} from './artistate';
import { adjattrib } from './attrib';
import { rnz } from './corpses';
import { uchangealign } from './dowear';
import { useup } from './eat';
import { uswallow } from './engulfstate';
import { makemon } from './generation';
import { invOption } from './itemactions';
import { placeOnFloor } from './items';
import { inHell, isAstral } from './levelflags';
import {
  LUCKMAX,
  adjalign,
  alignLim,
  changeLuck,
  luckOf,
  setU,
  uState,
  ualignBase,
  ualignCur,
} from './luck';
import { hcolor } from './hcolor';
import { dlord, summonMinion } from './minion';
import { mksobjFull } from './mkobj';
import { isDemon, isUnicorn } from './mondata';
import { nomul } from './nomul';
import { discover } from './o_init';
import { doname, xnameOf } from './objnam';
import { angryPriest } from './peaceful';
import { angrygods, desecrateAltar, fryByGod, godsUpset } from './pray';
import { isHighAltar } from './highaltar';
import { AMULET_OF_YENDOR } from './uhave';
import { amuletOff } from './jewelry';
import { done } from './end';
import { endAlive } from './endstate';
import { heroFemale } from './gender';
import { monNam } from './perception';
import { P, hasProp } from './props';
import { raceHostile, yourRace } from './race';
import { RACES_TAB } from './racetab';
import { canReachFloor } from './reach';
import { P_BASIC, P_SKILLED, skillMax, unrestrictWeaponSkill } from './skills';
import { fatalCorpseMistake } from './stonetouch';
import { levitating } from './trapstate';
import { urace } from './urole';
import { heroData } from './artifact';
import { findpriest, pCoaligned, epriOf, templeOccupied } from './epri';
import { uRooms } from './urooms';
import { wizardMode } from './knoxstate';

export const OFFER_ID: DefId = 'nh:offer';

const CORPSE: DefId = 'nh:corpse';
const FAKE_AMULET: DefId = 'nh:fake_amulet_of_yendor';
/** "Moloch" (the god of unaligned altars) as a message param. */
const MOLOCH = '@god.moloch';
/** ref: src/pray.c MAXVALUE: the highest corpse value (besides the Wizard's) */
const MAXVALUE = 24;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const halluc = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.HALLUC);
const blind = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.BLINDED);
const ulevel = (ctx: Pick<Ctx, 'state'>): number => hero(ctx).c.experience?.level ?? 1;

/** The altar under the hero (callers check onAltar() first). */
function heroAltar(ctx: Pick<Ctx, 'state'>): number {
  const p = hero(ctx).c.pos;
  return (p ? aAlign(ctx, p.x, p.y) : null) ?? A_NONE;
}

/** a_gname(): the god of the altar she stands on. */
const aGname = (ctx: Pick<Ctx, 'state'>): string => alignGname(ctx.state, heroAltar(ctx));

/** ref: include/align.h `ugod_is_angry() (u.ualign.record < 0)` */
const ugodIsAngry = (ctx: Pick<Ctx, 'state'>): boolean => uState(ctx.state).alignRecord < 0;

/**
 * The value of a corpse as a sacrifice: its monster's difficulty + 1 while fresh (50 turns; an
 * acid blob's always), scaled down for a partly eaten one; 0 when too old.
 * ref: src/pray.c sacrifice_value(); src/eat.c eaten_stat() (no ice: the age is the corpse's own)
 */
export function sacrificeValue(ctx: Pick<Ctx, 'state' | 'defs'>, obj: Entity): number {
  const it = obj.c.item;
  const mnum = it?.corpseOf;
  if (!it || !mnum || !ctx.defs.isMonster(mnum)) return 0;
  const mon = ctx.defs.monster(mnum);
  if (mnum !== 'nh:acid_blob' && ctx.state.turn > (it.age ?? 0) + 50) return 0;
  let value = mon.difficulty + 1;
  if (it.eaten) {
    // eaten_stat(): scaled by the nutrition left, at least 1
    const full = mon.nutrition;
    const left = Math.min(it.eaten, full);
    value = full ? Math.trunc((value * left) / full) : 0;
    if (value < 1) value = 1;
  }
  return value;
}

/**
 * The corpse's value on this altar: undead are worth a point more to a non-chaotic (and to a
 * chaotic for a wraith: she has surely eaten meat, no conducts); a unicorn of the altar's
 * alignment is an insult (-1: "Such an action is an insult to balance!"), one of another on her
 * own god's altar is worth 3 more and 5 alignment ("You feel appropriately neutral."), one of
 * her alignment on another's altar makes her god angry (record -1, value 1), any other is worth
 * 3 more. ref: src/pray.c eval_offering()
 */
export function evalOffering(ctx: Ctx, obj: Entity, altaralign: number): number {
  let value = sacrificeValue(ctx, obj);
  if (!value) return 0;
  const mnum = obj.c.item?.corpseOf;
  if (!mnum) return 0;
  const ptr = ctx.defs.monster(mnum);
  const ualign = uState(ctx.state).alignType;
  if (ptr.flags.includes('undead')) {
    // not demons--no demon corpses; a chaotic's wraith counts too (unvegetarian: no conducts)
    if (ualign !== A_CHAOTIC || ptr.id === 'nh:wraith') value += 1;
  } else if (isUnicorn(ptr)) {
    const unicalign = Math.sign(ptr.alignment);
    if (unicalign === altaralign) {
      // when same as altar, always a very bad action
      say(ctx, 'offer.insult', {
        what: `@offer.insult.${unicalign === A_CHAOTIC ? 'chaos' : unicalign ? 'law' : 'balance'}`,
      });
      adjattrib(ctx, 'wis', -1, false);
      return -1;
    } else if (ualign === altaralign) {
      // when different from altar, and altar is same as yours, it's a very good action
      if (uState(ctx.state).alignRecord < alignLim(ctx.state))
        say(ctx, 'offer.appropriately', { align: alignStr(ualign) });
      else say(ctx, 'offer.right_path');
      adjalign(ctx, 5);
      value += 3;
    } else if (unicalign === ualign) {
      // a unicorn of your alignment to an altar not of your alignment: your god gets angry and
      // it's a conversion
      setU(ctx, { alignRecord: -1 });
      value = 1;
    } else {
      // an ordinary (well, with a bonus) sacrifice on a cross-aligned altar
      value += 3;
    }
  }
  return value;
}

/** "Your sacrifice is consumed in a plume of smoke!" and it is used up. ref: consume_offering() */
function consumeOffering(ctx: Ctx, obj: Entity): void {
  const ualign = uState(ctx.state).alignType;
  if (halluc(ctx)) say(ctx, `offer.consumed_halluc.${ctx.rng.rn2(3)}`);
  else if (blind(ctx) && ualign === A_LAWFUL) say(ctx, 'offer.disappears');
  else
    say(ctx, 'offer.consumed', {
      how: `@offer.consumed.${ualign === A_LAWFUL ? 'light' : ualign === A_NEUTRAL ? 'smoke' : 'flame'}`,
    });
  useup(ctx, obj);
}

/** The Amulet offered on a low altar. ref: src/pray.c offer_too_soon() */
function offerTooSoon(ctx: Ctx, altaralign: number): void {
  if (altaralign === A_NONE && inHell(ctx.state)) {
    godsUpset(ctx, A_NONE); // Moloch becomes angry
    return;
  }
  say(ctx, 'offer.too_soon', {
    feel: halluc(ctx)
      ? '@offer.too_soon.homesick'
      : altaralign === uState(ctx.state).alignType
        ? '@offer.too_soon.surface'
        : '@offer.too_soon.ashamed',
  });
}

/** Another god's high altar is desecrated; else the gods are upset. ref: offer_negative_valued() */
function offerNegativeValued(ctx: Ctx, highaltar: boolean, altaralign: number): void {
  if (altaralign !== uState(ctx.state).alignType && highaltar)
    desecrateAltar(ctx, highaltar, altaralign);
  else godsUpset(ctx, altaralign);
}

/**
 * The imitation Amulet: on a low altar, not known to be fake, it is the Amulet offered too soon;
 * else the thunderclap, and "You realize you have made a mistake." (now known, Luck -1) or, known
 * all along, the gods' anger. ref: src/pray.c offer_fake_amulet()
 */
function offerFakeAmulet(ctx: Ctx, obj: Entity, highaltar: boolean, altaralign: number): void {
  const it = obj.c.item;
  if (!highaltar && !it?.known.spe) {
    offerTooSoon(ctx, altaralign);
    return;
  }
  say(ctx, 'offer.thunderclap');
  if (it && !it.known.spe) {
    say(ctx, halluc(ctx) ? 'offer.mistake_halluc' : 'offer.mistake');
    it.known = { ...it.known, spe: true };
    changeLuck(ctx, -1);
    return;
  }
  // don't you dare try to fool the gods
  changeLuck(ctx, -3);
  adjalign(ctx, -1);
  setU(ctx, { ugangr: uState(ctx.state).ugangr + 3 });
  offerNegativeValued(ctx, highaltar, altaralign);
}

/**
 * The real Amulet offered on a high altar ends the game ("You offer the Amulet of Yendor to
 * Mitra..."). To Moloch, in the Sanctum: the record falls to -99, "An invisible choir chants,
 * and you are bathed in darkness...", "Moloch shrugs and retains dominion over Odin, then
 * mercilessly snuffs out your life." (killed by Moloch's indifference); life-saved, Moloch snarls
 * and tries again (his disintegration), and one who still lives escapes in a cloud of black
 * smoke. To another god on the Astral Plane: the record falls by 99, "Set accepts your gift, and
 * gains dominion over Odin...", "Odin is enraged...", "Fortunately, Set permits you to live...",
 * and she escapes in a cloud of orange smoke (in celestial disgrace). To her own god: she has
 * won, "An invisible choir sings, and you are bathed in radiance...", "Mortal, thou hast done
 * well!", the gift of Immortality, "You ascend to the status of Demigoddess...".
 * ref: src/pray.c offer_real_amulet()
 */
function offerRealAmulet(ctx: Ctx, obj: Entity, altaralign: number): void {
  // the final Test.  Did you win?
  if (obj.c.item?.equipped === 'amulet') amuletOff(ctx, obj);
  useup(ctx, obj); // well, it's gone now
  say(ctx, 'offer.real_amulet', { god: aGname(ctx) });
  if (altaralign === A_NONE) {
    // Moloch's high altar at the bottom of Gehennom
    if (uState(ctx.state).alignRecord > -99) setU(ctx, { alignRecord: -99 });
    say(ctx, 'offer.choir_darkness');
    say(ctx, 'offer.moloch_shrugs', { moloch: MOLOCH, god: uGname(ctx.state) });
    say(ctx, 'offer.moloch_snuffs');
    const h = hero(ctx);
    if (h.c.hp) h.c.hp.cur = 0;
    done(ctx, '@killer.moloch_indifference');
    if (ctx.state.gameOver) return;
    // life-saved
    say(ctx, 'offer.moloch_snarls', { moloch: MOLOCH });
    fryByGod(ctx, A_NONE, true); // wrath of Moloch
    if (ctx.state.gameOver) return;
    say(ctx, 'offer.cloud_of_smoke', { color: hcolor(ctx, 'black') });
    endAlive(ctx, 'escaped');
  } else if (uState(ctx.state).alignType !== altaralign) {
    // And the opposing team picks you up and carries you off on their shoulders.
    adjalign(ctx, -99);
    say(ctx, 'offer.gains_dominion', { god: aGname(ctx), ugod: uGname(ctx.state) });
    say(ctx, 'offer.enraged', { god: uGname(ctx.state) });
    say(ctx, 'offer.permits_live', { god: aGname(ctx) });
    say(ctx, 'offer.cloud_of_smoke', { color: hcolor(ctx, 'orange') });
    endAlive(ctx, 'escaped');
  } else {
    // You've won the game!  Feedback-wise, it's a bit of a let down.
    setU(ctx, { ascended: true });
    adjalign(ctx, 10);
    say(ctx, 'offer.choir_radiance');
    godvoice(ctx, altaralign, 'offer.done_well');
    say(ctx, 'offer.immortality');
    say(ctx, heroFemale(ctx.state) ? 'offer.ascend_demigoddess' : 'offer.ascend_demigod');
    endAlive(ctx, 'ascended');
  }
}

/**
 * Converts the altar to her god ("The altar glows gray.", "You feel the power of Odin
 * increase.") or fails ("Unluckily, you feel the power of Odin decrease."); while her own god is
 * angry she converts instead the first time ("Thor accepts your allegiance."), or is rejected.
 * The altar's god may send a minion to punish her either way. ref: src/pray.c
 * offer_different_alignment_altar()
 */
function offerDifferentAlignmentAltar(ctx: Ctx, obj: Entity, altaralign: number): void {
  const u = uState(ctx.state);
  // an unaligned altar in Gehennom will always elicit rejection
  if (ugodIsAngry(ctx) || (altaralign === A_NONE && inHell(ctx.state))) {
    if (ualignCur(ctx.state) === ualignBase(ctx.state) && altaralign !== A_NONE) {
      say(ctx, 'offer.strong_feeling', { god: uGname(ctx.state) });
      consumeOffering(ctx, obj);
      say(ctx, 'offer.accepts', { god: aGname(ctx) });
      uchangealign(ctx, altaralign, 'convert');
      // beware, conversion is costly
      changeLuck(ctx, -3);
      setU(ctx, { ublesscnt: uState(ctx.state).ublesscnt + 300 });
    } else {
      setU(ctx, { ugangr: u.ugangr + 3 });
      adjalign(ctx, -5);
      say(ctx, 'offer.rejects', { god: aGname(ctx) });
      godvoice(ctx, altaralign, 'offer.suffer_infidel');
      changeLuck(ctx, -5);
      adjattrib(ctx, 'wis', -2, false);
      if (!inHell(ctx.state)) angrygods(ctx, uState(ctx.state).alignType);
    }
    return;
  }
  consumeOffering(ctx, obj);
  say(ctx, 'offer.conflict', { god: uGname(ctx.state), other: aGname(ctx) });
  const record = (): number => uState(ctx.state).alignRecord;
  // the altar's god may send a minion to punish her (summon_minion(altaralign, TRUE))
  const minionRolls = (n: number, d: number): void => {
    if (
      rnl(ctx.rng, ulevel(ctx), luckOf(ctx.state)) > 6 &&
      record() > 0 &&
      ctx.rng.rnd(record()) > Math.trunc((n * alignLim(ctx.state)) / d)
    )
      summonMinion(ctx, altaralign as Aligntyp, true);
  };
  if (ctx.rng.rn2(8 + ulevel(ctx)) > 5) {
    say(ctx, 'offer.power_increase', { god: uGname(ctx.state) });
    changeLuck(ctx, 1);
    const p = hero(ctx).c.pos;
    // the shrine flag stays (Level.shrines is by position)
    if (p) setTerrainAt(ctx, p.level, p.x, p.y, altarOf(uState(ctx.state).alignType as Aligntyp));
    if (!blind(ctx)) {
      const ua = uState(ctx.state).alignType;
      say(ctx, 'offer.altar_glows', {
        color: hcolor(ctx, ua === A_LAWFUL ? 'white' : ua ? 'black' : 'gray'),
      });
    }
    minionRolls(3, 4); // rnd(record) > (3 * ALIGNLIM) / 4
    // anger priest; test handles bones files
    const level = getLevel(ctx.state);
    const room = templeOccupied(level, uRooms(ctx));
    const pri = room === null ? null : findpriest(ctx, room);
    const epri = pri === null ? null : epriOf(ctx, pri);
    if (epri && !pCoaligned(ctx, epri)) angryPriest(ctx);
  } else {
    say(ctx, 'offer.power_decrease', { god: uGname(ctx.state) });
    changeLuck(ctx, -1);
    minionRolls(7, 8); // rnd(record) > (7 * ALIGNLIM) / 8
  }
}

/** Paints terrain on a level of the hero's dungeon. */
function setTerrainAt(ctx: Ctx, levelId: string, x: number, y: number, id: DefId): void {
  const level = ctx.state.levels[levelId];
  if (level) setTerrain(level, x, y, id);
}

/** The altar loses its shrine (its altarmask is rewritten without AM_SHRINE). */
function dropShrine(ctx: Ctx, levelId: string, x: number, y: number): void {
  const level = ctx.state.levels[levelId];
  if (!level?.shrines) return;
  const kept = level.shrines.filter((s) => s.x !== x || s.y !== y);
  if (kept.length > 0) level.shrines = kept;
  else delete level.shrines;
}

/**
 * Her own race on the altar: a non-chaotic "will regret this infamous offense"; a lawful or
 * neutral altar is stained with her race's blood and becomes chaotic; a chaotic one vanishes in
 * a black cloud for a non-chaotic, else (or Moloch's) the blood covers it; on those a demon
 * lord may answer ("You have summoned Juiblex!", terrified for 3 turns). Then a non-chaotic
 * angers her god; a chaotic gains 5 alignment. Returns the extra time (terrified).
 * On a high altar, unless both it and she are chaotic, the altar is desecrated instead (the
 * corpse stays). ref: src/pray.c sacrifice_your_race()
 */
function sacrificeYourRace(ctx: Ctx, obj: Entity, highaltar: boolean, altaralign: number): number {
  const ualign = uState(ctx.state).alignType;
  let extra = 0;
  const form = heroData(ctx);
  if (form && isDemon(form)) say(ctx, 'offer.satisfying');
  else if (ualign !== A_CHAOTIC) say(ctx, 'offer.infamous');
  const p = hero(ctx).c.pos;
  if (highaltar && (altaralign !== A_CHAOTIC || ualign !== A_CHAOTIC)) {
    desecrateAltar(ctx, highaltar, altaralign);
    return 0;
  } else if (altaralign !== A_CHAOTIC && altaralign !== A_NONE) {
    // curse the lawful/neutral altar
    say(ctx, 'offer.stained', { race: `@race.${urace(ctx.state)}.adj` });
    if (p) {
      setTerrainAt(ctx, p.level, p.x, p.y, altarOf(A_CHAOTIC));
      dropShrine(ctx, p.level, p.x, p.y);
    }
    angryPriest(ctx);
  } else {
    // human sacrifice on a chaotic or unaligned altar is equivalent to demon summoning
    let demonless: string;
    if (altaralign === A_CHAOTIC && ualign !== A_CHAOTIC) {
      say(ctx, 'offer.altar_vanishes', { color: hcolor(ctx, 'black') });
      if (p) {
        setTerrainAt(ctx, p.level, p.x, p.y, T.floor);
        dropShrine(ctx, p.level, p.x, p.y);
      }
      angryPriest(ctx);
      demonless = 'offer.cloud_dissipates';
    } else {
      // either you're chaotic or altar is Moloch's or both
      say(ctx, 'offer.blood_covers');
      changeLuck(ctx, altaralign === A_NONE ? -2 : 2);
      demonless = 'offer.blood_coagulates';
    }
    const pm = dlord(ctx, altaralign === A_NONE ? undefined : altaralign);
    const id =
      pm !== null && p
        ? makemon(ctx, ctx.defs.monster(pm), { x: p.x, y: p.y }, { adjacentOk: true })
        : null;
    const dmon = id === null ? undefined : ctx.state.entities[String(id)];
    if (dmon?.c.monster) {
      const name = monNam(ctx, dmon);
      say(ctx, 'offer.summoned', {
        mon: name === '@pronoun.it' ? '@offer.something_dreadful' : name,
      });
      if (Math.sign(ualign) === Math.sign(ctx.defs.monster(dmon.def).alignment))
        dmon.c.monster.peaceful = true;
      say(ctx, 'offer.terrified');
      extra = nomul(ctx, 3, 'helpless.terrified_demon');
    } else say(ctx, demonless);
  }
  if (ualign !== A_CHAOTIC) {
    adjalign(ctx, -5);
    setU(ctx, { ugangr: uState(ctx.state).ugangr + 3 });
    adjattrib(ctx, 'wis', -1, false);
    if (!inHell(ctx.state)) angrygods(ctx, uState(ctx.state).alignType);
    changeLuck(ctx, -5);
  } else adjalign(ctx, 5);
  if (ctx.state.entities[String(obj.id)]) useup(ctx, obj);
  return extra;
}

/**
 * A god's gift: an artifact of her alignment (or unaligned) that does not exist yet, of a gift
 * value up to `maxGift` unless it is her role's; her role's own first, else one at random among
 * those whose weapon skill she can reach (an unaligned one needs a previous gift or 1 chance in
 * 3; a weapon she could never be Skilled in passes 1 time in 4, or 1 in 2 when Basic), the
 * ones that failed only when none passed. Not her race's enemies' equipment. The object is made
 * (mksobj init, no random artifact) with no erosion and its gen_spe; null when none is eligible.
 * ref: src/artifact.c mk_artifact() with an alignment
 */
export function mkArtifactByAlign(ctx: Ctx, alignment: number, maxGift: number): Entity | null {
  const { state } = ctx;
  const eligible: ArtifactDef[] = [];
  let n = 0;
  let altn = 0;
  const ugifts = uState(state).ugifts ?? 0;
  for (const a of ARTIFACTS) {
    if (artiExists(state, a.id)) continue;
    if (a.spfx.includes('nogen')) continue;
    if (a.giftValue > maxGift && !artiRoleIs(state, a)) continue;
    const align = artiAlign(state, a);
    // we're looking for an alignment-specific item suitable for hero's role+race; avoid
    // enemies' equipment
    const raceMon = a.race === null ? null : RACES_TAB[a.race].mnum;
    if (
      (align === alignment || align === A_NONE) &&
      (raceMon === null ||
        !ctx.defs.isMonster(raceMon) ||
        !raceHostile(state, ctx.defs.monster(raceMon)))
    ) {
      // when a role-specific first choice is available, use it
      if (artiRoleIs(state, a)) {
        eligible[0] = a;
        n = 1;
        break;
      }
      // check if this is skill-compatible
      let skillCompat = P_SKILLED;
      const def = ctx.defs.object(a.base);
      if (def.class === 'weapon' && def.weapon) skillCompat = skillMax(ctx, def.weapon.skill);
      if (
        (align !== A_NONE || ugifts > 0 || ctx.rng.rn2(3) === 0) &&
        (ctx.rng.rn2(4) === 0 ||
          skillCompat >= P_SKILLED ||
          (skillCompat >= P_BASIC && ctx.rng.rn2(2) !== 0))
      ) {
        eligible[n++] = a;
      } else if (!n) {
        // a fallback in case all aligned candidates are used up or failed the checks
        eligible[altn++] = a;
      }
    }
  }
  // resort to fallback list if main list was empty
  if (!n) n = altn;
  if (!n) return null;
  const a = eligible[ctx.rng.rn2(n)];
  if (!a) return null;
  const id = mksobjFull(ctx, ctx.defs.object(a.base), { artif: false });
  const obj = ctx.state.entities[String(id)];
  const it = obj?.c.item;
  if (!obj || !it) return null;
  // prevent erosion from generating
  delete it.erosion;
  onameItem(ctx, obj.def, it, a.name);
  artifactOrigin(ctx, a.id, 'random'); // 'random' is default
  // adjust_spe: clamped into the "normal" range
  const newSpe = it.spe + a.genSpe;
  if (newSpe >= -10 && newSpe < 10) it.spe = newSpe;
  return obj;
}

/**
 * The gift itself, once the roll succeeded: an artifact of the altar's alignment (C passes
 * a_align()), not cursed, not negative, erodeproof, at her feet ("A war hammer named Mjollnir
 * appears at your feet!"), "Use my gift wisely!", one more gift, a new prayer timeout, its
 * weapon skill unrestricted and, seen, the type and the artifact known.
 * ref: src/pray.c bestow_artifact() after the roll, at_your_feet()
 */
function giveArtifact(ctx: Ctx, maxGift: number): boolean {
  const nartifacts = nartifactExist(ctx.state);
  const obj = mkArtifactByAlign(ctx, heroAltar(ctx), maxGift);
  const it = obj?.c.item;
  if (!obj || !it) return false;
  const a = ARTIFACTS.find((r) => r.id === it.artifact);
  if (a) artifactOrigin(ctx, a.id, 'gift', true);
  if (it.spe < 0) it.spe = 0;
  if (it.buc === 'cursed') it.buc = 'uncursed';
  it.erodeproof = true;
  const lev = levitating(ctx) ? '_lev' : '';
  if (blind(ctx)) say(ctx, `offer.feet_blind${lev}`);
  else
    say(ctx, `offer.feet${lev}`, {
      what: halluc(ctx)
        ? { key: 'offer.doodad_named', params: { name: `=${a ? bareArtifactName(a) : ''}` } }
        : xnameOf(ctx.state, ctx.defs, obj),
    });
  const p = hero(ctx).c.pos;
  if (p) placeOnFloor(ctx, obj.id, p.level, p.x, p.y); // dropy()
  godvoice(ctx, uState(ctx.state).alignType, 'offer.use_gift_wisely');
  setU(ctx, {
    ugifts: (uState(ctx.state).ugifts ?? 0) + 1,
    ublesscnt: rnz(ctx, 300 + 50 * nartifacts),
  });
  // make sure we can use this weapon
  const def = ctx.defs.object(obj.def);
  if (def.weapon && (def.class === 'weapon' || def.class === 'tool' || def.class === 'gem'))
    unrestrictWeaponSkill(ctx, def.weapon.skill);
  if (!halluc(ctx) && !blind(ctx)) {
    discover(ctx, def); // makeknown(); observe_object() is the view's
    if (a) discoverArtifact(ctx, a.id);
  }
  return true;
}

/** Whether the gift roll may be made: level 3+ and her own Luck not negative. */
const mayBestow = (ctx: Pick<Ctx, 'state'>): boolean =>
  ulevel(ctx) > 2 && uState(ctx.state).luck >= 0;

/**
 * The co-aligned sacrifice's last step when no gift came: Luck up by the value's share, never
 * above the value (bonus Luck aside), and the four-leaf clover when it changed.
 * ref: src/pray.c offer_corpse() after bestow_artifact()
 */
function luckReward(ctx: Ctx, value: number): void {
  const origLuck = uState(ctx.state).luck;
  let luckIncrease = Math.trunc((value * LUCKMAX) / (MAXVALUE * 2));
  // sacrificing can't increase non-bonus Luck to above the value of the sacrifice
  if (origLuck > value) luckIncrease = 0;
  else if (origLuck + luckIncrease > value) luckIncrease = value - origLuck;
  changeLuck(ctx, luckIncrease);
  if (uState(ctx.state).luck < 0) setU(ctx, { luck: 0 });
  if (uState(ctx.state).luck !== origLuck) {
    if (blind(ctx)) say(ctx, 'offer.brushed_foot');
    else say(ctx, halluc(ctx) ? 'offer.crabgrass' : 'offer.clover');
  }
}

/** The data of the wizard-mode "Gift an artifact?" question. */
interface GiftData {
  offerGift: number;
}
const isGiftData = (d: Json): boolean =>
  typeof d === 'object' &&
  d !== null &&
  typeof (d as { offerGift?: unknown }).offerGift === 'number';

/**
 * A corpse offered: touching a cockatrice's bare-handed is fatal; her own race, a value of 0
 * ("Nothing happens."), a negative one (gods upset), another god's altar, then on her own: god's
 * anger lessened, absolution, a shorter prayer timeout, else a gift or Luck. Returns the extra
 * time taken (terrified by a demon), or null when the wizard-mode question was asked.
 * Another god's high altar is desecrated. ref: src/pray.c offer_corpse() (no Riders or former
 * pets)
 */
function offerCorpse(ctx: Ctx, obj: Entity, highaltar: boolean, altaralign: number): number | null {
  // you're handling this corpse, even if it was killed upon the altar
  if (fatalCorpseMistake(ctx, obj) && ctx.state.gameOver) return 0;
  const mnum = obj.c.item?.corpseOf;
  if (!mnum || !ctx.defs.isMonster(mnum)) return 0;
  const ptr = ctx.defs.monster(mnum);
  // same race results apply even if the corpse is too old (value == 0)
  if (yourRace(ctx.state, ptr)) return sacrificeYourRace(ctx, obj, highaltar, altaralign);
  let value = evalOffering(ctx, obj, altaralign);
  if (value === 0) {
    // too old; don't give undead or unicorn bonus or penalty
    say(ctx, 'offer.nothing_happens');
    return 0;
  }
  if (value < 0) {
    offerNegativeValued(ctx, highaltar, altaralign);
    return 0;
  }
  const u = uState(ctx.state);
  if (altaralign !== u.alignType && highaltar) {
    desecrateAltar(ctx, highaltar, altaralign);
    return 0;
  }
  if (u.alignType !== altaralign) {
    // sacrificing at an altar of a different alignment
    offerDifferentAlignmentAltar(ctx, obj, altaralign);
    return 0;
  }
  consumeOffering(ctx, obj);
  // OK, you get brownie points
  const chaotic = u.alignType === A_CHAOTIC;
  if (u.ugangr) {
    const saved = u.ugangr;
    const ugangr = Math.max(0, saved - Math.trunc((value * (chaotic ? 2 : 3)) / MAXVALUE));
    setU(ctx, { ugangr });
    if (ugangr !== saved) {
      if (ugangr) {
        say(ctx, 'offer.mollified', {
          god: uGname(ctx.state),
          how: halluc(ctx) ? '@offer.mollified.groovy' : '@offer.mollified.slightly',
        });
        if (uState(ctx.state).luck < 0) changeLuck(ctx, 1);
      } else {
        say(ctx, 'offer.mollified', {
          god: uGname(ctx.state),
          how: halluc(ctx) ? '@offer.mollified.cosmic' : '@offer.mollified.full',
        });
        if (uState(ctx.state).luck < 0) setU(ctx, { luck: 0 });
      }
    } else {
      // not satisfied yet
      say(ctx, halluc(ctx) ? 'offer.gods_tall' : 'offer.inadequacy');
    }
  } else if (ugodIsAngry(ctx)) {
    if (value > MAXVALUE) value = MAXVALUE;
    if (value > -u.alignRecord) value = -u.alignRecord;
    adjalign(ctx, value);
    say(ctx, 'offer.absolved');
  } else if (u.ublesscnt > 0) {
    const saved = u.ublesscnt;
    const ublesscnt = Math.max(0, saved - Math.trunc((value * (chaotic ? 500 : 300)) / MAXVALUE));
    setU(ctx, { ublesscnt });
    if (ublesscnt !== saved) {
      if (ublesscnt) {
        say(ctx, halluc(ctx) ? 'offer.not_like_you' : 'offer.hopeful');
        if (uState(ctx.state).luck < 0) changeLuck(ctx, 1);
      } else {
        say(ctx, halluc(ctx) ? 'offer.fried_onions' : 'offer.reconciliation');
        if (uState(ctx.state).luck < 0) setU(ctx, { luck: 0 });
      }
    }
  } else {
    // bestow_artifact(): "you were already in pretty good standing"; the chance goes down as
    // the number of artifacts goes up
    if (mayBestow(ctx)) {
      if (wizardMode(ctx.state)) {
        ctx.ask(
          { id: 'offer-gift', kind: 'yn', key: 'offer.gift_confirm', cancellable: true },
          OFFER_ID,
          { offerGift: value } satisfies GiftData as unknown as Json,
        );
        return null;
      }
      const nartifacts = nartifactExist(ctx.state);
      if (ctx.rng.rn2(6 + 2 * (uState(ctx.state).ugifts ?? 0) * nartifacts) === 0) {
        if (giveArtifact(ctx, value)) return 0;
      }
    }
    luckReward(ctx, value);
  }
  return 0;
}

/** The corpses here (when she reaches the floor), then her corpses and Amulets, real or not. */
function offerables(ctx: Ctx): { floor: Entity[]; carried: Entity[] } {
  const p = hero(ctx).c.pos;
  const floor =
    p && canReachFloor(ctx, true)
      ? itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y).filter((e) => e.def === CORPSE)
      : [];
  const inv = inventoryOf(ctx.state, ctx.state.playerId);
  // offer_ok(): corpses suggested and amulets downplayed (listed last), the other way round on
  // the Astral Plane
  const corpses = inv.filter((e) => e.def === CORPSE);
  const amulets = inv.filter((e) => e.def === FAKE_AMULET || e.def === AMULET_OF_YENDOR);
  const carried = isAstral(ctx.state) ? [...amulets, ...corpses] : [...corpses, ...amulets];
  return { floor, carried };
}

/** The menu answer's data. */
interface PickData {
  offerPick: true;
}
const isPickData = (d: Json): boolean =>
  typeof d === 'object' && d !== null && (d as { offerPick?: unknown }).offerPick === true;

/** Offers the chosen object. ref: src/pray.c dosacrifice() after floorfood() */
function sacrifice(ctx: Ctx, obj: Entity): number {
  const altaralign = heroAltar(ctx);
  const p = hero(ctx).c.pos;
  const highaltar = p !== undefined && isHighAltar(ctx, getLevel(ctx.state), p.x, p.y);
  if (obj.def === AMULET_OF_YENDOR) {
    if (!highaltar) offerTooSoon(ctx, altaralign);
    else offerRealAmulet(ctx, obj, altaralign);
    return NORMAL_SPEED;
  }
  if (obj.def === FAKE_AMULET) {
    offerFakeAmulet(ctx, obj, highaltar, altaralign);
    return NORMAL_SPEED;
  }
  if (obj.def === CORPSE) {
    const extra = offerCorpse(ctx, obj, highaltar, altaralign);
    return extra === null ? 0 : NORMAL_SPEED + extra;
  }
  say(ctx, 'offer.nothing_happens');
  return NORMAL_SPEED;
}

/**
 * #offer, offered while she stands on an altar (C offers it anywhere: "You are not on an
 * altar."): too impaired when confused or stunned; else the menu of what she can sacrifice.
 * ref: src/pray.c dosacrifice()
 */
const offer: ActionDef = {
  id: OFFER_ID,
  labelKey: 'action.nh:offer',
  handles: 'mod',
  offer: (ctx, target) =>
    target.kind === 'self' && onAltar(ctx) && !uswallow(ctx)
      ? [{ action: { type: 'mod', action: OFFER_ID }, labelKey: 'action.nh:offer' }]
      : [],
  perform(ctx) {
    if (!onAltar(ctx) || uswallow(ctx)) {
      say(ctx, levitating(ctx) ? 'offer.not_over_altar' : 'offer.not_on_altar');
      return 0;
    }
    const h = hero(ctx);
    if (hasProp(h, P.CONFUSION) || hasProp(h, P.STUNNED)) {
      say(ctx, 'offer.impaired');
      return 0;
    }
    const { floor, carried } = offerables(ctx);
    if (floor.length + carried.length === 0) {
      say(ctx, 'offer.nothing_to_sacrifice');
      return 0;
    }
    const options: PromptOption[] = [
      ...floor.map((e): PromptOption => ({
        value: e.id,
        key: 'offer.here_option',
        params: { item: doname(ctx.state, ctx.defs, e) },
      })),
      ...carried.map((e) => invOption(ctx, e)),
    ];
    ctx.ask(
      { id: 'offer-what', kind: 'menu', key: 'offer.what', cancellable: true, options },
      OFFER_ID,
      { offerPick: true } satisfies PickData as unknown as Json,
    );
    return 0;
  },
  answer(ctx, value, data) {
    if (isGiftData(data)) {
      const v = (data as unknown as GiftData).offerGift;
      if (value === true && giveArtifact(ctx, v)) return NORMAL_SPEED;
      luckReward(ctx, v);
      return NORMAL_SPEED;
    }
    if (!isPickData(data) || typeof value !== 'number') return 0;
    if (!onAltar(ctx)) return 0;
    const { floor, carried } = offerables(ctx);
    const obj = [...floor, ...carried].find((e) => e.id === value);
    if (!obj) return 0;
    return sacrifice(ctx, obj);
  },
};

export const OFFER_ACTIONS: readonly ActionDef[] = [offer];
