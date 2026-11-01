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
