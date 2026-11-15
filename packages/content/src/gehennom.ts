// The dungeon's new-game draw and Gehennom's arrival (m15 stub): the Castle's passtune is drawn
// right after the dungeon layout, and entering Gehennom says so and marks it entered.
// ref: src/dungeon.c init_dungeons() init_castle_tune(); src/do.c goto_level()
import type { Ctx, ModApi } from '@nh/core';
import { setCastleTune, setGehennomEntered } from './dbstate';
import { inHell } from './levelflags';

/**
 * The passtune: five notes `'A' + rn2(7)`, drawn once at new game after the dungeon rolls.
 * ref: src/dungeon.c init_castle_tune()
 */
export function initCastleTune(ctx: Pick<Ctx, 'state' | 'rng'>): void {
  let tune = '';
  for (let i = 0; i < 5; i++) tune += String.fromCharCode(65 + ctx.rng.rn2(7));
  setCastleTune(ctx, tune);
}

export function registerGehennom(api: ModApi): void {
  // ref: src/allmain.c newgame(): init_dungeons() (which ends with init_castle_tune()) comes
  // before everything else the vanilla newGame hooks do; the layout is rolled by the engine
  api.on('newGame', (ctx) => initCastleTune(ctx), { priority: 200 });
  api.on('levelChange', (ctx, change) => {
    if (change.from === null || !inHell(ctx.state)) return;
    const from = ctx.state.levels[change.from];
    // "Check whether we just entered Gehennom." There is no Valley of the Dead (its three
    // arrival lines) yet, so every way in gets NetHack 3.6's message for the other levels
    if (from && !inHell(ctx.state, from)) ctx.emit({ type: 'msg', key: 'gehennom.hot' });
    // "in case we've managed to bypass the Valley's stairway down"
    setGehennomEntered(ctx);
  });
}
