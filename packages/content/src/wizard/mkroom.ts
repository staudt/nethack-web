import { getLevel, getPlayer, type ActionDef, type Ctx } from '@nh/core';
import { FILLED_ZOO_KINDS, fillZoo } from '../zoo';

export const WIZ_MKROOM = 'wiz:mkroom';

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/** The ordinary room (not a subroom, not typed) whose floor holds the hero, or null. */
function heroRoom(ctx: Ctx): number | null {
  const level = getLevel(ctx.state);
  const p = getPlayer(ctx.state).c.pos;
  if (!p) return null;
  const i = level.rooms.findIndex(
    (r) => r.parent === undefined && p.x >= r.lx && p.x <= r.hx && p.y >= r.ly && p.y <= r.hy,
  );
  const r = level.rooms[i];
  return r && r.type === undefined ? i : null;
}

/**
 * Not in NetHack (it stands in for the wizard-mode SHOPTYPE and des.room): turns the ordinary
 * room the hero stands in into a special room of a chosen kind and fills it as level creation
 * would (fill_zoo(); her own square stays empty). Its entry message comes when she next moves
 * within or into it. Takes no time.
 */
export const wizMkroom: ActionDef = {
  id: WIZ_MKROOM,
  labelKey: 'action.wiz:mkroom',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_MKROOM }, labelKey: 'action.wiz:mkroom' }]
      : [],
  perform(ctx) {
    if (heroRoom(ctx) === null) {
      say(ctx, 'wiz.mkroom.no_room');
      return 0;
    }
    ctx.ask(
      {
        id: 'wiz-mkroom',
        kind: 'menu',
        key: 'wiz.mkroom.prompt',
        cancellable: true,
        options: FILLED_ZOO_KINDS.map((k) => ({ value: k, key: `wiz.mkroom.${k}` })),
      },
      WIZ_MKROOM,
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    const kind = FILLED_ZOO_KINDS.find((k) => k === value);
    if (kind === undefined) return 0;
    const i = heroRoom(ctx);
    const level = getLevel(ctx.state);
    const r = i === null ? undefined : level.rooms[i];
    if (i === null || !r) {
      say(ctx, 'wiz.mkroom.no_room');
      return 0;
    }
    r.type = kind;
    fillZoo(ctx, level, i, false);
    return 0;
  },
};
