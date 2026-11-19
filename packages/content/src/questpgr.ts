// The quest pager: the generated quest texts (questtxt.ts, quest.en.ts: `pnpm convert:quest`)
// delivered as NetHack's com_pager_core() does, with questpgr.c's `%` substitutions as message
// params. Below quest.ts (the rules); it never imports it.
// ref: src/questpgr.c convert_arg(), qtext_pronoun(), ldrname(), neminame(), guardname(),
// homebase(), intermed(), find_quest_artifact(), com_pager_core(), com_pager(), qt_pager()
import {
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Level,
  type Msg,
  type Params,
} from '@nh/core';
import { alignStr } from './align';
import { artifactRow } from './artilist';
import { isQuestArtifact, questArtifactId } from './artistate';
import { rankOf } from './botl';
import { heroFemale } from './gender';
import { alignGname, alignGtitle } from './gods';
import { uState, ualignBase } from './luck';
import { P, hasProp } from './props';
import { questGender, questRole } from './questmon';
import { MIN_QUEST_LEVEL } from './questtab';
import { QUEST_FALLBACKS, QUEST_TEXT, type QuestText } from './questtxt';
import { roleNameKey } from './roletab';
import { urole } from './urole';

/** ref: src/gender.c genders[] he/him/his (0 male, 1 female, 2 neuter) */
type Pronouns = readonly [string, string, string];
const GENDERS: readonly [Pronouns, Pronouns, Pronouns] = [
  ['@pronoun.he', '@pronoun.him', '@pronoun.his'],
  ['@pronoun.she', '@pronoun.her', '@pronoun.her'],
  ['@pronoun.it', '@pronoun.it', '@pronoun.its'],
];
/** An artifact with a plural name ("the Eyes of the Overworld"). ref: qtext_pronoun() */
const PLURAL: Pronouns = ['@pronoun.they', '@pronoun.them', '@pronoun.their'];

/** `{qX_he}`, `{qX_him}`, `{qX_his}` of one subject. */
const pronouns = (p: Params, who: string, g: Pronouns): void => {
  p[`q${who}_he`] = g[0];
  p[`q${who}_him`] = g[1];
  p[`q${who}_his`] = g[2];
};

/**
 * A monster row's name as ldrname() and neminame() give it: "the " + its name, unless it is a
 * personal name (M2_PNAME: a proper name, "Lord Surtur").
 */
function theName(ctx: Pick<Ctx, 'defs'>, id: DefId): string | Msg {
  const def = ctx.defs.monster(id);
  return def.flags.includes('pname')
    ? `=@${def.nameKey}`
    : { key: 'quest.the', params: { name: `@${def.nameKey}` } };
}

/**
 * The quest texts' params, one per `%` code of convert_arg() (`qp` for `%p`, ...) and the
 * pronouns of `%d`, `%l`, `%n`, `%o` (qtext_pronoun()). Her name is her role's (the port has no
 * player name, DEVIATIONS, as shk.ts plname()); the artifact's names are its row's English, as
 * objnam.ts names artifacts. ref: src/questpgr.c convert_arg(), qtext_pronoun()
 */
export function questParams(ctx: Pick<Ctx, 'state' | 'defs'>): Params {
  const { state } = ctx;
  const role = urole(state);
  const q = questRole(state);
  const female = heroFemale(state);
  const base = ualignBase(state);
  const ulevel = getPlayer(state).c.experience?.level ?? 1;
  // the(artiname()): every quest artifact's name starts with "The"
  const arti = artifactRow(questArtifactId(state)).name.replace(/^the /i, 'the ');
  const of = arti.indexOf(' of ');
  const p: Params = {
    qp: `@${roleNameKey(role, female)}`,
    qc: `@${roleNameKey(role, female)}`,
    qr: `@${rankOf(state, ulevel, female)}`,
    qR: `@${rankOf(state, MIN_QUEST_LEVEL, female)}`,
    qs: female ? '@quest.sister' : '@quest.brother',
    qS: female ? '@quest.daughter' : '@quest.son',
    ql: theName(ctx, q.leader),
    qi: `@${q.intermed}`,
    qo: `=${arti}`,
    // shorten "the Foo of Bar" to "the Foo"
    qO: `=${of >= 0 ? arti.slice(0, of) : arti}`,
    qn: theName(ctx, q.nemesis),
    qg: `@${ctx.defs.monster(q.guardian).nameKey}`,
    qG: alignGtitle(state, base),
    qH: `@${q.home}`,
    qa: alignStr(base),
    qA: alignStr(uState(state).alignType),
    qd: alignGname(state, base),
    qD: alignGname(state, 1),
    qx: hasProp(getPlayer(state), P.BLINDED) ? '@quest.sense' : '@quest.see',
  };
  // svq.quest_status.godgend: role_init()'s `!strcmpi(align_gtitle(alignmnt), "goddess")`
  pronouns(p, 'd', GENDERS[alignGtitle(state, base) === '@align.goddess' ? 1 : 0]);
  pronouns(p, 'l', GENDERS[questGender(ctx, 'leader')]);
  pronouns(p, 'n', GENDERS[questGender(ctx, 'nemesis')]);
  // all artifacts neuter; a plural name ("Eyes ") takes they/them/their
  pronouns(p, 'o', arti.includes('Eyes ') ? PLURAL : GENDERS[2]);
  return p;
}

/** The section's message, else its fallback msgid's. ref: com_pager_core() msg_fallbacks */
function lookup(section: string, msgid: string): { msgid: string; text: QuestText } | null {
  const sec = QUEST_TEXT[section];
  const own = sec?.[msgid];
  if (own) return { msgid, text: own };
  const fb = QUEST_FALLBACKS[msgid];
  const alt = fb !== undefined ? sec?.[fb] : undefined;
  return fb !== undefined && alt ? { msgid: fb, text: alt } : null;
}

/**
 * Delivers one quest message of `section`: a pline per line (a list of lines draws one,
 * `rn2(n) + 1`), or a text window (a `list` event with the text as its one item) followed by its
 * synopsis in the message log. False when the section has no such message.
 * ref: src/questpgr.c com_pager_core(), deliver_by_pline(), deliver_by_window()
 */
function comPagerCore(ctx: Ctx, section: string, msgid: string): boolean {
  const found = lookup(section, msgid);
  if (!found) return false;
  const { text } = found;
  const key = `quest.${section}.${found.msgid}`;
  const params = questParams(ctx);
  const msg = (k: string): void => ctx.emit({ type: 'msg', key: k, params });
  if (text.choices !== undefined) msg(`${key}.${ctx.rng.rn2(text.choices) + 1}`);
  else if (text.output === 'pline') {
    if (text.lines === undefined) msg(key);
    else for (let n = 1; n <= text.lines; n++) msg(`${key}.${n}`);
  } else ctx.emit({ type: 'list', titleKey: 'quest.title', items: [{ key, params }] });
  // "bypass message delivery but be available for ^P recall": the port's log
  if (text.synopsis) msg(`${key}.synopsis`);
  return true;
}

/** A common quest message. ref: src/questpgr.c com_pager() */
export function comPager(ctx: Ctx, msgid: string): void {
  comPagerCore(ctx, 'common', msgid);
}

/** Her role's quest message, else the common one. ref: src/questpgr.c qt_pager() */
export function qtPager(ctx: Ctx, msgid: string): void {
  if (!comPagerCore(ctx, questRole(ctx.state).filecode.toLowerCase(), msgid))
    comPagerCore(ctx, 'common', msgid);
}

/** Where find_quest_artifact() looks: the floor of the level, its monsters' inventories. */
export type QuestArtiChain = 'invent' | 'floor' | 'minvent';

/**
 * Her quest artifact on `level` in the chosen chains (inside containers too), or null. Buried
 * objects do not exist in the port and migrating ones are not looked at.
 * ref: src/questpgr.c find_quest_artifact(), find_qarti()
 */
export function findQuestArtifact(
  state: Readonly<GameState>,
  level: Readonly<Level>,
  chains: readonly QuestArtiChain[],
): Entity | null {
  const outer = (e: Entity): Entity => {
    let cur = e;
    for (let n = 0; n < 100 && cur.c.item?.containedIn !== undefined; n++) {
      const up = state.entities[String(cur.c.item.containedIn)];
      if (!up) break;
      cur = up;
    }
    return cur;
  };
  const found: Partial<Record<QuestArtiChain, Entity>> = {};
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    if (!e || !isQuestArtifact(state, e)) continue;
    const top = outer(e);
    const holder = top.c.item?.carriedBy;
    let chain: QuestArtiChain | null = null;
    if (holder === null || holder === undefined) {
      if (top.c.pos?.level === level.id) chain = 'floor';
    } else if (holder === state.playerId) chain = 'invent';
    else if (state.entities[String(holder)]?.c.pos?.level === level.id) chain = 'minvent';
    if (chain && !found[chain]) found[chain] = e;
  }
  // find_quest_artifact()'s order: inventory, floor, monsters
  for (const c of ['invent', 'floor', 'minvent'] as const)
    if (chains.includes(c) && found[c]) return found[c] ?? null;
  return null;
}
