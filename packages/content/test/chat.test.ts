// Milestone 6b2 step 4: #chat and temple donations. dochat()'s checks and domonnoise()'s line for
// each monster sound of this port; priest_talk(): refusals, no gold, and the NetHack 5.0
// donation tiers (cheapskate, clairvoyance, protection, alignment and cleansing), with bribe()'s
// clamping; clairvoyance maps the hero's surroundings.
import {
  cellIndex,
  getPlayer,
  type Ctx,
  type DefId,
  type Dir,
  type EntityId,
  type Json,
  type PlayerAction,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  P,
  T,
  checkSpecialRoom,
  edogOf,
  epriOf,
  findAc,
  hasIntrinsic,
  initedog,
  mksobj,
  moneyCnt,
  paralyzeMonst,
  priestini,
  setItimeout,
  setU,
  uState,
} from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor, obj, render } from './itemHelpers';

// A temple (interior 1..5 x 1..5, altar at 3,3) with a doorway east onto a corridor of floor.
const MAP = [
  '-------         ',
  '|.....|         ',
  '|.....|         ',
  '|.....o.........',
  '|.....|         ',
  '|.....|         ',
  '-------         ',
];
const ALTAR = { x: 3, y: 3 };

type S = ReturnType<typeof setup>;
const ctxOf = (s: S): Ctx => ctxFor(s.state) as unknown as Ctx;
const hero = (s: S) => getPlayer(s.state);
const put = (s: S, id: number, x: number, y: number): void => {
  const p = s.state.entities[String(id)]?.c.pos;
  if (p) Object.assign(p, { x, y });
};
const pin = (s: S, id: number): number => {
  const a = s.state.entities[String(id)]?.c.actor;
  if (a) a.speed = 0;
  return id;
};
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const chatAct = (dir: Dir): PlayerAction => ({ type: 'mod', action: 'nh:chat', args: { dir } });

/** Chats in `dir`; returns the messages and whether a turn passed. */
function chat(s: S, dir: Dir): { msgs: string[]; took: boolean } {
  const t = s.state.turn;
  const msgs = keys(s.engine.step(s.state, chatAct(dir)));
  return { msgs, took: s.state.turn !== t };
}

/** Sets the gold `id` carries to `n`. */
function setGold(s: S, id: EntityId, n: number): void {
  for (const k of Object.keys(s.state.entities)) {
    const it = s.state.entities[k]?.c.item;
    if (it?.carriedBy === id && s.state.entities[k]?.def === 'nh:gold_piece')
      delete s.state.entities[k];
  }
  if (n > 0) mksobj(ctxOf(s), obj('nh:gold_piece'), { init: false, quantity: n, carriedBy: id });
}

// ---------------------------------------------------------------------------------------------

describe('#chat is discoverable', () => {
  test('offered on self and on an adjacent seen monster, not on an empty cell', () => {
    const s = setup(['.....', '..@..', '.....']);
    const q = () => s.engine.query(s.state);
    expect(
      q()
        .actionsFor({ kind: 'self' })
        .some((o) => o.labelKey === 'action.nh:chat'),
    ).toBe(true);
    pin(s, addMon(s.state, 'nh:jackal', 3, 1));
    s.wait();
    const cell = q().actionsFor({ kind: 'cell', pos: { x: 3, y: 1 } });
    const talk = cell.find((o) => o.labelKey === 'action.nh:chat_with');
    expect(talk?.action).toEqual(chatAct('e'));
    expect(
      render({ key: talk?.labelKey ?? '', ...(talk?.params ? { params: talk.params } : {}) }),
    ).toBe('Chat with the jackal');
    const empty = q().actionsFor({ kind: 'cell', pos: { x: 1, y: 1 } });
    expect(empty.some((o) => o.labelKey.startsWith('action.nh:chat'))).toBe(false);
  });

  test('self asks a direction; cancelling it does nothing and takes no time', () => {
    const s = setup(['.....', '..@..', '.....']);
    const t = s.state.turn;
    const r = s.engine.step(s.state, { type: 'mod', action: 'nh:chat' });
    expect(r.prompt?.kind).toBe('direction');
    expect(r.prompt?.options?.map((o) => o.value)).toContain('self');
    const a = s.engine.step(s.state, { type: 'answer', promptId: 'chat-direction', value: null });
    expect(keys(a)).toEqual([]);
    expect(s.state.turn).toBe(t);
    s.engine.step(s.state, { type: 'mod', action: 'nh:chat' });
    const me = s.engine.step(s.state, {
      type: 'answer',
      promptId: 'chat-direction',
      value: 'self',
    });
    expect(keys(me)).toEqual(['chat.self']);
    expect(s.state.turn).toBe(t);
  });
});

describe('dochat() checks', () => {
  test('a wall, nothing, a sleeping monster, a pet eating, choking: no time', () => {
    const s = setup(['-----', '|.@.|', '-----']);
    expect(chat(s, 'n')).toEqual({ msgs: ['chat.wall'], took: false });
    expect(chat(s, 'e')).toEqual({ msgs: [], took: false });
    const j = pin(s, addMon(s.state, 'nh:jackal', 3, 1, { asleep: true }));
    s.wait();
    expect(chat(s, 'e')).toEqual({ msgs: ['chat.not_notice'], took: false });
    delete s.state.entities[String(j)];
    const k = pin(s, addMon(s.state, 'nh:kitten', 1, 1, { peaceful: true }));
    const km = s.state.entities[String(k)]?.c.monster;
    if (km) km.tame = 10;
    const md = s.state.modData['nh'] as Record<string, Json>;
    md['meating'] = { [String(k)]: 5 };
    expect(chat(s, 'w')).toEqual({ msgs: ['chat.eating'], took: false });
    setItimeout(s.state, hero(s), P.STRANGLED, 5);
    expect(chat(s, 'w')).toEqual({ msgs: ['chat.choking'], took: false });
  });
});

describe('domonnoise(): each sound', () => {
  const line = (def: string, o: { peaceful?: boolean; tame?: number; halluc?: boolean } = {}) => {
    const s = setup(['.....', '..@..', '.....']);
    const id = pin(s, addMon(s.state, def, 3, 1, { peaceful: o.peaceful ?? false }));
    const m = s.state.entities[String(id)]?.c.monster;
    if (m && o.tame) m.tame = o.tame;
    if (o.halluc) setItimeout(s.state, hero(s), P.HALLUC, 100);
    s.wait();
    return chat(s, 'e');
  };

  test.each([
    ['nh:jackal', {}, 'chat.growls_bark'],
    ['nh:jackal', { peaceful: true }, 'chat.barks'],
    ['nh:little_dog', { peaceful: true, tame: 3 }, 'chat.whines'],
    ['nh:kitten', {}, 'chat.growls'],
    ['nh:kitten', { peaceful: true }, 'chat.snarls'],
    ['nh:kitten', { peaceful: true, tame: 3 }, 'chat.yowls'],
    ['nh:sewer_rat', {}, 'chat.squeaks'],
    ['nh:gnome', {}, 'chat.grunts'],
    ['nh:hill_orc', { peaceful: true }, 'chat.grunts'],
    ['nh:rothe', {}, 'chat.bellows'], // MS_MOO, not tame
    ['nh:grid_bug', {}, 'chat.buzzes'],
    ['nh:grid_bug', { peaceful: true }, 'chat.drones'],
    ['nh:hobbit', {}, 'chat.threatens'],
    ['nh:hobbit', { peaceful: true }, 'chat.hobbit.ring'],
    ['nh:dwarf', { peaceful: true }, 'chat.mining'],
    ['nh:gecko', { halluc: true }, 'chat.gecko'],
    // m10 step 1 sounds
    ['nh:pony', {}, 'chat.neighs'], // MS_NEIGH, tameness < 5
    ['nh:horse', { peaceful: true, tame: 10 }, 'chat.whickers'], // tame and not hungry
    ['nh:raven', {}, 'chat.nevermore'], // a hostile raven
    ['nh:raven', { peaceful: true }, 'chat.squawks'],
    ['nh:mumak', {}, 'chat.trumpets'],
    ['nh:leocrotta', {}, 'chat.imitates'],
    ['nh:crocodile', {}, 'chat.bellows'],
    ['nh:baby_crocodile', {}, 'chat.chirps'],
    ['nh:killer_bee', {}, 'chat.buzzes'],
    ['nh:wolf', {}, 'chat.growls_bark'],
    ['nh:tiger', {}, 'chat.growls'],
  ] as const)('%s %j: %s', (def, o, key) => {
    expect(line(def, o)).toEqual({ msgs: [key], took: true });
  });

  test('a hallucinated gnome speaks (MS_ORC becomes MS_HUMANOID)', () => {
    const { msgs, took } = line('nh:gnome', { peaceful: true, halluc: true });
    expect(['chat.gnome.few', 'chat.gnome.phase1', 'chat.gnome.phase3']).toContain(msgs[0]);
    expect(took).toBe(true);
  });

  test('the watch: a peaceful complaint, a hostile threat', () => {
    expect(['chat.soldier.pay', 'chat.soldier.food', 'chat.soldier.feet']).toContain(
      line('nh:watchman', { peaceful: true }).msgs[0],
    );
    expect(['chat.soldier.useless', 'chat.soldier.dog_meat', 'chat.soldier.surrender']).toContain(
      line('nh:watchman').msgs[0],
    );
  });

  test('a mumak trumpets and wakes the monsters within 11 squares (wake_nearto 11 * 11)', () => {
    const s = setup(['..................', '..@...............', '..................']);
    const mumak = pin(s, addMon(s.state, 'nh:mumak', 3, 1));
    const near = pin(s, addMon(s.state, 'nh:jackal', 13, 1, { asleep: true })); // dist2 100
    const far = pin(s, addMon(s.state, 'nh:jackal', 15, 1, { asleep: true })); // dist2 144
    s.wait();
    const { msgs } = chat(s, 'e');
    expect(msgs).toContain('chat.trumpets');
    expect(s.state.entities[String(mumak)]?.c.monster?.asleep).toBe(false);
    expect(s.state.entities[String(near)]?.c.monster?.asleep).toBe(false);
    expect(s.state.entities[String(far)]?.c.monster?.asleep).toBe(true);
  });

  test('a tame horse past its hungry time whinnies', () => {
    const s = setup(['.....', '..@..', '.....']);
    const id = pin(s, addMon(s.state, 'nh:horse', 3, 1, { peaceful: true }));
    initedog(ctxOf(s), id, true);
    const m = s.state.entities[String(id)]?.c.monster;
    if (m) m.tame = 10;
    const e = edogOf(s, id);
    if (e) e.hungrytime = 0;
    s.wait();
    expect(chat(s, 'e').msgs).toEqual(['chat.whinnies']);
  });

  test('a silent monster says nothing and no time passes', () => {
    expect(line('nh:newt')).toEqual({ msgs: [], took: false });
  });

  test('every monster has a sound', () => {
    const s = setup(['.@.']);
    for (const m of s.engine.registry.monsters) expect(m.sound, m.id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------

/**
 * The temple with a pinned priest on his altar (of `altar`) and the hero next to him at 4,3 with
 * `gold` and alignment record `record`.
 */
function temple(seed: number, o: { altar?: DefId; gold?: number; record?: number } = {}) {
  const s = setup(MAP, seed);
  const level = s.level;
  const altar = o.altar ?? T.altar_neutral;
  let i = level.palette.indexOf(altar);
  if (i === -1) i = level.palette.push(altar) - 1;
  level.cells[cellIndex(level, ALTAR.x, ALTAR.y)] = i;
  level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 5, lit: true, type: 'nh:temple' }];
  level.shrines = [{ ...ALTAR }];
  put(s, s.state.playerId, 8, 3); // out of the way while the priest is made
  setU(s, { alignType: 0, alignRecord: o.record ?? 0 });
  const priest = priestini(ctxOf(s), level, 0, ALTAR);
  if (priest === null) throw new Error('no priest');
  put(s, priest, ALTAR.x, ALTAR.y);
  put(s, s.state.playerId, 4, 3);
  pin(s, priest);
  checkSpecialRoom(ctxOf(s), false);
  setGold(s, s.state.playerId, o.gold ?? 0);
  return { ...s, priest };
}

type Temple = ReturnType<typeof temple>;

/** Chats with the priest; returns the messages and the offer prompt's suggested amounts. */
function ask(s: Temple): { msgs: string[]; a: number; b: number } {
  const r = s.engine.step(s.state, chatAct('w'));
  const p = r.prompt;
  expect(p?.kind).toBe('text');
  expect(p?.numeric).toBe(true);
  return { msgs: keys(r), a: Number(p?.params?.['a']), b: Number(p?.params?.['b']) };
}

/** Answers the offer prompt; returns the messages and whether a turn passed. */
function offer(s: Temple, value: Json): { msgs: string[]; took: boolean } {
  const t = s.state.turn;
  const msgs = keys(s.engine.step(s.state, { type: 'answer', promptId: 'priest-offer', value }));
  return { msgs, took: s.state.turn !== t };
}

const epri = (s: Temple) => {
  const e = epriOf(s, s.priest);
  if (!e) throw new Error('no epri');
  return e;
};
const gold = (s: Temple, id = s.state.playerId) =>
  moneyCnt({ state: s.state, defs: s.engine.registry }, id);
const record = (s: Temple) => uState(s.state).alignRecord;

describe('priest_talk(): without gold', () => {
  test('coaligned: two bits for an ale, or the virtues of poverty', () => {
    const s = temple(1);
    const pg = gold(s, s.priest);
    expect(pg).toBeGreaterThan(1);
    expect(chat(s, 'w')).toEqual({ msgs: ['priest.ale_two'], took: true });
    expect(gold(s)).toBe(2);
    expect(gold(s, s.priest)).toBe(pg - 2);
    const poor = temple(2);
    setGold(poor, poor.priest, 0);
    expect(chat(poor, 'w').msgs).toEqual(['priest.poverty']);
  });

  test('cross-aligned or strayed: not interested', () => {
    expect(chat(temple(3, { altar: T.altar_lawful }), 'w').msgs).toEqual(['priest.not_interested']);
    expect(chat(temple(4, { record: -1 }), 'w').msgs).toEqual(['priest.not_interested']);
  });
});

describe('priest_talk(): refusals', () => {
  test('a hostile priest is cranky and stays hostile', () => {
    const s = temple(5);
    const m = s.state.entities[String(s.priest)]?.c.monster;
    if (m) m.peaceful = false;
    const { msgs } = chat(s, 'w');
    expect(['priest.cranky.words', 'priest.cranky.talk', 'priest.cranky.no_longer']).toContain(
      msgs[0],
    );
    expect(m?.peaceful).toBe(false);
  });

  test('a sleeping or paralysed priest breaks out of his reverie, cranky', () => {
    const s = temple(6, { gold: 500 });
    paralyzeMonst(s, s.priest, 10);
    const { msgs } = chat(s, 'w');
    expect(msgs[0]).toBe('priest.reverie');
    expect(msgs).toHaveLength(2);
    expect(s.state.entities[String(s.priest)]?.c.monster?.peaceful).toBe(false);
  });

  test('a priest whose shrine is gone will not talk', () => {
    const s = temple(7, { gold: 500 });
    delete s.level.shrines;
    expect(chat(s, 'w').msgs[0]).toMatch(/^priest\.cranky\./);
  });
});

describe('priest_talk(): donations (NetHack 5.0)', () => {
  test('the suggestion is XL * rn1(101, 150 + 40 * cheapskate), times the gold / 3x', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = temple(seed, { gold: 400 });
      const { msgs, a, b } = ask(s);
      expect(msgs).toEqual(['priest.asks_contribution']);
      expect(a).toBeGreaterThanOrEqual(150);
      expect(a).toBeLessThanOrEqual(250);
      expect(b).toBe(2 * a);
      const cheap = temple(seed, { gold: 400 });
      epri(cheap).cheapskate = 5;
      const c = ask(cheap);
      expect(c.a).toBeGreaterThanOrEqual(350);
      expect(c.a).toBeLessThanOrEqual(450);
      // with more gold visible the suggestion scales: quan = gold / (3 * suggested)
      const rich = temple(seed, { gold: 100000 });
      const r = ask(rich);
      expect(r.a).toBeGreaterThanOrEqual(100000 / 3 - 250);
      expect(r.a).toBeLessThanOrEqual(100000 / 3);
    }
  });

  test('refusing (0 or cancel): "Thou shalt regret", alignment -1, cheapskate +1, a turn', () => {
    for (const value of ['0', null, 'lots'] as Json[]) {
      const s = temple(8, { gold: 400 });
      ask(s);
      expect(offer(s, value)).toEqual({
        msgs: ['bribe.refuse', 'priest.regret'],
        took: true,
      });
      expect(record(s)).toBe(-1);
      expect(epri(s).cheapskate).toBe(1);
      expect(gold(s)).toBe(400);
    }
  });

  test('too little: "Cheapskate." (counter +1), or thanks when it is most of her gold', () => {
    const s = temple(9, { gold: 400 });
    ask(s);
    expect(offer(s, '10').msgs).toEqual(['bribe.give', 'priest.cheapskate']);
    expect(epri(s).cheapskate).toBe(1);
    expect(gold(s)).toBe(390);
    const t = temple(9, { gold: 140 });
    ask(t);
    expect(offer(t, '100').msgs).toEqual(['bribe.give', 'priest.thank_contribution']);
    expect(epri(t).cheapskate).toBe(0);
  });

  test('more than she has gives all her gold', () => {
    const s = temple(10, { gold: 100 });
    ask(s);
    const pg = gold(s, s.priest);
    expect(offer(s, '999999').msgs).toEqual(['bribe.all', 'priest.thank_contribution']);
    expect(gold(s)).toBe(0);
    expect(gold(s, s.priest)).toBe(pg + 100);
  });

  test('the suggestion: a blessing of clairvoyance; a sinner regains a point', () => {
    const s = temple(11, { gold: 400 });
    const { a } = ask(s);
    expect(offer(s, String(a)).msgs).toEqual([
      'bribe.give',
      'priest.pious',
      'priest.bestow_blessing',
    ]);
    const left = (hero(s).c.props?.[P.CLAIRVOYANT]?.timeout ?? 0) - s.state.turn;
    expect(left).toBeGreaterThanOrEqual(499);
    expect(left).toBeLessThan(1000);
    expect(record(s)).toBe(0);
    const sinner = temple(11, { gold: 400, record: -5 });
    const r = ask(sinner);
    offer(sinner, String(r.a));
    expect(record(sinner)).toBe(-4);
  });

  test('twice the suggestion: protection (AC and u.ublessed), rewarded', () => {
    const s = temple(12, { gold: 800 });
    const ac = findAc(s.state, s.engine.registry, s.state.playerId);
    const { b } = ask(s);
    expect(offer(s, String(b)).msgs).toEqual(['bribe.give', 'priest.rewarded']);
    const u = uState(s.state).ublessed;
    expect(u).toBeGreaterThanOrEqual(2);
    expect(u).toBeLessThanOrEqual(4);
    expect(hasIntrinsic(hero(s), P.PROTECTION)).toBe(true);
    expect(findAc(s.state, s.engine.registry, s.state.playerId)).toBe(ac - u);
    // at the cap there is nothing more to give
    const capped = temple(12, { gold: 800 });
    const her = hero(capped);
    (her.c.props ??= {})[P.PROTECTION] = { intrinsic: true, timeout: 0 };
    setU(capped, { ublessed: 20 });
    const c = ask(capped);
    expect(offer(capped, String(c.b)).msgs).toEqual(['bribe.give', 'priest.appreciated']);
    expect(uState(capped.state).ublessed).toBe(20);
  });

  test('three times the suggestion: alignment +2, or a strayed record cleansed after 5000 turns', () => {
    const s = temple(13, { gold: 800 });
    const { a } = ask(s);
    expect(offer(s, String(3 * a)).msgs).toEqual(['bribe.give', 'priest.appreciated']);
    expect(record(s)).toBe(2);
    expect(hasIntrinsic(hero(s), P.PROTECTION)).toBe(false);
    const early = temple(13, { gold: 800, record: -3 });
    const e = ask(early);
    offer(early, String(3 * e.a));
    expect(record(early)).toBe(-1); // turn < 5000: just +2
    const late = temple(13, { gold: 800, record: -3 });
    late.state.turn = 6000;
    const l = ask(late);
    offer(late, String(3 * l.a));
    expect(record(late)).toBe(0);
    expect(uState(late.state).ucleansed).toBe(6000);
  });

  test('a cross-aligned priest takes the gold but gives no alignment', () => {
    const s = temple(14, { gold: 800, altar: T.altar_chaotic });
    const { a } = ask(s);
    offer(s, String(3 * a));
    expect(record(s)).toBe(0);
    const r = temple(14, { gold: 400, altar: T.altar_chaotic });
    ask(r);
    offer(r, '0');
    expect(record(r)).toBe(0);
  });
});

describe('clairvoyance', () => {
  test('maps the cells around the hero that she cannot see', () => {
    const s = temple(15);
    const at = 12 + 1 * s.level.width; // stone beyond the temple wall, 8 columns east
    const mem = () => s.state.memory['dlvl1']?.[at];
    s.wait();
    expect(mem()).toBe(-1);
    setItimeout(s.state, hero(s), P.CLAIRVOYANT, 100);
    s.wait();
    expect(mem()).toBe(s.level.cells[at]);
  });
});
