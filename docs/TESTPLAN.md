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

- [ ] The app opens on the title screen (NetHack: Play, Wizard mode, High scores, Help, Options); Close shows it again. Help and Options open their sheets and Close comes back to the title; High scores is empty.
- [ ] Play asks "Who are you?": a blank answer asks again, Cancel goes back to the title; type a name and a game starts. Menu > Options shows the name; reload: the game resumes straight away (no title).
- [ ] Options: set the run speed to "crawl" and travel somewhere (slow); "teleport" (she jumps). Set "End of game" to "show nothing"; reload: both kept. Movement keys switch reloads into the same game.
- [ ] During a game, Menu > New game: "Really quit without saving?"; No keeps playing (no time passes). Again, Yes: no questions ("show nothing"), then "You quit." with no stone, "Goodbye <name> the Valkyrie...", "You quit in The Dungeons of Doom on dungeon level N with P points,"; High scores shows the game standing out ("... quit in The Dungeons of Doom on level N."; unranked at the end if it scored 0 points); New game opens the title, not a game.
- [ ] Set "End of game" back to "ask about each list". Actions > Quit (the last row), Yes: the possessions and attributes questions, then the quit summary.
- [ ] Play, kill a few monsters and die: the questions (possessions, attributes, creatures vanquished), the stone with your name, the summary with points, High scores with the new entry standing out and "You made the top ten list!"; Menu > High scores during the next game shows it too.
- [ ] Title > Wizard mode: the Wizard status marker; die (`^w` "wand of death", zap yourself, "Die?" Yes): the end sheet's High scores says "Since you were in wizard mode, the score list will not be checked." and the game is not on the list. Quit a wizard game: no "Die?" question, no entry either.

## 7e digging, boulder and box traps, land mines

With `?wizard=1` (`Ctrl+w` wish; a wish that starts with a trap's name, like `rolling boulder trap`, makes that trap under you, unseen and not set off: step off and back on to trigger it; `land mine` and `bear trap` alone are the objects, `land mine trap` and `bear trap trap` the traps).

- [ ] Wish `pick-axe`. Tap a rock or wall square next to you: the action menu offers "Dig" (and "Dig down" on yourself). Dig east into rock: "You start digging." and a corridor opens; at a room wall: "You make an opening in the wall."; at a closed door: "You break through the door with your pick-axe."
- [ ] Dig down: "You dig a pit in the floor." and the digging stops; dig down again: a hole and you fall to the next level. At a Sokoban wall: "This wall is too hard to dig into."
- [ ] In Minetown (level teleport, `Ctrl+o` marks it), dig at a town wall or door: "Hey, stop damaging that wall!" the first time, then the Watch turns hostile. Walk to a shop door carrying the pick: the shopkeeper asks you to leave it outside ("Will you please leave your pick-axe outside?").
- [ ] Level teleport to the Mines, create a `dwarf` away from you (repeat until one has a pick-axe or mattock): it wields it and tunnels through rock and walls toward you ("You hear crashing rock." when out of sight).
- [ ] Dig down to a pit, wish `wand of digging` and zap it sideways from inside the pit: "You dig an adjacent pit."; walk into it ("You move into an adjacent pit.") without climbing out. Applying the pick sideways from a pit never digs a new pit.
- [ ] Wish `rolling boulder trap` in a room, step off and on: a boulder rolls in from one side and hits you (or "Fortunately for you, no boulder was released."). In Sokoban, the rolling boulder trap squares show `^` once found and release nothing.
- [ ] Wish `trapped large box` and `#loot` it: a trap fires ("You trigger a trap!", a needle, gas, a flame, a shock or "The large box explodes!"). Optional: on a deep level (10+) a door may be booby-trapped when opened or kicked: "KABOOM!!  The door was booby-trapped!".
- [ ] Wish `locked large box`, stand on it with the long sword wielded and choose "Force the lock of the large box" (`Alt+f`): "You force your long sword into a crack and pry." until the lock opens (or the blade breaks). With a blunt weapon you bash and may wreck the box.
- [ ] Wish `land mine trap`, step off and back on: "KAABLAMM!!!  You triggered a land mine!", objects on the square fly around, and you are in a pit with wounded legs.
- [ ] Wish `100 gold pieces`, drop them and kick the stack: "Thwwpingg!" and the coins scatter.
- [ ] `#untrap`: wish `bear trap trap`, step east and tap the `^` (search to see it if needed): "Untrap the bear trap" (also "Untrap" on yourself, `Alt+u`, which asks the direction): "You disarm the bear trap." and a beartrap object lies there, or "Whoops..." and you are caught in it. The same with `arrow trap`: a stack of arrows.
- [ ] Wish `pit` under your pet's square (stand there, wish, step off and let the pet walk in), then "Untrap the pit" next to it: "You reach out your arms and grab the kitten." and "You pull the kitten out of the pit.".
- [ ] Wish `trapped large box`, stand on it, "Untrap" > here: "There is a large box here.  Check it for traps?" yes: "You find a trap on the large box!" (not always: try again), "Disarm it?" yes: "You disarm it!" or "You set it off!".
- [ ] Breaking wands: wish `wand of fire`, open its item menu: "Break" (also `a`, which lists wands): "Are you really sure you want to break your ... wand?" no: nothing happens. Yes: "Raising your ... high above your head, you break it in two!", the explosion box (`/-\`, `| |`, `\-/` in orange) flashes around you, "Boom!" and "You are caught in the fireball!"; the wand is now identified.
- [ ] Wish `wand of digging`, break it in the middle of a room: pits on the eight squares around you and under you (with many charges some are holes, and you may fall through). Break one next to a room wall: the wall squares become doorways.
- [ ] Wish `wand of striking` and break it next to a closed door: "A wall of force smashes down around you!", "The door crashes open!". Wish `wand of teleportation`, create two monsters next to you and break it: they vanish elsewhere on the level.
- [ ] Wish `magic trap` two squares east (stand there, wish, step back), wish `wand of cancellation` and zap it east: "Boom!", the trap is gone and the wand identified. Wish `level teleporter` under you and zap a `wand of digging` down: "You are caught in the magical blast!" and the trap is gone (no hole).

Shop damage (find a shop on DL2-6, or Minetown's; wish `1000 gold pieces` first):

- [ ] Stand outside a shop next to its closed door and kick it until it breaks: the shopkeeper appears in the doorway and asks "Minx!  You did 400 zorkmids worth of damage!"  Pay?. Yes: "Mollified, X accepts your restitution.", he goes back in and your gold is 400 less. About 5 turns later (wait with `s`) "Suddenly, the shop door reappears!" (closed) and "X whispers an incantation.".
- [ ] Repeat with a fresh door and answer no: "Oh, yes!  You'll pay!" and he attacks. Drop your gold first and do it again: "How dare you break my door?" without the question.
- [ ] Inside a shop, wish `wand of digging` and zap it at a shop wall: a doorway, then the question for 200 zorkmids ("dig into"); a few turns later "Suddenly, a section of the wall closes up!" and anything lying in the gap is now inside the shop.
- [ ] Wish `pick-axe` inside a shop and dig down: "You start digging downward." and "Madam, do not damage the floor here!"; pick up something without paying and keep digging down until you fall through: "X grabs your backpack!" and only your worn and wielded things stay with you.
- [ ] Wish `wand of fire` and zap it at a shop's closed door from outside: "The door is consumed in flames!" and the question about "burn away"; break a `wand of digging` in a shop: pits around you and the question after the blast.

## 9 damage types and attack styles

With `?wizard=1` (`Ctrl+g` creates a monster by name, `Ctrl+w` wishes for an item; use "Wizard: change experience level" or just heal when a fight goes badly). Step 7 (level drain, lycanthropy) is not built yet: see ROADMAP "From m9".

- [ ] Wear iron armor (wish `plate mail`), create a `rust monster`: its touch says "Your plate mail rusts!" (the armor shows "rusty"); hit it with a wielded iron weapon (`long sword`): "Your long sword rusts!" (the passive). Fighting it bare-handed hurts nothing.
- [ ] Create a `quantum mechanic`: its claw hurts and "Your position suddenly seems very uncertain!" (you teleport).
- [ ] Create a `pyrolisk` in line of sight (not adjacent): "The pyrolisk's gaze is burning!" and you take fire damage (cloak or armor may burn).
- [ ] Create a `gas spore` two squares away and throw a dagger at it: it dies with an explosion box and "gas spore's explosion" damage to what stands next to it (try a second monster beside it). Create one adjacent and kill it in melee: it explodes on you.
- [ ] Create a `yellow light` next to you: it explodes and you are blinded for a long time (wait it out with `20s`; a unicorn horn or prayer cures it).
- [ ] Create an `owlbear`: after its two claws it grabs you ("grabs you!"); walking away says you cannot move out of its grasp; kill it or get free. Create a `python`: its bite wraps you; same.
- [ ] Carry 100+ gold (wish `200 gold pieces`), create a `leprechaun`: "Your purse feels lighter." and it vanishes (teleports); find it later: it keeps away from you.
- [ ] Wear a cloak (and body armor under it), create a `water nymph`: she charms you ("charms you.  You gladly hand over your cloak"), taking off the armor takes several turns, then she teleports away with it. Stealing something small is quicker. A `monkey` snatches one item and runs.
- [ ] Quaff from a fountain repeatedly until a water nymph appears ("A water nymph emerges from the fountain" style), then fight or lose an item to her.
- [ ] Create a `fog cloud`: it engulfs you, the swallow box is drawn around you and the map is hidden; attack it (tap it) until it dies or expels you. Try a `dust vortex` (blinds you inside).
- [ ] Create a `purple worm` and a `newt` beside it (the worm may swallow the newt, "swallows the newt"). Engulfed by the worm, wish `wand of digging` and zap it (any direction): "You pierce the purple worm's stomach wall!" and you are out.
- [ ] Create a `cockatrice` (or `chickatrice`): its hissing says "You hear the cockatrice's hissing." and sometimes "You are slowing down." (stoning countdown, five turns, "Stone" in the status). Wish `lizard corpse`, eat it: "You feel limber!" cured. Repeat curing with an `acidic corpse` (wish `acid blob corpse`) or by praying (prayer fixes stoning).
- [ ] Hit a cockatrice bare-handed (take your gloves off): you turn to stone and die. Same when you eat a cockatrice corpse ("You turn to stone"). Picking up a cockatrice corpse bare-handed also kills you.
- [ ] Wish `leather gloves` and wear them, then wish `cockatrice corpse`: picking it up and wielding it is safe with gloves. Hit a `jackal` with it: "The jackal turns to stone." and a statue of a jackal is left (look: "statue of a jackal"). Lose the gloves (take them off while wielding): you die.
- [ ] Create a `winter wolf cub` a few squares away in a straight line: "The winter wolf cub breathes frost!" and a white ray; as a Valkyrie "You don't feel cold." (no damage).
- [ ] Create a `cobra` a few squares away in a line: "The cobra spits venom!", "You are hit by a splash of blinding venom." and "The venom blinds you." No venom is left on the floor.

## 10 monster batch 1

With `?wizard=1` (`Ctrl+g` creates a monster by name, `Ctrl+w` wishes for an item; heal or raise your level with the wizard commands when a fight goes badly). New monsters, steps 1-5; what is left out is in ROADMAP "From m10".

- [ ] Create a `hobgoblin`, a `wolf`, a `killer bee` and a `pony`: they fight as usual. #chat to the pony: "The pony neighs." Eat the killer bee's corpse a few times (wish `killer bee corpse`): sometimes "You feel healthy."
- [ ] Create a `giant spider` next to a wall and wait (`20s`): "The giant spider spins a web." Walk into the web: "You stumble into a spider web!", then "You are stuck to the web." for a few turns and "You disentangle yourself."
- [ ] Wish `dagger`, wield it, #untrap an adjacent web: "You cut through the web." Wish `wand of fire` and zap it across another web: "A web bursts into flames!"
- [ ] Create a `shrieker` and stand next to it: "The shrieker shrieks."; now and then a monster turns up (sometimes a purple worm).
- [ ] Wish `long sword` (iron), wield it, create a `brown pudding` and hit it: "The brown pudding divides as you hit it!" (two puddings).
- [ ] Create a `freezing sphere`: it explodes on you (cold). Create an `ice vortex`: it engulfs you and freezes you.
- [ ] Create a `human zombie`, kill it: it leaves a human corpse; eat it: "You cannibal!  You will regret this!" (Luck drops; you aggravate monsters).
- [ ] Create an `imp`: it curses at you (a cuss line or "The imp casts aspersions on your ancestry.") and heals every turn. Create a `tengu`: now and then it teleports next to you. Wish `tengu corpse` and eat a few: "You feel very jumpy." (teleportitis) or "You feel in control of yourself."
- [ ] Create a `Grey-elf`, kill it: it leaves elven gear (elven mithril-coat, elven dagger, elven bow and arrows, not all at once). A `forest centaur` may shoot arrows, an `ogre` carries a club, a `soldier` a spear, short sword, dagger or knife and some armor.
- [ ] Create a `troll`, kill it, and stand next to its corpse for up to 50 turns (`20s`): usually "The troll rises from the dead!"
- [ ] Drop a `dagger` (wish) and create a `rust monster` on the other side of it; when it walks over the dagger: "The rust monster eats a dagger!" (a `rock mole` eats any metal, gold too). Drop a `food ration` and a dagger in a corridor and create a `gelatinous cube` beyond them: it eats the food and engulfs the dagger.
