/**
 * A tiny C preprocessor, just enough for NetHack's data headers (include/monsters.h,
 * include/objects.h): comments, line continuations, `#define`/`#undef` (object-like and
 * function-like, no `#`/`##`), `#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`/`#endif` with `defined()`
 * and integer expressions; `#error`/`#include` are ignored. It is not a general C parser.
 *
 * Names listed in `keep` are never expanded (their `#define`s are ignored), so the row macros we
 * want to read (`MON`, `OBJECT`, ...) survive expansion with their arguments expanded. Pure: no
 * Node or DOM APIs, the caller passes source text.
 */

export interface Token {
  /** 'id' identifier, 'num' integer, 'str' string literal, 'chr' char literal, 'punct' anything else. */
  kind: 'id' | 'num' | 'str' | 'chr' | 'punct';
  text: string;
}

/** A top-level macro call found in the source, with its expansion. */
export interface Expanded {
  /** The call as written in the header, e.g. `WEAPON("dagger", NoDes, 1, ...)`. */
  source: string;
  tokens: Token[];
}

interface Macro {
  params: string[] | null;
  body: Token[];
}

const TOKEN_RE =
  /\s+|([A-Za-z_]\w*)|(0[xX][0-9a-fA-F]+[uUlL]*|\d+[uUlL]*)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(>=|<=|==|!=|&&|\|\||<<|>>|##|\S)/y;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN_RE.lastIndex < text.length && (m = TOKEN_RE.exec(text)) !== null) {
    if (m[1] !== undefined) out.push({ kind: 'id', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'num', text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: 'str', text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'chr', text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: 'punct', text: m[5] });
  }
  return out;
}

/** Removes comments (outside string and char literals) and joins backslash-continued lines. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const body = src.slice(i, end < 0 ? src.length : end + 2);
      out += body.includes('\n') ? '\n'.repeat(body.split('\n').length - 1) : ' ';
      i = end < 0 ? src.length : end + 2;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else {
      out += c;
      i++;
    }
  }
  return out.replace(/\\\r?\n/g, ' ');
}

/** Splits `( a, b(c, d), e )` starting at `open` (an index of '('); returns args and the index after ')'. */
export function splitArgs(toks: readonly Token[], open: number): { args: Token[][]; end: number } {
  const args: Token[][] = [];
  let cur: Token[] = [];
  let depth = 0;
  for (let i = open; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === 'punct' && (t.text === '(' || t.text === '{')) {
      depth++;
      if (depth === 1) continue;
    } else if (t.kind === 'punct' && (t.text === ')' || t.text === '}')) {
      depth--;
      if (depth === 0) {
        if (cur.length > 0 || args.length > 0) args.push(cur);
        return { args, end: i + 1 };
      }
    } else if (depth === 1 && t.kind === 'punct' && t.text === ',') {
      args.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  throw new Error('cpp: unbalanced parentheses');
}

/** Joins tokens back into readable C text. */
export function render(toks: readonly Token[]): string {
  let s = '';
  for (const t of toks) {
    const prev = s[s.length - 1];
    const glue =
      s === '' ||
      t.text === ',' ||
      t.text === ')' ||
      prev === '(' ||
      (t.text === '(' && /\w/.test(prev ?? ''));
    s += (glue ? '' : ' ') + t.text;
    if (t.text === ',') s += ' ';
  }
  // Unary minus after '(' or ',' sticks to its operand: `LVL(1, 18, -1, 0, 0)`.
  return s.replace(/ {2,}/g, ' ').replace(/([(,] ?)- /g, '$1-');
}

export class Preprocessor {
  private readonly macros: Record<string, Macro> = {};
  private readonly keep: ReadonlySet<string>;

  constructor(keep: readonly string[], defines: readonly string[] = []) {
    this.keep = new Set(keep);
    for (const d of defines) this.macros[d] = { params: null, body: [{ kind: 'num', text: '1' }] };
  }

  /**
   * Runs the preprocessor over `src` and returns each top-level macro call (a defined macro or a
   * kept name followed by `(...)`) with its expansion. Text outside such calls is dropped.
   */
  run(src: string): Expanded[] {
    const lines = stripComments(src).split('\n');
    const out: Expanded[] = [];
    // Each entry: is this branch live, has any branch of this #if been taken, was the parent live.
    const stack: { live: boolean; taken: boolean; parent: boolean }[] = [];
    const live = (): boolean => stack.length === 0 || stack[stack.length - 1]!.live;
    let pending: Token[] = [];
    const flush = (): void => {
      out.push(...this.topLevel(pending));
      pending = [];
    };
    for (const line of lines) {
      const d = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
      if (!d) {
        if (live()) pending.push(...tokenize(line));
        continue;
      }
      const [, dir, rest = ''] = d;
      if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef') {
        const parent = live();
        const cond =
          dir === 'if'
            ? parent && this.cond(rest)
            : parent && (dir === 'ifdef') === (this.macros[rest.trim()] !== undefined);
        stack.push({ live: parent && cond, taken: cond, parent });
      } else if (dir === 'elif' || dir === 'else') {
        const top = stack[stack.length - 1];
        if (!top) throw new Error(`cpp: #${dir} without #if`);
        const cond = !top.taken && top.parent && (dir === 'else' || this.cond(rest));
        top.live = cond;
        top.taken = top.taken || cond;
      } else if (dir === 'endif') {
        if (!stack.pop()) throw new Error('cpp: #endif without #if');
      } else if (!live()) {
        continue;
      } else if (dir === 'define') {
        flush();
        this.define(rest);
      } else if (dir === 'undef') {
        flush();
        delete this.macros[rest.trim()];
      }
      // #error, #include, #pragma: ignored.
    }
    flush();
    return out;
  }

  private define(rest: string): void {
    const m = /^(\w+)(\(([^)]*)\))?\s*(.*)$/.exec(rest);
    if (!m) throw new Error(`cpp: bad #define ${rest}`);
    const name = m[1]!;
    if (this.keep.has(name)) return;
    const params = m[2] !== undefined ? (m[3] ?? '').split(',').map((p) => p.trim()) : null;
    this.macros[name] = {
      params: params && params[0] === '' ? [] : params,
      body: tokenize(m[4] ?? ''),
    };
  }

  private cond(expr: string): boolean {
    const toks = tokenize(expr);
    const resolved: Token[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      if (t.kind === 'id' && t.text === 'defined') {
        const paren = toks[i + 1]?.text === '(';
        const name = toks[i + (paren ? 2 : 1)]?.text ?? '';
        resolved.push({ kind: 'num', text: this.macros[name] !== undefined ? '1' : '0' });
        i += paren ? 3 : 1;
      } else resolved.push(t);
    }
    const expanded = this.expand(resolved, new Set()).map((t) =>
      t.kind === 'id' ? { kind: 'num' as const, text: '0' } : t,
    );
    return evalExpr(expanded, {}) !== 0;
  }

  private topLevel(toks: Token[]): Expanded[] {
    const out: Expanded[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      if (t.kind !== 'id' || toks[i + 1]?.text !== '(') continue;
      const macro = this.macros[t.text];
      if (!this.keep.has(t.text) && (macro === undefined || macro.params === null)) continue;
      const { end } = splitArgs(toks, i + 1);
      const call = toks.slice(i, end);
      out.push({ source: render(call), tokens: this.expand(call, new Set()) });
      i = end - 1;
    }
    return out;
  }

  /** Fully macro-expands a token list; `active` holds the macros being expanded (no recursion). */
  expand(toks: readonly Token[], active: ReadonlySet<string>): Token[] {
    const out: Token[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      const macro = t.kind === 'id' && !active.has(t.text) ? this.macros[t.text] : undefined;
      if (macro === undefined) {
        out.push(t);
        continue;
      }
      const inner = new Set(active).add(t.text);
      if (macro.params === null) {
        out.push(...this.expand(macro.body, inner));
        continue;
      }
      if (toks[i + 1]?.text !== '(') {
        out.push(t);
        continue;
      }
      const { args, end } = splitArgs(toks, i + 1);
      const values = args.map((a) => this.expand(a, active));
      const body: Token[] = [];
      for (const b of macro.body) {
        const k = b.kind === 'id' ? macro.params.indexOf(b.text) : -1;
        if (k >= 0) body.push(...(values[k] ?? []));
        else body.push(b);
      }
      out.push(...this.expand(body, inner));
      i = end - 1;
    }
    return out;
  }
}

/** Evaluates a C integer expression; identifiers come from `symbols` (an unknown one throws). */
export function evalExpr(
  toks: readonly Token[],
  symbols: Readonly<Record<string, number>>,
): number {
  let i = 0;
  const peek = (): string | undefined => toks[i]?.text;
  // Binary operators by increasing precedence.
  const BINARY: string[][] = [
    ['||'],
    ['&&'],
    ['|'],
    ['&'],
    ['==', '!='],
    ['<', '>', '<=', '>='],
    ['+', '-'],
    ['*', '/', '%'],
  ];
  const apply = (op: string, a: number, b: number): number => {
    switch (op) {
      case '||':
        return a || b ? 1 : 0;
      case '&&':
        return a && b ? 1 : 0;
      case '|':
        return a | b;
      case '&':
        return a & b;
      case '==':
        return a === b ? 1 : 0;
      case '!=':
        return a !== b ? 1 : 0;
      case '<':
        return a < b ? 1 : 0;
      case '>':
        return a > b ? 1 : 0;
      case '<=':
        return a <= b ? 1 : 0;
      case '>=':
        return a >= b ? 1 : 0;
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return Math.trunc(a / b);
      default:
        return a % b;
    }
  };
  const level = (n: number): number => {
    if (n >= BINARY.length) return unary();
    let a = level(n + 1);
    while (BINARY[n]!.includes(peek() ?? '')) {
      const op = toks[i++]!.text;
      a = apply(op, a, level(n + 1));
    }
    return a;
  };
  const unary = (): number => {
    const t = toks[i++];
    if (t === undefined) throw new Error(`cpp: truncated expression ${render(toks)}`);
    if (t.text === '-') return -unary();
    if (t.text === '+') return unary();
    if (t.text === '!') return unary() ? 0 : 1;
    if (t.text === '~') return ~unary();
    if (t.text === '(') {
      // A cast such as `(char *) 0` or `(long)`: skip the type.
      if (toks[i]?.kind === 'id' && symbols[toks[i]!.text] === undefined && isCast(toks, i)) {
        while (toks[i] !== undefined && toks[i]!.text !== ')') i++;
        i++;
        return unary();
      }
      const v = level(0);
      if (toks[i++]?.text !== ')') throw new Error(`cpp: missing ) in ${render(toks)}`);
      return v;
    }
    if (t.kind === 'num') return Number.parseInt(t.text.replace(/[uUlL]+$/, ''));
    if (t.kind === 'chr') return unquote(t.text).charCodeAt(0);
    if (t.kind === 'id') {
      const v = symbols[t.text];
      if (v === undefined) throw new Error(`cpp: unknown symbol ${t.text} in ${render(toks)}`);
      return v;
    }
    throw new Error(`cpp: unexpected ${t.text} in ${render(toks)}`);
  };
  const v = level(0);
  if (i !== toks.length) throw new Error(`cpp: trailing tokens in ${render(toks)}`);
  return v;
}

function isCast(toks: readonly Token[], i: number): boolean {
  const TYPES = ['char', 'int', 'long', 'short', 'unsigned', 'const', 'schar', 'uchar'];
  return TYPES.includes(toks[i]!.text);
}

/** The value of a C string or char literal (simple escapes only). */
export function unquote(lit: string): string {
  return lit.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

/** Concatenated string literals in `toks`, or null when there are none (`NoDes`, `(char *) 0`). */
export function stringValue(toks: readonly Token[]): string | null {
  const strs = toks.filter((t) => t.kind === 'str');
  return strs.length === 0 ? null : strs.map((t) => unquote(t.text)).join('');
}

/** The identifiers OR-ed together in a flag expression (`M1_FLY | M1_SWIM`, `0`). */
export function flagNames(toks: readonly Token[]): string[] {
  return toks.filter((t) => t.kind === 'id').map((t) => t.text);
}

/** If `toks` is exactly `name(args...)`, its arguments; otherwise null. */
export function callArgs(toks: readonly Token[], name: string): Token[][] | null {
  let s = 0;
  let e = toks.length;
  while (toks[s]?.text === '(' && toks[e - 1]?.text === ')') {
    // Strip redundant outer parentheses only when they enclose everything.
    const { end } = splitArgs(toks, s);
    if (end !== e) break;
    s++;
    e--;
  }
  if (toks[s]?.kind !== 'id' || toks[s]!.text !== name || toks[s + 1]?.text !== '(') return null;
  const { args, end } = splitArgs(toks, s + 1);
  return end === e ? args : null;
}

/** Integer `#define NAME value` and `NAME = value,` enum entries in header text. */
export function numericSymbols(header: string): Record<string, number> {
  const out: Record<string, number> = {};
  const text = stripComments(header);
  for (const m of text.matchAll(
    /^\s*#\s*define\s+(\w+)\s+\(?(-?(?:0[xX][0-9a-fA-F]+|\d+))[uUlL]*\)?\s*$/gm,
  ))
    out[m[1]!] = Number.parseInt(m[2]!);
  for (const m of text.matchAll(/^\s*(\w+)\s*=\s*(-?(?:0[xX][0-9a-fA-F]+|\d+))\s*,?\s*$/gm))
    out[m[1]!] = Number.parseInt(m[2]!);
  return out;
}
