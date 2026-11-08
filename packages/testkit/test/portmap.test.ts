// docs/PORTMAP.md is generated from the `// ref:` citations; this keeps it current.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildPortMap, functionIndex, normalizeFile, parseRef } from '../src/portmap.ts';
import { readPortMapInputs } from '../tools/portmap.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('port map', () => {
  test('docs/PORTMAP.md is up to date', () => {
    const { sources, cFiles } = readPortMapInputs(root);
    const committed = readFileSync(root + 'docs/PORTMAP.md', 'utf8');
    expect(
      committed === buildPortMap(sources, cFiles),
      'docs/PORTMAP.md is stale: run `pnpm portmap` and commit the result',
    ).toBe(true);
  });

  test('parses the citation shapes', () => {
    const index = functionIndex([
      { path: 'vendor/nethack/src/dothrow.c', text: 'int\ndofire(void)\n{\n}\n' },
    ]);
    expect(normalizeFile('objects.h')).toBe('include/objects.h');
    expect(normalizeFile('vendor/nethack/src/hack.c')).toBe('src/hack.c');
    expect(normalizeFile('minend-1.lua')).toBe('dat/minend-1.lua');
    expect(
      parseRef(' src/eat.c gethungry(), newuhs(), src/allmain.c moveloop_core', index),
    ).toEqual([
      { file: 'src/eat.c', names: ['gethungry', 'newuhs'] },
      { file: 'src/allmain.c', names: ['moveloop_core'] },
    ]);
    expect(parseRef(' src/cmd.c extcmdlist[]); `Alt+x`', index)).toEqual([
      { file: 'src/cmd.c', names: ['extcmdlist'] },
    ]);
    expect(parseRef(' objects.h WEAPON("aklys", "thonged club", 0, B)', index)).toEqual([
      { file: 'include/objects.h', names: ['WEAPON'] },
    ]);
    expect(parseRef(' src/hack.c the hero moves; see foo() later', index)).toEqual([
      { file: 'src/hack.c', names: [] },
    ]);
    // No file: placed through the vendor function index.
    expect(parseRef(' dofire(): ok_to_throw()', index)).toEqual([
      { file: 'src/dothrow.c', names: ['dofire'] },
    ]);
  });
});
