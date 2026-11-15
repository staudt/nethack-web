// m16 step 3: engraving with wands (doengrave_sfx_item(WAND_CLASS), doengrave_sfx_item_WAN()),
// down zaps at an engraving (zap_map()) and a monster's shower of missiles
// (mon_spell_hits_spot()).
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type DefId,
  type EntityId,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { engrAt, engravingsOn, makeEngrAt, type EngrType } from '../src/engr';
import { isKnown } from '../src/o_init';
import { P, hasProp, setIntrinsic } from '../src/props';
import { ENGRAVE_TEXTS } from '../src/engravetxt';
import { FALSE_RUMORS, TRUE_RUMORS } from '../src/rumortxt';
import { randomEngraving } from '../src/rndengr';
import { vanillaMod } from '../src/index';
import { castmu } from '../src/mcastu';
import { SPE, weffectsFrom } from '../src/zap';
import { addMon } from './helpers';
import { ctxFor, levelSetup } from './itemHelpers';

const MAGM: AttackDef = { at: 'magic', ad: 'magm', n: 0, d: 0 };

type Setup = ReturnType<typeof levelSetup>;

/** A 7x5 room with the hero in the middle and nothing in her pack. */
function setup(seed = 1): Setup {
  const s = levelSetup(['.......', '.......', '...@...', '.......', '.......'], seed);
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  return s;
}

const lvl = (s: Setup): Level => s.state.levels['dlvl1'] as Level;
const here = (s: Setup) => engrAt(s.ctx, lvl(s), s.here.x, s.here.y);
const write = (s: Setup, text: string, type: EngrType): void => {
  makeEngrAt(s.ctx, lvl(s), s.here.x, s.here.y, text, null, 0, type);
};

function wand(s: Setup, id: string, spe = 5, buc: 'cursed' | 'uncursed' = 'uncursed'): EntityId {
  const e = s.carry(id);
  const it = s.state.entities[String(e)]!.c.item!;
  it.spe = spe;
  it.buc = buc;
  return e;
}

const answer = (s: Setup, value: unknown) =>
  s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never });

/** `E`, then the wand: the text of the stylus answer. */
function engraveWith(s: Setup, id: EntityId): string[] {
  s.mod('nh:engrave');
  expect(s.state.pendingPrompt?.prompt.id).toBe('engrave-with');
  return s.text(answer(s, id));
}

const pending = (s: Setup): string | undefined => s.state.pendingPrompt?.prompt.id;
const spe = (s: Setup, id: EntityId): number | undefined =>
  s.state.entities[String(id)]?.c.item?.spe;

describe('the engraving wands', () => {
  test('digging identifies itself and engraves; "Gravel flies up from the floor."', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_digging');
    const unknown = !isKnown(s.state, s.ctx.defs, 'nh:wand_of_digging' as DefId);
    const t = engraveWith(s, w);
    if (unknown) expect(t[0]).toMatch(/^This [a-z ]+ wand is a wand of digging!$/);
    expect(t.at(-1)).toBe('You engrave in the floor with a wand of digging.');
    expect(isKnown(s.state, s.ctx.defs, 'nh:wand_of_digging' as DefId)).toBe(true);
    expect(spe(s, w)).toBe(4);
    expect(pending(s)).toBe('engrave');
    const r = answer(s, 'Elbereth');
    expect(s.text(r)[0]).toBe('Gravel flies up from the floor.');
    expect(here(s)).toMatchObject({ type: 'engrave', text: 'Elbereth' });
  });

  test('fire burns: "Flames fly from the wand."', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_fire');
    expect(engraveWith(s, w).at(-1)).toBe('You burn into the floor with a wand of fire.');
    expect(s.text(answer(s, 'Elbereth'))[0]).toBe('Flames fly from the wand.');
    expect(here(s)).toMatchObject({ type: 'burn', text: 'Elbereth' });
  });

  test('lightning burns and its flash blinds her', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_lightning');
    engraveWith(s, w);
    const t = s.text(answer(s, 'Elbereth'));
    expect(t.slice(0, 2)).toEqual([
      'Lightning arcs from the wand.',
      'You are blinded by the flash!',
    ]);
    // blind for rnd(50) turns (this seed: 1, so she already sees again)
    expect(hasProp(getPlayer(s.state), P.BLINDED) || t.includes('You can see again.')).toBe(true);
    expect(here(s)).toMatchObject({ type: 'burn', text: 'Elbereth' });
  });

  test('the immediate and ray wands write in the dust and tell their tale', () => {
    const cases: [string, string][] = [
      ['nh:wand_of_striking', 'The wand unsuccessfully fights your attempt to write!'],
      ['nh:wand_of_slow_monster', 'The bugs on the floor slow down!'],
      ['nh:wand_of_speed_monster', 'The bugs on the floor speed up!'],
      ['nh:wand_of_magic_missile', 'The floor is riddled by bullet holes!'],
      ['nh:wand_of_sleep', 'The bugs on the floor stop moving!'],
      ['nh:wand_of_death', 'The bugs on the floor stop moving!'],
      ['nh:wand_of_cold', 'A few ice cubes drop from the wand.'],
    ];
    for (const [id, post] of cases) {
      const s = setup();
      const w = wand(s, id);
      engraveWith(s, w);
      expect(pending(s)).toBe('engrave');
      expect(s.text(answer(s, 'x'))[0]).toBe(post);
      expect(here(s)?.type).toBe('dust');
    }
  });

  test('an empty text: the wand glows, then fades, and that takes a move', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_striking');
    engraveWith(s, w);
    const turn = s.state.turn;
    const t = s.text(answer(s, ''));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatch(/^The [a-z ]+ glows, then fades\.$/);
    expect(s.state.turn).toBe(turn + 1);
    expect(spe(s, w)).toBe(4);
  });
});

describe('the wand on the current engraving', () => {
  test('cancellation and make invisible erase it: "The engraving on the floor vanishes!"', () => {
    for (const id of ['nh:wand_of_cancellation', 'nh:wand_of_make_invisible']) {
      const s = setup();
      write(s, 'Elbereth', 'burn');
      const t = engraveWith(s, wand(s, id));
      expect(t[0]).toBe('The engraving on the floor vanishes!');
      expect(here(s)).toBeNull();
      // nothing to add to: straight to the text
      expect(pending(s)).toBe('engrave');
    }
  });

  test('cold erases a burned engraving only', () => {
    const s = setup();
    write(s, 'Elbereth', 'burn');
    expect(engraveWith(s, wand(s, 'nh:wand_of_cold'))[0]).toBe(
      'The engraving on the floor vanishes!',
    );
    expect(here(s)).toBeNull();
    const d = setup();
    write(d, 'Elbereth', 'dust');
    engraveWith(d, wand(d, 'nh:wand_of_cold'));
    expect(here(d)?.text).toBe('Elbereth');
    expect(pending(d)).toBe('engrave-add');
  });

  test('teleportation sends it elsewhere on the level', () => {
    const s = setup();
    write(s, 'Elbereth', 'engrave');
    expect(engraveWith(s, wand(s, 'nh:wand_of_teleportation'))[0]).toBe(
      'The engraving on the floor vanishes!',
    );
    expect(here(s)).toBeNull();
    const all = engravingsOn(s.ctx, lvl(s));
    expect(all).toHaveLength(1);
    expect(all[0]!.e).toMatchObject({ text: 'Elbereth', type: 'engrave' });
    expect([all[0]!.x, all[0]!.y]).not.toEqual([s.here.x, s.here.y]);
  });

  test('polymorph rewrites it: "The engraving now reads: ..." and no text is asked', () => {
    const s = setup();
    write(s, 'Elbereth', 'dust');
    const w = wand(s, 'nh:wand_of_polymorph');
    const turn = s.state.turn;
    const t = engraveWith(s, w);
    const e = here(s)!;
    expect(t).toEqual([`The engraving now reads: "${e.text}".`]);
    expect([...TRUE_RUMORS, ...FALSE_RUMORS, ...ENGRAVE_TEXTS]).toContain(e.pristine);
    expect(pending(s)).toBeUndefined();
    expect(s.state.turn).toBe(turn + 1);
  });

  test('blind, polymorph keeps the type and writes a name', () => {
    const s = setup();
    write(s, 'Elbereth', 'burn');
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    const t = engraveWith(s, wand(s, 'nh:wand_of_polymorph'));
    expect(t).toEqual([]);
    expect(here(s)?.type).toBe('burn');
    expect(here(s)?.text).toMatch(/^[A-Z][a-z]+ /);
  });
});

describe('charges', () => {
  test('an empty wand is too worn out (unless wrested) and takes a move', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_striking', 0);
    const t = engraveWith(s, w);
    if (spe(s, w) === 0) {
      expect(t).toEqual(['The wand is too worn out to engrave.']);
      expect(pending(s)).toBeUndefined();
    } else {
      expect(t[0]).toBe('You wrest one last charge from the worn-out wand.');
    }
  });

  test('a cancelled wand turns to dust', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_striking', -1);
    const t = engraveWith(s, w);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatch(/^The [a-z ]+ glows violently, then turns to dust\.$/);
    expect(t[1]).toBe(
      'You are not going to get anywhere trying to write in the dust with your dust.',
    );
    expect(s.state.entities[String(w)]).toBeUndefined();
  });

  test('a cursed wand may explode (1 in 100)', () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const s = setup(seed);
      const w = wand(s, 'nh:wand_of_striking', 5, 'cursed');
      const t = engraveWith(s, w);
      if (s.state.entities[String(w)]) continue;
      found = true;
      expect(t[0]).toMatch(/suddenly explodes!$/);
      expect(pending(s)).toBeUndefined();
    }
    expect(found).toBe(true);
  });
});

describe('floating', () => {
  test('a wand gestures towards the floor and cannot reach it', () => {
    const s = setup();
    setIntrinsic(getPlayer(s.state), P.LEVITATION, true);
    const w = wand(s, 'nh:wand_of_striking');
    expect(engraveWith(s, w)).toEqual([
      'You gesture, with your wand, towards the floor below you.',
      "The wand does nothing more, and the tip of the wand can't reach the floor.",
    ]);
    expect(spe(s, w)).toBe(4);
  });

  test('a dagger cannot reach it at all', () => {
    const s = setup();
    setIntrinsic(getPlayer(s.state), P.LEVITATION, true);
    expect(engraveWith(s, s.carry('nh:dagger'))).toEqual(["You can't reach the floor."]);
  });
});

describe('the wand of wishing', () => {
  test('asks the wish, then the engraving goes on', () => {
    const s = setup();
    const w = wand(s, 'nh:wand_of_wishing', 2);
    engraveWith(s, w);
    expect(pending(s)).toBe('wish');
    const t = s.text(answer(s, 'dagger'));
    expect(inventoryOf(s.state, s.state.playerId).some((e) => e.def === 'nh:dagger')).toBe(true);
    expect(t.at(-1)).toBe('You write in the dust with a wand of wishing.');
    expect(pending(s)).toBe('engrave');
    expect(s.text(answer(s, '')).at(-1)).toBe('The wand of wishing glows, then fades.');
  });
});

describe('down zaps', () => {
  const zapDown = (s: Setup, id: EntityId) => {
    s.mod('nh:zap', { item: id });
    return s.text(answer(s, 'down'));
  };

  test('cancellation and make invisible erase the engraving; not a headstone', () => {
    for (const id of ['nh:wand_of_cancellation', 'nh:wand_of_make_invisible']) {
      const s = setup();
      write(s, 'Elbereth', 'burn');
      zapDown(s, wand(s, id));
      expect(here(s)).toBeNull();
    }
    const h = setup();
    write(h, 'RIP', 'headstone');
    zapDown(h, wand(h, 'nh:wand_of_cancellation'));
    expect(here(h)?.text).toBe('RIP');
  });

  test('teleportation moves it; polymorph makes a random one', () => {
    const s = setup();
    write(s, 'Elbereth', 'dust');
    zapDown(s, wand(s, 'nh:wand_of_teleportation'));
    expect(here(s)).toBeNull();
    expect(engravingsOn(s.ctx, lvl(s))).toHaveLength(1);
    const p = setup();
    write(p, 'Elbereth', 'dust');
    zapDown(p, wand(p, 'nh:wand_of_polymorph'));
    expect([...TRUE_RUMORS, ...FALSE_RUMORS, ...ENGRAVE_TEXTS]).toContain(here(p)?.pristine);
  });

  test('striking scuffs a dust engraving', () => {
    const s = setup();
    write(s, 'Elbereth', 'dust');
    zapDown(s, wand(s, 'nh:wand_of_striking'));
    expect(here(s)?.text ?? '').not.toBe('Elbereth');
  });
});

describe('random engravings', () => {
  test('a rumor or an engrave line, a quarter of its letters worn', () => {
    const ctx = ctxFor(setup().state);
    const all = [...TRUE_RUMORS, ...FALSE_RUMORS, ...ENGRAVE_TEXTS];
    for (let i = 0; i < 50; i++) {
      const r = randomEngraving(ctx);
      expect(all).toContain(r.pristine);
      expect(r.pristine.startsWith('[cookie] ')).toBe(false);
      expect(r.text.length).toBeLessThanOrEqual(r.pristine.length);
    }
  });
});

describe('spells and monster spells at the engraving', () => {
  const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
  const probeMod: Mod = {
    id: 'engr-probe',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'engr-probe:run',
        labelKey: 'engr-probe',
        handles: 'mod',
        offer: () => [],
        perform(ctx) {
          probe.fn(ctx);
          return 0;
        },
      });
    },
  };
  const probed = createEngine([vanillaMod, probeMod]);
  const run = (s: Setup, fn: (ctx: Ctx) => void): string[] => {
    probe.fn = fn;
    return s.text(probed.step(s.state, { type: 'mod', action: 'engr-probe:run' as DefId }));
  };

  test('stone to flesh cast down smooths an engraved text, not a burned one', () => {
    const s = setup();
    write(s, 'Elbereth', 'engrave');
    const t = run(s, (ctx) =>
      weffectsFrom(ctx, { kind: 'spell', otyp: SPE.stoneToFlesh, blessed: false }, 'down'),
    );
    expect(t).toEqual(['The edges on the floor get smoother.']);
    const b = setup();
    write(b, 'Elbereth', 'burn');
    const tb = run(b, (ctx) =>
      weffectsFrom(ctx, { kind: 'spell', otyp: SPE.stoneToFlesh, blessed: false }, 'down'),
    );
    expect(tb).toEqual(['Blood pools at your feet.']);
    expect(here(b)?.text).toBe('Elbereth');
  });

  test('force bolt down scuffs the engraving magically', () => {
    const s = setup();
    write(s, 'Elbereth', 'dust');
    run(s, (ctx) =>
      weffectsFrom(ctx, { kind: 'spell', otyp: SPE.forceBolt, blessed: false }, 'down'),
    );
    expect(here(s)?.text ?? '').not.toBe('Elbereth');
  });

  test("a monster's shower of missiles clobbers the engraving under her", () => {
    // search RNG offsets for a cast that is not fumbled
    let done = false;
    for (let k = 0; k < 50 && !done; k++) {
      const st = setup();
      write(st, 'Elbereth', 'dust');
      const mid = addMon(st.state, 'nh:kobold_shaman', st.here.x + 1, st.here.y);
      st.state.entities[String(mid)]!.c.actor!.speed = 0;
      st.state.entities[String(mid)]!.c.monster!.level = 4;
      const t = run(st, (ctx) => {
        for (let i = 0; i < k; i++) ctx.rng.rn2(2);
        castmu(ctx, mid, MAGM, true, true);
      });
      if (!t.includes('You are hit by a shower of missiles!')) continue;
      done = true;
      expect(here(st)?.text ?? '').not.toBe('Elbereth');
    }
    expect(done).toBe(true);
  });
});
