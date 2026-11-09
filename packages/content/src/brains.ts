import type { BrainDef } from '@nh/core';
import { dogMove } from './dogmove';
import { dochug, mcalcmove } from './monmove';
import { mspeed } from './mstate';
import { wornIn } from './props';

// ref: src/monmove.c dochug(), m_move(); src/mon.c mcalcmove()
export const BRAINS: readonly BrainDef[] = [
  {
    id: 'nh:melee',
    // pets move with dog_move() (passed in so monmove.ts need not import dogmove.ts)
    act: (ctx, self) => dochug(ctx, self, dogMove),
    movement(ctx, self) {
      const a = ctx.state.entities[String(self)]?.c.actor;
      // worn speed boots make it MFAST whatever its permspeed (ref: src/worn.c
      // mon_adjust_speed(), update_mon_extrinsics())
      const boots = wornIn(ctx.state, self, 'boots')?.def === 'nh:speed_boots';
      return mcalcmove(ctx.rng, a?.speed ?? 12, boots ? 'fast' : mspeed(ctx, self));
    },
  },
];
