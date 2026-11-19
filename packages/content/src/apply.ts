// Applying tools (a): lamps, lock tools, containers, whistles, instruments (music.ts), the tin
// opener and the tinning kit (tin.ts), the horn of plenty (horn.ts), the magic marker (write.ts), the
// towel (towel.ts), the blindfold, the unicorn horn (unicorn.ts), figurines (figurine.ts), cream pies (creampie.ts) and digging tools
// (the pick-axe and the dwarvish mattock, a weapon; dig.ts); polearms and lances (pole.ts);
// applying a wand breaks it (breakwand.ts); the stethoscope (stethoscope.ts), the expensive
// camera (camera.ts), the mirror (mirror.ts), the crystal ball (crystalball.ts), the leash
// (leash.ts), the bell and the Bell of Opening (openit() in zap.ts).
// ref: src/apply.c doapply(), use_whistle(), use_magic_whistle(), magic_whistled(), use_bell();
// src/mon.c wake_nearby(), wake_nearto_core() (petcall); src/teleport.c tele_to_rnd_pet();
// src/vault.c vault_summon_gd() (a cursed tin whistle)
//
// Not ported (see DEVIATIONS.md): the tools outside the subset, Deafness, being underwater,
// stasis, and the combined one-sentence report of a known magic whistle (each kind of move is
// its own sentence here).
import { levelDifficulty } from './levdiff';
import { retouchObject } from './artitouch';
import { vaultSummonGd } from './vaultstate';
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Msg,
  type Offer,
} from '@nh/core';
import { answerBreakWand, doBreakWand } from './breakwand';
import { useContainer } from './container';
import { nohands } from './mondata';
import { heroForm } from './upoly';
import { DIG_ID, isPick, usePickAxe } from './dig';
import { POLE_ID, poleAction, usePole } from './pole';
import { isPole } from './skills';
import { mnextoPos } from './generation';
import {
  answerMusic,
  consumeObjCharge,
  doPlayInstrument,
  isInstrument,
  isMusicData,
} from './music';
import { mkundead } from './deadbook';
import { invocationPos } from './invocation';
import { T, terrainIdAt } from './terrain';
import { findit, openit } from './zap';
import { blindfOff, blindfOn, cursedWorn, isEyewear } from './jewelry';
import { applyLockTool, isLockTool } from './lock';
import { changeLuck } from './luck';
import {
  answerAttachCandles,
  isAttachData,
  isCandle,
  isLamp,
  useCandelabrum,
  useCandle,
  useLamp,
} from './light';
import { BELL_OF_OPENING, CANDELABRUM } from './uhave';
import { lightCocktail } from './oil';
import { POT_OIL } from './dilute';
import { checkCapacity } from './magic';
import { edogOf } from './dog';
import { wakeNearto } from './noise';
import { discover, isKnown } from './o_init';
import { canSpotMon, monNam } from './perception';
import { P, heroHas, wornIn } from './props';
import { inStasis, noteleportLevel, teleok } from './teleport';
import { mintrap, teleds } from './trap';
import { setMtrapped } from './trapstate';
import { UNICORN_HORN, useUnicornHorn } from './unicorn';
import { useFigurine } from './figurine';
import { FIGURINE } from './figurinestate';
import { CREAM_PIE, useCreamPie } from './creampie';
import {
  TINNING_KIT,
  TIN_OPENER,
  answerTinTool,
  isTinToolData,
  useTinOpener,
  useTinningKit,
} from './tin';
import { HORN_OF_PLENTY, hornoplenty } from './horn';
import { MAGIC_MARKER, answerWrite, dowrite, isWriteData } from './write';
import { STETHOSCOPE, answerStethoscope, isStethData, useStethoscope } from './stethoscope';
import { EXPENSIVE_CAMERA, answerCamera, isCameraData, useCamera } from './camera';
import { CRYSTAL_BALL, answerCrystalBall, isCrystalBallData, useCrystalBall } from './crystalball';
import { MIRROR, answerMirror, isMirrorData, useMirror } from './mirror';
import { LEASH, answerLeash, isLeashData, useLeash } from './leash';
import { uswallow } from './engulfstate';
import { makemon, mkclass } from './generation';
import { isGone } from './vanquished';
import { objResists } from './material';
import { setMspeed } from './mstate';
import { useup } from './magic';
import { nomulNow } from './hunger';
import { xnameOf } from './objnam';
import { TOWEL } from './glib';
import { useTowel } from './towel';

export const APPLY_ID: DefId = 'nh:apply';

export const WHISTLE = { tin: 'nh:tin_whistle', magic: 'nh:magic_whistle' } as const;

export const BELL: DefId = 'nh:bell';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/** Whether `a` can apply this object (the tools of the subset, cream pies, potions of oil, and wands: breaking them). */
export function applicable(ctx: Pick<Ctx, 'defs'>, e: Entity): boolean {
  const def = ctx.defs.object(e.def);
  if (isPick(def)) return true; // PICK_AXE, DWARVISH_MATTOCK
  if (isPole(def)) return true; // polearms and lances: use_pole()
  if (def.class === 'wand') return true; // do_break_wand()
  if (e.def === CREAM_PIE) return true; // use_cream_pie()
  if (e.def === POT_OIL) return true; // light_cocktail()
  if (def.class !== 'tool') return false;
  return (
    def.container !== undefined ||
    isLamp(e.def) ||
    isCandle(e.def) ||
    e.def === CANDELABRUM ||
    isLockTool(e.def) ||
    e.def === WHISTLE.tin ||
    e.def === WHISTLE.magic ||
    isInstrument(e.def) ||
    e.def === UNICORN_HORN ||
    e.def === FIGURINE ||
    e.def === TINNING_KIT ||
    e.def === TIN_OPENER ||
    e.def === HORN_OF_PLENTY ||
    e.def === MAGIC_MARKER ||
    e.def === STETHOSCOPE ||
    e.def === EXPENSIVE_CAMERA ||
    e.def === MIRROR ||
    e.def === CRYSTAL_BALL ||
    e.def === LEASH ||
    e.def === BELL ||
    e.def === BELL_OF_OPENING ||
    isEyewear(e.def)
  );
}

// ---------------------------------------------------------------------------------------------
// whistles

/**
 * Wakes the monsters within u.ulevel * 20 (distance squared) of the hero; pets among them come
 * to her for a few turns (whistletime). ref: src/mon.c wake_nearby(TRUE), wake_nearto_core()
 */
function wakeNearby(ctx: Ctx): void {
  const h = hero(ctx);
  const p = h.c.pos;
  if (!p) return;
  const dist = (h.c.experience?.level ?? 1) * 20;
  wakeNearto(ctx, p.x, p.y, dist);
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    const mp = m?.c.pos;
    if (!m?.c.monster?.tame || !mp || mp.level !== p.level) continue;
    if ((mp.x - p.x) ** 2 + (mp.y - p.y) ** 2 >= dist) continue;
    const edog = edogOf(ctx, id);
    if (edog) edog.whistletime = ctx.state.turn;
  }
}

/** ref: src/apply.c use_whistle() */
function useWhistle(ctx: Ctx, obj: Entity): void {
  say(ctx, 'whistle.sound', {
    how: { key: obj.c.item?.buc === 'cursed' ? 'whistle.shrill' : 'whistle.high' },
  });
  wakeNearby(ctx);
  if (obj.c.item?.buc === 'cursed') vaultSummonGd(ctx); // a cursed one summons the vault guard
}

const HOW_MANY = (n: number): string =>
  n === 2 ? 'two' : n === 3 ? 'three' : n === 4 ? 'four' : n <= 7 ? 'several' : 'many';

/** Every pet on the level comes next to the hero. ref: src/apply.c magic_whistled() */
function magicWhistled(ctx: Ctx, obj: Entity): void {
  const alreadyDiscovered = isKnown(ctx.state, ctx.defs, obj.def);
  const hp = hero(ctx).c.pos;
  const level = hp ? ctx.state.levels[hp.level] : undefined;
  if (!hp || !level) return;
  if (inStasis(ctx.state, level.id)) return; // stasis prevents magic-whistling
  let shift = 0;
  let appear = 0;
  let disappear = 0;
  let trapped = 0;
  let shiftName: string | null = null;
  let appearName: string | null = null;
  let disappearName: string | null = null;
  for (const id of sortedIds(ctx.state)) {
    const mtmp = ctx.state.entities[String(id)];
    const mp = mtmp?.c.pos;
    // only tame monsters on this level are affected
    if (!mtmp?.c.monster?.tame || !mp || mp.level !== hp.level || (mtmp.c.hp?.cur ?? 1) < 1)
      continue;
    setMtrapped(ctx, id, false); // no longer in previous trap
    const oseen = canSpotMon(ctx, mtmp);
    const oname = oseen ? monNam(ctx, mtmp) : null;
    const omx = mp.x;
    const omy = mp.y;
    // mnexto(): next to the hero, if there is room
    const spot = mnextoPos(ctx, level, id, hp);
    if (!spot) continue;
    mtmp.c.pos = { level: hp.level, x: spot.x, y: spot.y };
    if (spot.x === omx && spot.y === omy) continue;
    if (!alreadyDiscovered) {
      // rloc(RLOC_MSG): the vanishing and appearing messages
      const nseen = canSpotMon(ctx, mtmp);
      if (oseen && nseen) say(ctx, 'whistle.vanish_reappear', { mon: monNam(ctx, mtmp) });
      else if (oseen) say(ctx, 'whistle.vanishes', { mon: oname ?? '' });
      else if (nseen)
        say(ctx, heroHas(ctx.state, P.BLINDED) ? 'whistle.arrives' : 'whistle.appears', {
          mon: monNam(ctx, mtmp),
        });
    }
    const res = mintrap(ctx, id);
    if (res === 'killed') changeLuck(ctx, -1);
    if (res !== 'finished') {
      ++trapped;
      continue;
    }
    const alive = ctx.state.entities[String(id)]?.c.monster !== undefined;
    const nseen = alive && canSpotMon(ctx, mtmp);
    if (nseen) {
      if (oseen) {
        if (++shift === 1) shiftName = monNam(ctx, mtmp);
      } else if (++appear === 1) appearName = monNam(ctx, mtmp);
    } else if (oseen) {
      if (++disappear === 1) disappearName = oname;
    }
  }
  if (!alreadyDiscovered) {
    // if only noticeable change was pet(s) disappearing, the magic whistle won't become discovered
    if (shift + appear + trapped > 0) discover(ctx, obj.def);
    return;
  }
  if (shift === 1) say(ctx, 'whistle.shifts', { mon: shiftName ?? '' });
  else if (shift > 1) say(ctx, 'whistle.shift_n', { n: { key: `whistle.n.${HOW_MANY(shift)}` } });
  if (appear === 1) say(ctx, 'whistle.appears_one', { mon: appearName ?? '' });
  else if (appear > 1)
    say(ctx, 'whistle.appear_n', { n: { key: `whistle.n.${HOW_MANY(appear)}` } });
  if (disappear === 1) say(ctx, 'whistle.disappears', { mon: disappearName ?? '' });
  else if (disappear > 1)
    say(ctx, 'whistle.disappear_n', { n: { key: `whistle.n.${HOW_MANY(disappear)}` } });
}

/**
 * The hero lands next to a random pet (teleds() with its "You materialize..." message and spot
 * effects). ref: src/teleport.c tele_to_rnd_pet(), teleok()
 */
function teleToRndPet(ctx: Ctx): void {
  const h = hero(ctx);
  const hp = h.c.pos;
  if (!hp) return;
  let pet: Entity | null = null;
  let cnt = 0;
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    if (!m?.c.monster?.tame || m.c.pos?.level !== hp.level) continue;
    cnt++;
    if (!ctx.rng.rn2(cnt)) pet = m;
  }
  const pp = pet?.c.pos;
  if (!pp || Math.max(Math.abs(pp.x - hp.x), Math.abs(pp.y - hp.y)) <= 1) return;
  const tx = pp.x + ctx.rng.rn2(3) - 1;
  const ty = pp.y + ctx.rng.rn2(3) - 1;
  const level = ctx.state.levels[hp.level];
  if (!level || !inBounds(level, tx, ty)) return; // isok()
  if (teleok(ctx, level, tx, ty, false)) teleds(ctx, tx, ty, { teleport: true });
}

/** ref: src/apply.c use_magic_whistle() */
function useMagicWhistle(ctx: Ctx, obj: Entity): void {
  if (obj.c.item?.buc === 'cursed' && !ctx.rng.rn2(2)) {
    say(ctx, 'whistle.humming');
    wakeNearby(ctx);
    const level = ctx.state.levels[hero(ctx).c.pos?.level ?? ''];
    if (!ctx.rng.rn2(2) && level && !noteleportLevel(ctx, level, ctx.state.playerId))
      teleToRndPet(ctx);
    return;
  }
  // it's magic!  it works underwater too (at a higher pitch)
  say(ctx, 'whistle.sound', {
    how: { key: heroHas(ctx.state, P.HALLUC) ? 'whistle.normal' : 'whistle.strange' },
  });
  magicWhistled(ctx, obj);
}

// ---------------------------------------------------------------------------------------------
// the bell

const NYMPHS: readonly DefId[] = ['nh:wood_nymph', 'nh:water_nymph', 'nh:mountain_nymph'];

/**
 * Ringing a bell: "You ring the bell."; inside an engulfer an ordinary bell's "But the sound is
 * muffled."; an uncharged Bell of Opening on the vibrating square "But it makes no sound."; an
 * ordinary bell (or an uncharged Bell) when cursed 1 time in 4 summons a nymph next to her ("You
 * summon a water nymph!", while none of the three kinds is gone), and then shatters ("The bell
 * has shattered!") unless it resists (93%), else the nymph may be fast (1 in 3) or she is stunned
 * for a move or two (1 in 3). A charged Bell of Opening uses a charge: engulfed, it opens the
 * engulfer (cursed: "Nothing happens."); cursed, undead rise around her; on the vibrating square
 * it "issues an unsettling shrill sound..." and is primed for the invocation (`age`); blessed, it
 * opens what she could see within 8 squares ("Something opens...", "Things open around you...");
 * uncursed, it finds hidden things (findit()). The monsters nearby wake up (wake_nearby(TRUE):
 * pets come), but not after a blessed or uncursed Bell. ref: src/apply.c use_bell() (no
 * underwater, no ball and chain, no sound)
 */
function useBell(ctx: Ctx, obj: Entity): void {
  const it = obj.c.item;
  if (!it) return;
  const hp = hero(ctx).c.pos;
  const level = hp ? getLevel(ctx.state, hp.level) : undefined;
  const ordinary = obj.def !== BELL_OF_OPENING || !it.spe;
  const invoking =
    obj.def === BELL_OF_OPENING &&
    hp !== undefined &&
    level !== undefined &&
    invocationPos(ctx, level, hp.x, hp.y) &&
    ctx.defs.terrain(terrainIdAt(level, hp.x, hp.y) ?? T.stone).stairs === undefined;
  let wakem = false;
  let learno = false;
  say(ctx, 'bell.ring', { item: xnameOf(ctx.state, ctx.defs, obj) });
  if (uswallow(ctx) && ordinary) say(ctx, 'bell.muffled');
  else if (invoking && ordinary) {
    // needs to be recharged...
    say(ctx, 'bell.no_sound');
    learno = true; // help player figure out why
  } else if (ordinary) {
    if (it.buc === 'cursed' && !ctx.rng.rn2(4) && hp) {
      // note: once any of them are gone, we stop all of them
      if (!NYMPHS.some((n) => isGone(ctx.state, n))) {
        const def = mkclass(ctx, 'n', levelDifficulty(ctx));
        const mid = makemon(
          ctx,
          def,
          { x: hp.x, y: hp.y },
          { noInventory: true, adjacentOk: true },
        );
        const mtmp = mid === null ? undefined : ctx.state.entities[String(mid)];
        if (mtmp) {
          say(ctx, 'bell.summon', { mon: `@${mtmp.def}` });
          if (!objResists(ctx, obj, 93, 100)) {
            say(ctx, 'bell.shattered', { item: xnameOf(ctx.state, ctx.defs, obj) });
            useup(ctx, obj.id);
          } else
            switch (ctx.rng.rn2(3)) {
              case 1:
                setMspeed(ctx, mtmp.id, 'fast'); // mon_adjust_speed(mtmp, 2, NULL)
                break;
              case 2: // no explanation; it just happens...
                nomulNow(ctx, ctx.rng.rnd(2), 'helpless.helpless', null);
                break;
              default:
                break;
            }
        }
      }
    }
    wakem = true;
  } else {
    // charged Bell of Opening
    consumeObjCharge(ctx, obj);
    if (uswallow(ctx)) {
      if (it.buc !== 'cursed') openit(ctx);
      else say(ctx, 'zap.nothing_happens');
    } else if (it.buc === 'cursed') {
      if (hp) mkundead(ctx, hp.x, hp.y, false);
      wakem = true;
    } else if (invoking) {
      say(ctx, 'bell.shrill', { item: xnameOf(ctx.state, ctx.defs, obj) });
      it.age = ctx.state.turn;
      learno = true;
      wakem = true;
    } else if (it.buc === 'blessed') {
      const res = openit(ctx);
      if (res === 0) say(ctx, 'zap.nothing_happens');
      else {
        say(ctx, res === 1 ? 'bell.something_opens' : 'bell.things_open');
        learno = true;
      }
    } else {
      // uncursed
      if (findit(ctx) !== 0) learno = true;
      else say(ctx, 'zap.nothing_happens');
    }
  }
  if (learno) {
    discover(ctx, ctx.defs.object(BELL_OF_OPENING)); // makeknown()
    it.known = { ...it.known, spe: true };
  }
  if (wakem) wakeNearby(ctx);
}

// ---------------------------------------------------------------------------------------------
// the action

/** The polymorphed form has no hands. ref: include/mondata.h nohands() */
const formNohands = (ctx: Ctx): boolean => {
  const form = heroForm(ctx);
  return !!form && nohands(form);
};

const apply: ActionDef = {
  id: APPLY_ID,
  labelKey: 'action.nh:apply',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    // applying a wand breaks it: its own "Break" offer (still #apply, so `a` lists wands)
    const wand = e !== null && ctx.defs.object(e.def).class === 'wand';
    return e && applicable(ctx, e) && !formNohands(ctx)
      ? [
          {
            action: { type: 'mod', action: APPLY_ID, args: { item: e.id } },
            labelKey: wand
              ? 'action.nh:break'
              : e.def === TOWEL
                ? 'action.nh:apply.towel'
                : 'action.nh:apply',
          },
        ]
      : [];
  },
  // ref: src/apply.c doapply()
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    const obj = heroItem(ctx, (action.args as { item?: unknown } | undefined)?.item);
    // ref: doapply(): a form without hands, before anything else (no time)
    if (formNohands(ctx)) {
      say(ctx, 'apply.nohands');
      return 0;
    }
    if (!obj || !applicable(ctx, obj)) {
      say(ctx, 'apply.cant');
      return 0;
    }
    if (checkCapacity(ctx)) return 0;
    // evading your grasp costs a turn; just be grateful that you don't drop it as well
    if (!retouchObject(ctx, obj, false)) return NORMAL_SPEED;
    const def = ctx.defs.object(obj.def);
    if (def.class === 'wand') return doBreakWand(ctx, obj, APPLY_ID);
    if (def.container) return useContainer(ctx, obj);
    if (isLockTool(obj.def)) return applyLockTool(ctx, obj);
    if (isPick(def)) return usePickAxe(ctx, obj);
    if (isPole(def)) return usePole(ctx, obj, false);
    if (isInstrument(obj.def)) return doPlayInstrument(ctx, obj, APPLY_ID);
    if (obj.def === FIGURINE) return useFigurine(ctx, obj);
    if (obj.def === CREAM_PIE) return useCreamPie(ctx, obj);
    if (obj.def === TIN_OPENER) return useTinOpener(ctx, obj, APPLY_ID);
    if (obj.def === TINNING_KIT) return useTinningKit(ctx, obj, APPLY_ID);
    if (obj.def === MAGIC_MARKER) return dowrite(ctx, obj, APPLY_ID);
    if (obj.def === TOWEL) return useTowel(ctx, obj);
    if (obj.def === STETHOSCOPE) return useStethoscope(ctx, obj, APPLY_ID);
    if (obj.def === EXPENSIVE_CAMERA) return useCamera(ctx, obj, APPLY_ID);
    if (obj.def === MIRROR) return useMirror(ctx, obj, APPLY_ID);
    if (obj.def === CRYSTAL_BALL) return useCrystalBall(ctx, obj, APPLY_ID);
    if (obj.def === LEASH) return useLeash(ctx, obj, APPLY_ID);
    if (isLamp(obj.def)) useLamp(ctx, obj);
    else if (isCandle(obj.def)) {
      if (useCandle(ctx, obj, APPLY_ID)) return 0; // "Attach your candles to ...?"
    } else if (obj.def === CANDELABRUM) useCandelabrum(ctx, obj);
    else if (obj.def === POT_OIL) lightCocktail(ctx, obj);
    else if (obj.def === WHISTLE.magic) useMagicWhistle(ctx, obj);
    else if (obj.def === WHISTLE.tin) useWhistle(ctx, obj);
    else if (obj.def === UNICORN_HORN) useUnicornHorn(ctx, obj);
    else if (obj.def === HORN_OF_PLENTY)
      hornoplenty(ctx, obj); // not a musical instrument
    else if (obj.def === BELL || obj.def === BELL_OF_OPENING) useBell(ctx, obj);
    else if (isEyewear(obj.def)) {
      const ublindf = wornIn(ctx.state, ctx.state.playerId, 'blindfold');
      if (ublindf?.id === obj.id) {
        if (!cursedWorn(ctx, obj)) blindfOff(ctx, obj);
      } else if (!ublindf) blindfOn(ctx, obj);
      else say(ctx, ublindf.def === TOWEL ? 'towel.already_covered' : 'puton.already_blindfold');
    }
    return NORMAL_SPEED;
  },
  // "Are you really sure you want to break X?", the questions of playing an instrument (and a
  // horn's direction), the tinning kit's corpse and the tin opener's tin, the marker's paper and
  // what to write on it
  answer: (ctx, value, data) =>
    isAttachData(data)
      ? answerAttachCandles(ctx, value, data)
      : isStethData(data)
        ? answerStethoscope(ctx, value, data)
        : isCameraData(data)
          ? answerCamera(ctx, value, data)
          : isMirrorData(data)
            ? answerMirror(ctx, value, data)
            : isCrystalBallData(data)
              ? answerCrystalBall(ctx, value, data)
              : isLeashData(data)
                ? answerLeash(ctx, value, data)
                : isMusicData(data)
                  ? answerMusic(ctx, value, data, APPLY_ID)
                  : isTinToolData(data)
                    ? answerTinTool(ctx, value, data)
                    : isWriteData(data)
                      ? answerWrite(ctx, value, data, APPLY_ID)
                      : answerBreakWand(ctx, value, data),
  // a lock tool may start the lock-picking occupation (lock.ts); a pick being wielded is swung
  // on the next move (dig.ts), a polearm being wielded is applied on the next move (pole.ts)
  continues: (ctx) =>
    ctx.state.occupation?.action.type === 'mod' &&
    (ctx.state.occupation.action.action === 'nh:picklock' ||
      ctx.state.occupation.action.action === DIG_ID ||
      ctx.state.occupation.action.action === POLE_ID),
};

export const APPLY_ACTIONS: readonly ActionDef[] = [apply, poleAction];
