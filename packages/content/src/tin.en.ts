// English text for tins, the tin opener, the tinning kit and the horn of plenty.
// ref: src/eat.c start_tin(), opentin(), consume_tin(), use_tin_opener(); src/apply.c
// use_tinning_kit(); src/mkobj.c hornoplenty(); src/allmain.c stop_occupation()
import { MONSTERS } from './monsters';

/** "cockatrice" from 'nh:cockatrice' */
const plain = (id: string): string => id.replace(/^[^:]*:/, '').replace(/_/g, ' ');

const killers: Record<string, string> = {};
for (const m of MONSTERS)
  killers[`killer.ston.tinning.${m.id}`] =
    `trying to tin ${/^[aeiou]/.test(plain(m.id)) ? 'an' : 'a'} ${plain(m.id)} corpse without gloves`;

export const tinMessagesEn: Record<string, string> = {
  ...killers,
  'action.nh:opentin': 'Open the tin',

  // opening. ref: src/eat.c start_tin(), opentin()
  'tin.bite_metal': 'You bite right into the metal tin...',
  'tin.cannot_handle': 'You cannot handle the tin properly to open it.',
  'tin.like_magic': 'The tin opens like magic!',
  'tin.seems_easy': 'The tin seems easy to open.',
  'tin.easily': 'You easily open the tin.',
  'tin.using': 'Using your {item} you try to open the tin.',
  'tin.not_easy': 'It is not so easy to open this tin.',
  'tin.succeed': 'You succeed in opening the tin.',
  'tin.give_up': 'You give up your attempt to open the tin.',
  'tin.stop': 'You stop opening the tin.',

  // what is inside. ref: src/eat.c consume_tin()
  'tin.full_of_souffle': "It's full of air elemental souffle.",
  'tin.full_of_water': "It's full of dehydrated water.",
  'tin.empty': 'It turns out to be empty.',
  'tin.smells': 'It smells like {mon|plural}.',
  'tin.smells.as_is': 'It smells like {mon}.',
  'tin.smells.the': 'It smells like {mon|the}.',
  'tin.smells.chicken': 'It smells like chicken.',
  'tin.eat_it': 'Eat it?',
  'tin.discard': 'You discard the open tin.',
  'tin.consume': 'You consume {variety} {mon}.',
  'tin.greasy': 'Eating {variety} food made your {fingers} very slippery.',
  'tin.fingers': 'fingers',
  'tin.gloves': 'gloves',
  'tin.gauntlets': 'gauntlets',
  'tin.decaying': 'It contains some decaying {color} substance.',
  'tin.decaying_blind': 'It contains some decaying substance.',
  'tin.spinach': 'It contains spinach.',
  'tin.feel_like': 'This makes you feel like {who}!',
  'tin.who.sweepea': "Swee'pea",
  'tin.who.popeye': 'Popeye',
  'tin.who.olive_oyl': 'Olive Oyl',
  'tin.who.bluto': 'Bluto',

  // the tin opener. ref: src/eat.c use_tin_opener()
  'tin.no_tin': 'You have no tin to open.',
  'tin.what_to_open': 'What do you want to open?',

  // the tinning kit. ref: src/apply.c use_tinning_kit(); src/eat.c floorfood()
  'tin.out_of_tins': 'You seem to be out of tins.',
  'tin.nothing_to_tin': "You don't have anything to tin.",
  'tin.what_to_tin': 'What do you want to tin?',
  'tin.here_option': '{item} (here)',
  'tin.cant_tin': "You can't tin that!",
  'tin.partly_eaten': 'You cannot tin something which is partly eaten.',
  'tin.tin_without_gloves': 'You tin {mon|an} corpse without wearing gloves.',
  'tin.fatal_mistake': 'Tinning {mon|an} corpse without wearing gloves is a fatal mistake...',
  'tin.insubstantial': "That's too insubstantial to tin.",
  'tin.bought': '"You tin it, you bought it!"',
  'tin.cannot_pick_up': 'You make, but cannot pick up, {item}.',

  // the horn of plenty. ref: src/mkobj.c hornoplenty()
  'horn.nothing_happens': 'Nothing happens.',
  'horn.spill.food': 'Some food spills out.',
  'horn.spill.potion': 'A potion spills out.',
  'horn.spill.potions': 'Some potions spill out.',
  'horn.oops.floor': 'Oops!  {item|The} slips to the floor!',
  'horn.oops.floor.plural': 'Oops!  {item|The} slip to the floor!',
  'horn.oops.away': 'Oops!  {item|The} slips away from you!',
  'horn.oops.away.plural': 'Oops!  {item|The} slip away from you!',
  'horn.oops.reach': 'Oops!  {item|The} slips out of your reach!',
  'horn.oops.reach.plural': 'Oops!  {item|The} slip out of your reach!',
};
