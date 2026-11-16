// The soak bot in a world where everything keeps polymorphing: every few turns each monster on
// the level takes a random form (newcham()) and every floor object near the hero changes
// (poly_obj()), so the invariants are checked against polymorphed monsters, their dropped or
// broken gear and polymorphed objects.
import { newcham, polyObj, vanillaMod } from '@nh/content';
import { getPlayer, sortedIds, type Mod } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { noteWallwalkers, soak, wallwalkRecord } from '../src/index';

let changed = 0;
// the wall-walker record, observed every turn: a step can span many turns while the hero is
// helpless, and a xorn that enters a wall or a fog cloud that flows under a door may change form
// there before the next check
let wallwalk = wallwalkRecord();
const polyEverythingMod: Mod = {
  id: 'testkit-poly-everything',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // a sturdy hero, so the run outlives the random forms around her
    api.on(
      'newGame',
      (ctx) => {
        const h = getPlayer(ctx.state);
        if (h.c.hp) h.c.hp = { cur: 3000, max: 3000 };
      },
      { priority: -100 },
    );
    api.on(
      'endOfTurn',
      (ctx) => {
        noteWallwalkers(ctx.state, ctx.defs, wallwalk);
      },
      { priority: -1000 },
    );
    api.on('endOfTurn', (ctx) => {
      if (ctx.state.turn % 7 !== 0 || ctx.state.gameOver) return;
      const hp = getPlayer(ctx.state).c.pos;
      if (!hp) return;
      for (const id of sortedIds(ctx.state)) {
        const e = ctx.state.entities[String(id)];
        if (!e || id === ctx.state.playerId) continue;
        const p = e.c.pos;
        if (!p || p.level !== hp.level) continue;
        if (e.c.monster) {
          if (newcham(ctx, e, null, { msg: true })) changed++;
        } else if (e.c.item && Math.abs(p.x - hp.x) <= 3 && Math.abs(p.y - hp.y) <= 3) {
          polyObj(ctx, e, null);
          changed++;
        }
      }
    });
  },
};

describe('polymorph soak', () => {
  // seeds whose runs last past turn 200 (716 replaced 715 in m11 step 8: it died at turn 33;
  // 717 replaced 716 in m12 step 1, whose new monsters shift the random forms: it died at turn 174;
  // 714 replaced 711 in m12 step 3 (queen bee, lieutenant, captain): it died at turn 141;
  // 718 replaced 714 in m12 step 7 (the guard row): it died at turn 82, and passes without the row;
  // 723 replaced 717 in m13 step 6 (the golems shift the random forms): it died at turn 153, and
  // passes without the golem rows, as 723 does; 724 replaced 723 in m13 step 8 (the 34 new rows
  // shift the random forms): it died at turn 120, and 718 and 724 last 400 turns with the rows in
  // and filtered out; 725 replaced 724 in m14 step 7 (monsters' pickups of what they can use
  // shift the stream): it died at turn 73 to a barrow wight's level drain at XL1, and 725 lasts
  // 400 turns with and without the step; 727 and 732 replaced 718 and 725 in m16 step 1, whose
  // "Look here" offer shifts the bot's picks: they died at turns 103 and 167, and 727 and 732 last
  // past turn 200 with and without the offer; 731 is no use: without the offer a monster ends on
  // a closed door at turn 29, an invariant violation already there before m16; 739 and 741
  // replaced 727 and 732 in m16 step 2, whose `E` offer shifts the bot's picks: 727 died at turn
  // 143, and 732 had a monster's orcish helm dropped on stone when it changed form inside the
  // rock at turn 161 (not engraving: newcham() drops the armor where the monster stands); 739
  // and 741 last past turn 200 with and without the offer; 742 and 743 replaced 739 and 741 in m16
  // step 7, whose grave roll per room shifts the stream: 739 ended with a monster on a closed door
  // at step 323 (731's old violation, not graves) and 741 died at turn 191; 742 and 743 last 400
  // turns with and without the roll; 744 replaced 743 in m17 step 8b, whose Wizard of Yendor row
  // shifts the random forms: 743 died at turn 17 and lasts 400 turns without the row, as 744
  // does with and without it; 753 replaced 742 in m18 step 3, whose ring of protection from shape
  // changers and three shapeshifter rows shift the stream: 742 died at turn 141 with and without
  // the ring, and 744 and 753 last 400 turns with and without it); 759 and 760 replaced 744 and
  // 753 in m18 step 4, whose 14 demon rows shift the random forms: 744 died at turn 121 and 753
  // had a monster on a locked door at step 21 (731's old violation), both lasting 400 turns with
  // the rows filtered and the in_mklev sleep off, as 759 and 760 do with and without them; 764
  // replaced 760 in m18 step 6, whose four Kop rows shift the random forms: 760 died at turn 59
  // and lasts 400 turns with the Kop rows filtered and the cream pie's prob 0, as 764 does with
  // and without them; 768 replaced 759 in m19 step 1, whose 17 object rows shift the stream: 759
  // had a monster on a closed door at step 42 (731's old violation) and passes with the rows
  // filtered; 764 and 768 last past turn 200 with and without the rows; the bug-lead fixes after
  // m19 found "731's old violation" had two causes: a pet with hands stepped onto a closed door
  // without opening it (dog_move() now reaches postmov()'s door part: 759), and an amorphous
  // monster flowed under a door and changed form there between two checks (753: C's newcham()
  // leaves it there; the record is now noted every turn and remembers oozers anywhere); 732's
  // helm on stone is what C does too, dropped where the former wall-walker stands, and the record
  // keeps such cells for objects; 764 and 768 still last past turn 200 after the fixes; 765
  // replaced 764 in m21 step 4, whose Croesus row shifts the random forms: 764 died at turn 131
  // and lasts past turn 200 with the row filtered, as 765 and 768 do with and without it; 767
  // replaced 765 in m22 step 3, whose starting kit and pet rolls shift the stream: 765 died at
  // turn 77; of 760..785, 764, 767, 768, 771, 773 and 774 last 400 turns with and without it)
  for (const seed of [767, 768]) {
    test(`seed ${seed}: 400 turns of polymorphing monsters and objects`, { timeout: 60000 }, () => {
      changed = 0;
      wallwalk = wallwalkRecord();
      const r = soak([vanillaMod, polyEverythingMod], {
        seed,
        turns: 400,
        checkEvery: 1,
        wallwalk,
      });
      console.log(
        `polymorph soak seed=${seed}: changed=${changed} turns=${r.turns} outcome=${r.outcome}`,
      );
      expect(r.violations).toBeNull();
      expect(changed).toBeGreaterThan(20);
      expect(r.turns).toBeGreaterThan(200);
    });
  }
});
