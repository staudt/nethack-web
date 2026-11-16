// Playing a musical instrument (#apply): flutes, horns, harps, the bugle and drums. Unless
// stunned, confused or hallucinating she is asked "Improvise?" (never for a drum); improvising
// plays the instrument's own effect: the magic flute's sleep, the wooden flute charming snakes, the
// fire and frost horns' rays (a direction; at herself too), the tooled horn's fright, the bugle's
// call to soldiers, the magic harp's taming, the wooden harp calming nymphs, the leather drum's
// alarm and the drum of earthquake's chasms (earthquake.ts). A magic instrument without charges,
// or played stunned or confused, sounds as its mundane twin. "no" plays the passtune ("Play the
// passtune?" once she knows it) or a typed tune of notes A-G, which opens or closes the Castle's
// drawbridge next to her when it is the right one, and otherwise gives the Mastermind clues
// (tumblers and gears).
// ref: src/music.c do_play_instrument(), do_improvisation(), improvised_notes(),
// awaken_soldiers(), awaken_scare(), awaken_monsters(), put_monsters_to_sleep(), charm_snakes(),
// calm_nymphs(), charm_monsters(); src/invent.c consume_obj_charge(); src/mondata.c can_blow();
// src/monmove.c onscary() (its <0,0> auditory case); src/hacklib.c mungspaces(), highc()
//
// Not ported (see DEVIATIONS.md "Instruments"): Deafness (the leather drum's deafening row does
// not deafen; no "You feel ... vibrations" lines), being underwater, attribute exercise,
// Hero_playnotes() (sound), achievements, vault guards, and the scare exemptions for the Wizard,
// minions, Angels and the Riders (none exist here).
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
} from '@nh/core';
import { buzzFrom, resist, sleepMonst, sleptMonst, type Ray } from './buzz';
import { tamedog } from './dog';
import { doEarthquake, genericLvlDesc } from './earthquake';
import { isSwallowed, ustuck } from './engulfstate';
import { uhimKey } from './gender';
import { losehp } from './hp';
import { canseemon } from './invis';
import { discover } from './o_init';
import { wakeup } from './peaceful';
import { checkUnpaid } from './shk';
import { ZAP_DIRECTIONS, zapDirOf, zapyourself } from './zap';
import { closeDrawbridge, openDrawbridge } from './dbridge';
import {
  CASTLE,
  castleTune,
  findDrawbridge,
  isDrawbridge,
  isDrawbridgeWall,
  isLoweredSpan,
  setUheardTune,
  uheardTune,
} from './dbstate';
import { epriOf, inhistemple } from './epri';
import { eshkOf, inhishop } from './eshk';
import { canBlowDef } from './mondata';
import { monflee } from './monflee';
import { clearWaitMask, isFrozen, stratWaiting, unfreezeMonst } from './mstate';
import { setUndetected } from './hidestate';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { P, hasProp, isStrangled } from './props';
import { heroForm } from './upoly';

export const BUGLE: DefId = 'nh:bugle';

/** The instruments. ref: include/objects.h (WOODEN_FLUTE .. DRUM_OF_EARTHQUAKE, no bells) */
export const INSTR = {
  woodenFlute: 'nh:wooden_flute',
  magicFlute: 'nh:magic_flute',
  tooledHorn: 'nh:tooled_horn',
  frostHorn: 'nh:frost_horn',
  fireHorn: 'nh:fire_horn',
  woodenHarp: 'nh:wooden_harp',
  magicHarp: 'nh:magic_harp',
  bugle: BUGLE,
  leatherDrum: 'nh:leather_drum',
  drumOfEarthquake: 'nh:drum_of_earthquake',
} as const satisfies Record<string, DefId>;

const INSTRUMENTS: readonly DefId[] = Object.values(INSTR);

/** An object do_play_instrument() plays (doapply()'s instrument cases). */
export const isInstrument = (otyp: DefId): boolean => INSTRUMENTS.includes(otyp);

/** The instruments one blows into: can_blow() first. ref: src/music.c do_play_instrument() */
const BLOWN: readonly DefId[] = [
  INSTR.woodenFlute,
  INSTR.magicFlute,
  INSTR.tooledHorn,
  INSTR.frostHorn,
  INSTR.fireHorn,
  INSTR.bugle,
];

/** Drums are never asked "Improvise?": they play no notes. */
const isDrum = (otyp: DefId): boolean =>
  otyp === INSTR.leatherDrum || otyp === INSTR.drumOfEarthquake;

/**
 * A magic instrument's mundane counterpart, C's `itmp.otyp -= 1` while oc_magic (the two magic
 * horns both reach the tooled horn). ref: src/music.c do_improvisation()
 */
const MUNDANE: Readonly<Record<string, DefId>> = {
  [INSTR.magicFlute]: INSTR.woodenFlute,
  [INSTR.fireHorn]: INSTR.tooledHorn,
  [INSTR.frostHorn]: INSTR.tooledHorn,
  [INSTR.magicHarp]: INSTR.woodenHarp,
  [INSTR.drumOfEarthquake]: INSTR.leatherDrum,
};

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Whether the hero can blow into a horn: a silent or buzzing form that is breathless, very small,
 * headless or an eel cannot, nor can a strangled hero. ref: src/mondata.c can_blow()
 */
export function canBlow(ctx: Ctx): boolean {
  const form = heroForm(ctx);
  if (form && !canBlowDef(form)) return false;
  return !isStrangled(getPlayer(ctx.state));
}

/**
 * The improvised jingle: 1 to 5 random notes, kept while the hero is Unchanging (then the song
 * is "familiar"). Lives in `modData.nh.jingle`. ref: src/music.c improvised_notes()
 */
function improvisedNotes(ctx: Ctx): boolean {
  const md = ctx.state.modData;
  const nh = isObj(md['nh']) ? md['nh'] : (md['nh'] = {});
  const old = typeof nh['jingle'] === 'string' ? nh['jingle'] : '';
  if (hasProp(getPlayer(ctx.state), P.UNCHANGING) && old !== '') return true;
  const notecount = ctx.rng.rnd(5);
  let jingle = '';
  for (let i = 0; i < notecount; ++i) jingle += 'ABCDEFG'[ctx.rng.rn2(7)] ?? 'A';
  nh['jingle'] = jingle;
  return false;
}

/**
 * The monster can be scared by a sound: everything but a shopkeeper in her shop and a priest in
 * his temple. ref: src/monmove.c onscary() with x == y == 0
 */
function auditoryScare(ctx: Ctx, mon: Entity): boolean {
  if (eshkOf(ctx, mon.id) && inhishop(ctx, mon.id)) return false;
  if (epriOf(ctx, mon.id) && inhistemple(ctx, mon.id)) return false;
  return true;
}

/**
 * A monster woken by music; `scary` may make it flee unless it is mindless or resists (resist()
 * with TOOL_CLASS: attack level 10). ref: src/music.c awaken_scare()
 */
function awakenScare(ctx: Ctx, mon: Entity, scary: boolean): void {
  const m = mon.c.monster;
  if (!m) return;
  m.asleep = false;
  unfreezeMonst(ctx, mon.id); // mcanmove = 1, mfrozen = 0
  const def = ctx.defs.monster(mon.def);
  // may scare some monsters -- waiting monsters excluded
  if (!def.genFlags.includes('uniq') && stratWaiting(ctx, mon.id)) {
    clearWaitMask(ctx, mon.id);
    return;
  }
  if (!scary) return;
  if (def.flags.includes('mindless')) return;
  let dlev = m.level;
  if (dlev > 50) dlev = 50;
  else if (dlev < 1) dlev = 1;
  if (ctx.rng.rn2(100 + 10 - dlev) < def.mr) return; // resist(mtmp, TOOL_CLASS, 0, NOTELL)
  if (auditoryScare(ctx, mon)) monflee(ctx, mon.id, 0, false, true);
}

/**
 * A bugle call: every mercenary of the level is woken, made hostile (unless tame) and ready for
 * battle; any other monster within `level * 30` (distance squared) of the bugler is woken, and
 * scared within a third of that (the hero's level, or a monster bugler's base level).
 * ref: src/music.c awaken_soldiers()
 */
export function awakenSoldiers(ctx: Ctx, bugler: Entity | 'hero' = 'hero'): void {
  const h = getPlayer(ctx.state);
  const bp = bugler === 'hero' ? h.c.pos : bugler.c.pos;
  if (!bp) return;
  const distance =
    (bugler === 'hero' ? (h.c.experience?.level ?? 1) : ctx.defs.monster(bugler.def).level) * 30;
  let heard = false;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const m = mon?.c.monster;
    const p = mon?.c.pos;
    if (!mon || !m || !p || p.level !== bp.level || (mon.c.hp?.cur ?? 1) < 1) continue;
    // (not the vault guard)
    if (ctx.defs.monster(mon.def).flags.includes('merc') && mon.def !== 'nh:guard') {
      if (!m.tame) m.peaceful = false;
      m.asleep = false;
      unfreezeMonst(ctx, id);
      clearWaitMask(ctx, id);
      if (canSpotMon(ctx, mon)) say(ctx, 'music.ready_for_battle', { mon: monNam(ctx, mon) });
      else if (!heard) {
        // Norep()
        say(ctx, 'music.rattle');
        heard = true;
      }
    } else {
      const distm = (p.x - bp.x) ** 2 + (p.y - bp.y) ** 2;
      if (distm < distance) awakenScare(ctx, mon, distm < Math.trunc(distance / 3));
    }
  }
}

/** The monsters of the hero's level that are alive, in id order (C's fmon walk). */
function levelMonsters(ctx: Ctx): Entity[] {
  const hp = getPlayer(ctx.state).c.pos;
  const out: Entity[] = [];
  if (!hp) return out;
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    if (!mon?.c.monster || mon.c.pos?.level !== hp.level || (mon.c.hp?.cur ?? 1) < 1) continue;
    out.push(mon);
  }
  return out;
}

/** The distance squared from the hero. ref: mdistu() */
function mdistu(ctx: Ctx, mon: Entity): number {
  const hp = getPlayer(ctx.state).c.pos;
  const p = mon.c.pos;
  return hp && p ? (p.x - hp.x) ** 2 + (p.y - hp.y) ** 2 : Infinity;
}

const alive = (ctx: Ctx, mon: Entity): boolean =>
  ctx.state.entities[String(mon.id)]?.c.monster !== undefined;

/**
 * Every monster within `distance` (distance squared) is woken, and scared within a third of it.
 * ref: src/music.c awaken_monsters()
 */
export function awakenMonsters(ctx: Ctx, distance: number): void {
  for (const mon of levelMonsters(ctx)) {
    if (!alive(ctx, mon)) continue;
    const distm = mdistu(ctx, mon);
    if (distm < distance) awakenScare(ctx, mon, distm < Math.trunc(distance / 3));
  }
}

/**
 * Monsters within `distance` fall asleep for `d(10, 10)` turns unless they resist (an
 * instrument's resist(), attack level 10) or resist sleep. ref: src/music.c
 * put_monsters_to_sleep()
 */
function putMonstersToSleep(ctx: Ctx, distance: number): void {
  for (const mon of levelMonsters(ctx)) {
    if (!alive(ctx, mon)) continue;
    if (mdistu(ctx, mon) < distance && sleepMonst(ctx, mon, ctx.rng.d(10, 10), 'tool')) {
      const m = mon.c.monster;
      if (m) m.asleep = true; // 10d10 turns + wake_nearby to rouse
      sleptMonst(ctx, mon);
    }
  }
}

/**
 * Snakes in range that can move become peaceful (not tame) and stop hiding: "The snake freezes,
 * then sways with the music, and now seems quieter." (or "You notice a snake, swaying with the
 * music." when it was hidden). ref: src/music.c charm_snakes() (no mavenge)
 */
function charmSnakes(ctx: Ctx, distance: number): void {
  for (const mon of levelMonsters(ctx)) {
    const m = mon.c.monster;
    if (!m || !alive(ctx, mon)) continue;
    if (
      ctx.defs.monster(mon.def).glyph.ch !== 'S' ||
      isFrozen(ctx, mon.id) ||
      mdistu(ctx, mon) >= distance
    )
      continue;
    const wasPeaceful = m.peaceful;
    m.peaceful = true;
    clearWaitMask(ctx, mon.id);
    const couldSee = canseemon(ctx, mon);
    setUndetected(ctx, mon.id, false);
    if (canseemon(ctx, mon)) {
      if (!couldSee) say(ctx, 'music.notice_swaying', { mon: monNam(ctx, mon) });
      else say(ctx, wasPeaceful ? 'music.sways' : 'music.sways_quieter', { mon: monNam(ctx, mon) });
    }
  }
}

/**
 * Nymphs in range that can move wake up and become peaceful: "The water nymph listens cheerfully
 * to the music, then seems quieter." ref: src/music.c calm_nymphs() (no mavenge)
 */
function calmNymphs(ctx: Ctx, distance: number): void {
  for (const mon of levelMonsters(ctx)) {
    const m = mon.c.monster;
    if (!m || !alive(ctx, mon)) continue;
    if (
      ctx.defs.monster(mon.def).glyph.ch !== 'n' ||
      isFrozen(ctx, mon.id) ||
      mdistu(ctx, mon) >= distance
    )
      continue;
    m.asleep = false;
    m.peaceful = true;
    clearWaitMask(ctx, mon.id);
    if (canseemon(ctx, mon)) say(ctx, 'music.listens_cheerfully', { mon: monNam(ctx, mon) });
  }
}

/**
 * Monsters within `distance` (at most; only the engulfer when she is swallowed) that fail to
 * resist (an instrument's resist()) are tamed; a shopkeeper is pacified even when he resists.
 * ref: src/music.c charm_monsters()
 */
function charmMonsters(ctx: Ctx, distanceIn: number): void {
  // only u.ustuck will be affected when swallowed
  const swallowed = isSwallowed(ctx);
  const distance = swallowed ? 0 : distanceIn;
  const stuck = ustuck(ctx);
  for (const mon of levelMonsters(ctx)) {
    if (!alive(ctx, mon)) continue;
    if (swallowed ? mon.id !== stuck : mdistu(ctx, mon) > distance) continue;
    // a shopkeeper can't be tamed but tamedog() pacifies an angry one; do that even if it
    // resists, as a non-cursed scroll of taming
    if (!resist(ctx, mon, 0, 'tool') || eshkOf(ctx, mon.id))
      tamedog(ctx, mon.id, null, true, () => undefined);
  }
}

/**
 * One charge of a magic instrument is used (a usage fee when it is unpaid).
 * ref: src/invent.c consume_obj_charge(obj, TRUE)
 */
function consumeObjCharge(ctx: Ctx, obj: Entity): void {
  checkUnpaid(ctx, obj);
  const it = obj.c.item;
  if (it) it.spe -= 1;
}

/** The leather drum's riffs. ref: src/music.c beats[] */
const BEATS = [
  'stepper',
  'one_drop',
  'slow_two',
  'triple_stroke_roll',
  'double_shuffle',
  'half_time_shuffle',
  'second_line',
  'train',
] as const;

/**
 * Improvising: the opening line by the hero's state (stunned, confused, hallucinating; half the
 * time several of them read as one), a new jingle, then the instrument's effect (that of its
 * mundane twin for a magic one without charges or when she is stunned or confused). Returns the
 * energy used, or 0 while a horn's direction is asked (`handler` gets the answer, which takes
 * the move). ref: src/music.c do_improvisation()
 */
function doImprovisation(ctx: Ctx, instr: Entity, handler: DefId): number {
  const h = getPlayer(ctx.state);
  const stunned = hasProp(h, P.STUNNED);
  const confused = hasProp(h, P.CONFUSION);
  const halluc = hasProp(h, P.HALLUC);
  let doSpec = !(stunned || confused);
  // if won't yield special effect, make sound of mundane counterpart
  let otyp = instr.def;
  let mundane = false;
  if (!doSpec || (instr.c.item?.spe ?? 0) <= 0)
    for (let m = MUNDANE[otyp]; m !== undefined; m = MUNDANE[otyp]) {
      otyp = m;
      mundane = true;
    }
  let mode = (stunned ? 1 : 0) | (confused ? 2 : 0) | (halluc ? 4 : 0);
  if (!ctx.rng.rn2(2)) {
    if (mode === 3) mode = !ctx.rng.rn2(2) ? 1 : 2;
    if (mode & 4) mode = 4;
  }
  const item = xnameOf(ctx.state, ctx.defs, instr);
  switch (mode) {
    case 0:
      say(ctx, 'music.start_playing', { item });
      break;
    case 1:
      say(ctx, 'music.droning');
      break;
    case 2:
      say(ctx, 'music.raucous');
      break;
    case 4:
      say(ctx, 'music.butterflies');
      break;
    default:
      say(ctx, 'music.far_from_music');
      break;
  }
  const same = improvisedNotes(ctx);
  const ulevel = h.c.experience?.level ?? 1;
  const dex = h.c.attributes?.dex ?? 10;
  switch (otyp) {
    case INSTR.magicFlute: // make monster fall asleep
      consumeObjCharge(ctx, instr);
      say(ctx, `music.magic_flute${halluc ? '_piped' : ''}${same ? '_familiar' : ''}`);
      putMonstersToSleep(ctx, ulevel * 5);
      break;
    case INSTR.woodenFlute: {
      // may charm snakes (the roll is made either way: C's `do_spec &=`)
      const skilled = ctx.rng.rn2(dex) + ulevel > 25;
      doSpec = doSpec && skilled;
      say(ctx, `music.flute_${doSpec ? 'trills' : 'toots'}${same ? '_familiar' : ''}`, { item });
      if (doSpec) charmSnakes(ctx, ulevel * 3);
      break;
    }
    case INSTR.fireHorn: // idem wand of fire
    case INSTR.frostHorn: // idem wand of cold
      consumeObjCharge(ctx, instr);
      ctx.ask(
        { id: 'music-horn', kind: 'direction', key: 'zap.direction', options: [...ZAP_DIRECTIONS] },
        handler,
        { music: instr.id, step: 'horn' },
      );
      return 0;
    case INSTR.tooledHorn: // awaken or scare monsters
      say(ctx, same ? 'music.tooled_horn_familiar' : 'music.tooled_horn');
      awakenMonsters(ctx, ulevel * 30);
      break;
    case INSTR.bugle: // awaken & attract soldiers
      say(ctx, same ? 'music.bugle_familiar' : 'music.bugle', { item });
      awakenSoldiers(ctx);
      break;
    case INSTR.magicHarp: // charm monsters
      consumeObjCharge(ctx, instr);
      say(ctx, same ? 'music.magic_harp_familiar' : 'music.magic_harp', { item });
      charmMonsters(ctx, Math.trunc((ulevel - 1) / 3) + 1);
      break;
    case INSTR.woodenHarp: {
      // may calm nymphs
      const skilled = ctx.rng.rn2(dex) + ulevel > 25;
      doSpec = doSpec && skilled;
      say(
        ctx,
        doSpec
          ? same
            ? 'music.harp_lilting_familiar'
            : 'music.harp_lilting'
          : same
            ? 'music.harp_twangs_familiar'
            : 'music.harp_twangs',
        { item },
      );
      if (doSpec) calmNymphs(ctx, ulevel * 3);
      break;
    }
    case INSTR.drumOfEarthquake: {
      // create several pits; it never deafens
      consumeObjCharge(ctx, instr);
      say(ctx, 'music.thunderous');
      say(ctx, 'music.shaking', { where: genericLvlDesc(ctx) });
      doEarthquake(ctx, Math.trunc((ulevel - 1) / 3) + 1);
      if (ctx.state.gameOver) return NORMAL_SPEED;
      // shake up monsters in a much larger radius (ROWNO * COLNO)
      const level = getLevel(ctx.state);
      awakenMonsters(ctx, level.width * level.height);
      discover(ctx, INSTR.drumOfEarthquake);
      break;
    }
    case INSTR.leatherDrum: // awaken monsters
      if (!mundane) {
        // "You beat a deafening row!" (Deafness is not ported)
        say(ctx, same ? 'music.deafening_row_familiar' : 'music.deafening_row');
      } else {
        const verb = ctx.rng.rn2(2) ? 'butcher' : ctx.rng.rn2(2) ? 'manage' : 'pull_off';
        const beat = BEATS[ctx.rng.rn2(BEATS.length)] ?? 'train';
        say(ctx, 'music.drum_riff', { verb: `@music.riff.${verb}`, beat: `@music.beat.${beat}` });
      }
      awakenMonsters(ctx, ulevel * (mundane ? 5 : 40));
      break;
    default:
      return 0;
  }
  return NORMAL_SPEED;
}

/**
 * The fire or frost horn's direction: none ("The horn vibrates."); at herself zapyourself() as the
 * wand of fire or cold, its damage taken "using a magical horn on herself"; otherwise "A bolt of
 * fire blasts out of the horn!" and the hero's ray of `rn1(6, 6)` dice. The horn is learned
 * (not when no direction was given). ref: src/music.c do_improvisation() FIRE_HORN, FROST_HORN
 */
function blowHorn(ctx: Ctx, instr: Entity, value: Json): number {
  const dir = zapDirOf(ctx, value);
  if (dir === undefined) {
    say(ctx, 'music.horn_vibrates', { item: xnameOf(ctx.state, ctx.defs, instr) });
    return NORMAL_SPEED;
  }
  const ray: Ray = instr.def === INSTR.frostHorn ? 'cold' : 'fire';
  if (dir === 'self') {
    const damage = zapyourself(ctx, { kind: 'wand', item: instr }, true);
    if (ctx.state.gameOver) return NORMAL_SPEED;
    if (damage) losehp(ctx, damage, uhimKey(ctx.state, '@killer.horn.self'));
  } else {
    const h = getPlayer(ctx.state);
    const hp = h.c.pos;
    if (!hp) return NORMAL_SPEED;
    if (!hasProp(h, P.BLINDED)) say(ctx, 'music.horn_blasts', { ray: `@zap.flash.${ray}` });
    const nd = ctx.rng.rn2(6) + 6; // rn1(6, 6)
    buzzFrom(ctx, ray, nd, { x: hp.x, y: hp.y }, dir, {
      by: 'hero',
      horn: true,
      wakeup,
    });
  }
  if (!ctx.state.gameOver) discover(ctx, instr.def);
  return NORMAL_SPEED;
}

/** The step of do_play_instrument() a question belongs to ('horn': a horn's direction). */
type MusicStep = 'improvise' | 'passtune' | 'tune' | 'horn';

const MUSIC_PROMPT: Readonly<Record<Exclude<MusicStep, 'horn'>, string>> = {
  improvise: 'music-improvise',
  passtune: 'music-passtune',
  tune: 'music-tune',
};

/** Asks the next question of do_play_instrument(); its answer comes back to `handler`. */
function askMusic(ctx: Ctx, handler: DefId, instr: Entity, step: Exclude<MusicStep, 'horn'>): void {
  const id = MUSIC_PROMPT[step];
  if (step === 'tune')
    ctx.ask({ id, kind: 'text', key: 'music.what_tune', maxLength: 80 }, handler, {
      music: instr.id,
      step,
    });
  else
    ctx.ask(
      {
        id,
        kind: 'yn',
        key: step === 'improvise' ? 'music.improvise' : 'music.play_passtune',
        cancellable: true,
      },
      handler,
      { music: instr.id, step },
    );
}

/** Whether a question's data is one of do_play_instrument()'s. */
export const isMusicData = (data: Json): boolean =>
  isObj(data) && typeof data['music'] === 'number' && typeof data['step'] === 'string';

/**
 * Applying an instrument: "You are incapable of playing the flute." when she cannot blow into a
 * flute or horn; then "Improvise?" (yes, no or cancel) unless it is a drum or she is stunned,
 * confused or hallucinating, who always improvise. Returns the energy used (0 while a question
 * is pending: `handler` gets the answer). ref: src/music.c do_play_instrument()
 */
export function doPlayInstrument(ctx: Ctx, instr: Entity, handler: DefId): number {
  if (BLOWN.includes(instr.def) && !canBlow(ctx)) {
    say(ctx, 'music.incapable', { item: xnameOf(ctx.state, ctx.defs, instr) });
    return 0;
  }
  const h = getPlayer(ctx.state);
  if (
    !isDrum(instr.def) &&
    !(hasProp(h, P.STUNNED) || hasProp(h, P.CONFUSION) || hasProp(h, P.HALLUC))
  ) {
    askMusic(ctx, handler, instr, 'improvise');
    return 0;
  }
  return doImprovisation(ctx, instr, handler);
}

/**
 * The answers of do_play_instrument(): "Improvise?" yes improvises; no asks "Play the passtune?"
 * when she knows it (u.uevent.uheard_tune == 2), else the tune ("What tune are you playing? [5
 * notes, A-G]": spaces squeezed, letters raised, H read as B); a cancel anywhere is "Never
 * mind." and takes no time; a horn's direction blows it (blowHorn()). ref: src/music.c
 * do_play_instrument()
 */
export function answerMusic(ctx: Ctx, value: Json, data: Json, handler: DefId): number {
  if (!isObj(data)) return 0;
  const id = data['music'];
  const instr = typeof id === 'number' ? ctx.state.entities[String(id)] : undefined;
  if (!instr || instr.c.item?.carriedBy !== ctx.state.playerId) return 0;
  const nevermind = (): number => {
    say(ctx, 'music.never_mind');
    return 0;
  };
  switch (data['step']) {
    case 'improvise':
      if (value === null) return nevermind();
      if (value !== false) return doImprovisation(ctx, instr, handler);
      if (uheardTune(ctx) === 2) askMusic(ctx, handler, instr, 'passtune');
      else askMusic(ctx, handler, instr, 'tune');
      return 0;
    case 'passtune':
      if (value === null) return nevermind();
      if (value === true) return playTune(ctx, instr, castleTune(ctx));
      askMusic(ctx, handler, instr, 'tune');
      return 0;
    case 'horn':
      return blowHorn(ctx, instr, value);
    case 'tune': {
      if (typeof value !== 'string') return nevermind();
      // mungspaces() (a newline ends it), then highc() and any "H" changed to the expected "B"
      const munged = (value.split('\n')[0] ?? '').replace(/\t/g, ' ').replace(/ +/g, ' ').trim();
      let buf = '';
      for (const c of munged) {
        const up = c >= 'a' && c <= 'z' ? c.toUpperCase() : c;
        buf += up === 'H' ? 'B' : up;
      }
      return playTune(ctx, instr, buf);
    }
    default:
      return 0;
  }
}

/**
 * The tumblers and gears of a wrong tune: a note in its place turns a gear; a note found
 * elsewhere in the tune, at a place not yet matched whose own note is wrong, clicks a tumbler.
 * Only the first five notes count. ref: src/music.c do_play_instrument() (the Mastermind hints)
 */
export function tuneClues(buf: string, tune: string): { tumblers: number; gears: number } {
  let tumblers = 0;
  let gears = 0;
  const matched = [false, false, false, false, false];
  for (let x = 0; x < buf.length && x < 5; x++) {
    if (buf[x] === tune[x]) {
      gears++;
      matched[x] = true;
    } else {
      for (let y = 0; y < 5; y++)
        if (!matched[y] && buf[x] === tune[y] && buf[y] !== tune[y]) {
          tumblers++;
          matched[y] = true;
          break;
        }
    }
  }
  return { tumblers, gears };
}

const countMsg = (what: 'tumbler' | 'gear', n: number): Msg => ({
  key: n === 1 ? `music.one_${what}` : `music.n_${what}s`,
  params: { n },
});

/**
 * Playing the notes `buf` on any instrument: "You extract a strange sound from the flute!" On the Castle, the
 * passtune next to its drawbridge (the span or the portcullis, around her) teaches her the tune
 * and lowers the raised bridge or raises the lowered one; a wrong tune makes her have heard of
 * it, and next to the drawbridge gives the clues ("You hear 2 tumblers click and 1 gear
 * turn."); five gears (the right notes and more) teach her the tune. Takes a move.
 * ref: src/music.c do_play_instrument()
 */
function playTune(ctx: Ctx, instr: Entity, buf: string): number {
  say(ctx, 'music.strange_sound', { item: xnameOf(ctx.state, ctx.defs, instr) });
  const level = getLevel(ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  if (level.def !== CASTLE || !hp) return NORMAL_SPEED;
  // (exercise(A_WIS, TRUE) "just for trying" is not ported)
  const tune = castleTune(ctx);
  if (tune !== '' && buf === tune) {
    // search for the drawbridge
    for (let y = hp.y - 1; y <= hp.y + 1; y++)
      for (let x = hp.x - 1; x <= hp.x + 1; x++) {
        if (!inBounds(level, x, y)) continue;
        const db = findDrawbridge(ctx, level, x, y);
        if (db) {
          setUheardTune(ctx, 2); // tune now fully known
          if (isLoweredSpan(level, db.x, db.y)) closeDrawbridge(ctx, db.x, db.y);
          else openDrawbridge(ctx, db.x, db.y);
          return NORMAL_SPEED;
        }
      }
    return NORMAL_SPEED;
  }
  if (uheardTune(ctx) < 1) setUheardTune(ctx, 1);
  // okay, it wasn't the right tune, but perhaps we can give the player some hints like in the
  // Mastermind game
  let near = false;
  for (let y = hp.y - 1; y <= hp.y + 1 && !near; y++)
    for (let x = hp.x - 1; x <= hp.x + 1 && !near; x++)
      if (
        inBounds(level, x, y) &&
        (isDrawbridge(level, x, y) || isDrawbridgeWall(ctx, level, x, y) !== null)
      )
        near = true;
  if (!near) return NORMAL_SPEED;
  const { tumblers, gears } = tuneClues(buf, tune);
  if (tumblers) {
    if (gears)
      say(ctx, 'music.tumblers_gears', {
        tumblers: countMsg('tumbler', tumblers),
        gears: countMsg('gear', gears),
      });
    else say(ctx, 'music.tumblers', { tumblers: countMsg('tumbler', tumblers) });
  } else if (gears) {
    say(ctx, 'music.gears', { gears: countMsg('gear', gears) });
    // could only get `gears == 5' by playing five correct notes followed by excess;
    // otherwise, tune would have matched above
    if (gears === 5) setUheardTune(ctx, 2);
  }
  return NORMAL_SPEED;
}
