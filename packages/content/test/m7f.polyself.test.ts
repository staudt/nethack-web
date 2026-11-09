// m7f-d step 3: the hero's polymorph core. polyself() from each source (wand, potion, trap,
// polymorphitis, wizard #polyself), the control prompt, polymon()/rehumanize()/newman(), the form's
// timeout, dying in a form, Unchanging, lycanthropy (you_were()/you_unwere()), level gain and
// drain in a form, the form's gender, glyph, status and properties.
import {
  buildSnapshot,
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type Engine,
  type Entity,
  type GameEvent,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod, wizardMod, WIZ_POLYSELF } from '../src/index';
import { losexp, resistsDrliHero } from '../src/exper';
import { changeSex, heroFemale, polyGender, setHeroFemale } from '../src/gender';
import { pluslvl } from '../src/hero';
import { heroMovement } from '../src/stats';
import { losehp } from '../src/hp';
import { mdamageu } from '../src/mhitu';
import { newman, polymon, polyself, rehumanize, youWere } from '../src/polyself';
import { P, hasProp, setIntrinsic, updateWornProps } from '../src/props';
import { heroFormId, upolyOf } from '../src/upoly';
import { setUlycn } from '../src/werestate';
import { addMon } from './helpers';
import { itemOf, levelSetup, plainKit, render } from './itemHelpers';

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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);

const ROOM = ['         ', ' ....... ', ' ...@... ', ' ....... ', '         '];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with a real Ctx; the rendered messages. */
function run(s: S, fn: (ctx: Ctx) => void, e: Engine = eng): string[] {
  probe.fn = fn;
  return textsOf(e.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}
function answer(s: S, value: unknown, e: Engine = eng): string[] {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return textsOf(e.step(s.state, { type: 'answer', promptId: p.id, value: value as never }).events);
}
const wait = (s: S, e: Engine = eng): StepResult => e.step(s.state, { type: 'wait' });
const hero = (s: S): Entity => getPlayer(s.state);
const form = (s: S): DefId | null => heroFormId(s.state);
const heroView = (st: GameState) =>
  buildSnapshot(eng.registry, st).entities.find((e) => e.id === st.playerId)!;
const setAttr = (s: S, k: 'str' | 'con', v: number): void => {
  hero(s).c.attributes![k] = v;
};
const prompted = (s: S): string | null => s.state.pendingPrompt?.prompt.id ?? null;

describe('polymon(): the hero becomes a monster', () => {
  test('"You turn into a gnome lord!": form, parked hit points, glyph, HD', () => {
    const s = room();
    const text = run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    expect(text).toContain('You turn into a gnome lord!');
    expect(form(s)).toBe('nh:gnome_lord');
    const u = upolyOf(s.state)!;
    expect(u.uhp).toEqual({ cur: 500, max: 500 });
    const hp = hero(s).c.hp!;
    // d(3, 8) for a level 3 form
    expect(hp.max).toBeGreaterThanOrEqual(3);
    expect(hp.max).toBeLessThanOrEqual(24);
    expect(hp.cur).toBe(hp.max);
    // rn1(500, 500) scaled down by ulevel / mlevel (1 / 3)
    expect(u.mtimedone).toBeGreaterThanOrEqual(166);
    expect(u.mtimedone).toBeLessThanOrEqual(333);
    // D4: drawn as the form; the status shows HD:3
    const snap = buildSnapshot(eng.registry, s.state);
    expect(heroView(s.state).g).toBe('nh:gnome_lord');
    expect(snap.status['hd']).toBe(3);
    // same form again: "You feel like a new gnome lord!"
    expect(run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false))).toContain(
      'You feel like a new gnome lord!',
    );
    expect(upolyOf(s.state)!.uhp).toEqual({ cur: 500, max: 500 });
  });

  test('a level 0 form has rnd(4) hit points and no scaled time; poly_gender() 2 when not humanoid', () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
    const hp = hero(s).c.hp!;
    expect(hp.max).toBeGreaterThanOrEqual(1);
    expect(hp.max).toBeLessThanOrEqual(4);
    expect(upolyOf(s.state)!.mtimedone).toBeGreaterThanOrEqual(500);
    expect(polyGender(s.state)).toBe(2);
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    expect(polyGender(s.state)).toBe(1);
  });

  test("the form's properties while in it (set_uasmon()), gone when she returns", () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:floating_eye' as DefId, false));
    expect(hasProp(hero(s), P.LEVITATION)).toBe(true);
    expect(hasProp(hero(s), P.TELEPAT)).toBe(true);
    run(s, (ctx) => rehumanize(ctx));
    expect(hasProp(hero(s), P.LEVITATION)).toBe(false);
    expect(hasProp(hero(s), P.TELEPAT)).toBe(false);
    // an undead form resists level drain
    run(s, (ctx) => polymon(ctx, 'nh:kobold_zombie' as DefId, false));
    expect(resistsDrliHero({ state: s.state, defs: eng.registry })).toBe(true);
    expect(hasProp(hero(s), P.POISON_RES)).toBe(true);
  });

  test('strength: a strong orc form gets 18/50; a weak form caps it; hers comes back', () => {
    const s = room();
    setAttr(s, 'str', 16);
    run(s, (ctx) => polymon(ctx, 'nh:hill_orc' as DefId, false));
    expect(hero(s).c.attributes!.str).toBe(18 + 50);
    run(s, (ctx) => rehumanize(ctx));
    expect(hero(s).c.attributes!.str).toBe(16);
    setAttr(s, 'str', 18 + 75);
    run(s, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
    expect(hero(s).c.attributes!.str).toBe(18);
    run(s, (ctx) => rehumanize(ctx));
    expect(hero(s).c.attributes!.str).toBe(18 + 75);
  });

  test('a form of one sex sets hers (no word for it); a sex change of a form with both says so', () => {
    const s = room();
    setHeroFemale(s.state, false);
    expect(run(s, (ctx) => polymon(ctx, 'nh:water_nymph' as DefId, false))).toContain(
      'You turn into a water nymph!',
    );
    expect(heroFemale(s.state)).toBe(true);
    expect(upolyOf(s.state)!.mfemale).toBe(false);
    run(s, (ctx) => rehumanize(ctx));
    expect(heroFemale(s.state)).toBe(false);
    // change_sex() while polymorphed into a form of either sex flips both
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    run(s, (ctx) => changeSex(ctx));
    expect(heroFemale(s.state)).toBe(true);
    expect(upolyOf(s.state)!.mfemale).toBe(true);
    // sex_change_ok: 1 time in 10 a gendered word
    let seen = false;
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      const t = room(seed);
      const text = run(t, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, true));
      if (text.includes('You turn into a male gnome lord!')) {
        seen = true;
        expect(heroFemale(t.state)).toBe(false);
        expect(upolyOf(t.state)!.mfemale).toBe(true);
      }
    }
    expect(seen).toBe(true);
  });
});

describe("the form's speed", () => {
  test("she moves at the form's speed; a mold form waits out its time", () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    let mv = 0;
    run(s, (ctx) => {
      mv = heroMovement(ctx, s.state.playerId);
    });
    expect(mv).toBe(8);
    run(s, (ctx) => polymon(ctx, 'nh:brown_mold' as DefId, false));
    upolyOf(s.state)!.mtimedone = 5;
    const start = s.state.turn;
    const text = textsOf(wait(s).events);
    expect(text).toContain('You return to human form!');
    expect(s.state.turn).toBeGreaterThanOrEqual(start + 5);
  });
});

describe('returning to her own form', () => {
  test('the timeout: "You return to human form!", her hit points back', () => {
    const s = room();
    hero(s).c.hp = { cur: 321, max: 500 };
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    upolyOf(s.state)!.mtimedone = 3;
    // the countdown runs once a turn (her speed 8 spreads her moves over the turns)
    const start = s.state.turn;
    let text: string[] = [];
    while (form(s) !== null && s.state.turn < start + 10) text = textsOf(wait(s).events);
    expect(text).toContain('You return to human form!');
    expect(s.state.turn).toBe(start + 3);
    expect(hero(s).c.hp!.max).toBe(500);
    expect(hero(s).c.hp!.cur).toBeGreaterThanOrEqual(321); // (her own regeneration may run)
    expect(heroView(s.state).g).toBe(hero(s).def);
    expect(buildSnapshot(eng.registry, s.state).status['hd']).toBeUndefined();
  });

  test('dying in a form returns her to human form (losehp, a monster hit)', () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    const text = run(s, (ctx) => losehp(ctx, 999, '@killer.test'));
    expect(text).toContain('You return to human form!');
    expect(text).not.toContain('You die...');
    expect(s.state.gameOver).toBeNull();
    expect(hero(s).c.hp).toEqual({ cur: 500, max: 500 });
    run(s, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
    expect(run(s, (ctx) => mdamageu(ctx, 999, '@nh:jackal'))).toContain(
      'You return to human form!',
    );
    expect(s.state.gameOver).toBeNull();
  });

  test('Unchanging: the time runs on; dying in the form kills her', () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    setIntrinsic(hero(s), P.UNCHANGING, true);
    upolyOf(s.state)!.mtimedone = 1;
    wait(s);
    expect(form(s)).toBe('nh:gnome_lord');
    const left = upolyOf(s.state)!.mtimedone;
    expect(left).toBeGreaterThanOrEqual(1);
    expect(left).toBeLessThanOrEqual(301); // rnd(100 * 3 + 1)
    run(s, (ctx) => losehp(ctx, 999, '@killer.test'));
    expect(s.state.gameOver?.killer).toBe('!@killer.poly.stuck');
  });

  test('rehumanize() with an amulet of unchanging: "Your amulet fails!"', () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    const am = s.carry('nh:amulet_of_unchanging');
    itemOf(s.state, am).equipped = 'amulet';
    updateWornProps(s.state, eng.registry, s.state.playerId);
    const text = run(s, (ctx) => rehumanize(ctx));
    expect(text).toEqual(['Your amulet fails!', 'You return to human form!']);
    expect(form(s)).toBeNull();
  });
});

describe('polyself()', () => {
  test('Unchanging: "You fail to transform!"', () => {
    const s = room();
    setIntrinsic(hero(s), P.UNCHANGING, true);
    expect(run(s, (ctx) => polyself(ctx))).toEqual(['You fail to transform!']);
    expect(form(s)).toBeNull();
  });

  test('system shock: rn2(20) > Con is "You shudder for a moment." and rnd(30) damage', () => {
    let shocked = 0;
    let changed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = room(seed);
      setAttr(s, 'con', 3);
      const text = run(s, (ctx) => polyself(ctx));
      if (text.includes('You shudder for a moment.')) {
        shocked++;
        expect(form(s)).toBeNull();
        expect(hero(s).c.hp!.cur).toBeGreaterThanOrEqual(470);
        expect(hero(s).c.hp!.cur).toBeLessThan(500);
      } else changed++;
    }
    // 16 in 20 at Con 3
    expect(shocked).toBeGreaterThan(changed);
    expect(changed).toBeGreaterThan(0);
  });

  test('no shock above Con 19; a random polyok() form, or 1 time in 5 a new human', () => {
    let forms = 0;
    let newmen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = room(seed);
      setAttr(s, 'con', 25);
      hero(s).c.experience!.level = 10; // newman() at level 1 may kill her
      const text = run(s, (ctx) => polyself(ctx));
      expect(text).not.toContain('You shudder for a moment.');
      if (form(s) !== null) {
        forms++;
        const def = eng.registry.monster(form(s)!);
        expect(def.flags).not.toContain('nopoly');
        expect(text.some((t) => t.startsWith('You turn into'))).toBe(true);
      } else {
        newmen++;
        expect(text.some((t) => /^You feel like a new (wo)?man!$/.test(t))).toBe(true);
      }
    }
    expect(forms).toBeGreaterThan(newmen);
    expect(newmen).toBeGreaterThan(0);
  });

  test('the wand at herself and the polymorph trap reach it', () => {
    let s = room(1);
    setAttr(s, 'con', 25);
    const wand = s.carry('nh:wand_of_polymorph');
    itemOf(s.state, wand).spe = 5;
    eng.step(s.state, { type: 'mod', action: 'nh:zap' as DefId, args: { item: wand } as never });
    const zapped = answer(s, 'self');
    expect(
      zapped.some((t) => t.startsWith('You turn into') || t.startsWith('You feel like a new')),
    ).toBe(true);
    s = room(4);
    setAttr(s, 'con', 25);
    const lvl = s.state.levels['dlvl1']!;
    const p = hero(s).c.pos!;
    lvl.traps.push({ def: 'nh:polymorph_trap' as DefId, x: p.x + 1, y: p.y, seen: false });
    const text = textsOf(eng.step(s.state, { type: 'move', dir: 'e' } as never).events);
    expect(text).toContain('You feel a change coming over you.');
    expect(
      text.some((t) => t.startsWith('You turn into') || t.startsWith('You feel like a new')),
    ).toBe(true);
  });
});

describe('the control prompt', () => {
  test('"Become what kind of monster?": a name; forced control never makes a new human', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = room(seed);
      run(s, (ctx) => polyself(ctx, { controlled: true }));
      expect(prompted(s)).toBe('poly-what');
      expect(s.state.pendingPrompt?.prompt.key).toBe('polyself.prompt');
      // (1 time in 10 a sex change: "You turn into a male gnome lord!")
      const text = answer(s, ' gnome  lord ');
      expect(text.some((t) => /^You turn into a (male )?gnome lord!$/.test(t))).toBe(true);
      expect(form(s)).toBe('nh:gnome_lord');
    }
  });

  test('unknown names, unpolyable ones, then "That\'s enough tries!"', () => {
    const s = room();
    run(s, (ctx) => polyself(ctx, { controlled: true }));
    expect(answer(s, 'xyzzy')).toEqual(["I've never heard of such monsters."]);
    expect(prompted(s)).toBe('poly-what');
    expect(answer(s, 'werejackal')).toEqual(["You can't polymorph into a werejackal."]);
    expect(answer(s, 'xyzzy')).toEqual(["I've never heard of such monsters."]);
    expect(answer(s, 'xyzzy')).toEqual(["I've never heard of such monsters."]);
    const text = answer(s, 'xyzzy');
    expect(text.slice(0, 2)).toEqual([
      "I've never heard of such monsters.",
      "That's enough tries!",
    ]);
    // the last pick was nothing: a random form (forced control: no new human)
    expect(prompted(s)).toBeNull();
    expect(form(s)).not.toBeNull();
  });

  test('"human" makes a new human; Escape under forced control is "Never mind."', () => {
    // (seed 1: both new humans survive newman()'s health check)
    const s = room(1);
    run(s, (ctx) => polyself(ctx, { controlled: true }));
    expect(answer(s, null)).toEqual(['Never mind.']);
    expect(form(s)).toBeNull();
    run(s, (ctx) => polyself(ctx, { controlled: true }));
    expect(answer(s, 'human')).toContain('You feel like a new woman!');
    expect(form(s)).toBeNull();
    // in a form, "human" returns her as a new human too
    run(s, (ctx) => polymon(ctx, 'nh:jackal' as DefId, false));
    run(s, (ctx) => polyself(ctx, { controlled: true }));
    expect(answer(s, 'human')).toContain('You feel like a new woman!');
    expect(form(s)).toBeNull();
    expect(upolyOf(s.state)).toBeNull();
  });

  test('a class symbol picks a form of that class; a placeholder its substitute', () => {
    const s = room();
    run(s, (ctx) => polyself(ctx, { controlled: true }));
    answer(s, 'G');
    expect(eng.registry.monster(form(s)!).glyph.ch).toBe('G');
    run(s, (ctx) => polyself(ctx, { controlled: true }));
    answer(s, 'orc');
    expect(['nh:hill_orc', 'nh:mordor_orc']).toContain(form(s));
  });

  test('polymorph control (a ring): asked, Escape is a random change, no system shock', () => {
    const s = room(1);
    setAttr(s, 'con', 3);
    setIntrinsic(hero(s), P.POLYMORPH_CONTROL, true);
    run(s, (ctx) => polyself(ctx));
    expect(prompted(s)).toBe('poly-what');
    const text = answer(s, null);
    expect(text).not.toContain('Never mind.');
    expect(
      text.some((t) => t.startsWith('You turn into') || t.startsWith('You feel like a new')),
    ).toBe(true);
    // stunned: no control, so system shock may strike again
    setIntrinsic(hero(s), P.STUNNED, true);
    run(s, (ctx) => polyself(ctx));
    expect(prompted(s)).toBeNull();
  });

  test('the blessed potion: forced control, and the form lasts rn2(15) + 10 turns at most', () => {
    const s = room();
    const pot = s.carry('nh:potion_of_polymorph');
    itemOf(s.state, pot).buc = 'blessed';
    const text = textsOf(
      eng.step(s.state, { type: 'mod', action: 'nh:quaff' as DefId, args: { item: pot } as never })
        .events,
    );
    expect(text).toContain('You feel a little strange.');
    expect(prompted(s)).toBe('poly-what');
    answer(s, 'jackal');
    expect(form(s)).toBe('nh:jackal');
    const t = upolyOf(s.state)!.mtimedone;
    // capped to rn2(15) + 10, then the quaff's turn ends (nh_timeout() counts one down)
    expect(t).toBeGreaterThanOrEqual(9);
    expect(t).toBeLessThanOrEqual(24);
  });

  test('wizard mode #polyself', () => {
    const s = room();
    const offers = wiz
      .query(s.state)
      .actionsFor({ kind: 'self' })
      .map((o) => (o.action.type === 'mod' ? o.action.action : ''));
    expect(offers).toContain(WIZ_POLYSELF);
    wiz.step(s.state, { type: 'mod', action: WIZ_POLYSELF as DefId });
    expect(prompted(s)).toBe('poly-what');
    const turn = s.state.turn;
    expect(answer(s, 'floating eye', wiz)).toContain('You turn into a floating eye!');
    expect(s.state.turn).toBe(turn); // takes no time (ECMD_OK)
  });
});

describe('newman()', () => {
  test('level -2..+2, new hit points and energy, "You feel like a new woman!"', () => {
    const levels = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = room(seed);
      const xp = hero(s).c.experience!;
      xp.level = 5;
      const text = run(s, (ctx) => newman(ctx, false));
      expect(text).toContain('You feel like a new woman!');
      expect(xp.level).toBeGreaterThanOrEqual(3);
      expect(xp.level).toBeLessThanOrEqual(7);
      levels.add(xp.level);
      const hp = hero(s).c.hp!;
      expect(hp.max).toBeGreaterThanOrEqual(xp.level);
      expect(hp.cur).toBeLessThanOrEqual(hp.max);
      expect(hero(s).c.hunger!.nutrition).toBeGreaterThanOrEqual(500);
      expect(hero(s).c.hunger!.nutrition).toBeLessThan(1000);
    }
    expect(levels.size).toBe(5);
  });

  test('1 time in 10 (when allowed) a sex change: "You feel like a new man!"', () => {
    let changed = false;
    for (let seed = 1; seed <= 60 && !changed; seed++) {
      const s = room(seed);
      const text = run(s, (ctx) => newman(ctx, true));
      if (text.includes('You feel like a new man!')) {
        changed = true;
        expect(heroFemale(s.state)).toBe(false);
      } else expect(heroFemale(s.state)).toBe(true);
    }
    expect(changed).toBe(true);
  });

  test('below level 1: "Your new form doesn\'t seem healthy enough to survive."', () => {
    let died = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = room(seed);
      const text = run(s, (ctx) => newman(ctx, false));
      if (s.state.gameOver) {
        died++;
        expect(text).toContain("Your new form doesn't seem healthy enough to survive.");
        expect(s.state.gameOver.killer).toBe('@killer.poly.unsuccessful');
      }
    }
    // rn1(5, -2) < 0 at level 1: 2 times in 5
    expect(died).toBeGreaterThan(0);
    expect(died).toBeLessThan(20);
  });
});

describe('experience in a form', () => {
  test('pluslvl() and losexp() change both pools; the form may give out', () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:gnome_lord' as DefId, false));
    const mh = { ...hero(s).c.hp! };
    run(s, (ctx) => pluslvl(ctx, s.state.playerId, false));
    expect(hero(s).c.hp!.max - mh.max).toBeGreaterThanOrEqual(1);
    expect(hero(s).c.hp!.max - mh.max).toBeLessThanOrEqual(4);
    expect(upolyOf(s.state)!.uhp.max).toBeGreaterThan(500);
    hero(s).c.hp = { cur: 1, max: 1 };
    expect(run(s, (ctx) => losexp(ctx, null))).toContain('You return to human form!');
    expect(form(s)).toBeNull();
  });
});

describe('lycanthropy', () => {
  test('a lycanthrope polymorphs into her beast (no system shock); its time out returns her', () => {
    const s = room();
    setAttr(s, 'con', 3);
    setUlycn(s, 'nh:werejackal' as DefId);
    expect(run(s, (ctx) => polyself(ctx))).toContain('You turn into a werejackal!');
    expect(form(s)).toBe('nh:werejackal');
    upolyOf(s.state)!.mtimedone = 1;
    expect(textsOf(wait(s).events)).toContain('You return to human form!');
  });

  test('you_were(): not with a hostile monster next to her; asked with control', () => {
    const s = room();
    setUlycn(s, 'nh:werejackal' as DefId);
    const p = hero(s).c.pos!;
    const mon = addMon(s.state, 'nh:newt', p.x + 1, p.y);
    s.state.entities[String(mon)]!.c.actor!.speed = 0;
    run(s, (ctx) => youWere(ctx));
    expect(form(s)).toBeNull();
    delete s.state.entities[String(mon)];
    setIntrinsic(hero(s), P.POLYMORPH_CONTROL, true);
    run(s, (ctx) => youWere(ctx));
    expect(s.state.pendingPrompt?.prompt.key).toBe('polyself.were_prompt');
    expect(
      render({ key: 'polyself.were_prompt', params: s.state.pendingPrompt!.prompt.params! }),
    ).toBe('Do you want to change into a jackal?');
    answer(s, true);
    expect(form(s)).toBe('nh:werejackal');
    // the time runs out: "Remain in beast form?" yes keeps her in it for rn1(200, 200)
    upolyOf(s.state)!.mtimedone = 1;
    wait(s);
    expect(prompted(s)).toBe('poly-remain');
    answer(s, true);
    expect(form(s)).toBe('nh:werejackal');
    expect(upolyOf(s.state)!.mtimedone).toBeGreaterThanOrEqual(200);
    expect(upolyOf(s.state)!.mtimedone).toBeLessThan(400);
  });

  test('unholy water changes her; holy water purifies her and she returns', () => {
    const s = room();
    setUlycn(s, 'nh:werejackal' as DefId);
    const unholy = s.carry('nh:potion_of_water');
    itemOf(s.state, unholy).buc = 'cursed';
    eng.step(s.state, {
      type: 'mod',
      action: 'nh:quaff' as DefId,
      args: { item: unholy } as never,
    });
    expect(form(s)).toBe('nh:werejackal');
    const holy = s.carry('nh:potion_of_water');
    itemOf(s.state, holy).buc = 'blessed';
    const text = textsOf(
      eng.step(s.state, { type: 'mod', action: 'nh:quaff' as DefId, args: { item: holy } as never })
        .events,
    );
    expect(text).toContain('You feel purified.');
    expect(text).toContain('You return to human form!');
    expect(form(s)).toBeNull();
  });
});

describe('polymorphitis', () => {
  test('with Polymorph she changes on her own about 1 turn in 100', () => {
    // a seed where her first change is not newman()'s fatal system shock
    const s = room(3);
    setAttr(s, 'con', 25);
    setIntrinsic(hero(s), P.POLYMORPH, true);
    let turns = 0;
    let changed = false;
    while (turns < 2000 && !changed) {
      const text = textsOf(wait(s).events);
      turns++;
      changed = text.some(
        (t) => t.startsWith('You turn into') || t.startsWith('You feel like a new'),
      );
    }
    expect(changed).toBe(true);
    // Unchanging stops it
    const t = room();
    setIntrinsic(hero(t), P.POLYMORPH, true);
    setIntrinsic(hero(t), P.UNCHANGING, true);
    for (let i = 0; i < 400; i++) wait(t);
    expect(form(t)).toBeNull();
  });
});
