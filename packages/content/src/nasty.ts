// Summon nasties: a spellcaster's high mage spell brings nasty monsters around the spot it thinks
// the hero is at (in Gehennom 1 time in 10 it gates in demons instead). A leaf over makemon, so
// that mcastu.ts can call it; the Wizard's clone too. ref: src/wizard.c nasty(), pick_nasty(),
// nasties[], clonewiz()
//
// Kinds absent from the monster table (the vampire lord, the master mind flayer, the dragons...)
// count as genocided: pick_nasty() tries their smaller kind, then makemon() fails and a random
// monster stands in, as for a genocided kind in C. No Rogue level, no endgame, no post-Wizard
// harassment (a summoner is always given).
import {
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type MonsterDef,
  type Pos,
} from '@nh/core';
import { bigToLittle } from './eggstate';
import { makemon, mnextoPos } from './generation';
import { inHell } from './levelflags';
import { monsterCensus, msummon } from './minion';
import { mongone } from './mondeath';
import { setMspecUsed } from './mstate';
import { isGenocided } from './vanquished';
import { mksobj } from './items';
import { setMappearance } from './mimicstate';
import { WIZARD_OF_YENDOR } from './wizstate';

/** ref: src/wizard.c nasties[] (neutral, chaotic, lawful) */
const NASTIES: readonly DefId[] = [
  // neutral
  'nh:cockatrice',
  'nh:ettin',
  'nh:stalker',
  'nh:minotaur',
  'nh:owlbear',
  'nh:purple_worm',
  'nh:xan',
  'nh:umber_hulk',
  'nh:xorn',
  'nh:zruty',
  'nh:leocrotta',
  'nh:baluchitherium',
  'nh:carnivorous_ape',
  'nh:fire_elemental',
  'nh:jabberwock',
  'nh:iron_golem',
  'nh:ochre_jelly',
  'nh:green_slime',
  'nh:displacer_beast',
  'nh:genetic_engineer',
  // chaotic
  'nh:black_dragon',
  'nh:red_dragon',
  'nh:arch_lich',
  'nh:vampire_lord',
  'nh:master_mind_flayer',
  'nh:disenchanter',
  'nh:winged_gargoyle',
  'nh:storm_giant',
  'nh:olog_hai',
  'nh:elf_lord',
  'nh:elvenking',
  'nh:ogre_king',
  'nh:captain',
  'nh:gremlin',
  // lawful
  'nh:silver_dragon',
  'nh:orange_dragon',
  'nh:green_dragon',
  'nh:yellow_dragon',
  'nh:guardian_naga',
  'nh:fire_giant',
  'nh:aleax',
  'nh:couatl',
  'nh:horned_devil',
  'nh:barbed_devil',
];

/**
 * The class of the nasties[] Angels this port lacks (no other absent one is a spellcaster or
 * an Angel or demon, the only things nasty()'s picking loop looks at). ref: include/monsters.h
 */
const ABSENT_ANGELS: readonly DefId[] = ['nh:aleax', 'nh:couatl'];

/** more than this can be created */
const MAXNASTIES = 10;

/** min(mons[PM_ARCHON].difficulty, mons[PM_ARCH_LICH].difficulty): the Archon's 26 (C's table) */
const ARCH_DIFCAP = 26;

type NastyCtx = Pick<Ctx, 'state' | 'defs' | 'rng'>;

/** Genocided, or absent from this port's monster table. */
const gone = (ctx: NastyCtx, pm: DefId): boolean =>
  !ctx.defs.isMonster(pm) || isGenocided(ctx.state, pm);

const castsSpells = (def: MonsterDef): boolean => def.attacks.some((a) => a.at === 'magic');

/**
 * A nasty kind: one of nasties[], or its smaller kind (not a baby, hatchling, pup or cub) when it
 * is gone, at least `difcap` difficult (when non-zero) or out of place (Gehennom-only outside it,
 * never-in-Gehennom inside). ref: src/wizard.c pick_nasty() (no Rogue level)
 */
export function pickNasty(ctx: NastyCtx, difcap: number): DefId {
  const res = NASTIES[ctx.rng.rn2(NASTIES.length)] as DefId;
  let alt = res;
  const def = ctx.defs.isMonster(res) ? ctx.defs.monster(res) : null;
  if (
    !def ||
    gone(ctx, res) ||
    (difcap > 0 && def.difficulty >= difcap) ||
    def.genFlags.includes(inHell(ctx.state) ? 'nohell' : 'hell')
  )
    alt = bigToLittle(ctx.defs, res);
  if (alt !== res && !gone(ctx, alt)) {
    // only non-juveniles can become alternate choice
    const n = alt.slice(3);
    if (!n.startsWith('baby_') && !/_(hatchling|pup|cub)$/.test(n)) return alt;
  }
  return res;
}

/**
 * Nasty monsters around the spot `summoner` thinks the hero is at (`ap`): rnd(ulevel / 3) rounds
 * of up to 20 picks each, never a spellcaster as difficult as the summoner nor an Angel for a
 * demon (or the reverse), each hostile and awake with its spells delayed by rnd(4); a round ends
 * with a kind of no alignment or of the summoner's alignment's sign. In Gehennom 1 time in 10 it
 * summons demons as the Wizard of Yendor does. Returns how many monsters more are on the level.
 * ref: src/wizard.c nasty()
 */
export function nasty(ctx: Ctx, summoner: Entity, ap: Pos): number {
  const census = monsterCensus(ctx);
  const level = getLevel(ctx.state);
  let count = 0;
  if (!ctx.rng.rn2(10) && inHell(ctx.state)) {
    // this might summon a demon prince or lord
    count = msummon(ctx, null); // summons like WoY
  } else {
    const sdef = ctx.defs.monster(summoner.def);
    const sCls = sdef.glyph.ch;
    let difcap = sdef.difficulty; // spellcasters
    const castalign = Math.sign(sdef.alignment);
    const ulevel = ctx.state.entities[String(ctx.state.playerId)]?.c.experience?.level ?? 1;
    let tmp = ulevel > 3 ? Math.trunc(ulevel / 3) : 1;
    const clash = (cls: string): boolean =>
      (sCls === '&' && cls === 'A') || (sCls === 'A' && cls === '&');
    for (let i = ctx.rng.rnd(tmp); i > 0 && count < MAXNASTIES; --i) {
      for (let j = 0; j < 20; j++) {
        // Don't create more spellcasters of the monster's level or higher--avoids chain
        // summoners filling up the level.
        let trylimit = 10 + 1; // 10 tries
        let makeindex: DefId | null = null;
        for (;;) {
          if (!--trylimit) break;
          makeindex = pickNasty(ctx, difcap);
          const md = ctx.defs.isMonster(makeindex) ? ctx.defs.monster(makeindex) : null;
          const mCls = md ? md.glyph.ch : ABSENT_ANGELS.includes(makeindex) ? 'A' : '';
          const caster = md !== null && difcap > 0 && md.difficulty >= difcap && castsSpells(md);
          if (!caster && !clash(mCls)) break;
        }
        if (!trylimit || makeindex === null) continue; // nextj
        // do this after picking the monster to place
        const mdef = ctx.defs.isMonster(makeindex) ? ctx.defs.monster(makeindex) : null;
        const bypos = mnextoPos(ctx, level, null, ap, mdef);
        if (!bypos) continue;
        // this honors genocide but overrides extinction; it ignores inside-hell-only (G_HELL) &
        // outside-hell-only (G_NOHELL)
        let id = mdef && !gone(ctx, makeindex) ? makemon(ctx, mdef, bypos) : null;
        let mtmp = id === null ? undefined : ctx.state.entities[String(id)];
        if (mtmp?.c.monster) {
          mtmp.c.monster.asleep = false;
          mtmp.c.monster.peaceful = false;
          delete mtmp.c.monster.tame;
        } else {
          // random monster to substitute for geno'd selection; unlike direct choice, not forced
          // to be hostile [why?]; limit spellcasters to inhibit chain summoning
          id = makemon(ctx, null, bypos);
          mtmp = id === null ? undefined : ctx.state.entities[String(id)];
          if (mtmp && id !== null) {
            const d = ctx.defs.monster(mtmp.def);
            if (
              (difcap > 0 && d.difficulty >= difcap && ctx.rng.rn2(7) && castsSpells(d)) ||
              clash(d.glyph.ch)
            ) {
              mongone(ctx, id); // unmakemon()
              mtmp = undefined;
            }
          }
        }
        if (mtmp) {
          // if creating an arch-lich or Archon, further directly selected nasties will have to
          // be less difficult, and substitutes for geno victims will usually be less
          if (mtmp.def === 'nh:arch_lich' || mtmp.def === 'nh:archon') {
            tmp = ARCH_DIFCAP;
            if (!difcap || difcap > tmp) difcap = tmp; // rest must be lower difficulty
          }
          // delay first use of spell or breath attack
          setMspecUsed(ctx, mtmp.id, ctx.rng.rnd(4));
          const al = ctx.defs.monster(mtmp.def).alignment;
          if (++count >= MAXNASTIES || al === 0 || Math.sign(al) === castalign) break;
        }
      }
    }
  }
  if (count) count = monsterCensus(ctx) - census;
  return count;
}

/** ref: include/objects.h FAKE_AMULET_OF_YENDOR */
const FAKE_AMULET: DefId = 'nh:fake_amulet_of_yendor';

/**
 * The kinds the Wizard's clone may pose as. ref: src/wizard.c wizapp[] (no vampires until m18:
 * that roll leaves the clone undisguised)
 */
const WIZAPP: readonly DefId[] = [
  'nh:human',
  'nh:water_demon',
  'nh:vampire',
  'nh:red_dragon',
  'nh:troll',
  'nh:umber_hulk',
  'nh:xorn',
  'nh:xan',
  'nh:cockatrice',
  'nh:floating_eye',
  'nh:guardian_naga',
  'nh:trapper',
];

/**
 * "Double Trouble": a second Wizard of Yendor next to the hero, awake and hostile, half the time
 * carrying a cheap plastic imitation of the Amulet (she never has the real one), posing as one
 * of wizapp[] (no protection from shape changers here). The caller casts it only while there is
 * one Wizard. ref: src/wizard.c clonewiz()
 */
export function clonewiz(ctx: Ctx): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return;
  const id = makemon(ctx, ctx.defs.monster(WIZARD_OF_YENDOR), hp, {
    adjacentOk: true,
    noWait: true,
  });
  const m = id === null ? undefined : ctx.state.entities[String(id)]?.c.monster;
  if (id === null || !m) return;
  m.asleep = false;
  m.peaceful = false;
  delete m.tame;
  if (ctx.rng.rn2(2)) {
    // give clone a fake
    mksobj(ctx, ctx.defs.object(FAKE_AMULET), { carriedBy: id });
  }
  const app = WIZAPP[ctx.rng.rn2(WIZAPP.length)];
  if (app !== undefined && ctx.defs.isMonster(app))
    setMappearance(ctx, id, { type: 'monster', id: app });
}
