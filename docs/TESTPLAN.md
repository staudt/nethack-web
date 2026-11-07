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

## 7a spellcasting

Wizard commands below are in the self-actions menu (tap yourself).

- [ ] New game: the bottom line shows `Pw:2(2)` next to HP.
- [ ] Wish for `blessed spellbook of force bolt` and read it: "You add the force bolt spell to your repertoire". `+` shows force bolt with its level, school (attack) and fail %.
- [ ] Cast (`Z` or the Cast offer on yourself), choose force bolt: "You don't have enough energy to cast that spell yet."
- [ ] "Wizard: change experience level", enter 8: "Welcome to experience level N." for each level ("You feel stealthy!" at 3, "You feel quick!" at 7), Pw rises. Then 5 is refused (cannot lower), 8 says "already that experienced", letters say "Never mind.".
- [ ] Cast force bolt at a monster: it hits or misses, or "You fail to cast the spell correctly." costs half the Pw. Wait a while: Pw comes back.
- [ ] "Wizard: cast any spell" with each of the eight (no Pw cost): light lights the room; detect monsters shows monsters; healing on yourself after damage says "You feel better."; cure blindness; protection gives a golden haze and better AC, then "less dense" / "disappears"; sleep puts a monster to sleep; confuse monster makes your hands glow red and the next monster you hit "appears confused".
- [ ] Create a gnomish wizard next to you: it casts ("casts a spell at you!", psi bolt headache, "looks better" when hurt). A created kobold shaman is usually level 2 and only makes "The air crackles around the kobold shaman.".
- [ ] Level teleport to Minetown and attack the priest (answer "no" to "Die?" if needed): he casts clerical spells (paralysis, giant ants, lightning...).
- [ ] College Town (level teleport over a few new games): two kobold shamans.

## 7c Mines' End, fountains, Orcish Town

### Fountains

- [ ] Find a `{` on the first levels and stand on it. The action menu shows "Drink from the fountain" and "Wash your hands"; `q` lists the fountain above the potions; `Alt+d` opens "What do you want to dip into the fountain?" with "Wash your hands" first, then the items.
- [ ] Each item's action menu shows "Dip into the fountain" only while you stand on a fountain.
- [ ] Dip a scroll: "Your scroll labeled X fades."; an iron weapon "rusts!"; a potion: nothing happens to it; a sack: "Some water gets into your bag!".
- [ ] In Minetown, drink or dip at a town fountain until "Hey, stop using that fountain!", then until "The fountain dries up!": the Watch turns hostile.
- [ ] Optional: with over 10 gold, keep dipping until "You lost some of your gold in the fountain!". At XL 5+ (wizard level change), dipping a long sword sometimes gives "A freezing mist..." and the fountain disappears (the Lady refuses a Valkyrie).

### Gems and the luckstone

- [ ] Wish for `luckstone`: Luck rises while carried; look at gems on the floor: unidentified ones show as "white gem", "gray stone" etc.
- [ ] Wish for `cursed loadstone`: it cannot be dropped, thrown or put in a bag.

### Mines' End (level teleport to the last Mines level, over several new games)

- [ ] All three variants appear over a few games.
- [ ] Mimic of the Mines: up stairs in the entry chamber, gem niches behind locked secret doors (search), one niche with a luckstone, no mimics.
- [ ] Wine Cellar: booze at the cellar spots, the treasure chamber at the far right with diamonds, emeralds, rubies, amethysts and the luckstone, a fountain on the left.
- [ ] Catacombs: arrive in a lit room closed in by secret doors, then a maze with mummies, zombies and floating eyes and two fountains; the luckstone and flint are in the far right room or the bottom-left pocket.
- [ ] Try a larger map size: the maze still connects.

### Orcish Town (level teleport to Minetown in new games until a town has cyan `#` iron bars, about 1 game in 7)

- [ ] No watchmen, shopkeepers or priest; hostile orcs everywhere (captains, Uruk-hai, Mordor orcs, shamans near the altar, hill orcs, goblins).
- [ ] Walking into a bar is blocked, but you can see through it.
- [ ] The floor has corpses (priest, shopkeepers, Watch), rocks, at least 7 candles, an oil lamp, and wands of striking and magic missile with 0 charges.
- [ ] The altar is unaligned; two fountains on the main street; holes in some shop walls; both staircases outside the town walls.
- [ ] Level teleport deeper in the Mines and to the bottom: orcs wait there, the orc-captain leader at the bottom, some carrying gold, gems or a ring.

## 7b1 boulders and pits

With `?wizard=1`.

- [ ] Wish for `boulder`: it lands at your feet (a `0`). Step off, walk back into it: "With great effort you move the boulder." and you follow it.
- [ ] Push it into a wall: "You try to move the boulder, but in vain." and no time passes. Stand behind it in a dark spot: you cannot see past it.
- [ ] Tap the boulder: the action menu offers "Push the boulder" and "Fight the boulder"; kick it: "Ouch! That hurts!".
- [ ] Wish for `wand of striking`, zap it at a boulder: "The boulder falls apart." and a pile of rocks.
- [ ] Wish for `scroll of earth`, read it in a room: "The ceiling rumbles above you!", a boulder on every square around you and one on you. A blessed one: "around you", none on you.
- [ ] Find a pit (or wait for one deeper down): "You fall into a pit!", a few turns of "You are still in a pit." then "You crawl to the edge of the pit."; push a boulder into it: "The boulder fills a pit."
- [ ] Level teleport to Mines level 1 in a few new games: boulders in the cave.

## 7b2 Oracle and Sokoban

With `?wizard=1`.

- [ ] Wizard "where": the Oracle on DL5-9, and "Stairs up to Sokoban" one level below it.
- [ ] Level teleport to the Oracle: a centre room with four fountains around the peaceful Oracle; stepping into it: "welcome to Delphi!".
- [ ] Level teleport to the level below the Oracle: it has two up staircases. Take the one that is not the way back up to the Oracle: Sokoban's entry level, already mapped, boulders (`0`) and pits shown.
- [ ] Push a boulder into a pit: "The boulder fills a pit." Try to push one diagonally: "The boulder won't roll diagonally on this floor." and no time passes.
- [ ] Walk into an open pit and confirm: "Air currents pull you down into a pit!", then climb out after a few turns. Try to slip diagonally between a boulder and a wall: "You cannot pass that way."
- [ ] `>` on the branch stairs takes you back to the main dungeon below the Oracle.
- [ ] Level teleport to Sokoban level 1 (the top) in a game or two: "Welcome to David's treasure zoo!" when you enter the zoo, sleeping monsters on gold, and a bag of holding or an amulet of reflection behind it.

## Look cursor

Desktop with a keyboard first, then the phone. Try both key layouts (Options: vi keys / number pad).

- [ ] Press `;`: "Pick a monster, object or location." and a yellow box on your `@`; the Look button shows as pressed.
- [ ] vi keys: `hjklyubn` move the box one cell, `HJKLYUBN` eight, stopping at the map edge (a diagonal stays diagonal until the edge). Number pad layout: digits and the number pad move it. Both: arrow keys (Up+Left together give a diagonal), Shift+arrow moves eight.
- [ ] `.` (also `,`, `;`, `:`) on a monster, an object, stairs and an unexplored cell: one "You see: ..." line each, and the box goes away; the next `l`/arrow moves you again.
- [ ] `;` then Esc: no description, box gone, Look button not pressed.
- [ ] `;` then `m` repeatedly: the box jumps to each visible monster, nearest first, then back to you; `M` goes the other way. `o`/`O` do the same for objects you see or remember, skipping boulders and rocks. `@` brings it back to you.
- [ ] `;` then `>` or `<`: the box jumps to the stairs; again cycles if there are several. With no such feature on the level: "Can't find dungeon feature '<'.". `_` altar, `{` fountain, `^` a trap you have found work the same way.
- [ ] On a map larger than the screen (zoomed in, or `?w=200&h=60`), move the box off screen with `L`/`J`: the map scrolls to follow it, and back to you after picking or Esc.
- [ ] Phone: tap Look, then tap a cell: it is described at once (no keyboard needed). Tap Look twice: look mode is off again.

## 7d wands, rings and traps

With `?wizard=1` (wizard wish for each wand, ring, scroll and trap).

- [ ] Read a `scroll of teleportation`: you land elsewhere on the level; a `cursed scroll of teleportation`: "You materialize on a different level!". Zap a `wand of teleportation` at a monster (it vanishes) and at yourself. In Sokoban (level teleport there) a teleport scroll gives "A mysterious force prevents you from teleporting!".
- [ ] Wish `teleportation trap`, `level teleporter`, `magic trap` and `anti-magic field` and step on each (the anti-magic field drains Pw; the magic trap gives flashes, roars and monsters, odd feelings or a tower of flame).
- [ ] `wand of digging`: zap at a room wall (a doorway), into rock (a corridor), with `>` (you fall to the next level) and `<` (a rock hits you). In Sokoban's first level `>` makes a pit and a wall "glows then fades".
- [ ] `ring of levitation` over a pit: you float out; walk over a trap door; picking up fails ("You can't reach the floor."); remove it over the trap door: you fall.
- [ ] `ring of teleportation`: wait (`s` with a count) until it teleports you. `ring of warning`: digits for monsters behind walls. `ring of conflict` near a pet and a peaceful: they attack you and each other.
- [ ] `wand of wishing`: the wish prompt. `wand of death` at a monster. `wand of cancellation` at a floating eye, then hit it safely; put the wand into a bag of holding: it explodes.
- [ ] Kill a jackal, stand on its corpse and zap a `wand of undead turning` with `>`: the jackal rises. `wand of enlightenment`: the attribute list.

## 8 end of game

On the phone (Pages build), no keyboard.

- [ ] Die (fight until dead, or `?wizard=1`, wish a `wand of death`, zap yourself, answer "Die?" Yes): "Do you want your possessions identified?" with Yes / No / Quit buttons; Yes shows every item identified (a bag's contents indented under "Contents of the bag:"); Close goes on.
- [ ] "Do you want to see your attributes?": Yes shows the attribute list; No skips it. Die again and tap Quit at the first question: no more questions, straight to the stone.
- [ ] The stone fits the screen width without wrapping or sideways scrolling: REST IN PEACE, Valkyrie, your gold as `N Au`, the death ("killed by a jackal") wrapped on words, this year.
- [ ] Under it: "Goodbye Valkyrie the Valkyrie...", "You died in The Dungeons of Doom on dungeon level N,", the gold and moves line, the level and hit points line; New game starts a new game.
- [ ] Escape the dungeon (go up the stairs on level 1, answer Yes): the same two questions, then no stone, "You escaped from the dungeon,".

## 8 help

On the phone (Pages build), no keyboard.

- [ ] Menu > Help: "Playing on a touch screen", "List of commands", "Menu commands", "About"; each page fits the screen width (rows wrap, no sideways scrolling) and Back returns to the help menu.
- [ ] List of commands: the movement grid (`7 8 9` with the number pad keys, `y k u` after switching to vi keys), then the commands with their keys (`^D Kick`, `M-p Pray`); tap "Kick": the kick direction pad; tap "Open a door": a compass, and the door opens.
- [ ] On a keyboard, `?` opens the same help; a command's own key (e.g. `e`) runs it from the list.

## 8 options, scores, title and quit

On the phone (Pages build), no keyboard. Start from a private tab (or clear the site's data) so there is no save, no name and no score list.

- [ ] The app opens on the title screen (webhack: Play, Wizard mode, High scores, Help, Options); Close shows it again. Help and Options open their sheets and Close comes back to the title; High scores is empty.
- [ ] Play asks "Who are you?": a blank answer asks again, Cancel goes back to the title; type a name and a game starts. Menu > Options shows the name; reload: the game resumes straight away (no title).
- [ ] Options: set the run speed to "crawl" and travel somewhere (slow); "teleport" (she jumps). Set "End of game" to "show nothing"; reload: both kept. Movement keys switch reloads into the same game.
- [ ] During a game, Menu > New game: "Really quit without saving?"; No keeps playing (no time passes). Again, Yes: no questions ("show nothing"), then "You quit." with no stone, "Goodbye <name> the Valkyrie...", "You quit in The Dungeons of Doom on dungeon level N with P points,"; High scores shows the game standing out ("... quit in The Dungeons of Doom on level N."; unranked at the end if it scored 0 points); New game opens the title, not a game.
- [ ] Set "End of game" back to "ask about each list". Actions > Quit (the last row), Yes: the possessions and attributes questions, then the quit summary.
- [ ] Play, kill a few monsters and die: the questions (possessions, attributes, creatures vanquished), the stone with your name, the summary with points, High scores with the new entry standing out and "You made the top ten list!"; Menu > High scores during the next game shows it too.
- [ ] Title > Wizard mode: the Wizard status marker; die (`^w` "wand of death", zap yourself, "Die?" Yes): the end sheet's High scores says "Since you were in wizard mode, the score list will not be checked." and the game is not on the list. Quit a wizard game: no "Die?" question, no entry either.
