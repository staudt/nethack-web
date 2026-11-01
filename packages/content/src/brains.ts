import type { BrainDef } from '@nh/core';
import { dogMove } from './dogmove';
import { dochug, mcalcmove } from './monmove';

// ref: src/monmove.c dochug(), m_move(); src/mon.c mcalcmove()
export const BRAINS: readonly BrainDef[] = [
  {
    id: 'nh:melee',
    // pets move with dog_move() (passed in so monmove.ts need not import dogmove.ts)
    act: (ctx, self) => dochug(ctx, self, dogMove),
    movement(ctx, self) {
      const a = ctx.state.entities[String(self)]?.c.actor;
      return mcalcmove(ctx.rng, a?.speed ?? 12);
    },
  },
];
