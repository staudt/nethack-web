// Symbol sets (leaf): the Rogue level's, Rogue's own characters with no colour at all.
// ref: src/symbols.c init_rogue_symbols(): every door `+` (S_vodoor, S_hodoor, S_ndoor; the
// closed ones are `+` already), stairs `%` (S_upstair, S_dnstair; ladders and branch stairs
// keep theirs), the object classes from def_r_oc_syms[], monsters, traps, warnings and the other
// symbols unchanged (get_othersym(): the boulder as in the primary set);
// src/drawing.c def_r_oc_syms[]: armour `]`, amulets `,`, food `:`, gold `*` (as gems);
// src/display.c reset_glyphmap(): GMAP_ROGUELEVEL without rogue colour (symset[ROGUESET].nocolor,
// set by init_rogue_symbols()) draws every glyph in NO_COLOR, the default foreground (gray).
import type { SymsetDef } from '@nh/core';

export const ROGUE_SYMSET: SymsetDef = {
  id: 'nh:rogue-symset',
  nameKey: 'symset.rogue',
  glyphs: {
    'nh:doorway': '+',
    'nh:door_open_v': '+',
    'nh:door_open_h': '+',
    'nh:stairs_up': '%',
    'nh:stairs_down': '%',
  },
  classes: { armor: ']', amulet: ',', food: ':', coin: '*' },
  fg: '#aaaaaa',
};

export const SYMSETS: readonly SymsetDef[] = [ROGUE_SYMSET];
