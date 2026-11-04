import { getPlayer, type ActionDef, type Ctx } from '@nh/core';
import { MAXULEV, pluslvl } from '../hero';
import { mungspaces } from '../objnam_read';

export const WIZ_LEVELCHANGE = 'wiz:levelchange';

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/**
 * #levelchange: set the hero's experience level. Raising it gains the levels one at a time as a
 * potion of gain level does (pluslvl(FALSE): "You feel more experienced.", HP and Pw for each);
 * lowering it is refused, since level drain (losexp()) is not ported. Takes no time (ECMD_OK).
 * There is no u.ulevelmax to reset (no level drain to restore from).
 * ref: src/wizcmds.c wiz_level_change(), src/exper.c pluslvl()
 */
export const wizLevelchange: ActionDef = {
  id: WIZ_LEVELCHANGE,
  labelKey: 'action.wiz:levelchange',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_LEVELCHANGE }, labelKey: 'action.wiz:levelchange' }]
      : [],
  perform(ctx) {
    ctx.ask(
      {
        id: 'wiz-levelchange',
        kind: 'text',
        key: 'wiz.levelchange.prompt',
        maxLength: 10,
        numeric: true,
      },
      WIZ_LEVELCHANGE,
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    // sscanf(buf, "%d%c") == 1: a whole number and nothing after it; Escape or empty: never mind
    const buf = typeof value === 'string' ? mungspaces(value) : '';
    if (!/^[+-]?\d+$/.test(buf)) {
      say(ctx, 'wiz.levelchange.never_mind');
      return 0;
    }
    let newlevel = Number(buf);
    const h = getPlayer(ctx.state);
    const xp = h.c.experience;
    if (!xp) return 0;
    if (newlevel === xp.level) {
      say(ctx, 'wiz.levelchange.already');
    } else if (newlevel < xp.level) {
      say(ctx, xp.level === 1 ? 'wiz.levelchange.min' : 'wiz.levelchange.cannot_lower');
    } else {
      if (xp.level >= MAXULEV) {
        say(ctx, 'wiz.levelchange.max');
        return 0;
      }
      if (newlevel > MAXULEV) newlevel = MAXULEV;
      while (xp.level < newlevel) {
        const before = xp.level;
        pluslvl(ctx, h.id, false);
        if (xp.level === before) break; // no hp component: pluslvl() did nothing
      }
    }
    return 0;
  },
};
