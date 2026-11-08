// m7f-c step 3: stoning leaves statues everywhere. A purple worm eats a corpse dropped inside it at
// once (a cockatrice corpse turns it to stone, a wraith corpse makes it grow), a unique monster's
// statue is historic, a dying monster's square forgets its `I`, and Look tells a statue of a gnome
// from a live gnome.
// ref: src/do.c engulfer_digests_food(), dropz(); src/mon.c monstone(), mondead();
// src/makemon.c grow_up(); src/pager.c lookat()
import { createQuery, getPlayer, inventoryOf, itemsAt, type DefId, type Entity } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { monsterAttack } from '../src/combat';
import { uswallow } from '../src/engulfstate';
import { mapInvisible, markedUnseen } from '../src/invis';
import { mkcorpse } from '../src/items';
import { monsterDied } from '../src/mondeath';
import { statueAppearanceId, isHistoric } from '../src/statuestate';
import { mkcorpstat } from '../src/statue';
import { monstone } from '../src/stoning';
import { defs, render } from './itemHelpers';
import { alive, mon, room } from './m9helpers';

type Room = ReturnType<typeof room>;

/** Attacks until the engulfer has her (its to-hit roll may miss). */
function swallowed(s: Room, e: Entity): void {
  for (let i = 0; i < 40 && !uswallow(s.ctx); i++) monsterAttack(s.ctx, e.id);
  expect(uswallow(s.ctx)?.mon).toBe(e.id);
}

const corpse = (s: Room, of: string) =>
  mkcorpse(s.ctx, defs.monster(of as DefId), { carriedBy: s.state.playerId });

function gloves(s: Room): void {
  const g = s.carry('nh:leather_gloves');
  s.state.entities[String(g)]!.c.item!.equipped = 'gloves';
}

const statuesAt = (s: Room, x: number, y: number): Entity[] =>
  itemsAt(defs, s.state, 'dlvl1', x, y).filter((o) => o.def === 'nh:statue');

describe('dropping food inside an engulfer', () => {
  test('a cockatrice corpse is digested at once and turns the purple worm to stone', () => {
    const s = room(5);
    gloves(s);
    const pw = mon(s.state, 'nh:purple_worm');
    swallowed(s, pw);
    const c = corpse(s, 'nh:cockatrice');
    const exp0 = getPlayer(s.state).c.experience?.points ?? 0;
    const t = s.text(s.mod('nh:drop', { item: c }));
    expect(t).toContain("You drop a cockatrice corpse into the purple worm's stomach.");
    expect(t).toContain('The cockatrice corpse is instantly digested!');
    expect(t).toContain('The purple worm turns to stone.');
    expect(t).toContain('You jump through an opening in the new statue of a purple worm.');
    expect(alive(s.state, pw.id)).toBe(false);
    expect(s.state.entities[String(c)]).toBeUndefined();
    expect(uswallow(s.ctx)).toBeNull();
    const h = getPlayer(s.state).c.pos!;
    const st = statuesAt(s, h.x, h.y);
    expect(st.map((o) => o.c.item?.corpseOf)).toEqual(['nh:purple_worm']);
    expect(getPlayer(s.state).c.experience?.points ?? 0).toBeGreaterThan(exp0);
  });

  test('other corpses are just eaten; a fog cloud keeps what she drops', () => {
    const s = room(5);
    const pw = mon(s.state, 'nh:purple_worm');
    swallowed(s, pw);
    const c = corpse(s, 'nh:jackal');
    const t = s.text(s.mod('nh:drop', { item: c }));
    expect(t).toContain('The jackal corpse is instantly digested!');
    expect(s.state.entities[String(c)]).toBeUndefined();
    expect(alive(s.state, pw.id)).toBe(true);
    // a dagger is not food: it ends up in the worm
    const d = s.carry('nh:dagger');
    s.mod('nh:drop', { item: d });
    expect(inventoryOf(s.state, pw.id).map((o) => o.id)).toContain(d);

    const f = room(3);
    const fog = mon(f.state, 'nh:fog_cloud');
    swallowed(f, fog);
    const c2 = corpse(f, 'nh:jackal');
    const t2 = f.text(f.mod('nh:drop', { item: c2 }));
    expect(t2.join(' ')).not.toContain('digested');
    expect(inventoryOf(f.state, fog.id).map((o) => o.id)).toContain(c2);
  });

  test('a wraith corpse makes the worm go up a level', () => {
    const s = room(5);
    const pw = mon(s.state, 'nh:purple_worm');
    swallowed(s, pw);
    pw.c.hp = { cur: 50, max: 50 };
    const lvl = pw.c.monster!.level;
    const max = pw.c.hp!.max;
    const t = s.text(s.mod('nh:drop', { item: corpse(s, 'nh:wraith') }));
    expect(t).toContain('The wraith corpse is instantly digested!');
    expect(pw.c.monster!.level).toBe(lvl + 1);
    expect(pw.c.hp!.max).toBeGreaterThan(max);
    expect(pw.c.hp!.max).toBeLessThanOrEqual(max + 8);
  });
});

describe('statues of stoned monsters', () => {
  test("a unique monster's statue is historic; another's is not", () => {
    const s = room();
    const o = mon(s.state, 'nh:oracle', 4, 2);
    monstone(s.ctx, o);
    const st = statuesAt(s, 4, 2)[0]!;
    expect(st.c.item?.corpseOf).toBe('nh:oracle');
    expect(isHistoric(s.state, st.id)).toBe(true);
    const k = mon(s.state, 'nh:kobold', 5, 2);
    monstone(s.ctx, k);
    expect(isHistoric(s.state, statuesAt(s, 5, 2)[0]!.id)).toBe(false);
  });

  test('a monster dying or turning to stone on an `I` clears it', () => {
    const s = room();
    const k = mon(s.state, 'nh:kobold', 4, 2);
    mapInvisible(s.ctx, 4, 2);
    monstone(s.ctx, k);
    expect(markedUnseen(s.ctx, 4, 2)).toBe(false);
    const j = mon(s.state, 'nh:jackal', 5, 3);
    mapInvisible(s.ctx, 5, 3);
    monsterDied(s.ctx, j.id, true);
    expect(markedUnseen(s.ctx, 5, 3)).toBe(false);
  });
});

describe('Look', () => {
  test('a statue of a gnome next to a live gnome', () => {
    const s = room();
    mkcorpstat(s.ctx, 'nh:gnome' as DefId, { level: 'dlvl1', x: 4, y: 2 });
    mon(s.state, 'nh:gnome', 5, 2);
    s.step({ type: 'wait' });
    const q = createQuery(defs, s.state);
    const statue = q.describe({ x: 4, y: 2 });
    expect(statue.entities).toEqual([]);
    expect(statue.objects.map((o) => o.def)).toEqual([statueAppearanceId('nh:gnome' as DefId)]);
    expect(render(statue.objects[0]!.name)).toBe('statue of a gnome');
    const live = q.describe({ x: 5, y: 2 });
    expect(live.entities.map((e) => e.def)).toEqual(['nh:gnome']);
    expect(live.objects).toEqual([]);
  });
});
