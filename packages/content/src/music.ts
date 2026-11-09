// Playing a musical instrument: the bugle, the only instrument of the port.
// ref: src/music.c do_play_instrument(), do_improvisation(), improvised_notes(),
// awaken_soldiers(), awaken_scare(); src/mondata.c can_blow(); src/monmove.c onscary() (its
// <0,0> auditory case)
//
// Not ported (see DEVIATIONS.md): the other instruments, playing a tune (there is no drawbridge,
// so "Improvise?" is always answered yes and not asked), Deafness, being underwater, attribute
// exercise, Hero_playnotes() (sound), vault guards, monster strategies (STRAT_WAITMASK), and the
// scare exemptions for the Wizard, minions, Angels and the Riders (none exist here).
import {
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
} from '@nh/core';
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

/**
 * Applying an instrument. Returns whether it took time. ref: src/music.c do_play_instrument()
 */
export function doPlayInstrument(ctx: Ctx, instr: Entity): boolean {
  if (!canBlow(ctx)) {
    say(ctx, 'music.incapable', { item: xnameOf(ctx.state, ctx.defs, instr) });
    return false;
  }
  doImprovisation(ctx, instr);
  return true;
}
