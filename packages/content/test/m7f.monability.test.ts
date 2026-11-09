// m7f-d step 6: the polymorphed hero's #monster (domonability()): breathing, spitting, gazing, a
// lycanthrope's call for help, a gremlin multiplying in a fountain and a shrieker's shriek; the
// offer only while the form has one of them. And the uhim()/uhis() death texts for a male hero.
// Outcomes are asserted over searched seeds or pinned monsters, never a lucky seed.
// ref: src/cmd.c domonability(); src/polyself.c dobreathe(), dospit(), dogaze(), dosummon()
import { createEngine, getPlayer, type Ctx, type DefId, type EntityId, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { MONSTER_ID } from '../src/monability';
import { polymon } from '../src/polyself';
import { cancelMonst } from '../src/zap';
import { heroFormId } from '../src/upoly';
import { render } from './itemHelpers';
import { pwOf, setPw } from '../src/uenergy';
import { mcansee } from '../src/mstate';
import { setHeroFemale, uhimKey } from '../src/gender';
import { messagesEn } from '../src/messages.en';
import { T } from '../src/terrain';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);

const ROOM = ['           ', ' ......... ', ' ....@.... ', ' ......... ', '           '];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  return s;
}
function become(s: S, id: string, pw = 50): void {
  probe.fn = (ctx) => {
    polymon(ctx, id as DefId, false);
    setPw(ctx, { uen: pw });
  };
  eng.step(s.state, { type: 'mod', action: 'pt:run' });
}
const offered = (s: S): boolean =>
  eng
    .query(s.state)
    .actionsFor({ kind: 'self' })
    .some((o) => o.action.type === 'mod' && o.action.action === MONSTER_ID);
/** #monster: the text and whether a move passed. */
function monster(s: S): { text: string[]; turn: boolean; prompt: string | null } {
  const t0 = s.state.turn;
  const r = s.mod(MONSTER_ID);
  return {
    text: s.text(r),
    turn: s.state.turn !== t0,
    prompt: s.state.pendingPrompt?.prompt.key ?? null,
  };
}
function answer(s: S, value: unknown): { text: string[]; turn: boolean } {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  const t0 = s.state.turn;
  const r = s.step({ type: 'answer', promptId: p.id, value: value as never });
  return { text: s.text(r), turn: s.state.turn !== t0 };
}
/** An awake monster that never moves, `dx` squares east of her, with `hp` hit points. */
function foe(s: S, def: string, dx = 1, o: { hp?: number; peaceful?: boolean } = {}): EntityId {
  const id = addMon(s.state, def, s.here.x + dx, s.here.y, {
    asleep: false,
    ...(o.peaceful ? { peaceful: true } : {}),
  });
  const e = s.state.entities[String(id)]!;
  const hp = o.hp ?? 50;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
const hpOf = (s: S, id: EntityId): number => s.state.entities[String(id)]?.c.hp?.cur ?? 0;
const uen = (s: S): number => pwOf(s.state).uen;

describe('the offer', () => {
  test('offered only while the form has an ability the port has', () => {
    const s = room();
    expect(offered(s)).toBe(false); // her own form: no #monster
    const cases: [string, boolean][] = [
      ['nh:winter_wolf_cub', true], // breath
      ['nh:cobra', true], // spit (before hiding)
      ['nh:pyrolisk', true], // gaze
      ['nh:werejackal', true], // were summon
      ['nh:gremlin', true],
      ['nh:shrieker', true],
      ['nh:jackal', false], // "purely reflexive": no offer
      ['nh:water_nymph', false], // doremove(): no iron ball
      ['nh:cave_spider', false], // dohide(): hiding is not ported
    ];
    for (const [form, yes] of cases) {
      const t = room();
      become(t, form);
      expect([form, offered(t)]).toEqual([form, yes]);
    }
  });
});

describe('breath (dobreathe)', () => {
  test('not enough energy: refused, no time', () => {
    const s = room();
    become(s, 'nh:winter_wolf_cub', 14);
    const r = monster(s);
    expect(r).toEqual({
      text: ["You don't have enough energy to breathe!"],
      turn: false,
      prompt: null,
    });
    expect(uen(s)).toBe(14);
  });

  test('15 energy, a direction, then a blast of frost down the line', () => {
    const s = room();
    become(s, 'nh:winter_wolf_cub', 20);
    foe(s, 'nh:gnome', 2);
    const r = monster(s);
    expect(r.prompt).toBe('zap.direction');
    expect(uen(s)).toBe(5); // spent before the direction
    const a = answer(s, 'e');
    expect(a.turn).toBe(true);
    expect(a.text.some((t) => /^The blast of frost (hits|misses) the gnome/.test(t))).toBe(true);
  });

  test('at herself: the blast hits her (she resists cold)', () => {
    const s = room();
    become(s, 'nh:winter_wolf_cub', 20);
    monster(s);
    expect(answer(s, 'self')).toEqual({ text: ["You don't feel cold."], turn: true });
  });

  test('cancelling the direction keeps the energy spent and takes no time', () => {
    const s = room();
    become(s, 'nh:winter_wolf_cub', 20);
    monster(s);
    expect(answer(s, null)).toEqual({ text: [], turn: false });
    expect(uen(s)).toBe(5);
  });
});

describe('spit (dospit)', () => {
  test('blinding venom: a hit blinds and angers, a miss splashes (seeds searched)', () => {
    let hit = false;
    let miss = false;
    for (let seed = 1; seed <= 40 && !(hit && miss); seed++) {
      const s = room(seed);
      become(s, 'nh:cobra');
      const g = foe(s, 'nh:gnome', 2, { peaceful: true });
      expect(monster(s).prompt).toBe('zap.direction');
      const a = answer(s, 'e');
      expect(a.turn).toBe(true);
      if (a.text.includes('The venom blinds the gnome!')) {
        hit = true;
        expect(mcansee(s.ctx, g)).toBe(false);
        expect(s.state.entities[String(g)]!.c.monster!.peaceful).toBe(false);
      } else {
        miss = true;
        expect(a.text).toContain('The splash of blinding venom misses the gnome.');
        expect(a.text).toContain('Splash!');
        expect(mcansee(s.ctx, g)).toBe(true);
      }
      // the venom never stays on the floor
      const venom = Object.values(s.state.entities).filter((e) => e?.def.includes('venom'));
      expect(venom).toEqual([]);
    }
    expect([hit, miss]).toEqual([true, true]);
  });

  test('spat at nothing: it splashes where it lands', () => {
    const s = room();
    become(s, 'nh:cobra');
    monster(s);
    expect(answer(s, 'w').text).toEqual(['Splash!']);
  });
});

describe('gaze (dogaze)', () => {
  test('blind: no gaze, no energy, no time', () => {
    const s = room();
    become(s, 'nh:pyrolisk', 20);
    getPlayer(s.state).c.props = {
      ...getPlayer(s.state).c.props,
      blinded: { timeout: s.state.turn + 50 },
    } as never;
    expect(monster(s)).toEqual({
      text: ["You can't see anything to gaze at."],
      turn: false,
      prompt: null,
    });
    expect(uen(s)).toBe(20);
  });

  test('not enough energy', () => {
    const s = room();
    become(s, 'nh:pyrolisk', 10);
    expect(monster(s).text).toEqual(['You lack the energy to use your special gaze!']);
  });

  test('a fiery gaze burns every monster in sight for 2d6', () => {
    const s = room();
    become(s, 'nh:pyrolisk', 20);
    const a = foe(s, 'nh:gnome', 2);
    const b = foe(s, 'nh:jackal', -3);
    const r = monster(s);
    expect(r.turn).toBe(true);
    expect(r.text).toContain('You attack the gnome with a fiery gaze!');
    expect(r.text).toContain('You attack the jackal with a fiery gaze!');
    for (const id of [a, b]) {
      expect(hpOf(s, id)).toBeLessThanOrEqual(48);
      expect(hpOf(s, id)).toBeGreaterThanOrEqual(38);
    }
    expect(uen(s)).toBe(5);
  });

  test('no one to gaze at', () => {
    const s = room();
    become(s, 'nh:pyrolisk', 20);
    expect(monster(s).text).toEqual(['You gaze at no place in particular.']);
  });

  test('a pet is spared; a peaceful one is asked about', () => {
    const s = room();
    become(s, 'nh:pyrolisk', 40);
    const pet = foe(s, 'nh:jackal', -2);
    Object.assign(s.state.entities[String(pet)]!.c.monster!, { tame: 10, peaceful: true });
    const g = foe(s, 'nh:gnome', 2, { peaceful: true });
    const r = monster(s);
    expect(r.text).toEqual(['You avoid gazing at your jackal.']);
    expect(r.prompt).toBe('attack.confirm');
    // no: nothing more happens (it was looked at)
    expect(answer(s, false)).toEqual({ text: [], turn: true });
    expect(hpOf(s, g)).toBe(50);
    expect(s.state.entities[String(g)]!.c.monster!.peaceful).toBe(true);
    // again, yes: angered and burnt
    monster(s);
    const y = answer(s, true);
    expect(y.text).toContain('You attack the gnome with a fiery gaze!');
    expect(s.state.entities[String(g)]!.c.monster!.peaceful).toBe(false);
    expect(hpOf(s, g)).toBeLessThan(50);
  });

  test('gazing at a floating eye freezes her', () => {
    const s = room();
    become(s, 'nh:pyrolisk', 20);
    foe(s, 'nh:floating_eye', 2, { hp: 200 });
    const t0 = s.state.turn;
    const r = monster(s);
    expect(r.text).toContain('You attack the floating eye with a fiery gaze!');
    expect(r.text).toContain("You are frozen by the floating eye's gaze!");
    expect(r.text).toContain('You can move again.');
    expect(s.state.turn - t0).toBeGreaterThan(1); // d(1, 70) or 200 turns helpless
  });
});

describe('a lycanthrope calls for help (dosummon)', () => {
  test('10 energy: tame helpers come', () => {
    const s = room();
    become(s, 'nh:werejackal', 12);
    const before = new Set(Object.keys(s.state.entities));
    const r = monster(s);
    expect(r.turn).toBe(true);
    expect(r.text[0]).toBe('You call upon your brethren for help!');
    expect(uen(s)).toBe(2);
    const helpers = Object.entries(s.state.entities).filter(
      ([k, e]) => !before.has(k) && e?.c.monster,
    );
    expect(helpers.length).toBeGreaterThanOrEqual(1);
    for (const [, e] of helpers) {
      expect(['nh:jackal', 'nh:coyote', 'nh:fox']).toContain(e!.def);
      expect(e!.c.monster!.tame).toBeTruthy();
    }
  });

  test('without the energy', () => {
    const s = room();
    become(s, 'nh:werejackal', 9);
    expect(monster(s).text).toEqual(['You lack the energy to send forth a call for help!']);
  });
});

describe('gremlin and shrieker', () => {
  test('a gremlin form multiplies only on a fountain, and no time passes', () => {
    const s = room();
    become(s, 'nh:gremlin');
    expect(monster(s)).toEqual({ text: ['There is no fountain here.'], turn: false, prompt: null });
    const level = s.state.levels['dlvl1']!;
    level.palette.push(T.fountain);
    level.cells[s.here.y * level.width + s.here.x] = level.palette.length - 1;
    getPlayer(s.state).c.hp = { cur: 20, max: 20 };
    const r = monster(s);
    expect(r.text[0]).toBe('You multiply!');
    expect(r.turn).toBe(false);
    const copy = Object.values(s.state.entities).find(
      (e) => e?.def === 'nh:gremlin' && e.c.monster,
    );
    expect(copy?.c.monster?.tame).toBeTruthy();
    expect(getPlayer(s.state).c.hp).toEqual({ cur: 10, max: 10 });
  });

  test('a shrieker form shrieks and wakes the level', () => {
    const s = room();
    become(s, 'nh:shrieker');
    const id = addMon(s.state, 'nh:gnome', s.here.x + 3, s.here.y, { asleep: true });
    expect(monster(s)).toEqual({ text: ['You shriek.'], turn: false, prompt: null });
    expect(s.state.entities[String(id)]!.c.monster!.asleep).toBe(false);
  });
});

describe('cancellation returns a polymorphed hero to her own form (cancel_monst())', () => {
  const cancel = (s: S): string[] => {
    probe.fn = (ctx) => {
      cancelMonst(ctx, 'hero', { kind: 'wand', item: null as never }, true, false);
    };
    return eng
      .step(s.state, { type: 'mod', action: 'pt:run' })
      .events.flatMap((e) =>
        e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : [],
      );
  };
  test('she returns to human form', () => {
    const s = room();
    become(s, 'nh:jackal');
    expect(cancel(s)).toContain('You return to human form!');
    expect(heroFormId(s.state)).toBeNull();
  });
  test('Unchanging: the amulet grows hot', () => {
    const s = room();
    become(s, 'nh:jackal');
    getPlayer(s.state).c.props = {
      ...getPlayer(s.state).c.props,
      unchanging: { intrinsic: true, timeout: 0 },
    } as never;
    expect(cancel(s)).toEqual(['Your amulet grows hot for a moment, then cools.']);
    expect(heroFormId(s.state)).toBe('nh:jackal');
  });
});

describe('uhim()/uhis() in death texts', () => {
  test('a male hero dies by himself, with his own pick-axe', () => {
    const s = room();
    expect(uhimKey(s.state, '!@killer.zap.self.fire')).toBe('!@killer.zap.self.fire');
    setHeroFemale(s.state, false);
    expect(uhimKey(s.state, '!@killer.zap.self.fire')).toBe('!@killer.zap.self.fire.m');
    // every text with her in it has its male twin
    const en = messagesEn as Record<string, string>;
    for (const [k, v] of Object.entries(en)) {
      if (!k.startsWith('killer.') || !/\bher(self)?\b/.test(v)) continue;
      expect([k, en[`${k}.m`]]).toEqual([
        k,
        v.replace(/herself/g, 'himself').replace(/her /g, 'his '),
      ]);
    }
  });
});
