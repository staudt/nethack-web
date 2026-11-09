// Cutting a long worm in two: a blow that lands on its tail. Above clone.ts (the cut-off part
// becomes a new worm); combat.ts and dothrow.ts reach it through a late binding.
// ref: src/worm.c cutworm()
import type { Ctx, EntityId } from '@nh/core';
import { cloneMon } from './clone';
import { canSpotMon, monNam } from './perception';
import { setWormRec, wormRec, wormnoFree } from './wormstate';
import { shrinkWorm } from './worm';
import { setCutworm } from './combat';

const ent = (ctx: Pick<Ctx, 'state'>, id: EntityId) => ctx.state.entities[String(id)];

/**
 * A blow that hit the worm landed on its tail at (x, y): with a cut chance (better with a blade
 * or an axe) the tail is cut there. The tail end just goes; elsewhere the part behind the cut
 * becomes a new worm (a worm of level 3 or more, 1 time in 3, when a worm number is free and it
 * can be cloned: both halves then drop 2 levels, to no less than 3, and get new hit points) or
 * is lost, and the worm's hit points are halved. ref: src/worm.c cutworm()
 */
export function cutworm(
  ctx: Ctx,
  worm: EntityId,
  x: number,
  y: number,
  cuttier: boolean,
  monMoving = false,
): void {
  const w = ent(ctx, worm);
  const rec = wormRec(ctx.state, worm);
  const wp = w?.c.pos;
  if (!w || !rec || !wp) return; // bullet-proofing
  if (x === wp.x && y === wp.y) return; // hit on head
  // "cutting goes best with a cuttier weapon": 1-16 does not cut, 17-20 does; +10 with a blade
  let cutChance = ctx.rng.rnd(20);
  if (cuttier) cutChance += 10;
  if (cutChance < 17) return;
  const k = rec.segs.findIndex((s) => {
    const p = ent(ctx, s)?.c.pos;
    return p?.x === x && p.y === y;
  });
  if (k < 0) return; // impossible("cutworm: no segment at ...")
  // "If this is the tail segment, then the worm just loses it."
  if (k === 0) {
    shrinkWorm(ctx, worm);
    return;
  }
  // "Split the worm": the old worm keeps what follows the cut; the cut segment would be the new
  // worm's head and the part before it its tail
  const newTail = rec.segs.slice(0, k);
  const cut = rec.segs[k] as EntityId;
  setWormRec(ctx, worm, { segs: rec.segs.slice(k + 1), wgrowtime: rec.wgrowtime });
  const mlev = w.c.monster?.level ?? 0;
  const newWnum = mlev >= 3 && !ctx.rng.rn2(3) && wormnoFree(ctx.state, wp.level);
  let newWorm: EntityId | null = null;
  if (newWnum) {
    ctx.remove(cut); // remove_monster(x, y): clone_mon puts the new head here
    newWorm = cloneMon(ctx, worm, monMoving, { x, y });
  }
  // "Sometimes the tail end dies."
  if (newWorm === null) {
    const name = monNam(ctx, w);
    if (monMoving) {
      if (canSpotMon(ctx, w))
        ctx.emit({ type: 'msg', key: 'worm.tail_cut_off', params: { mon: name } });
    } else ctx.emit({ type: 'msg', key: 'worm.you_cut_tail', params: { mon: name } });
    for (const s of [...newTail, cut]) if (ent(ctx, s)) ctx.remove(s);
    const hp = w.c.hp;
    if (hp && hp.cur > 1) hp.cur = Math.trunc(hp.cur / 2);
    return;
  }
  // "Devalue the monster level of both halves of the worm."
  const nw = ent(ctx, newWorm);
  const m = w.c.monster;
  if (m) m.level = Math.max(m.level - 2, 3);
  const nm = nw?.c.monster;
  if (nm && m) nm.level = m.level;
  // "use <N>d8 for long worms"
  const nhp = nw?.c.hp;
  if (nhp && nm) nhp.max = nhp.cur = ctx.rng.d(nm.level, 8);
  const hp = w.c.hp;
  if (hp && m) {
    hp.max = ctx.rng.d(m.level, 8);
    if (hp.max < hp.cur) hp.cur = hp.max;
  }
  setWormRec(ctx, newWorm, { segs: newTail, wgrowtime: 0 });
  const key = monMoving ? 'worm.cut_in_half' : 'worm.you_cut_in_half';
  ctx.emit({ type: 'msg', key, params: { mon: monNam(ctx, w) } });
}

setCutworm(cutworm);
