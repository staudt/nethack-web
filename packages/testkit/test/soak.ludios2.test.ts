import { describe } from 'vitest';
import { ludiosSoaks } from './helpers/ludios';

// The second Fort Ludios seed (see soak.ludios.test.ts), in its own file so the two run on
// parallel workers.
describe('soak on Fort Ludios', () => {
  ludiosSoaks([10]);
});
