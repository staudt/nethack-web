import type { ActionDef, Ctx, GameOver, Json } from '@nh/core';

export const WIZ_DIE = 'wiz:die';

/** The death being asked about, carried by the prompt. */
interface DieData {
  over: GameOver;
}

/** modData.wiz: set once "Die?" is answered yes, so the hook lets that game over through. */
interface WizData {
  dieConfirmed?: boolean;
}

const wizData = (ctx: Ctx): WizData => {
  const d = (ctx.state.modData['wiz'] ?? {}) as WizData;
  ctx.state.modData['wiz'] = d as unknown as Json;
  return d;
};

/**
 * Wizard mode's "Die?": a `beforeGameOver` hook that keeps a dying hero's game going and asks.
 * Content's done() restores her at once (savelife(), as after "no", so the rest of the turn sees
 * a living hero; time stops while the question is pending); answering yes ends the game with the
 * death as it was, no says "OK, so you don't die." Only deaths ask, not escaping the dungeon,
 * and an amulet of life saving comes first (done() does not reach the hook then).
 * ref: src/end.c done(): `(wizard || discover) && how <= GENOCIDED &&
 * !paranoid_query(ParanoidDie, "Die?")`
 */
export function wizBeforeGameOver(ctx: Ctx, over: GameOver): 'continue' | 'cancel' {
  if (over.kind !== 'died' || wizData(ctx).dieConfirmed === true) return 'continue';
  ctx.ask({ id: 'die', kind: 'yn', key: 'wiz.die.prompt' }, WIZ_DIE, {
    over,
  } as unknown as Json);
  return 'cancel';
}

/** Answers "Die?"; offered nowhere (only the hook asks). */
export const wizDie: ActionDef = {
  id: WIZ_DIE,
  labelKey: 'action.wiz:die',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer(ctx, value, raw) {
    const data = raw as unknown as DieData | null;
    if (value === true && data) {
      wizData(ctx).dieConfirmed = true;
      ctx.endGame(data.over);
      return 0;
    }
    // the choking deaths of eat.c choke() are the "@killer.choked.*" ones
    const choked = data?.over.killer.startsWith('@killer.choked.') === true;
    ctx.emit({ type: 'msg', key: choked ? 'wiz.die.ok_choke' : 'wiz.die.ok' });
    return 0;
  },
};
