// Writing with a magic marker: applying a marker writes a scroll or a spellbook on blank paper.
// ref: src/write.c dowrite(), cost(), write_ok(), new_book_description(); src/spell.c
// known_spell(); src/o_init.c observe_object() (oc_encountered)
//
// dowrite() is three steps over prompts: the paper (C's getobj("write on")), the type to write
// (getlin(); a `text` prompt), then the writing. The type is matched as 5.0 does: the actual
// name of an object of the paper's class, its label (a scroll's description), then what the
// hero called a type; a type she does not know is written only by its label once she has seen
// that label, or when Luck allows (rnl(15); rnl(5) for a Wizard's scroll or a spell going
// stale); a spellbook is written by name only.
// The port has no oc_encountered: a label counts as seen when the type is discovered or called,
// one is carried (or in a carried container), or one is remembered on a level's map
// (DEVIATIONS "Magic markers").
// Not ported: the novel (no such object), mail, the literate conduct, exercise(), dknown
// (objects are always seen up close: a blind hero's paper is never "unknown", see DEVIATIONS
// "Blindness").
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  rnl,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type ItemComponent,
  type Json,
  type Msg,
  type ObjectDef,
  type PromptOption,
} from '@nh/core';
import { wipeoutText } from './engr';
import { dropx, invOption } from './itemactions';
import { fingersOrGloves, isGlib } from './glib';
import { mksobj } from './items';
import { luckOf } from './luck';
import { useup } from './magic';
import { messagesEn } from './messages.en';
import { nohands } from './mondata';
import { mungspaces } from './objnam_read';
import { xnameOf } from './objnam';
import { discover, isKnown } from './o_init';
import { P, heroHas } from './props';
import { plname, checkUnpaid } from './shk';
import { KEEN, knownSpells } from './spell';
import { heroForm } from './upoly';
import { holdAnotherObject } from './wish';
import { roleIs } from './urole';

export const MAGIC_MARKER: DefId = 'nh:magic_marker';
const SCR_BLANK_PAPER: DefId = 'nh:scroll_of_blank_paper';
const SPE_BLANK_PAPER: DefId = 'nh:spellbook_of_blank_paper';
const SPE_BOOK_OF_THE_DEAD: DefId = 'nh:book_of_the_dead';
/** ref: include/global.h MAXULEV */
const MAXULEV = 30;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/** The base ink cost of a scroll by type. ref: src/write.c cost() */
const SCROLL_COST: Readonly<Record<string, number>> = {
  'nh:scroll_of_light': 8,
  'nh:scroll_of_gold_detection': 8,
  'nh:scroll_of_food_detection': 8,
  'nh:scroll_of_magic_mapping': 8,
  'nh:scroll_of_amnesia': 8,
  'nh:scroll_of_fire': 8,
  'nh:scroll_of_earth': 8,
  'nh:scroll_of_destroy_armor': 10,
  'nh:scroll_of_create_monster': 10,
  'nh:scroll_of_punishment': 10,
  'nh:scroll_of_confuse_monster': 12,
  'nh:scroll_of_identify': 14,
  'nh:scroll_of_enchant_armor': 16,
  'nh:scroll_of_remove_curse': 16,
  'nh:scroll_of_enchant_weapon': 16,
  'nh:scroll_of_charging': 16,
  'nh:scroll_of_scare_monster': 20,
  'nh:scroll_of_stinking_cloud': 20,
  'nh:scroll_of_taming': 20,
  'nh:scroll_of_teleportation': 20,
  'nh:scroll_of_genocide': 30,
};

/**
 * The base cost of writing a scroll or spellbook: a book's level times 10, a scroll's from the
 * table (another mod's scroll: 1000, C's fallback after "You can't write such a weird scroll!").
 * ref: src/write.c cost()
 */
export function writeCost(def: ObjectDef): number {
  if (def.class === 'spellbook') return 10 * (def.spellbook?.level ?? 0);
  return SCROLL_COST[def.id] ?? 1000;
}

/** Blank paper is suggested; other scrolls and books may be chosen. ref: src/write.c write_ok() */
const isBlank = (e: Entity): boolean => e.def === SCR_BLANK_PAPER || e.def === SPE_BLANK_PAPER;
const writable = (ctx: Ctx, e: Entity): boolean => {
  const c = ctx.defs.object(e.def).class;
  return c === 'scroll' || c === 'spellbook';
};

/** "scroll" or "spellbook" (the novel does not exist). */
const typeword = (ctx: Ctx, paper: Entity): string =>
  ctx.defs.object(paper.def).class === 'spellbook'
    ? '@write.typeword.spellbook'
    : '@write.typeword.scroll';

/** The prompts' data: the paper menu, then the type to write. */
interface WriteData {
  write: 'paper' | 'text';
  pen: EntityId;
  paper?: EntityId;
}

/** Whether the prompt data is dowrite()'s. */
export const isWriteData = (data: Json): boolean =>
  typeof data === 'object' &&
  data !== null &&
  !Array.isArray(data) &&
  typeof (data as { write?: unknown }).write === 'string';

/**
 * Applying a magic marker: no hands, then which paper ("You don't have anything to write on."
 * when she has no scroll or spellbook); the answer goes on in answerWrite(). Choosing takes no
 * time. ref: src/write.c dowrite()
 */
export function dowrite(ctx: Ctx, pen: Entity, handler: DefId): number {
  const form = heroForm(ctx);
  if (form && nohands(form)) {
    say(ctx, 'write.need_hands');
    return 0;
  }
  if (isGlib(ctx.state)) {
    say(ctx, 'glib.marker_slips', {
      item: xnameOf(ctx.state, ctx.defs, pen),
      fingers: fingersOrGloves(ctx, false),
    });
    dropx(ctx, pen);
    return NORMAL_SPEED;
  }
  const inv = inventoryOf(ctx.state, ctx.state.playerId).filter((e) => writable(ctx, e));
  if (inv.length === 0) {
    say(ctx, 'write.nothing');
    return 0;
  }
  const options: PromptOption[] = [
    ...inv.filter(isBlank).map((e) => invOption(ctx, e)),
    ...inv.filter((e) => !isBlank(e)).map((e) => invOption(ctx, e)),
  ];
  ctx.ask(
    { id: 'write-on', kind: 'menu', key: 'write.on_q', cancellable: true, options },
    handler,
    { write: 'paper', pen: pen.id } satisfies WriteData as unknown as Json,
  );
  return 0;
}

/** The answers of dowrite()'s prompts; returns the time taken. */
export function answerWrite(ctx: Ctx, value: Json, raw: Json, handler: DefId): number {
  const d = raw as unknown as WriteData;
  const pen = heroItem(ctx, d.pen);
  if (!pen || pen.def !== MAGIC_MARKER) return 0;
  if (d.write === 'paper') {
    const paper = heroItem(ctx, value);
    if (!paper || !writable(ctx, paper)) return 0; // cancelled: no time
    return choosePaper(ctx, pen, paper, handler);
  }
  const paper = heroItem(ctx, d.paper);
  if (!paper) return 0;
  return writeType(ctx, pen, paper, value);
}

/**
 * The paper chosen: blind, a spellbook cannot be written ("can't create braille text"); paper
 * that is not blank takes the move; else blank paper is discovered and the type is asked.
 * ref: src/write.c dowrite()
 */
function choosePaper(ctx: Ctx, pen: Entity, paper: Entity, handler: DefId): number {
  const type = typeword(ctx, paper);
  if (heroHas(ctx.state, P.BLINDED) && ctx.defs.object(paper.def).class === 'spellbook') {
    // can't write a magic book while blind (the paper is always dknown here)
    say(ctx, 'write.braille', { item: xnameOf(ctx.state, ctx.defs, pen) });
    return 0;
  }
  if (!isBlank(paper)) {
    say(ctx, 'write.not_blank', { type });
    return NORMAL_SPEED;
  }
  discover(ctx, SCR_BLANK_PAPER); // makeknown(SCR_BLANK_PAPER)
  ctx.ask(
    {
      id: 'write-what',
      kind: 'text',
      key: 'write.what_type',
      params: { type },
      cancellable: true,
      maxLength: 255,
    },
    handler,
    { write: 'text', pen: pen.id, paper: paper.id } satisfies WriteData as unknown as Json,
  );
  return 0;
}

/** One object of the paper's class as objects[] names it (OBJ_NAME, OBJ_DESCR, oc_uname). */
interface ObjNames {
  id: DefId;
  name: string;
  descr: string | null;
  uname: string | null;
}

const lc = (s: string): string => s.toLowerCase();
const dropPrefix = (s: string, p: string): string => (lc(s).startsWith(p) ? s.slice(p.length) : s);
const dropSuffix = (s: string, p: string): string =>
  lc(s).endsWith(p) && s.length > p.length ? s.slice(0, -p.length) : s;

/** The objects of a class with their names as objects[] spells them (English from the catalog). */
function classNames(ctx: Ctx, cls: 'scroll' | 'spellbook'): ObjNames[] {
  const called = (ctx.state.modData['nh'] as { called?: Record<string, string> } | undefined)
    ?.called;
  return ctx.defs.objects
    .filter((d) => d.class === cls)
    .map((d) => {
      const name = dropPrefix(messagesEn[d.nameKey] ?? d.id, `${cls} of `);
      const descr = labelText(ctx.state, ctx, d);
      const un = called?.[d.id];
      return { id: d.id, name, descr, uname: un !== undefined && un !== '' ? un : null };
    });
}

/**
 * The type's description as objects[] spells it ("FOOBIE BLETCH", "unlabeled", "parchment"):
 * this game's appearance or the fixed one. ref: OBJ_DESCR()
 */
function labelText(state: Readonly<GameState>, ctx: Ctx, d: ObjectDef): string | null {
  const app = state.appearances[d.id];
  const key =
    d.descKey ??
    (app !== undefined && ctx.defs.isAppearance(app) ? ctx.defs.appearance(app).nameKey : null);
  const text = key === null ? undefined : messagesEn[key];
  if (text === undefined) return null;
  return dropSuffix(dropSuffix(dropPrefix(text, 'scroll labeled '), ' scroll'), ' spellbook');
}

/** Whether an item is in her pack, directly or inside a carried container. */
function heldByHero(state: Readonly<GameState>, e: Entity): boolean {
  let cur: Entity | undefined = e;
  for (let i = 0; cur && i < 100; i++) {
    const it: ItemComponent | undefined = cur.c.item;
    if (!it) return false;
    if (it.carriedBy === state.playerId) return true;
    if (it.containedIn === undefined) return false;
    cur = state.entities[String(it.containedIn)];
  }
  return false;
}

/**
 * Whether the hero has seen an object of this type (C's oc_encountered, set by
 * observe_object() and by naming the type): it is discovered or called, one is carried, or
 * one is remembered on the map of a level she has seen. The port keeps no history of what she
 * saw: one seen and since gone counts only once named (DEVIATIONS "Magic markers").
 */
export function encountered(state: Readonly<GameState>, ctx: Ctx, def: DefId): boolean {
  if (isKnown(state, ctx.defs, def)) return true;
  const called = (state.modData['nh'] as { called?: Record<string, string> } | undefined)?.called;
  if (called?.[def] !== undefined) return true;
  const app = state.appearances[def];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    if (e?.def === def && heldByHero(state, e)) return true;
  }
  for (const lev of Object.keys(state.objectMemory).sort()) {
    const mem = state.objectMemory[lev] ?? {};
    for (const cell of Object.keys(mem).sort())
      if (mem[cell] === def || (app !== undefined && mem[cell] === app)) return true;
  }
  return false;
}

/** How well she knows a spell. ref: src/spell.c known_spell() */
function knownSpell(ctx: Ctx, def: DefId): 'fresh' | 'stale' | 'forgotten' | 'unknown' {
  const s = knownSpells(ctx).find((k) => k.id === def);
  if (!s) return 'unknown';
  return s.retention > KEEN / 10 ? 'fresh' : s.retention > 0 ? 'stale' : 'forgotten';
}

/** C's bcsign(): blessed 1, cursed -1, else 0. */
const bcsign = (e: Entity): number =>
  e.c.item?.buc === 'blessed' ? 1 : e.c.item?.buc === 'cursed' ? -1 : 0;

/**
 * The type answer: find the type (name, label, called name), refuse blank paper and the Book of
 * the Dead and an unknown book by its label, bill the marker, check and spend the ink (drying
 * out), then the knowledge test (Luck), blindness, and the new scroll or book.
 * ref: src/write.c dowrite()
 */
function writeType(ctx: Ctx, pen: Entity, paper: Entity, value: Json): number {
  const pit = pen.c.item;
  const paperIt = paper.c.item;
  if (!pit || !paperIt) return 0;
  const cls = ctx.defs.object(paper.def).class === 'spellbook' ? 'spellbook' : 'scroll';
  const type = typeword(ctx, paper);
  // what to write: excess whitespace removed; Escape or nothing still takes the move
  let nm = typeof value === 'string' ? mungspaces(value) : '';
  if (!nm) return NORMAL_SPEED;
  if (lc(nm).startsWith('scroll ')) nm = nm.slice(7);
  else if (lc(nm).startsWith('spellbook ')) nm = nm.slice(10);
  if (lc(nm).startsWith('of ')) nm = nm.slice(3);
  const ar = lc(nm).indexOf(' armour');
  if (ar >= 0) nm = mungspaces(`${nm.slice(0, ar)} armor ${nm.slice(ar + 7)}`);
  const want = lc(nm);

  const objs = classNames(ctx, cls);
  let byDescr = false;
  let found: DefId | null = null;
  let deferred: DefId | null = null;
  let real: DefId | null = null;
  // first loop: look for match with name/description
  for (const o of objs) {
    if (lc(o.name) === want) {
      // spellbooks can only be written by_name, so no need to hold out for a 'better' by_descr
      // match
      if (isKnown(ctx.state, ctx.defs, o.id) || cls === 'spellbook') {
        found = o.id;
      } else {
        // save item in case there are no better by_descr matches
        real = deferred = o.id;
      }
      break;
    }
    if (o.descr !== null && lc(o.descr) === want) {
      byDescr = true;
      found = o.id;
      break;
    }
  }
  if (found === null) {
    // second loop: look for match with user-assigned name; several matches: each later one
    // replaces the choice with chance 1/n
    let deferralchance = 0;
    for (const o of objs) {
      if (
        o.uname !== null &&
        lc(o.uname) === want &&
        // prefer attempting to write the real scroll type if the typename clobbers a real
        // scroll and is known to be incorrect
        !(real !== null && isKnown(ctx.state, ctx.defs, o.id)) &&
        !ctx.rng.rn2(++deferralchance)
      ) {
        deferred = o.id;
        // writing by user-assigned name is same as by description
        byDescr = true;
      }
    }
    if (deferred === null) {
      say(ctx, 'write.no_such', { type });
      return NORMAL_SPEED;
    }
    found = deferred;
  }

  if (found === SCR_BLANK_PAPER || found === SPE_BLANK_PAPER) {
    say(ctx, 'write.cant_write');
    say(ctx, 'write.obscene');
    return NORMAL_SPEED;
  }
  if (found === SPE_BOOK_OF_THE_DEAD) {
    say(ctx, 'write.no_mere');
    return NORMAL_SPEED;
  }
  if (byDescr && cls === 'spellbook' && !isKnown(ctx.state, ctx.defs, found)) {
    // can't write unknown spellbooks by description
    say(ctx, 'write.no_info');
    return NORMAL_SPEED;
  }
  const def = ctx.defs.object(found);

  // shk imposes a flat rate per use, not based on actual charges used
  checkUnpaid(ctx, pen);

  // see if there's enough ink
  const basecost = writeCost(def);
  if (pit.spe < Math.trunc(basecost / 2)) {
    say(ctx, 'write.too_dry');
    return NORMAL_SPEED;
  }
  // we're really going to write now, so calculate cost
  const half = Math.trunc(basecost / 2);
  const actualcost = ctx.rng.rn2(half) + half; // rn1(basecost / 2, basecost / 2)
  const curseval = bcsign(pen) + bcsign(paper);
  // dry out marker
  if (pit.spe < actualcost) {
    pit.spe = 0;
    say(ctx, 'write.dries_out');
    // scrolls disappear, spellbooks don't
    if (cls === 'spellbook') say(ctx, 'write.book_fades');
    else {
      say(ctx, 'write.scroll_useless');
      useup(ctx, paper.id);
    }
    return NORMAL_SPEED;
  }
  pit.spe -= actualcost;

  // Writing by name requires that the hero knows the type; by description, that she has seen
  // the label; a book also by fresh knowledge of the spell; Luck might override after the
  // previous checks have failed.
  const knowledge = cls === 'spellbook' ? knownSpell(ctx, found) : 'unknown';
  const wizard = roleIs(ctx.state, 'wizard');
  if (
    !isKnown(ctx.state, ctx.defs, found) &&
    !(byDescr && encountered(ctx.state, ctx, found)) &&
    knowledge !== 'fresh' &&
    rnl(
      ctx.rng,
      (wizard && cls !== 'spellbook') || knowledge === 'stale' ? 5 : 15,
      luckOf(ctx.state),
    )
  ) {
    say(ctx, byDescr ? 'write.fail' : 'write.dont_know');
    // scrolls disappear, spellbooks don't
    if (cls === 'spellbook') say(ctx, 'write.diary');
    else {
      const ulevel = getPlayer(ctx.state).c.experience?.level ?? 1;
      const text: Msg | string = byDescr
        ? `"${wipeoutText(ctx.rng, labelText(ctx.state, ctx, def) ?? '', Math.trunc((6 + MAXULEV - ulevel) / 6))}"`
        : { key: 'write.was_here', params: { name: plname(ctx) } };
      say(ctx, 'write.wrote', { text });
      useup(ctx, paper.id);
    }
    return NORMAL_SPEED;
  }
  // can write scrolls when blind, but requires luck too; attempts to write books when blind are
  // caught above
  if (heroHas(ctx.state, P.BLINDED) && rnl(ctx.rng, 3, luckOf(ctx.state))) {
    say(ctx, 'write.blind_fail');
    useup(ctx, paper.id);
    return NORMAL_SPEED;
  }

  const bknown = paperIt.known.buc && pit.known.buc;
  // use up old scroll / spellbook
  useup(ctx, paper.id);
  // success
  if (cls === 'spellbook') {
    // acknowledge the change in the object's description...
    const app = ctx.state.appearances[found];
    say(ctx, 'write.warps', { descr: `@write.descr.${app ?? def.descKey ?? found}` });
  }
  const newId = mksobj(ctx, def, { init: false });
  const nit = ctx.state.entities[String(newId)]?.c.item;
  if (!nit) return NORMAL_SPEED;
  nit.known.buc = bknown;
  nit.buc = curseval > 0 ? 'blessed' : curseval < 0 ? 'cursed' : 'uncursed';
  holdAnotherObject(ctx, newId, {
    key: 'write.oops',
    params: { item: xnameOf(ctx.state, ctx.defs, ctx.state.entities[String(newId)]!) },
  });
  return NORMAL_SPEED;
}
