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

## 6b3 shops

Level teleport to Minetown (Mines 3 or 4, `Ctrl+o` marks it) and map the level. Wish for `2000 gold pieces` first.

- [ ] Walking into Izchak's lighting store greets you ("Velkommen, Valkyrie!  Welcome to Izchak's lighting store!"); `;` and look-here show "(for sale, N zorkmids)".
- [ ] Picking up candles says "For you, esteemed lady; only N zorkmids for this tallow candle." and the inventory shows them unpaid.
- [ ] Pay with `p` (or the Pay offer): "Thank you for shopping in Izchak's lighting store!". With several items, "Itemized billing?" asks y/n.
- [ ] Dropping one of your items in the general store: "... offers N gold pieces for your X. Sell it?"; try both answers. Drop several with D and try `a` and `q`.
- [ ] Drop gold in a shop and pick it back up: plain gold again, no "no charge".
- [ ] In every shop of the variant, buy one thing and sell one thing (tool, food, general; wand and book shops in Alley Town). A food shop shows no interest in a wand.
- [ ] Wish for a `dwarvish mattock` and walk in: "Will you please leave your mattock outside?", and you cannot get past him.
- [ ] Pick up an item and walk out: "You escaped the shop without paying!", "An alarm sounds!", the Watch turns hostile, the shopkeeper follows and fights. Paying him off calms him, sends him home and calms the Watch.
- [ ] Optional: while owing, level teleport away. He follows; paying there sends him home.
- [ ] New games, level teleport to DL2-4 a few times: random shops of other types (armor, weapons, potions, scrolls, rings), lit, one door, shopkeeper inside the door, never in a room with stairs; a big room is never a wand or book shop.
