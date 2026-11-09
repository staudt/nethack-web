// m11 step 8: detection (detect.c gold_detect(), food_detect(), object_detect(), trap_detect(),
// do_mapping(), do_vicinity_map()) and the remaining spellbooks (spell.c spelleffects(),
// throwspell(); zap.c bhitm()/zapyourself() SPE_* cases; dog.c make_familiar()). Outcomes over
// forced states: pinned monsters, forced skills and buc.
import {
  createEngine,
  getLevel,
  getPlayer,
  type Buc,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Json,
  type Mod,
} from '@nh/core';
import { vanillaMod } from '@nh/content';
import { describe, expect, test } from 'vitest';
import { CAST_BOOKS, spelleffects } from '../src/cast';
import { nhData } from '../src/items';
import { isFleeing } from '../src/monflee';
import { P, setItimeout } from '../src/props';
import { P_SKILLED, P_UNSKILLED } from '../src/skills';
import { SPELL_INFO } from '../src/spellcalc';
import { T } from '../src/terrain';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

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

// a 21-wide room with a wall down the middle, so the right half is out of sight
const ROOM = [
  '                     ',
  ' ......... ......... ',
  ' ......... ......... ',
  ' ....@.... ......... ',
  ' ......... ......... ',
  ' ......... ......... ',
  '                     ',
];
type S = ReturnType<typeof levelSetup>;

function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
const hero = (s: S): Entity => getPlayer(s.state);
function item(s: S, def: string, buc: Buc = 'uncursed'): EntityId {
  const id = s.carry(def);
  s.state.entities[String(id)]!.c.item!.buc = buc;
  return id;
}
const read = (s: S, name: string, buc: Buc = 'uncursed'): string[] =>
  s.text(s.mod('nh:read', { item: item(s, `nh:scroll_of_${name}`, buc) }));
const quaff = (s: S, name: string, buc: Buc = 'uncursed'): string[] =>
  s.text(s.mod('nh:quaff', { item: item(s, `nh:potion_of_${name}`, buc) }));
function answer(s: S, value: Json): string[] {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return s.text(s.step({ type: 'answer', promptId: p.id, value }));
}
/** An awake, unmoving monster at (x, y). */
function foe(s: S, def: string, x: number, y: number, hp = 200): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  return id;
}
/** Puts an object on the floor at (x, y). */
const drop = (s: S, def: string, x: number, y: number, quantity = 1): EntityId =>
  s.give(def, { at: { level: 'dlvl1', x, y }, quantity });
const remembered = (s: S, x: number, y: number): DefId | undefined =>
  s.state.objectMemory['dlvl1']?.[String(y * getLevel(s.state).width + x)];
const skill = (s: S, school: string, level: number): void => {
  nhData(s.ctx).skills![school] = level;
};
/** Casts the spell with #wizcast's `force` (no checks, no cost). */
const cast = (s: S, book: string): string[] =>
  run(s, (ctx) => void spelleffects(ctx, `nh:spellbook_of_${book}`, true));

describe('the new rows', () => {
  test('a potion, three scrolls and 29 books; every book has its school and direction', () => {
    for (const id of [
      'nh:potion_of_object_detection',
      'nh:scroll_of_gold_detection',
      'nh:scroll_of_food_detection',
      'nh:scroll_of_magic_mapping',
      'nh:spellbook_of_fireball',
      'nh:spellbook_of_create_familiar',
    ])
      expect(defs.isObject(id as DefId)).toBe(true);
    expect(defs.isObject('nh:spellbook_of_chain_lightning' as DefId)).toBe(false);
    const books = defs.objects.filter(
      (o) => o.class === 'spellbook' && o.id !== 'nh:spellbook_of_blank_paper',
    );
    expect(books).toHaveLength(40);
    for (const b of books) {
      expect(SPELL_INFO[b.id]).toBeDefined();
      expect(CAST_BOOKS).toContain(b.id);
    }
  });
});

describe('gold detection', () => {
  test('gold out of sight is remembered: "You feel very greedy, and sense gold!"', () => {
    const s = room();
    drop(s, 'nh:gold_piece', 15, 2, 20);
    expect(remembered(s, 15, 2)).toBeUndefined();
    expect(read(s, 'gold_detection')).toContain('You feel very greedy, and sense gold!');
    expect(remembered(s, 15, 2)).toBe('nh:gold_piece');
    expect(s.state.discovered).toContain('nh:scroll_of_gold_detection');
  });

  test('none: a strange feeling uses the scroll up unidentified', () => {
    const s = room();
    // (a beginner gets the plain strange feeling, not "You feel materially poor.")
    const t = read(s, 'gold_detection');
    expect(t).toContain('You have a strange feeling for a moment, then it passes.');
    expect(s.state.discovered).not.toContain('nh:scroll_of_gold_detection');
  });

  test('a monster carrying gold is shown as a pile of gold at its spot', () => {
    const s = room();
    const m = foe(s, 'nh:jackal', 16, 4);
    s.give('nh:gold_piece', { carriedBy: m, quantity: 5 });
    expect(read(s, 'gold_detection')).toContain('You feel very greedy, and sense gold!');
    expect(remembered(s, 16, 4)).toBe('nh:gold_piece');
  });

  test('confused: trap detection, the trap out of sight is seen; cursed shows gold there', () => {
    const s = room();
    const level = getLevel(s.state);
    level.traps.push({ def: 'nh:trap_door' as DefId, x: 14, y: 3, seen: false });
    setItimeout(s.state, hero(s), P.CONFUSION, 20);
    expect(read(s, 'gold_detection')).toContain('You feel entrapped.');
    expect(level.traps[0]!.seen).toBe(true);
    const c = room();
    const l2 = getLevel(c.state);
    l2.traps.push({ def: 'nh:trap_door' as DefId, x: 14, y: 3, seen: false });
    expect(read(c, 'gold_detection', 'cursed')).toContain('You feel very greedy.');
    expect(l2.traps[0]!.seen).toBe(false);
    expect(remembered(c, 14, 3)).toBe('nh:gold_piece');
  });
});

describe('food detection', () => {
  test('food out of sight: "Your nose tingles and you smell food."', () => {
    const s = room();
    drop(s, 'nh:food_ration', 12, 1);
    expect(read(s, 'food_detection')).toContain('Your nose tingles and you smell food.');
    expect(remembered(s, 12, 1)).toBe('nh:food_ration');
  });

  test('blessed: her nose starts to tingle and she can tell edible food', () => {
    const s = room();
    drop(s, 'nh:food_ration', 12, 1);
    expect(read(s, 'food_detection', 'blessed')).toContain(
      'Your nose starts to tingle and you smell food.',
    );
    expect(nhData(s.ctx).uedibility).toBe(true);
  });

  test('none: "Your nose twitches." (a strange feeling) and the scroll is gone', () => {
    const s = room();
    const t = read(s, 'food_detection');
    expect(t.some((l) => l === 'Your nose twitches.' || l.startsWith('You have a strange'))).toBe(
      true,
    );
  });
});

describe('object detection', () => {
  test('the potion: every object out of sight is remembered', () => {
    const s = room();
    drop(s, 'nh:dagger', 13, 2);
    drop(s, 'nh:food_ration', 17, 5);
    expect(quaff(s, 'object_detection')).toContain('You detect the presence of objects.');
    expect(remembered(s, 13, 2)).toBe('nh:dagger');
    expect(remembered(s, 17, 5)).toBe('nh:food_ration');
    expect(s.state.discovered).toContain('nh:potion_of_object_detection');
  });

  test('nothing on the level: a strange feeling', () => {
    const s = room();
    // (a beginner gets the plain strange feeling, not "You feel a lack of something.")
    expect(quaff(s, 'object_detection')).toEqual([
      'You have a strange feeling for a moment, then it passes.',
    ]);
    expect(s.state.discovered).not.toContain('nh:potion_of_object_detection');
  });
});

describe('magic mapping', () => {
  test('the whole level is remembered; blessed finds the secret doors', () => {
    const s = room();
    const level = getLevel(s.state);
    const i = level.palette.length;
    level.palette.push(T.sdoor_v);
    level.cells[3 * level.width + 10] = i; // the wall gap becomes a secret door
    const t = read(s, 'magic_mapping', 'blessed');
    expect(t).toContain('A map coalesces in your mind!');
    const mem = s.state.memory['dlvl1']!;
    expect(mem[2 * level.width + 18]).toBe(1); // a floor cell beyond the wall
    expect(level.palette[level.cells[3 * level.width + 10]!]).toBe(T.door_closed);
    expect(s.state.discovered).toContain('nh:scroll_of_magic_mapping');
  });

  test('cursed: "Unfortunately, you can\'t grasp the details."', () => {
    const s = room();
    expect(read(s, 'magic_mapping', 'cursed')).toContain(
      "Unfortunately, you can't grasp the details.",
    );
  });
});

describe('the attack spells', () => {
  test('fireball at Skilled: the chosen spot explodes, burning the monster there', () => {
    const s = room();
    skill(s, 'attack_spell', P_SKILLED);
    const m = foe(s, 'nh:jackal', 7, 3, 300);
    cast(s, 'fireball');
    const p = s.state.pendingPrompt?.prompt;
    expect([p?.kind, p?.key]).toEqual(['position', 'cast.where']);
    const t = answer(s, { x: 7, y: 3 });
    expect(t.some((l) => l.includes('caught in the fireball'))).toBe(true);
    expect(ent(s, m)!.c.hp!.cur).toBeLessThan(300);
  });

  test('fireball below Skilled is a ray in a direction', () => {
    const s = room();
    skill(s, 'attack_spell', P_UNSKILLED);
    cast(s, 'fireball');
    expect(s.state.pendingPrompt?.prompt.kind).toBe('direction');
  });

  test('cone of cold at Skilled: too far away, the spell dissipates', () => {
    const s = levelSetup(['.'.repeat(30), '@' + '.'.repeat(29), '.'.repeat(30)]);
    skill(s, 'attack_spell', P_SKILLED);
    cast(s, 'cone_of_cold');
    expect(answer(s, { x: 20, y: 1 })).toContain('The spell dissipates over the distance!');
  });

  test('drain life: the monster loses a level (or dies at level 0)', () => {
    const s = room();
    const m = foe(s, 'nh:gnome_lord', 6, 3, 30);
    ent(s, m)!.c.monster!.level = 3;
    cast(s, 'drain_life');
    expect(answer(s, 'e')).toContain('The gnome lord suddenly seems weaker!');
    const after = ent(s, m)!;
    expect(after.c.monster!.level).toBe(2);
    expect(after.c.hp!.max).toBeLessThan(30);
    // a level 0 monster dies
    const z = foe(s, 'nh:newt', 5, 4, 30);
    ent(s, z)!.c.monster!.level = 0;
    cast(s, 'drain_life');
    answer(s, 's');
    expect(ent(s, z)?.c.monster).toBeUndefined();
  });

  test('magic missile: a ray that hurts', () => {
    const s = room();
    const m = foe(s, 'nh:jackal', 7, 3, 300);
    cast(s, 'magic_missile');
    answer(s, 'e');
    expect(ent(s, m)!.c.hp!.cur).toBeLessThan(300);
  });
});

describe('the other spells', () => {
  test('create familiar: a tame monster next to her', () => {
    for (const seed of [1, 2, 3]) {
      const s = room(seed);
      const before = Object.values(s.state.entities).filter((e) => e?.c.monster).length;
      cast(s, 'create_familiar');
      const mons = Object.values(s.state.entities).filter(
        (e): e is Entity => !!e?.c.monster && e.id !== s.state.playerId,
      );
      expect(mons.length).toBe(before + 1);
      const pet = mons.find((e) => (e.c.monster!.tame ?? 0) > 0);
      expect(pet).toBeDefined();
    }
  });

  test('cause fear: a monster in sight flees, and nothing is heard', () => {
    let fled = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = room(seed);
      const m = foe(s, 'nh:jackal', 6, 3);
      const t = cast(s, 'cause_fear');
      expect(t.some((l) => l.includes('laughter'))).toBe(false);
      if (isFleeing(s.ctx as unknown as Ctx, m)) fled++;
    }
    expect(fled).toBeGreaterThan(0);
  });

  test('cure sickness: "You are not ill." when well', () => {
    const s = room();
    expect(cast(s, 'cure_sickness')).toEqual(['You are not ill.']);
  });

  test('detect treasure: objects out of sight are remembered', () => {
    const s = room();
    drop(s, 'nh:dagger', 13, 2);
    expect(cast(s, 'detect_treasure')).toContain('You detect the presence of objects.');
    expect(remembered(s, 13, 2)).toBe('nh:dagger');
  });

  test('clairvoyance: the area around her is mapped, a hidden monster is an `I`', () => {
    const s = room();
    foe(s, 'nh:jackal', 13, 3);
    drop(s, 'nh:dagger', 12, 2);
    cast(s, 'clairvoyance');
    const level = getLevel(s.state);
    expect(s.state.memory['dlvl1']![2 * level.width + 13]).toBe(1);
    expect(remembered(s, 12, 2)).toBe('nh:dagger');
    expect(s.state.monsterMemory['dlvl1']?.[String(3 * level.width + 13)]).toBeDefined();
  });

  test('haste self: very fast, but no intrinsic speed', () => {
    const s = room();
    expect(cast(s, 'haste_self')).toContain('You are suddenly moving much faster.');
    expect(hero(s).c.props?.[P.FAST]?.intrinsic ?? false).toBe(false);
  });

  test('knock pushes a small monster back', () => {
    const s = room();
    const m = foe(s, 'nh:newt', 6, 3);
    cast(s, 'knock');
    const t = answer(s, 'e');
    expect(t).toContain('The newt is knocked back!');
    expect(ent(s, m)!.c.pos!.x).toBeGreaterThan(6);
  });
});
