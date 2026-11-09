// English text for eggs and #sit. ref: src/timeout.c hatch_egg(), src/uhitm.c
// hmon_hitmon_misc_obj() EGG, src/dothrow.c breakmsg(), src/eat.c fprefx() EGG, src/sit.c dosit(),
// lay_an_egg()
import { MONSTERS } from './monsters';

/** "cockatrice" from 'nh:cockatrice': the catalog names are the ids spelled out. */
const plain = (id: string): string => id.replace(/^[^:]*:/, '').replace(/_/g, ' ');

/** fpostfx() EGG's killer, read after "killed by a/an" (KILLED_BY_AN "cockatrice egg"). */
const killers: Record<string, string> = {};
for (const m of MONSTERS)
  if (m.flags.includes('oviparous')) killers[`egg.killer.${m.id}`] = `${plain(m.id)} egg`;

export const eggMessagesEn: Record<string, string> = {
  ...killers,

  // hatching. ref: src/timeout.c hatch_egg()
  'egg.who.one': '{mon|an}',
  'egg.who.some': 'some {mon|plural}',
  'egg.hatch.pack_feel': 'You feel something {verb} from your pack!',
  'egg.hatch.pack_see': 'You see {who} {verb} out of your pack!',
  'egg.hatch.floor': 'You see {who} hatch.',
  'egg.hatch.minvent': "You see {who} {verb} out of {by|an}'s pack!",
  'egg.hatch.thin_air': 'You see {who} {verb} out of thin air!',
  'egg.cry.one': 'Its {cry} {sounds} like "{parent}{p}"',
  'egg.cry.some': 'Their {cry} {sounds} like "{parent}{p}"',
  'egg.sounds': 'sounds',
  'egg.seems': 'seems',
  'egg.mommy': 'mommy',
  'egg.daddy': 'daddy',
  'egg.gleep': '"Gleep!"',
  'egg.loco.drop': 'drop',
  'egg.loco.float': 'float',
  'egg.loco.fly': 'fly',
  'egg.loco.slither': 'slither',
  'egg.loco.ooze': 'ooze',
  'egg.loco.wiggle': 'wiggle',
  'egg.loco.crawl': 'crawl',
  'egg.crying.chitter': 'chittering',
  'egg.crying.gurgle': 'gurgling',
  'egg.crying.hiss': 'hissing',
  'egg.crying.growl': 'growling',
  'egg.crying.chirp': 'chirping',
  'egg.crying.buzz': 'buzzing',
  'egg.crying.grunt': 'grunting',
  'egg.crying.mumble': 'mumbling',

  // hitting and breaking. ref: src/uhitm.c hmon_hitmon_misc_obj() EGG, src/dothrow.c breakmsg()
  'egg.splat': 'Splat!',
  'egg.splat_petrify': 'Splat!  You hit {mon|the} with {eggs}!',
  'egg.hit_with': 'You hit {mon|the} with {eggs}.',
  'egg.a_petrifying': 'a petrifying egg',
  'egg.some_petrifying': 'some petrifying eggs',
  'egg.an': 'an egg',
  'egg.some': 'some eggs',
  'egg.the_mon': 'the {mon} egg',
  'egg.the_mon.plural': 'the {mon} eggs',
  'egg.not_alive': "The egg isn't alive any more...",
  'egg.not_alive.plural': "The eggs aren't alive any more...",

  // eating. ref: src/eat.c fprefx() EGG
  'egg.rotten': 'Ugh.  Rotten egg.',

  // #sit. ref: src/sit.c dosit(), lay_an_egg()
  'action.nh:sit': 'Sit',
  'sit.no_seats': 'There are no seats in here!',
  'sit.tumble': 'You tumble in place.',
  'sit.on_air': 'You are sitting on air.',
  'sit.no_lap_offer': "{mon|The} won't offer {his} lap.",
  'sit.no_lap': '{mon|The} has no lap.',
  'sit.coil_hoard': 'You coil up around your hoard.',
  'sit.coil_hoard_meager': 'You coil up around your meager hoard.',
  'sit.coil_obj': 'You coil up around {item|the}.',
  'sit.on_obj': 'You sit on {item|the}.',
  'sit.squishy': "It's squishy...",
  'sit.uncomfortable': "It's not very comfortable...",
  'sit.bear_trap': "You can't sit down with your foot in the bear trap.",
  'sit.spike': 'You sit down on a spike.  Ouch!',
  'killer.sitting_spike': 'sitting on an iron spike',
  'sit.in_pit': 'You sit down in the pit.',
  'sit.web': 'You sit in the spider web and get entangled further!',
  'sit.land': 'You land.',
  'sit.sit_down': 'You sit down.',
  'sit.on': 'You sit on the {what}.',
  'sit.wet_rump': 'Your rump gets wet.',
  'sit.wet_underside': 'Your underside gets wet.',
  'sit.having_fun': 'Having fun sitting on the {surface}?',
  'sit.males_cant': "Males can't lay eggs!",
  'sit.no_energy': "You don't have enough energy to lay an egg.",
  'sit.splash_tetra': 'A splash tetra you are not.',
  'sit.lay_egg': 'You lay an egg.',
};
