import { vanillaMod } from '@nh/content';
import { sortedIds, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { runScenario } from '../src/index';

const BIG = [
  '--------------------',
  '|..................|',
  '|..................|',
  '|........@.........|',
  '|..................|',
  '|..................|',
  '--------------------',
];
const HERO = { x: 9, y: 3 };

const monIds = (st: GameState): number[] =>
  sortedIds(st).filter((id) => id !== st.playerId && st.entities[String(id)]?.c.monster);
const nhData = (st: GameState): Record<string, unknown> =>
  (st.modData['nh'] ?? {}) as Record<string, unknown>;

/** First seed in 1..max for which the scenario builder does not throw. */
function findSeed(build: (seed: number) => void, max = 300): number {
  for (let seed = 1; seed <= max; seed++) {
    try {
      build(seed);
      return seed;
    } catch {
      // next seed
    }
  }
  throw new Error('no seed found');
}

describe('props helpers', () => {
  test('setProp and expectProp: intrinsic, timed, and gone', () => {
    runScenario([vanillaMod], (s) => {
      s.level(BIG);
      s.expectProp('stealth', false);
      s.setProp('stealth', { intrinsic: true });
      s.expectProp('stealth', true);
      s.setProp('stunned', { turns: 5 });
      s.expectStunned();
      s.setProp('stunned', {});
      s.expectStunned(false);
    });
  });

  test('door() puts each kind in the wall, adding palette entries', () => {
    runScenario([vanillaMod], (s) => {
      s.level(BIG);
      s.door({ x: 5, y: 0 }, 'locked');
      s.expectTerrain({ x: 5, y: 0 }, 'nh:door_locked');
      s.door({ x: 6, y: 0 }, 'closed');
      s.expectTerrain({ x: 6, y: 0 }, 'nh:door_closed');
      s.door({ x: 7, y: 0 }, 'broken');
      s.expectTerrain({ x: 7, y: 0 }, 'nh:doorway');
      s.door({ x: 0, y: 2 }, 'open');
      s.expectTerrain({ x: 0, y: 2 }, 'nh:door_open_v');
    });
  });
});

describe('M4 scenarios', () => {
  test('a floating eye paralyzes the hero who hits it', () => {
    runScenario([vanillaMod], (s) => {
      s.level(BIG);
      s.setHero({ hp: 500, attributes: { wis: 10 } });
      s.monster('nh:floating_eye', { x: HERO.x + 1, y: HERO.y }, { hp: 500 });
      // the passive fires on 2 of 3 hits; keep hitting until the gaze lands
      s.act(Array.from({ length: 40 }, () => ({ type: 'move' as const, dir: 'e' as const })));
      s.expectEvent({ type: 'msg', key: 'passive.frozen_gaze' });
      // 127 turns of helplessness follow within the same act(); the sleeping hero is fair game
      s.expectEvent({ type: 'msg', key: 'eat.can_move_again' });
    });
  });

  test('a lichen sticks to the hero, who is held until it dies', () => {
    const build = (seed: number, kill: boolean): number => {
      let turnsStuck = 0;
      runScenario([vanillaMod], (s) => {
        s.seed(seed);
        s.level(BIG);
        s.setHero({ hp: 200 });
        s.monster('nh:lichen', { x: HERO.x + 1, y: HERO.y }, { hp: kill ? 1 : 200 });
        // waiting lets the lichen touch her until it sticks
        s.act(Array.from({ length: 30 }, () => ({ type: 'wait' as const })));
        s.check((st) => {
          expect(nhData(st)['ustuck']).toBeTruthy();
          turnsStuck = st.turn;
        });
        s.act({ type: 'move', dir: 'w' });
        s.expectEvent({ type: 'msg', key: 'stuck.cannot_escape' });
        s.expectPos(HERO);
        if (kill) {
          s.act({ type: 'move', dir: 'e' }); // attacks and (usually) kills the 1-hp lichen
          s.check((st) => {
            if (monIds(st).length > 0) throw new Error('lichen survived');
          });
          s.act({ type: 'move', dir: 'w' });
          s.expectPos({ x: HERO.x - 1, y: HERO.y });
          s.check((st) => expect(nhData(st)['ustuck'] ?? null).toBeNull());
        }
      });
      return turnsStuck;
    };
    build(1, false);
    const seed = findSeed((n) => build(n, true));
    expect(seed).toBeGreaterThan(0);
  });

  test('a locked door stays shut when walked into and gives way to kicks', () => {
    runScenario([vanillaMod], (s) => {
      s.seed(3);
      s.level(['-----', '|.@.|', '--+--', '|...|', '-----']);
      s.setHero({ attributes: { str: 18, dex: 18 } });
      s.door({ x: 2, y: 2 }, 'locked');
      s.expectTerrain({ x: 2, y: 2 }, 'nh:door_locked');
      s.act({ type: 'move', dir: 's' });
      s.expectPos({ x: 2, y: 1 });
      s.expectTerrain({ x: 2, y: 2 }, 'nh:door_locked');
      s.check((_st, q) => {
        const offers = q.actionsFor({ kind: 'cell', pos: { x: 2, y: 2 } });
        expect(offers.some((o) => o.labelKey === 'action.nh:kick_door')).toBe(true);
      });
      s.act(
        Array.from({ length: 40 }, () => ({
          type: 'mod' as const,
          action: 'nh:kick',
          args: { dir: 's' },
        })),
      );
      s.expectTerrain({ x: 2, y: 2 }, 'nh:doorway');
      s.expectEvent({ type: 'doorOpened' });
    });
  });

  test('a monster flees, then comes back when its fright runs out', () => {
    runScenario([vanillaMod], (s) => {
      s.level(BIG);
      s.setHero({ hp: 500 });
      s.monster('nh:jackal', { x: HERO.x + 1, y: HERO.y }, { hp: 500 });
      let far = 0;
      s.check((st) => {
        const id = monIds(st)[0]!;
        const nh = (st.modData['nh'] ??= {}) as Record<string, unknown>;
        nh['mflee'] = { [String(id)]: 8 };
      });
      for (let i = 0; i < 6; i++) {
        s.act({ type: 'wait' });
        s.check((st) => {
          const m = st.entities[String(monIds(st)[0])]!.c.pos!;
          far = Math.max(far, Math.max(Math.abs(m.x - HERO.x), Math.abs(m.y - HERO.y)));
        });
      }
      s.check(() => expect(far).toBeGreaterThan(2));
      s.act(Array.from({ length: 30 }, () => ({ type: 'wait' as const })));
      s.check((st) => {
        expect(nhData(st)['mflee'] ?? {}).toEqual({});
        const m = st.entities[String(monIds(st)[0])]!.c.pos!;
        expect(Math.max(Math.abs(m.x - HERO.x), Math.abs(m.y - HERO.y))).toBeLessThanOrEqual(1);
      });
    });
  });

  test('a kobold throws darts at the hero from a distance', () => {
    runScenario([vanillaMod], (s) => {
      s.level(BIG);
      s.setHero({ hp: 500 });
      s.monster(
        'nh:kobold',
        { x: HERO.x + 6, y: HERO.y },
        { carries: [{ def: 'nh:dart', quantity: 12 }] },
      );
      s.act(Array.from({ length: 4 }, () => ({ type: 'wait' as const })));
      s.expectEvent({ type: 'msg', key: 'mthrow.throws' });
    });
  });
});

test('scenario test helper smoke: monsters list is plain', () => {
  runScenario([vanillaMod], (s) => {
    s.level(BIG);
    s.check((st) => expect(monIds(st)).toEqual([]));
  });
});
