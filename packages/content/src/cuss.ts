// Imps and other vile monsters curse the hero, the Wizard of Yendor in his own words.
// ref: src/wizard.c cuss(), random_insult[], random_malediction[]; the demons' lines are
// dat/quest.lua questtext demon_cuss, delivered by src/questpgr.c com_pager() (a random entry of
// the array)
import { getPlayer, type Ctx, type Entity, type Msg } from '@nh/core';
import { wakeNearto } from './noise';
import { monNam } from './perception';
import { isWiz } from './wizstate';

/** ref: src/wizard.c random_insult[]: how many there are (`cuss.insult.1`...) */
export const INSULTS = 28;
/** ref: src/wizard.c random_malediction[]: how many there are (`cuss.malediction.1`...) */
export const MALEDICTIONS = 11;

/** ref: dat/quest.lua demon_cuss: how many lines it has */
export const DEMON_CUSS_LINES = 27;

/** ROLL_FROM(random_insult) */
const insult = (ctx: Pick<Ctx, 'rng'>): Msg => ({
  key: `cuss.insult.${ctx.rng.rn2(INSULTS) + 1}`,
});

/**
 * The Wizard laughs fiendishly one time in five; else, when she is nearly dead, he gloats half
 * the time ("Even now thy life force ebbs, ..."), when he is, he promises to return half the
 * time, and otherwise curses her. ref: src/wizard.c cuss() (the iswiz branch; she never has the
 * Amulet, so never "Relinquish the amulet, ...!")
 */
function wizardCuss(ctx: Ctx, mon: Entity): void {
  const params = { mon: monNam(ctx, mon) };
  if (!ctx.rng.rn2(5)) {
    // typical bad guy action
    ctx.emit({ type: 'msg', key: 'cuss.wiz.laughs', params });
  } else if ((getPlayer(ctx.state).c.hp?.cur ?? 0) < 5 && !ctx.rng.rn2(2)) {
    // Panic
    const key = ctx.rng.rn2(2) ? 'cuss.wiz.ebbs' : 'cuss.wiz.savor';
    ctx.emit({ type: 'msg', key, params: { insult: insult(ctx) } });
  } else if ((mon.c.hp?.cur ?? 0) < 5 && !ctx.rng.rn2(2)) {
    // Parthian shot
    ctx.emit({ type: 'msg', key: ctx.rng.rn2(2) ? 'cuss.wiz.return' : 'cuss.wiz.be_back' });
  } else {
    const mal = { key: `cuss.malediction.${ctx.rng.rn2(MALEDICTIONS) + 1}` };
    ctx.emit({ type: 'msg', key: 'cuss.wiz.curse', params: { mal, insult: insult(ctx) } });
  }
}

/**
 * A monster's "extra emotional attack": the Wizard's own lines (wizardCuss()); any other casts
 * aspersions on her ancestry one time in five, else says one of the demon_cuss lines; nearby
 * monsters wake. ref: src/wizard.c cuss() (no minions exist here; the hero is never Deaf)
 */
export function cuss(ctx: Ctx, mon: Entity): void {
  if (isWiz(ctx, mon.id)) wizardCuss(ctx, mon);
  else if (!ctx.rng.rn2(5))
    ctx.emit({ type: 'msg', key: 'cuss.aspersions', params: { mon: monNam(ctx, mon) } });
  else {
    // com_pager(): `nelems = rn2(nelems) + 1`
    const n = ctx.rng.rn2(DEMON_CUSS_LINES) + 1;
    ctx.emit({ type: 'msg', key: `cuss.demon.${n}` });
  }
  const p = mon.c.pos;
  if (p) wakeNearto(ctx, p.x, p.y, 5 * 5);
}
