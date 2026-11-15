// The dungeon's new-game draw and Gehennom's arrival: the Castle's passtune is drawn right after
// the dungeon layout; arriving on the Valley of the Dead from outside Gehennom gives its three
// lines; being on any other Gehennom level, or saying yes at the Valley's gate, marks Gehennom
// entered; every level change ends with the level temperature's lines (temperature.ts).
// ref: src/dungeon.c init_dungeons() init_castle_tune(); src/do.c goto_level(), dodown(),
// temperature_change_msg()
import type { Ctx, DefId, ModApi } from '@nh/core';
import { gehennomEntered, setCastleTune, setGehennomEntered } from './dbstate';
import { inHell, isValley } from './levelflags';
import { temperatureChangeMsg } from './temperature';
import { heroForm } from './upoly';

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
    const valley = isValley(ctx.state);
    // "Check whether we just entered Gehennom."
    if (from && !inHell(ctx.state, from) && valley) {
      say(ctx, 'gehennom.valley_arrive');
      say(ctx, 'gehennom.valley_odor');
      say(ctx, 'gehennom.valley_groans'); // (she is never deaf here)
    }
    // "in case we've managed to bypass the Valley's stairway down"
    if (!valley) setGehennomEntered(ctx);
  });
  // ref: src/do.c goto_level(): temperature_change_msg(prev_temperature) last
  api.on('levelChange', (ctx, change) => {
    const from = change.from === null ? undefined : ctx.state.levels[change.from];
    const to = ctx.state.levels[change.to];
    if (from && to) temperatureChangeMsg(ctx, from, to, heroForm(ctx));
  });
}

/**
 * dodown() on the Valley's down stairs before she has entered Gehennom: "You are standing at the
 * gate to Gehennom.", "Unspeakable cruelty and harm lurk down there." and the question "Are you
 * sure you want to enter?" (the action's `answer` goes on with "So be it." and the stairs). False
 * when there is nothing to ask. ref: src/do.c dodown()
 */
export function askGehennomGate(ctx: Ctx, action: DefId): boolean {
  if (!isValley(ctx.state) || gehennomEntered(ctx)) return false;
  say(ctx, 'gehennom.gate');
  say(ctx, 'gehennom.gate_cruelty');
  ctx.ask(
    { id: GEHENNOM_GATE, kind: 'yn', key: 'gehennom.gate_confirm', cancellable: true },
    action,
    null,
  );
  return true;
}

/** The gate question's prompt id. */
export const GEHENNOM_GATE = 'gehennom-gate';

/** She answered yes at the gate: "So be it.", and she is not asked again. */
export function enterGehennomGate(ctx: Ctx): void {
  say(ctx, 'gehennom.so_be_it');
  setGehennomEntered(ctx); // don't ask again
}

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });
