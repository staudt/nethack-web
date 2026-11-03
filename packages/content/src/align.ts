// Alignments, gods and altars. ref: include/align.h; src/pray.c a_align(), on_altar(),
// on_shrine(), align_gname(), godvoice(), altar_wrath(); src/insight.c align_str(); src/do.c
// doaltarobj(), flooreffects()
//
// The gods are the Valkyrie's pantheon (Tyr, Odin, Loki) and Moloch for unaligned altars: the
// hero is always a Valkyrie, so `urole.lgod/ngod/cgod` are fixed.
import {
  cellIndex,
  getLevel,
  getPlayer,
  inBounds,
  isVisible,
  type Ctx,
  type Entity,
  type Msg,
  type PosComponent,
} from '@nh/core';
import { adjattrib } from './attrib';
import { changeLuck, luckOf, setU, uState } from './luck';
import { hcolor } from './hcolor';
import { P, hasProp } from './props';

export {
  A_NONE,
  A_CHAOTIC,
  A_NEUTRAL,
  A_LAWFUL,
  ALGN_SINNED,
  ALGN_DEVOUT,
  altarAlign,
  type Aligntyp,
} from './aligntyp';
import { A_NONE, altarAlign, type Aligntyp } from './aligntyp';

/** The alignment of the altar at x,y on the current level, or null. ref: pray.c a_align() */
export function aAlign(ctx: Pick<Ctx, 'state'>, x: number, y: number): Aligntyp | null {
  const level = getLevel(ctx.state);
  if (!inBounds(level, x, y)) return null;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  return id === undefined ? null : altarAlign(id);
}

const heroAt = (ctx: Pick<Ctx, 'state'>) => {
  const pos = ctx.state.entities[String(ctx.state.playerId)]?.c.pos;
  return pos && pos.level === ctx.state.currentLevel ? pos : null;
};

/** The hero stands on an altar. ref: src/pray.c on_altar() (no Wwalking or water) */
export function onAltar(ctx: Pick<Ctx, 'state'>): boolean {
  const pos = heroAt(ctx);
  return pos !== null && aAlign(ctx, pos.x, pos.y) !== null;
}

/** The hero stands on a shrine altar (`Level.shrines`). ref: src/pray.c on_shrine() */
export function onShrine(ctx: Pick<Ctx, 'state'>): boolean {
  const pos = heroAt(ctx);
  if (pos === null || !onAltar(ctx)) return false;
  return getLevel(ctx.state).shrines?.some((p) => p.x === pos.x && p.y === pos.y) === true;
}

/** The god of an alignment as a message param. ref: src/pray.c align_gname() */
export function alignGname(a: number): string {
  if (a === A_NONE) return '@god.moloch';
  return a > 0 ? '@god.tyr' : a < 0 ? '@god.loki' : '@god.odin';
}

/** "lawful", "neutral", "chaotic" or "unaligned" as a message param. ref: insight.c align_str() */
export function alignStr(a: number): string {
  if (a === A_NONE) return '@align.unaligned';
  return a > 0 ? '@align.lawful' : a < 0 ? '@align.chaotic' : '@align.neutral';
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** "The voice of Odin booms out: ..." (`words` a message key). ref: src/pray.c godvoice() */
export function godvoice(ctx: Ctx, align: number, words: string | null): void {
  const how = ['booms_out', 'thunders', 'rings_out', 'booms'][ctx.rng.rn2(4)] ?? 'booms';
  say(ctx, words ? 'pray.voice_says' : 'pray.voice', {
    god: alignGname(align),
    how: `@pray.how.${how}`,
    ...(words ? { words: `@${words}` } : {}),
  });
}

/**
 * The altar's god is offended (kicking it): its own believer (with a record above -rn2(4))
 * loses a point of Wisdom and of alignment record; anyone else is promised payment and loses
 * Luck (more likely the higher it is). ref: src/pray.c altar_wrath() (no deafness)
 */
export function altarWrath(ctx: Ctx, x: number, y: number): void {
  const altaralign = aAlign(ctx, x, y);
  if (altaralign === null) return;
  const u = uState(ctx.state);
  if (u.alignType === altaralign && u.alignRecord > -ctx.rng.rn2(4)) {
    godvoice(ctx, altaralign, 'altar.desecrate');
    adjattrib(ctx, 'wis', -1, false);
    setU(ctx, { alignRecord: uState(ctx.state).alignRecord - 1 });
  } else {
    say(ctx, 'altar.whisper', { god: alignGname(altaralign) });
    say(ctx, 'altar.infidel');
    const luck = luckOf(ctx.state);
    if (luck > -5 && ctx.rng.rn2(luck + 6) !== 0) changeLuck(ctx, ctx.rng.rn2(20) !== 0 ? -1 : -2);
  }
}

/**
 * An object lands on an altar in the hero's sight: "There is an amber flash as X hits the
 * altar." (blessed; black for cursed) or "X lands on the altar.", and its curse status becomes
 * known (not for a flash seen while hallucinating; coins lose theirs). Nothing when blind. Call
 * it before the object is placed, so it merges with the stacks it now matches. ref: src/do.c
 * doaltarobj() (no conduct)
 */
export function doaltarobj(ctx: Ctx, obj: Entity): void {
  const hero = getPlayer(ctx.state);
  const it = obj.c.item;
  if (!it || hasProp(hero, P.BLINDED)) return;
  const coin = ctx.defs.object(obj.def).class === 'coin';
  if (coin) it.buc = 'uncursed'; // coins don't have bless/curse status
  const pl = it.quantity !== 1 ? '_pl' : '';
  const item = ctx.defs.itemName(ctx.state, obj);
  if (it.buc !== 'uncursed') {
    say(ctx, `altar.flash${pl}`, {
      color: hcolor(ctx, it.buc === 'blessed' ? 'amber' : 'black'),
      item,
    });
    if (!hasProp(hero, P.HALLUC)) it.known.buc = true;
  } else {
    say(ctx, `altar.lands${pl}`, { item });
    if (!coin) it.known.buc = true;
  }
}

/**
 * A monster's object lands at `pos` while monsters move (a pet's drop, a missile, a dying
 * monster's possessions): on an altar the hero sees, doaltarobj(). Call before placing it.
 * ref: src/do.c flooreffects() `svc.context.mon_moving && IS_ALTAR() && cansee(x, y)`
 */
export function monFloorEffects(ctx: Ctx, obj: Entity, pos: PosComponent): void {
  if (pos.level !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  if (!inBounds(level, pos.x, pos.y) || !isVisible(ctx.state, cellIndex(level, pos.x, pos.y)))
    return;
  if (aAlign(ctx, pos.x, pos.y) !== null) doaltarobj(ctx, obj);
}
