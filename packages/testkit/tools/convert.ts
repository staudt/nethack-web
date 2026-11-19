/**
 * Prints content defs for NetHack monsters or objects, converted from vendor/nethack/include.
 *
 *   pnpm convert:monsters "giant ant" KILLER_BEE nh:soldier_ant
 *   pnpm convert:objects "elven mithril-coat" RIN_ADORNMENT
 *   pnpm convert:monsters --json newt      (the parsed C row instead of TypeScript)
 *   pnpm convert:objects --list            (every name the table has)
 *   pnpm convert:quest                     (writes content's questtxt.ts and quest.en.ts
 *                                           from vendor/nethack/dat/quest.lua)
 *
 * Node only (run with `node`, which strips the types); never imported by core or content.
 * See docs/CONVERTER.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VENDOR_HEADER_FILES,
  parseMonsters,
  parseObjects,
  type VendorHeaders,
} from '../src/convert/cdata.ts';
import { emitMonsters, emitObjects } from '../src/convert/emit.ts';
import { convertQuestLua, emitQuestEn, emitQuestTxt } from '../src/convert/questlua.ts';

if (process.argv[2] === 'quest') {
  const lua = readFileSync(
    new URL('../../../vendor/nethack/dat/quest.lua', import.meta.url),
    'utf8',
  );
  const c = convertQuestLua(lua);
  const content = new URL('../../content/src/', import.meta.url);
  writeFileSync(new URL('questtxt.ts', content), emitQuestTxt(c));
  writeFileSync(new URL('quest.en.ts', content), emitQuestEn(c));
  console.log(`questtxt.ts and quest.en.ts written: ${c.messages.length} messages`);
  process.exit(0);
}

const include = fileURLToPath(new URL('../../../vendor/nethack/include/', import.meta.url));
const headers = Object.fromEntries(
  VENDOR_HEADER_FILES.map((f) => [f, readFileSync(include + f, 'utf8')]),
) as unknown as VendorHeaders;

const [kind, ...rest] = process.argv.slice(2);
const json = rest.includes('--json');
const names = rest.filter((a) => !a.startsWith('--'));

if (kind !== 'monsters' && kind !== 'objects') {
  console.error('usage: convert.ts monsters|objects [--json|--list] <names...> | quest');
  process.exit(2);
}

if (kind === 'monsters') {
  const all = parseMonsters(headers);
  if (rest.includes('--list')) {
    for (const m of all) console.log(`${m.enumName}\t${m.names?.male ?? m.name}`);
  } else if (json) {
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    console.log(
      JSON.stringify(
        all.filter((m) => wanted.has(m.name.toLowerCase()) || wanted.has(m.enumName.toLowerCase())),
        null,
        2,
      ),
    );
  } else report(emitMonsters(all, names));
} else {
  const all = parseObjects(headers);
  if (rest.includes('--list')) {
    for (const o of all.slice(18)) console.log(`${o.enumName}\t${o.cls}\t${o.name ?? ''}`);
  } else if (json) {
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    console.log(
      JSON.stringify(
        all.filter(
          (o) => wanted.has((o.name ?? '').toLowerCase()) || wanted.has(o.enumName.toLowerCase()),
        ),
        null,
        2,
      ),
    );
  } else report(emitObjects(all, names));
}

function report(e: { defs: string; messages: string; colors: string[]; missing: string[] }): void {
  console.log(`// ---- defs (palette constants used: ${e.colors.join(', ')}) ----`);
  console.log(e.defs);
  console.log('// ---- messages ----');
  console.log(e.messages);
  if (e.missing.length > 0) {
    console.error(`not found: ${e.missing.join(', ')}`);
    process.exitCode = 1;
  }
}
