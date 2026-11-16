// m22 step 10: the second half of soak.roles (Rogue..Wizard).
import { describe } from 'vitest';
import { roleSoaks } from './helpers/soak';

describe('soak over roles and races (2)', () => {
  roleSoaks(['rogue', 'ranger', 'samurai', 'tourist', 'valkyrie', 'wizard'], 300);
});
