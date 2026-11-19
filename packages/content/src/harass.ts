// Carrying the Amulet of Yendor, and the Wizard of Yendor's harassment once he is dead or gone.
// Once a turn while she carries the Amulet: worn or wielded it hints at the level's magic portal,
// and a sleeping Wizard on her level may wake. Once the Wizard has been killed (or has left the
// dungeon), or the invocation has been performed, she is a "demigod" (u.uevent.udemigod): every
// udg_cnt turns something bad happens (intervene()): a nervous feeling, a black glow and random
// curses, the level aggravated, nasty monsters around her, or the Wizard back from the dead.
// ref: src/wizard.c amulet(), wizdeadorgone(), intervene(), resurrect(); src/allmain.c
// moveloop_core() (`if (u.uhave.amulet) amulet();` and the udg_cnt countdown); src/dog.c
// mon_arrive() (Wiz_arrive), keep_mon_accessible()
//
// Every monster stays on its own level in the state, so a Wizard on another level is as
// reachable as C's keep_mon_accessible() keeps him on the migrating list; one that left by the
// stairs, a trap or a level teleport (migrating) has no last-move time here (DEVIATIONS "The
// Wizard's harassment").
import {
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type Entity,
  type LevelChange,
  type ModApi,
} from '@nh/core';
import { PLANE_MESSAGES } from './endgame';
import { makemon, mnextoPos } from './generation';
import { hcolor } from './hcolor';
import { nhData } from './items';
import { inEndgame, isAstral, madeLevelFlags, setMadeLevelFlags } from './levelflags';
import { setU, uState, ualignBase } from './luck';
import { gainGuardianAngel } from './minion';
import { resetHostility } from './priest';
import { alignGname } from './gods';
import { endMigration, isMigrating } from './migrate';
import {
  aggravate,
  catchUpRegen,
  clearStrat,
  frozenTime,
  isFrozen,
  setMrevived,
  setWizdeadorgone,
  unfreezeMonst,
} from './mstate';
import { nasty } from './nasty';
import { theXname } from './objnam';
import { findPortal } from './portal';
import { P, hasProp, wornIn } from './props';
import { rndcurse } from './sit';
import { setMtrapped } from './trapstate';
import { AMULET_OF_YENDOR, monHasAmulet, uHave } from './uhave';
import { isWiz, noOfWizards, WIZARD_OF_YENDOR } from './wizstate';

/**
 * amulet(): the Amulet worn (or else wielded) feels hot within 3 squares of the level's magic
 * portal, very warm within 8 and warm within 12 (squared distances 9, 64, 144), 1 time in 15;
 * then a sleeping Wizard of Yendor on her level wakes 1 time in 40 ("You get the creepy feeling
 * that somebody noticed your taking the Amulet." unless he is next to her).
 * ref: src/wizard.c amulet()
 */
export function amulet(ctx: Ctx): void {
  const hero = getPlayer(ctx.state);
  const worn = wornIn(ctx.state, hero.id, 'amulet');
  const wielded = wornIn(ctx.state, hero.id, 'weapon');
  const amu =
    worn?.def === AMULET_OF_YENDOR ? worn : wielded?.def === AMULET_OF_YENDOR ? wielded : null;
  const pos = hero.c.pos;
  if (amu && pos && !ctx.rng.rn2(15)) {
    const portal = findPortal(getLevel(ctx.state, pos.level));
    if (portal) {
      const du = (pos.x - portal.x) ** 2 + (pos.y - portal.y) ** 2;
      const key =
        du <= 9 ? 'amulet.hot' : du <= 64 ? 'amulet.very_warm' : du <= 144 ? 'amulet.warm' : null;
      // else, the amulet feels normal
      if (key) ctx.emit({ type: 'msg', key, params: { item: theXname(ctx.state, ctx.defs, amu) } });
    }
  }
  if (!noOfWizards(ctx) || !pos) return;
  // find Wizard, and wake him if necessary
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    const mp = m?.c.pos;
    if (!m?.c.monster || mp?.level !== pos.level) continue;
    if (isWiz(ctx, id) && m.c.monster.asleep && !ctx.rng.rn2(40)) {
      m.c.monster.asleep = false;
      // m_next2u()
      if (Math.max(Math.abs(mp.x - pos.x), Math.abs(mp.y - pos.y)) > 1)
        ctx.emit({ type: 'msg', key: 'harass.creepy' });
      return;
    }
  }
}

/**
 * The Wizard of Yendor is being removed from play (dead or escaped the dungeon): the first time,
 * she becomes a demigod and the harassment starts in 50-299 turns. (no_of_wizards is counted
 * from the living Wizards: wizstate.ts.) ref: src/wizard.c wizdeadorgone()
 */
export function wizdeadorgone(ctx: Pick<Ctx, 'state' | 'rng'>): void {
  if (!uState(ctx.state).udemigod) setU(ctx, { udemigod: true, udgCnt: ctx.rng.rn2(250) + 50 }); // rn1(250, 50)
}
setWizdeadorgone(wizdeadorgone);

/**
 * How long a Wizard off her level has been away: since she left his level, or (one that left by
 * the stairs, a trap or a level teleport and is still migrating: no last-move time is kept) 1.
 */
function elapsedAway(ctx: Ctx, mon: Entity): number {
  const p = mon.c.pos;
  if (!p) return 1;
  const left = (nhData(ctx) as unknown as { levelLeft?: Record<string, number> }).levelLeft;
  return ctx.state.turn - (left?.[p.level] ?? ctx.state.turn);
}

/**
 * Brings the Wizard back to her: a new one next to her ("kill") when none is in play, else a
 * Wizard away from her level who is not carrying the Amulet ("elude"), caught up for his time
 * away (healed, maybe woken: 1 in elapsed/50 + 1 for each chance), coming next to her unless he
 * is helpless or there is no room; then "A voice booms out..." and "So thou thought thou couldst
 * kill me, fool." (or "elude"). He is hostile and does not wait for her.
 * ref: src/wizard.c resurrect(); src/dog.c mon_arrive() (Wiz_arrive: MIGR_WITH_HERO, no wander
 * here)
 */
export function resurrect(ctx: Ctx): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return;
  let mon: Entity | null = null;
  let verb: 'kill' | 'elude';
  if (!noOfWizards(ctx)) {
    // make a new Wizard
    verb = 'kill';
    const id = makemon(ctx, ctx.defs.monster(WIZARD_OF_YENDOR), hp, {
      adjacentOk: true,
      noWait: true,
    });
    // affects experience; he's not coming back from a corpse but is subject to repeated killing
    // like a revived corpse
    if (id !== null) {
      setMrevived(ctx, id);
      mon = ctx.state.entities[String(id)] ?? null;
    }
  } else {
    // look for a Wizard away from her level
    verb = 'elude';
    const level = getLevel(ctx.state, hp.level);
    for (const id of sortedIds(ctx.state)) {
      const m = ctx.state.entities[String(id)];
      if (!m?.c.monster || !isWiz(ctx, id)) continue;
      if (m.c.pos ? m.c.pos.level === hp.level : !isMigrating(ctx, id)) continue;
      // if he has the Amulet, he won't bring it to you
      if (monHasAmulet(ctx.state, id)) continue;
      let elapsed = elapsedAway(ctx, m);
      if (elapsed <= 0) continue;
      catchUpRegen(ctx, m, elapsed); // mon_catchup_elapsed_time()
      elapsed = Math.trunc(elapsed / 50);
      if (m.c.monster.asleep && ctx.rng.rn2(elapsed + 1)) m.c.monster.asleep = false;
      // would unfreeze on next move
      if (frozenTime(ctx, id) === 1) unfreezeMonst(ctx, id);
      if (m.c.monster.asleep || isFrozen(ctx, id)) continue; // helpless()
      // mon_arrive(mtmp, Wiz_arrive): next to her; with no room he stays away (m_into_limbo())
      const spot = mnextoPos(ctx, level, id, hp);
      if (spot) {
        endMigration(ctx, id);
        setMtrapped(ctx, id, false);
        m.c.pos = { level: hp.level, x: spot.x, y: spot.y };
        mon = m;
      }
      // note: there might be a second Wizard; if so, he'll have to wait until the next
      // resurrection
      break;
    }
  }
  if (!mon?.c.monster) return;
  clearStrat(ctx, mon.id, 'waitForU', 'close'); // STRAT_WAITMASK
  delete mon.c.monster.tame;
  mon.c.monster.peaceful = false; // paranoia
  ctx.emit({ type: 'msg', key: 'harass.voice_booms' });
  ctx.emit({ type: 'msg', key: `harass.so_thou_thought.${verb}` });
}

/**
 * Trouble for the one who did in the Wizard: a nervous feeling (2 in 6), "You notice a black glow
 * surrounding you." with random curses, the level aggravated, nasty monsters around her, or the
 * Wizard resurrected; on the Astral Plane neither the first nor the last.
 * ref: src/wizard.c intervene()
 */
export function intervene(ctx: Ctx): void {
  const which = isAstral(ctx.state) ? ctx.rng.rnd(4) : ctx.rng.rn2(6);
  // cases 0 and 5 don't apply on the Astral level
  switch (which) {
    case 0:
    case 1:
      ctx.emit({ type: 'msg', key: 'harass.nervous' });
      break;
    case 2:
      if (!hasProp(getPlayer(ctx.state), P.BLINDED))
        ctx.emit({ type: 'msg', key: 'harass.glow', params: { color: hcolor(ctx, 'black') } });
      rndcurse(ctx);
      break;
    case 3:
      aggravate(ctx);
      break;
    case 4:
      nasty(ctx, null);
      break;
    case 5:
      resurrect(ctx);
      break;
  }
}

/**
 * The demigod's countdown: each turn udg_cnt goes down (not while she is praying successfully)
 * and at 0 intervene() and a new count of 50-249. ref: src/allmain.c moveloop_core()
 */
function harassment(ctx: Ctx): void {
  const u = uState(ctx.state);
  if (!u.udemigod || u.uinvulnerable) return;
  let n = u.udgCnt ?? 0;
  if (n) n--;
  setU(ctx, { udgCnt: n });
  if (!n) {
    intervene(ctx);
    if (ctx.state.gameOver) return;
    setU(ctx, { udgCnt: ctx.rng.rn2(200) + 50 }); // rn1(200, 50)
  }
}

/**
 * The first arrival on the Astral Plane: the roaming priests and Angels of other gods turn on
 * her, then her guardian angel comes if she is worthy. ref: src/do.c final_level() (its
 * create_mplayers(rn1(4, 3), TRUE) is m23 step 9's, between the two)
 */
export function finalLevel(ctx: Ctx): void {
  const lev = ctx.state.currentLevel;
  // reset monster hostility relative to player
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && e.c.pos?.level === lev) resetHostility(ctx, id);
  }
  // create a guardian angel next to player, if worthy
  gainGuardianAngel(ctx);
}

/**
 * Arriving on a plane: its des.message() lines on the first arrival, then on the Astral Plane's
 * first arrival final_level(), else on entering the endgame with the Amulet the Wizard comes back
 * to force a confrontation.
 * ref: src/do.c goto_level() deliver_splev_message(), "special location arrival messages/events"
 */
export function endgameArrival(ctx: Ctx, change: LevelChange): void {
  const to = ctx.state.levels[change.to];
  if (!to || !inEndgame(ctx.state, to)) return;
  const isNew = madeLevelFlags(ctx.state, change.to).visited !== true;
  if (isNew) setMadeLevelFlags(ctx, change.to, { visited: true });
  const lines = to.def === undefined ? undefined : PLANE_MESSAGES[to.def];
  if (isNew && lines)
    for (const m of lines)
      ctx.emit(
        m.god
          ? {
              type: 'msg',
              key: m.key,
              params: { god: alignGname(ctx.state, ualignBase(ctx.state)) },
            }
          : { type: 'msg', key: m.key },
      );
  const from = change.from === null ? undefined : ctx.state.levels[change.from];
  const newdungeon = from !== undefined && from.dungeon !== to.dungeon;
  if (isNew && isAstral(ctx.state, to))
    finalLevel(ctx); // guardian angel, &c
  else if (newdungeon && uHave(ctx.state, 'amulet')) resurrect(ctx); // force confrontation
}

/**
 * amulet() once a turn while she carries the Amulet, after invault() (priority -10); the
 * harassment after the engraving scuff (-11), as moveloop_core() orders them; the endgame's
 * arrival events.
 */
export function registerHarass(api: ModApi): void {
  api.on('levelChange', endgameArrival);
  api.on(
    'endOfTurn',
    (ctx) => {
      if (uHave(ctx.state, 'amulet')) amulet(ctx);
    },
    { priority: -10.5 },
  );
  api.on(
    'endOfTurn',
    (ctx) => {
      if (ctx.state.gameOver === null) harassment(ctx);
    },
    { priority: -11.5 },
  );
}
