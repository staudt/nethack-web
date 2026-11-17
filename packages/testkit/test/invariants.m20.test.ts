// m20 step 1: the artifact invariants (an artifact is a row on its base object, alone, named and
// marked existing; no two live objects are the same artifact), shown to catch a broken state.
import { ARTIFACTS, oname, vanillaMod } from '@nh/content';
import { createEngine, getPlayer, type DefId, type Entity, type GameState } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { ARTIFACT_BASES, checkInvariants } from '../src/index';

const engine = createEngine([vanillaMod]);

/** A new item of `def` in the hero's inventory (a copy of her first item, renumbered). */
function give(state: GameState, def: DefId): Entity {
  const hero = getPlayer(state);
  const id = state.nextEntityId++;
  const letters = 'zyxwvu';
  const used = new Set(
    Object.values(state.entities).flatMap((e) =>
      e.c.item?.carriedBy === hero.id ? [e.c.item.letter] : [],
    ),
  );
  const letter = [...letters].find((l) => !used.has(l)) ?? null;
  const e: Entity = {
    id,
    def,
    c: {
      item: {
        quantity: 1,
        buc: 'uncursed',
        spe: 0,
        known: { buc: false, spe: false },
        carriedBy: hero.id,
        letter,
        equipped: null,
        placed: state.seq++,
      },
    },
  };
  state.entities[String(id)] = e;
  return e;
}

const errors = (s: GameState): string => checkInvariants(s, engine.registry).join('\n');

describe('m20 invariants', () => {
  test("testkit's copy of the table's bases matches content's table", () => {
    expect(Object.entries(ARTIFACT_BASES)).toEqual(ARTIFACTS.map((a) => [a.id, a.base]));
  });

  test('a healthy artifact passes; a duplicate, a stack, a wrong base or no record fail', () => {
    const { state } = engine.newGame({ seed: 3 });
    const ctx = { state };
    const sting = give(state, 'nh:elven_dagger');
    oname(ctx, sting, 'Sting', 'named', true);
    expect(checkInvariants(state, engine.registry)).toEqual([]);

    const copy = give(state, 'nh:elven_dagger');
    copy.c.item!.artifact = 'nh:sting';
    copy.c.item!.name = 'Sting';
    expect(errors(state)).toMatch(/items \d+ and \d+ are both nh:sting/);
    delete state.entities[String(copy.id)];

    sting.c.item!.quantity = 2;
    expect(errors(state)).toMatch(/artifact nh:sting has quantity 2/);
    sting.c.item!.quantity = 1;

    const wrong = give(state, 'nh:dagger');
    wrong.c.item!.artifact = 'nh:orcrist';
    wrong.c.item!.name = 'Orcrist';
    expect(errors(state)).toMatch(/artifact nh:orcrist is a nh:dagger, not a nh:elven_broadsword/);
    expect(errors(state)).toMatch(/artifact nh:orcrist is not marked existing/);
    delete state.entities[String(wrong.id)];

    const arti = (state.modData['nh'] as { arti: { exist: object; disco: unknown[] } }).arti;
    arti.disco.push('nh:excalibur');
    expect(errors(state)).toMatch(/artifact nh:excalibur: discovered but not existing/);
    arti.disco.length = 0;
    (arti.exist as Record<string, unknown>)['nh:excalibur'] = { origin: 'found it' };
    expect(errors(state)).toMatch(/artifact nh:excalibur: bad existence record/);
  });
});
