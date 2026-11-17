// What wielded artifacts show: Sting's (Orcrist's, Grimtooth's) glow while the monsters it
// warns of are on her level, and Sunsword's light. Checked after each of her actions and each
// turn (C's see_monsters() once per player input) from the worn-property cache.
// ref: src/artifact.c Sting_effects(), glow_strength(), glow_verb(), glow_color(),
// artifact_light(); src/display.c see_monsters(); src/wield.c ready_weapon(), setuwep(); src/light.c
// arti_light_radius(), arti_light_description()
import {
  getPlayer,
  inventoryOf,
  sortedIds,
  type Ctx,
  type Entity,
  type GameState,
  type ModApi,
  type Msg,
} from '@nh/core';
import { artiOf, bareArtifactName, isArt } from './artistate';
import { hcolor, type ColorName } from './hcolor';
import { artiLightRadius } from './light';
import { setU, uState } from './luck';
import { theXname } from './objnam';
import { P, hasProp, heroHas, warnOfMonFlags } from './props';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const SUNSWORD = 'nh:sunsword';

/** The hero's wielded weapon (uwep), or null. */
const uwepOf = (state: Readonly<GameState>): Entity | null =>
  inventoryOf(state, state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null;

/**
 * Relative strength of Sting's glow for `count` monsters warned of: 0..3, the verb quivers
 * (blind), flickers, glimmers, gleams. ref: src/artifact.c glow_strength()
 */
export const glowStrength = (count: number): number =>
  count > 12 ? 3 : count > 4 ? 2 : count > 0 ? 1 : 0;

/** The glow colour of an artifact (C's clr2colorname()); the table's colours of the three. */
const glowColor = (ctx: Ctx, color: string | null): Msg =>
  hcolor(ctx, (color === 'bright_blue' ? 'light_blue' : (color ?? 'white')) as ColorName);

/**
 * The count of monsters on her level she is warned of has gone from `old` to `count`: Sting
 * starts glowing ("Sting flickers light blue!", "." when weaker; blind and from nothing: "Sting
 * quivers slightly.") or stops ("Sting stops flickering."). ref: src/artifact.c Sting_effects()
 * (no blindness toggling: Sting_effects(-1))
 */
function stingEffects(ctx: Ctx, old: number, count: number): void {
  const uwep = uwepOf(ctx.state);
  const a = artiOf(uwep);
  if (!uwep || !a || !['nh:sting', 'nh:orcrist', 'nh:grimtooth'].includes(a.id)) return;
  const blind = hasProp(getPlayer(ctx.state), P.BLINDED);
  const oldstr = glowStrength(old);
  const newstr = glowStrength(count);
  const item = `=${bareArtifactName(a)}`;
  if (newstr > 0 && newstr !== oldstr) {
    if (!blind)
      say(ctx, newstr > oldstr ? 'arti.glow.start_up' : 'arti.glow.start_down', {
        item,
        verb: `@arti.glow.verb.${newstr}`,
        color: glowColor(ctx, a.color),
      });
    else if (oldstr === 0) say(ctx, 'arti.glow.quivers_slightly', { item });
  } else if (count === 0 && old > 0) {
    say(ctx, 'arti.glow.stops', {
      item,
      verbing: `@arti.glow.ing.${blind ? 0 : glowStrength(old)}`,
    });
  }
}

/**
 * Counts the monsters on her level whose kind a wielded artifact warns of, and makes Sting glow
 * or stop when the count changed (gw.warn_obj_cnt is `warnObjCnt` in modData.nh.u).
 * ref: src/display.c see_monsters()
 */
export function seeMonstersWarn(ctx: Ctx): void {
  let count = 0;
  if (heroHas(ctx.state, P.WARN_OF_MON)) {
    const flags = warnOfMonFlags(ctx.state);
    const level = getPlayer(ctx.state).c.pos?.level;
    for (const id of sortedIds(ctx.state)) {
      const m = ctx.state.entities[String(id)];
      if (!m?.c.monster || m.c.pos?.level !== level || !ctx.defs.isMonster(m.def)) continue;
      const mf = ctx.defs.monster(m.def).flags;
      if (flags.some((f) => mf.includes(f))) count++;
    }
  }
  const old = uState(ctx.state).warnObjCnt ?? 0;
  if (count === old) return;
  stingEffects(ctx, old, count);
  setU(ctx, { warnObjCnt: count });
}

/**
 * Sunsword starts shining when she wields it ("Sunsword begins to shine brightly!") and stops
 * when it is no longer wielded, by whatever cause ("Sunsword stops shining."); not seen while
 * blind. The shining one is remembered in `modData.nh.u.sunLit`. ref: src/wield.c
 * ready_weapon(), setuwep(), uwepgone() (no messages for monsters wielding it)
 */
export function sunswordShine(ctx: Ctx): void {
  const lit = uState(ctx.state).sunLit ?? undefined;
  const uwep = uwepOf(ctx.state);
  const now = uwep && isArt(uwep, SUNSWORD) ? uwep.id : undefined;
  if (lit === now) return;
  const blind = hasProp(getPlayer(ctx.state), P.BLINDED);
  const old = lit === undefined ? undefined : ctx.state.entities[String(lit)];
  if (old && !blind) say(ctx, 'arti.light.stops', { item: theXname(ctx.state, ctx.defs, old) });
  if (uwep && now !== undefined && !blind)
    say(ctx, 'arti.light.begins', {
      item: theXname(ctx.state, ctx.defs, uwep),
      how: `@arti.light.${artiLightRadius(uwep)}`,
    });
  setU(ctx, { sunLit: now ?? null });
}

/** Registers the glow and light checks (Sunsword's light source is light.ts objLights()). */
export function registerArtiGlow(api: ModApi): void {
  const check = (ctx: Ctx): void => {
    if (ctx.state.gameOver) return;
    sunswordShine(ctx);
    seeMonstersWarn(ctx);
  };
  api.on('afterAction', check);
  api.on('endOfTurn', check);
}
