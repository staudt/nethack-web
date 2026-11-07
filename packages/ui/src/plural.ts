// English plurals for the `{param|plural}` modifier (monster names in the vanquished list).
// ref: src/objnam.c makeplural(), singplur_lookup(), singplur_compound(), badman()
// Not ported: pronouns ("it" -> "them"), the "pair of" skip, single letters ("x's"), the
// "matzoh" and "ya" special cases and ch_ksound(): words the game's names never use.

/** Word pairs the formulas get wrong. ref: one_off[] */
const ONE_OFF: readonly (readonly [string, string])[] = [
  ['child', 'children'],
  ['cubus', 'cubi'],
  ['culus', 'culi'],
  ['Cyclops', 'Cyclopes'],
  ['djinni', 'djinn'],
  ['erinys', 'erinyes'],
  ['foot', 'feet'],
  ['fungus', 'fungi'],
  ['goose', 'geese'],
  ['knife', 'knives'],
  ['labrum', 'labra'],
  ['louse', 'lice'],
  ['mouse', 'mice'],
  ['mumak', 'mumakil'],
  ['nemesis', 'nemeses'],
  ['ovum', 'ova'],
  ['ox', 'oxen'],
  ['passerby', 'passersby'],
  ['rtex', 'rtices'],
  ['serum', 'sera'],
  ['staff', 'staves'],
  ['tooth', 'teeth'],
];

/** Spelled the same in the plural, or already plural. ref: as_is[], already_plural[] */
const AS_IS: readonly string[] = [
  'boots', 'shoes', 'gloves', 'lenses', 'scales', 'eyes', 'gauntlets', 'iron bars',
  'bison', 'deer', 'elk', 'fish', 'fowl', 'tuna', 'yaki', '-hai', 'krill', 'manes',
  'moose', 'ninja', 'sheep', 'ronin', 'roshi', 'shito', 'tengu', 'ki-rin', 'Nazgul',
  'gunyoki', 'piranha', 'samurai', 'shuriken', 'haggis', 'Bordeaux',
  'ae', 'eaux', 'matzot',
]; // prettier-ignore

/** Prefixes of "-man" words that take "-mans". ref: badman() no_men[] */
const NO_MEN: readonly string[] = [
  'albu', 'antihu', 'anti', 'ata', 'auto', 'bildungsro', 'cai', 'cay', 'ceru', 'corner',
  'decu', 'des', 'dura', 'fir', 'hanu', 'het', 'infrahu', 'inhu', 'nonhu', 'otto', 'out',
  'prehu', 'protohu', 'subhu', 'superhu', 'talis', 'unhu', 'sha', 'hu', 'un', 'le', 're',
  'so', 'to', 'at', 'a',
]; // prettier-ignore

const COMPOUNDS: readonly string[] = [
  ' of ', ' labeled ', ' called ', ' named ', ' above', ' versus ', ' from ', ' in ', ' on ',
  ' a la ', ' with', ' de ', " d'", ' du ', ' au ', '-in-', '-at-',
]; // prettier-ignore

const VOWELS = 'aeiou';

const endsWith = (s: string, suffix: string): boolean =>
  s.toLowerCase().endsWith(suffix.toLowerCase());

/** "-man" words that are not "-men" (human, shaman, ...). ref: badman(str, TRUE) */
function badman(s: string): boolean {
  if (s.length < 4) return false;
  const lower = s.toLowerCase();
  return NO_MEN.some((p) => {
    const at = lower.length - (p.length + 3);
    return at >= 0 && lower.startsWith(p, at) && (at === 0 || lower.charAt(at - 1) === ' ');
  });
}

/** Keeps the case of the replaced text's first letter for the new suffix. ref: Strcasecpy() */
const swap = (s: string, cut: number, add: string): string => {
  const was = s.charAt(s.length - cut);
  const upper = cut > 0 && was !== was.toLowerCase();
  return s.slice(0, s.length - cut) + (upper ? add.toUpperCase() : add);
};

/** The singular/plural table lookups; null when no rule there applies. ref: singplur_lookup() */
function lookup(s: string): string | null {
  if (AS_IS.some((w) => endsWith(s, w))) return s;
  if (s.length > 5 && endsWith(s, 'craft')) return s;
  const lower = s.toLowerCase();
  if (lower === 'slice' || lower === 'mongoose') return `${s}s`;
  if (s.length > 2 && endsWith(s, 'ox') && !(s.length > 5 && endsWith(s, 'muskox')))
    return `${s}es`; // "fox" -> "foxes"
  if (s.length > 2 && endsWith(s, 'man') && badman(s)) return `${s}s`;
  for (const [sing, plur] of ONE_OFF) {
    if (endsWith(s, plur)) return s;
    if (endsWith(s, sing)) return s.slice(0, s.length - sing.length) + plur;
  }
  return null;
}

/** The English plural of a name. ref: src/objnam.c makeplural() */
export function makeplural(name: string): string {
  const str = name.trimStart();
  if (!str) return 's';
  // "foo of bar": pluralize "foo"
  const lowerAll = str.toLowerCase();
  let cut = -1;
  for (let i = 0; i < str.length && cut < 0; i++)
    if (' -'.includes(str.charAt(i)) && COMPOUNDS.some((c) => lowerAll.startsWith(c, i))) cut = i;
  const excess = cut >= 0 ? str.slice(cut) : '';
  const s = (cut >= 0 ? str.slice(0, cut) : str).trimEnd();
  return pluralWord(s) + excess;
}

function pluralWord(s: string): string {
  const len = s.length;
  const last = s.charAt(len - 1).toLowerCase();
  if (len === 1 || !/[a-z]/.test(last)) return `${s}'s`;
  const table = lookup(s);
  if (table !== null) return table;
  if (len >= 3 && endsWith(s, 'man') && !badman(s)) return swap(s, 2, 'en');
  if (last === 'f') {
    const prev = s.charAt(len - 2).toLowerCase();
    if (!(len >= 3 && endsWith(s, 'erf')) && ('lr'.includes(prev) || VOWELS.includes(prev)))
      return swap(s, 1, 'ves');
  }
  if (len >= 3 && endsWith(s, 'ium')) return swap(s, 3, 'ia');
  if (['alga', 'hypha', 'larva', 'amoeba', 'vertebra'].some((w) => endsWith(s, w))) return `${s}e`;
  if (len > 3 && endsWith(s, 'us') && !endsWith(s, 'lotus') && !endsWith(s, 'wumpus'))
    return swap(s, 2, 'i');
  if (len >= 3 && endsWith(s, 'sis')) return swap(s, 2, 'es');
  if (len >= 3 && endsWith(s, 'eau') && !endsWith(s, 'bureau')) return `${s}x`;
  if (len >= 5 && ['dex', 'dix', 'tex'].some((w) => endsWith(s, w)) && !endsWith(s, 'index'))
    return swap(s, 2, 'ices');
  if (
    'zxs'.includes(last) ||
    (len >= 2 && last === 'h' && 'cs'.includes(s.charAt(len - 2).toLowerCase())) ||
    (len >= 4 && endsWith(s, 'ato')) ||
    (len >= 5 && endsWith(s, 'dingo'))
  )
    return `${s}es`;
  if (last === 'y' && !VOWELS.includes(s.charAt(len - 2).toLowerCase())) return swap(s, 1, 'ies');
  return `${s}s`;
}
