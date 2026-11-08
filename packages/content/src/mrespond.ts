// A monster's response to the hero's presence or actions (not a passive attack): the shrieker's
// shriek. ref: src/mon.c m_respond(), m_respond_shrieker(). Medusa's gaze and the Erinyes'
// aggravation have no monster here yet.
import { getLevel, getPlayer, type Ctx, type Entity } from '@nh/core';
import { stopOccupation } from './eat';
import { makemon, monmaxDifficulty } from './generation';
import { aggravate } from './mstate';
import { monNam } from './perception';

/**
 * ref: src/mon.c m_respond(): a shrieker (MS_SHRIEK) within one square of the hero shrieks.
 * Called from dochug() each action and from bhitm() when a wand wakes it.
 */
export function mRespond(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const mp = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  if (!mp || !hp || mp.level !== hp.level) return;
  // `!um_dist(mtmp->mx, mtmp->my, 1)`
  if (def.sound === 'shriek' && Math.max(Math.abs(mp.x - hp.x), Math.abs(mp.y - hp.y)) <= 1)
    mRespondShrieker(ctx, mon);
}

/**
 * Shriek, maybe summon a monster, aggravate. "1/10 chance per shriek to create a monster"; the new
 * monster "has a 1/13 chance to be a purple worm, random otherwise; baby purple worm if adult is
 * too difficult". ref: src/mon.c m_respond_shrieker() (the hero is never Deaf)
 */
function mRespondShrieker(ctx: Ctx, mon: Entity): void {
  // (the same line as #chat's MS_SHRIEK in domonnoise())
  ctx.emit({ type: 'msg', key: 'chat.shrieks', params: { mon: monNam(ctx, mon) } });
  stopOccupation(ctx);
  if (!ctx.rng.rn2(10)) {
    let def = null;
    if (!ctx.rng.rn2(13)) {
      // montoostrong(PM_PURPLE_WORM, monmax_difficulty_lev())
      const worm = ctx.defs.monster('nh:purple_worm');
      const depth = getLevel(ctx.state, mon.c.pos?.level).depth; // level_difficulty()
      const ulevel = getPlayer(ctx.state).c.experience?.level ?? 1;
      const tooStrong = worm.difficulty > monmaxDifficulty(depth, ulevel);
      def = tooStrong ? ctx.defs.monster('nh:baby_purple_worm') : worm;
    }
    makemon(ctx, def, null);
  }
  aggravate(ctx);
}
