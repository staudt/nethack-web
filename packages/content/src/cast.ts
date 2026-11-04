// Casting spells: the `Z` command, the checks before a cast and the effects of the spells of the
// subset. ref: src/spell.c docast(), getspell(), rejectcasting(), spelleffects_check(),
// spell_backfire(), spelleffects(), cast_protection(); src/timeout.c nh_timeout() (spell
// protection); src/detect.c monster_detect(); src/zap.c zapnodir() (light)
//
// Force bolt, sleep, healing and confuse monster are listed and can be picked, but their effects
// come with the next steps of milestone 7a: picking one says "Nothing happens." and costs
// nothing.
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type ModApi,
  type Msg,
} from '@nh/core';
import { hcolor } from './hcolor';
import { morehungry } from './hunger';
import { uState } from './luck';
import { checkCapacity, strangeFeeling } from './magic';
import { healup } from './potion';
import { freehand } from './pray';
import { P, hasProp, isStrangled, makeConfused, makeStunned, timeoutLeft, wornIn } from './props';
import { litroom } from './read';
import { P_EXPERT, skillLevel, useSkill } from './skills';
import { KEEN, knownSpells, spellEntry, spellet } from './spell';
import { percentSuccess, spellLevPw, spellSkill } from './spellcalc';
import { findAc } from './stats';
import { T } from './terrain';
import { pwOf, setPw, setUspell, uspellOf } from './uenergy';

export const CAST_ID: DefId = 'nh:cast';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** The books whose spells can be cast (those of the subset). */
type CastBook =
  | 'nh:spellbook_of_force_bolt'
  | 'nh:spellbook_of_sleep'
  | 'nh:spellbook_of_healing'
  | 'nh:spellbook_of_confuse_monster'
  | 'nh:spellbook_of_light'
  | 'nh:spellbook_of_detect_monsters'
  | 'nh:spellbook_of_cure_blindness'
  | 'nh:spellbook_of_protection';

const CAST_BOOKS: readonly CastBook[] = [
  'nh:spellbook_of_force_bolt',
  'nh:spellbook_of_sleep',
  'nh:spellbook_of_healing',
  'nh:spellbook_of_confuse_monster',
  'nh:spellbook_of_light',
  'nh:spellbook_of_detect_monsters',
  'nh:spellbook_of_cure_blindness',
  'nh:spellbook_of_protection',
];

const isCastBook = (book: DefId): book is CastBook =>
  (CAST_BOOKS as readonly string[]).includes(book);

/**
 * The effect of each spell (the switch of spelleffects()); null for the spells whose effect is
 * not ported yet (force bolt, sleep and healing come with the wand refactor, confuse monster
 * with monster confusion).
 */
function effectOf(book: CastBook): ((ctx: Ctx) => void) | null {
  switch (book) {
    case 'nh:spellbook_of_force_bolt':
    case 'nh:spellbook_of_sleep':
    case 'nh:spellbook_of_healing':
    case 'nh:spellbook_of_confuse_monster':
      return null;
    case 'nh:spellbook_of_light':
      // ref: spelleffects() -> weffects() -> zapnodir(): litroom(TRUE, obj) (the pseudo object
      // is never blessed for light); lightdamage() is not ported
      return (ctx) => litroom(ctx, true, false);
    case 'nh:spellbook_of_detect_monsters':
      // ref: spelleffects() -> peffects() -> peffect_monster_detection(): the blessed (Skilled)
      // timed branch is not ported, no role here reaches Skilled in divination
      return monsterDetect;
    case 'nh:spellbook_of_cure_blindness':
      return (ctx) => healup(ctx, 0, 0, false, true);
    case 'nh:spellbook_of_protection':
      return castProtection;
  }
}

// ---------------------------------------------------------------------------------------------
// the checks

/**
 * True (with the message) when the hero cannot cast at all: stunned, strangled or without a free
 * hand (a quarterstaff in welded hands still lets her cast). ref: src/spell.c rejectcasting(),
 * can_chant()
 */
function rejectcasting(ctx: Ctx): boolean {
  const h = hero(ctx);
  if (hasProp(h, P.STUNNED)) {
    say(ctx, 'cast.too_impaired');
    return true;
  }
  if (isStrangled(h)) {
    say(ctx, 'cast.cant_chant');
    return true;
  }
  if (!freehand(ctx) && wornIn(ctx.state, h.id, 'weapon')?.def !== 'nh:quarterstaff') {
    say(ctx, 'cast.arms_not_free');
    return true;
  }
  return false;
}

/** Casting a forgotten spell: confusion and stun. ref: src/spell.c spell_backfire() */
function spellBackfire(ctx: Ctx, book: DefId): void {
  const h = hero(ctx);
  const duration = (spellLevel(ctx, book) + 1) * 3; // 6..24
  const oldStun = timeoutLeft(ctx.state, h, P.STUNNED);
  const oldConf = timeoutLeft(ctx.state, h, P.CONFUSION);
  switch (ctx.rng.rn2(10)) {
    case 0:
    case 1:
    case 2:
    case 3:
      makeConfused(ctx, oldConf + duration, false); // 40%
      break;
    case 4:
    case 5:
    case 6:
      makeConfused(ctx, oldConf + Math.trunc((2 * duration) / 3), false); // 30%
      makeStunned(ctx, oldStun + Math.trunc(duration / 3), false);
      break;
    case 7:
    case 8:
      makeStunned(ctx, oldStun + Math.trunc((2 * duration) / 3), false); // 20%
      makeConfused(ctx, oldConf + Math.trunc(duration / 3), false);
      break;
    default:
      makeStunned(ctx, oldStun + duration, false); // 10%
      break;
  }
}

const spellLevel = (ctx: Pick<Ctx, 'defs'>, book: DefId): number =>
  ctx.defs.object(book).spellbook?.level ?? 1;

/**
 * The checks before a cast, with their costs. Returns the energy used when the cast stops here
 * (0: no time passes), or null when the spell goes off. ref: src/spell.c spelleffects_check().
 * No Amulet of Yendor exists, so its drain never happens; only a Wizard's Intelligence lowers
 * the hunger cost, and the hero is a Valkyrie.
 */
function spelleffectsCheck(ctx: Ctx, book: DefId): number | null {
  if (rejectcasting(ctx)) return 0;
  const energy = spellLevPw(spellLevel(ctx, book)); // 5 <= energy <= 35
  const know = knownSpells(ctx).find((s) => s.id === book)?.retention ?? 0;
  if (know <= 0) {
    say(ctx, 'cast.twisted');
    say(ctx, 'cast.nightmarish');
    spellBackfire(ctx, book);
    setPw(ctx, { uen: Math.max(pwOf(ctx.state).uen - ctx.rng.rnd(energy), 0) });
    return NORMAL_SPEED;
  } else if (know <= KEEN / 200) {
    say(ctx, 'cast.strain'); // 100 turns left
  } else if (know <= KEEN / 40) {
    say(ctx, 'cast.difficulty'); // 500 turns left
  } else if (know <= KEEN / 20) {
    say(ctx, 'cast.growing_faint'); // 1000 turns left
  } else if (know <= KEEN / 10) {
    say(ctx, 'cast.fading'); // 2000 turns left
  }

  const h = hero(ctx);
  const uhunger = h.c.hunger?.nutrition ?? 900;
  if (uhunger <= 10) {
    say(ctx, 'cast.too_hungry');
    return 0;
  }
  if ((h.c.attributes?.str ?? 10) < 4) {
    say(ctx, 'cast.lack_strength');
    return 0;
  }
  if (checkCapacity(ctx, 'cast.concentration')) return NORMAL_SPEED;

  const pw = pwOf(ctx.state);
  if (energy > pw.uen) {
    // "yet": she never had enough; "anymore": she once had enough but lost some
    say(
      ctx,
      pw.uen < pw.uenmax
        ? 'cast.no_energy'
        : energy > pw.uenpeak
          ? 'cast.no_energy_yet'
          : 'cast.no_energy_anymore',
    );
    return 0;
  }
  // don't put her (quite) into fainting from casting a spell
  let hungr = energy * 2;
  if (hungr > uhunger - 3) hungr = uhunger - 3;
  morehungry(ctx, hungr);

  const chance = percentSuccess(ctx.state, ctx.defs, book);
  if (hasProp(h, P.CONFUSION) || ctx.rng.rnd(100) > chance) {
    say(ctx, 'cast.fail');
    setPw(ctx, { uen: pwOf(ctx.state).uen - Math.trunc(energy / 2) });
    return NORMAL_SPEED;
  }
  return null;
}

/**
 * Casts the spell of `book`: the checks (unless `force`, as #wizcast), the energy, the effect and
 * the skill practice. Returns the energy used. ref: src/spell.c spelleffects()
 */
export function spelleffects(ctx: Ctx, book: DefId, force: boolean): number {
  const effect = isCastBook(book) ? effectOf(book) : null;
  if (!effect) {
    say(ctx, 'cast.not_yet');
    return 0;
  }
  let energy = 0;
  if (!force) {
    const res = spelleffectsCheck(ctx, book);
    if (res !== null) return res;
    energy = spellLevPw(spellLevel(ctx, book));
  }
  setPw(ctx, { uen: pwOf(ctx.state).uen - energy });
  // exercise(A_WIS, TRUE) is not ported
  effect(ctx);
  // gain skill for successful cast
  if (!force) useSkill(ctx, spellSkill(book), spellLevel(ctx, book));
  return NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// the effects

/**
 * Detect monsters: every monster of the level goes into the hero's monster memory at its cell
 * (it stays shown until the cell is seen again, where NetHack redraws the map after
 * browse_map()); on a level without monsters, "You feel threatened." (a beginner's strange
 * feeling). ref: src/detect.c monster_detect() with an uncursed object and no class
 */
function monsterDetect(ctx: Ctx): void {
  const level = getLevel(ctx.state);
  const mons: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (!e?.c.monster || id === ctx.state.playerId || e.c.pos?.level !== level.id) continue;
    mons.push(e);
  }
  if (mons.length === 0) {
    const halluc = hasProp(hero(ctx), P.HALLUC);
    strangeFeeling(ctx, null, halluc ? 'cast.heebie_jeebies' : 'spell.threatened');
    return;
  }
  const memory = (ctx.state.monsterMemory[level.id] ??= {});
  for (const e of mons) {
    const p = e.c.pos;
    if (p) memory[String(p.y * level.width + p.x)] = e.def;
  }
  say(ctx, 'cast.sense_monsters');
}

/** The wall and stone terrain around which the haze shimmers in "stone". ref: rm.h IS_STWALL() */
const STWALL: readonly DefId[] = [
  T.stone,
  T.vwall,
  T.hwall,
  T.tlcorn,
  T.trcorn,
  T.blcorn,
  T.brcorn,
  T.tuwall,
  T.tdwall,
  T.tlwall,
  T.trwall,
  T.crwall,
];

/** What the golden haze shimmers in: the hero's terrain (no engulfing, water or clouds here). */
function atmosphere(ctx: Ctx): string {
  const pos = hero(ctx).c.pos;
  const level = getLevel(ctx.state);
  const typ = pos ? level.palette[level.cells[pos.y * level.width + pos.x] ?? 0] : undefined;
  if (typ === T.tree) return 'cast.atmosphere.vegetation';
  if (typ !== undefined && STWALL.includes(typ)) return 'cast.atmosphere.stone';
  return 'cast.atmosphere.air';
}

/**
 * The protection spell: spell protection grows by less the more she already has and the better
 * her natural AC. ref: src/spell.c cast_protection()
 */
export function castProtection(ctx: Ctx): void {
  const h = hero(ctx);
  const us = uspellOf(ctx.state);
  let l = h.c.experience?.level ?? 1;
  let loglev = 0;
  // loglev = log2(u.ulevel) + 1 (1..5)
  while (l) {
    loglev++;
    l = Math.trunc(l / 2);
  }
  // u.uac counts u.uspellprot already, so adding it back gives the natural AC
  let natac = findAc(ctx.state, ctx.defs, h.id) + us.uspellprot;
  natac = Math.trunc((10 - natac) / 10); // convert to positive and scale down
  const gain = loglev - Math.trunc(us.uspellprot / (4 - Math.min(3, natac)));
  if (gain <= 0) {
    say(ctx, 'cast.skin_warm');
    return;
  }
  if (!hasProp(h, P.BLINDED)) {
    const color = hcolor(ctx, 'golden');
    if (us.uspellprot) say(ctx, 'cast.haze_denser', { color });
    else say(ctx, 'cast.haze_begin', { atmosphere: { key: atmosphere(ctx) }, color });
  }
  const uspmtime = skillLevel(ctx, spellSkill('nh:spellbook_of_protection')) === P_EXPERT ? 20 : 10;
  setUspell(ctx, {
    uspellprot: us.uspellprot + gain,
    uspmtime,
    usptime: us.usptime || uspmtime,
  });
}

// ---------------------------------------------------------------------------------------------
// the command

/**
 * `Z`: picks a known spell from the menu and casts it. Offered on the hero once she knows a
 * spell. ref: src/spell.c docast(), getspell(), dospellmenu(SPELLMENU_CAST); the menu is always
 * used (no "Cast which spell?" letter prompt) and can be dismissed at no cost.
 */
const castAction: ActionDef = {
  id: CAST_ID,
  labelKey: 'action.nh:cast',
  handles: 'mod',
  offer: (ctx, target) =>
    target.kind === 'self' && knownSpells(ctx).length > 0
      ? [{ action: { type: 'mod', action: CAST_ID }, labelKey: 'action.nh:cast' }]
      : [],
  perform(ctx) {
    const spells = knownSpells(ctx);
    if (spells.length === 0) {
      say(ctx, 'spell.none');
      return 0;
    }
    if (rejectcasting(ctx)) return 0;
    ctx.ask(
      {
        id: 'cast-menu',
        kind: 'menu',
        key: 'cast.choose',
        cancellable: true,
        options: spells.map((s, i) => {
          const row = spellEntry(ctx, s, i);
          return { value: i, key: row.key, params: row.params ?? {}, letter: spellet(i) };
        }),
      },
      CAST_ID,
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    if (typeof value !== 'number') return 0; // dismissed
    const s = knownSpells(ctx)[value];
    return s ? spelleffects(ctx, s.id, false) : 0;
  },
};

export const CAST_ACTIONS: readonly ActionDef[] = [castAction];

export function registerCast(api: ModApi): void {
  for (const a of CAST_ACTIONS) api.defineAction(a);
  // ref: src/timeout.c nh_timeout(): "Dissipate spell-based protection." (after the
  // `u.uinvulnerable` return)
  api.on('endOfTurn', (ctx) => {
    if (uState(ctx.state).uinvulnerable) return;
    const us = uspellOf(ctx.state);
    if (!us.usptime) return;
    us.usptime--;
    if (us.usptime === 0 && us.uspellprot) {
      us.usptime = us.uspmtime;
      us.uspellprot--;
      if (!hasProp(hero(ctx), P.BLINDED))
        say(ctx, us.uspellprot ? 'cast.haze_less_dense' : 'cast.haze_disappears', {
          color: hcolor(ctx, 'golden'),
        });
    }
    setUspell(ctx, us);
  });
}
