// Enlightenment: the wand's "You feel self-knowledgeable..." and the list of what she is.
// ref: src/insight.c enlightenment() with MAGICENLIGHTENMENT and ENL_GAMEINPROGRESS (the
// Status and Attributes sections: status_enlightenment(), attributes_enlightenment());
// src/zap.c do_enlightenment_effect()
//
// Only what the port models is listed (see DEVIATIONS.md "Enlightenment"): no title with the
// hero's name (the window's title says "Your attributes:"), no weapon and skill insight, no
// spellcasting line, no "Miscellaneous" section (the elapsed real time would break
// determinism), no deaths counted ("You have been killed..."), and nothing for
// steeds, swallowing, being held, water,
// infravision, half damage or the other properties the port lacks.
// from_what() is wizard-mode only in C and is not ported.
import { isStoned } from './stonestate';
import { isSlimed } from './slimestate';
import { resistsDrliHero } from './exper';
import { ulycn } from './werestate';
import { heroFormId } from './upoly';
import { getPlayer, type Ctx, type Msg } from '@nh/core';
import { alignGname } from './align';
import {
  cantSeeSelf,
  heroInvisBlocked,
  heroInvisSource,
  heroInvisible,
  seeInvisible,
} from './invis';
import { carryingLuckstone, moreluck, stoneLuck } from './gem';
import { hungerData } from './hunger';
import { luckOf, uState } from './luck';
import { magicNegation } from './adtyping';
import { canSafelyPray } from './pray';
import {
  P,
  hasExtrinsic,
  hasIntrinsic,
  hasProp,
  heroClairvoyant,
  isStrangled,
  ringBonus,
  timeoutLeft,
} from './props';
import { ENCUMBRANCE_NAMES, UNENCUMBERED, nearCapacity } from './stats';
import { flying, levitating, utrap } from './trapstate';
import { heroHatesSilver } from './silver';

const ARMOR_SLOTS = ['body', 'cloak', 'shirt', 'helm', 'gloves', 'boots', 'shield'] as const;

/** ref: src/insight.c piousness() with showneg TRUE and suffix "aligned" */
function piousness(record: number): Msg {
  const pio =
    record >= 20
      ? 'piously'
      : record > 13
        ? 'devoutly'
        : record > 8
          ? 'fervently'
          : record > 3
            ? 'stridently'
            : record === 3
              ? 'plain'
              : record > 0
                ? 'haltingly'
                : record === 0
                  ? 'nominally'
                  : record >= -3
                    ? 'strayed'
                    : record >= -8
                      ? 'sinned'
                      : 'transgressed';
  return { key: `enl.pious.${pio}` };
}

/**
 * "a small bonus to hit", "a moderate damage bonus", "a large defense penalty"...
 * ref: src/insight.c enlght_combatinc() (the "(+n)" is final or wizard mode only)
 */
function combatinc(inctyp: 'to_hit' | 'damage' | 'defense', incamt: number): Msg {
  let absamt = Math.abs(incamt);
  // Protection amount is typically larger than damage or to-hit
  if (inctyp === 'defense') absamt = Math.trunc((absamt * 2) / 3);
  const modif = absamt <= 3 ? 'small' : absamt <= 6 ? 'moderate' : absamt <= 12 ? 'large' : 'huge';
  return {
    key: `enl.combat.${inctyp}.${incamt >= 0 ? 'bonus' : 'penalty'}`,
    params: { modif: `@enl.modif.${modif}` },
  };
}

/** Hunger status words. ref: src/eat.c hu_stat[], status_enlightenment() */
const HUNGER_WORDS: Readonly<Record<string, string>> = {
  satiated: 'satiated',
  not_hungry: 'not_hungry',
  hungry: 'hungry',
  weak: 'weak',
  fainting: 'fainting',
  fainted: 'fainted',
  starved: 'starved',
};

/** ref: status_enlightenment() encumbrance adverbs */
const ENC_ADJ = ['', 'slightly', 'moderately', 'very', 'extremely', 'not_possible'] as const;

/**
 * The lines of the enlightenment window, in C's order: Status (movement, troubles, hunger,
 * encumbrance, armor) and Attributes (alignment, resistances, senses, behaviour, transport,
 * physical attributes, Luck and prayer). ref: src/insight.c status_enlightenment(),
 * attributes_enlightenment()
 */
export function enlightenment(ctx: Ctx): Msg[] {
  const h = getPlayer(ctx.state);
  const out: Msg[] = [];
  const line = (key: string, params?: Msg['params']): void => {
    out.push(params ? { key, params } : { key });
  };
  const are = (what: string): void => line('enl.you_are', { what: `@enl.${what}` });
  const have = (what: string): void => line('enl.you_have', { what: `@enl.${what}` });
  const can = (what: string): void => line('enl.you_can', { what: `@enl.${what}` });
  const has = (prop: string): boolean => hasProp(h, prop);

  // ---- Status
  line('enl.status');
  if (levitating(ctx)) are('levitating');
  else if (flying(ctx)) are('flying'); // can only fly when not levitating
  if (isStoned(ctx.state)) are('turning_to_stone');
  if (isSlimed(ctx.state)) are('turning_into_slime');
  if (isStrangled(h)) are('strangled');
  const hd = hungerData(ctx);
  if (hd.sick) are('sick_food_poisoning');
  if (hd.vomiting > 0) are('nauseated');
  if (has(P.STUNNED)) are('stunned');
  if (has(P.CONFUSION)) are('confused');
  if (has(P.HALLUC)) are('hallucinating');
  if (has(P.BLINDED)) {
    // check the reasons in the same order as from_what()
    const how = hasIntrinsic(h, P.BLINDED)
      ? 'permanently'
      : hasExtrinsic(h, P.BLINDED) && timeoutLeft(ctx.state, h, P.BLINDED) === 0
        ? 'deliberately'
        : 'temporarily';
    are(`blind.${how}`);
  }
  if (utrap(ctx)) {
    // trap_predicament(): TT_BEARTRAP or TT_PIT
    const p = h.c.pos;
    const t = p ? ctx.state.levels[p.level]?.traps.find((r) => r.x === p.x && r.y === p.y) : null;
    if (t) line('enl.you_are', { what: { key: 'enl.trapped_in', params: { trap: `@${t.def}` } } });
    else are('trapped');
  }
  // Wounded_leg_side: legs.ts keeps the EWounded_legs side bits (1 left, 2 right)
  if (has(P.WOUNDED_LEGS)) {
    const sides = (ctx.state.modData['nh'] as { legSides?: number } | undefined)?.legSides ?? 2;
    have(sides === 3 ? 'wounded_legs' : sides === 1 ? 'wounded_left_leg' : 'wounded_right_leg');
  }
  if (has(P.FUMBLING)) line('enl.fumble');
  if (has(P.SLEEPY)) line('enl.sleepy');
  if (has(P.HUNGER)) line('enl.hunger_rapidly');
  // hunger status; "not hungry" too
  const uhs = h.c.hunger?.state;
  if (uhs) are(`hunger.${HUNGER_WORDS[uhs] ?? 'not_hungry'}`);
  // encumbrance
  const cap = nearCapacity(ctx.state, ctx.defs, h.id);
  if (cap > UNENCUMBERED)
    line('enl.encumbered', {
      enc: `@enl.enc.${ENCUMBRANCE_NAMES[cap] ?? 'overloaded'}`,
      adj: `@enl.enc_adj.${ENC_ADJ[cap] ?? 'not_possible'}`,
    });
  else are('unencumbered');
  // report 'nudity'
  const worn = (slot: string): boolean =>
    Object.values(ctx.state.entities).some(
      (o) => o.c.item?.carriedBy === h.id && o.c.item.equipped === slot,
    );
  if (!ARMOR_SLOTS.some(worn)) are('no_armor');

  // ---- Attributes
  line('enl.blank');
  line('enl.attributes');
  const u = uState(ctx.state);
  line(u.alignRecord >= 0 ? 'enl.you_are' : 'enl.you_have', {
    what: piousness(u.alignRecord),
  });
  // resistances to troubles
  if (has(P.ANTIMAGIC)) are('magic_protected');
  if (has(P.FIRE_RES)) are('fire_res');
  if (has(P.COLD_RES)) are('cold_res');
  if (has(P.SLEEP_RES)) are('sleep_res');
  if (has(P.DISINT_RES)) are('disint_res');
  if (has(P.SHOCK_RES)) are('shock_res');
  if (has(P.POISON_RES)) are('poison_res');
  const temp = (prop: string): boolean => timeoutLeft(ctx.state, h, prop) > 0;
  if (has(P.ACID_RES)) are(temp(P.ACID_RES) ? 'acid_res_temp' : 'acid_res');
  // Drain_resistance: the shield of drain resistance, a lycanthrope's (set_uasmon())
  if (has(P.DRAIN_RES) || resistsDrliHero(ctx)) are('drain_res');
  if (has(P.STONE_RES)) are(temp(P.STONE_RES) ? 'stone_res_temp' : 'stone_res');
  // vision and senses
  if (seeInvisible(ctx.state)) {
    if (!has(P.BLINDED)) line('enl.see_invisible');
    else if (!hasIntrinsic(h, P.BLINDED)) line('enl.see_invisible_unblind');
    else line('enl.see_invisible_perm');
  }
  if (has(P.TELEPAT)) are('telepathic');
  if (has(P.WARNING)) are('warned');
  if (has(P.SEARCHING)) have('searching');
  if (heroClairvoyant(ctx.state)) are('clairvoyant');
  else if (has(P.CLAIRVOYANT)) line('enl.could_be_clairvoyant'); // blocked by a cornuthaum
  if (has(P.INFRAVISION)) have('infravision');
  // appearance and behavior
  if (has(P.ADORNED)) {
    const adorn = ringBonus(ctx.state, 'nh:ring_of_adornment');
    are(adorn > 0 ? 'charismatic_more' : adorn < 0 ? 'charismatic_less' : 'charismatic');
  }
  if (cantSeeSelf(ctx.state)) are('invisible');
  else if (heroInvisible(ctx.state)) are('invisible_to_others');
  // ordinarily "visible" is redundant; a special case when invisibility would be expected
  else if (heroInvisSource(ctx.state) && heroInvisBlocked(ctx.state)) are('visible');
  if (has(P.DISPLACED)) are('displaced');
  if (has(P.STEALTH)) are('stealthy');
  if (has(P.AGGRAVATE_MONSTER)) line('enl.aggravate');
  if (has(P.CONFLICT)) line('enl.conflict');
  // transportation
  if (has(P.JUMPING)) can('jump');
  if (has(P.TELEPORT)) can('teleport');
  if (has(P.TELEPORT_CONTROL)) have('teleport_control');
  // levitation blocked by a bear trap (BLevitation's I_SPECIAL)
  if (has(P.LEVITATION) && !levitating(ctx)) line('enl.would_levitate');
  // flight blocked by levitation or by being trapped in the floor (BFlying)
  if (has(P.FLYING) && !flying(ctx))
    line(has(P.LEVITATION) ? 'enl.would_fly_lev' : 'enl.would_fly_trapped');
  if (has(P.MAGICAL_BREATHING)) can('breathless');
  // physical attributes
  if (has(P.REGENERATION)) line('enl.regenerate');
  if (has(P.SLOW_DIGESTION)) have('slow_digestion');
  const uhitinc = ringBonus(ctx.state, 'nh:ring_of_increase_accuracy');
  if (uhitinc) line('enl.you_have', { what: combatinc('to_hit', uhitinc) });
  const udaminc = ringBonus(ctx.state, 'nh:ring_of_increase_damage');
  if (udaminc) line('enl.you_have', { what: combatinc('damage', udaminc) });
  if (has(P.PROTECTION)) {
    let prot = ringBonus(ctx.state, 'nh:ring_of_protection');
    if (hasIntrinsic(h, P.PROTECTION)) prot += u.ublessed;
    if (prot) line('enl.you_have', { what: combatinc('defense', prot) });
  }
  // magic cancellation factor, conferred by worn armor
  const armpro = Math.min(magicNegation(ctx), 3);
  if (armpro > 0) are(`mc.${armpro}`);
  // movement and non-armor-based protection
  if (has(P.FAST))
    are(hasExtrinsic(h, P.FAST) || timeoutLeft(ctx.state, h, P.FAST) > 0 ? 'very_fast' : 'fast');
  if (has(P.REFLECTING)) have('reflection');
  if (has(P.FREE_ACTION)) have('free_action');
  if (has(P.FIXED_ABIL)) have('fixed_abil');
  if (has(P.LIFESAVED)) line('enl.lifesaved');
  // polymorph and other shape change (no protection from shape changers, no egg-laying forms,
  // no vampires; no wizard-mode timer)
  const lycn = ulycn(ctx.state);
  const form = heroFormId(ctx.state);
  if (has(P.UNCHANGING)) {
    if (form === null) can('unchanging'); // Upolyd handled below after current form
    // blocked shape changes
    if (has(P.POLYMORPH)) line('enl.would_polymorph');
    else if (lycn !== null) line('enl.would_change_shape');
  } else if (has(P.POLYMORPH)) are('polymorphing');
  if (has(P.POLYMORPH_CONTROL)) have('polymorph_control');
  // a foreign shape (the were form is handled below)
  if (form !== null && form !== lycn)
    line('enl.you_are', { what: { key: 'enl.polymorphed_into', params: { mon: `@${form}` } } });
  if (lycn !== null) {
    // "you are a werecreature [in beast form]"
    line('enl.you_are', {
      what: {
        key: form === lycn ? 'enl.lycanthrope_beast' : 'enl.lycanthrope',
        params: { mon: `@${lycn}` },
      },
    });
  }
  if (has(P.UNCHANGING) && form !== null) can('unchanging');
  if (heroHatesSilver(ctx)) are('hate_silver');
  // miscellany
  const luck = luckOf(ctx.state);
  if (luck) {
    const ltmp = Math.abs(luck);
    line('enl.you_are', {
      what: {
        key: luck < 0 ? 'enl.unlucky' : 'enl.lucky',
        params: { deg: `@enl.deg.${ltmp >= 10 ? 'extremely' : ltmp >= 5 ? 'very' : 'plain'}` },
      },
    });
  }
  const more = moreluck(ctx.state);
  if (more > 0) have('extra_luck');
  else if (more < 0) have('reduced_luck');
  if (carryingLuckstone(ctx.state) || stoneLuck(ctx.state, true)) {
    const lt = stoneLuck(ctx.state, false);
    if (lt <= 0) line('enl.bad_luck_stays');
    if (lt >= 0) line('enl.good_luck_stays');
  }
  if (u.ugangr) {
    line('enl.god_angry', {
      god: alignGname(u.alignType),
      deg: `@enl.deg.${u.ugangr > 6 ? 'extremely' : u.ugangr > 3 ? 'very' : 'plain'}`,
    });
  } else line(canSafelyPray(ctx) ? 'enl.can_pray' : 'enl.cant_pray');
  return out;
}

/**
 * "You feel self-knowledgeable...", the window, "The feeling subsides." (exercise() is not
 * ported). ref: src/zap.c do_enlightenment_effect()
 */
export function doEnlightenmentEffect(ctx: Ctx): void {
  ctx.emit({ type: 'msg', key: 'enl.self_knowledgeable' });
  ctx.emit({ type: 'list', titleKey: 'enl.title', items: enlightenment(ctx) });
  ctx.emit({ type: 'msg', key: 'enl.subsides' });
}
