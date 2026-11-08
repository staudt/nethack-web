import {
  getLevel,
  sortedIds,
  type ActionDef,
  type Ctx,
  type Json,
  type MonsterDef,
} from '@nh/core';
import { tamedog } from '../dog';
import { makemon, mkclass, rndmonst } from '../generation';
import { messagesEn } from '../messages.en';
import { nameToMon } from '../mondata';
import { mungspaces, wishNames } from '../objnam_read';
import { canSpotMon, monNam } from '../perception';
import { setMinvis } from '../invis';
import { heroPos } from '../travel';

export const WIZ_GENESIS = 'wiz:genesis';

/** ref: src/read.c create_particular() CP_TRYLIM */
const CP_TRYLIM = 5;
/** ref: include/global.h BUFSZ: getlin() reads at most BUFSZ - 1 characters */
const GENESIS_MAXLEN = 255;

/** The request in progress, carried by the prompt. */
interface GenesisData {
  /** Failed answers so far. */
  tries: number;
  /** "Try again (type * for random, ESC to cancel)." was said. */
  altmsg: boolean;
}

/** A parsed request. ref: src/read.c struct _create_particular_data (the ported fields) */
export interface GenesisSpec {
  quan: number;
  /** A monster type, or null with `cls` (a class symbol) or neither (`*`: random). */
  which: MonsterDef | null;
  cls: string | null;
  tame: boolean;
  peaceful: boolean;
  hostile: boolean;
  sleeping: boolean;
  invisible: boolean;
}

/**
 * ref: src/read.c create_particular_parse(): an optional count, "sleeping", "invisible", then "tame",
 * "peaceful" or "hostile", then `*`/"random" (a random monster), a monster name (name_to_mon())
 * or a class symbol (name_to_monclass() for single characters). Null when nothing matches.
 * Not ported: "saddled", "hidden", "female"/"male", class descriptions
 * ("dragon"), the long worm and ']' / 'I' / '~' special cases.
 */
export function parseGenesis(ctx: Ctx, text: string): GenesisSpec | null {
  let bufp = text;
  let quan = 1; // 1 + multi: no command count here
  const count = /^\d+/.exec(bufp)?.[0];
  if (count !== undefined) {
    quan = Number.parseInt(count, 10);
    bufp = bufp.slice(count.length).replace(/^ +/, '');
  }
  // maximum possible quantity is one per cell
  const level = getLevel(ctx.state);
  const quanLimit = level.height * (level.width - 1);
  if (quan < 1 || quan > quanLimit) quan = quanLimit - monsterCensus(ctx);
  let sleeping = false;
  const sl = bufp.toLowerCase().indexOf('sleeping ');
  if (sl >= 0) {
    sleeping = true;
    bufp = bufp.slice(0, sl) + ' '.repeat(9) + bufp.slice(sl + 9);
  }
  let invisible = false;
  const inv = bufp.toLowerCase().indexOf('invisible ');
  if (inv >= 0) {
    invisible = true;
    bufp = bufp.slice(0, inv) + ' '.repeat(10) + bufp.slice(inv + 10);
  }
  bufp = mungspaces(bufp);
  const lower = bufp.toLowerCase();
  let tame = false;
  let peaceful = false;
  let hostile = false;
  if (lower.startsWith('tame ')) {
    bufp = bufp.slice(5);
    tame = true;
  } else if (lower.startsWith('peaceful ')) {
    bufp = bufp.slice(9);
    peaceful = true;
  } else if (lower.startsWith('hostile ')) {
    bufp = bufp.slice(8);
    hostile = true;
  }
  const spec = { quan, which: null, cls: null, tame, peaceful, hostile, sleeping, invisible };
  if (bufp === '*' || bufp === 'random') return spec;
  const names = wishNames(ctx.state, ctx.defs, messagesEn).monsters;
  const which = nameToMon(names, bufp);
  if (which !== null) return { ...spec, which: ctx.defs.monster(which) };
  if (bufp.length === 1 && ctx.defs.monsters.some((m) => m.glyph.ch === bufp))
    return { ...spec, cls: bufp };
  return null;
}

/** ref: src/mon.c monster_census(FALSE): the monsters on the hero's level */
function monsterCensus(ctx: Ctx): number {
  const lvl = ctx.state.currentLevel;
  return sortedIds(ctx.state).filter((id) => {
    const e = ctx.state.entities[String(id)];
    return id !== ctx.state.playerId && e?.c.monster !== undefined && e.c.pos?.level === lvl;
  }).length;
}

/**
 * ref: src/read.c create_particular_creation(): each monster is made next to the hero (makemon
 * at her spot goes to enexto()), "<Mon> appears." when she can see it (MM_NOEXCLAM), then made
 * tame (tamedog()), peaceful or hostile, or asleep as asked. A class symbol picks with mkclass()
 * and `*` with rndmonst() for each one. Returns whether any was made.
 */
export function createParticular(ctx: Ctx, spec: GenesisSpec): boolean {
  let madeany = false;
  const depth = getLevel(ctx.state).depth;
  for (let i = 0; i < spec.quan; i++) {
    let whichpm = spec.which;
    if (spec.cls !== null) whichpm = mkclass(ctx, spec.cls, depth);
    else if (spec.which === null) whichpm = rndmonst(ctx, depth);
    const p = heroPos(ctx);
    const id = makemon(ctx, whichpm, { x: p.x, y: p.y }, { adjacentOk: true });
    if (id === null) {
      // quit trying if creation failed and is going to repeat
      if (spec.which !== null) break;
      continue;
    }
    const mon = ctx.state.entities[String(id)];
    const m = mon?.c.monster;
    if (!mon || !m) continue;
    if (spec.invisible) setMinvis(ctx, mon, false); // makemon()'s MM_MINVIS
    if (canSpotMon(ctx, mon))
      ctx.emit({ type: 'msg', key: 'wiz.genesis.appears', params: { mon: monNam(ctx, mon) } });
    if (spec.tame) {
      tamedog(ctx, id, null, false, () => {});
    } else if (spec.peaceful || spec.hostile) {
      delete m.tame; // sanity precaution
      m.peaceful = spec.peaceful;
    }
    if (spec.sleeping) m.asleep = true;
    madeany = true;
  }
  return madeany;
}

function ask(ctx: Ctx, data: GenesisData): void {
  ctx.ask(
    {
      id: 'genesis',
      kind: 'text',
      key: data.tries > 0 ? 'wiz.genesis.prompt_help' : 'wiz.genesis.prompt',
      maxLength: GENESIS_MAXLEN,
    },
    WIZ_GENESIS,
    data as unknown as Json,
  );
}

/**
 * #wizgenesis (^G): create a monster of the kind typed, next to the hero. Takes no time
 * (ECMD_OK). ref: src/wizcmds.c wiz_genesis(), src/read.c create_particular()
 */
export const wizGenesis: ActionDef = {
  id: WIZ_GENESIS,
  labelKey: 'action.wiz:genesis',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_GENESIS }, labelKey: 'action.wiz:genesis' }]
      : [],
  perform(ctx) {
    ask(ctx, { tries: 0, altmsg: false });
    return 0;
  },
  /**
   * ref: create_particular(): Escape creates nothing; an unknown name says so and asks again
   * (the first empty answer gets a hint instead), up to CP_TRYLIM times, then "That's enough
   * tries!" and nothing.
   */
  answer(ctx, value, raw) {
    if (typeof value !== 'string') return 0; // ESC
    const data = (raw as unknown as GenesisData | null) ?? { tries: 0, altmsg: false };
    const bufp = mungspaces(value);
    const spec = parseGenesis(ctx, bufp);
    if (spec) {
      createParticular(ctx, spec);
      return 0;
    }
    const tryct = CP_TRYLIM - data.tries;
    let altmsg = data.altmsg;
    if (bufp !== '' || altmsg || tryct < 2)
      ctx.emit({ type: 'msg', key: 'wiz.genesis.never_heard' });
    else {
      ctx.emit({ type: 'msg', key: 'wiz.genesis.try_again' });
      altmsg = true;
    }
    if (tryct - 1 > 0) ask(ctx, { tries: data.tries + 1, altmsg });
    else ctx.emit({ type: 'msg', key: 'wish.enough_tries' });
    return 0;
  },
};
