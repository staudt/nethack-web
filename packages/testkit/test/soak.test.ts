import { describe } from 'vitest';
import { seedSoaks } from './helpers/soak';

describe('soak', () => {
  seedSoaks([1, 2, 3]);
});
