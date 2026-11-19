// Monsters changing into other monsters: newcham() and its random form. Used by the wand and spell
// of polymorph (zap.ts) and the polymorph trap (polyself.ts); sits under both, above were.ts.
// ref: src/mon.c newcham(), select_newcham_form(), accept_newcham_form(), validspecmon(),
// isspecmon(); src/makemon.c newmonhp()
//
// Shapeshifters keep their true kind in `cham` (chamstate.ts): a vampire picks a bat, fog cloud or
// (a lord) wolf shape (pickvampshape()), a chameleon often an animal (pick_animal()), a
// doppelganger a nasty, a role monster (tt_doppel()) or a humanoid, a sandestin a nasty; a
// polymorph that makes a vampire makes a vampshifter unless the hero has protection from shape
// changers. ref: src/mon.c pick_animal(), mon_animal_list(); src/topten.c tt_doppel()
// On the Rogue level the random picks prefer monsters drawn with an uppercase letter.
// Not ported: the Riders' immunity has no monster to apply to but is kept, wizard-mode form control,
// long worms, mimics, hiding monsters, steeds and leashes, monster genders (no gender is kept for
// a monster), monsters wielding cockatrice corpses (mselftouch()), liquid under a form that can
// no longer swim or fly (no pools), set_apparxy() and fleeing from a scary square (an Elbereth)
// after a change during the monsters' move (newcham() is not told it is the monsters' move).
import { levelDifficulty } from './levdiff';
import { monHasSpecial } from './uhave';
import { mApType, seemimic } from './mimicstate';
import { isGuard } from './vaultstate';
import {
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import {
  ARCHON,
  CHAMELEON,
  chamOf,
  DOPPELGANGER,
  FOG_CLOUD,
  JABBERWOCK,
  SANDESTIN,
  isShapeshifter,
  isVampire,
  isVampshifter,
  pmToCham,
  setCham,
  VAMPIRE,
  VAMPIRE_BAT,
  VAMPIRE_LORD,
  VLAD_THE_IMPALER,
  WOLF,
} from './chamstate';
import { isPoolOrLava } from './liquid';
import { isGenocided, MAXMONNO, mbirthLimit } from './vanquished';
import { humanoid, isMplayer, isRider, MPLAYERS, upperSym } from './mondata';
import { isRogueLevel } from './levelflags';
import { pickNasty } from './nasty';
import { protFromShapeChangers } from './props';
import { isCancelled, setUncancelled } from './mstate';
import { monBreakArmor } from './breakarm';
import { bypassObj } from './bypass';
import { epriOf } from './epri';
import { eshkOf } from './eshk';
import { expels, unstuck } from './engulf';
import { digests, isWhirly, uswallow } from './engulfstate';
import { flooreffects } from './flooreffects';
import { adjLev, newmonhp, setMakemonNewcham } from './generation';
import { ustuck } from './hackmove';
import { setAdNewcham } from './adtyping';
import { canseemon, newchamInvis } from './invis';
import { isGolem } from './golem';
import { setMonToStone } from './stoning';
import { placeOnFloor } from './items';
import { minvent, setMonFlag, whichArmor } from './mongear';
import { canSpotMon, monNam } from './perception';
import { possiblyUnwield } from './were';
import { setMonData } from './werestate';
import { LONG_WORM, wormgone } from './wormstate';
import { giveWormTail } from './worm';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const BOULDER = 'nh:boulder';

/** ref: include/mondata.h is_placeholder() */
const PLACEHOLDERS: readonly string[] = ['nh:orc', 'nh:giant', 'nh:elf', 'nh:human'];
export const isPlaceholder = (def: MonsterDef): boolean => PLACEHOLDERS.includes(def.id);

/** ref: include/mondata.h polyok(): not M2_NOPOLY */
export const polyok = (def: MonsterDef): boolean => !def.flags.includes('nopoly');

/** ref: src/mon.c isspecmon(): shopkeepers, temple priests, vault guards (no quest leaders) */
const isspecmon = (ctx: Ctx, mon: Entity): boolean =>
  eshkOf(ctx, mon.id) !== null || epriOf(ctx, mon.id) !== null || isGuard(ctx.state, mon.id);

/**
 * The form `mndx` if the monster may take it: not genocided, not a placeholder, a player monster
 * (only a doppelganger's tt_doppel() picks one), its own natural form for a shapeshifter, else
 * polyok(). ref: src/mon.c accept_newcham_form()
 */
function acceptNewchamForm(ctx: Ctx, mon: Entity, mdat: MonsterDef | null): MonsterDef | null {
  if (!mdat) return null;
  if (isGenocided(ctx.state, mdat.id)) return null;
  if (PLACEHOLDERS.includes(mdat.id)) return null;
  // select_newcham_form() might deliberately pick a player character type (random selection
  // never does) which polyok() rejects, so we need a special case here
  if (isMplayer(mdat)) return mdat;
  // shapeshifters are rejected by polyok() but allow a shapeshifter to take on its 'natural' form
  if (isShapeshifter(mdat) && chamOf(ctx, mon.id) === mdat.id) return mdat;
  // polyok() rules out M2_PNAME, M2_WERE, and all humans except Kops
  return polyok(mdat) ? mdat : null;
}

/**
 * A special monster (shopkeeper, priest) only takes forms that can handle objects and speak.
 * ref: src/mon.c validspecmon()
 */
function validspecmon(ctx: Ctx, mon: Entity, mdat: MonsterDef): boolean {
  if (!acceptNewchamForm(ctx, mon, mdat)) return false; // geno'd or !polyok
  if (isspecmon(ctx, mon)) {
    // reject notake because object manipulation is expected
    // and nohead because speech capability is expected
    if (mdat.flags.includes('notake') || mdat.flags.includes('nohead')) return false;
  }
  return true;
}

/**
 * A vampire's next shape: a vampire lord (or Vlad) becomes a wolf 1 time in 10 (not over water
 * or lava), else any vampire a fog cloud 1 time in 4 or a vampire bat; it returns to its own
 * form instead when that shape is genocided, or 1 time in 4 when it is already shifted.
 * On the Rogue level it takes neither lowercase shape (wolf, fog cloud): only the bat.
 * Vlad carrying the Candelabrum (or another special object) keeps his own shape.
 * ref: src/mon.c pickvampshape()
 */
export function pickvampshape(ctx: Ctx, mon: Entity): DefId | null {
  const cham = chamOf(ctx, mon.id);
  // avoid picking monsters with lowercase display symbols ('d' for wolf and 'v' for fog cloud)
  const uppercaseOnly = onRogueLevel(ctx, mon);
  let mndx = cham;
  let wolfchance = 10;
  const p = mon.c.pos;
  const overLiquid = (): boolean =>
    p !== undefined && isPoolOrLava(ctx, getLevel(ctx.state, p.level), p.x, p.y);
  // ensure Vlad can keep carrying the Candelabrum: he keeps his own shape (no draws)
  if (cham === VLAD_THE_IMPALER && monHasSpecial(ctx.state, mon.id)) {
    // leave mndx as is
  } else if (cham === VLAD_THE_IMPALER || cham === VAMPIRE_LORD || cham === VAMPIRE) {
    let wolf = false;
    if (cham !== VAMPIRE) {
      // vampire lord or Vlad can become wolf
      if (cham === VLAD_THE_IMPALER) wolfchance = 3;
      // don't pick a walking form if that would lead to immediate drowning or immolation
      wolf = !ctx.rng.rn2(wolfchance) && !uppercaseOnly && !overLiquid();
    }
    // any vampire can become fog or bat
    mndx = wolf ? WOLF : !ctx.rng.rn2(4) && !uppercaseOnly ? FOG_CLOUD : VAMPIRE_BAT;
  }
  // return to base form if chosen poly target has been genocided or randomly if already in an
  // alternate form (to prevent always switching back and forth between bat and fog)
  if ((mndx !== null && isGenocided(ctx.state, mndx)) || (mon.def !== cham && !ctx.rng.rn2(4)))
    return cham;
  return mndx;
}

/**
 * Whether the monster is on the Rogue level: C's Is_rogue_level(&u.uz), the hero's level or the
 * level being made, which is where the monster is.
 */
function onRogueLevel(ctx: Pick<Ctx, 'state'>, mon: Entity): boolean {
  return isRogueLevel(ctx.state.levels[mon.c.pos?.level ?? ctx.state.currentLevel]);
}

/**
 * C's LOW_PM..SPECIAL_PM - 1: every monster type but the player monsters (and the quest
 * monsters, none here), in the port's table order.
 */
function ordinaryMonsters(ctx: Pick<Ctx, 'defs'>): readonly MonsterDef[] {
  return ctx.defs.monsters.filter((m) => !isMplayer(m));
}

/** The kind `id`, or null (NON_PM) when the port has no such row. */
const pmOrNull = (ctx: Pick<Ctx, 'defs'>, id: DefId): MonsterDef | null =>
  ctx.defs.isMonster(id) ? ctx.defs.monster(id) : null;

/**
 * A random animal (M1_ANIMAL) kind, for a chameleon; on the Rogue level (`rogue`) a lowercase
 * pick is rolled once more. ref: src/mon.c pick_animal(), mon_animal_list()
 */
export function pickAnimal(ctx: Ctx, rogue = false): MonsterDef | null {
  const list = ordinaryMonsters(ctx).filter((m) => m.flags.includes('animal'));
  let res = list[ctx.rng.rn2(list.length)] ?? null;
  // rogue level should use monsters represented by uppercase letters only, but since chameleons
  // aren't generated there (not uppercase!) we don't perform a lot of retries
  if (rogue && res && !upperSym(res.glyph.ch)) res = list[ctx.rng.rn2(list.length)] ?? null;
  return res;
}

/**
 * A doppelganger's role monster. C reads a random top-ten entry 12 times in 13 (`rn2(13)`); the
 * port keeps no record file, so every pick takes C's no-entry branch: a random player monster
 * from PM_ARCHEOLOGIST to PM_WIZARD. ref: src/topten.c
 * tt_doppel()
 */
export function ttDoppel(ctx: Ctx): MonsterDef | null {
  ctx.rng.rn2(13); // rn2(13) ? get_rnd_toptenentry() : NULL: no record file, always NULL
  const id = MPLAYERS[ctx.rng.rn2(MPLAYERS.length)]; // rn1(PM_WIZARD - PM_ARCHEOLOGIST + 1, ...)
  return id === undefined ? null : pmOrNull(ctx, id);
}

/** ref: include/monsters.h the quest guardians PM_STUDENT..PM_APPRENTICE (no rows here) */
const QUEST_GUARDIANS = 14;

/** Dragon scales and scale mail by the dragon they come from: `nh:<color>_dragon`. */
function dragonArmorToPm(ctx: Pick<Ctx, 'defs'>, armor: Entity | null): MonsterDef | null {
  const m = armor ? /^nh:(\w+)_dragon_scale(?:s|_mail)$/.exec(armor.def) : null;
  return m ? pmOrNull(ctx, `nh:${m[1] ?? ''}_dragon` as DefId) : null;
}

/**
 * The form a monster changing shape takes: a sandestin a nasty 6 times in 7 (pick_nasty() below
 * the Archon's difficulty); a doppelganger a nasty 1 time in 7 (below the jabberwock's), else a
 * role monster 2 times in 3 (tt_doppel()), else a quest guardian 1 time in 3 (none exist: a
 * random form), else five tries at a humanoid polyok() kind; a chameleon an animal 1 time in 3;
 * a vampire its own pick (pickvampshape()); an ordinary monster wearing dragon scales or scale
 * mail that dragon; otherwise any monster type but the player monsters, uniformly. A pick that
 * names a kind the port lacks is no form (pick_nasty()'s absent kinds count as genocided:
 * accept_newcham_form() rejects them; the others fall back to the random form). The 50-try loop
 * retries only on the Rogue level, for the first ten picks that are both invalid and lowercase.
 * ref: src/mon.c select_newcham_form() (no wizard-mode form control)
 */
export function selectNewchamForm(ctx: Ctx, mon: Entity): MonsterDef | null {
  const cham = chamOf(ctx, mon.id);
  const rogueLevel = onRogueLevel(ctx, mon);
  // `mndx`: undefined is NON_PM (pick at random below), null a kind the port lacks
  let mndx: MonsterDef | null | undefined;
  const nasty = (than: DefId): MonsterDef | null => {
    const cap = pmOrNull(ctx, than)?.difficulty ?? 0;
    return pmOrNull(ctx, pickNasty(ctx, cap - 1));
  };
  switch (cham) {
    case SANDESTIN:
      if (ctx.rng.rn2(7)) mndx = nasty(ARCHON);
      break;
    case DOPPELGANGER:
      if (!ctx.rng.rn2(7)) {
        mndx = nasty(JABBERWOCK);
      } else if (ctx.rng.rn2(3)) {
        // role monsters
        mndx = ttDoppel(ctx) ?? undefined;
      } else if (!ctx.rng.rn2(3)) {
        // quest guardians: rn1(PM_APPRENTICE - PM_STUDENT + 1, PM_STUDENT); none have rows
        ctx.rng.rn2(QUEST_GUARDIANS);
      } else {
        // general humanoids
        const all = ordinaryMonsters(ctx);
        let tryct = 5;
        let pick: MonsterDef | undefined;
        do {
          pick = all[ctx.rng.rn2(all.length)];
          if (pick && humanoid(pick) && polyok(pick)) break;
        } while (--tryct > 0);
        if (tryct) mndx = pick;
      }
      break;
    case CHAMELEON:
      if (!ctx.rng.rn2(3)) mndx = pickAnimal(ctx, rogueLevel) ?? undefined;
      break;
    case VLAD_THE_IMPALER:
    case VAMPIRE_LORD:
    case VAMPIRE: {
      const v = pickvampshape(ctx, mon);
      if (v !== null) mndx = pmOrNull(ctx, v) ?? undefined;
      break;
    }
    case null: // ordinary
      mndx = dragonArmorToPm(ctx, whichArmor(ctx, mon.id, 'body')) ?? undefined;
      break;
    default:
      break;
  }
  if (mndx !== undefined) return mndx;
  // if no form was specified above, pick one at random now
  const all = ordinaryMonsters(ctx);
  let mdat: MonsterDef | null;
  let tryct = 50;
  do {
    mdat = all[ctx.rng.rn2(all.length)] ?? null;
  } while (
    --tryct > 0 &&
    mdat !== null &&
    !validspecmon(ctx, mon, mdat) &&
    // try harder to select uppercase monster on rogue level
    tryct > 40 &&
    rogueLevel &&
    !upperSym(mdat.glyph.ch)
  );
  return mdat;
}

/** ref: src/mondata.c sticks(): holds what it hits */
const sticks = (def: MonsterDef): boolean =>
  def.attacks.some((a) => a.ad === 'stck') ||
  (def.attacks.some((a) => a.ad === 'wrap') && !def.attacks.some((a) => a.at === 'engulf')) ||
  def.attacks.some((a) => a.at === 'hug');

export interface NewchamFlags {
  /** NC_VIA_WAND_OR_SPELL: what it drops is not hit by the same zap. */
  polyspot?: boolean;
  /** NC_SHOW_MSG: "The jackal turns into a gnome!" */
  msg?: boolean;
}

/**
 * The monster takes on another form (`mdat`, or a random one: 20 tries of
 * select_newcham_form() and accept_newcham_form()); false when it does not change. Its level
 * and hit points are rolled for the new form (newmonhp()) keeping the fraction of hit points it
 * had; its speed, invisibility, weapon (a form without a weapon attack drops it) and armor
 * (mon_break_armor()) follow the form; it stays tame or peaceful, keeps its inventory and its
 * shopkeeper's or priest's role. An engulfer holding the hero that can no longer engulf lets her
 * out ("You break out of the purple worm's stomach!", left with 1 hit point), a holder that can
 * no longer hold lets her go. With `msg`: "The jackal turns into a gnome!", "The jackal
 * disappears!" (unseen now), "A gnome appears!" (seen only now); nothing when never seen.
 * ref: src/mon.c newcham()
 */
export function newcham(
  ctx: Ctx,
  mon: Entity,
  form: MonsterDef | null,
  flags: NewchamFlags = {},
): boolean {
  const m = mon.c.monster;
  const p = mon.c.pos;
  if (!m || !p) return false;
  const polyspot = flags.polyspot === true;
  let msg = flags.msg === true;
  const seenorsensed = canSpotMon(ctx, mon);
  const olddata = ctx.defs.monster(mon.def);
  // Riders are immune to polymorph and green slime (but apparent Rider might actually be a
  // doppelganger); so are kinds with a birth limit (the Nazgul and erinyes): mbirth_limit() <
  // MAXMONNO
  if (chamOf(ctx, mon.id) === null) {
    // not a shapechanger
    if (isRider(olddata) || mbirthLimit(olddata.id) < MAXMONNO) return false;
    // cancelled shapechangers become uncancelled prior to being given a new shape
    if (isCancelled(ctx, mon.id) && !protFromShapeChangers(ctx.state)) {
      const c = pmToCham(olddata);
      setCham(ctx, mon.id, c);
      if (c !== null) setUncancelled(ctx, mon.id);
    }
  }
  const tame = (m.tame ?? 0) > 0;
  // "The oldmon" (like YMonnam(), "your" for a pet); we need l_oldname whether msg is true or not
  const oldname = monNam(ctx, mon);

  let mdat = form;
  if (mdat === null) {
    // select_newcham_form() doesn't always loop, so we retry here too
    const rogueLevel = onRogueLevel(ctx, mon);
    let tryct = 20;
    do {
      mdat = acceptNewchamForm(ctx, mon, selectNewchamForm(ctx, mon));
      // for the first several tries we require upper-case on the rogue level (after that, we
      // take whatever we get)
      if (tryct > 15 && rogueLevel && mdat && !upperSym(mdat.glyph.ch)) mdat = null;
      if (mdat) break;
    } while (--tryct > 0);
    if (!tryct || !mdat) return false;
  }
  if (mdat.id === olddata.id) return false; // still the same monster

  // (no gender kept for monsters: mgender_from_permonst() is not ported, nor its draw; a vampire
  // would keep its gender anyway)

  // ref: newcham(): "throw tail away" (wormgone(); the head stays and morphs)
  wormgone(ctx, mon.id);
  // a mimic that becomes something else drops its disguise
  if (mApType(ctx, mon.id) !== null && mdat.glyph.ch !== 'm') seemimic(ctx, mon.id); // revert to normal monster

  // give the new form the same proportion of HP as its old one had
  const hp = mon.c.hp;
  const hpn = hp?.cur ?? 1;
  const hpd = hp?.max ?? 1;
  // set level and hit points
  const lv = ctx.state.levels[p.level];
  const depth = lv ? levelDifficulty(ctx, lv) : 1;
  m.level = adjLev(mdat, depth, getPlayer(ctx.state).c.experience?.level ?? 1);
  const newhp = newmonhp(ctx, m.level, mdat.id);
  if (hp) {
    hp.max = newhp;
    hp.cur = Math.trunc((hpn * newhp) / Math.max(hpd, 1));
    // sanity check (potential overflow)
    if (hp.cur < 0 || hp.cur > hp.max) hp.cur = hp.max;
    // a 1HD creature with 1HP that changes into a 0HD creature
    if (!hp.cur) hp.cur = 1;
  }

  // take on the new form...
  setMonData(mon, mdat);
  newchamInvis(ctx, mon, olddata, mdat);

  if (ustuck(ctx) === mon.id) {
    const sw = uswallow(ctx);
    if (sw && sw.mon === mon.id) {
      if (!mdat.attacks.some((a) => a.at === 'engulf')) {
        // does mdat care?
        const noncorporeal = mdat.glyph.ch === ' ';
        const amorphous = (d: MonsterDef): boolean => d.flags.includes('amorphous');
        if (!noncorporeal && !isWhirly(mdat) && !(amorphous(mdat) || mdat.glyph.ch === 'y')) {
          const emerge = amorphous(olddata) || isWhirly(olddata);
          // do this even if msg is false; " which was a shapeshifted vampire" for a vampshifter
          const trail = isVampshifter(ctx, mon) ? '_shifted' : digests(mdat) ? '_stomach' : '';
          say(ctx, `newcham.${emerge ? 'emerge' : 'break_out'}${trail}`, {
            mon: oldname,
            ...(trail === '_shifted' ? { into: `@${mdat.id}` } : {}),
          });
          msg = false; // message has been given
          if (hp) hp.cur = 1; // almost dead
        }
        expels(ctx, mon, false);
      }
    } else if (!sticks(mdat) || mdat.flags.includes('unsolid')) {
      // the hero is not polymorphed, so she never sticks to it herself
      unstuck(ctx, mon);
    }
  }

  // ref: newcham(): a new long worm gets a worm number and a tail of rn2(5) segments
  if (mdat.id === LONG_WORM) giveWormTail(ctx, mon.id, 'random');

  if (msg) {
    if (!canSpotMon(ctx, mon)) {
      // can't see or sense it now
      if (seenorsensed)
        say(ctx, tame ? 'newcham.disappears_tame' : 'newcham.disappears', { mon: oldname });
      // (no usmellmon())
    } else if (!seenorsensed) {
      // couldn't see/sense before, can now
      say(ctx, tame ? 'newcham.appears_tame' : 'newcham.appears', { mon: monNam(ctx, mon) });
    } else {
      // saw/sensed it before, still see/sense it now ("a <monster type>")
      say(ctx, tame ? 'newcham.turns_into_tame' : 'newcham.turns_into', {
        mon: oldname,
        into: `@${mdat.id}`,
      });
    }
  }

  // when polymorph trap/wand/potion produces a vampire, turn it into a full-fledged vampshifter
  // unless shape-changing is blocked
  if (chamOf(ctx, mon.id) === null && isVampire(mdat) && !protFromShapeChangers(ctx.state))
    setCham(ctx, mon.id, pmToCham(mdat));

  possiblyUnwield(ctx, mon, polyspot); // might lose use of weapon
  monBreakArmor(ctx, mon, polyspot);
  setMonFlag(ctx, 'gearchk', mon.id, true); // check_gear_next_turn()

  // former giants can't continue carrying boulders
  if (!mdat.flags.includes('rockthrow')) {
    for (const o of minvent(ctx, mon.id)) {
      if (o.def !== BOULDER || !ctx.state.entities[String(mon.id)]) continue;
      const at = mon.c.pos;
      if (!at) break;
      const it = o.c.item;
      if (it) {
        it.carriedBy = null;
        it.equipped = null;
      }
      // this keeps it from being polymorphed in the same zap that polymorphed its carrier
      if (polyspot) bypassObj(o.id);
      // probably ought to give some "drop" message here
      if (at.level === ctx.state.currentLevel && flooreffects(ctx, o, at.x, at.y, 'fall')) continue;
      placeOnFloor(ctx, o.id, at.level, at.x, at.y);
    }
  }
  return true;
}

setAdNewcham(newcham); // adtyping.ts (AD_SLIM) sits below this module
// makemon()'s shapeshifter birth: `newcham(mtmp, (struct permonst *) 0, NO_NC_FLAGS)`
setMakemonNewcham((ctx, mon) => newcham(ctx, mon, null));

/**
 * A golem (not a stone golem) turned to stone becomes a stone golem: "The flesh golem
 * solidifies... Now it's a stone golem." ("... and returns to normal." if it could not).
 * ref: src/mon.c mon_to_stone()
 */
function monToStone(ctx: Ctx, mon: Entity): void {
  if (!isGolem(ctx.defs.monster(mon.def))) return; // impossible("Can't polystone %s!")
  // it's a golem, and not a stone golem
  if (canseemon(ctx, mon)) say(ctx, 'golem.solidifies', { mon: monNam(ctx, mon) });
  if (newcham(ctx, mon, ctx.defs.monster('nh:stone_golem'))) {
    if (canseemon(ctx, mon)) say(ctx, 'golem.now_its', { mon: '@nh:stone_golem' });
  } else if (canseemon(ctx, mon)) say(ctx, 'golem.returns_to_normal');
}
setMonToStone(monToStone); // stoning.ts sits below this module
