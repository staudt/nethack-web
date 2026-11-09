// Genocide: the scroll's prompts and effects, and the genocided species dying out (on this level
// at once, on another one when the hero arrives there).
// ref: src/read.c seffect_genocide(), do_genocide(), do_class_genocide(); src/mon.c
// kill_genocided_monsters(), kill_eggs(); src/polyself.c udeadinside(); src/do.c goto_level()
// (`kill_genocided_monsters()` on arrival)
//
// Not ported (see DEVIATIONS.md "Genocide"): extinction, chameleons, quest monsters' feedback,
// the vampire shapeshifter's revert, class names ("dogs") in class genocide (a symbol or a monster
// name only), livelog and conduct, wizard mode's '*'. The hero's role monster (a Valkyrie) does
// not exist: a confused reader genocides her role by its id (not listed at the end), and a
// confused cursed reading sends in nothing.
import {
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Json,
  type ModApi,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { done } from './end';
import { EGG, deadSpecies, killEgg } from './eggstate';
import { makemon, rndmonst } from './generation';
import { adjalign, uState } from './luck';
import { messagesEn } from './messages.en';
import { mondead } from './mondeath';
import { nameToMon, nonliving } from './mondata';
import { mungspaces, wishNames } from './objnam_read';
import { P, hasProp } from './props';
import { heroForm, heroFormId, rehumanize, upolyOf } from './upoly';
import {
  genocidedIds,
  genocidedLines,
  isGenocided,
  setGenoKiller,
  setGenocided,
} from './vanquished';

/** do_genocide()'s `how` bits. ref: src/read.c REALLY, PLAYER */
export const REALLY = 1;
export const PLAYER = 2;

const HUMAN: DefId = 'nh:human';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** What a genocide prompt carries to its answer. */
export interface GenoData {
  stage: 'genocide' | 'class_genocide';
  /** do_genocide()'s how (REALLY, PLAYER); unused for a class. */
  how: number;
  /** The tries made so far (C's i / j). */
  tries: number;
}

export const isGenoAsk = (raw: Json): boolean => {
  const s = (raw as { stage?: unknown } | null)?.stage;
  return s === 'genocide' || s === 'class_genocide';
};

/** Your_Own_Race(): the hero is human (her role's monster does not exist). */
const yourOwn = (id: DefId): boolean => id === HUMAN;

/** The hero's role id, standing for her role's monster (u.umonster). */
const roleId = (ctx: Pick<Ctx, 'state'>): DefId =>
  getPlayer(ctx.state).c.player?.role ?? 'nh:valkyrie';

/**
 * How she feels inside after genociding her own kind while polymorphed: "dead" (living forms,
 * demons included), "condemned" (undead) or "empty" (vortices; no golems).
 * ref: src/polyself.c udeadinside()
 */
function udeadinside(ctx: Ctx): string {
  const form = heroForm(ctx);
  if (!form || !nonliving(form)) return 'genocide.inside.dead';
  return form.glyph.ch === 'v' ? 'genocide.inside.empty' : 'genocide.inside.condemned';
}

// ---------------------------------------------------------------------------------------------
// the dying out

/**
 * The genocided species' eggs stop hatching, wherever they are (C kills those of the level, the
 * hero's and the migrating ones at once, the rest on arrival: the same eggs end up dead).
 * ref: src/mon.c kill_eggs()
 */
function killEggs(ctx: Ctx): void {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.def === EGG && deadSpecies(ctx.state, ctx.defs, e.c.item?.corpseOf)) killEgg(ctx, id);
  }
}

/**
 * Every monster of a genocided species on the hero's level dies (mondead(): no corpse), and the
 * eggs of genocided species stop hatching. ref: src/mon.c kill_genocided_monsters()
 */
export function killGenocidedMonsters(ctx: Ctx): void {
  const lvl = ctx.state.currentLevel;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (!e?.c.monster || id === ctx.state.playerId || e.c.pos?.level !== lvl) continue;
    if (isGenocided(ctx.state, e.def)) mondead(ctx, id);
  }
  killEggs(ctx);
}

// ---------------------------------------------------------------------------------------------
// the prompts

function askGenocide(ctx: Ctx, data: GenoData): void {
  const cls = data.stage === 'class_genocide';
  ctx.ask(
    {
      id: cls ? 'genocide-class' : 'genocide',
      kind: 'text',
      key: `genocide.${cls ? 'class_prompt' : 'prompt'}${data.tries > 0 ? '_again' : ''}`,
      maxLength: 80,
    },
    'nh:read',
    data as unknown as Json,
  );
}

/** "?": the genocides so far, as #genocided shows them. ref: src/insight.c list_genocided() */
function listGenocided(ctx: Ctx): void {
  const lines = genocidedLines(ctx.state, ctx.defs);
  if (lines.length === 0) {
    say(ctx, 'genocide.none_yet');
    return;
  }
  say(ctx, 'end.genocided');
  for (const l of lines)
    ctx.emit({ type: 'msg', key: l.key, ...(l.params ? { params: l.params } : {}) });
}

const declines = (buf: string): boolean => {
  const b = buf.toLowerCase();
  return b === 'none' || b === "'none'" || b === 'nothing';
};

/**
 * Genocide (uncursed: how REALLY; cursed: 0, a reverse genocide; confused: PLAYER, the hero's own
 * kind without asking): asks for the type, or starts on the hero. ref: src/read.c do_genocide()
 */
export function doGenocide(ctx: Ctx, how: number): void {
  if (how & PLAYER) {
    genocideType(ctx, null, how, true);
    return;
  }
  askGenocide(ctx, { stage: 'genocide', how, tries: 0 });
}

/** Blessed genocide: asks for a class. ref: src/read.c do_class_genocide() */
export function doClassGenocide(ctx: Ctx): void {
  askGenocide(ctx, { stage: 'class_genocide', how: REALLY, tries: 0 });
}

const monsterNames = (ctx: Ctx) => wishNames(ctx.state, ctx.defs, messagesEn).monsters;

/** One answer to the type prompt; true when it asked again. ref: src/read.c do_genocide() loop */
function answerType(ctx: Ctx, value: Json, data: GenoData): boolean {
  const how = data.how;
  const retry = (): boolean => {
    data.tries++;
    if (data.tries >= 5) {
      // cursed effect => no free pass (unless rndmonst() fails)
      if (!(how & REALLY)) {
        const ptr = rndmonst(ctx, getLevel(ctx.state).depth);
        if (ptr) {
          genocideType(ctx, ptr, how, false);
          return false;
        }
      }
      say(ctx, 'genocide.enough_tries');
      return false;
    }
    askGenocide(ctx, data);
    return true;
  };
  const buf = typeof value === 'string' ? mungspaces(value) : null;
  if (buf === '') {
    // avoid 'such creatures do not exist' for empty input
    say(ctx, data.tries + 1 < 5 ? 'genocide.type_name' : 'genocide.no_type');
    return retry();
  }
  // choosing "none" preserves genocideless conduct
  if (buf === null || declines(buf)) {
    // ... but no free pass if cursed
    if (!(how & REALLY)) {
      const ptr = rndmonst(ctx, getLevel(ctx.state).depth);
      if (ptr) {
        genocideType(ctx, ptr, how, false);
        return false;
      }
    }
    return false;
  }
  if (buf === '?' || buf === "'?'") {
    listGenocided(ctx);
    askGenocide(ctx, data); // doesn't count as one of the tries
    return true;
  }
  const mndx = nameToMon(monsterNames(ctx), buf);
  if (mndx === null || isGenocided(ctx.state, mndx)) {
    say(ctx, mndx === null ? 'genocide.do_not_exist' : 'genocide.no_longer_exist');
    return retry();
  }
  const ptr = ctx.defs.monster(mndx);
  // Although "genus" is Latin for race, the hero benefits from both race and role; thus genocide
  // affects either.
  if (yourOwn(mndx)) {
    genocideType(ctx, ptr, how, true);
    return false;
  }
  const sgn = Math.sign(uState(ctx.state).alignType);
  if (ptr.flags.includes('human')) adjalign(ctx, -sgn);
  if (ptr.flags.includes('demon')) adjalign(ctx, sgn);
  if (!ptr.genFlags.includes('geno')) {
    say(ctx, 'genocide.thunderous');
    say(ctx, 'genocide.no_mortal');
    return retry();
  }
  // KMH -- Unchanging prevents rehumanization
  const killplayer = hasProp(getPlayer(ctx.state), P.UNCHANGING) && heroFormId(ctx.state) === mndx;
  genocideType(ctx, ptr, how, killplayer);
  return false;
}

/**
 * The chosen type (null: the hero's own role) is wiped out, or (without REALLY) sent in around
 * her. ref: src/read.c do_genocide() after the loop
 */
function genocideType(ctx: Ctx, ptr: MonsterDef | null, how: number, killplayer: boolean): void {
  const h = getPlayer(ctx.state);
  const id = ptr ? ptr.id : roleId(ctx);
  // the name: the actual type, or hallucinating, the hero's own (form or role)
  let name: string;
  let which: 'all' | 'the' | 'bare' = 'all';
  if (hasProp(h, P.HALLUC)) {
    const form = heroForm(ctx);
    name = form ? `@${form.nameKey}` : `@genocide.role.${roleId(ctx)}`;
  } else {
    name = ptr ? `@${ptr.nameKey}` : `@genocide.role.${roleId(ctx)}`;
    if (ptr?.genFlags.includes('uniq')) which = ptr.flags.includes('pname') ? 'bare' : 'the';
  }
  if (how & REALLY) {
    // setting no-corpse affects wishing and random tin generation
    setGenocided(ctx, id);
    say(ctx, `genocide.wiped_out.${which}`, { mon: name });
    if (killplayer) {
      const killer = how & PLAYER ? '@killer.genocidal_confusion' : '@killer.scroll_of_genocide';
      // polymorphed characters will die as soon as they're rehumanized
      if (upolyOf(ctx.state) && heroFormId(ctx.state) !== id) {
        setGenoKiller(ctx, killer);
        say(ctx, 'genocide.feel_inside', { how: { key: udeadinside(ctx) } });
      } else {
        done(ctx, killer, 'genocided');
        if (ctx.state.gameOver) return;
      }
    } else if (heroFormId(ctx.state) === id) rehumanize(ctx);
    killGenocidedMonsters(ctx);
    return;
  }
  // a reverse genocide: some of them around her
  const hp = h.c.pos;
  let cnt = 0;
  if (ptr && hp && !ptr.genFlags.includes('uniq') && !isGenocided(ctx.state, ptr.id)) {
    const census = monsterCensus(ctx);
    for (let i = ctx.rng.rn2(3) + 4; i > 0; i--) {
      if (makemon(ctx, ptr, { x: hp.x, y: hp.y }, { adjacentOk: true, noInventory: true }) === null)
        break; // couldn't make one
      ++cnt;
    }
    // accumulated 'cnt' doesn't take groups into account
    if (cnt) cnt = monsterCensus(ctx) - census;
  }
  if (cnt) say(ctx, cnt > 1 ? 'genocide.sent_in_some' : 'genocide.sent_in_one', { mon: name });
  else say(ctx, 'zap.nothing_happens');
}

/** The monsters on the hero's level. ref: src/mon.c monster_census(FALSE) */
function monsterCensus(ctx: Ctx): number {
  const lvl = ctx.state.currentLevel;
  let n = 0;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && id !== ctx.state.playerId && e.c.pos?.level === lvl) n++;
  }
  return n;
}

/** ref: src/mondata.c name_to_monclass() for a symbol, else the class of a monster's name */
function nameToClass(ctx: Ctx, buf: string): string | null {
  if (buf.length === 1) return ctx.defs.monsters.some((m) => m.glyph.ch === buf) ? buf : null;
  const mndx = nameToMon(monsterNames(ctx), buf);
  return mndx === null ? null : ctx.defs.monster(mndx).glyph.ch;
}

/** One answer to the class prompt; true when it asked again. ref: src/read.c do_class_genocide() */
function answerClass(ctx: Ctx, value: Json, data: GenoData): boolean {
  const retry = (): boolean => {
    data.tries++;
    if (data.tries >= 5) {
      say(ctx, 'genocide.enough_tries');
      return false;
    }
    askGenocide(ctx, data);
    return true;
  };
  const buf = typeof value === 'string' ? mungspaces(value) : null;
  if (buf === '') {
    say(ctx, data.tries + 1 < 5 ? 'genocide.type_class' : 'genocide.no_class');
    return retry();
  }
  if (buf === null || declines(buf)) return false;
  if (buf === '?' || buf === "'?'") {
    listGenocided(ctx);
    askGenocide(ctx, data);
    return true;
  }
  const cls = nameToClass(ctx, buf);
  const members = cls === null ? [] : ctx.defs.monsters.filter((m) => m.glyph.ch === cls);
  let immunecnt = 0;
  let gonecnt = 0;
  let goodcnt = 0;
  for (const m of members) {
    if (!m.genFlags.includes('geno')) immunecnt++;
    else if (isGenocided(ctx.state, m.id)) gonecnt++;
    else goodcnt++;
  }
  // the hero's role and race are both '@'
  if (!goodcnt && cls !== '@') {
    if (gonecnt) say(ctx, 'genocide.class.already_gone');
    else if (immunecnt) say(ctx, 'genocide.class.not_permitted');
    else say(ctx, buf.length === 1 ? 'genocide.class.no_symbol' : 'genocide.class.no_response');
    return retry();
  }
  const h = getPlayer(ctx.state);
  let feelDead = false;
  let gameover = false;
  for (const m of members) {
    const name = `@${m.nameKey}`;
    if (yourOwn(m.id) || (m.genFlags.includes('geno') && !isGenocided(ctx.state, m.id))) {
      setGenocided(ctx, m.id);
      killGenocidedMonsters(ctx);
      say(ctx, 'genocide.wiped_out.all', { mon: name });
      if (upolyOf(ctx.state) && heroFormId(ctx.state) === m.id) {
        if (hasProp(h, P.UNCHANGING)) {
          if (!feelDead) say(ctx, 'genocide.you_die');
          feelDead = true;
          // finish genociding this class of monsters before ultimately dying
          gameover = true;
        } else rehumanize(ctx);
        if (ctx.state.gameOver) return false;
      }
      // self-genocide if it matches either your race or role
      if (yourOwn(m.id)) {
        // u.uhp = -1: a polymorphed hero dies on returning to her own form (polyman())
        if (upolyOf(ctx.state)) {
          if (!feelDead) say(ctx, 'genocide.feel_inside', { how: { key: udeadinside(ctx) } });
        } else {
          if (!feelDead) say(ctx, 'genocide.you_die');
          gameover = true;
        }
        feelDead = true;
      }
    } else if (isGenocided(ctx.state, m.id)) {
      if (!gameover) say(ctx, 'genocide.class.are_gone', { mon: name });
    } else if (!gameover) {
      const uniq = m.genFlags.includes('uniq');
      const named = m.flags.includes('pname');
      say(
        ctx,
        uniq && !named
          ? 'genocide.not_permitted.the'
          : uniq || named
            ? 'genocide.not_permitted.bare'
            : 'genocide.not_permitted',
        { mon: name },
      );
    }
  }
  if (gameover) done(ctx, '@killer.scroll_of_genocide', 'genocided');
  return false;
}

/** The answer to a genocide prompt: the move's energy, or 0 when it asked again. */
export function answerGenocide(ctx: Ctx, value: Json, raw: Json): boolean {
  const data = raw as unknown as GenoData;
  return data.stage === 'class_genocide'
    ? answerClass(ctx, value, data)
    : answerType(ctx, value, data);
}

/** The genocided species left on a level die out when the hero arrives. ref: src/do.c goto_level() */
export function registerGenocide(api: ModApi): void {
  api.on('levelChange', (ctx) => {
    if (genocidedIds(ctx.state).length > 0) killGenocidedMonsters(ctx);
  });
}
