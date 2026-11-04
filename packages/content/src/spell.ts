// Spellbooks: studying them and the spells the hero knows. Casting is in cast.ts.
// ref: src/spell.c study_book(), learn(), cursed_book(), confused_book(), age_spells(),
// dovspell(), spellretention(); src/read.c doread() (the spellbook branch); src/wizard.c
// aggravate(); src/sit.c take_gold(); src/allmain.c stop_occupation()
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type ModApi,
  type Msg,
  type ObjectDef,
} from '@nh/core';
import { monsterNearby } from './eat';
import { erodeObj } from './erode';
import { losehp, losestr } from './hp';
import { nhData, removeFromInventory } from './items';
import { useup } from './magic';
import { unfreezeMonst, isFrozen } from './mstate';
import { nomul } from './nomul';
import { discover, isKnown } from './o_init';
import { P, hasProp, makeBlinded, makeConfused, timeoutLeft, wornIn } from './props';
import { P_BASIC, P_EXPERT, P_SKILLED, P_UNSKILLED, skillLevel } from './skills';
import { percentSuccess, spellSchoolKey, spellSkill } from './spellcalc';

export const LEARN_ID: DefId = 'nh:learn';
export const SPELLS_ID: DefId = 'nh:spells';

/** Spell retention period, in turns. ref: src/spell.c KEEN */
export const KEEN = 20000;
/** How many times a book can be studied. ref: include/spell.h MAX_SPELL_STUDY */
const MAX_SPELL_STUDY = 3;
export const BLANK_PAPER: DefId = 'nh:spellbook_of_blank_paper';

/** One entry of spl_book[]: the book type and the turns left before it is forgotten (sp_know). */
export interface KnownSpell {
  id: DefId;
  retention: number;
}

/** context.spbook: the book being studied and the study delay (negative, counting up to 0). */
interface Spbook {
  book: EntityId | null;
  delay: number;
}

interface SpellData {
  /** svs.spl_book[], in the order learned (spell letters a, b, ...). */
  spells?: KnownSpell[];
  spbook?: Spbook;
  /** obj->spestudied by item id: how many times each book has been studied. */
  spestudied?: Record<string, number>;
}

const spellData = (ctx: Pick<Ctx, 'state'>): SpellData => nhData(ctx) as unknown as SpellData;
const readData = (ctx: Pick<Ctx, 'state'>): SpellData | undefined =>
  ctx.state.modData['nh'] as unknown as SpellData | undefined;

/** The spells the hero knows, in spl_book order. */
export const knownSpells = (ctx: Pick<Ctx, 'state'>): readonly KnownSpell[] =>
  readData(ctx)?.spells ?? [];

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const levelOf = (def: ObjectDef): number => def.spellbook?.level ?? 0;
const spellName = (id: DefId): Msg => ({ key: `spell.name.${id}` });

/** ref: spell.c spellet(): a..z then A..Z */
export const spellet = (i: number): string =>
  i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i - 26);

const studied = (ctx: Pick<Ctx, 'state'>, id: EntityId): number =>
  readData(ctx)?.spestudied?.[String(id)] ?? 0;

function setStudied(ctx: Pick<Ctx, 'state'>, id: EntityId, n: number): void {
  const d = spellData(ctx);
  (d.spestudied ??= {})[String(id)] = n;
}

function spbookOf(ctx: Pick<Ctx, 'state'>): Spbook {
  const d = spellData(ctx);
  return (d.spbook ??= { book: null, delay: 0 });
}

const heroBook = (ctx: Pick<Ctx, 'state'>, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

// ---------------------------------------------------------------------------------------------
// failures

/** ref: src/wizard.c aggravate(): wakes the monsters of the level (no Wizard's Tower here) */
function aggravate(ctx: Ctx): void {
  const level = hero(ctx).c.pos?.level;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const m = e?.c.monster;
    if (!e || !m || e.c.pos?.level !== level) continue;
    m.asleep = false;
    if (isFrozen(ctx, id) && !ctx.rng.rn2(5)) unfreezeMonst(ctx, id);
  }
}

/** ref: src/sit.c take_gold() */
function takeGold(ctx: Ctx): void {
  let lost = false;
  for (const o of inventoryOf(ctx.state, ctx.state.playerId)) {
    if (ctx.defs.object(o.def).class !== 'coin') continue;
    lost = true;
    removeFromInventory(ctx, o.id);
    ctx.remove(o.id);
  }
  say(ctx, lost ? 'spell.no_gold' : 'spell.strange_sensation');
}

/**
 * The effect of a failed study. Returns true when the book is destroyed (the caller uses it up).
 * ref: src/spell.c cursed_book(): `switch (rn2(level))`. The teleport (case 0) is not ported:
 * only its message is given. Spell levels are at most 7, so the default case (rndcurse) never
 * happens.
 */
function cursedBook(ctx: Ctx, book: Entity): boolean {
  const lev = levelOf(ctx.defs.object(book.def));
  const h = hero(ctx);
  switch (ctx.rng.rn2(Math.max(lev, 1))) {
    case 0:
      say(ctx, 'spell.wrenching'); // tele(): not ported
      break;
    case 1:
      say(ctx, 'spell.threatened');
      aggravate(ctx);
      break;
    case 2:
      makeBlinded(ctx, timeoutLeft(ctx.state, h, P.BLINDED) + ctx.rng.rn2(100) + 250, true);
      break;
    case 3:
      takeGold(ctx);
      break;
    case 4:
      say(ctx, 'spell.too_much');
      makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + ctx.rng.rn2(7) + 16, false);
      break;
    case 5: {
      say(ctx, 'spell.contact_poison');
      const gloves = wornIn(ctx.state, h.id, 'gloves');
      if (gloves) {
        erodeObj(ctx, gloves, { key: 'kind.gloves' }, 'corrode', { verbose: true });
        break;
      }
      // poison_strdmg()
      const res = hasProp(h, P.POISON_RES);
      const strloss = res ? ctx.rng.rn2(2) + 1 : ctx.rng.rn2(4) + 3;
      const dmg = ctx.rng.rnd(res ? 6 : 10);
      losestr(ctx, strloss, '@killer.contact_poisoned_spellbook');
      if (!ctx.state.gameOver) losehp(ctx, dmg, '@killer.contact_poisoned_spellbook');
      break;
    }
    case 6:
      if (hasProp(h, P.ANTIMAGIC)) say(ctx, 'spell.explodes_unharmed');
      else {
        say(ctx, 'spell.explodes');
        losehp(ctx, 2 * ctx.rng.rnd(10) + 5, '@killer.exploding_rune');
      }
      return true;
    default:
      break;
  }
  return false;
}

/** Study while confused: true if the book is destroyed. ref: src/spell.c confused_book() */
function confusedBook(ctx: Ctx, book: Entity): boolean {
  if (!ctx.rng.rn2(3)) {
    say(ctx, 'spell.confused_tear');
    say(ctx, 'spell.tear');
    useup(ctx, book.id); // trycall() is not ported
    return true;
  }
  say(ctx, spbookOf(ctx).book === book.id ? 'spell.over_and_over_next' : 'spell.over_and_over');
  return false;
}

// ---------------------------------------------------------------------------------------------
// study_book()

/** Starts (or keeps) the learn() occupation. */
function setLearning(ctx: Ctx, book: Entity): void {
  spbookOf(ctx).book = book.id;
  ctx.state.occupation = { action: { type: 'mod', action: LEARN_ID }, data: { study: true } };
}

/** The study delay of a book. ref: study_book() `switch (objects[booktype].oc_level)` */
function studyDelay(def: ObjectDef): number {
  const lev = levelOf(def);
  if (lev <= 2) return -def.delay;
  if (lev <= 4) return -(lev - 1) * def.delay;
  if (lev <= 6) return -lev * def.delay;
  return -8 * def.delay;
}

interface StudyAsk {
  stage: 'spell-refresh' | 'spell-difficult';
  book: EntityId;
}

/**
 * Reads a spellbook: the `nh:read` action's spellbook branch. Returns the energy used; it may
 * start the learn occupation or ask a question. ref: src/read.c doread(), src/spell.c study_book()
 */
export function studyBook(ctx: Ctx, book: Entity): number {
  const h = hero(ctx);
  const def = ctx.defs.object(book.def);
  // ref: doread(): "Being blind, you cannot read the mystic runes."
  if (hasProp(h, P.BLINDED)) {
    say(ctx, 'spell.blind');
    return 0;
  }
  const confused = hasProp(h, P.CONFUSION);
  const sp = spbookOf(ctx);
  // attempting to read a dull book may make the hero fall asleep
  if (
    !confused &&
    !hasProp(h, P.SLEEP_RES) &&
    ctx.state.appearances[def.id] === 'nh:dull_spellbook'
  ) {
    let dullbook = ctx.rng.rnd(25) - (h.c.attributes?.wis ?? 10);
    // adjust chance if hero stayed awake, got interrupted, retries
    if (sp.delay && sp.book === book.id) dullbook -= ctx.rng.rnd(levelOf(def));
    if (dullbook > 0) {
      say(ctx, 'spell.dull');
      dullbook += ctx.rng.rnd(2 * levelOf(def));
      // fall_asleep(-dullbook, TRUE)
      return NORMAL_SPEED + nomul(ctx, dullbook, 'helpless.asleep', { key: 'eat.wake_up' });
    }
  }

  if (sp.delay && !confused && sp.book === book.id && def.id !== BLANK_PAPER) {
    say(ctx, 'spell.continue');
    setLearning(ctx, book);
    return NORMAL_SPEED;
  }
  if (def.id === BLANK_PAPER) {
    say(ctx, 'spell.blank');
    discover(ctx, def);
    return NORMAL_SPEED;
  }
  sp.delay = studyDelay(def);

  // check to see if we already know it and want to refresh our memory
  const known = knownSpells(ctx).find((s) => s.id === def.id);
  if (known && known.retention > KEEN / 10) {
    say(ctx, 'spell.know_well', { spell: spellName(def.id) });
    discover(ctx, def);
    const data: StudyAsk = { stage: 'spell-refresh', book: book.id };
    ctx.ask(
      { id: 'spell-refresh', kind: 'yn', key: 'spell.refresh_q' },
      'nh:read',
      data as unknown as Json,
    );
    return 0;
  }
  return studyChecks(ctx, book);
}

/** The read ability for an uncursed book. ref: study_book() (no lenses in this port) */
function readAbility(ctx: Ctx, def: ObjectDef): number {
  const h = hero(ctx);
  const int = h.c.attributes?.int ?? 10;
  const ulevel = h.c.experience?.level ?? 1;
  return int + 4 + Math.trunc(ulevel / 2) - 2 * levelOf(def);
}

/** "Books are often wiser than their readers": the difficulty check. ref: study_book() */
function studyChecks(ctx: Ctx, book: Entity): number {
  const it = book.c.item;
  if (!it) return 0;
  if (it.buc === 'uncursed') {
    const def = ctx.defs.object(book.def);
    const ability = readAbility(ctx, def);
    const confused = hasProp(hero(ctx), P.CONFUSION);
    // only wizards know if a spell is too difficult
    if (hero(ctx).c.player?.role === 'nh:wizard' && ability < 20 && !confused) {
      const data: StudyAsk = { stage: 'spell-difficult', book: book.id };
      ctx.ask(
        {
          id: 'spell-difficult',
          kind: 'yn',
          key: ability < 12 ? 'spell.very_difficult_q' : 'spell.difficult_q',
        },
        'nh:read',
        data as unknown as Json,
      );
      return 0;
    }
  }
  return studyRoll(ctx, book);
}

/** The roll and its outcome: failure, confusion or the start of the study. ref: study_book() */
function studyRoll(ctx: Ctx, book: Entity): number {
  const it = book.c.item;
  if (!it) return 0;
  const def = ctx.defs.object(book.def);
  let tooHard = false;
  if (it.buc === 'cursed') tooHard = true;
  else if (it.buc === 'uncursed' && ctx.rng.rnd(20) > readAbility(ctx, def)) tooHard = true;

  if (tooHard) {
    const gone = cursedBook(ctx, book);
    const extra = studyTime(ctx);
    if (gone || !ctx.rng.rn2(3)) {
      if (!gone) say(ctx, 'spell.crumbles');
      useup(ctx, book.id); // trycall() is not ported
    }
    return NORMAL_SPEED + extra;
  }
  if (hasProp(hero(ctx), P.CONFUSION)) {
    confusedBook(ctx, book);
    return NORMAL_SPEED + studyTime(ctx);
  }
  say(ctx, 'spell.begin');
  setLearning(ctx, book);
  return NORMAL_SPEED;
}

/** `nomul(context.spbook.delay)` "reading a book", then the delay is cleared. */
function studyTime(ctx: Ctx): number {
  const sp = spbookOf(ctx);
  const turns = -sp.delay;
  sp.delay = 0;
  return nomul(ctx, turns, 'helpless.reading_book', { key: 'eat.can_move_again' });
}

/** Answers to the refresh and difficulty questions (routed through `nh:read`). */
export function answerStudy(ctx: Ctx, value: Json, raw: Json): number {
  const data = raw as unknown as StudyAsk;
  const book = heroBook(ctx, data.book);
  if (!book) return 0;
  if (data.stage === 'spell-refresh') return value === true ? studyChecks(ctx, book) : 0;
  // "This spellbook is difficult to comprehend. Continue?" 'n' still takes the move
  return value === true ? studyRoll(ctx, book) : NORMAL_SPEED;
}

export const isStudyAsk = (raw: Json): boolean => {
  const s = (raw as { stage?: unknown } | null)?.stage;
  return s === 'spell-refresh' || s === 'spell-difficult';
};

// ---------------------------------------------------------------------------------------------
// learn()

/** The study occupation's next turn. Returns whether it goes on, and extra energy used. */
function learn(ctx: Ctx): { busy: boolean; extra: number } {
  const sp = spbookOf(ctx);
  const book = heroBook(ctx, sp.book);
  if (!book) {
    sp.book = null;
    return { busy: false, extra: 0 };
  }
  if (hasProp(hero(ctx), P.CONFUSION)) {
    // became confused while learning
    confusedBook(ctx, book);
    sp.book = null; // no longer studying
    return { busy: false, extra: studyTime(ctx) }; // remaining delay is uninterrupted
  }
  if (sp.delay) {
    sp.delay++; // not if (delay++), so at end delay == 0
    return { busy: true, extra: 0 };
  }
  let def = ctx.defs.object(book.def);
  const quoted: Msg = {
    key: isKnown(ctx.state, ctx.defs, def) ? 'spell.quoted' : 'spell.the_spell',
    params: { name: spellName(def.id) },
  };
  const d = spellData(ctx);
  const spells = (d.spells ??= []);
  const i = spells.findIndex((s) => s.id === def.id);
  let faded = false;
  if (i >= 0) {
    const s = spells[i];
    // a normal book can be read and re-read a total of 4 times
    if (studied(ctx, book.id) > MAX_SPELL_STUDY) {
      say(ctx, 'spell.too_faint');
      faded = true;
    } else if (s) {
      say(ctx, s.retention ? 'spell.keener' : 'spell.restored', { spell: quoted });
      s.retention = KEEN + 1; // incrnknow(i, 1)
      setStudied(ctx, book.id, studied(ctx, book.id) + 1);
    }
  } else if (studied(ctx, book.id) >= MAX_SPELL_STUDY) {
    say(ctx, 'spell.too_faint_once');
    faded = true;
  } else {
    spells.push({ id: def.id, retention: KEEN + 1 });
    setStudied(ctx, book.id, studied(ctx, book.id) + 1);
    if (spells.length === 1) say(ctx, 'spell.learn', { spell: quoted });
    else say(ctx, 'spell.add', { spell: quoted, letter: spellet(spells.length - 1) });
  }
  if (faded) {
    book.def = BLANK_PAPER;
    def = ctx.defs.object(BLANK_PAPER);
    // reset spestudied as if polymorph had taken place
    setStudied(ctx, book.id, ctx.rng.rn2(studied(ctx, book.id)));
  }
  discover(ctx, def); // makeknown()

  if (book.c.item?.buc === 'cursed' && cursedBook(ctx, book)) {
    // maybe a demon cursed it
    useup(ctx, book.id);
  }
  sp.book = null;
  return { busy: false, extra: 0 };
}

/** The study occupation ('continue'). ref: src/spell.c learn() as set_occupation(learn, "studying") */
const learnAction: ActionDef = {
  id: LEARN_ID,
  labelKey: 'action.nh:learn',
  handles: 'mod',
  offer: () => [],
  perform(ctx) {
    if (heroBook(ctx, readData(ctx)?.spbook?.book) === null) {
      ctx.state.occupation = null;
      return 0; // nothing to study (the book is gone)
    }
    const r = learn(ctx);
    if (!r.busy) ctx.state.occupation = null;
    return NORMAL_SPEED + r.extra;
  },
  continues: (ctx) => continuesStudy(ctx, true),
};

/**
 * Whether the study goes on. After each move of the occupation a hostile monster next to the
 * hero stops it ("You stop studying."); the book and delay are kept, so reading it again resumes.
 * ref: src/allmain.c moveloop_core() `if (monster_nearby()) stop_occupation()`
 */
export function continuesStudy(ctx: Ctx, checkMonsters: boolean): boolean {
  const occ = ctx.state.occupation?.action;
  if (occ?.type !== 'mod' || occ.action !== LEARN_ID) return false;
  if (checkMonsters && monsterNearby(ctx)) {
    say(ctx, 'spell.stop');
    ctx.interrupt();
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// dovspell()

/**
 * The retention column: "100%", "(gone)" or a range whose width depends on the skill.
 * ref: src/spell.c spellretention()
 */
export function spellRetention(ctx: Pick<Ctx, 'state'>, s: KnownSpell): Msg {
  const turnsleft = s.retention;
  if (turnsleft < 1) return { key: 'spell.gone' };
  if (turnsleft >= KEEN) return { key: 'spell.percent', params: { n: 100 } };
  const skill = Math.max(skillLevel(ctx, spellSkill(s.id)), P_UNSKILLED);
  let percent = Math.trunc((turnsleft - 1) / (KEEN / 100)) + 1;
  const accuracy = skill === P_EXPERT ? 2 : skill === P_SKILLED ? 5 : skill === P_BASIC ? 10 : 25;
  percent = accuracy * (Math.trunc((percent - 1) / accuracy) + 1);
  return { key: 'spell.range', params: { lo: percent - accuracy + 1, hi: percent } };
}

/**
 * One row of the spell menus: letter, name, level, school, fail rate and retention.
 * ref: src/spell.c dospellmenu() (SPELLMENU_VIEW and SPELLMENU_CAST rows)
 */
export function spellEntry(ctx: Ctx, s: KnownSpell, i: number): Msg {
  return {
    key: 'spell.entry',
    params: {
      letter: spellet(i),
      spell: spellName(s.id),
      level: levelOf(ctx.defs.object(s.id)),
      school: { key: spellSchoolKey(s.id) },
      fail: 100 - percentSuccess(ctx.state, ctx.defs, s.id),
      retention: spellRetention(ctx, s),
    },
  };
}

/**
 * `+`: lists the known spells with their level, school, failure rate and retention. Viewing only
 * (no reordering). ref: src/spell.c dovspell(), dospellmenu(SPELLMENU_VIEW)
 */
const spellsAction: ActionDef = {
  id: SPELLS_ID,
  labelKey: 'action.nh:spells',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: SPELLS_ID }, labelKey: 'action.nh:spells' }]
      : [],
  perform(ctx) {
    const spells = knownSpells(ctx);
    if (spells.length === 0) {
      say(ctx, 'spell.none');
      return 0;
    }
    const items: Msg[] = [{ key: 'spell.header' }];
    spells.forEach((s, i) => items.push(spellEntry(ctx, s, i)));
    ctx.emit({ type: 'list', titleKey: 'spell.known_title', items });
    return 0;
  },
};

export const SPELL_ACTIONS: readonly ActionDef[] = [learnAction, spellsAction];

export function registerSpells(api: ModApi): void {
  for (const a of SPELL_ACTIONS) api.defineAction(a);
  api.on('endOfTurn', (ctx) => {
    const d = readData(ctx);
    if (!d) return;
    // ref: src/allmain.c moveloop_core() age_spells(): once per turn
    for (const s of d.spells ?? []) if (s.retention > 0) s.retention--;
    // ref: src/spell.c book_disappears(); obj->spestudied goes with its object
    if (d.spbook?.book != null && !ctx.state.entities[String(d.spbook.book)]) d.spbook.book = null;
    if (d.spestudied) {
      for (const k of Object.keys(d.spestudied).sort())
        if (!ctx.state.entities[k]) delete d.spestudied[k];
      if (Object.keys(d.spestudied).length === 0) delete d.spestudied;
    }
  });
}
