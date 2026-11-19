/**
 * The quest texts converter: reads dat/quest.lua (a small Lua subset: nested tables, `"..."`
 * strings with backslash escapes, `[[...]]` long strings, `--` comments) and writes content's
 * generated `questtxt.ts` (which message each section has, how it is delivered) and
 * `quest.en.ts` (the English, one key per message). questpgr.c's `%` codes become `{q<X>}`
 * params and their suffixes ui modifiers, exactly by convert_line()'s rules. Node-side tooling:
 * content imports the generated files, never this module. See docs/CONVERTER.md "Quest texts".
 * ref: dat/quest.lua; src/questpgr.c convert_line(), convert_arg(), com_pager_core()
 */

/** A Lua table: its named fields in source order and its positional values. */
export interface LuaTable {
  fields: Record<string, LuaValue>;
  list: LuaValue[];
}
export type LuaValue = string | number | boolean | LuaTable;

const isTable = (v: LuaValue | undefined): v is LuaTable => typeof v === 'object' && v !== null;

/** Parses the Lua chunk's global assignments (`name = value`). */
export function parseLua(src: string): Record<string, LuaValue> {
  let i = 0;
  const fail = (what: string): never => {
    const line = src.slice(0, i).split('\n').length;
    throw new Error(`quest.lua:${line}: ${what}`);
  };
  const skip = (): void => {
    for (;;) {
      while (i < src.length && /\s/.test(src.charAt(i))) i++;
      if (src.startsWith('--', i)) {
        if (src.startsWith('--[[', i)) {
          const end = src.indexOf(']]', i + 4);
          i = end < 0 ? src.length : end + 2;
        } else {
          const end = src.indexOf('\n', i);
          i = end < 0 ? src.length : end + 1;
        }
      } else return;
    }
  };
  const name = (): string => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (!m) return fail('name expected');
    i += m[0].length;
    return m[0];
  };
  const quoted = (): string => {
    const q = src.charAt(i++);
    let out = '';
    for (;;) {
      const c = src.charAt(i++);
      if (c === '') return fail('unterminated string');
      if (c === q) return out;
      if (c === '\n') return fail('newline in string');
      if (c === '\\') {
        const e = src.charAt(i++);
        const esc: Record<string, string> = { n: '\n', t: '\t', '\\': '\\', '"': '"', "'": "'" };
        const r = esc[e];
        if (r === undefined) return fail(`unsupported escape \\${e}`);
        out += r;
      } else out += c;
    }
  };
  const long = (): string => {
    i += 2;
    // a newline right after the opening brackets is skipped (Lua's rule)
    if (src.charAt(i) === '\r') i++;
    if (src.charAt(i) === '\n') i++;
    const end = src.indexOf(']]', i);
    if (end < 0) return fail('unterminated long string');
    const s = src.slice(i, end);
    i = end + 2;
    return s;
  };
  const value = (): LuaValue => {
    skip();
    const c = src.charAt(i);
    if (c === '{') return table();
    if (c === '"' || c === "'") return quoted();
    if (src.startsWith('[[', i)) return long();
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const w = name();
    if (w === 'true' || w === 'false') return w === 'true';
    return fail(`unsupported value ${w}`);
  };
  const table = (): LuaTable => {
    i++; // {
    const t: LuaTable = { fields: {}, list: [] };
    for (;;) {
      skip();
      if (src.charAt(i) === '}') {
        i++;
        return t;
      }
      const save = i;
      let key: string | null = null;
      if (/[A-Za-z_]/.test(src.charAt(i))) {
        const k = name();
        skip();
        if (src.charAt(i) === '=' && src.charAt(i + 1) !== '=') {
          i++;
          key = k;
        } else i = save;
      } else if (src.charAt(i) === '[' && src.charAt(i + 1) !== '[') {
        i++;
        skip();
        const k = value();
        skip();
        if (src.charAt(i) !== ']') fail('] expected');
        i++;
        skip();
        if (src.charAt(i) !== '=') fail('= expected');
        i++;
        key = String(k);
      }
      const v = value();
      if (key === null) t.list.push(v);
      else {
        if (Object.hasOwn(t.fields, key)) fail(`duplicate key ${key}`);
        t.fields[key] = v;
      }
      skip();
      const sep = src.charAt(i);
      if (sep === ',' || sep === ';') i++;
      else if (sep !== '}') fail(', or } expected');
    }
  };
  const out: Record<string, LuaValue> = {};
  for (;;) {
    skip();
    if (i >= src.length) return out;
    const k = name();
    skip();
    if (src.charAt(i) !== '=') fail('= expected');
    i++;
    out[k] = value();
  }
}

/** How a message is delivered (com_pager_core()'s `output`, after the pline-to-window switch). */
export type QuestOutput = 'pline' | 'text' | 'menu';

/** One message of a section, as content's questtxt.ts records it. */
export interface QuestTextInfo {
  output: QuestOutput;
  /** a synopsis line goes to the message log after a window (`.synopsis` key) */
  synopsis: boolean;
  /** a 'pline' message of several lines: one key per line (`.1` .. `.n`), each its own pline */
  lines?: number;
  /** a list of lines one of which is drawn (`rn2(n) + 1`): one key per line (`.1` .. `.n`) */
  choices?: number;
}

export interface QuestConversion {
  /** section ('common' or the lowercased role file code) -> msgid -> info, in file order */
  texts: Record<string, Record<string, QuestTextInfo>>;
  /** questtext.msg_fallbacks */
  fallbacks: Record<string, string>;
  /** message key -> English template, in file order */
  messages: [string, string][];
}

/** Not generated: the test pattern, and the cuss lists (chat.en.ts keeps them as `cuss.*`). */
const SKIPPED: ReadonlySet<string> = new Set(['TEST_PATTERN', 'angel_cuss', 'demon_cuss']);

/** ref: include/global.h BUFSZ */
const BUFSZ = 256;

/** The codes that become params (`{q<X>}`); the others are constants or empty. */
const PARAM_CODES = 'pcrRsSliOongGHaAdDx';
/** ref: src/questpgr.c convert_arg(): the constant codes */
const CONSTANTS: Readonly<Record<string, string>> = {
  C: 'chaotic',
  N: 'neutral',
  L: 'lawful',
  Z: 'The Dungeons of Doom', // svd.dungeons[0].dname
  '%': '%',
};
/** A suffix letter -> the ui modifier. */
const MODIFIERS: Readonly<Record<string, string>> = {
  A: 'An',
  a: 'an',
  C: 'C',
  P: 'Plural',
  p: 'plural',
  S: 'S',
  s: 's',
  t: 't',
};
const PRONOUNS: Readonly<Record<string, string>> = { h: 'he', i: 'him', j: 'his' };
/** ref: src/gender.c genders[2] (neuter): an invalid subject's pronoun */
const NEUTER: Readonly<Record<string, string>> = { h: 'it', i: 'it', j: 'its' };

const upstart = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One line of quest text with its `%` codes as `{q<X>}` placeholders, by convert_line()'s
 * rules: after `%X`, a following `A a C P p S s t` is a suffix (a ui modifier), and `h H i I j J`
 * a pronoun only after `d l n o` (else the letter stays literal, as does any other).
 * ref: src/questpgr.c convert_line(), convert_arg(), qtext_pronoun()
 */
export function convertLine(line: string): string {
  if (line.includes('{') || line.includes('}')) throw new Error(`brace in quest text: ${line}`);
  let out = '';
  for (let k = 0; k < line.length; k++) {
    const c = line.charAt(k);
    if (c !== '%' || k + 1 >= line.length) {
      out += c;
      continue;
    }
    const x = line.charAt(++k);
    const y = line.charAt(k + 1); // '' at the end of the line: no suffix
    const param = PARAM_CODES.includes(x);
    const constant = param ? '' : (CONSTANTS[x] ?? '');
    const mod = MODIFIERS[y];
    const pron = PRONOUNS[y.toLowerCase()];
    if (pron !== undefined && 'dlno'.includes(x.toLowerCase())) {
      k++;
      const cap = y !== y.toLowerCase();
      if ('dlno'.includes(x)) out += `{q${x}_${pron}${cap ? '|C' : ''}}`;
      else {
        // %D, %L, %N, %O: qtext_pronoun() gives neuter for any subject but d, l, n, o
        const w = NEUTER[y.toLowerCase()] ?? '';
        out += cap ? upstart(w) : w;
      }
    } else if (mod !== undefined) {
      k++;
      if (param) out += `{q${x}|${mod}}`;
      else if (mod === 'C') out += upstart(constant);
      else if (mod === 't') out += constant.replace(/^the /i, '');
      else throw new Error(`unsupported suffix %${x}${y} in: ${line}`);
    } else out += param ? `{q${x}}` : constant;
  }
  return out;
}

/** The whole text, line by line (convert_line() works on one line). */
const convertText = (text: string): string => text.split('\n').map(convertLine).join('\n');

/**
 * The generated tables and English of quest.lua's `questtext`. A message with no `output` is a
 * pline unless its text has a newline or is too long for a message buffer: then a text window
 * whose synopsis, when it has none, is the text in brackets with newlines made spaces.
 * ref: src/questpgr.c com_pager_core()
 */
export function convertQuestLua(src: string): QuestConversion {
  const qt = parseLua(src)['questtext'];
  if (!isTable(qt)) throw new Error('quest.lua: no questtext table');
  const texts: QuestConversion['texts'] = {};
  const messages: QuestConversion['messages'] = [];
  let fallbacks: Record<string, string> = {};
  for (const [section, body] of Object.entries(qt.fields)) {
    if (!isTable(body)) throw new Error(`questtext.${section} is not a table`);
    if (section === 'msg_fallbacks') {
      fallbacks = Object.fromEntries(
        Object.entries(body.fields).map(([k, v]) => {
          if (typeof v !== 'string') throw new Error(`msg_fallbacks.${k} is not a string`);
          return [k, v];
        }),
      );
      continue;
    }
    const code = section.toLowerCase();
    const sec: Record<string, QuestTextInfo> = {};
    texts[code] = sec;
    for (const [msgid, msg] of Object.entries(body.fields)) {
      if (SKIPPED.has(msgid)) continue;
      if (!isTable(msg)) throw new Error(`questtext.${section}.${msgid} is not a table`);
      const key = `quest.${code}.${msgid}`;
      const text = msg.fields['text'];
      if (text === undefined) {
        // a list of lines, one drawn: delivered by pline (none needs a window)
        const lines = msg.list.map((v) => {
          if (typeof v !== 'string') throw new Error(`${key}: not a string list`);
          if (v.includes('\n') || v.length >= BUFSZ - 1) throw new Error(`${key}: long choice`);
          return v;
        });
        if (lines.length < 2) throw new Error(`${key}: not an array of strings`);
        sec[msgid] = { output: 'pline', synopsis: false, choices: lines.length };
        lines.forEach((l, n) => messages.push([`${key}.${n + 1}`, convertLine(l)]));
        continue;
      }
      if (typeof text !== 'string') throw new Error(`${key}.text is not a string`);
      const how = msg.fields['output'];
      let synopsis = msg.fields['synopsis'];
      if (synopsis !== undefined && typeof synopsis !== 'string')
        throw new Error(`${key}.synopsis is not a string`);
      let output: QuestOutput;
      if (how === undefined || how === 'default') {
        output = 'pline';
        if (text.includes('\n') || text.length >= BUFSZ - 1) {
          output = 'text';
          synopsis ??= `[${text.slice(0, BUFSZ - 1 - 2)}]`.replaceAll('\n', ' ');
        }
      } else if (how === 'pline') output = 'pline';
      else if (how === 'text' || how === 'window') output = 'text';
      else if (how === 'menu') output = 'menu';
      else throw new Error(`${key}: unknown output ${String(how)}`);
      const info: QuestTextInfo = { output, synopsis: synopsis !== undefined };
      const plines = output === 'pline' ? text.split('\n') : [text];
      if (plines.length > 1) {
        info.lines = plines.length;
        plines.forEach((l, n) => messages.push([`${key}.${n + 1}`, convertLine(l)]));
      } else messages.push([key, convertText(text)]);
      if (synopsis !== undefined) messages.push([`${key}.synopsis`, convertText(synopsis)]);
      sec[msgid] = info;
    }
  }
  return { texts, fallbacks, messages };
}

const HEADER = [
  '// Generated by `pnpm convert:quest` from vendor/nethack/dat/quest.lua: do not edit by hand',
  '// (docs/CONVERTER.md "Quest texts"). ref: dat/quest.lua (NetHack 5.0; NetHack may be freely',
  '// redistributed under the NetHack General Public License, as this port is)',
];

const str = (s: string): string => JSON.stringify(s);

/** packages/content/src/questtxt.ts */
export function emitQuestTxt(c: QuestConversion): string {
  const out = [
    ...HEADER,
    '',
    "/** How a quest message is delivered. ref: src/questpgr.c com_pager_core() 'output' */",
    "export type QuestOutput = 'pline' | 'text' | 'menu';",
    '',
    '/**',
    ' * One quest message: `quest.<section>.<msgid>` (or `.1` .. `.n` for its `lines`, each a pline,',
    ' * or its `choices`, one drawn), and `.synopsis` when `synopsis`.',
    ' */',
    'export interface QuestText {',
    '  output: QuestOutput;',
    '  synopsis: boolean;',
    '  lines?: number;',
    '  choices?: number;',
    '}',
    '',
    '/** Section (`common` or the lowercased role file code) -> msgid -> message. */',
    'export const QUEST_TEXT: Readonly<Record<string, Readonly<Record<string, QuestText>>>> = {',
  ];
  for (const [section, msgs] of Object.entries(c.texts)) {
    out.push(`  ${section}: {`);
    for (const [msgid, m] of Object.entries(msgs)) {
      const parts = [`output: '${m.output}'`, `synopsis: ${m.synopsis}`];
      if (m.lines !== undefined) parts.push(`lines: ${m.lines}`);
      if (m.choices !== undefined) parts.push(`choices: ${m.choices}`);
      out.push(`    ${msgid}: { ${parts.join(', ')} },`);
    }
    out.push('  },');
  }
  out.push('};', '');
  out.push(
    '/** A message a section lacks is looked up under another. ref: questtext.msg_fallbacks */',
  );
  out.push('export const QUEST_FALLBACKS: Readonly<Record<string, string>> = {');
  for (const [k, v] of Object.entries(c.fallbacks)) out.push(`  ${k}: '${v}',`);
  out.push('};', '');
  return out.join('\n');
}

/** packages/content/src/quest.en.ts */
export function emitQuestEn(c: QuestConversion): string {
  const out = [
    ...HEADER,
    '//',
    "// questpgr.c's `%` codes are params: {qp} her name, {qc} her role, {qr}/{qR} her rank and the",
    '// rank of level 14, {qs}/{qS} sister or brother, daughter or son, {ql} the leader, {qi} the',
    '// intermediate goal, {qo}/{qO} the artifact and its short name, {qn} the nemesis, {qg} the',
    '// guardians, {qG} god or goddess, {qH} the home base, {qa}/{qA} her original and current',
    '// alignment, {qd}/{qD} her god and the lawful one, {qx} see or sense; {qd_he}, {ql_him},',
    '// {qn_his}, ... the pronouns (content questpgr.ts questParams()).',
    'export const questMessagesEn: Record<string, string> = {',
  ];
  for (const [k, v] of c.messages) out.push(`  ${str(k)}: ${str(v)},`);
  out.push('};', '');
  return out.join('\n');
}
