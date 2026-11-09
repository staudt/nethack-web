// Were creatures changing form and summoning help. The state (u.ulycn, the form tables, the def
// swap) is in werestate.ts; the hero's own change into a beast (you_were(), polymon()) is 7f.
// ref: src/were.c were_change(), new_were(), were_summon(); src/mhitu.c summonmu() (the were
// half); src/weapon.c possibly_unwield()
import {
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type MonsterSound,
  type Msg,
} from '@nh/core';
import { monBreakArmor } from './breakarm';
import { bypassObj } from './bypass';
import { makemon } from './generation';
import { placeOnFloor } from './items';
import { isFleeing } from './monflee';
import { monWep, setMonFlag } from './mongear';
import { setWereChange, unfreezeMonst } from './mstate';
import { wakeNearto } from './noise';
import { doname } from './objnam';
import { monNam } from './perception';
import { P, heroHas } from './props';
import { cansee, canseemon } from './trap';
import { counterWere, isHumanForm, isWere, setMonData } from './werestate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: src/hacklib.c night(): there is no clock (see DEVIATIONS.md "No clock") */
const night = (): boolean => false;
/** ref: flags.moonphase == FULL_MOON: never (no clock) */
const fullMoon = (): boolean => false;

/**
 * A monster whose new form has no weapon attack drops its wielded weapon ("The wererat drops a
 * long sword."); one that still has one looks for its best weapon again.
 * `polyspot`: the zap that polymorphed it does not hit the dropped weapon.
 * ref: src/weapon.c possibly_unwield() (no water or lava under it: flooreffects() is moot)
 */
export function possiblyUnwield(ctx: Ctx, mon: Entity, polyspot = false): void {
  const mw = monWep(ctx, mon.id);
  if (!mw) return;
  const def = ctx.defs.monster(mon.def);
  if (!def.attacks.some((a) => a.at === 'weapon')) {
    const p = mon.c.pos;
    if (mw.c.item) mw.c.item.equipped = null; // setmnotwielded()
    setMonFlag(ctx, 'nowep', mon.id, true); // NO_WEAPON_WANTED
    if (p && cansee(ctx, p.level, p.x, p.y))
      say(ctx, 'were.drops', { mon: monNam(ctx, mon), item: doname(ctx.state, ctx.defs, mw) });
    if (polyspot) bypassObj(mw.id); // not hit by the zap that polymorphed it
    if (p) placeOnFloor(ctx, mw.id, p.level, p.x, p.y);
    return;
  }
  // NEED_WEAPON unless a welded weapon made it give up
  if (!(mw.c.item?.buc === 'cursed')) setMonFlag(ctx, 'nowep', mon.id, false);
}

/**
 * The were creature changes form: "The wererat changes into a rat." (or "into a human") when
 * seen; a helpless one wakes and can move again, it regains a quarter of its lost hit points and a
 * beast drops its weapon. ref: src/were.c new_were() (no Protection_from_shape_changers: no such
 * ring; the monflee() for a scary square is not ported, as onscary())
 */
export function newWere(ctx: Ctx, mon: Entity): void {
  const pm = counterWere(mon.def);
  if (pm === null || !ctx.defs.isMonster(pm)) return; // impossible("unknown lycanthrope")
  const def = ctx.defs.monster(pm);
  if (canseemon(ctx, mon) && !heroHas(ctx.state, P.HALLUC))
    say(ctx, 'were.changes', {
      mon: monNam(ctx, mon),
      // pmname()+4: skip past "were" prefix
      into: isHumanForm(def) ? '@were.human' : `@were.beast.${pm}`,
    });
  setMonData(mon, def);
  const m = mon.c.monster;
  if (m) {
    // transformation wakens and/or revitalizes
    m.asleep = false;
    unfreezeMonst(ctx, mon.id);
  }
  // regenerate by 1/4 of the lost hit points
  const hp = mon.c.hp;
  if (hp) hp.cur = Math.min(hp.cur + Math.trunc((hp.max - hp.cur) / 4), hp.max);
  monBreakArmor(ctx, mon, false);
  possiblyUnwield(ctx, mon);
}

/**
 * Once a turn a were creature may change form: a human one 1 time in 50 (no moon, no night), and
 * "You hear a jackal howling at the moon." if the hero does not see it; a beast changes back 1
 * time in 30. ref: src/were.c were_change(), called from src/mon.c m_calcdistress()
 */
export function wereChange(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  if (!isWere(def)) return;
  if (isHumanForm(def)) {
    if (!ctx.rng.rn2(night() ? (fullMoon() ? 3 : 30) : fullMoon() ? 10 : 50)) {
      newWere(ctx, mon); // change into animal form
      const howler =
        mon.def === 'nh:werewolf' ? 'wolf' : mon.def === 'nh:werejackal' ? 'jackal' : null;
      // (the hero is never Deaf)
      if (howler && !canseemon(ctx, mon)) {
        say(ctx, 'were.howling', { howler: `@were.howler.${howler}` });
        const p = mon.c.pos;
        if (p) wakeNearto(ctx, p.x, p.y, 4 * 4);
      }
    }
  } else if (!ctx.rng.rn2(30)) {
    newWere(ctx, mon); // change back into human form
  }
}

/** ref: src/were.c were_summon(): the helpers of each lycanthrope */
function summonType(ctx: Ctx, pm: string): DefId | null {
  switch (pm) {
    case 'nh:wererat':
    case 'nh:human_wererat':
      return (
        ctx.rng.rn2(3) ? 'nh:sewer_rat' : ctx.rng.rn2(3) ? 'nh:giant_rat' : 'nh:rabid_rat'
      ) as DefId;
    case 'nh:werejackal':
    case 'nh:human_werejackal':
      return (ctx.rng.rn2(7) ? 'nh:jackal' : ctx.rng.rn2(3) ? 'nh:coyote' : 'nh:fox') as DefId;
    case 'nh:werewolf':
    case 'nh:human_werewolf':
      return (ctx.rng.rn2(5) ? 'nh:wolf' : ctx.rng.rn2(2) ? 'nh:warg' : 'nh:winter_wolf') as DefId;
    default:
      return null;
  }
}

/** The generic name of a lycanthrope's helpers ("rat", "jackal", "wolf"). */
const helperWord = (pm: string): string =>
  pm.endsWith('rat') ? 'rat' : pm.endsWith('jackal') ? 'jackal' : 'wolf';

/**
 * A were creature summons 1 to 5 of its animals next to the hero; returns how many came and how
 * many the hero sees. A type missing from the roster (the winter wolf) does not come, but its
 * roll is made. `yours` (the polymorphed hero's #monster) is called with each one made, which
 * tames it (monability.ts). ref: src/were.c were_summon()
 */
export function wereSummon(
  ctx: Ctx,
  pm: string,
  yours?: (ctx: Ctx, id: EntityId) => void,
): { total: number; visible: number } {
  let total = 0;
  let visible = 0;
  const at = getPlayer(ctx.state).c.pos;
  for (let i = ctx.rng.rnd(5); i > 0; i--) {
    const typ = summonType(ctx, pm);
    if (typ === null || !at || !ctx.defs.isMonster(typ)) continue;
    const id = makemon(ctx, ctx.defs.monster(typ), at, { adjacentOk: true });
    const mtmp = id === null ? undefined : ctx.state.entities[String(id)];
    if (mtmp) {
      total++;
      if (canseemon(ctx, mtmp)) visible++;
      if (yours) yours(ctx, mtmp.id); // tamedog(mtmp, NULL, FALSE)
    }
  }
  return { total, visible };
}

/** ref: src/sounds.c growl_sound(), plural ("Something growls!") */
function growlSound(sound: MonsterSound | undefined): string {
  switch (sound) {
    case 'mew':
    case 'hiss':
      return 'hisses';
    case 'bark':
    case 'growl':
      return 'growls';
    case 'roar':
      return 'roars';
    case 'bellow':
      return 'bellows';
    case 'buzz':
      return 'buzzes';
    case 'squeak':
      return 'squeals';
    case 'sqawk':
      return 'screeches';
    case 'neigh':
      return 'neighs';
    case 'groan':
      return 'groans';
    case 'moo':
      return 'lows';
    case 'silent':
    case undefined:
      return 'commotions';
    default:
      return 'screams';
  }
}

/**
 * A were creature about to attack the hero (next to her, not cancelled) may change form (a human
 * one 1 time in 5, a beast back 1 time in 30) and 1 time in 10 summons help: "The wererat summons
 * help!", "You feel hemmed in." when none of it is in view, "But none comes."; unseen,
 * "Something squeals!" and "A rat appears!". Returns true when the change made it start fleeing
 * (the attack stops). ref: src/mhitu.c summonmu() (the were half; demons do not summon here) and
 * mattacku()'s `if (mtmp->mflee && !already_fleeing) return 0;`
 */
export function summonWereMu(ctx: Ctx, mon: Entity, youseeit: boolean): boolean {
  const alreadyFleeing = isFleeing(ctx, mon.id);
  const def = ctx.defs.monster(mon.def);
  if (isHumanForm(def)) {
    // maybe switch to animal form
    if (!ctx.rng.rn2(5 - (night() ? 1 : 0) * 2)) newWere(ctx, mon);
  } else if (!ctx.rng.rn2(30)) newWere(ctx, mon); // maybe switch back to human form
  // maybe summon compatible critters
  if (!ctx.rng.rn2(10)) {
    const generic = helperWord(mon.def);
    if (youseeit) say(ctx, 'were.summons_help', { mon: monNam(ctx, mon) });
    const { total, visible } = wereSummon(ctx, mon.def);
    if (youseeit) {
      if (total > 0) {
        if (visible === 0) say(ctx, 'were.hemmed_in');
      } else say(ctx, 'were.none_comes');
    } else {
      say(ctx, 'were.something_sound', {
        sound: `@were.sound.${growlSound(ctx.defs.monster(mon.def).sound)}`,
      });
      if (total > 0) {
        if (visible < 1) say(ctx, 'were.hemmed_in');
        else if (visible === 1) say(ctx, 'were.appears', { what: `@were.helper.${generic}` });
        else say(ctx, `were.appear.${generic}`);
      }
    }
  }
  return isFleeing(ctx, mon.id) && !alreadyFleeing;
}

setWereChange(wereChange);
