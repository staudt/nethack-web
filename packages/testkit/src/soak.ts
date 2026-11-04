import {
  DIRS,
  VANILLA_TERRAIN,
  DIR_LIST,
  createEngine,
  createRng,
  getPlayer,
  inRooms,
  inventoryOf,
  seedRng,
  sortedIds,
  specialLevelAt,
  stateHash,
  type ActionOffer,
  type Dir,
  type EntityId,
  type GameState,
  type HungerState,
  type Json,
  type Mod,
  type PlayerAction,
  type Pos,
  type Prompt,
  type Rng,
} from '@nh/core';
import { checkInvariants } from './invariants';

export interface SoakOptions {
  seed: number;
  turns: number;
  width?: number;
  height?: number;
  botSeed?: number;
  checkEvery?: number;
  /** The bot stops descending below this dungeon depth. Default: unlimited. */
  maxDepth?: number;
  /** Return violations instead of throwing. */
  collect?: boolean;
}

export interface SoakViolation {
  step: number;
  action: PlayerAction | null;
  errors: string[];
}

export interface SoakResult {
  actions: number;
  finalHash: string;
  turns: number;
  violations: SoakViolation | null;
  cellsExplored: number;
  /** Greatest dungeon depth the hero reached. */
  deepestLevel: number;
  /** Deepest level number (`dlevel`) the hero reached in each dungeon she entered, by dungeon id. */
  dungeons: Record<string, number>;
  /** The special levels (`DungeonLayout.special` ids, such as 'nh:minetown') the hero stood on, sorted. */
  specialLevels: string[];
  /** Monsters the hero killed or destroyed (counted from 'combat.you_kill'/'combat.you_destroy' messages). */
  kills: number;
  /** The actions taken, so a failure can be replayed. */
  log: PlayerAction[];
  /** How the run ended: still playing at the turn limit, or the game ended. */
  outcome: 'playing' | 'died' | 'escaped';
  /** Objects the hero gained through pickup actions (sum of quantity gained, gold excluded). */
  pickedUp: number;
  /** Eat, quaff, read and throw actions the bot issued (an action may be refused by the game). */
  eaten: number;
  quaffed: number;
  read: number;
  thrown: number;
  /** Kicks (door offers and the plain #kick), `nh:fire` volleys, #enhance menus answered, weapon swaps. */
  kicks: number;
  /** Prayers the bot started (it prays only when Weak or low on hit points). */
  prayed: number;
  /** Times a pet came along to another level. */
  petsFollowed: number;
  fired: number;
  enhanced: number;
  swapped: number;
  /** Wands zapped (`nh:zap`), floor containers looted (`nh:loot`), rings and amulets put on. */
  zapped: number;
  /** Times the bot opened the spell menu (`nh:cast`; it picks a spell at random, which may fail). */
  cast: number;
  looted: number;
  putOn: number;
  /** Text prompts answered with a string, and count-menu entries answered with a partial count. */
  textAnswers: number;
  countAnswers: number;
  /** Chats with a temple priest (`nh:chat`). */
  chatted: number;
  /** Times the bot paid (`nh:pay`) while owing in a shop. */
  paid: number;
  /** Times the bot drank from or dipped into a fountain (its own fountain branch). */
  fountain: number;
  /** The hero's hunger state when the run stopped (null if she has no hunger component). */
  hunger: HungerState | null;
}

/** Direction from `from` to `to` when they are in line (orthogonal or diagonal), else null. */
function lineDir(from: Pos, to: Pos): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  for (const d of DIR_LIST) {
    const v = DIRS[d];
    if (v.x === sx && v.y === sy) return d;
  }
  return null;
}

const isMod = (a: PlayerAction, id: string): boolean => a.type === 'mod' && a.action === id;

/**
 * A seeded bot that plays like a player would, driven only by `actionsFor()` offers. Priority:
 * (while a multi-turn action is in progress: usually `continue`, sometimes cancel it) attack an adjacent hostile; zap wands at
 * monsters in line; now and then cast a known spell; eat when hungry; quaff when hurt; pick things up; loot containers; occasionally
 * wield, wear, take off, put on, read, throw daggers at monsters in line, drop; take stairs down;
 * else a random offer. Prompts (trap confirmations, ring hands, zap directions, loot menus) are
 * answered generically by kind. Checks invariants as it goes.
 */
export function soak(mods: readonly Mod[], opts: SoakOptions): SoakResult {
  const engine = createEngine(mods);
  const { state } = engine.newGame({
    seed: opts.seed,
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
  });
  const rng: Rng = createRng(seedRng(opts.botSeed ?? opts.seed ^ 0x5eed));
  const every = Math.max(1, opts.checkEvery ?? 1);
  const maxActions = opts.turns * 20;
  const log: PlayerAction[] = [];
  let kills = 0;
  let deepest = 1;
  const dungeons: Record<string, number> = {};
  const specialLevels: string[] = [];
  const noteDungeon = (): void => {
    const lv = state.levels[state.currentLevel];
    if (lv) dungeons[lv.dungeon] = Math.max(dungeons[lv.dungeon] ?? 0, lv.dlevel);
    const sp = lv && specialLevelAt(state, { dungeon: lv.dungeon, dlevel: lv.dlevel });
    if (sp && !specialLevels.includes(sp.id)) specialLevels.push(sp.id);
  };
  noteDungeon();
  let pickedUp = 0;
  let eaten = 0;
  let quaffed = 0;
  let fountain = 0;
  let read = 0;
  let thrown = 0;
  let kicks = 0;
  let prayed = 0;
  let fired = 0;
  let enhanced = 0;
  let swapped = 0;
  let zapped = 0;
  let cast = 0;
  let looted = 0;
  let putOn = 0;
  let textAnswers = 0;
  let countAnswers = 0;
  let chatted = 0;
  let paid = 0;
  let nextPay = 0;
  let aim: Dir | null = null;
  const depthNow = (): number => state.levels[state.currentLevel]?.depth ?? 1;
  const carriedCount = (): number => {
    let n = 0;
    for (const e of inventoryOf(state, state.playerId)) {
      if (e.c.item?.letter !== '$') n += e.c.item?.quantity ?? 0;
    }
    return n;
  };
  /** Whether the last step left a multi-turn action in progress, as the UI would see it. */
  let continuing = false;
  /** Errors from checks that need the state before a step (pets changing level). */
  const stepErrors: string[] = [];
  let petsFollowed = 0;
  const stepAndTrack = (a: PlayerAction): void => {
    const before = isMod(a, 'nh:pickup') ? carriedCount() : 0;
    // where the hero and her pets are, to check who follows her to another level
    const fromLevel = state.currentLevel;
    const fromHero = getPlayer(state).c.pos;
    const petsBefore = new Map<EntityId, Pos>();
    for (const id of sortedIds(state)) {
      const e = state.entities[String(id)];
      const p = e?.c.pos;
      if (e?.c.monster?.tame && p?.level === fromLevel) petsBefore.set(id, { x: p.x, y: p.y });
    }
    const r = engine.step(state, a);
    if (state.currentLevel !== fromLevel && fromHero) {
      // ref: keepdogs(): only pets next to the hero come along
      for (const [id, p] of petsBefore) {
        if (state.entities[String(id)]?.c.pos?.level !== state.currentLevel) continue;
        petsFollowed++;
        if (Math.max(Math.abs(p.x - fromHero.x), Math.abs(p.y - fromHero.y)) > 1)
          stepErrors.push(`pet ${id} followed the hero to ${state.currentLevel} from afar`);
      }
    }
    continuing = r.continuing;
    for (const e of r.events) {
      if (e.type === 'msg' && (e.key === 'combat.you_kill' || e.key === 'combat.you_destroy'))
        kills++;
    }
    if (isMod(a, 'nh:pickup')) pickedUp += Math.max(0, carriedCount() - before);
    deepest = Math.max(deepest, depthNow());
    noteDungeon();
  };
  let violations: SoakViolation | null = null;

  const check = (action: PlayerAction | null): void => {
    const errors = [...stepErrors, ...checkInvariants(state, engine.registry)];
    stepErrors.length = 0;
    if (errors.length > 0) violations = { step: log.length, action, errors };
  };
  check(null);

  const heroPos = (): Pos => {
    const p = getPlayer(state).c.pos;
    if (!p) throw new Error('player has no pos');
    return { x: p.x, y: p.y };
  };
  /** Whether the hero stands on branch stairs down. */
  const onBranchDown = (): boolean => {
    const b = state.levels[state.currentLevel]?.branch;
    const p = getPlayer(state).c.pos;
    return b?.dir === 'down' && p?.x === b.pos.x && p.y === b.pos.y;
  };
  /** Monsters on this level that the hero can currently see. */
  const visibleMonsters = (): { id: EntityId; pos: Pos; peaceful: boolean }[] => {
    const level = state.levels[state.currentLevel];
    if (!level) return [];
    const vis = new Set(state.visible);
    const out: { id: EntityId; pos: Pos; peaceful: boolean }[] = [];
    for (const id of sortedIds(state)) {
      const e = state.entities[String(id)];
      const p = e?.c.pos;
      if (!e?.c.monster || !p || p.level !== level.id) continue;
      if (vis.has(p.y * level.width + p.x))
        out.push({ id, pos: { x: p.x, y: p.y }, peaceful: e.c.monster.peaceful });
    }
    return out;
  };

  /**
   * The hero carries an unpaid item (or one inside something she carries) and stands in a shop:
   * a room some shopkeeper (`modData.nh.eshk`) keeps on this level.
   */
  const owesInShop = (): boolean => {
    const level = state.levels[state.currentLevel];
    const p = getPlayer(state).c.pos;
    if (!level || !p) return false;
    const unpaid = (id: EntityId, depth: number): boolean =>
      depth < 10 &&
      sortedIds(state).some((k) => {
        const it = state.entities[String(k)]?.c.item;
        return it?.containedIn === id && (it.unpaid === true || unpaid(k, depth + 1));
      });
    const inv = inventoryOf(state, state.playerId);
    if (!inv.some((e) => e.c.item?.unpaid === true)) {
      // contents only matter when she carries a container
      const boxes = inv.filter((e) => engine.registry.object(e.def).container);
      if (!boxes.some((b) => unpaid(b.id, 0))) return false;
    }
    const nh = state.modData['nh'];
    const eshk =
      nh && typeof nh === 'object' && !Array.isArray(nh)
        ? ((nh as Record<string, unknown>)['eshk'] as
            Record<string, { shoplevel?: string; shoproom?: number }> | undefined)
        : undefined;
    const rooms = inRooms(level, p.x, p.y);
    return Object.keys(eshk ?? {})
      .sort()
      .some((k) => eshk?.[k]?.shoplevel === level.id && rooms.includes(eshk[k]?.shoproom ?? -1));
  };

  /** The hero's current spell energy (content's `modData.nh.pw.uen`; 0 without it). */
  const heroPw = (): number => {
    const nh = state.modData['nh'];
    const pw =
      nh && typeof nh === 'object' && !Array.isArray(nh)
        ? (nh as Record<string, unknown>)['pw']
        : undefined;
    const uen =
      pw && typeof pw === 'object' && !Array.isArray(pw)
        ? (pw as Record<string, unknown>)['uen']
        : undefined;
    return typeof uen === 'number' ? uen : 0;
  };

  const answer = (pending: Prompt): Json => {
    const opts_ = pending.options ?? [];
    if (pending.kind === 'yn') {
      // Never leave the dungeon, so runs keep going; mostly leave peacefuls alone.
      if (pending.id === 'leave-dungeon') return false;
      if (pending.id === 'attack-peaceful') return rng.rn2(10) === 0;
      if (pending.id === 'pray-confirm') return true; // the bot only prays in trouble
      return rng.rn2(2) === 0;
    }
    if (pending.kind === 'text') {
      // a water demon's wish: always the same one
      if (pending.id === 'wish') return 'blessed +2 long sword';
      // a short deterministic name or amount, or a cancel
      if (rng.rn2(3) === 0) return null;
      if (pending.numeric) {
        textAnswers++;
        return String(rng.rn2(1000));
      }
      textAnswers++;
      return `n${rng.rn2(100)}`;
    }
    if (pending.kind === 'direction') {
      const dirs = opts_.map((o) => o.value);
      if (aim !== null && (dirs.length === 0 || dirs.includes(aim))) return aim;
      const here = heroPos();
      for (const m of visibleMonsters()) {
        if (m.peaceful) continue;
        const d = lineDir(here, m.pos);
        if (d !== null && Math.max(Math.abs(m.pos.x - here.x), Math.abs(m.pos.y - here.y)) === 1)
          return d;
      }
      if (dirs.length > 0) return dirs[rng.rn2(dirs.length)] as Json;
      return DIR_LIST[rng.rn2(8)] as Json;
    }
    // menu
    if (pending.id === 'enhance-menu') enhanced++;
    if (opts_.length === 0) return pending.multi ? [] : null;
    if (pending.multi) {
      let chosen = opts_.filter(() => rng.rn2(2) === 0);
      if (chosen.length === 0) chosen = [opts_[rng.rn2(opts_.length)] as (typeof opts_)[0]];
      // a count menu lets the player pick part of a stack
      return chosen.map((o): Json => {
        if (o.max !== undefined && o.max > 1 && rng.rn2(3) === 0) {
          countAnswers++;
          return { value: o.value, count: 1 + rng.rn2(o.max) };
        }
        return o.value;
      });
    }
    return (opts_[rng.rn2(opts_.length)] as (typeof opts_)[0]).value;
  };

  while (!violations && !state.gameOver && state.turn < opts.turns && log.length < maxActions) {
    const pending = state.pendingPrompt;
    if (pending) {
      const act: PlayerAction = {
        type: 'answer',
        promptId: pending.prompt.id,
        value: answer(pending.prompt),
      };
      // the spell menu comes before the direction: keep the aim for it
      if (pending.prompt.id !== 'cast-menu') aim = null;
      log.push(act);
      stepAndTrack(act);
      if (log.length % every === 0) check(act);
      continue;
    }
    if (continuing && rng.rn2(10) !== 0) {
      // like the UI animating a travel, run or meal; one time in ten the bot cancels it by
      // taking another action instead
      const act: PlayerAction = { type: 'continue' };
      log.push(act);
      stepAndTrack(act);
      if (log.length % every === 0) check(act);
      continue;
    }
    const q = engine.query(state);
    const pos = heroPos();
    const hero = getPlayer(state);
    const selfOffers = q.actionsFor({ kind: 'self' });
    const offers: ActionOffer[] = [...selfOffers];
    const cellOffers: ActionOffer[] = [];
    for (const d of DIR_LIST) {
      const v = DIRS[d];
      cellOffers.push(...q.actionsFor({ kind: 'cell', pos: { x: pos.x + v.x, y: pos.y + v.y } }));
    }
    offers.push(...cellOffers);
    const capped = depthNow() >= (opts.maxDepth ?? Infinity);
    if (capped) {
      for (let i = offers.length - 1; i >= 0; i--) {
        const o = offers[i]?.action;
        if (o?.type === 'mod' && o.action === 'nh:down') offers.splice(i, 1);
      }
    }
    if (offers.length === 0) throw new Error('soak: actionsFor offered nothing');

    const inv = inventoryOf(state, state.playerId);
    const itemOffers = (pred: (id: string) => boolean): ActionOffer[] => {
      const out: ActionOffer[] = [];
      for (const it of inv) {
        for (const o of q.actionsFor({ kind: 'item', id: it.id })) {
          if (o.action.type === 'mod' && pred(o.action.action)) out.push(o);
        }
      }
      return out;
    };
    const pickRandom = (list: readonly ActionOffer[]): PlayerAction | null =>
      list.length === 0 ? null : (list[rng.rn2(list.length)] as ActionOffer).action;

    const hp = hero.c.hp;
    const hunger = hero.c.hunger?.state;
    let action: PlayerAction | null = null;

    // 1. attack an adjacent hostile that the offers allow
    const attacks = cellOffers.filter((o) => o.labelKey === 'action.attack');
    if (attacks.length > 0 && rng.rn2(10) !== 0) action = pickRandom(attacks);

    // 1a. pay 1 time in 2 when carrying unpaid goods in a shop, so a run does not rob every shop
    // it walks into and spend the rest of it chased by an angry shopkeeper; at most once in 20
    // turns, as paying without enough gold takes no time and would loop
    if (!action && state.turn >= nextPay && owesInShop()) {
      const pay = selfOffers.find((o) => isMod(o.action, 'nh:pay'));
      if (pay && rng.rn2(2) === 0) {
        action = pay.action;
        nextPay = state.turn + 20;
        paid++;
      }
    }

    // 1b. kick a door we stand next to: the offer cannot tell locked from merely closed
    if (!action && rng.rn2(4) === 0) {
      action = pickRandom(cellOffers.filter((o) => o.labelKey === 'action.nh:kick_door'));
    }

    // 1c. a hostile in line a few squares away: fire (a launcher with ammo, or darts), throw a
    // dagger or dart, or wield a launcher first
    if (!action && rng.rn2(3) === 0) {
      const target = visibleMonsters().find(
        (m) =>
          !m.peaceful &&
          lineDir(pos, m.pos) !== null &&
          Math.max(Math.abs(m.pos.x - pos.x), Math.abs(m.pos.y - pos.y)) > 1,
      );
      if (target) {
        const fires = itemOffers((id) => id === 'nh:fire');
        const missiles = inv
          .filter((e) => e.def === 'nh:dagger' || e.def === 'nh:dart')
          .flatMap((e) => q.actionsFor({ kind: 'item', id: e.id }))
          .filter((o) => isMod(o.action, 'nh:throw'));
        action = pickRandom(fires.length > 0 && rng.rn2(4) !== 0 ? fires : missiles);
        if (action) aim = lineDir(pos, target.pos);
        else {
          const launchers = inv
            .filter((e) => /bow|sling/.test(e.def))
            .flatMap((e) => q.actionsFor({ kind: 'item', id: e.id }))
            .filter((o) => isMod(o.action, 'nh:wield'));
          action = pickRandom(launchers);
        }
      }
    }

    // 1d. a hostile in line: zap a wand at it now and then. Like every branch below that needs
    // an offer, this draws from the bot's RNG only when there is one, so runs without wands
    // play as before.
    if (!action && inv.some((e) => engine.registry.object(e.def).class === 'wand')) {
      const target = visibleMonsters().find((m) => !m.peaceful && lineDir(pos, m.pos) !== null);
      const zaps = target ? itemOffers((id) => id === 'nh:zap') : [];
      if (target && zaps.length > 0 && rng.rn2(3) === 0) {
        action = pickRandom(zaps);
        aim = lineDir(pos, target.pos);
      }
    }

    // 1e. cast now and then when she knows a spell (the offer) and has the energy of a level 1
    // spell; the menu answer picks a spell at random and the direction prompt aims at a hostile
    // in line, as with wands
    if (!action && heroPw() >= 5) {
      const casts = selfOffers.filter((o) => isMod(o.action, 'nh:cast'));
      if (casts.length > 0 && rng.rn2(20) === 0) {
        action = pickRandom(casts);
        const target = visibleMonsters().find((m) => !m.peaceful && lineDir(pos, m.pos) !== null);
        aim = target ? lineDir(pos, target.pos) : null;
      }
    }

    // 2. eat when hungry: inventory food first, else food on the floor
    if (!action && (hunger === 'hungry' || hunger === 'weak' || hunger === 'fainting')) {
      const food = itemOffers((id) => id === 'nh:eat');
      const here = selfOffers.filter((o) => isMod(o.action, 'nh:eat'));
      action = pickRandom(here.length > 0 ? here : food);
    }

    // 3. quaff when hurt
    if (!action && hp && hp.cur * 3 < hp.max && rng.rn2(2) === 0) {
      action = pickRandom(itemOffers((id) => id === 'nh:quaff'));
    }

    // 3b. pray when in trouble: Weak or low on hit points (half the time; it may be too soon)
    if (
      !action &&
      ((hp && (hp.cur <= 5 || hp.cur * 7 <= hp.max)) ||
        hunger === 'weak' ||
        hunger === 'fainting') &&
      rng.rn2(2) === 0
    ) {
      action = pickRandom(selfOffers.filter((o) => isMod(o.action, 'nh:pray')));
    }

    // 4. pick up what lies here
    if (!action && rng.rn2(10) < 4) {
      action = pickRandom(selfOffers.filter((o) => isMod(o.action, 'nh:pickup')));
    }

    // 4b. open a container lying here (a locked one asks to unlock it when a key is at hand)
    if (!action) {
      const loots = selfOffers.filter((o) => isMod(o.action, 'nh:loot'));
      if (loots.length > 0 && rng.rn2(2) === 0) action = pickRandom(loots);
    }

    // 4c. on a fountain, 1 time in 10 drink from it or dip a random item (or wash her hands)
    if (!action) {
      const dips = selfOffers.filter((o) => isMod(o.action, 'nh:dip'));
      if (dips.length > 0 && rng.rn2(10) === 0) {
        action =
          rng.rn2(2) === 0
            ? pickRandom(selfOffers.filter((o) => isMod(o.action, 'nh:quaff')))
            : pickRandom([...dips, ...itemOffers((id) => id === 'nh:dip')]);
        if (action) fountain++;
      }
    }

    // 5. occasional gear, reading, throwing, dropping and eating when not hungry
    if (!action) {
      const roll = rng.rn2(100);
      if (roll < 6) action = pickRandom(itemOffers((id) => id === 'nh:wield'));
      else if (roll < 12) action = pickRandom(itemOffers((id) => id === 'nh:wear'));
      else if (roll < 14) action = pickRandom(itemOffers((id) => id === 'nh:takeoff'));
      else if (roll < 18) action = pickRandom(itemOffers((id) => id === 'nh:read'));
      else if (roll < 20) action = pickRandom(itemOffers((id) => id === 'nh:eat'));
      else if (roll < 21) action = pickRandom(itemOffers((id) => id === 'nh:quaff'));
      else if (roll < 23)
        action = pickRandom(selfOffers.filter((o) => isMod(o.action, 'nh:drop_many')));
      else if (roll < 26)
        action = pickRandom(selfOffers.filter((o) => isMod(o.action, 'nh:enhance')));
      else if (roll < 27)
        action = pickRandom(selfOffers.filter((o) => isMod(o.action, 'nh:swap_weapon')));
      else if (roll < 29) action = pickRandom(itemOffers((id) => id === 'nh:puton'));
      else if (roll < 30) action = pickRandom(itemOffers((id) => id === 'nh:remove'));
    }

    // 6. descend 1 time in 4 when standing on a down staircase, so runs visit several levels;
    // 1 time in 2 on branch stairs down, so runs enter other dungeons (the Mines)
    if (!action) {
      const descend = offers.find((o) => isMod(o.action, 'nh:down'));
      if (descend && rng.rn2(onBranchDown() ? 2 : 4) === 0) action = descend.action;
    }

    // 6b. head for a remembered down staircase now and then (travel offers come from the cell),
    // branch stairs down first
    if (!action && !capped && rng.rn2(8) === 0) {
      const level = state.levels[state.currentLevel];
      const mem = state.memory[state.currentLevel];
      const pi = level?.palette.indexOf(VANILLA_TERRAIN.stairs_down) ?? -1;
      const b = level?.branch;
      const bi = level && b?.dir === 'down' ? b.pos.y * level.width + b.pos.x : -1;
      const at = pi < 0 || !mem ? -1 : bi >= 0 && mem[bi] === pi ? bi : mem.indexOf(pi);
      if (level && at >= 0) {
        const go = q
          .actionsFor({
            kind: 'cell',
            pos: { x: at % level.width, y: Math.floor(at / level.width) },
          })
          .find((o) => isMod(o.action, 'nh:travel'));
        if (go) action = go.action;
      }
    }

    // 6c. chat with a temple priest next to her now and then (donations); other chats are left
    // out of the random offers below
    if (!action) {
      const priestNear = visibleMonsters().some(
        (m) =>
          state.entities[String(m.id)]?.def === 'nh:aligned_cleric' &&
          Math.max(Math.abs(m.pos.x - pos.x), Math.abs(m.pos.y - pos.y)) === 1,
      );
      if (priestNear && rng.rn2(3) === 0) {
        const talk = cellOffers.find((o) => isMod(o.action, 'nh:chat'));
        if (talk) {
          action = talk.action;
          chatted++;
        }
      }
    }

    // 7. anything else: a random offer, except the book-keeping ones that take no time
    if (!action) {
      const rest = offers.filter(
        (o) =>
          !isMod(o.action, 'nh:discoveries') &&
          !isMod(o.action, 'nh:spells') &&
          // the bot casts in its own branch above, when it has the energy
          !isMod(o.action, 'nh:cast') &&
          !isMod(o.action, 'nh:drop_many') &&
          !isMod(o.action, 'nh:swap_weapon') &&
          !isMod(o.action, 'nh:enhance') &&
          // praying at random angers the god; fighting the pet just abuses it
          !isMod(o.action, 'nh:pray') &&
          !isMod(o.action, 'nh:chat') &&
          !isMod(o.action, 'nh:fight'),
      );
      const list = rest.length > 0 ? rest : offers;
      action = (list[rng.rn2(list.length)] as ActionOffer).action;
    }

    if (isMod(action, 'nh:eat')) eaten++;
    else if (isMod(action, 'nh:quaff')) quaffed++;
    else if (isMod(action, 'nh:read')) read++;
    else if (isMod(action, 'nh:throw')) thrown++;
    else if (isMod(action, 'nh:fire')) fired++;
    else if (isMod(action, 'nh:pray')) prayed++;
    else if (isMod(action, 'nh:zap')) zapped++;
    else if (isMod(action, 'nh:cast')) cast++;
    else {
      aim = null;
      if (isMod(action, 'nh:kick')) kicks++;
      else if (isMod(action, 'nh:swap_weapon')) swapped++;
      else if (isMod(action, 'nh:loot')) looted++;
      else if (isMod(action, 'nh:puton')) putOn++;
    }
    log.push(action);
    stepAndTrack(action);
    if (log.length % every === 0) check(action);
  }
  if (!violations) check(log[log.length - 1] ?? null);

  const mem = state.memory[state.currentLevel] ?? [];
  const result: SoakResult = {
    actions: log.length,
    finalHash: stateHash(state),
    turns: state.turn,
    violations,
    deepestLevel: deepest,
    dungeons,
    specialLevels: specialLevels.sort(),
    kills,
    cellsExplored: mem.filter((m) => m >= 0).length,
    log,
    outcome: state.gameOver?.kind ?? 'playing',
    pickedUp,
    eaten,
    quaffed,
    read,
    thrown,
    kicks,
    prayed,
    petsFollowed,
    fired,
    enhanced,
    swapped,
    zapped,
    cast,
    looted,
    putOn,
    textAnswers,
    countAnswers,
    chatted,
    paid,
    fountain,
    hunger: getPlayer(state as GameState).c.hunger?.state ?? null,
  };
  const v = result.violations as SoakViolation | null;
  if (v && !opts.collect) {
    throw new Error(
      `soak invariant violation at step ${v.step} after ${JSON.stringify(v.action)}:\n  ${v.errors.join('\n  ')}`,
    );
  }
  return result;
}
