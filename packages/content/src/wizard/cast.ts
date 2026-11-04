import type { ActionDef } from '@nh/core';
import { CAST_BOOKS, spelleffects } from '../cast';

export const WIZ_CAST = 'wiz:cast';

/**
 * #wizcast: cast any spell of the subset without knowing it, with no checks, no energy cost and
 * no skill practice (spelleffects() with `force`). A directional spell then asks its direction
 * as a normal cast does. The menu lists the eight castable books (NetHack lists every book from
 * dig to blank paper). Takes no time unless the spell does.
 * ref: src/spell.c dowizcast(), spelleffects(force = TRUE)
 */
export const wizCast: ActionDef = {
  id: WIZ_CAST,
  labelKey: 'action.wiz:cast',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_CAST }, labelKey: 'action.wiz:cast' }]
      : [],
  perform(ctx) {
    ctx.ask(
      {
        id: 'wiz-cast',
        kind: 'menu',
        key: 'wiz.cast.prompt',
        cancellable: true,
        options: CAST_BOOKS.map((b) => ({ value: b, key: `spell.name.${b}` })),
      },
      WIZ_CAST,
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    const book = CAST_BOOKS.find((b) => b === value);
    return book ? spelleffects(ctx, book, true) : 0; // dismissed: ECMD_OK
  },
};
