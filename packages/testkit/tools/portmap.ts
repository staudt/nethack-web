/**
 * Writes docs/PORTMAP.md (NetHack file -> function -> our files) from the `// ref:` citations.
 *
 *   pnpm portmap
 *
 * Node only (run with `node`, which strips the types); never imported by core or content.
 * test/portmap.test.ts fails when the committed file is stale.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPortMap, type SourceText } from '../src/portmap.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** Our `packages/<pkg>/src/**\/*.ts` files and NetHack's `src/*.c`, repo-relative and sorted. */
export function readPortMapInputs(repo: string): { sources: SourceText[]; cFiles: SourceText[] } {
  const read = (path: string): SourceText => ({ path, text: readFileSync(repo + path, 'utf8') });
  const sources = readdirSync(repo + 'packages', { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${repo}packages/${d.name}/src`))
    .flatMap((d) =>
      readdirSync(`${repo}packages/${d.name}/src`, { recursive: true, encoding: 'utf8' }).map(
        (p) => `packages/${d.name}/src/${p.split('\\').join('/')}`,
      ),
    )
    .filter((p) => p.endsWith('.ts'))
    .sort()
    .map(read);
  if (!existsSync(repo + 'vendor/nethack/src/hack.c')) {
    throw new Error(
      'vendor/nethack is not checked out: run `git submodule update --init vendor/nethack`',
    );
  }
  const cFiles = readdirSync(repo + 'vendor/nethack/src', { encoding: 'utf8' })
    .filter((f) => f.endsWith('.c'))
    .sort()
    .map((f) => read('vendor/nethack/src/' + f));
  return { sources, cFiles };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { sources, cFiles } = readPortMapInputs(root);
  const out = buildPortMap(sources, cFiles);
  writeFileSync(root + 'docs/PORTMAP.md', out);
  console.log(`wrote docs/PORTMAP.md (${out.split('\n').length} lines)`);
}
