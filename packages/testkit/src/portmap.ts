/**
 * Builds docs/PORTMAP.md (NetHack source file -> function -> our files) from the `// ref:`
 * citations in packages/*\/src. Pure: callers pass the file texts in. Node-side tooling, run by
 * `pnpm portmap` (tools/portmap.ts) and checked for staleness by test/portmap.test.ts.
 */

export interface SourceText {
  /** Repo-relative path with `/` separators. */
  readonly path: string;
  readonly text: string;
}

/** A citation of a NetHack file, with the functions (or table macros) named after it. */
export interface Citation {
  readonly file: string;
  readonly names: readonly string[];
}

const FILE_RE = /(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:c|h|lua)\b/g;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const DEF_RE = /^([A-Za-z_][A-Za-z0-9_]*)\(/gm;

/** `objects.h` -> `include/objects.h`, `vendor/nethack/src/hack.c` -> `src/hack.c`. */
export function normalizeFile(raw: string): string {
  const f = raw.replace(/^vendor\/nethack\//, '');
  if (f.includes('/')) return f;
  if (f.endsWith('.h')) return `include/${f}`;
  if (f.endsWith('.lua')) return `dat/${f}`;
  return `src/${f}`;
}

/** Index of top-level function definitions in NetHack's src/*.c (name at column 0, C style). */
export function functionIndex(cFiles: readonly SourceText[]): Record<string, string> {
  const seen: Record<string, string | null> = {};
  for (const { path, text } of cFiles) {
    const file = normalizeFile(path);
    for (const m of text.matchAll(DEF_RE)) {
      const name = m[1] ?? '';
      const prev = Object.hasOwn(seen, name) ? seen[name] : undefined;
      seen[name] = prev === undefined || prev === file ? file : null; // null: ambiguous
    }
  }
  const out: Record<string, string> = {};
  for (const name of Object.keys(seen).sort()) {
    const f = seen[name];
    if (f) out[name] = f;
  }
  return out;
}

/** Skips a balanced `(...)` starting at `s[i] === '('`; returns the index after it. */
function skipParens(s: string, i: number): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') depth++;
    else if (s[j] === ')' && --depth === 0) return j + 1;
  }
  return s.length;
}

/**
 * Reads the names listed right after a file: `f()`, `f(args)`, `table[]`, or a bare
 * snake_case name first, separated by `,`, `/`, `and`. Stops at anything else (prose).
 */
function namesAfter(s: string, start: number): string[] {
  const names: string[] = [];
  let i = start;
  for (;;) {
    const sep = names.length === 0 ? /^\s*/ : /^\s*(?:(?:,|\/|&|\band\b|\bor\b)\s*)?/;
    const j = i + (sep.exec(s.slice(i))?.[0].length ?? 0);
    const id = IDENT_RE.exec(s.slice(j))?.[0];
    if (!id) break;
    const k = j + id.length;
    if (s[k] === '(') {
      names.push(id);
      i = skipParens(s, k);
    } else if (s.startsWith('[]', k)) {
      names.push(id);
      i = k + 2;
    } else if (
      names.length === 0 &&
      id.includes('_') &&
      !/\.(?:c|h|lua)\b/.test(s.slice(k, k + 4))
    ) {
      names.push(id);
      i = k;
    } else break;
  }
  return names;
}

/** The citations in one `ref:` text (the rest of the line after `ref:`). */
export function parseRef(text: string, index: Readonly<Record<string, string>>): Citation[] {
  const out: Citation[] = [];
  const files = [...text.matchAll(FILE_RE)];
  if (files.length === 0) {
    // No file named: resolve `name()` through the function index, if unambiguous.
    const names = namesAfter(text, 0);
    for (const n of names) {
      const f = index[n];
      if (f) out.push({ file: f, names: [n] });
    }
    return out;
  }
  for (const m of files) {
    const start = (m.index ?? 0) + m[0].length;
    out.push({ file: normalizeFile(m[0]), names: namesAfter(text, start) });
  }
  return out;
}

const FILE_KEY = '(file)';

/** Renders the whole of docs/PORTMAP.md. `sources` are our files, `cFiles` NetHack's src/*.c. */
export function buildPortMap(
  sources: readonly SourceText[],
  cFiles: readonly SourceText[],
): string {
  const index = functionIndex(cFiles);
  // nethack file -> name -> our files
  const map: Record<string, Record<string, string[]>> = {};
  let count = 0;
  for (const { path, text } of [...sources].sort((a, b) => cmp(a.path, b.path))) {
    for (const m of text.matchAll(/\bref:([^\n]*)/g)) {
      for (const c of parseRef(m[1] ?? '', index)) {
        count++;
        const byName = (map[c.file] ??= {});
        for (const n of c.names.length > 0 ? c.names.map((x) => `${x}()`) : [FILE_KEY]) {
          const list = (byName[n] ??= []);
          if (!list.includes(path)) list.push(path);
        }
      }
    }
  }
  const lines = [
    '# Port map',
    '',
    'Where each NetHack function lives in this port, generated from the `// ref:` citations in',
    '`packages/*/src` by `pnpm portmap` (`packages/testkit/tools/portmap.ts`). Do not edit by hand;',
    'a test fails when it is stale. Names are what the citation lists after the file (functions,',
    'tables and data macros such as `WEAPON()`); a citation that names no file is placed through',
    'the function definitions in `vendor/nethack/src`. `(file)` lists citations of the file as a',
    'whole. A missing function may still be ported under a citation this parser cannot read.',
    '',
    `${Object.keys(map).length} NetHack files, ${count} citations.`,
  ];
  for (const file of Object.keys(map).sort(cmp)) {
    lines.push('', `## ${file}`, '');
    const byName = map[file] ?? {};
    for (const name of Object.keys(byName).sort(cmp)) {
      const ours = [...(byName[name] ?? [])].sort(cmp).map((p) => `\`${p}\``);
      lines.push(`- ${name === FILE_KEY ? FILE_KEY : `\`${name}\``}: ${ours.join(', ')}`);
    }
  }
  return lines.join('\n') + '\n';
}

function cmp(a: string, b: string): number {
  const fa = a === FILE_KEY;
  const fb = b === FILE_KEY;
  if (fa !== fb) return fa ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
