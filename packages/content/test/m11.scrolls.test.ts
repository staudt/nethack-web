// m11 step 7: the nine new scrolls (read.c seffect_*(), do_genocide(), do_class_genocide(),
// recharge()), genocide's reach (makemon(), eggs, polymon(), polyman()) and scare monster
// (monmove.c onscary(), pickup.c pickup_object()). Outcomes over forced states or several seeds.
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  cellRules,
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
import { EGG, attachEggHatchTimeout, eggHatchAt } from '../src/eggstate';
import { endHow } from '../src/endstate';
import { makemon } from '../src/generation';
import { mksobj } from '../src/items';
import { isFleeing } from '../src/monflee';
import { mfndpos } from '../src/monmove';
import { polymon, rehumanize } from '../src/polyself';
import { P, setItimeout } from '../src/props';
import { pwOf, setPw, uspellOf } from '../src/uenergy';
import { heroFormId } from '../src/upoly';
import { isGenocided } from '../src/vanquished';
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

const ROOM = [
  '           ',
  ' ......... ',
  ' ......... ',
  ' ....@.... ',
  ' ......... ',
  ' ......... ',
  '           ',
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
function scroll(s: S, name: string, buc: Buc = 'uncursed'): EntityId {
  const id = s.carry(`nh:scroll_of_${name}`);
  s.state.entities[String(id)]!.c.item!.buc = buc;
  return id;
}
const read = (s: S, name: string, buc: Buc = 'uncursed'): string[] =>
  s.text(s.mod('nh:read', { item: scroll(s, name, buc) }));
function answer(s: S, value: Json): string[] {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return s.text(s.step({ type: 'answer', promptId: p.id, value }));
}
/** An awake, unmoving monster at (x, y). */
function foe(s: S, def: string, x: number, y: number, hp = 200, peaceful = false): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false, peaceful });
  const e = ent(s, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  return id;
}
const monsOf = (s: S, def: string): Entity[] =>
  Object.values(s.state.entities).filter((e): e is Entity => !!e?.c.monster && e.def === def);
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('genocide', () => {
  test('uncursed: the named species is wiped out here and can no longer be made', () => {
    const s = room();
    const j = foe(s, 'nh:jackal', 2, 1);
    const first = read(s, 'genocide');
    expect(first).toContain('You have found a scroll of genocide!');
    // (the test renderer has no |plural: "Wiped out all jackals." in the game)
    expect(s.state.pendingPrompt?.prompt.kind).toBe('text');
    expect(answer(s, 'jackal').some((l) => l.startsWith('Wiped out all'))).toBe(true);
    expect(ent(s, j)).toBeUndefined();
    expect(isGenocided(s.state, 'nh:jackal')).toBe(true);
    let made: EntityId | null = 0;
    run(s, (ctx) => {
      made = makemon(ctx, defs.monster('nh:jackal'), { x: 1, y: 1 }, { adjacentOk: true });
    });
    expect(made).toBeNull();
    expect(s.state.discovered).toContain('nh:scroll_of_genocide');
  });

  test('five wrong answers are enough; "none" declines; nothing is genocided', () => {
    const s = room();
    read(s, 'genocide');
    for (let i = 0; i < 4; i++) {
      expect(answer(s, 'xyzzy')).toContain('Such creatures do not exist in this world.');
      expect(s.state.pendingPrompt?.prompt.key).toBe('genocide.prompt_again');
    }
    expect(answer(s, 'xyzzy')).toContain("That's enough tries!");
    expect(s.state.pendingPrompt).toBeNull();
    read(s, 'genocide');
    answer(s, 'none');
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.state.modData['nh']).not.toHaveProperty('genocided');
  });

  test('a species that cannot be genocided: "No, mortal!"', () => {
    const s = room();
    read(s, 'genocide');
    const t = answer(s, 'Oracle');
    expect(t).toContain('"No, mortal!  That will not be done."');
    expect(isGenocided(s.state, 'nh:oracle')).toBe(false);
  });

  test('blessed: a whole class by its symbol', () => {
    const s = room();
    read(s, 'genocide', 'blessed');
    expect(s.state.pendingPrompt?.prompt.key).toBe('genocide.class_prompt');
    const t = answer(s, 'd');
    expect(t.filter((l) => l.startsWith('Wiped out all')).length).toBeGreaterThan(2);
    for (const id of ['nh:jackal', 'nh:coyote', 'nh:little_dog'])
      expect(isGenocided(s.state, id as DefId)).toBe(true);
  });

  test('cursed: a reverse genocide sends them in around her', () => {
    const s = room();
    read(s, 'genocide', 'cursed');
    const t = answer(s, 'newt');
    expect(t.some((l) => l.startsWith('Sent in'))).toBe(true);
    expect(monsOf(s, 'nh:newt').length).toBeGreaterThanOrEqual(1);
    expect(isGenocided(s.state, 'nh:newt')).toBe(false);
  });

  test('genociding her own race kills her ("killed by a scroll of genocide")', () => {
    const s = room();
    read(s, 'genocide');
    answer(s, 'human');
    expect(s.state.gameOver?.killer).toBe('@killer.scroll_of_genocide');
    expect(endHow(s.state)).toBe('genocided');
  });

  test('confused: genocidal confusion, without a prompt', () => {
    const s = room();
    setItimeout(s.state, hero(s), P.CONFUSION, 50);
    read(s, 'genocide');
    expect(s.state.gameOver?.killer).toBe('@killer.genocidal_confusion');
  });

  test('polymorphed, she feels dead inside and dies on returning to her own form', () => {
    const s = room();
    run(s, (ctx) => polymon(ctx, 'nh:gnome' as DefId, false));
    expect(heroFormId(s.state)).toBe('nh:gnome');
    read(s, 'genocide');
    expect(answer(s, 'human')).toContain('You feel dead inside.');
    expect(s.state.gameOver).toBeNull();
    run(s, (ctx) => rehumanize(ctx));
    expect(s.state.gameOver?.killer).toBe('@killer.scroll_of_genocide');
  });

  test('genocided forms: polymorph fails, eggs stop hatching', () => {
    const s = room();
    let egg = 0;
    run(s, (ctx) => {
      egg = mksobj(ctx, defs.object(EGG), { init: false, carriedBy: s.state.playerId });
      ent(s, egg)!.c.item!.corpseOf = 'nh:cockatrice' as DefId;
      attachEggHatchTimeout(ctx, egg, 50);
    });
    expect(eggHatchAt(s.state, egg)).not.toBeNull();
    read(s, 'genocide');
    answer(s, 'cockatrice');
    expect(eggHatchAt(s.state, egg)).toBeNull();
    const t = run(s, (ctx) => polymon(ctx, 'nh:cockatrice' as DefId, false));
    expect(t).toContain('You feel rather cockatrice-ish.');
    expect(heroFormId(s.state)).toBeNull();
  });
});

describe('scare monster', () => {
  test('a hostile monster never steps onto the scroll, nor attacks her standing on it', () => {
    const s = room(3); // a seed where the jackal is still fleeing at the end
    s.floor('nh:scroll_of_scare_monster');
    const j = foe(s, 'nh:jackal', 4, 3);
    ent(s, j)!.c.actor!.speed = 12;
    const level = getLevel(s.state);
    const cands = mfndpos(s.ctx as unknown as Ctx, level, cellRules(level, defs), j, s.here);
    expect(cands.some((c) => c.x === s.here.x && c.y === s.here.y)).toBe(false);
    expect(cands.length).toBeGreaterThan(0);
    const hp = hero(s).c.hp!.cur;
    for (let i = 0; i < 30; i++) s.step({ type: 'wait' });
    expect(hero(s).c.hp!.cur).toBeGreaterThanOrEqual(hp);
    expect(isFleeing(s.ctx as unknown as Ctx, j)).toBe(true);
  });

  test('picked up once it is marked; the second time it turns to dust; cursed at once', () => {
    const s = room();
    const id = s.floor('nh:scroll_of_scare_monster');
    s.mod('nh:pickup');
    expect(ent(s, id)?.c.item?.spe).toBe(1);
    s.mod('nh:drop', { item: id });
    const t = s.text(s.mod('nh:pickup'));
    expect(t).toContain('The scroll turns to dust as you pick it up.');
    expect(ent(s, id)).toBeUndefined();
    const c = s.floor('nh:scroll_of_scare_monster');
    s.state.entities[String(c)]!.c.item!.buc = 'cursed';
    expect(s.text(s.mod('nh:pickup'))).toContain('The scroll turns to dust as you pick it up.');
    const b = s.floor('nh:scroll_of_scare_monster');
    s.state.entities[String(b)]!.c.item!.buc = 'blessed';
    s.mod('nh:pickup');
    expect(ent(s, b)?.c.item?.buc).toBe('uncursed');
    expect(ent(s, b)?.c.item?.spe).toBe(0);
  });

  test('reading it scares what she sees; confused, it wakes them instead', () => {
    let fled = 0;
    for (const seed of seeds(5)) {
      const s = room(seed);
      const j = foe(s, 'nh:jackal', 2, 2);
      const t = read(s, 'scare_monster');
      expect(t).toContain('You hear maniacal laughter close by.');
      if (isFleeing(s.ctx as unknown as Ctx, j)) fled++;
    }
    expect(fled).toBeGreaterThan(0);
    const s = room();
    const j = foe(s, 'nh:jackal', 2, 2);
    ent(s, j)!.c.monster!.asleep = true;
    expect(read(s, 'scare_monster', 'cursed')).toContain('You hear sad wailing close by.');
    expect(ent(s, j)?.c.monster?.asleep).toBe(false);
  });
});

describe('the other scrolls', () => {
  test('create monster: one more monster; confused, acid blobs', () => {
    const s = room(3); // a seed whose random monster comes alone (no group)
    const before = Object.values(s.state.entities).filter((e) => e?.c.monster).length;
    read(s, 'create_monster', 'blessed');
    expect(Object.values(s.state.entities).filter((e) => e?.c.monster).length).toBe(before + 1);
    const c = room();
    setItimeout(c.state, hero(c), P.CONFUSION, 50);
    read(c, 'create_monster');
    expect(monsOf(c, 'nh:acid_blob').length).toBeGreaterThanOrEqual(10);
  });

  test('taming: the neighbour (no magic resistance) is tamed; cursed angers a peaceful', () => {
    const s = room();
    const n = foe(s, 'nh:newt', 6, 3);
    const t = read(s, 'taming');
    expect(t).toContain('The neighborhood is friendlier.');
    expect(ent(s, n)?.c.monster?.tame).toBeGreaterThan(0);
    expect(s.state.discovered).toContain('nh:scroll_of_taming');
    const c = room();
    const p = foe(c, 'nh:newt', 6, 3, 200, true);
    expect(read(c, 'taming', 'cursed')).toContain('The neighborhood is unfriendlier.');
    expect(ent(c, p)?.c.monster?.peaceful).toBe(false);
    expect(read(room(), 'taming')).toContain('Nothing interesting happens.');
  });

  test('confuse monster: 4 or 5 charges; cursed, she is confused', () => {
    const s = room();
    expect(read(s, 'confuse_monster')).toContain('Your hands begin to glow red.');
    expect([4, 5]).toContain(uspellOf(s.state).umconf);
    const c = room();
    expect(read(c, 'confuse_monster', 'cursed')).toContain('You feel confused.');
    expect(uspellOf(c.state).umconf).toBe(0);
  });

  test('destroy armor: cursed scroll, uncursed armor crumbles; confused toggles erodeproofing', () => {
    const s = room();
    const shield = inventoryOf(s.state, s.state.playerId).find(
      (o) => o.c.item?.equipped === 'shield',
    )!;
    expect(read(s, 'destroy_armor', 'cursed')).toContain('Your shield crumbles away!');
    expect(ent(s, shield.id)).toBeUndefined();
    const c = room();
    const sh = inventoryOf(c.state, c.state.playerId).find((o) => o.c.item?.equipped === 'shield')!;
    setItimeout(c.state, hero(c), P.CONFUSION, 50);
    read(c, 'destroy_armor', 'cursed');
    expect(ent(c, sh.id)?.c.item?.erodeproof).toBe(true);
  });

  test('amnesia: always learned, with the Maud line', () => {
    const s = room();
    const t = read(s, 'amnesia');
    expect(t.some((l) => l.includes('Maud'))).toBe(true);
    expect(s.state.discovered).toContain('nh:scroll_of_amnesia');
  });

  test('fire: the explosion at her; confused, burnt hands; blessed, where she chooses', () => {
    const s = room();
    const hp = hero(s).c.hp!.cur;
    const t = read(s, 'fire');
    expect(t).toContain('The scroll erupts in a tower of flame!');
    expect(hero(s).c.hp!.cur).toBeLessThanOrEqual(hp);
    const c = room();
    setItimeout(c.state, hero(c), P.CONFUSION, 50);
    const chp = hero(c).c.hp!.cur;
    expect(read(c, 'fire')).toContain('The scroll catches fire and you burn your hands.');
    expect(hero(c).c.hp!.cur).toBe(chp - 1);
    const b = room();
    const n = foe(b, 'nh:newt', 7, 3, 1);
    read(b, 'fire', 'blessed');
    expect(b.state.pendingPrompt?.prompt.kind).toBe('position');
    answer(b, { x: 7, y: 3 });
    expect(ent(b, n)).toBeUndefined();
  });

  test('charging: a wand gains charges; confused, energy is restored', () => {
    const s = room();
    const w = s.carry('nh:wand_of_striking');
    s.state.entities[String(w)]!.c.item!.spe = 0;
    read(s, 'charging');
    expect(s.state.pendingPrompt?.prompt.key).toBe('scroll.charging.what');
    answer(s, w);
    expect(ent(s, w)?.c.item?.spe).toBeGreaterThan(0);
    expect(ent(s, w)?.c.item?.recharged).toBe(1);
    const c = room();
    setPw(c.ctx, { uen: 0, uenmax: 30 });
    setItimeout(c.state, hero(c), P.CONFUSION, 50);
    expect(read(c, 'charging')).toContain('You feel charged up!');
    expect(pwOf(c.state).uen).toBe(30);
  });
});
