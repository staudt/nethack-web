// Casting spells: the `Z` command, the checks before a cast and the effects of the spells.
// ref: src/spell.c docast(), getspell(), rejectcasting(), spelleffects_check(),
// spell_backfire(), spelleffects(), throwspell(), spell_aim_step(),
// can_center_spell_location(), cast_protection(); src/timeout.c nh_timeout() (spell
// protection); src/apply.c jump() (the spell of jumping, jump.ts); src/detect.c
// monster_detect(); src/dog.c make_familiar() (dog.ts)
//
// The spells that duplicate wands go through zap.ts weffectsFrom() with a spell source, those
// that duplicate scrolls through read.ts seffectsSpell(), those that duplicate potions through
// potion.ts peffectsSpell(); detection is detectobj.ts. Chain lightning is not ported (ROADMAP).
import {
  NORMAL_SPEED,
  cellRules,
  getLevel,
  getPlayer,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type ModApi,
  type Msg,
} from '@nh/core';
import { monsterIdAt } from './combat';
import { monsterDetect } from './detect';
import { doVicinityMapSpell } from './detectobj';
import { makeFamiliar } from './dog';
import { isSwallowed } from './engulfstate';
import { explode } from './explode';
import { uhimKey } from './gender';
import { askPosition, positionAnswer } from './getpos';
import { hcolor } from './hcolor';
import { losehp } from './hp';
import { isSick, morehungry } from './hunger';
import { uState } from './luck';
import { checkCapacity, strangeFeeling } from './magic';
import { heroSees } from './mongear';
import { canSpotMon } from './perception';
import { healup, peffectsSpell } from './potion';
import { freehand } from './pray';
import {
  P,
  clairvoyanceBlocked,
  hasProp,
  isStrangled,
  makeConfused,
  makeStunned,
  timeoutLeft,
  wornIn,
} from './props';
import { jump, jumpSpellDone, setJumpSpell, walkPath } from './jump';
import { litroom, seffectsSpell } from './read';
import { confuseMonster } from './seffect';
import { isSlimed, makeSlimed } from './slimestate';
import { P_EXPERT, P_SKILLED, skillLevel, useSkill } from './skills';
import { KEEN, knownSpells, spellEntry, spellet } from './spell';
import { percentSuccess, spellDamageBonus, spellLevPw, spellSkill } from './spellcalc';
import { findAc } from './stats';
import { T } from './terrain';
import { pwOf, setPw, setUspell, uspellOf } from './uenergy';
import { ZAP_DIRECTIONS, weffectsFrom, zapDirOf, zapyourself, type ZapDir } from './zap';

export const CAST_ID: DefId = 'nh:cast';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** The books whose spells can be cast: those of SPELL_INFO, in objects[] order (#wizcast's). */
export const CAST_BOOKS: readonly DefId[] = Object.freeze([
  'nh:spellbook_of_dig',
  'nh:spellbook_of_magic_missile',
  'nh:spellbook_of_fireball',
  'nh:spellbook_of_cone_of_cold',
  'nh:spellbook_of_sleep',
  'nh:spellbook_of_finger_of_death',
  'nh:spellbook_of_light',
  'nh:spellbook_of_detect_monsters',
  'nh:spellbook_of_healing',
  'nh:spellbook_of_knock',
  'nh:spellbook_of_force_bolt',
  'nh:spellbook_of_confuse_monster',
  'nh:spellbook_of_cure_blindness',
  'nh:spellbook_of_drain_life',
  'nh:spellbook_of_slow_monster',
  'nh:spellbook_of_wizard_lock',
  'nh:spellbook_of_create_monster',
  'nh:spellbook_of_detect_food',
  'nh:spellbook_of_cause_fear',
  'nh:spellbook_of_clairvoyance',
  'nh:spellbook_of_cure_sickness',
  'nh:spellbook_of_charm_monster',
  'nh:spellbook_of_haste_self',
  'nh:spellbook_of_detect_unseen',
  'nh:spellbook_of_levitation',
  'nh:spellbook_of_extra_healing',
  'nh:spellbook_of_restore_ability',
  'nh:spellbook_of_invisibility',
  'nh:spellbook_of_detect_treasure',
  'nh:spellbook_of_remove_curse',
  'nh:spellbook_of_magic_mapping',
  'nh:spellbook_of_identify',
  'nh:spellbook_of_turn_undead',
  'nh:spellbook_of_polymorph',
  'nh:spellbook_of_teleport_away',
  'nh:spellbook_of_create_familiar',
  'nh:spellbook_of_cancellation',
  'nh:spellbook_of_protection',
  'nh:spellbook_of_jumping',
  'nh:spellbook_of_stone_to_flesh',
]);

const isCastBook = (book: DefId): boolean => CAST_BOOKS.includes(book);

/** Skilled or better in the book's school: the pseudo object is blessed. */
const skilled = (ctx: Ctx, book: DefId): boolean => skillLevel(ctx, spellSkill(book)) >= P_SKILLED;

/**
 * The effect of each spell (the switch of spelleffects()): a function, 'direction' for the
 * spells that duplicate wand effects and ask a direction (weffects() with the pseudo object),
 * 'throw' for fireball and cone of cold at Skilled (asks where), or 'jump' for jumping, which
 * asks where to land.
 */
function effectOf(ctx: Ctx, book: DefId): ((ctx: Ctx) => void) | 'direction' | 'throw' | 'jump' {
  switch (book) {
    case 'nh:spellbook_of_fireball':
    case 'nh:spellbook_of_cone_of_cold':
      if (skilled(ctx, book)) return 'throw';
      return 'direction'; // else a ray, as the wand
    case 'nh:spellbook_of_force_bolt':
    case 'nh:spellbook_of_sleep':
    case 'nh:spellbook_of_magic_missile':
    case 'nh:spellbook_of_knock':
    case 'nh:spellbook_of_slow_monster':
    case 'nh:spellbook_of_wizard_lock':
    case 'nh:spellbook_of_dig':
    case 'nh:spellbook_of_turn_undead':
    case 'nh:spellbook_of_polymorph':
    case 'nh:spellbook_of_teleport_away':
    case 'nh:spellbook_of_cancellation':
    case 'nh:spellbook_of_finger_of_death':
    case 'nh:spellbook_of_healing':
    case 'nh:spellbook_of_extra_healing':
    case 'nh:spellbook_of_drain_life':
    case 'nh:spellbook_of_stone_to_flesh':
      return 'direction';
    case 'nh:spellbook_of_light':
      // ref: spelleffects() -> weffects() -> zapnodir(): litroom(TRUE, obj) (the pseudo object
      // is never blessed for light); lightdamage() is not ported
      return (c) => litroom(c, true, false);
    case 'nh:spellbook_of_detect_unseen':
      // ref: weffects() -> zapnodir(): findit()
      return (c) => weffectsFrom(c, { kind: 'spell', otyp: book, blessed: false }, null);
    case 'nh:spellbook_of_confuse_monster':
      // ref: spelleffects(): a duplicate of the scroll's effect, the pseudo object blessed at
      // Skilled (the skill is read before this cast practises it)
      return (c) => confuseMonster(c, skilled(c, book), false, false);
    case 'nh:spellbook_of_remove_curse':
    case 'nh:spellbook_of_detect_food':
    case 'nh:spellbook_of_cause_fear':
    case 'nh:spellbook_of_identify':
    case 'nh:spellbook_of_charm_monster':
      // duplicates of scroll effects, blessed at Skilled
      return (c) => seffectsSpell(c, book, skilled(c, book));
    case 'nh:spellbook_of_magic_mapping':
    case 'nh:spellbook_of_create_monster':
      return (c) => seffectsSpell(c, book, false);
    case 'nh:spellbook_of_detect_monsters':
      // ref: spelleffects() -> peffects() -> peffect_monster_detection(): the blessed (Skilled)
      // timed branch is not ported (decision 8: as uncursed)
      return castMonsterDetect;
    case 'nh:spellbook_of_haste_self':
    case 'nh:spellbook_of_detect_treasure':
    case 'nh:spellbook_of_levitation':
    case 'nh:spellbook_of_restore_ability':
      // duplicates of potion effects, blessed at Skilled
      return (c) => peffectsSpell(c, book, skilled(c, book));
    case 'nh:spellbook_of_invisibility':
      return (c) => peffectsSpell(c, book, false);
    case 'nh:spellbook_of_cure_blindness':
      return (c) => healup(c, 0, 0, false, true);
    case 'nh:spellbook_of_cure_sickness':
      return castCureSickness;
    case 'nh:spellbook_of_create_familiar':
      return (c) => {
        const p = hero(c).c.pos;
        if (p) makeFamiliar(c, p.x, p.y);
      };
    case 'nh:spellbook_of_clairvoyance':
      return (c) => {
        if (!clairvoyanceBlocked(c.state)) doVicinityMapSpell(c, skilled(c, book));
        // at present, only one thing blocks clairvoyance
        else say(c, 'cast.pointy_hat');
      };
    case 'nh:spellbook_of_protection':
      return castProtection;
    case 'nh:spellbook_of_jumping':
      return 'jump';
    default:
      return () => undefined;
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
  if (uhunger <= 10 && book !== 'nh:spellbook_of_detect_food') {
    say(ctx, 'cast.too_hungry');
    return 0;
  }
  if ((h.c.attributes?.str ?? 10) < 4 && book !== 'nh:spellbook_of_restore_ability') {
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
  if (book !== 'nh:spellbook_of_detect_food') {
    // don't put her (quite) into fainting from casting a spell
    let hungr = energy * 2;
    if (hungr > uhunger - 3) hungr = uhunger - 3;
    morehungry(ctx, hungr);
  }

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
  const effect = effectOf(ctx, book);
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
      (book === 'nh:spellbook_of_healing' || book === 'nh:spellbook_of_extra_healing') &&
      skilled(ctx, book);
    const data: CastDirection = { book, blessed, force };
    ctx.ask(
      { id: CAST_DIRECTION, kind: 'direction', key: 'zap.direction', options: [...ZAP_DIRECTIONS] },
      CAST_ID,
      data as unknown as Json,
    );
    return 0;
  }
  if (effect === 'jump') {
    // ref: spelleffects() SPE_JUMPING: jump(max(role_skill, 1)), "Nothing happens." when she
    // did not jump; the position prompt's answer (jump.ts) finishes the cast
    const used = jump(ctx, Math.max(skillLevel(ctx, spellSkill(book)), 1), { force });
    return used === null ? 0 : jumpSpellDone(ctx, used, force);
  }
  if (effect === 'throw') {
    if (throwspell(ctx, book, force)) return 0; // the position prompt finishes the cast
    if (!force) useSkill(ctx, spellSkill(book), spellLevel(ctx, book));
    return NORMAL_SPEED;
  }
  effect(ctx);
  // gain skill for successful cast
  if (!force) useSkill(ctx, spellSkill(book), spellLevel(ctx, book));
  // an identify menu is waiting: the move is spent when it is answered (nh:read)
  return ctx.state.pendingPrompt ? 0 : NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// fireball and cone of cold at Skilled

/** The pending thrown spell, kept in the position prompt's data. */
interface CastThrow {
  throwBook: DefId;
  force: boolean;
}

const isCastThrow = (data: Json): boolean =>
  typeof data === 'object' && data !== null && !Array.isArray(data) && 'throwBook' in data;

/** The walls and stone a thrown spell cannot centre on. ref: rm.h IS_STWALL() */
const isStwall = (ctx: Ctx, x: number, y: number): boolean => {
  const level = getLevel(ctx.state);
  const t = level.palette[level.cells[y * level.width + x] ?? 0];
  return t !== undefined && STWALL.includes(t);
};

const distmin = (a: { x: number; y: number }, x: number, y: number): number =>
  Math.max(Math.abs(a.x - x), Math.abs(a.y - y));

/** ref: src/spell.c can_center_spell_location(): within 10, seen, not a wall or stone */
function canCenterSpell(ctx: Ctx, x: number, y: number): boolean {
  const p = hero(ctx).c.pos;
  const level = getLevel(ctx.state);
  if (!p || x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  if (distmin(p, x, y) > 10) return false;
  return heroSees(ctx, { level: level.id, x, y }) && !isStwall(ctx, x, y);
}

/**
 * "Where do you want to cast the spell?": the position prompt, with the cells it can centre on
 * highlighted. ref: src/spell.c throwspell() (the prompt half; no water levels)
 */
function throwspell(ctx: Ctx, book: DefId, force: boolean): boolean {
  const p = hero(ctx).c.pos;
  if (!p) return false;
  const valid: { x: number; y: number }[] = [];
  for (let dx = -10; dx <= 10; dx++)
    for (let dy = -10; dy <= 10; dy++)
      if ((dx || dy) && canCenterSpell(ctx, p.x + dx, p.y + dy))
        valid.push({ x: p.x + dx, y: p.y + dy });
  const data: CastThrow = { throwBook: book, force };
  askPosition(ctx, 'cast.where', CAST_ID, data as unknown as Json, {
    id: 'cast-throw',
    start: { x: p.x, y: p.y },
    valid,
  });
  return true;
}

/**
 * The spot is answered: too far, "The spell dissipates over the distance!"; swallowed, "The
 * spell is cut short!" and it goes off at herself; not seen (and no monster spotted there) or a
 * wall, "Your mind fails to lock onto that location!"; else the path stops before anything a
 * zap cannot cross, and rnd(8) + 1 explosions of `u.ulevel / 2 + 1` (with the Intelligence
 * bonus) go off there and around (the next one 1 square off at random, back on the spot when
 * that cannot be seen). Cancelled, nothing happens; either way the energy is gone, the move is
 * spent and the school is practised. ref: src/spell.c throwspell(), spell_aim_step(),
 * spelleffects() SPE_FIREBALL / SPE_CONE_OF_COLD
 */
function castThrown(ctx: Ctx, value: Json, ct: CastThrow): number {
  const book = ct.throwBook;
  const fire = book === 'nh:spellbook_of_fireball';
  const p = hero(ctx).c.pos;
  const at = positionAnswer(value);
  let target: { x: number; y: number } | null = null;
  if (p && at) {
    const level = getLevel(ctx.state);
    const mon = monsterIdAt(ctx, at, level.id);
    const monEnt = mon !== null ? ctx.state.entities[String(mon)] : undefined;
    if (distmin(p, at.x, at.y) > 10) say(ctx, 'cast.dissipates');
    else if (isSwallowed(ctx)) {
      say(ctx, 'cast.cut_short');
      target = { x: -1, y: -1 }; // u.dx = u.dy = 0: at herself
    } else if (
      ((at.x !== p.x || at.y !== p.y) &&
        !heroSees(ctx, { level: level.id, x: at.x, y: at.y }) &&
        !(monEnt && canSpotMon(ctx, monEnt))) ||
      isStwall(ctx, at.x, at.y)
    )
      say(ctx, 'cast.mind_fails');
    else {
      const rules = cellRules(level, ctx.defs);
      // spell_aim_step(): ZAP_POS() or an open door
      target = walkPath(p, at, (x, y) => {
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
        const t = level.cells[y * level.width + x] ?? 0;
        return rules.passable[t] === true && !rules.closedDoor[t];
      }).at;
    }
  }
  if (target) {
    const cc = { ...target };
    let n = ctx.rng.rnd(8) + 1;
    let cur = { ...target };
    while (n--) {
      if (cur.x < 0) {
        const damage = zapyourself(ctx, { kind: 'spell', otyp: book, blessed: false });
        if (damage) losehp(ctx, damage, uhimKey(ctx.state, '!@killer.zap.self.spell'));
      } else {
        const lvl = hero(ctx).c.experience?.level ?? 1;
        explode(
          ctx,
          cur.x,
          cur.y,
          { spell: fire ? 'fire' : 'cold', by: 'hero' },
          spellDamageBonus(ctx.state, Math.trunc(lvl / 2) + 1),
          fire ? 'fiery' : 'frosty',
        );
      }
      if (ctx.state.gameOver) return NORMAL_SPEED;
      cur = { x: cc.x + ctx.rng.rnd(3) - 2, y: cc.y + ctx.rng.rnd(3) - 2 };
      const level = getLevel(ctx.state);
      if (
        cc.x < 0 ||
        cur.x < 0 ||
        cur.y < 0 ||
        cur.x >= level.width ||
        cur.y >= level.height ||
        !heroSees(ctx, { level: level.id, x: cur.x, y: cur.y }) ||
        isStwall(ctx, cur.x, cur.y) ||
        isSwallowed(ctx)
      )
        cur = { ...cc }; // spell is reflected back to center
    }
  }
  // gain skill for successful cast
  if (!ct.force && !ctx.state.gameOver) useSkill(ctx, spellSkill(book), spellLevel(ctx, book));
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
  // getdir() -> confdir(): an impaired hero casts in a random direction (not up or down)
  let dir: ZapDir | undefined = zapDirOf(ctx, value);
  if (dir === undefined) {
    say(ctx, 'cast.energy_released');
    dir = 'self';
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
 * Detect monsters, as the spell's object would: on a level without monsters, "You feel
 * threatened." (a beginner's strange feeling). ref: src/detect.c monster_detect()
 */
function castMonsterDetect(ctx: Ctx): void {
  if (!monsterDetect(ctx)) return;
  const halluc = hasProp(hero(ctx), P.HALLUC);
  strangeFeeling(ctx, null, halluc ? 'cast.heebie_jeebies' : 'spell.threatened');
}

/**
 * Cure sickness: "You are no longer ill." (or "You are not ill." with no slime either) and "The
 * slime disappears!" ref: src/spell.c spelleffects() SPE_CURE_SICKNESS
 */
function castCureSickness(ctx: Ctx): void {
  const wasSick = isSick(ctx);
  const wasSlimed = isSlimed(ctx.state);
  // cure conditions (which updates status) before feedback
  healup(ctx, 0, 0, true, false);
  if (wasSick || !wasSlimed) say(ctx, wasSick ? 'cast.no_longer_ill' : 'cast.not_ill');
  if (wasSlimed) makeSlimed(ctx, 0, 'cast.slime_disappears');
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
    if (isCastThrow(data)) return castThrown(ctx, value, data as unknown as CastThrow);
    if (isCastDirection(data)) return castAtDirection(ctx, value, data as unknown as CastDirection);
    if (typeof value !== 'number') return 0; // dismissed
    const s = knownSpells(ctx)[value];
    return s ? spelleffects(ctx, s.id, false) : 0;
  },
};

export const CAST_ACTIONS: readonly ActionDef[] = [castAction];

export function registerCast(api: ModApi): void {
  for (const a of CAST_ACTIONS) api.defineAction(a);
  // #jump without Jumping casts a fresh spell of jumping (ref: src/apply.c jump())
  setJumpSpell((ctx) => spelleffects(ctx, 'nh:spellbook_of_jumping', false));
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
