// Eggs hatching: the hatch timer's handler. ref: src/timeout.c hatch_egg()
//
// Not ported: G_EXTINCT (no extinction), hallucination's names, the long worm's tail, deafness (no Deaf), mimics hiding.
import {
  cellIndex,
  inBounds,
  isVisible,
  type Ctx,
  type Entity,
  type Json,
  type ModApi,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { EGG, HATCH_EGG, attachEggHatchTimeout, bigToLittle, learnEggType } from './eggstate';
import { makemon } from './generation';
import { tamedog } from './dog';
import { heroFemale } from './gender';
import { canseemon } from './invis';
import { useupall } from './magic';
import { monNam } from './perception';
import { isGenocided } from './vanquished';

const say = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: cansee(x, y) on the hero's level */
function cansee(ctx: Ctx, level: string, x: number, y: number): boolean {
  const l = ctx.state.levels[level];
  return (
    level === ctx.state.currentLevel &&
    !!l &&
    inBounds(l, x, y) &&
    isVisible(ctx.state, cellIndex(l, x, y))
  );
}

/** ref: src/mondata.c locomotion(ptr, "drop") */
function locomotionDrop(def: MonsterDef): string {
  const f = def.flags;
  if (f.includes('float')) return 'float';
  if (f.includes('fly')) return 'fly'; // flys and flyl both say "fly"
  if (f.includes('slithy')) return 'slither';
  if (f.includes('amorphous')) return 'ooze';
  if (!def.speed) return 'wiggle';
  if (f.includes('nolimbs')) return 'crawl';
  return 'drop';
}

/**
 * The noise a hatchling makes for the mommy/daddy gag; a relatively small subset of MS_ sound
 * values are used by oviparous species. ref: src/sounds.c cry_sound()
 */
function crySound(def: MonsterDef): string {
  switch (def.sound) {
    case 'hiss': // chickatrice, pyrolisk, snakes
      return 'hiss';
    case 'roar': // baby dragons; have them growl instead of roar
    case 'growl':
      return 'growl';
    case 'chirp': // adult crocodiles bellow, babies chirp
      return 'chirp';
    case 'buzz': // killer bees
      return 'buzz';
    case 'grunt': // gargoyles
      return 'grunt';
    default:
      // insects, arthropods, worms, sea creatures: "chitter" so the gag works
      return def.glyph.ch === ';' ? 'gurgle' : 'chitter';
  }
}

/** Where the egg is: in the hero's or a monster's inventory, or on the floor (not in a box). */
function eggWhere(
  ctx: Ctx,
  egg: Entity,
): {
  where: 'invent' | 'minvent' | 'floor';
  level: string;
  x: number;
  y: number;
  by?: Entity;
} | null {
  const it = egg.c.item;
  if (!it || it.containedIn !== undefined) return null;
  if (it.carriedBy !== null) {
    const by = ctx.state.entities[String(it.carriedBy)];
    const p = by?.c.pos;
    if (!by || !p) return null;
    return it.carriedBy === ctx.state.playerId
      ? { where: 'invent', ...p }
      : { where: 'minvent', ...p, by };
  }
  const p = egg.c.pos;
  return p ? { where: 'floor', ...p } : null;
}

/**
 * The timer callback: hatch the given egg. Some of the stack hatch (`rnd(quan)`), each next to
 * the egg; the hero's own eggs (laid by her, or 1 time in 2 a male hero's carried ones) hatch
 * tame while she is on the level, as does a dragon egg in her pack ("Gleep!"); a hatchling from
 * her pack is very tame. What she sees she learns to recognise; the rest of the stack gets a
 * short new timer. An egg on another level hatches silently (C's "hatched while away": timers
 * of other levels run as they come due here). ref: src/timeout.c hatch_egg()
 */
export function hatchEgg(ctx: Ctx, data: Json): void {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'number') return;
  const egg = ctx.state.entities[String(id)];
  const it = egg?.c.item;
  // sterilized while waiting (or gone)
  if (!egg || egg.def !== EGG || !it || !it.corpseOf || !ctx.defs.isMonster(it.corpseOf)) return;
  const mnum = bigToLittle(ctx.defs, it.corpseOf);
  if (!ctx.defs.isMonster(mnum)) return;
  const mdef = ctx.defs.monster(mnum);
  const carried = it.carriedBy === ctx.state.playerId;
  // the identity of one's father is learned, not innate
  const yours = it.spe !== 0 || (!heroFemale(ctx.state) && carried && ctx.rng.rn2(2) === 0);

  // only can hatch when in the inventory, on the floor or in a monster's inventory
  const loc = eggWhere(ctx, egg);
  if (!loc) return;
  const silent = loc.level !== ctx.state.currentLevel; // hatched while away
  let hatchcount = ctx.rng.rnd(it.quantity);
  const canseeHatchspot = !silent && cansee(ctx, loc.level, loc.x, loc.y);
  let mon: Entity | null = null;
  if (!mdef.genFlags.includes('uniq') && !isGenocided(ctx.state, mnum)) {
    let i = hatchcount;
    let mon2: Entity | null = null;
    for (; i > 0; i--) {
      const mid = makemon(
        ctx,
        mdef,
        { x: loc.x, y: loc.y },
        { level: loc.level, adjacentOk: true, noInventory: true },
      );
      mon = mid === null ? null : (ctx.state.entities[String(mid)] ?? null);
      if (!mon) break;
      // tame if your own egg hatches while you're on the same dungeon level, or any dragon egg
      // which hatches while it's in your inventory
      if ((yours && !silent) || (carried && mdef.glyph.ch === 'D')) {
        if (tamedog(ctx, mon.id, null, false, () => {})) {
          const m = mon.c.monster;
          if (carried && mdef.glyph.ch !== 'D' && m) m.tame = 20;
        }
      }
      mon2 = mon; // in case makemon() fails on 2nd egg
    }
    if (!mon) mon = mon2;
    hatchcount -= i;
    it.quantity -= hatchcount;
  }
  if (!mon) return;

  const siblings = hatchcount > 1;
  // m_monnam(): the true type, even while hallucinating
  const who: Msg = siblings
    ? { key: 'egg.who.some', params: { mon: `@${mon.def}` } }
    : { key: 'egg.who.one', params: { mon: `@${mon.def}` } };
  const verb = `@egg.loco.${locomotionDrop(ctx.defs.monster(mon.def))}`;
  let knowsEgg = false;
  switch (loc.where) {
    case 'invent':
      knowsEgg = true; // true even if you are blind
      if (!canseeHatchspot) say(ctx, 'egg.hatch.pack_feel', { verb });
      else say(ctx, 'egg.hatch.pack_see', { who, verb });
      if (yours) {
        const md = ctx.defs.monster(mon.def);
        say(ctx, siblings ? 'egg.cry.some' : 'egg.cry.one', {
          cry: `@egg.crying.${crySound(md)}`,
          sounds: !md.sound || md.sound === 'silent' ? '@egg.seems' : '@egg.sounds',
          parent: heroFemale(ctx.state) ? '@egg.mommy' : '@egg.daddy',
          p: it.spe ? '.' : '?',
        });
      } else if (ctx.defs.monster(mon.def).glyph.ch === 'D') {
        say(ctx, 'egg.gleep'); // Mything eggs :-)
      }
      break;
    case 'floor':
      if (canseeHatchspot) {
        knowsEgg = true;
        say(ctx, 'egg.hatch.floor', { who });
      }
      break;
    case 'minvent':
      if (canseeHatchspot) {
        // egg carrying monster might be invisible
        const by = loc.by;
        if (by && canseemon(ctx, by)) {
          knowsEgg = true;
          say(ctx, 'egg.hatch.minvent', { who, verb, by: monNam(ctx, by) });
        } else say(ctx, 'egg.hatch.thin_air', { who, verb });
      }
      break;
  }
  if (canseeHatchspot && knowsEgg) learnEggType(ctx, mnum);

  if (it.quantity > 0) {
    // still some eggs left: a new, short hatch timer for the rest of the stack
    attachEggHatchTimeout(ctx, egg.id, ctx.rng.rnd(12));
  } else if (carried) {
    useupall(ctx, egg.id);
  } else {
    ctx.remove(egg.id);
  }
}

export function registerEggs(api: ModApi): void {
  api.defineTimer({ id: HATCH_EGG, fire: hatchEgg });
}
