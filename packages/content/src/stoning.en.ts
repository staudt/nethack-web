// English text for petrification. ref: src/timeout.c stoned_texts[]; src/uhitm.c mhitm_ad_ston(),
// do_stone_mon(), hmon_hitmon_misc_obj(); src/trap.c instapetrify(), minstapetrify(); src/mon.c
// monstone(); src/worn.c mon_adjust_speed(); src/eat.c fix_petrification(), cprefx(); src/pray.c
// fix_worst_trouble(); src/pickup.c fatal_corpse_mistake(); src/wield.c cant_wield_corpse();
// src/dothrow.c throw_obj(); src/dokick.c really_kick_object(); src/mhitu.c gazemu() AD_STON;
// src/end.c done_in_by(); src/insight.c (enlightenment)
export const stoningMessagesEn: Record<string, string> = {
  // stoned_dialogue()
  'stone.dialogue.0': 'You are slowing down.',
  'stone.dialogue.1': 'Your limbs are stiffening.',
  'stone.dialogue.2': 'Your limbs have turned to stone.',
  'stone.dialogue.3': 'You have turned to stone.',
  'stone.dialogue.4': 'You are a statue.',
  'helpless.stoned': 'getting stoned',
  'stone.limber': 'You feel limber!',
  'stone.ruined_art': 'What a pity--you just ruined a future piece of art!',
  'stone.ruined_fine_art': 'What a pity--you just ruined a future piece of fine art!',
  'stone.more_limber': 'You feel more limber.',
  'stone.you_turn': 'You turn to stone...',
  'stone.you_turn_eat': 'You turn to stone.',
  // the hiss
  'stone.cough': 'You hear a cough from {mon|the}!',
  'stone.hear_hissing': 'You hear hissing.',
  'stone.blowing_kiss': '{mon|The} appears to be blowing you a kiss...',
  'stone.hissing': 'You hear {mon|the_s} hissing!',
  // monsters
  'stone.mon_turns': '{mon|The} turns to stone.',
  'stone.mon_turns_x': '{mon|The} turns to stone!',
  'stone.mon_slowing': '{mon|The} is slowing down.',
  'stone.peculiarly_sad': 'You have a peculiarly sad feeling for a moment, then it passes.',
  'stone.jump_out': 'You jump through an opening in the new {obj}.',
  // cockatrice corpses
  'stone.hit_with': 'You hit {mon|the} with {item|the}.',
  'stone.fatal_mistake': 'Touching {item|an} is a fatal mistake.',
  'stone.wield_bare': 'You wield {item|the} in your bare hands.',
  'stone.throw_bare': 'You throw {item|the} with your bare hands.',
  'stone.kick_bare': 'You kick {item|the} with your bare feet.',
  // Medusa's gaze
  'stone.meet_gaze': 'You meet {mon|the_s} gaze.',
  'stone.gazes_ineffectually': '{mon|The} gazes ineffectually.',
  'stone.not_ugly': "{mon|The} doesn't look all that ugly.",
  'stone.serpent_cut': 'Someone seems overdue for a serpent cut.',
  'stone.gaze_not_noticed': "{mon|The} doesn't seem to notice that her gaze was reflected.",
  'stone.is_turned': '{mon|The} is turned to stone!',
  // the death reasons ("petrified by ...")
  'killer.petrification': 'petrification',
  'killer.ston.medusa': 'Medusa',
  'killer.ston.corpse.nh:cockatrice': 'a cockatrice corpse',
  'killer.ston.corpse.nh:chickatrice': 'a chickatrice corpse',
  'killer.ston.wielding.nh:cockatrice': 'wielding a cockatrice corpse bare-handed',
  'killer.ston.wielding.nh:chickatrice': 'wielding a chickatrice corpse bare-handed',
  'killer.ston.throwing.nh:cockatrice': 'throwing a cockatrice corpse bare-handed',
  'killer.ston.throwing.nh:chickatrice': 'throwing a chickatrice corpse bare-handed',
  'killer.ston.kicking.nh:cockatrice': 'kicking a cockatrice corpse barefoot',
  'killer.ston.kicking.nh:chickatrice': 'kicking a chickatrice corpse barefoot',
  'killer.ston.tasting.nh:cockatrice': 'tasting cockatrice meat',
  'killer.ston.tasting.nh:chickatrice': 'tasting chickatrice meat',
  'killer.ston.tasting.nh:medusa': 'tasting Medusa meat',
  'enl.turning_to_stone': 'turning to stone',
  // statues: "statue of a newt", "statue of the Oracle", an Archeologist's "historic statue of
  // a gnome king" (xname()); break_statue(), the force bolt, digging and fighting one
  'nh:statue.of': '{historic}statue of {mon|an}',
  'nh:statue.of.plural': '{historic}statues of {mon|an}',
  'nh:statue.of.the': '{historic}statue of the {mon}',
  'nh:statue.of.the.plural': '{historic}statues of the {mon}',
  'nh:statue.historic': 'historic ',
  'statue.historic_guilt': 'You feel guilty about damaging such a historic statue.',
  'statue.shatters': 'The statue shatters.',
  'statue.crumbles': 'The {item} crumbles.',
  'statue.hear_crumbling': 'You hear stone crumbling.',
  'dig.target.statue': 'statue',
  'dig.act.chipping_statue': 'chipping the statue',
  'dig.cant_reach_statue': "You can't reach the statue.",
};
