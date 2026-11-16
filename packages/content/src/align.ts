// Alignments, gods and altars. ref: include/align.h; src/pray.c a_align(), on_altar(),
// on_shrine(), align_gname(), align_gtitle(), godvoice(), altar_wrath(); src/insight.c
// align_str(); src/do.c doaltarobj(), flooreffects(); src/role.c role_init() (the pantheon)
//
// The gods are the hero's pantheon: her own role's (`urole.lgod/ngod/cgod`), or for a Priest
// another role's drawn at new game (`modData.nh.pantheon`), and Moloch for unaligned altars.
import {
  cellIndex,
  getLevel,
  getPlayer,
  inBounds,
  isVisible,
  type Ctx,
  type Entity,
  type GameState,
  type Msg,
  type PosComponent,
} from '@nh/core';
import { adjattrib } from './attrib';
import { changeLuck, luckOf, setU, uState, ualignBase } from './luck';
import { hcolor } from './hcolor';
import { P, hasProp } from './props';
import { ROLES_TAB } from './roletab';
import { urace, urole } from './urole';
import { alignGname, startAlign } from './gods';
export { alignGname, alignGtitle, godSuffix, initPantheon, pantheon, startAlign } from './gods';

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

/** The hero's own god. ref: src/pray.c u_gname() */
export const uGname = (state: Readonly<GameState>): string =>
  alignGname(state, uState(state).alignType);

/**
 * At new game, the alignment and its record: `u.ualign.type` from the starting alignment (also
 * the original one, `u.ualignbase`), `u.ualign.record = urole.initrecord`. Only the values that
 * differ from the defaults are written (the neutral Valkyrie's record 0 needs none).
 * ref: src/attrib.c newhp() `if (svm.moves == 0)`; src/u_init.c u_init_misc() u.ualignbase
 */
export function uInitAlign(ctx: Pick<Ctx, 'state'>, align?: number): void {
  const type = align ?? startAlign(urole(ctx.state), urace(ctx.state));
  const record = ROLES_TAB[urole(ctx.state)].initrecord;
  const u = uState(ctx.state);
  const patch: { alignType?: number; alignRecord?: number; alignBase?: number } = {};
  if (u.alignType !== type) patch.alignType = type;
  if (u.alignRecord !== record) patch.alignRecord = record;
  if (ualignBase(ctx.state) !== type) patch.alignBase = type;
  if (Object.keys(patch).length) setU(ctx, patch);
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
    god: alignGname(ctx.state, align),
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
    say(ctx, 'altar.whisper', { god: alignGname(ctx.state, altaralign) });
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
