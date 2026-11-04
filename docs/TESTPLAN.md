# Manual test plan

Checks for the user to run on a phone (and a desktop browser) after unattended work. Each milestone adds a section when it finishes. Tick a box when it passes; note anything odd under the item.

Setup for every section unless it says otherwise: open the game with `?wizard=1&new=1`. Wizard commands are in the self-actions menu (or `Ctrl+f` map, `Ctrl+v` level teleport, `Ctrl+w` wish, `Ctrl+g` create monster, `Ctrl+o` where).

## 6b2 temple

Level teleport to the Gnomish Mines level that `Ctrl+o` (where) marks as Minetown (level 3 or 4). Map the level to find the temple.

- [ ] Walking into the temple says "Pilgrim, you enter a sacred place!" and gives a feeling of peace (your god) or a forbidding feeling (another god).
- [ ] Looking at the altar names its god, e.g. "altar to Odin (neutral)".
- [ ] Dropping items on the altar gives an amber flash (blessed), a black flash (cursed) or "lands on the altar" (uncursed), and they then show their status.
- [ ] Wish for `2000 gold pieces`. "Chat with" the priest from the action menu on his square; a number pad appears. Giving twice the suggested amount says you have been rewarded, and AC drops.
- [ ] Wish for `potion of water`, drop it on the altar, wait until turn 300, pray. On Odin's altar it becomes holy; on Tyr's or Loki's altar it becomes unholy and Luck drops.
- [ ] Attacking the priest angers him, the Watch turns hostile, and your god may strike with lightning.
