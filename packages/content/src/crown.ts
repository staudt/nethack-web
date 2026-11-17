// The prayer's two highest favors: the spellbook gift and crowning. A pat on the head that rolls
// 6 gives a spellbook (or, 1 time in 4, its spell straight into her mind); 7 or 8 crowns a pious
// hero who was never crowned (else the spellbook): the six intrinsics, the god's words, and the
// gift of her alignment (the Wizard's finger of death and the Monk's restore ability come
// first): a lawful hero's wielded long sword becomes Excalibur, a neutral one gets Vorpal Blade
// and a chaotic one Stormbringer at her feet (or her wielded one is praised), and the weapon is
// blessed, made erodeproof and at least +1, with its skill unrestricted and one skill slot more.
// ref: src/pray.c gcrownu(), give_spell(), at_your_feet(); src/spell.c known_spell(),
// force_learn_spell()
//
// Not ported (DEVIATIONS.md "Crowning"): livelog, voices (SetVoice()), observe_object() (the
// view's), body parts (always feet and stomach), the shop's sellobj() for a gift dropped in a
// shop.
import { getPlayer, inventoryOf, type Ctx, type DefId, type Entity, type Msg } from '@nh/core';
import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL, godvoice } from './align';
import { artifactRow } from './artilist';
import { onameObj } from './artiname';
import { discoverArtifact, existArtifact, isArt, uWieldArt } from './artistate';
import { uswallow } from './engulfstate';
import { floorEffectsLate } from './floorfx';
import { rndClass } from './gem';
import { hcolor } from './hcolor';
import { addToInventory, placeOnFloor, setRknown } from './items';
import { setU, uState } from './luck';
import { isWeaponOrWeptool } from './material';
import { mkobj, mksobjFull } from './mkobj';
import { discover, isKnown } from './o_init';
import { xnameOf } from './objnam';
import { monNam } from './perception';
import { P, hasProp, setIntrinsic } from './props';
import { addWeaponSkill, P_RESTRICTED, skillLevel, unrestrictWeaponSkill } from './skills';
import {
  BLANK_PAPER,
  SPE_FORGOTTEN,
  SPE_FRESH,
  SPE_UNKNOWN,
  forceLearnSpell,
  knownSpell,
} from './spell';
import { spellSkill } from './spellcalc';
import { levitating } from './trapstate';
import { roleIs } from './urole';

const EXCALIBUR: DefId = 'nh:excalibur';
const VORPAL_BLADE: DefId = 'nh:vorpal_blade';
const STORMBRINGER: DefId = 'nh:stormbringer';
const LONG_SWORD: DefId = 'nh:long_sword';
const RUNESWORD: DefId = 'nh:runesword';
const SPE_FINGER_OF_DEATH: DefId = 'nh:spellbook_of_finger_of_death';
const SPE_RESTORE_ABILITY: DefId = 'nh:spellbook_of_restore_ability';
const MAGIC_MARKER: DefId = 'nh:magic_marker';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const blind = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.BLINDED);

/** carrying(otyp): an object of the type in her inventory. */
const carrying = (ctx: Pick<Ctx, 'state'>, def: DefId): boolean =>
  inventoryOf(ctx.state, ctx.state.playerId).some((o) => o.def === def);

/** uwep */
const uwep = (ctx: Pick<Ctx, 'state'>): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null;

/** ok_wep(o): a weapon or a weapon-tool. ref: src/pray.c gcrownu() */
const okWep = (ctx: Pick<Ctx, 'defs'>, o: Entity | null): o is Entity =>
  o !== null && isWeaponOrWeptool(ctx.defs.object(o.def));

/**
 * "A sword appears at your feet!": `what` lands at (or, levitating, beneath) her feet, or drops
 * into the engulfer's stomach; "Something" when she is blind. ref: src/pray.c at_your_feet()
 */
function atYourFeet(ctx: Ctx, what: Msg): void {
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  if (engulfer) {
    // barrier between you and the floor
    say(ctx, blind(ctx) ? 'crown.feet_engulfed_blind' : 'crown.feet_engulfed', {
      ...(blind(ctx) ? {} : { what }),
      mon: monNam(ctx, engulfer),
    });
    return;
  }
  const lev = levitating(ctx) ? '_lev' : '';
  if (blind(ctx)) say(ctx, `offer.feet_blind${lev}`);
  else say(ctx, `offer.feet${lev}`, { what });
}

/** dropy() for a new object: into the engulfer, else onto the floor (flooreffects()). */
function dropy(ctx: Ctx, obj: Entity): void {
  const pos = hero(ctx).c.pos;
  if (!pos) return;
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  if (engulfer) {
    addToInventory(ctx, engulfer.id, obj.id); // mpickobj()
    return;
  }
  if (floorEffectsLate(ctx, obj, pos.x, pos.y, 'drop')) return;
  placeOnFloor(ctx, obj.id, pos.level, pos.x, pos.y);
}

const addGift = (ctx: Ctx): void => setU(ctx, { ugifts: (uState(ctx.state).ugifts ?? 0) + 1 });

/** The spellbooks rnd_class(bases[SPBOOK_CLASS], SPE_BLANK_PAPER) picks from. */
function bookRange(ctx: Pick<Ctx, 'defs'>): DefId[] {
  const all = ctx.defs.objects.filter((o) => o.class === 'spellbook').map((o) => o.id);
  const i = all.indexOf(BLANK_PAPER);
  return i < 0 ? all : all.slice(0, i + 1);
}

/**
 * Crowning: see invisible and fire, cold, shock, sleep and poison resistance; "I crown
 * thee...  The Hand of Elbereth!" (lawful), "Thou shalt be my Envoy of Balance!" (neutral) or
 * "Thou art chosen to steal souls for My Glory!" (chaotic); a Wizard gets the spellbook of finger
 * of death (unless she wields Vorpal Blade or Stormbringer or carries one) and a Monk without an
 * artifact in hand restore ability; else a lawful hero's wielded long sword becomes Excalibur, a
 * neutral one's wielded Vorpal Blade "goes snicker-snack!" or a new one lands at her feet, a
 * chaotic one's Stormbringer "hums ominously!" or arrives. The weapon is blessed, made
 * erodeproof, at least +1 and its skill unrestricted ("You feel unworthy." with none); one more
 * skill slot. ref: src/pray.c gcrownu()
 */
export function gcrownu(ctx: Ctx): void {
  const her = hero(ctx);
  for (const p of [P.SEE_INVIS, P.FIRE_RES, P.COLD_RES, P.SHOCK_RES, P.SLEEP_RES, P.POISON_RES])
    setIntrinsic(her, p, true);
  const align = uState(ctx.state).alignType;
  godvoice(ctx, align, null);

  const wep = uwep(ctx);
  let classGift: DefId | null = null;
  // 3.3.[01] had this in the A_NEUTRAL case, preventing chaotic wizards from receiving a
  // spellbook
  if (
    roleIs(ctx.state, 'wizard') &&
    !uWieldArt(ctx.state, VORPAL_BLADE) &&
    !uWieldArt(ctx.state, STORMBRINGER) &&
    !carrying(ctx, SPE_FINGER_OF_DEATH)
  )
    classGift = SPE_FINGER_OF_DEATH;
  else if (
    roleIs(ctx.state, 'monk') &&
    (!wep || wep.c.item?.artifact === undefined) &&
    !carrying(ctx, SPE_RESTORE_ABILITY)
  )
    // monks rarely wield a weapon
    classGift = SPE_RESTORE_ABILITY;

  let obj: Entity | null = okWep(ctx, wep) ? wep : null;
  let alreadyExists = false;
  let inHand = false;
  switch (align) {
    case A_LAWFUL:
      setU(ctx, { uhandOfElbereth: 1 });
      say(ctx, 'crown.hand_of_elbereth');
      break;
    case A_NEUTRAL:
      setU(ctx, { uhandOfElbereth: 2 });
      inHand = uWieldArt(ctx.state, VORPAL_BLADE);
      alreadyExists = existArtifact(ctx.state, LONG_SWORD, artifactRow(VORPAL_BLADE).name);
      say(ctx, 'crown.envoy_of_balance');
      break;
    case A_CHAOTIC: {
      setU(ctx, { uhandOfElbereth: 3 });
      inHand = uWieldArt(ctx.state, STORMBRINGER);
      alreadyExists = existArtifact(ctx.state, RUNESWORD, artifactRow(STORMBRINGER).name);
      const what = (alreadyExists && !inHand) || classGift !== null ? 'take_lives' : 'steal_souls';
      say(ctx, 'crown.chosen', { what: `@crown.${what}` });
      break;
    }
    default:
      break;
  }

  if (classGift !== null) {
    const id = mksobjFull(ctx, ctx.defs.object(classGift), { artif: false });
    const book = ctx.state.entities[String(id)];
    const bit = book?.c.item;
    if (book && bit) {
      bit.buc = 'blessed'; // bless()
      bit.known.buc = true; // ok to skip set_bknown()
      atYourFeet(ctx, xnameOf(ctx.state, ctx.defs, book));
      dropy(ctx, book);
      addGift(ctx);
    }
    obj = book ?? null;
    // when getting a new book for known spell, enhance currently wielded weapon rather than
    // the book
    if (knownSpell(ctx, classGift) !== SPE_UNKNOWN && okWep(ctx, wep)) obj = wep;
  }

  switch (align) {
    case A_LAWFUL:
      if (classGift !== null) {
        // already got bonus above
      } else if (obj && obj.def === LONG_SWORD && obj.c.item?.artifact === undefined) {
        if (!blind(ctx)) say(ctx, 'crown.sword_shines');
        onameObj(ctx, obj, artifactRow(EXCALIBUR).name, 'gift', true);
        if (isArt(obj, EXCALIBUR)) addGift(ctx);
      }
      // acquire Excalibur's skill regardless of weapon or gift
      unrestrictWeaponSkill(ctx, 'long_sword');
      if (isArt(obj, EXCALIBUR)) discoverArtifact(ctx, EXCALIBUR);
      break;
    case A_NEUTRAL:
      if (classGift !== null) {
        // already got bonus above
      } else if (obj && inHand) {
        say(ctx, 'crown.snicker_snack', { item: xnameOf(ctx.state, ctx.defs, obj) });
      } else if (!alreadyExists) {
        obj = newGift(ctx, LONG_SWORD, VORPAL_BLADE, { key: 'crown.sword' });
      }
      // acquire Vorpal Blade's skill regardless of weapon or gift
      unrestrictWeaponSkill(ctx, 'long_sword');
      if (isArt(obj, VORPAL_BLADE)) discoverArtifact(ctx, VORPAL_BLADE);
      break;
    case A_CHAOTIC: {
      const color = hcolor(ctx, 'black');
      if (classGift !== null) {
        // already got bonus above
      } else if (obj && inHand) {
        say(ctx, 'crown.hums', { color });
      } else if (!alreadyExists) {
        obj = newGift(ctx, RUNESWORD, STORMBRINGER, {
          key: 'crown.color_sword',
          params: { color },
        });
      }
      // acquire Stormbringer's skill regardless of weapon or gift
      unrestrictWeaponSkill(ctx, 'broad_sword');
      if (isArt(obj, STORMBRINGER)) discoverArtifact(ctx, STORMBRINGER);
      break;
    }
    default:
      obj = null;
      break;
  }

  // enhance weapon regardless of alignment or artifact status
  const it = obj?.c.item;
  if (okWep(ctx, obj) && it) {
    it.buc = 'blessed'; // bless()
    delete it.erosion;
    it.erodeproof = true;
    it.known.buc = true; // ok to skip set_bknown()
    setRknown(ctx, obj.id, true);
    if (it.spe < 1) it.spe = 1;
    // acquire skill in this weapon
    const skill = ctx.defs.object(obj.def).weapon?.skill;
    if (skill) unrestrictWeaponSkill(ctx, skill);
  } else if (classGift === null) {
    // opportunity knocked, but there was nobody home...
    say(ctx, 'crown.unworthy');
  }
  // lastly, confer an extra skill slot/credit beyond the up-to-29 you can get from gaining
  // experience levels
  addWeaponSkill(ctx, 1);
}

/** Vorpal Blade or Stormbringer made, +1, at her feet: mksobj(otyp, FALSE, FALSE) and oname(). */
function newGift(ctx: Ctx, base: DefId, arti: DefId, what: Msg): Entity | null {
  const id = mksobjFull(ctx, ctx.defs.object(base), { init: false, artif: false });
  const obj = ctx.state.entities[String(id)];
  const it = obj?.c.item;
  if (!obj || !it) return null;
  onameObj(ctx, obj, artifactRow(arti).name, 'gift', true);
  it.spe = 1;
  atYourFeet(ctx, what);
  dropy(ctx, obj);
  addGift(ctx);
  return obj;
}

/**
 * The spellbook gift: a random book (up to her level more tries for one she does not know, or
 * has forgotten, in a school not restricted to her; blank paper while undiscovered or with a
 * magic marker on her); 1 time in 4 a spell she does not know freshly goes straight into her
 * mind ("Divine knowledge of force bolt fills your mind!  Spell 'b'."), else the book appears at
 * her feet, blessed (blank paper becomes known, any other book 1 time in 100).
 * ref: src/pray.c give_spell()
 */
export function giveSpell(ctx: Ctx): void {
  // not yet known spells and forgotten spells are given preference over usable ones; also, try
  // to grant spell that hero could gain skill in
  const id = mkobj(ctx, 'spellbook', { artif: true }); // mkobj(SPBOOK_no_NOVEL, TRUE)
  const otmp = id === null ? undefined : ctx.state.entities[String(id)];
  const it = otmp?.c.item;
  if (!otmp || !it) return;
  let trycnt = (hero(ctx).c.experience?.level ?? 1) + 1;
  while (--trycnt > 0) {
    if (otmp.def !== BLANK_PAPER) {
      if (
        knownSpell(ctx, otmp.def) <= SPE_UNKNOWN &&
        skillLevel(ctx, spellSkill(otmp.def, ctx.state)) !== P_RESTRICTED
      )
        break; // forgotten or not yet known
    } else if (
      !isKnown(ctx.state, ctx.defs, ctx.defs.object(BLANK_PAPER)) ||
      carrying(ctx, MAGIC_MARKER)
    )
      // blank paper is acceptable if not discovered yet or if hero has a magic marker to write
      // something on it; it will become discovered (below) without needing to be read
      break;
    otmp.def = rndClass(ctx.rng, ctx.defs, bookRange(ctx), 0);
  }
  // 25% chance of learning the spell directly instead of receiving the book for it, unless
  // it's already well known
  const prior = otmp.def !== BLANK_PAPER && !ctx.rng.rn2(4) ? knownSpell(ctx, otmp.def) : SPE_FRESH;
  if (prior !== SPE_FRESH) {
    const letter = forceLearnSpell(ctx, otmp.def);
    if (letter) {
      const spell: Msg = { key: `spell.name.${otmp.def}` };
      if (prior === SPE_UNKNOWN) say(ctx, 'crown.divine_knowledge', { spell, letter });
      else
        say(ctx, 'crown.spell_knowledge', {
          letter,
          spell,
          how: `@crown.spell_${prior === SPE_FORGOTTEN ? 'restored' : 'refreshed'}`,
        });
    }
    ctx.remove(otmp.id); // discard the book
    return;
  }
  // discovering blank paper will make it less likely to be given again; small chance to
  // arbitrarily discover some other book type without having to read it first
  if (otmp.def === BLANK_PAPER || !ctx.rng.rn2(100)) discover(ctx, otmp.def);
  it.buc = 'blessed'; // bless(); don't set bknown
  atYourFeet(ctx, xnameOf(ctx.state, ctx.defs, otmp));
  const pos = hero(ctx).c.pos;
  if (pos) placeOnFloor(ctx, otmp.id, pos.level, pos.x, pos.y);
}
