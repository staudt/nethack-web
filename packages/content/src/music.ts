// Playing a musical instrument: the bugle, the only instrument of the port. Unless stunned,
// confused or hallucinating she is asked "Improvise?"; "no" plays the passtune ("Play the
// passtune?" once she knows it) or a typed tune of notes A-G, which opens or closes the Castle's
// drawbridge next to her when it is the right one, and otherwise gives the Mastermind clues
// (tumblers and gears).
// ref: src/music.c do_play_instrument(), do_improvisation(), improvised_notes(),
// awaken_soldiers(), awaken_scare(); src/mondata.c can_blow(); src/monmove.c onscary() (its
// <0,0> auditory case); src/hacklib.c mungspaces(), highc()
//
// Not ported (see DEVIATIONS.md): the other instruments, Deafness, being underwater, attribute
// exercise, Hero_playnotes() (sound), achievements, vault guards, monster strategies
// (STRAT_WAITMASK), and the scare exemptions for the Wizard, minions, Angels and the Riders
// (none exist here).
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
import { hasHead, verysmall } from './mondata';
import { monflee } from './monflee';
import { unfreezeMonst } from './mstate';
import { xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { P, hasProp, isStrangled } from './props';
import { heroForm } from './upoly';

export const BUGLE: DefId = 'nh:bugle';

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
  if (
    form &&
    (form.sound === 'silent' || form.sound === 'buzz') &&
    (form.flags.includes('breathless') ||
      verysmall(form) ||
      !hasHead(form) ||
      form.glyph.ch === ';')
  )
    return false;
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
  if (!scary) return;
  const def = ctx.defs.monster(mon.def);
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

/**
 * Improvising on the bugle: the opening line by the hero's state (stunned, confused,
 * hallucinating; half the time several of them read as one), then the bugle's call.
 * ref: src/music.c do_improvisation()
 */
function doImprovisation(ctx: Ctx, instr: Entity): void {
  const h = getPlayer(ctx.state);
  const stunned = hasProp(h, P.STUNNED);
  const confused = hasProp(h, P.CONFUSION);
  const halluc = hasProp(h, P.HALLUC);
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
  const sameOldSong = improvisedNotes(ctx);
  // the bugle: awaken and attract soldiers
  say(ctx, sameOldSong ? 'music.bugle_familiar' : 'music.bugle', { item });
  awakenSoldiers(ctx);
}

/** The step of do_play_instrument() a question belongs to. */
type MusicStep = 'improvise' | 'passtune' | 'tune';

const MUSIC_PROMPT: Readonly<Record<MusicStep, string>> = {
  improvise: 'music-improvise',
  passtune: 'music-passtune',
  tune: 'music-tune',
};

/** Asks the next question of do_play_instrument(); its answer comes back to `handler`. */
function askMusic(ctx: Ctx, handler: DefId, instr: Entity, step: MusicStep): void {
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
 * Applying an instrument: "You are incapable of playing the bugle." when she cannot blow; then
 * "Improvise?" (yes, no or cancel) unless she is stunned, confused or hallucinating, who always
 * improvise. Returns the energy used (0 while a question is pending: `handler` gets the answer).
 * ref: src/music.c do_play_instrument()
 */
export function doPlayInstrument(ctx: Ctx, instr: Entity, handler: DefId): number {
  if (!canBlow(ctx)) {
    say(ctx, 'music.incapable', { item: xnameOf(ctx.state, ctx.defs, instr) });
    return 0;
  }
  const h = getPlayer(ctx.state);
  if (!(hasProp(h, P.STUNNED) || hasProp(h, P.CONFUSION) || hasProp(h, P.HALLUC))) {
    askMusic(ctx, handler, instr, 'improvise');
    return 0;
  }
  doImprovisation(ctx, instr);
  return NORMAL_SPEED;
}

/**
 * The answers of do_play_instrument(): "Improvise?" yes improvises; no asks "Play the passtune?"
 * when she knows it (u.uevent.uheard_tune == 2), else the tune ("What tune are you playing? [5
 * notes, A-G]": spaces squeezed, letters raised, H read as B); a cancel anywhere is "Never
 * mind." and takes no time. ref: src/music.c do_play_instrument()
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
      if (value !== false) {
        doImprovisation(ctx, instr);
        return NORMAL_SPEED;
      }
      if (uheardTune(ctx) === 2) askMusic(ctx, handler, instr, 'passtune');
      else askMusic(ctx, handler, instr, 'tune');
      return 0;
    case 'passtune':
      if (value === null) return nevermind();
      if (value === true) return playTune(ctx, instr, castleTune(ctx));
      askMusic(ctx, handler, instr, 'tune');
      return 0;
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
 * Playing the notes `buf`: "You extract a strange sound from the bugle!" On the Castle, the
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
