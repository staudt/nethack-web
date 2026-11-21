import { describe } from 'vitest';
import { shapeshiftSoaks } from './helpers/shapeshift';

// The second shapeshifter seed (see soak.shapeshift.test.ts for the run and the seeds' history),
// in its own file so the two run on parallel workers.
describe('shapeshifter soak', () => {
  shapeshiftSoaks([381]);
});
