// Reading the Book of the Dead: away from the vibrating square, a cursed Book raises the dead
// (maybe a master lich or a nalfeshnee, the hero's carried corpses, a few undead around her), a
// blessed one pacifies the undead she sees (tames the co-aligned ones next to her), an uncursed one
// says one of three lines. On the vibrating square the invocation needs the Bell and the
// Candelabrum, which this port does not have: a chill and the two hints, or scrambled runes for a
// cursed Book.
// ref: src/spell.c deadbook(), deadbook_pacify_undead(); src/mkroom.c mkundead()
//
// Not ported (ROADMAP "From m17"): the invocation itself (the Bell and the Candelabrum, the
// primed relics, mkinvokearea()); body_part(SPINE) for a polymorphed hero (always "spine").
import { isVampshifter } from './chamstate';
import { getLevel, getPlayer, sortedIds, type Ctx, type DefId, type Entity } from '@nh/core';
import { tamedog } from './dog';
import { makemon, mnextoPos } from './generation';
import { setGraveyard } from './graveyard';
import { invocationPos } from './invocation';
import { uState } from './luck';
import { monflee } from './monflee';
import { discover } from './o_init';
import { P, hasProp } from './props';
import { revive, unturnDead } from './revive';
import { morguemon } from './roommon';
import { T, terrainIdAt } from './terrain';
import { cansee } from './trap';

/** ref: include/objects.h SPE_BOOK_OF_THE_DEAD */
export const BOOK_OF_THE_DEAD: DefId = 'nh:book_of_the_dead';

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/**
 * A few undead around (x, y) (`(depth + 1) / 10 + rnd(5)` of morguemon()'s kinds), each one
 * a corpse on its spot coming back to life when it can; the level becomes a graveyard (fewer
 * undead corpses). ref: src/mkroom.c mkundead() (revive_corpses TRUE, NO_MINVENT)
 */
function mkundead(ctx: Ctx, x: number, y: number): void {
  const level = getLevel(ctx.state);
  let cnt = Math.trunc((level.depth + 1) / 10) + ctx.rng.rnd(5);
  while (cnt--) {
    const mdat = morguemon(ctx, level.depth, level);
    const cc = mdat ? mnextoPos(ctx, level, null, { x, y }, mdat) : null;
    if (!mdat || !cc) continue;
    const corpse = sortedIds(ctx.state)
      .map((id) => ctx.state.entities[String(id)])
      .find(
        (e) =>
          e?.def === 'nh:corpse' &&
          e.c.item &&
          e.c.pos?.level === level.id &&
          e.c.pos.x === cc.x &&
          e.c.pos.y === cc.y,
      );
    if (!corpse || !revive(ctx, corpse, false))
      makemon(ctx, mdat, cc, { level: level.id, noInventory: true });
  }
  setGraveyard(ctx, level.id); // reduced chance for undead corpse
}

/**
 * Pacify or tame an undead monster she sees: it becomes peaceful; one of her alignment's sign
 * within distance 2 is tamed (a pet gets tamer, up to 20), any other flees.
 * ref: src/spell.c deadbook_pacify_undead()
 */
function pacifyUndead(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  const p = mon.c.pos;
  const def = ctx.defs.monster(mon.def);
  const undead = def.flags.includes('undead') || isVampshifter(ctx, mon);
  if (!m || !p || !undead || !cansee(ctx, p.level, p.x, p.y)) return;
  m.peaceful = true;
  const hp = getPlayer(ctx.state).c.pos;
  const near = hp !== undefined && (p.x - hp.x) ** 2 + (p.y - hp.y) ** 2 < 4;
  if (Math.sign(def.alignment) === Math.sign(uState(ctx.state).alignType) && near) {
    if (m.tame) {
      if (m.tame < 20) m.tame++;
    } else tamedog(ctx, mon.id, null, true, () => undefined);
  } else monflee(ctx, mon.id, 0, false, true);
}

/**
 * The Book's effect when its reading is done: "You turn the pages of the Book of the Dead...",
 * then by where she stands and its curse status. ref: src/spell.c deadbook()
 */
export function deadbook(ctx: Ctx, book: Entity): void {
  say(ctx, 'deadbook.turn');
  discover(ctx, ctx.defs.object(BOOK_OF_THE_DEAD)); // makeknown()
  const h = getPlayer(ctx.state);
  const hp = h.c.pos;
  if (!hp) return;
  const level = getLevel(ctx.state, hp.level);
  const cursed = book.c.item?.buc === 'cursed';
  const onStairs = ctx.defs.terrain(terrainIdAt(level, hp.x, hp.y) ?? T.stone).stairs;
  if (invocationPos(ctx, level, hp.x, hp.y) && onStairs === undefined) {
    if (cursed) {
      say(ctx, hasProp(h, P.BLINDED) ? 'deadbook.ignoring' : 'deadbook.scrambled');
      return;
    }
    // (she can have neither the Bell nor the Candelabrum)
    say(ctx, 'deadbook.chill');
    say(ctx, 'deadbook.chime');
    say(ctx, 'deadbook.amused');
    return;
  }
  if (cursed) {
    // raise_dead:
    say(ctx, 'deadbook.raised');
    // first maybe place a dangerous adversary
    if (!ctx.rng.rn2(3)) {
      for (const kind of ['nh:master_lich', 'nh:nalfeshnee'] as const) {
        if (!ctx.defs.isMonster(kind)) continue;
        const id = makemon(ctx, ctx.defs.monster(kind), hp, {
          adjacentOk: true,
          noInventory: true,
        });
        const m = id === null ? undefined : ctx.state.entities[String(id)]?.c.monster;
        if (m) {
          m.peaceful = false; // set_malign() follows it
          break;
        }
      }
    }
    // next handle the affect on things you're carrying
    unturnDead(ctx, 'hero');
    // last place some monsters around you
    mkundead(ctx, hp.x, hp.y);
  } else if (book.c.item?.buc === 'blessed') {
    for (const id of sortedIds(ctx.state)) {
      const e = ctx.state.entities[String(id)];
      if (e?.c.monster && e.c.pos?.level === level.id) pacifyUndead(ctx, e);
    }
  } else {
    const n = ctx.rng.rn2(3);
    say(ctx, n === 0 ? 'deadbook.ancestors' : n === 1 ? 'deadbook.headstones' : 'deadbook.name');
  }
}
