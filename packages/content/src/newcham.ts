// Monsters changing into other monsters: newcham() and its random form. Used by the wand and spell
// of polymorph (zap.ts) and the polymorph trap (polyself.ts); sits under both, above were.ts.
// ref: src/mon.c newcham(), select_newcham_form(), accept_newcham_form(), validspecmon(),
// isspecmon(); src/makemon.c newmonhp()
//
// Not ported (none exist here): shapeshifters (chameleons, doppelgangers, sandestins, vampires),
// the Riders' and the Nazgul's and erinyes' immunity has no monster to apply to but is kept,
// the Rogue level, wizard-mode form control, dragon scales and mail choosing the form,
// long worms, mimics, hiding monsters, steeds and leashes, monster genders (no gender is kept for
// a monster), monsters wielding cockatrice corpses (mselftouch()), liquid under a form that can
// no longer swim or fly (no pools), set_apparxy() and fleeing from a scary square after a change
// during the monsters' move (no onscary()).
import { mApType, seemimic } from './mimicstate';
import { isGuard } from './vaultstate';
import { getPlayer, type Ctx, type Entity, type MonsterDef, type Msg } from '@nh/core';
import { isGenocided } from './vanquished';
import { monBreakArmor } from './breakarm';
import { bypassObj } from './bypass';
import { epriOf } from './epri';
import { eshkOf } from './eshk';
import { expels, unstuck } from './engulf';
import { digests, isWhirly, uswallow } from './engulfstate';
import { boulderFlooreffects } from './flooreffects';
import { adjLev, newmonhp } from './generation';
import { ustuck } from './hackmove';
import { setAdNewcham } from './adtyping';
import { canseemon, newchamInvis } from './invis';
import { isGolem } from './golem';
import { setMonToStone } from './stoning';
import { placeOnFloor } from './items';
import { minvent, setMonFlag } from './mongear';
import { canSpotMon, monNam } from './perception';
import { possiblyUnwield } from './were';
import { setMonData } from './werestate';
import { LONG_WORM, wormgone } from './wormstate';
import { giveWormTail } from './worm';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const BOULDER = 'nh:boulder';

/** ref: include/mondata.h is_rider() */
const RIDERS: readonly string[] = ['nh:death', 'nh:famine', 'nh:pestilence'];
/** Monsters with a birth limit (mbirth_limit() < MAXMONNO): the Nazgul and the erinyes */
const BIRTH_LIMITED: readonly string[] = ['nh:nazgul', 'nh:erinys'];
/** ref: include/mondata.h is_placeholder() */
const PLACEHOLDERS: readonly string[] = ['nh:orc', 'nh:giant', 'nh:elf', 'nh:human'];
export const isPlaceholder = (def: MonsterDef): boolean => PLACEHOLDERS.includes(def.id);

/** ref: include/mondata.h polyok(): not M2_NOPOLY */
export const polyok = (def: MonsterDef): boolean => !def.flags.includes('nopoly');

/** ref: src/mon.c isspecmon(): shopkeepers, temple priests, vault guards (no quest leaders) */
const isspecmon = (ctx: Ctx, mon: Entity): boolean =>
  eshkOf(ctx, mon.id) !== null || epriOf(ctx, mon.id) !== null || isGuard(ctx.state, mon.id);

/**
 * The form `mndx` if the monster may take it: not genocided, not a placeholder, and polyok() (no
 * player monsters or shapeshifters exist). ref: src/mon.c accept_newcham_form()
 */
function acceptNewchamForm(ctx: Ctx, mdat: MonsterDef | null): MonsterDef | null {
  if (!mdat) return null;
  if (isGenocided(ctx.state, mdat.id)) return null;
  if (PLACEHOLDERS.includes(mdat.id)) return null;
  // polyok() rules out M2_PNAME, M2_WERE, and all humans except Kops
  return polyok(mdat) ? mdat : null;
}

/**
 * A special monster (shopkeeper, priest) only takes forms that can handle objects and speak.
 * ref: src/mon.c validspecmon()
 */
function validspecmon(ctx: Ctx, mon: Entity, mdat: MonsterDef): boolean {
  if (!acceptNewchamForm(ctx, mdat)) return false; // geno'd or !polyok
  if (isspecmon(ctx, mon)) {
    // reject notake because object manipulation is expected
    // and nohead because speech capability is expected
    if (mdat.flags.includes('notake') || mdat.flags.includes('nohead')) return false;
  }
  return true;
}

/**
 * A random form for an ordinary monster: any monster type, uniformly (C picks among every
 * monster before the special ones; the roster is that table's subset). The 50-try loop only
 * retries on the Rogue level, so one pick is made. ref: src/mon.c select_newcham_form() NON_PM
 */
export function selectNewchamForm(ctx: Ctx, mon: Entity): MonsterDef | null {
  const all = ctx.defs.monsters;
  let mdat: MonsterDef | null;
  let tryct = 50;
  const rogueLevel = false;
  do {
    mdat = all[ctx.rng.rn2(all.length)] ?? null;
  } while (
    --tryct > 0 &&
    mdat !== null &&
    !validspecmon(ctx, mon, mdat) &&
    tryct > 40 &&
    rogueLevel
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
  // Riders are immune to polymorph and green slime; so are the Nazgul and erinyes
  if (RIDERS.includes(olddata.id) || BIRTH_LIMITED.includes(olddata.id)) return false;
  const tame = (m.tame ?? 0) > 0;
  // "The oldmon" (like YMonnam(), "your" for a pet); we need l_oldname whether msg is true or not
  const oldname = monNam(ctx, mon);

  let mdat = form;
  if (mdat === null) {
    // select_newcham_form() doesn't always loop, so we retry here too
    let tryct = 20;
    do {
      mdat = acceptNewchamForm(ctx, selectNewchamForm(ctx, mon));
      if (mdat) break;
    } while (--tryct > 0);
    if (!tryct || !mdat) return false;
  }
  if (mdat.id === olddata.id) return false; // still the same monster

  // (no gender kept for monsters: mgender_from_permonst() is not ported)

  // ref: newcham(): "throw tail away" (wormgone(); the head stays and morphs)
  wormgone(ctx, mon.id);
  // a mimic that becomes something else drops its disguise
  if (mApType(ctx, mon.id) !== null && mdat.glyph.ch !== 'm') seemimic(ctx, mon.id); // revert to normal monster

  // give the new form the same proportion of HP as its old one had
  const hp = mon.c.hp;
  const hpn = hp?.cur ?? 1;
  const hpd = hp?.max ?? 1;
  // set level and hit points
  const depth = ctx.state.levels[p.level]?.depth ?? 1;
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
          // do this even if msg is false
          say(
            ctx,
            emerge
              ? digests(mdat)
                ? 'newcham.emerge_stomach'
                : 'newcham.emerge'
              : digests(mdat)
                ? 'newcham.break_out_stomach'
                : 'newcham.break_out',
            { mon: oldname },
          );
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
      if (at.level === ctx.state.currentLevel && boulderFlooreffects(ctx, o, at.x, at.y, 'fall'))
        continue;
      placeOnFloor(ctx, o.id, at.level, at.x, at.y);
    }
  }
  return true;
}

setAdNewcham(newcham); // adtyping.ts (AD_SLIM) sits below this module

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
