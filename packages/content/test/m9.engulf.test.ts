// m9 step 4: engulfing and digestion. Being swallowed (the engulfer on her square, the timer),
// expelled when the time is up, killing it from inside, total digestion and life saving, a wand
// of striking and a thrown dagger from inside, and a purple worm swallowing a pinned newt.
import { getPlayer, inventoryOf, type Entity } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { monsterAttack, heroAttack } from '../src/combat';
import { engulferOf, uswallow } from '../src/engulfstate';
import { ustuck } from '../src/hackmove';
import { mattackm } from '../src/mhitm';
import { mspecUsed } from '../src/mstate';
import { weffectsFrom } from '../src/zap';
import { throwObj } from '../src/dothrow';
import { defs } from './itemHelpers';
import { alive, heroHp, keys, mon, room } from './m9helpers';

type Room = ReturnType<typeof room>;

/** Attacks until the engulfer has her (its to-hit roll may miss): searches the attack rolls. */
function swallowed(s: Room, e: Entity): void {
  for (let i = 0; i < 40 && !uswallow(s.ctx); i++) monsterAttack(s.ctx, e.id);
  expect(uswallow(s.ctx)?.mon).toBe(e.id);
}

const posOf = (e: Entity) => ({ x: e.c.pos!.x, y: e.c.pos!.y });

describe('being engulfed (gulpmu)', () => {
  test('the fog cloud moves onto her square, the map is hidden and the box is shown', () => {
    const s = room(3);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    expect(keys(s.ctx)).toContain('engulf.engulfs');
    expect(posOf(fog)).toEqual(posOf(getPlayer(s.state)));
    expect(ustuck(s.ctx)).toBe(fog.id);
    // u.uswldtim: rnd(level + 5), at least 2 (then counted down by the first attack)
    expect(uswallow(s.ctx)!.tim).toBeGreaterThanOrEqual(1);
    expect(uswallow(s.ctx)!.tim).toBeLessThanOrEqual(8);
    // the view: blind (map hidden) and the `engulfed` status naming the engulfer
    expect(defs.perceptions.some((p) => p.blind?.(s.state, defs))).toBe(true);
    const st = defs.statuses.find((d) => d.field === 'engulfed');
    expect(st?.value(s.state, defs)).toBe('nh:fog_cloud');
  });

  test('inside, only the engulfer attacks; other monsters do nothing to her', () => {
    const s = room(3);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    const newt = mon(s.state, 'nh:jackal', 1, 2);
    const hp = heroHp(s.state);
    s.ctx.events.length = 0;
    for (let i = 0; i < 10; i++) monsterAttack(s.ctx, newt.id);
    expect(keys(s.ctx)).toEqual([]);
    expect(heroHp(s.state)).toBe(hp);
  });

  test('when the time runs out she is expelled next to it, and it waits before engulfing again', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = room(seed);
      const fog = mon(s.state, 'nh:fog_cloud');
      swallowed(s, fog);
      for (let i = 0; i < 20 && uswallow(s.ctx); i++) monsterAttack(s.ctx, fog.id);
      expect(keys(s.ctx)).toContain('engulf.get_expelled');
      expect(uswallow(s.ctx)).toBe(null);
      expect(ustuck(s.ctx)).toBe(null);
      expect(engulferOf(s.state)).toBe(null);
      const h = getPlayer(s.state).c.pos!;
      const p = fog.c.pos!;
      expect(p.x === h.x && p.y === h.y).toBe(false);
      expect(Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y))).toBe(1);
      expect(mspecUsed(s.ctx, fog.id)).toBeGreaterThan(0);
    }
  });

  test('the fog cloud hurts her each turn (she is laden with moisture)', () => {
    const s = room(3);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    expect(keys(s.ctx)).toContain('engulf.moisture');
  });

  test('a dust vortex blinds her ("You can\'t see in here!")', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = room(seed);
      const dv = mon(s.state, 'nh:dust_vortex');
      swallowed(s, dv);
      expect(keys(s.ctx)).toContain('engulf.cant_see');
      expect(getPlayer(s.state).c.props?.['blinded']).toBeDefined();
    }
  });
});

describe('fighting from inside', () => {
  test('every blow hits; killing it leaves her where she was, free', () => {
    const s = room(4);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    const at = posOf(getPlayer(s.state));
    getPlayer(s.state).c.attributes!.dex = 3; // a poor to-hit: inside she still never misses
    fog.c.hp = { cur: 1000, max: 1000 };
    s.ctx.events.length = 0;
    for (let i = 0; i < 10; i++) heroAttack(s.ctx, fog.id);
    expect(keys(s.ctx)).not.toContain('combat.you_miss');
    fog.c.hp = { cur: 1, max: 1000 };
    heroAttack(s.ctx, fog.id);
    expect(alive(s.state, fog.id)).toBe(false);
    expect(uswallow(s.ctx)).toBe(null);
    expect(ustuck(s.ctx)).toBe(null);
    expect(posOf(getPlayer(s.state))).toEqual(at);
  });

  test('walking in any direction attacks the engulfer', () => {
    const s = room(4);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    const at = posOf(getPlayer(s.state));
    const hp = fog.c.hp!.cur;
    s.step({ type: 'move', dir: 'w' });
    expect(posOf(getPlayer(s.state))).toEqual(at);
    expect(fog.c.hp!.cur).toBeLessThan(hp);
  });

  test('her own square offers to attack the engulfer', () => {
    const s = room(4);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    const fight = defs.actions.find((a) => a.id === 'nh:fight')!;
    const offers = fight.offer!(s.ctx as never, { kind: 'self' } as never);
    expect(offers.some((o) => o.labelKey === 'action.attack')).toBe(true);
  });

  test('a wand of striking always hits it from inside', () => {
    const s = room(5);
    const pw = mon(s.state, 'nh:purple_worm');
    swallowed(s, pw);
    const wand = s.state.entities[String(s.carry('nh:wand_of_striking'))]!;
    const hp = pw.c.hp!.cur;
    s.ctx.events.length = 0;
    weffectsFrom(s.ctx, { kind: 'wand', item: wand }, 'e');
    expect(keys(s.ctx)).toContain('zap.wand_hit');
    expect(pw.c.hp!.cur).toBeLessThan(hp);
  });

  test('a thrown dagger hits it and ends up inside it', () => {
    const s = room(5);
    const fog = mon(s.state, 'nh:fog_cloud');
    swallowed(s, fog);
    const id = s.carry('nh:dagger');
    throwObj(s.ctx, s.state.entities[String(id)]!, 'e');
    expect(keys(s.ctx)).not.toContain('throw.miss');
    const inFog = inventoryOf(s.state, fog.id).some((o) => o.id === id || o.def === 'nh:dagger');
    expect(inFog || !alive(s.state, fog.id)).toBe(true);
  });
});

describe('digestion', () => {
  test('the purple worm digests her when the time runs out', () => {
    const s = room(6);
    const pw = mon(s.state, 'nh:purple_worm');
    swallowed(s, pw);
    expect(keys(s.ctx)).toContain('engulf.swallows_whole');
    for (let i = 0; i < 60 && !s.state.gameOver; i++) monsterAttack(s.ctx, pw.id);
    expect(keys(s.ctx)).toContain('engulf.totally_digests');
    expect(s.state.gameOver).not.toBe(null);
  });

  test('an amulet of life saving brings her back and the worm regurgitates her', () => {
    const s = room(6);
    const am = s.state.entities[String(s.carry('nh:amulet_of_life_saving'))]!;
    am.c.item!.equipped = 'amulet';
    s.step({ type: 'wait' }); // worn properties
    const pw = mon(s.state, 'nh:purple_worm');
    swallowed(s, pw);
    for (let i = 0; i < 60 && uswallow(s.ctx); i++) monsterAttack(s.ctx, pw.id);
    expect(keys(s.ctx)).toContain('engulf.totally_digests');
    expect(keys(s.ctx)).toContain('lifesave.wait');
    expect(keys(s.ctx)).toContain('engulf.regurgitated');
    expect(s.state.gameOver).toBe(null);
    expect(uswallow(s.ctx)).toBe(null);
  });
});

describe('monsters swallowing monsters (gulpmm)', () => {
  test('a purple worm swallows a pinned newt whole: no corpse, the worm on its square', () => {
    let swallowedIt = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = room(seed);
      const pw = mon(s.state, 'nh:purple_worm', 5, 2);
      const newt = mon(s.state, 'nh:newt', 6, 2);
      newt.c.monster!.asleep = true;
      const at = posOf(newt);
      for (let i = 0; i < 10 && alive(s.state, newt.id); i++) mattackm(s.ctx, pw.id, newt.id);
      if (alive(s.state, newt.id)) continue;
      const k = keys(s.ctx);
      if (!k.includes('mhitm.engulfs')) continue; // killed by the bite
      swallowedIt++;
      expect(k).toContain('adtyp.burrrrp');
      expect(posOf(pw)).toEqual(at);
      const corpses = Object.values(s.state.entities).filter(
        (e) => e.def === 'nh:corpse' && e.c.item?.corpseOf === 'nh:newt',
      );
      expect(corpses).toEqual([]);
    }
    expect(swallowedIt).toBeGreaterThan(0);
  });
});
