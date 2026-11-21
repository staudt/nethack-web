import { describe } from 'vitest';
import { ludiosSoaks } from './helpers/ludios';

// The hero starts in Fort Ludios's arrival chamber (ludiosStartMod) and the bot plays there,
// with every invariant (the fort's portals among them) checked as it goes; a run that ends early
// is still checked to its last step. Seed 9 plays all 400 turns, 10 more than 380 (of 1..12
// the others die sooner: the fort is no place for a first-level hero).
// (seed 10 runs in soak.ludios2.test.ts, on another worker)
describe('soak on Fort Ludios', () => {
  ludiosSoaks([9]);
});
