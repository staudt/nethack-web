import { describe } from 'vitest';
import { shapeshiftSoaks } from './helpers/shapeshift';

// The soak bot among shapeshifters: every few turns a vampire, vampire lord, chameleon or
// doppelganger is made near the hero while fewer than four shapeshifters live on her level, so the
// invariants are checked while they change form on their own, shift back when hurt, rise again
// when killed in another form, slip under doors as fog and follow her between levels. Every turn
// each `cham` entry (a shapeshifter's true kind) must name a living monster and a shapeshifter
// kind.
describe('shapeshifter soak', () => {
  // seeds whose runs reach turn 2000 (searched over 31..50 in m18 step 3: the others die, mostly
  // of rotten corpses the bot eats or of a doppelganger's nasty forms, despite the healing; 47
  // replaced 36 in m18 step 6, whose four Kop rows shift the random forms: 36 died at turn 1339
  // and reaches 2000 with the Kop rows filtered and the cream pie's prob 0, as 47 does with and
  // without them; 69 replaced 32 in m19 step 1, whose 17 object rows shift the stream: 32 died at
  // turn 387 and reaches 2000 with the rows filtered, as 47 and 69 do with and without them; the m19 step 3 djinni row moved the random forms
  // again: 47 and 69 then hit the in-wall bug lead (newcham inside a wall), and both pass with the
  // row filtered; 74 and 156 reach 2000 turns both ways; that bug lead, and 88's and 90's (a
  // monster in a wall or a locked door) and 48's two objects on stone at m18 step 6, were the
  // invariant's: the hero fainted, so one step spanned dozens of turns in which a xorn-form
  // chameleon entered a wall, or an ochre jelly a door, and changed form there, which C's
  // newcham() allows (no relocation: maybe_set_terrain_effects() only handles liquids), and the
  // hero then killed the former xorn in the stone, its gold staying there as in C; the record is
  // now noted every turn below and keeps those cells for objects, and 47, 69 and 88 reach 2000;
  // m21 step 1's layout draws: 74 died at turn 77, of 157..170 only 157, 158 and 167 reach 2000
  // with them, and 157 and 156 do with and without them; 174 and 177 replaced 156 and 157 in m21
  // step 4, whose Croesus row shifts the random forms: 156 ended at turn 2011 with 19 shifts and
  // 157 died at turn 569, both reaching 2000 with the row filtered; of 158..188 only 174, 175,
  // 177 and 185 reach 2000 with the row, and 174 and 177 do with and without it; 190 replaced
  // 174 in m22 step 2, whose eight kit object rows shift the stream: 174 died at turn 786; of
  // 174..190 only 177, 183, 188 and 190 reach 2000 with the rows, and 190 does with and without;
  // 201 replaced 190 in m22 step 3, whose starting kit and pet rolls shift the stream: 190 died
  // at turn 532 with 18 shifts; of 191..204 only 200, 201 and 203 reach 2000 with it, and 201
  // does with and without it; 205 and 208 replaced 177 and 201 in m22 step 6, whose staggering
  // blow draws rnd(100) when the bare-handed Valkyrie (no suit, no shield) hits for more than 1:
  // 177 died at turn 229 and 201 at turn 1210, both reaching 2000 with the draw neutralised; of
  // 202..211 only 205, 206 and 208 reach 2000 with it, and 205 does with and without it; 214 and
  // 216 replaced 205 and 208 in m22 step 8, whose valkyrie row makes tt_doppel()'s valkyrie roll
  // a valkyrie form instead of no form: 205 died at turn 1032 and 208 at turn 1431, both reaching
  // 2000 with that roll neutralised; of 209..226 only 214, 216, 218, 220 and 222 reach 2000 with
  // it, and 214, 216 and 222 do with and without it; 227 and 238 replaced 214 and 216 in m20
  // step 2, whose "What do you want to name?" menu shifts the bot's picks: 214 died at turn 102 and
  // 216 at turn 39; of 214..256 only 227, 238, 239, 241, 244, 246, 250, 251, 253 and 254 reach
  // 2000 with the menu, and 227, 238, 239, 246, 251 and 254 do with and without it; 246 replaced
  // 227 in m23 step 1, whose five Angel rows shift the random forms: 227 died at turn 1768 and
  // reaches 2000 with the rows withheld; of 238, 239, 246, 251 and 254 only 238 and 246 reach
  // 2000 with the rows, and both do without them; 258 and 272 replaced 246 and 238 in m23 step 2,
  // whose two new dungeons' draws at new game shift the whole stream: 246 died at turn 1341 and
  // 238 at turn 551; of 238..280 only 258, 260, 271, 272, 275, 278 and 280 reach 2000 with the
  // dungeons, and 258 and 272 do without them; 271 and 275 replaced 258 and 272 in m23 step 3,
  // whose high priest row shifts the random forms: 258 died at turn 284 and 272 at turn 597, both
  // reaching 2000 with the row withheld; of 260, 271, 275, 278 and 280..287 only 271 and 275
  // reach 2000 with the row, and both do without it; 315 replaced 275 in m23 step 7, whose
  // salamander, fire vortex and steam vortex rows shift the random forms: 275 died at turn 1601,
  // reaching 2000 with the rows withheld; of 288..323 only 301, 307, 313 and 315 reach 2000 with
  // the rows, and 315 does without them; 316 replaced 315 in m24 step 1, whose 40 quest rows
  // shift the random forms and give the doppelganger's quest-guardian pick real rows: 315 made
  // only 11 shifts and passes with the rows withheld; of 316..331 only 316, 319, 325 and 329 reach
  // 2000 with the rows, and 316 and 319 do without them; 319 replaced 271 in m24 step 2, whose
  // mirror, crystal ball and lenses rows shift the random objects: 271 died at turn 671 and
  // reaches 2000 with the three objects withheld; 301, 313, 316, 319, 325 and 329 reach 2000 both
  // with and without them (307 dies at turn 432 without); 379 and 381 replaced 316 and 319 in
  // m24 step 3, whose quest dungeon draws at new game shift the stream: 316 died at turn 170 and
  // 319 at turn 1781; of 301, 313, 325, 329 and 330..420, 332, 343, 344, 352, 353, 367, 370, 379,
  // 381, 383, 388 and more above 390 reach 2000 with the quest, and of those checked only 379 and
  // 381 do without it)
  // (480 s: the full parallel `pnpm check` can slow a 2000-turn run several-fold; m23 step 2's
  // seed 258 took about 70 s alone with coverage and over 240 s there)
  // (seed 381 runs in soak.shapeshift2.test.ts, on another worker)
  shapeshiftSoaks([379]);
});
