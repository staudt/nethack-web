// m18 step 2: vampires and the shapeshifter core. A vampire or vampire lord keeps its kind in
// `cham` and is born as a vampire bat or fog cloud (a lord also a wolf); it shifts back when hurt,
// rises as itself when killed in another form, reverts instead of turning to stone, turns into a
// fog cloud to pass under a closed door; altars scare it, silver and blessings hurt it in any form,
// garlic is taboo to a pet one; MS_VAMPIRE's #chat lines; the scripts' vampires; the grown-up
// table by the port's row ids.
// ref: src/mon.c decide_to_shapeshift(), pickvampshape(), vamprises(), vamp_stone(), newcham();
// src/makemon.c makemon(), pm_to_cham(); src/monmove.c onscary(), can_fog(), vamp_shift();
// src/dog.c dogfood(); src/sounds.c domonnoise(); src/mondata.c grownups[]
import {
  cellIndex,
  cellRules,
  createEngine,
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Mod,
  type MonsterDef,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { makemon } from '../src/generation';
import { chamOf, isVampshifter, monHatesSilver, stuffPreventsPassage } from '../src/chamstate';
import { decideToShapeshift, vamprises } from '../src/shapeshift';
import { newcham, pickvampshape } from '../src/newcham';
import { monsterDied } from '../src/mondeath';
import { minstapetrify } from '../src/stoning';
import { onscary } from '../src/scary';
import { dogfood, TABU } from '../src/dog';
import { domonnoise } from '../src/chat';
import { setGenocided } from '../src/vanquished';
import { growUp } from '../src/mhitm';
import { GROWNUPS, GROWNUP_ABSENT, littleToBig } from '../src/eggstate';
import { mksobj } from '../src/items';
import { monsterAttack } from '../src/combat';
import { fogUnderDoor, mfndpos } from '../src/monmove';
import { setTerrain, T } from '../src/terrain';
import { GEHENNOM } from '../src/levelflags';
import { MINEND_3 } from '../src/minesend';
import { defs, levelSetup, obj, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'vp-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'vp-probe:run',
      labelKey: 'vp-probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'vp-probe:run' as DefId }).events);
}

const ROOM = [
  '                         ',
  ' ....................... ',
  ' ....................... ',
  ' ....................... ',
  ' ...........@........... ',
  ' ....................... ',
  ' ....................... ',
  '                         ',
];

/** A lit room with no monsters, the hero in the middle. */
function room(seed = 1, rows = ROOM): GameState {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  return s.state;
}

const VAMPIRE = 'nh:vampire' as DefId;
const VAMPIRE_LORD = 'nh:vampire_lord' as DefId;
const BAT = 'nh:vampire_bat' as DefId;
const FOG = 'nh:fog_cloud' as DefId;
const WOLF = 'nh:wolf' as DefId;
const mon = (id: string): MonsterDef => defs.monster(id as DefId);
const ent = (state: GameState, id: number): Entity | undefined => state.entities[String(id)];

/** Makes a monster of `def` at (x, y) and returns it (born shifted if it is a vampire). */
function make(ctx: Ctx, def: string, x: number, y: number): Entity {
  const id = makemon(ctx, mon(def), { x, y }, { nogroup: true, adjacentOk: true });
  expect(id).not.toBeNull();
  const e = ctx.state.entities[String(id)];
  if (!e) throw new Error('no monster');
  return e;
}

/** A vampire shapeshifter of kind `kind` made at (x, y), then put into form `form`. */
function shifted(ctx: Ctx, kind: string, form: string, x: number, y: number): Entity {
  const e = make(ctx, kind, x, y);
  if (e.def !== form) expect(newcham(ctx, e, mon(form))).toBe(true);
  expect(e.def).toBe(form);
  expect(chamOf(ctx, e.id)).toBe(kind);
  return e;
}

describe('the rows and birth', () => {
  test('the vampire and the vampire lord: level drain bites, shapeshifters, no corpse', () => {
    for (const id of [VAMPIRE, VAMPIRE_LORD]) {
      const d = mon(id);
      expect(d.glyph.ch).toBe('V');
      expect(d.flags).toContain('shapeshifter');
      expect(d.attacks.some((a) => a.at === 'bite' && a.ad === 'drli')).toBe(true);
      expect(d.sound).toBe('vampire');
    }
  });

  test('makemon(): a vampire is born a bat or a fog cloud, a lord also a wolf, keeping its kind', () => {
    const forms: Record<string, Record<string, number>> = { [VAMPIRE]: {}, [VAMPIRE_LORD]: {} };
    const state = room(3);
    run(state, (ctx) => {
      for (const kind of [VAMPIRE, VAMPIRE_LORD]) {
        for (let i = 0; i < 120; i++) {
          const e = make(ctx, kind, 2 + (i % 20), 1 + (i % 2));
          expect(chamOf(ctx, e.id)).toBe(kind);
          expect(isVampshifter(ctx, e)).toBe(true);
          const f = forms[kind]!;
          f[e.def] = (f[e.def] ?? 0) + 1;
          ctx.remove(e.id);
        }
      }
    });
    // C's pickvampshape(): a vampire never becomes a wolf; every newborn takes another shape
    expect(Object.keys(forms[VAMPIRE]!).sort()).toEqual([FOG, BAT].sort());
    expect(Object.keys(forms[VAMPIRE_LORD]!).sort()).toEqual([FOG, BAT, WOLF].sort());
    expect(forms[VAMPIRE]![BAT]!).toBeGreaterThan(forms[VAMPIRE]![FOG]!);
  });

  test('a vampire whose shape is genocided is born as itself', () => {
    const state = room(4);
    run(state, (ctx) => {
      setGenocided(ctx, BAT);
      setGenocided(ctx, FOG);
      const e = make(ctx, VAMPIRE, 3, 2);
      expect(e.def).toBe(VAMPIRE);
      expect(chamOf(ctx, e.id)).toBe(VAMPIRE);
    });
  });

  test('pickvampshape(): an already shifted vampire returns to itself 1 time in 4', () => {
    const state = room(5);
    let back = 0;
    run(state, (ctx) => {
      const e = shifted(ctx, VAMPIRE, BAT, 3, 2);
      for (let i = 0; i < 400; i++) if (pickvampshape(ctx, e) === VAMPIRE) back++;
    });
    expect(back / 400).toBeGreaterThan(0.18);
    expect(back / 400).toBeLessThan(0.32);
  });

  test('a polymorph that makes a vampire makes a vampshifter', () => {
    const state = room(6);
    run(state, (ctx) => {
      const e = make(ctx, 'nh:jackal', 3, 2);
      expect(chamOf(ctx, e.id)).toBeNull();
      expect(newcham(ctx, e, mon(VAMPIRE))).toBe(true);
      expect(chamOf(ctx, e.id)).toBe(VAMPIRE);
    });
  });
});

describe('decide_to_shapeshift()', () => {
  test('a hurt vampire bat changes back 3 times in 4 ("turns into a vampire lord!")', () => {
    let changed = 0;
    let line = '';
    for (let seed = 1; seed <= 40; seed++) {
      const state = room(seed);
      const text = run(state, (ctx) => {
        const e = shifted(ctx, VAMPIRE_LORD, BAT, 13, 3);
        e.c.hp!.cur = 1;
        decideToShapeshift(ctx, e);
        if (e.def === VAMPIRE_LORD) {
          changed++;
          expect(chamOf(ctx, e.id)).toBe(VAMPIRE_LORD); // still a shapeshifter
        } else expect(e.def).toBe(BAT);
      });
      if (text.length) line = text[0]!;
    }
    expect(changed / 40).toBeGreaterThan(0.55);
    expect(changed / 40).toBeLessThan(0.95);
    expect(line).toBe('The vampire bat turns into a vampire lord!');
  });

  test('a healthy bat stays; a vampire in its own form shifts only unobserved', () => {
    const state = room(7);
    run(state, (ctx) => {
      const e = shifted(ctx, VAMPIRE, BAT, 13, 3);
      for (let i = 0; i < 50; i++) decideToShapeshift(ctx, e);
      expect(e.def).toBe(BAT);
      // in view, close by: never shifts
      expect(newcham(ctx, e, mon(VAMPIRE))).toBe(true);
      for (let i = 0; i < 100; i++) decideToShapeshift(ctx, e);
      expect(e.def).toBe(VAMPIRE);
      // out of her sight it does, 1 time in 6
      getPlayer(ctx.state).c.pos!.x = 23;
      e.c.pos!.x = 1;
      let n = 0;
      while (e.def === VAMPIRE && n++ < 100) decideToShapeshift(ctx, e);
      expect([BAT, FOG]).toContain(e.def);
    });
  });
});

describe('dying and stoning', () => {
  test('a killed vampire bat rises as the vampire lord, healed and no longer a shapeshifter', () => {
    const state = room(8);
    const text = run(state, (ctx) => {
      const e = shifted(ctx, VAMPIRE_LORD, BAT, 13, 3);
      e.c.hp!.cur = 0;
      monsterDied(ctx, e.id, true);
      const r = ent(ctx.state, e.id);
      expect(r?.c.monster).toBeDefined();
      expect(r!.def).toBe(VAMPIRE_LORD);
      expect(r!.c.hp!.cur).toBe(r!.c.hp!.max);
      expect(r!.c.hp!.max).toBeGreaterThanOrEqual(10);
      expect(chamOf(ctx, e.id)).toBeNull();
      // killed again in its own form, it dies
      monsterDied(ctx, e.id, true);
      expect(ent(ctx.state, e.id)).toBeUndefined();
    });
    expect(text).toContain(
      'The seemingly dead vampire bat suddenly transforms and rises as a vampire lord!',
    );
  });

  test('a killed fog cloud "reconstitutes"; a killed vampire dies at once', () => {
    const state = room(9);
    const text = run(state, (ctx) => {
      const fog = shifted(ctx, VAMPIRE, FOG, 13, 3);
      expect(vamprises(ctx, fog)).toBe(true);
      expect(fog.def).toBe(VAMPIRE);
      const v = shifted(ctx, VAMPIRE, BAT, 15, 3);
      expect(newcham(ctx, v, mon(VAMPIRE))).toBe(true);
      monsterDied(ctx, v.id, true);
      expect(ent(ctx.state, v.id)).toBeUndefined();
    });
    expect(text).toContain('The fog cloud suddenly reconstitutes and rises as a vampire!');
  });

  test('a stoned vampire bat reverts instead of becoming a statue', () => {
    const state = room(10);
    const text = run(state, (ctx) => {
      const e = shifted(ctx, VAMPIRE, BAT, 13, 3);
      minstapetrify(ctx, e, true);
      expect(ent(ctx.state, e.id)?.def).toBe(VAMPIRE);
      expect(Object.values(ctx.state.entities).some((o) => o?.def === 'nh:statue')).toBe(false);
    });
    expect(text).toEqual([
      'The lapidifying vampire bat drops to the floor!',
      'A vampire rises from the floor with renewed agility!',
    ]);
  });
});

describe('fog under doors', () => {
  const CORRIDOR = ['            ', ' ...+...@.. ', '            '];
  const DOOR = { x: 4, y: 1 };

  test('a vampire walks to her, turns into a fog cloud on the closed door and flows under it', () => {
    let passed = 0;
    let lines: string[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const state = room(seed, CORRIDOR);
      const level = getLevel(state);
      setTerrain(level, DOOR.x, DOOR.y, T.door_closed);
      let id = 0;
      run(state, (ctx) => {
        const e = make(ctx, VAMPIRE, 1, 1);
        if (e.def !== VAMPIRE) expect(newcham(ctx, e, mon(VAMPIRE))).toBe(true);
        id = e.id;
      });
      const seen: string[] = [];
      for (let t = 0; t < 12; t++) {
        seen.push(...texts(engine.step(state, { type: 'search' }).events));
        const e = ent(state, id);
        if (e?.c.pos && e.c.pos.x > DOOR.x) break;
      }
      const e = ent(state, id);
      if (e?.c.pos && e.c.pos.x > DOOR.x) {
        passed++;
        lines = seen;
        // (unseen behind the door, it turned into a fog cloud silently)
        expect(e.def).toBe(FOG);
        expect(chamOf({ state }, id)).toBe(VAMPIRE);
        // the door stays shut
        expect(level.palette[level.cells[cellIndex(level, DOOR.x, DOOR.y)]!]).toBe(T.door_closed);
      }
    }
    expect(passed).toBeGreaterThan(0);
    expect(lines).toContain('The fog cloud flows under the door.');
  });

  test('seen as it moves onto the door: "The vampire turns into a fog cloud!"', () => {
    const state = room(2, CORRIDOR);
    setTerrain(getLevel(state), DOOR.x, DOOR.y, T.door_closed);
    const text = run(state, (ctx) => {
      const e = shifted(ctx, VAMPIRE, BAT, 5, 1);
      expect(newcham(ctx, e, mon(VAMPIRE))).toBe(true);
      e.c.pos!.x = DOOR.x;
      fogUnderDoor(ctx, e, true);
      expect(e.def).toBe(FOG);
    });
    expect(text).toEqual(['The vampire turns into a fog cloud!']);
  });

  test('a plain vampire bat cannot; a vampshifter carrying a long sword cannot either', () => {
    const state = room(1, CORRIDOR);
    run(state, (ctx) => {
      const plain = make(ctx, 'nh:vampire_bat', 1, 1);
      expect(isVampshifter(ctx, plain)).toBe(false);
      const v = shifted(ctx, VAMPIRE, BAT, 2, 1);
      expect(stuffPreventsPassage(ctx, v)).toBe(false);
      mksobj(ctx, obj('nh:long_sword'), { carriedBy: v.id });
      expect(stuffPreventsPassage(ctx, v)).toBe(true);
    });
  });
});

describe('vampires in any form', () => {
  test('silver hurts a shifted vampire; an altar scares it; garlic is taboo to a pet one', () => {
    const state = room(11);
    run(state, (ctx) => {
      const v = shifted(ctx, VAMPIRE, BAT, 13, 3);
      const bat = make(ctx, 'nh:vampire_bat', 15, 3);
      expect(monHatesSilver(ctx, v)).toBe(true);
      expect(monHatesSilver(ctx, bat)).toBe(false);
      const level = getLevel(ctx.state);
      setTerrain(level, 14, 2, T.altar_neutral);
      expect(onscary(ctx, 14, 2, v)).toBe(true);
      expect(onscary(ctx, 14, 2, bat)).toBe(false);
      v.c.monster!.tame = 10;
      bat.c.monster!.tame = 10;
      const garlic = mksobj(ctx, obj('nh:clove_of_garlic'), {
        at: { level: level.id, x: 14, y: 3 },
      });
      const g = ent(ctx.state, garlic)!;
      expect(dogfood(ctx, v, g)).toBe(TABU);
      expect(dogfood(ctx, bat, g)).not.toBe(TABU);
    });
  });

  test('undead and vampshifters avoid a clove of garlic on the floor (NOGARLIC)', () => {
    const state = room(13);
    run(state, (ctx) => {
      const level = getLevel(ctx.state);
      const hp = getPlayer(ctx.state).c.pos!;
      const v = shifted(ctx, VAMPIRE, BAT, 5, 3);
      const z = make(ctx, 'nh:gnome_zombie', 9, 3);
      const j = make(ctx, 'nh:jackal', 5, 5);
      for (const m of [v, z, j]) {
        mksobj(ctx, obj('nh:clove_of_garlic'), {
          at: { level: level.id, x: m.c.pos!.x + 1, y: m.c.pos!.y },
        });
      }
      const rules = cellRules(level, defs);
      const has = (m: Entity): boolean =>
        mfndpos(ctx, level, rules, m.id, hp).some(
          (c) => c.x === m.c.pos!.x + 1 && c.y === m.c.pos!.y,
        );
      expect(has(v)).toBe(false);
      expect(has(z)).toBe(false);
      expect(has(j)).toBe(true);
    });
  });

  test('a vampire bite drains her level', () => {
    let drained = false;
    for (let seed = 1; seed <= 10 && !drained; seed++) {
      const state = room(seed);
      const hero = getPlayer(state);
      hero.c.experience!.level = 6;
      run(state, (ctx) => {
        const v = shifted(ctx, VAMPIRE, BAT, 13, 3);
        expect(newcham(ctx, v, mon(VAMPIRE))).toBe(true);
        for (let i = 0; i < 20 && hero.c.experience!.level === 6; i++) monsterAttack(ctx, v.id);
      });
      drained = hero.c.experience!.level < 6;
    }
    expect(drained).toBe(true);
  });

  test('#chat: a peaceful vampire only drinks potions; a hostile one wants her blood', () => {
    const state = room(12);
    const peaceful = run(state, (ctx) => {
      const v = shifted(ctx, VAMPIRE, BAT, 13, 3);
      expect(newcham(ctx, v, mon(VAMPIRE))).toBe(true);
      v.c.monster!.peaceful = true;
      domonnoise(ctx, v.id);
    });
    expect(peaceful).toEqual(['"I only drink... potions."']);
    const lines = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const st = room(seed);
      for (const l of run(st, (ctx) => {
        const v = shifted(ctx, VAMPIRE, BAT, 13, 3);
        expect(newcham(ctx, v, mon(VAMPIRE))).toBe(true);
        v.c.monster!.peaceful = false;
        domonnoise(ctx, v.id);
      }))
        lines.add(l);
    }
    expect([...lines].sort()).toEqual([
      '"I vant to suck your blood!"',
      '"I vill come after a woman without regret!"',
    ]);
  });
});

describe('the scripts and the grown-ups', () => {
  test('the Valley holds vampires among its undead', () => {
    let found = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const { state } = engine.newGame({ seed });
      run(state, (ctx) => ctx.goToLevel({ dungeon: GEHENNOM, dlevel: 1 }, 'random'));
      const vamps = Object.values(state.entities).filter(
        (e) =>
          e?.c.monster &&
          e.c.pos?.level === state.currentLevel &&
          (chamOf({ state }, e.id) !== null || e.def === VAMPIRE || e.def === VAMPIRE_LORD),
      );
      // three `V` spots (more vampires may come at random)
      expect(vamps.length).toBeGreaterThanOrEqual(3);
      found++;
    }
    expect(found).toBe(3);
  });

  test("minend-3's two vampires are back", () => {
    const v = (MINEND_3.contents ?? []).filter((c) => c.kind === 'monster' && c.class === 'V');
    expect(v).toHaveLength(2);
  });

  test('grownups[] names only rows, or kinds listed as absent', () => {
    for (const [l, b] of GROWNUPS)
      for (const n of [l, b])
        expect(defs.isMonster(`nh:${n}` as DefId) || GROWNUP_ABSENT.includes(n)).toBe(true);
    for (const n of GROWNUP_ABSENT) expect(defs.isMonster(`nh:${n}` as DefId)).toBe(false);
    expect(littleToBig(defs, 'nh:gnome' as DefId)).toBe('nh:gnome_lord');
    expect(littleToBig(defs, 'nh:gnome_lord' as DefId)).toBe('nh:gnome_king');
    expect(littleToBig(defs, 'nh:large_kobold' as DefId)).toBe('nh:kobold_lord');
    expect(littleToBig(defs, 'nh:dwarf_lord' as DefId)).toBe('nh:dwarf_king');
    expect(littleToBig(defs, 'nh:ogre_lord' as DefId)).toBe('nh:ogre_king');
    expect(littleToBig(defs, 'nh:elf_lord' as DefId)).toBe('nh:elvenking');
    expect(littleToBig(defs, VAMPIRE)).toBe(VAMPIRE_LORD);
  });

  test('a gnome lord that kills grows into a gnome king', () => {
    let grew = false;
    for (let seed = 1; seed <= 20 && !grew; seed++) {
      const state = room(seed);
      run(state, (ctx) => {
        const g = make(ctx, 'nh:gnome_lord', 13, 3);
        for (let i = 0; i < 40 && g.def === 'nh:gnome_lord'; i++) growUp(ctx, g.id, 20);
        grew = g.def === 'nh:gnome_king';
      });
    }
    expect(grew).toBe(true);
  });
});
