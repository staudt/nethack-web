// Intrinsics from eating corpses. ref: src/eat.c cpostfx(), corpse_intrinsic(), should_givit(),
// temp_givit(), givit(), intrinsic_possible()
import { getPlayer, type Ctx, type MonsterDef } from '@nh/core';
import { gainstr } from './attrib';
import {
  P,
  hasIntrinsic,
  hasProp,
  incrItimeout,
  makeHallucinated,
  makeConfused,
  makeStunned,
  setIntrinsic,
  timeoutLeft,
} from './props';
import { pluslvl } from './hero';
import { counterWere, setUlycn } from './werestate';
import { pwOf, setPw } from './uenergy';

/** ref: include/mondata.h telepathic(): the floating eye and the mind flayers */
const telepathic = (def: MonsterDef): boolean =>
  def.id === 'nh:floating_eye' || def.id === 'nh:mind_flayer' || def.id === 'nh:master_mind_flayer';

/** A resistance the corpse conveys (`mconveys`, the MR_ name in `MonsterDef.conveys`). */
const conveys =
  (mr: string) =>
  (def: MonsterDef): boolean =>
    def.conveys.includes(mr);

/**
 * The conveyable properties in include/prop.h order (corpse_intrinsic() scans them in that
 * order) and the test for each. ref: src/eat.c intrinsic_possible()
 */
const CONVEYED: readonly { prop: string; possible: (def: MonsterDef) => boolean }[] = [
  { prop: P.FIRE_RES, possible: conveys('fire') },
  { prop: P.COLD_RES, possible: conveys('cold') },
  { prop: P.SLEEP_RES, possible: conveys('sleep') },
  { prop: P.DISINT_RES, possible: conveys('disint') },
  { prop: P.SHOCK_RES, possible: conveys('elec') },
  { prop: P.POISON_RES, possible: conveys('poison') },
  { prop: P.ACID_RES, possible: conveys('acid') },
  { prop: P.STONE_RES, possible: conveys('stone') },
  { prop: P.TELEPAT, possible: telepathic },
  // can_teleport(), control_teleport(): M1_TPORT, M1_TPORT_CNTRL
  { prop: P.TELEPORT, possible: (def) => def.flags.includes('tport') },
  { prop: P.TELEPORT_CONTROL, possible: (def) => def.flags.includes('tport_cntrl') },
];

/** ref: src/eat.c intrinsic_possible() */
function intrinsicPossible(prop: string, def: MonsterDef): boolean {
  return CONVEYED.find((x) => x.prop === prop)?.possible(def) ?? false;
}

/** The property to try to give, 'str' for a giant's strength, or null. ref: src/eat.c corpse_intrinsic() */
export function corpseIntrinsic(ctx: Ctx, def: MonsterDef): string | null {
  // ref: include/mondata.h is_giant()
  const conveysStr = def.flags.includes('giant');
  let count = 0;
  let prop: string | null = null;
  if (conveysStr) {
    count = 1;
    prop = 'str';
  }
  for (const c of CONVEYED) {
    if (!intrinsicPossible(c.prop, def)) continue;
    ++count;
    // a 1 in count chance of replacing the old choice with this one
    if (ctx.rng.rn2(count) === 0) prop = c.prop;
  }
  // if strength is the only candidate, give it 50% chance
  if (conveysStr && count === 1 && ctx.rng.rn2(2) === 0) prop = null;
  return prop;
}

/** ref: src/eat.c should_givit(): the chance depends on the monster's level and the property */
export function shouldGivit(ctx: Ctx, prop: string, def: MonsterDef): boolean {
  let chance: number;
  switch (prop) {
    case P.POISON_RES:
      chance =
        (def.id === 'nh:killer_bee' || def.id === 'nh:scorpion') && ctx.rng.rn2(4) === 0 ? 1 : 15;
      break;
    case P.TELEPORT:
      chance = 10;
      break;
    case P.TELEPORT_CONTROL:
      chance = 12;
      break;
    case P.TELEPAT:
      chance = 1;
      break;
    default:
      chance = 15;
      break;
  }
  return def.level > ctx.rng.rn2(chance);
}

/** ref: src/eat.c temp_givit(): stoning and acid resistance can come for a while */
function tempGivit(ctx: Ctx, prop: string, def: MonsterDef): boolean {
  const chance = prop === P.STONE_RES ? 6 : prop === P.ACID_RES ? 3 : 0;
  return chance ? def.level > ctx.rng.rn2(chance) : false;
}

const GIVIT_MESSAGES: Record<string, string> = {
  [P.FIRE_RES]: 'givit.fire',
  [P.SLEEP_RES]: 'givit.sleep',
  [P.COLD_RES]: 'givit.cold',
  [P.DISINT_RES]: 'givit.disint',
  [P.SHOCK_RES]: 'givit.shock',
  [P.TELEPORT]: 'givit.teleport',
  [P.TELEPORT_CONTROL]: 'givit.teleport_control',
  [P.TELEPAT]: 'givit.telepat',
};

/** The messages that have their own wording while hallucinating (`<key>.halluc`). */
const HALLU_WORDING = new Set([
  'givit.fire',
  'givit.disint',
  'givit.shock',
  'givit.telepat',
  'givit.teleport',
  'givit.teleport_control',
  'givit.acid',
  'givit.stone',
]);

/** Tries to give the hero a property. ref: src/eat.c givit() */
export function givit(ctx: Ctx, prop: string, def: MonsterDef): void {
  if (!shouldGivit(ctx, prop, def) && !tempGivit(ctx, prop, def)) return;
  const hero = getPlayer(ctx.state);
  const say = (key: string): void =>
    ctx.emit({
      type: 'msg',
      key: hasProp(hero, P.HALLUC) && HALLU_WORDING.has(key) ? `${key}.halluc` : key,
    });
  switch (prop) {
    case P.ACID_RES:
    case P.STONE_RES:
      // timed resistance
      if (!hasProp(hero, prop)) say(prop === P.ACID_RES ? 'givit.acid' : 'givit.stone');
      incrItimeout(ctx.state, hero, prop, ctx.rng.d(3, 6));
      break;
    case P.POISON_RES:
      if (!hasIntrinsic(hero, prop)) {
        say(hasProp(hero, prop) ? 'givit.poison_more' : 'givit.poison');
        setIntrinsic(hero, prop, true);
      }
      break;
    default: {
      const key = GIVIT_MESSAGES[prop];
      if (key && !hasIntrinsic(hero, prop)) {
        say(key);
        setIntrinsic(hero, prop, true);
      }
      break;
    }
  }
}

/**
 * The effects of finishing a corpse of `def`. ref: src/eat.c cpostfx(). Ported: bats and lights
 * stun, the quantum mechanic toggles intrinsic speed, then a chance at an intrinsic. Not ported
 * (no systems for them): mimicking, shapeshifters, displacer beast, disenchanter, the nurse and
 * the stalker's invisibility. The wraith gives a level (pluslvl(FALSE)), a human-form were
 * creature its lycanthropy (set_ulycn(); the beast forms leave no corpse).
 */
export function cpostfxOf(ctx: Ctx, def: MonsterDef): void {
  const hero = getPlayer(ctx.state);
  if (def.id === 'nh:quantum_mechanic') {
    // `HFast & INTRINSIC` (from outside or from experience) is taken away, else given; the timed
    // part (a wand or potion of speed) stays. No intrinsic check after it.
    ctx.emit({ type: 'msg', key: 'givit.qm_velocity' });
    if (hasIntrinsic(hero, P.FAST)) {
      setIntrinsic(hero, P.FAST, false);
      ctx.emit({ type: 'msg', key: 'givit.qm_slower' });
    } else {
      setIntrinsic(hero, P.FAST, true);
      ctx.emit({ type: 'msg', key: 'givit.qm_faster' });
    }
    return;
  }
  // the wraith's level, and lycanthropy from a were creature's human-form corpse; these
  // `break` without checking for an intrinsic
  if (def.id === 'nh:wraith') {
    pluslvl(ctx, hero.id, false);
    return;
  }
  const catchLycanthropy = counterWere(def.id);
  if (catchLycanthropy !== null && def.flags.includes('were') && def.flags.includes('human')) {
    setUlycn(ctx, catchLycanthropy);
    return; // retouch_equipment(2): no silver items
  }
  let stuns = 0;
  switch (def.id) {
    case 'nh:stalker':
      stuns = 3;
      break;
    case 'nh:yellow_light':
    case 'nh:giant_bat':
      stuns = 2;
      break;
    case 'nh:bat':
      stuns = 1;
      break;
    default:
      break;
  }
  // ref: cpostfx() PM_LIZARD: stun and confusion drop to 2 turns (then check intrinsics)
  if (def.id === 'nh:lizard') {
    if (timeoutLeft(ctx.state, hero, P.STUNNED) > 2) makeStunned(ctx, 2, false);
    if (timeoutLeft(ctx.state, hero, P.CONFUSION) > 2) makeConfused(ctx, 2, false);
  }
  if (stuns > 0) {
    for (let i = 0; i < stuns; i++)
      makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + 30, false);
    return; // these cases `break` without checking for an intrinsic
  }
  // possibly convey an intrinsic; stunning and hallucinogenic monsters first make her trip
  if (
    def.id === 'nh:violet_fungus' ||
    def.attacks.some((a) => a.ad === 'stun' || a.ad === 'halu')
  ) {
    ctx.emit({ type: 'msg', key: 'givit.great_stuff' });
    makeHallucinated(ctx, timeoutLeft(ctx.state, hero, P.HALLUC) + 200, false);
  }
  // Eating magical monsters can give you some magical energy.
  if (def.id === 'nh:newt' || def.attacks.some((a) => a.at === 'magic')) eyeOfNewtBuzz(ctx);
  const prop = corpseIntrinsic(ctx, def);
  if (prop === 'str') gainstr(ctx, 0);
  else if (prop !== null) givit(ctx, prop, def);
}

/**
 * "Eye of newt" may give a small magical energy boost: `rnd(3)` Pw, and when that overflows the
 * maximum, one time in three the maximum goes up by 1. ref: src/eat.c eye_of_newt_buzz()
 */
export function eyeOfNewtBuzz(ctx: Ctx): void {
  const pw = pwOf(ctx.state);
  if (!(ctx.rng.rn2(3) || 3 * pw.uen <= 2 * pw.uenmax)) return;
  let { uen, uenmax, uenpeak } = pw;
  uen += ctx.rng.rnd(3);
  if (uen > uenmax) {
    if (!ctx.rng.rn2(3)) {
      uenmax++;
      if (uenmax > uenpeak) uenpeak = uenmax;
    }
    uen = uenmax;
  }
  if (uen === pw.uen) return;
  setPw(ctx, { uen, uenmax, uenpeak });
  ctx.emit({ type: 'msg', key: 'givit.mild_buzz' });
}
