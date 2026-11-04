// Random object generation: mkobj() and its helpers.
// ref: src/mkobj.c mkobj(), mkobj_at(), rndmonnum()
import type { Ctx, DefId, EntityId, LevelId, MonsterDef, ObjectClass, ObjectDef } from '@nh/core';
import { putIn } from '@nh/core';
import { rndmonst } from './generation';
import { mksobj, type MksobjOpts } from './items';
import { startCorpseTimeout } from './corpses';
import { BOX_ROCK_GEMS, gemLedger, gemProb, rndClass } from './gem';

/** What mkobj() needs from a Ctx (corpses schedule a rot timer). */
export type MkobjCtx = Pick<
  Ctx,
  'state' | 'rng' | 'defs' | 'emit' | 'spawn' | 'remove' | 'schedule'
>;

type ClassProbs = readonly { prob: number; cls: ObjectClass | null; name: string }[];

/**
 * The class probabilities of mkobj() on ordinary levels, in NetHack's order; they sum to 100.
 * `null` would mark a class this port does not have (rolling one generates nothing); every class
 * exists now. ref: src/mkobj.c mkobjprobs[]
 */
export const MKOBJ_PROBS: ClassProbs = [
  { prob: 10, cls: 'weapon', name: 'weapon' },
  { prob: 11, cls: 'armor', name: 'armor' },
  { prob: 20, cls: 'food', name: 'food' },
  { prob: 8, cls: 'tool', name: 'tool' },
  { prob: 7, cls: 'gem', name: 'gem' },
  { prob: 16, cls: 'potion', name: 'potion' },
  { prob: 16, cls: 'scroll', name: 'scroll' },
  { prob: 4, cls: 'spellbook', name: 'spellbook' },
  { prob: 4, cls: 'wand', name: 'wand' },
  { prob: 3, cls: 'ring', name: 'ring' },
  { prob: 1, cls: 'amulet', name: 'amulet' },
];

/** The class probabilities of a box's contents; they sum to 100. ref: src/mkobj.c boxiprobs[] */
export const BOX_PROBS: ClassProbs = [
  { prob: 18, cls: 'gem', name: 'gem' },
  { prob: 15, cls: 'food', name: 'food' },
  { prob: 18, cls: 'potion', name: 'potion' },
  { prob: 18, cls: 'scroll', name: 'scroll' },
  { prob: 12, cls: 'spellbook', name: 'spellbook' },
  { prob: 7, cls: 'coin', name: 'coin' },
  { prob: 6, cls: 'wand', name: 'wand' },
  { prob: 5, cls: 'ring', name: 'ring' },
  { prob: 1, cls: 'amulet', name: 'amulet' },
];

/** `for (tprob = rnd(100); (tprob -= iprobs->iprob) > 0; iprobs++)` */
function rollClass(ctx: Pick<MkobjCtx, 'rng'>, probs: ClassProbs): ObjectClass | null {
  let tprob = ctx.rng.rnd(100);
  let i = 0;
  while (tprob - (probs[i]?.prob ?? 0) > 0) {
    tprob -= probs[i]?.prob ?? 0;
    i++;
  }
  return probs[i]?.cls ?? null;
}

export interface MkobjOpts {
  /** Level whose depth matters (random corpses); default is the hero's current level. */
  level?: LevelId;
  /** Place the object on the floor here (mkobj_at). Otherwise it is returned detached. */
  at?: { level: LevelId; x: number; y: number };
  /** Called during level creation (gi.in_mklev): corpse timers vary more, sacks get contents. */
  inMklev?: boolean;
  /** mkobj's `artif` (default true, as mkobj_at() passes it during level creation). */
  artif?: boolean;
}

/** The depth used as level_difficulty() for things made on `level`. */
function depthOf(ctx: Pick<MkobjCtx, 'state'>, level: LevelId | undefined): number {
  const id = level ?? ctx.state.currentLevel;
  return ctx.state.levels[id]?.depth ?? 1;
}

/**
 * A random monster type for a corpse, like the level's monsters.
 * ref: src/mkobj.c rndmonnum_adj(): plan A is rndmonst(); plan B (nothing eligible) is any
 * common monster, picked uniformly from the whole table (our table has no G_NOGEN/UNIQ rows to
 * skip except those flagged so).
 */
export function rndmonnum(ctx: MkobjCtx, depth: number): MonsterDef {
  const m = rndmonst(ctx, depth);
  if (m) return m;
  const all = ctx.defs.monsters.filter(
    (d) => !d.genFlags.includes('nogen') && !d.genFlags.includes('uniq'),
  );
  const pick = all[ctx.rng.rn2(Math.max(all.length, 1))] ?? ctx.defs.monsters[0];
  if (!pick) throw new Error('rndmonnum: no monsters registered');
  return pick;
}

/**
 * Picks an object type of class `cls` by probability. ref: src/mkobj.c mkobj():
 * `prob = rnd(oclass_prob_totals[oclass]); while ((prob -= objects[i].oc_prob) > 0) ++i;`
 * Our subset's probabilities do not sum to 1000, so the total is of the registered objects of
 * the class (see DEVIATIONS.md). The real gems' probabilities depend on the level, as
 * setgemprobs() (called by oinit() for the level being made) sets them: `ledger` is that level's
 * (gem.ts gemLedger()). Returns null when the class has no objects with prob > 0.
 */
export function pickObjectOfClass(
  ctx: Pick<MkobjCtx, 'rng' | 'defs'>,
  cls: ObjectClass,
  ledger = 1,
): ObjectDef | null {
  const list = ctx.defs.objects.filter((o) => o.class === cls);
  const probOf = (o: ObjectDef): number => (cls === 'gem' ? gemProb(o, ledger) : o.prob);
  const total = list.reduce((a, o) => a + probOf(o), 0);
  if (total <= 0) return null;
  let prob = ctx.rng.rnd(total);
  for (const o of list) {
    prob -= probOf(o);
    if (prob <= 0) return o;
  }
  return list[list.length - 1] ?? null;
}

/**
 * A random object of the given class, or of a random class (`'random'`) according to
 * mkobjprobs[]. Returns the new object's id, or null when the rolled class is not implemented
 * (the class roll is still made). With `opts.at` the object is placed on the floor; a
 * container gets its contents.
 * ref: src/mkobj.c mkobj(), mkobj_at(), and mksobj() for a corpse (random monster).
 */
export function mkobj(
  ctx: MkobjCtx,
  oclass: ObjectClass | 'random',
  opts: MkobjOpts = {},
): EntityId | null {
  const cls = oclass === 'random' ? rollClass(ctx, MKOBJ_PROBS) : oclass;
  if (cls === null) return null;
  const ledger = gemLedger(ctx.state, opts.level ?? opts.at?.level ?? ctx.state.currentLevel);
  const def = pickObjectOfClass(ctx, cls, ledger);
  if (!def) return null;
  const where = opts.at ? { at: opts.at } : {};
  const artif = opts.artif ?? true;
  if (def.id === 'nh:corpse') return mksobjCorpse(ctx, def, { artif, ...where }, opts);
  return mksobjFull(ctx, def, { artif, ...where }, opts);
}

/**
 * A corpse of a random monster, as mksobj(CORPSE, TRUE, artif) makes it.
 * ref: src/mkobj.c mksobj() CORPSE: corpsenm = undead_to_corpse(rndmonnum()), up to 50
 * tries to avoid G_NOCORPSE types; then the rot timer (made with level-creation variance
 * when the level is not the current one, as in_mklev does).
 */
export function mksobjCorpse(
  ctx: MkobjCtx,
  def: ObjectDef,
  opts: Pick<MksobjOpts, 'artif' | 'at'>,
  gen: Pick<MkobjOpts, 'level' | 'inMklev'> = {},
): EntityId {
  let mon = rndmonnum(ctx, depthOf(ctx, gen.level ?? opts.at?.level));
  for (let tries = 50; mon.genFlags.includes('nocorpse') && --tries > 0;)
    mon = rndmonnum(ctx, depthOf(ctx, gen.level ?? opts.at?.level));
  const id = mksobj(ctx, def, { corpseOf: mon.id as DefId, ...opts });
  startCorpseTimeout(ctx, id, gen.inMklev === true);
  return id;
}

/**
 * mksobj() with what this port does after the object exists: a container made with `init`
 * gets its contents (mkbox_cnts(), which NetHack runs inside mksobj_init(); boxes and bags
 * never erode, so no roll moves). Use this rather than items.ts mksobj() for generated objects.
 */
export function mksobjFull(
  ctx: MkobjCtx,
  def: ObjectDef,
  opts: MksobjOpts,
  gen: Pick<MkobjOpts, 'level' | 'inMklev'> = {},
): EntityId {
  const id = mksobj(ctx, def, opts);
  if ((opts.init ?? true) && def.container) {
    mkboxCnts(ctx, id, {
      level: gen.level ?? opts.at?.level ?? ctx.state.currentLevel,
      inMklev: gen.inMklev === true,
    });
  }
  return id;
}

/**
 * Fills a new container with random objects of the box classes; gold gets 2.5 times the
 * level's usual amount.
 * ref: src/mkobj.c mkbox_cnts(): chest 7 if locked else 5, large box 5 or 3, sack and oilskin
 * sack 1 (0 for the starting inventory), bag of holding 1; then `rn2(n + 1)` objects made with
 * mkobj(class, FALSE); a rock becomes a gem, glass or gray stone (rnd_class(DILITHIUM_CRYSTAL,
 * LOADSTONE), keeping its BUC and at most 2 of it, as C changes only the otyp). Ice boxes, bags
 * of holding getting a sack instead of a bag and no wand of cancellation do not arise in the
 * subset. Boxes are not trapped (see DEVIATIONS.md).
 */
export function mkboxCnts(
  ctx: MkobjCtx,
  boxId: EntityId,
  opts: { level: LevelId; inMklev: boolean },
): void {
  const box = ctx.state.entities[String(boxId)];
  if (!box?.c.item) return;
  let n: number;
  switch (box.def) {
    case 'nh:chest':
      n = box.c.item.locked ? 7 : 5;
      break;
    case 'nh:large_box':
      n = box.c.item.locked ? 5 : 3;
      break;
    case 'nh:sack':
    case 'nh:oilskin_sack':
      // initial inventory: sack starts out empty
      n = ctx.state.turn <= 1 && !opts.inMklev ? 0 : 1;
      break;
    case 'nh:bag_of_holding':
      n = 1;
      break;
    default:
      n = 0;
  }
  for (n = ctx.rng.rn2(n + 1); n > 0; n--) {
    const cls = rollClass(ctx, BOX_PROBS);
    if (cls === null) continue;
    const obj = mkobj(ctx, cls, { level: opts.level, inMklev: opts.inMklev, artif: false });
    if (obj === null) continue;
    const o = ctx.state.entities[String(obj)];
    const it = o?.c.item;
    if (it && cls === 'coin') {
      // 2.5 x level's usual amount
      it.quantity = ctx.rng.rnd(depthOf(ctx, opts.level) + 2) * ctx.rng.rnd(75);
    } else if (o && it) {
      while (o.def === 'nh:rock') {
        o.def = rndClass(ctx.rng, ctx.defs, BOX_ROCK_GEMS, gemLedger(ctx.state, opts.level));
        if (it.quantity > 2) it.quantity = 1;
      }
    }
    putIn(ctx.defs, ctx.state, boxId, obj);
  }
}

/** ref: src/mkobj.c mkobj_at() */
export function mkobjAt(
  ctx: MkobjCtx,
  oclass: ObjectClass | 'random',
  at: { level: LevelId; x: number; y: number },
  inMklev = false,
): EntityId | null {
  return mkobj(ctx, oclass, { at, inMklev });
}
