// The 5 races' data: names, file codes, allowed alignments, the self/love/hate masks, attribute
// limits, hit point and energy advancement and the racial intrinsics. A leaf (core types, urole
// and roletab only). Names are message keys (`race.<key>`, `race.<key>.adj`).
// ref: src/role.c races[], src/attrib.c dwa_abil[]..hum_abil[]; include/you.h struct Race
import type { DefId } from '@nh/core';
import { STR18, type Align, type Gender, type HpAdvance, type Innate } from './roletab';
import { RACE_ORDER, type RaceKey } from './urole';

type Six = readonly [number, number, number, number, number, number];

export interface RaceRow {
  key: RaceKey;
  /** 'Hum'. ref: races[].filecode */
  filecode: string;
  /** the monster flag of the race (MH_HUMAN ..): 'human', 'elf', 'dwarf', 'gnome', 'orc' */
  monFlag: string;
  /** the race's monster (races[].mnum) */
  mnum: DefId;
  genders: readonly Gender[];
  aligns: readonly Align[];
  /** monster race flags: her own kind, always peaceful, always hostile */
  selfmask: readonly string[];
  lovemask: readonly string[];
  hatemask: readonly string[];
  /** Str Int Wis Dex Con Cha limits */
  attrmin: Six;
  attrmax: Six;
  hpadv: HpAdvance;
  enadv: HpAdvance;
  /** intrinsics by experience level. ref: src/attrib.c dwa_abil[] .. hum_abil[] */
  abil: readonly Innate[];
}

const MF: readonly Gender[] = ['male', 'female'];
const MIN3: Six = [3, 3, 3, 3, 3, 3];

/** ref: src/role.c races[], src/attrib.c *_abil[] */
export const RACES_TAB: Readonly<Record<RaceKey, RaceRow>> = {
  human: {
    key: 'human',
    filecode: 'Hum',
    monFlag: 'human',
    mnum: 'nh:human',
    genders: MF,
    aligns: [1, 0, -1],
    selfmask: ['human'],
    lovemask: [],
    hatemask: ['gnome', 'orc'],
    attrmin: MIN3,
    attrmax: [STR18(100), 18, 18, 18, 18, 18],
    hpadv: { infix: 2, inrnd: 0, lofix: 0, lornd: 2, hifix: 1, hirnd: 0 },
    enadv: { infix: 1, inrnd: 0, lofix: 2, lornd: 0, hifix: 2, hirnd: 0 },
    abil: [],
  },
  elf: {
    key: 'elf',
    filecode: 'Elf',
    monFlag: 'elf',
    mnum: 'nh:elf',
    genders: MF,
    aligns: [-1],
    selfmask: ['elf'],
    lovemask: ['elf'],
    hatemask: ['orc'],
    attrmin: MIN3,
    attrmax: [18, 20, 20, 18, 16, 18],
    hpadv: { infix: 1, inrnd: 0, lofix: 0, lornd: 1, hifix: 1, hirnd: 0 },
    enadv: { infix: 2, inrnd: 0, lofix: 3, lornd: 0, hifix: 3, hirnd: 0 },
    abil: [
      { level: 1, prop: 'infravision', gain: null, lose: null },
      { level: 4, prop: 'sleep_res', gain: 'abil.awake', lose: 'abil.tired' },
    ],
  },
  dwarf: {
    key: 'dwarf',
    filecode: 'Dwa',
    monFlag: 'dwarf',
    mnum: 'nh:dwarf',
    genders: MF,
    aligns: [1],
    selfmask: ['dwarf'],
    lovemask: ['dwarf', 'gnome'],
    hatemask: ['orc'],
    attrmin: MIN3,
    attrmax: [STR18(100), 16, 16, 20, 20, 16],
    hpadv: { infix: 4, inrnd: 0, lofix: 0, lornd: 3, hifix: 2, hirnd: 0 },
    enadv: { infix: 0, inrnd: 0, lofix: 0, lornd: 0, hifix: 0, hirnd: 0 },
    abil: [{ level: 1, prop: 'infravision', gain: null, lose: null }],
  },
  gnome: {
    key: 'gnome',
    filecode: 'Gno',
    monFlag: 'gnome',
    mnum: 'nh:gnome',
    genders: MF,
    aligns: [0],
    selfmask: ['gnome'],
    lovemask: ['dwarf', 'gnome'],
    hatemask: ['human'],
    attrmin: MIN3,
    attrmax: [STR18(50), 19, 18, 18, 18, 18],
    hpadv: { infix: 1, inrnd: 0, lofix: 0, lornd: 1, hifix: 0, hirnd: 0 },
    enadv: { infix: 2, inrnd: 0, lofix: 2, lornd: 0, hifix: 2, hirnd: 0 },
    abil: [{ level: 1, prop: 'infravision', gain: null, lose: null }],
  },
  orc: {
    key: 'orc',
    filecode: 'Orc',
    monFlag: 'orc',
    mnum: 'nh:orc',
    genders: MF,
    aligns: [-1],
    selfmask: ['orc'],
    lovemask: [],
    hatemask: ['human', 'elf', 'dwarf'],
    attrmin: MIN3,
    attrmax: [STR18(50), 16, 16, 18, 18, 16],
    hpadv: { infix: 1, inrnd: 0, lofix: 0, lornd: 1, hifix: 0, hirnd: 0 },
    enadv: { infix: 1, inrnd: 0, lofix: 1, lornd: 0, hifix: 1, hirnd: 0 },
    abil: [
      { level: 1, prop: 'infravision', gain: null, lose: null },
      { level: 1, prop: 'poison_res', gain: null, lose: null },
    ],
  },
};

export { RACE_ORDER };

/**
 * The race whose intrinsics adjabil() walks after the role's: only elves and orcs (a dwarf's
 * and a gnome's infravision comes from the race's monster, set_uasmon()). ref: src/attrib.c
 * adjabil() `switch (Race_switch)`
 */
export const adjabilRace = (race: RaceKey): readonly Innate[] =>
  race === 'elf' || race === 'orc' ? RACES_TAB[race].abil : [];
