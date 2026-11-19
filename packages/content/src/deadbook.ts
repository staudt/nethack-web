// Reading the Book of the Dead: on the vibrating square with the Bell of Opening rung within 5
// moves and the Candelabrum lit with its 7 candles (none of them cursed) the invocation opens the
// way to the Sanctum (invokearea.ts); a relic missing gives a chill and the hints, a cursed one
// fails, one unprimed raises the dead. Away from the square a cursed Book raises the dead (maybe a
// master lich or a nalfeshnee, the hero's carried corpses, a few undead around her), a blessed one
// pacifies the undead she sees (tames the co-aligned ones next to her), an uncursed one says one
// of three lines.
// ref: src/spell.c deadbook(), deadbook_pacify_undead(); src/mkroom.c mkundead()
//
// Not ported: record_achievement(ACH_INVK); body_part(SPINE) for a polymorphed hero (always
// "spine").
import { levelDifficulty } from './levdiff';
import { isVampshifter } from './chamstate';
import {
  getLevel,
  getPlayer,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
} from '@nh/core';
import { tamedog } from './dog';
import { makemon, mnextoPos } from './generation';
import { setGraveyard } from './graveyard';
import { invocationPos } from './invocation';
import { mkinvokearea } from './invokearea';
import { setU, uState } from './luck';
import { monflee } from './monflee';
import { discover } from './o_init';
import { P, hasProp } from './props';
import { revive, unturnDead } from './revive';
import { morguemon } from './roommon';
import { T, terrainIdAt } from './terrain';
import { cansee } from './trap';
import { BELL_OF_OPENING, CANDELABRUM, uHave } from './uhave';

/** ref: include/objects.h SPE_BOOK_OF_THE_DEAD */
export const BOOK_OF_THE_DEAD: DefId = 'nh:book_of_the_dead';

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/**
 * A few undead around (x, y) (`(depth + 1) / 10 + rnd(5)` of morguemon()'s kinds), with
 * `reviveCorpses` each one a corpse on its spot coming back to life when it can; the level becomes
 * a graveyard (fewer undead corpses). ref: src/mkroom.c mkundead() (NO_MINVENT)
 */
export function mkundead(ctx: Ctx, x: number, y: number, reviveCorpses: boolean): void {
  const level = getLevel(ctx.state);
  const difficulty = levelDifficulty(ctx, level);
  let cnt = Math.trunc((difficulty + 1) / 10) + ctx.rng.rnd(5);
  while (cnt--) {
    const mdat = morguemon(ctx, difficulty, level);
    const cc = mdat ? mnextoPos(ctx, level, null, { x, y }, mdat) : null;
    if (!mdat || !cc) continue;
    const corpse = !reviveCorpses
      ? undefined
      : sortedIds(ctx.state)
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
  let raiseDead = cursed;
  if (invocationPos(ctx, level, hp.x, hp.y) && onStairs === undefined) {
    if (cursed) {
      say(ctx, hasProp(h, P.BLINDED) ? 'deadbook.ignoring' : 'deadbook.scrambled');
      return;
    }
    const bell = uHave(ctx.state, 'bell');
    const menorah = uHave(ctx.state, 'menorah');
    if (!bell || !menorah) {
      say(ctx, 'deadbook.chill');
      if (!bell) say(ctx, 'deadbook.chime');
      if (!menorah) say(ctx, 'deadbook.amused');
      return;
    }
    let arti1Primed = false;
    let arti2Primed = false;
    let artiCursed = false;
    for (const o of inventoryOf(ctx.state, h.id)) {
      const it = o.c.item;
      if (!it) continue;
      if (o.def === CANDELABRUM && it.spe === 7 && it.lit) {
        if (it.buc !== 'cursed') arti1Primed = true;
        else artiCursed = true;
      }
      // you rang it recently
      if (o.def === BELL_OF_OPENING && ctx.state.turn - (it.age ?? 0) < 5) {
        if (it.buc !== 'cursed') arti2Primed = true;
        else artiCursed = true;
      }
    }
    if (artiCursed) {
      say(ctx, 'deadbook.invocation_fails');
      say(ctx, 'deadbook.relic_cursed');
      return;
    }
    if (arti1Primed && arti2Primed) {
      const soon = ctx.rng.d(2, 6); // time til next intervene()
      // successful invocation
      mkinvokearea(ctx);
      // in case you haven't killed the Wizard yet, behave as if you just did (wizdeadorgone())
      const u = uState(ctx.state);
      setU(ctx, {
        invoked: true,
        udemigod: true,
        udgCnt: !u.udgCnt || u.udgCnt > soon ? soon : u.udgCnt,
      });
      return;
    }
    // at least one relic not prepared properly
    say(ctx, 'deadbook.amiss');
    raiseDead = true;
  }
  if (raiseDead) {
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
    mkundead(ctx, hp.x, hp.y, true);
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
