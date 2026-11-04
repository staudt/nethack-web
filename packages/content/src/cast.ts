// Casting spells: the `Z` command, the checks before a cast and the effects of the spells of the
// subset. ref: src/spell.c docast(), getspell(), rejectcasting(), spelleffects_check(),
// spell_backfire(), spelleffects(), cast_protection(); src/timeout.c nh_timeout() (spell
// protection); src/detect.c monster_detect(); src/zap.c zapnodir() (light), weffects() and
// zapyourself() (force bolt, sleep, healing); src/read.c seffect_confuse_monster()
import {
  DIR_LIST,
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type Json,
  type ModApi,
  type Msg,
} from '@nh/core';
import { confdir, getdirImpaired, uMaybeImpaired } from './hackmove';
import { hcolor } from './hcolor';
import { morehungry } from './hunger';
import { uState } from './luck';
import { checkCapacity, strangeFeeling } from './magic';
import { healup } from './potion';
import { freehand } from './pray';
import { P, hasProp, isStrangled, makeConfused, makeStunned, timeoutLeft, wornIn } from './props';
import { litroom } from './read';
import { P_EXPERT, P_SKILLED, skillLevel, useSkill } from './skills';
import { KEEN, knownSpells, spellEntry, spellet } from './spell';
import { percentSuccess, spellLevPw, spellSkill } from './spellcalc';
import { findAc } from './stats';
import { T } from './terrain';
import { pwOf, setPw, setUspell, uspellOf } from './uenergy';
import { ZAP_DIRECTIONS, weffectsFrom } from './zap';

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

/** The books of the subset, in objects[] order (the order #wizcast lists them). */
export const CAST_BOOKS: readonly CastBook[] = [
  'nh:spellbook_of_sleep',
  'nh:spellbook_of_light',
  'nh:spellbook_of_detect_monsters',
  'nh:spellbook_of_healing',
  'nh:spellbook_of_force_bolt',
  'nh:spellbook_of_confuse_monster',
  'nh:spellbook_of_cure_blindness',
  'nh:spellbook_of_protection',
];

const isCastBook = (book: DefId): book is CastBook =>
  (CAST_BOOKS as readonly string[]).includes(book);

/**
 * The effect of each spell (the switch of spelleffects()): a function, or 'direction' for the
 * spells that duplicate wand effects and ask a direction (weffects() with the pseudo object).
 */
function effectOf(book: CastBook): ((ctx: Ctx) => void) | 'direction' {
  switch (book) {
    case 'nh:spellbook_of_force_bolt':
    case 'nh:spellbook_of_sleep':
    case 'nh:spellbook_of_healing':
      return 'direction';
    case 'nh:spellbook_of_confuse_monster':
      // ref: spelleffects(): a duplicate of the scroll's effect, the pseudo object blessed at
      // Skilled (the skill is read before this cast practises it)
      return (ctx) => confuseMonsterSpell(ctx, skillLevel(ctx, spellSkill(book)) >= P_SKILLED);
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
 * the skill practice. Returns the time used: 0 while a directional spell asks its direction
 * (the energy is spent already; {@link castAtDirection} finishes the cast).
 * ref: src/spell.c spelleffects()
 */
export function spelleffects(ctx: Ctx, book: DefId, force: boolean): number {
  if (!isCastBook(book)) return 0; // knownSpells() only holds books of the subset
  const effect = effectOf(book);
  let energy = 0;
  if (!force) {
    const res = spelleffectsCheck(ctx, book);
    if (res !== null) return res;
    energy = spellLevPw(spellLevel(ctx, book));
  }
  setPw(ctx, { uen: pwOf(ctx.state).uen - energy });
  // exercise(A_WIS, TRUE) is not ported
  if (effect === 'direction') {
    // healing is a potion effect extended to take a direction like wands: the pseudo object is
    // blessed at Skilled (it cures blindness)
    const blessed =
      book === 'nh:spellbook_of_healing' && skillLevel(ctx, spellSkill(book)) >= P_SKILLED;
    const data: CastDirection = { book, blessed, force };
    ctx.ask(
      { id: CAST_DIRECTION, kind: 'direction', key: 'zap.direction', options: [...ZAP_DIRECTIONS] },
      CAST_ID,
      data as unknown as Json,
    );
    return 0;
  }
  effect(ctx);
  // gain skill for successful cast
  if (!force) useSkill(ctx, spellSkill(book), spellLevel(ctx, book));
  return NORMAL_SPEED;
}

const CAST_DIRECTION = 'cast-direction';

/** The pending directional cast, kept in the direction prompt's data. */
interface CastDirection {
  book: DefId;
  /** the pseudo object's blessing (healing at Skilled) */
  blessed: boolean;
  force: boolean;
}

const isCastDirection = (data: Json): boolean =>
  typeof data === 'object' && data !== null && !Array.isArray(data) && 'book' in data;

/**
 * The direction is answered: the spell goes off as the wand it duplicates; dismissing the
 * prompt releases the energy at herself (NetHack reuses the last direction, which the port does
 * not keep). Then the school is practised. ref: src/spell.c spelleffects() getdir() .. weffects()
 */
function castAtDirection(ctx: Ctx, value: Json, cd: CastDirection): number {
  const picked: Dir | 'self' | undefined =
    value === 'self' ? 'self' : DIR_LIST.find((d) => d === value);
  let dir: Dir | 'self';
  if (!picked) {
    say(ctx, 'cast.energy_released');
    dir = 'self';
  } else {
    // getdir() -> confdir(): an impaired hero casts in a random direction
    dir =
      picked === 'self'
        ? uMaybeImpaired(ctx)
          ? confdir(ctx)
          : 'self'
        : getdirImpaired(ctx, picked);
  }
  weffectsFrom(ctx, { kind: 'spell', otyp: cd.book, blessed: cd.blessed }, dir);
  // gain skill for successful cast
  if (!cd.force && !ctx.state.gameOver)
    useSkill(ctx, spellSkill(cd.book), spellLevel(ctx, cd.book));
  return NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// the effects

/**
 * Confuse monster: the hero's hands glow red (umconf charges, 1-2 more, 2-9 blessed; one more
 * once she has 40), and her next hand-to-hand hits confuse monsters (combat.ts). Confused (only
 * reachable by a forced cast: a confused cast fails), the glow is purple and confuses her more;
 * blessed, it cures her confusion. Blind, she feels a tingle. The hero is always human and the
 * spell's pseudo object is never cursed, so the "You feel confused." branch is not ported.
 * ref: src/read.c seffect_confuse_monster()
 */
export function confuseMonsterSpell(ctx: Ctx, blessed: boolean): void {
  const h = hero(ctx);
  const altfeedback = hasProp(h, P.BLINDED); // Blind || Invisible (no hero invisibility)
  if (hasProp(h, P.CONFUSION)) {
    if (!blessed) {
      if (altfeedback) say(ctx, 'cast.hands_begin_tingle');
      else say(ctx, 'cast.hands_begin_glow', { color: hcolor(ctx, 'purple') });
      makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + ctx.rng.rnd(100), false);
    } else {
      if (altfeedback) say(ctx, 'cast.head_buzz');
      else say(ctx, 'cast.head_glow', { color: hcolor(ctx, 'red') });
      makeConfused(ctx, 0, true);
    }
    return;
  }
  const { umconf } = uspellOf(ctx.state);
  let incr = 0; // scroll vs spell: a scroll adds 3
  if (!blessed) {
    if (altfeedback) say(ctx, umconf ? 'cast.hands_tingle_more' : 'cast.hands_tingle');
    else if (!umconf) say(ctx, 'cast.hands_begin_glow', { color: hcolor(ctx, 'red') });
    else say(ctx, 'cast.glow_intensifies', { color: hcolor(ctx, 'red') });
    incr += ctx.rng.rnd(2);
  } else {
    if (altfeedback) say(ctx, umconf ? 'cast.hands_sharply_more' : 'cast.hands_sharply');
    else
      say(ctx, umconf ? 'cast.hands_brilliant_more' : 'cast.hands_brilliant', {
        color: hcolor(ctx, 'red'),
      });
    incr += ctx.rng.rn2(8) + 2; // rn1(8, 2)
  }
  // after a while, repeated uses become less effective
  if (umconf >= 40) incr = 1;
  setUspell(ctx, { umconf: umconf + incr });
}

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
  answer(ctx, value, data) {
    if (isCastDirection(data)) return castAtDirection(ctx, value, data as unknown as CastDirection);
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
