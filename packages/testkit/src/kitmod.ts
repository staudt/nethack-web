import { inventoryOf, type Mod } from '@nh/core';

/**
 * A game mod for soak runs: it adds darts, a bow and arrows to the hero's starting kit, so the
 * bot meets the fire and throw actions without waiting for a lucky find. Load it after the
 * vanilla mod: `soak([vanillaMod, soakKitMod], ...)`. It goes through the public mod API only
 * and, like any game mod, is recorded in saves and replays.
 */
export const soakKitMod: Mod = {
  id: 'testkit-soak-kit',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    api.on(
      'newGame',
      (ctx, heroId) => {
        const used = new Set(inventoryOf(ctx.state, heroId).map((e) => e.c.item?.letter));
        const nextLetter = (): string => {
          for (let i = 0; i < 52; i++) {
            const l = String.fromCharCode(i < 26 ? 97 + i : 65 + i - 26);
            if (!used.has(l)) {
              used.add(l);
              return l;
            }
          }
          throw new Error('soakKitMod: inventory full');
        };
        for (const [def, quantity] of [
          ['nh:dart', 12],
          ['nh:bow', 1],
          ['nh:arrow', 24],
        ] as const) {
          if (!ctx.defs.isObject(def)) continue;
          const id = ctx.state.nextEntityId++;
          ctx.state.entities[String(id)] = {
            id,
            def,
            c: {
              item: {
                quantity,
                buc: 'uncursed',
                spe: 0,
                known: { buc: true, spe: true },
                carriedBy: heroId,
                letter: nextLetter(),
                equipped: null,
                placed: ctx.state.seq++,
                age: 1,
              },
            },
          };
        }
      },
      { priority: -100 },
    );
  },
};

/**
 * A game mod for soak runs that should play in a branch: at new game it sends the hero to the
 * main dungeon's first branch staircase (the Mines staircase in vanilla), where the bot takes it
 * soon. Load it after the vanilla mod. Without a branch it does nothing.
 */
export const branchStartMod: Mod = {
  id: 'testkit-branch-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // on the first placement (after the pet is made), not at newGame: no level exists yet
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        const main = ctx.state.dungeons[0];
        const b = main?.branches[0];
        if (main && b) ctx.goToLevel({ dungeon: main.id, dlevel: b.dlevel }, 'branch');
      },
      { priority: -100 },
    );
  },
};

/**
 * A game mod for soak runs on a special level: at new game it sends the hero to the up stairs of
 * the first special level of a branch dungeon in the layout (Minetown in vanilla), else of the
 * main dungeon, so the bot plays there from the start. Load it after the vanilla mod. Without a special level it does nothing.
 */
export const specialStartMod: Mod = {
  id: 'testkit-special-start',
  version: '1',
  dependsOn: ['nh'],
  register(api) {
    // on the first placement (after the pet is made), not at newGame: no level exists yet
    api.on(
      'levelChange',
      (ctx, change) => {
        if (change.from !== null) return;
        // branch dungeons first: the main dungeon's Oracle comes before Minetown in the layout
        const [root, ...branches] = ctx.state.dungeons;
        for (const d of root ? [...branches, root] : branches) {
          const sp = d.special[0];
          if (!sp) continue;
          ctx.goToLevel({ dungeon: d.id, dlevel: sp.dlevel }, 'up');
          return;
        }
      },
      { priority: -100 },
    );
  },
};
