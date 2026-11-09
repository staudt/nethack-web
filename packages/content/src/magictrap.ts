// The magic trap, the anti-magic field and the fire trap's tower of flame, for the hero and for
// monsters. ref: src/trap.c trapeffect_magic_trap(), domagictrap(), trapeffect_anti_magic(),
// drain_en(), dofiretrap(), trapeffect_fire_trap()
//
// Module graph: domagictrap() tames monsters (dog.ts) and uncurses (read.ts), and both import
// trap.ts, so this module sits above trap.ts and hands its effects in at registration
// (`setTrapEffect`), as trap.ts does with levitation.ts's float-down trap. No `nh:fire_trap`
// TrapDef exists (C makes fire traps only in Gehennom): `dofiretrap()` serves the magic trap's
// fate 12 and a monster's 1-in-21 magic trap.
//
// Not modelled: deafness (the roar is only its message), Half_physical_damage, Half_spell_damage, Magicbane and other artifacts, wall
// passers, golems, polymorph, steeds, water and ice.
import { mAt } from './wormstate';
import {
  getLevel,
  getPlayer,
  type Ctx,
  type Entity,
  type Level,
  type Msg,
  type Trap,
} from '@nh/core';
import { burnAwaySlime } from './slimestate';
import { adjattrib } from './attrib';
import { burnFloorObjects, resistsMagm } from './buzz';
import { tamedog } from './dog';
import { destroyItems, erodeArmor } from './erode';
import { makemon } from './generation';
import { losehp } from './hp';
import { losexp } from './exper';
import { igniteItems } from './light';
import { monkilled } from './mondeath';
import { isCancelled, mspecUsed, setMspecUsed } from './mstate';
import { wakeNearto } from './noise';
import { xnameOf } from './objnam';
import { monNam } from './perception';
import { P, hasExtrinsic, hasProp, makeBlinded, setIntrinsic, setItimeout } from './props';
import { heroInvisible, seeInvisible, selfInvisMessage } from './invis';
import { removeCurse } from './read';
import { costlyAlteration } from './shk';
import { surfaceKey } from './terrain';
import {
  TRAP,
  cansee,
  canseemon,
  caughtOr,
  deltrap,
  ironShoes,
  seetrap,
  setTrapEffect,
  thitm,
  type TrapResult,
} from './trap';
import { drainEn, pwOf, setPw } from './uenergy';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const heroPos = (ctx: Ctx): { level: string; x: number; y: number } => {
  const p = getPlayer(ctx.state).c.pos;
  if (!p) throw new Error('Player has no position');
  return p;
};

const halluc = (ctx: Ctx): boolean => hasProp(getPlayer(ctx.state), P.HALLUC);

function monAt(ctx: Ctx, level: Level, x: number, y: number): Entity | null {
  return mAt(ctx.state, level.id, x, y); // a worm's tail square holds the worm
}

// ---------------------------------------------------------------------------------------------
// fire

/**
 * A tower of flame erupts under the hero: fire resistance leaves 0 or 1 damage, otherwise she
 * loses up to d(2,4) maximum HP (never below her level) and takes d(2,4) damage; her armor may
 * burn, carried items may burn or catch light (always when the body was hit, else 2 in 3), and
 * scrolls and books on her square may burn ("You smell paper burning." when blind).
 * `box`: the flame bursts from a trapped box (chest_trap()); the rest is the same.
 * ref: src/trap.c dofiretrap() (no water, polymorph or ice; the level drain when her
 * maximum drops below her level is not ported)
 */
export function dofiretrap(ctx: Ctx, box?: Entity): void {
  const hero = getPlayer(ctx.state);
  const p = heroPos(ctx);
  const level = getLevel(ctx.state, p.level);
  const seeIt = !hasProp(hero, P.BLINDED);
  const origDmg = ctx.rng.d(2, 4); // orig_dmg = num = d(2, 4); both branches set num again
  let num: number;
  if (box) say(ctx, 'fire.tower_bursts', { box: xnameOf(ctx.state, ctx.defs, box) });
  else say(ctx, 'fire.tower_erupts', { surface: surfaceKey(ctx, level, p.x, p.y) });
  if (hasProp(hero, P.FIRE_RES)) {
    num = ctx.rng.rn2(2); // shieldeff() is not shown
  } else {
    const hp = hero.c.hp;
    num = ctx.rng.d(2, 4);
    if (hp) {
      const uhpmin = Math.max(hero.c.experience?.level ?? 1, 1); // minuhpmax(1)
      const olduhpmax = hp.max;
      if (hp.max > uhpmin) hp.max -= ctx.rng.rn2(Math.min(hp.max, num + 1));
      if (hp.max < uhpmin) {
        hp.max = Math.min(olduhpmax, uhpmin); // setuhpmax()
        // never fatal when 'drainer' is Null (a lycanthrope resists)
        if (!hasProp(hero, P.DRAIN_RES)) losexp(ctx, null);
      }
      if (hp.cur > hp.max) hp.cur = hp.max;
    }
  }
  if (!num) say(ctx, 'fire.you_uninjured');
  else losehp(ctx, num, '@killer.trap.tower_of_flame'); // fire damage
  if (ctx.state.gameOver) return;
  burnAwaySlime(ctx);
  // burnarmor() || rn2(3)
  if (erodeArmor(ctx, hero.id, 'burn') || ctx.rng.rn2(3)) {
    destroyItems(ctx, hero.id, 'fire', origDmg);
    if (ctx.state.gameOver) return;
    igniteItems(ctx, hero.id);
  }
  if (burnFloorObjects(ctx, p.x, p.y, { level: p.level, feedback: seeIt }) && !seeIt)
    say(ctx, 'fire.smell_paper');
}

/**
 * A tower of flame under a monster: d(2,4) damage and the same loss of maximum HP unless it
 * resists fire; its armor and items may burn (their damage on top), floor scrolls burn.
 * ref: src/trap.c trapeffect_fire_trap() for a monster (no golems or ice)
 */
function fireTrapMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const p = mon.c.pos;
  if (!p) return 'finished';
  const level = getLevel(ctx.state, p.level);
  const { x: tx, y: ty } = trap;
  const inSight = canseemon(ctx, mon);
  const seeIt = cansee(ctx, p.level, tx, ty);
  let killed = false;
  const origDmg = ctx.rng.d(2, 4);
  const surface = surfaceKey(ctx, level, p.x, p.y);
  if (inSight) say(ctx, 'fire.tower_under_mon', { surface, mon: monNam(ctx, mon) });
  else if (seeIt) say(ctx, 'fire.see_tower', { surface }); // evidently `mtmp' is invisible
  if (ctx.defs.monster(mon.def).resists.includes('fire')) {
    if (inSight) say(ctx, 'fire.mon_uninjured', { mon: monNam(ctx, mon) }); // no shieldeff()
  } else {
    const num = origDmg; // no paper, straw, wood or leather golems
    if (thitm(ctx, 0, mon, null, num)) killed = true;
    else {
      const hp = mon.c.hp;
      if (hp) {
        hp.max -= ctx.rng.rn2(num + 1);
        if (hp.cur > hp.max) hp.cur = hp.max;
      }
    }
  }
  // burnarmor(mtmp) || rn2(3)
  if (erodeArmor(ctx, mon.id, 'burn') || ctx.rng.rn2(3)) {
    const xtradmg = destroyItems(ctx, mon.id, 'fire', origDmg);
    igniteItems(ctx, mon.id);
    const hp = ctx.state.entities[String(mon.id)]?.c.hp;
    if (!killed && hp) {
      hp.cur -= xtradmg;
      if (hp.cur <= 0) {
        // NOW it's dead
        monkilled(ctx, mon.id, true);
        killed = true;
      }
    }
  }
  const hp0 = heroPos(ctx);
  const distu = (hp0.x - tx) ** 2 + (hp0.y - ty) ** 2;
  if (
    burnFloorObjects(ctx, tx, ty, { level: p.level, feedback: seeIt }) &&
    !seeIt &&
    hp0.level === p.level &&
    distu <= 3 * 3
  )
    say(ctx, 'zap.smell_smoke');
  if (seeIt) seetrap(trap);
  return killed ? 'killed' : caughtOr(ctx, mon, false);
}

// ---------------------------------------------------------------------------------------------
// the magic trap

/**
 * One of domagictrap()'s twenty fates (1..20). 1-9: a flash of light blinds her (`rn1(5, 10)`
 * turns) and a deafening roar wakes the monsters within 7 squares after `rnd(4)` monsters
 * appear next to her; 10: nothing; 11: a low hum toggles her invisibility; 12: a tower of flame; 13-18: odd feelings;
 * 19: +1 Charisma and the adjacent monsters are tamed; 20: worn and wielded items are uncursed.
 * ref: src/trap.c domagictrap() (no deafness; no Quest, so she always yearns
 * for her distant homeland)
 */
export function magicTrapFate(ctx: Ctx, fate: number): void {
  const hero = getPlayer(ctx.state);
  const p = heroPos(ctx);
  if (fate < 10) {
    // Most of the time, it creates some monsters.
    let cnt = ctx.rng.rnd(4);
    const blind = hasProp(hero, P.BLINDED);
    // blindness effects: resists_blnd() is being blind or unaware
    if (!blind && !hero.c.helpless) {
      say(ctx, 'magictrap.flash_blinded');
      makeBlinded(ctx, ctx.rng.rn2(5) + 10, false); // rn1(5, 10)
      // "Your vision quickly clears." only for the Eyes of the Overworld (not ported)
    } else if (!blind) say(ctx, 'magictrap.flash');
    // deafness effects: deafness is not modelled, so she always hears it
    say(ctx, 'magictrap.roar');
    while (cnt--) makemon(ctx, null, { x: p.x, y: p.y }, { level: p.level, adjacentOk: true });
    // roar: wake monsters in vicinity, after placing trap-created ones
    wakeNearto(ctx, p.x, p.y, 7 * 7);
    return;
  }
  switch (fate) {
    case 10: // sometimes nothing happens
      return;
    case 11: {
      // toggle intrinsic invisibility
      say(ctx, 'magictrap.low_hum');
      const blind = hasProp(hero, P.BLINDED);
      const hp = hero.c.props?.[P.INVIS];
      const hInvis = !!hp && (hp.intrinsic || hp.timeout > 0);
      if (!heroInvisible(ctx.state)) {
        if (!blind) selfInvisMessage(ctx);
      } else if (!hasExtrinsic(hero, P.INVIS)) {
        // (no polymorph forms: never pm_invisible())
        if (!blind)
          say(ctx, seeInvisible(ctx.state) ? 'magictrap.cant_see_through' : 'magictrap.see_again');
      } else {
        // invisible from another source
        say(ctx, hInvis ? 'magictrap.more_obvious' : 'magictrap.more_hidden');
      }
      // HInvis = HInvis ? 0 : HInvis | FROMOUTSIDE
      if (hInvis) {
        setIntrinsic(hero, P.INVIS, false);
        setItimeout(ctx.state, hero, P.INVIS, 0);
      } else setIntrinsic(hero, P.INVIS, true);
      return;
    }
    case 12: // a flash of fire
      dofiretrap(ctx);
      return;
    // odd feelings
    case 13:
      say(ctx, 'magictrap.shiver');
      return;
    case 14:
      say(ctx, halluc(ctx) ? 'magictrap.moon_howling' : 'magictrap.distant_howling');
      return;
    case 15:
      say(ctx, halluc(ctx) ? 'magictrap.yearn_cleveland' : 'magictrap.yearn_homeland');
      return;
    case 16:
      say(ctx, 'magictrap.pack_shakes');
      return;
    case 17:
      say(ctx, halluc(ctx) ? 'magictrap.hamburgers' : 'magictrap.charred_flesh');
      return;
    case 18:
      say(ctx, 'magictrap.tired');
      return;
    // very occasionally something nice happens.
    case 19: {
      // tame nearby monsters
      adjattrib(ctx, 'cha', 1, true);
      const level = getLevel(ctx.state, p.level);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const mon = monAt(ctx, level, p.x + i, p.y + j);
          if (mon) tamedog(ctx, mon.id, null, true, () => undefined);
        }
      return;
    }
    case 20: // uncurse stuff: an uncursed SPE_REMOVE_CURSE, read unconfused
      removeCurse(ctx, 'uncursed', false, null);
      return;
    default:
      return;
  }
}

/**
 * The hero on a magic trap: 1 time in 30 it explodes (`rnd(10)` damage, +2 maximum energy and
 * full energy, the trap is gone), else one of domagictrap()'s fates. ref: src/trap.c
 * trapeffect_magic_trap(), domagictrap()
 */
function magicTrapYou(ctx: Ctx, trap: Trap): void {
  seetrap(trap);
  if (!ctx.rng.rn2(30)) {
    deltrap(ctx, heroPos(ctx).level, trap);
    say(ctx, 'magictrap.explosion');
    losehp(ctx, ctx.rng.rnd(10), '@killer.trap.magical_explosion');
    if (ctx.state.gameOver) return;
    say(ctx, 'magictrap.absorbs');
    const pw = pwOf(ctx.state);
    const uenmax = pw.uenmax + 2;
    setPw(ctx, { uen: uenmax, uenmax, uenpeak: Math.max(pw.uenpeak, uenmax) });
    return;
  }
  magicTrapFate(ctx, ctx.rng.rnd(20));
}

/** A monster on a magic trap: usually immune, 1 time in 21 a tower of flame. */
function magicTrapMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  if (!ctx.rng.rn2(21)) return fireTrapMon(ctx, mon, trap);
  return 'finished';
}

// ---------------------------------------------------------------------------------------------
// the anti-magic field

// drainEn (src/trap.c drain_en()) moved to uenergy.ts; re-exported for the old callers
export { drainEn };

/**
 * The hero on an anti-magic field (never escaped once seen): positively enchanted iron shoes
 * lose a point instead ("A lethargic aura surrounds your iron shoes."); magic resistance turns
 * it into `rnd(4)` damage ("You feel sluggish."); then d(2,6) energy is drained, up to half of
 * it off the maximum when that is larger. ref: src/trap.c trapeffect_anti_magic()
 */
function antiMagicYou(ctx: Ctx, trap: Trap): void {
  const hero = getPlayer(ctx.state);
  const shoes = ironShoes(ctx, hero.id);
  const sit = shoes?.c.item;
  if (shoes && sit && sit.spe > 0) {
    seetrap(trap);
    say(ctx, 'antimagic.shoes', { obj: xnameOf(ctx.state, ctx.defs, shoes) });
    costlyAlteration(ctx, shoes, 'disenchant', null);
    sit.spe -= 1;
    return;
  }
  seetrap(trap);
  if (hasProp(hero, P.ANTIMAGIC)) {
    // no Half_physical_damage/Half_spell_damage, Magicbane, artifacts or Passes_walls here
    const dmgval2 = ctx.rng.rnd(4);
    const hp = hero.c.hp?.cur ?? 0;
    say(
      ctx,
      dmgval2 >= hp
        ? 'antimagic.torpid'
        : dmgval2 >= Math.trunc(hp / 4)
          ? 'antimagic.very_lethargic'
          : 'antimagic.sluggish',
    );
    // opposite of magical explosion
    losehp(ctx, dmgval2, '@killer.trap.anti_magic');
    if (ctx.state.gameOver) return;
  }
  let drain = ctx.rng.d(2, 6); // 2..12
  const halfd = ctx.rng.rnd(Math.trunc(drain / 2)); // 1..drain/2
  let exclaimIt = false;
  const pw = pwOf(ctx.state);
  if (pw.uenmax > drain) {
    setPw(ctx, { uenmax: pw.uenmax - halfd });
    drain -= halfd;
    exclaimIt = true;
  }
  drainEn(ctx, drain, exclaimIt);
}

/**
 * A monster on an anti-magic field: positively enchanted iron shoes lose a point; a monster
 * without magic resistance that casts or breathes (and is not cancelled) needs d(2,6) more
 * turns before its next spell ("The kobold shaman seems lethargic."); a magic-resistant one
 * takes `rnd(4)` damage ("killed by the compression from an anti-magic field").
 * ref: src/trap.c trapeffect_anti_magic() for a monster
 */
function antiMagicMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const shoes = ironShoes(ctx, mon.id);
  const sit = shoes?.c.item;
  if (sit && sit.spe > 0) {
    // no message if a monster does this, it isn't visible enough
    sit.spe -= 1;
    return 'finished';
  }
  const inSight = canseemon(ctx, mon);
  let killed = false;
  const def = ctx.defs.monster(mon.def);
  if (!resistsMagm(ctx, mon)) {
    // lose spell energy
    if (
      !isCancelled(ctx, mon.id) &&
      def.attacks.some((a) => a.at === 'magic' || a.at === 'breath')
    ) {
      setMspecUsed(ctx, mon.id, mspecUsed(ctx, mon.id) + ctx.rng.d(2, 6));
      if (inSight) {
        seetrap(trap);
        say(ctx, 'antimagic.mon_lethargic', { mon: monNam(ctx, mon) });
      }
    }
  } else {
    // take some damage (no Magicbane, artifacts or wall passers)
    const dmgval2 = ctx.rng.rnd(4);
    if (inSight) seetrap(trap);
    const hp = mon.c.hp;
    if (hp) {
      hp.cur -= dmgval2;
      if (hp.cur <= 0) {
        monkilled(ctx, mon.id, inSight, '@antimagic.compression');
        killed = true;
      }
    }
  }
  return killed ? 'killed' : caughtOr(ctx, mon, false);
}

/** Hands the magic trap's and the anti-magic field's effects to trap.ts. */
export function registerMagicTraps(): void {
  setTrapEffect(TRAP.magic, { you: magicTrapYou, mon: magicTrapMon });
  setTrapEffect(TRAP.antiMagic, { you: antiMagicYou, mon: antiMagicMon });
}
