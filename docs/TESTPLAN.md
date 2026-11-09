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

With `?wizard=1` (`Ctrl+g` creates a monster by name, `Ctrl+w` wishes for an item; use "Wizard: change experience level" or just heal when a fight goes badly). What is left out is in ROADMAP "From m9".

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
- [ ] Raise your level to 8 ("Wizard: change experience level"), create a `wraith`: now and then its touch says "Farvel level 8." (you lose a level; at 7 also "You feel slow!"; the status line shows the lower level and max HP). Kill it, eat its corpse: "You feel more experienced.", "Welcome back to experience level N." A `barrow wight` carries a long sword and its blade drains too.
- [ ] "Wizard: change experience level" to a lower level: one "Farvel level N." per level lost, no death.
- [ ] Create a `wererat` (the `@` one): next to you it may turn into a rat ("The wererat changes into a rat.", dropping its weapon), summon help ("The wererat summons help!" and rats appear around you) and bite: "You feel feverish." Enlightenment (wish `wand of enlightenment`, zap it) lists "You are a wererat." and "level-drain resistant". Pray (wait ~300 turns after the last prayer, or at low HP): "You feel purified." Or quaff blessed water (wish `holy water`): "You feel full of awe." "You feel purified."
- [ ] Create a `werejackal` (the `d` one) and kill it: its corpse is a werejackal corpse of the human form (look at it); eating it gives lycanthropy (enlightenment).
- [ ] Create a `green slime` (Gehennom-only, genesis still makes it): its touch says "You don't feel very well." and "Slime" shows in the status; every other turn "You are turning a little green.", "Your limbs are getting oozy.", "Your skin begins to peel away.", "You are turning into a green slime.", "You have become a green slime.", then "You turn into a green slime!" and you die ("turned to slime by a green slime" on the stone). Again, but cure it: zap a wished `wand of fire` at yourself (`.`): "The slime that covers you is burned away!"; or pray: "The slime disappears."; or put on a wished `amulet of unchanging` (the status goes quiet).
- [ ] With a worn `amulet of life saving`, let the sliming run out: "But wait..." and you live on as a green slime (the glyph is a `P`).
- [ ] Create a `green slime` and a `jackal` beside it (or wait for your pet to fight it): now and then the jackal "turns into a green slime!". Polymorph into a green slime (wizard "#polyself", `green slime`) and fight a newt: "You turn the newt into slime."
- [ ] Take off all armor and unwield your weapon (`w-`), lose some HP, create a `nurse`: "The nurse hits!  (I hope you don't mind.)" heals you and sometimes raises your max HP; now and then she vanishes or teleports away. Wield a weapon again: she just hits. #chat to a peaceful one (wizard: create, then tame or wait): "Put that weapon away before you hurt someone!".
- [ ] Create a `mind flayer` with a helmet on (wish `orcish helm`): mostly "Your helm blocks the attack to your head."; without it "Your brain is eaten!" and Intelligence drops on the status line; sometimes "You forget some of your training in ..." (after #enhance) or your spells' retention drops (`+`). Polymorph into a `mind flayer` and fight a jackal: "You eat the jackal's brain!"

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

## 11 objects batch

With `?wizard=1` (`Ctrl+w` wishes for an item, `Ctrl+g` creates a monster by name; heal or raise your level with the wizard commands when a fight goes badly, and use **Wizard: cast** to cast a spell without knowing it). Steps 1-8; what is left out is in ROADMAP "From m11".

- [ ] (1) Create a `soldier` and a `Grey-elf` and kill them: the soldier's gear may hold a polearm (halberd, glaive, ...), the elf's an elven short sword, broadsword or spear. Wish `two-handed sword`, wear a shield and try to wield it: refused.
- [ ] (2) Wish `halberd`, wield it and **Apply** it: the cursor shows the reachable cells; pick a `jackal` (Ctrl+g) two squares away and hit it. Pick an adjacent cell: "Too close!". Create a `watchman` two squares away: it thrusts its polearm at you.
- [ ] (2) Wish `silver saber`, wield it and hit a created `imp`: "The silver sears the imp!". Eat a `sprig of wolfsbane` after a werejackal bite (lycanthropy): "You feel purified."
- [ ] (3) Wish `plate mail`, `helmet`, `elven cloak`, `high boots` and `shield of reflection`, wear them: the AC drops; enlightenment shows stealth and reflection. Wish `tin whistle`, apply it next to a sleeping monster: it wakes. Wish `T-shirt` and **Read** it: a slogan.
- [ ] (4) Wish `speed boots`, `gauntlets of power` and `levitation boots`, wear them: very fast, Str 25, you float. Wish `cursed levitation boots` and wear them: you cannot come down. Wish `fumble boots`: now and then you trip ("You trip over your own feet.")
- [ ] (5) Wish `cockatrice egg` and eat it: "You are slowing down." (pray or quaff acid). Throw another at a created monster: it turns to stone. Polymorph (wizard **#polyself**) into a female `cockatrice` and choose **Sit**: "You lay an egg."
- [ ] (6) Quaff `blessed potion of levitation`: you float; choose **Stop levitating** in the self menu (or `>`): you come down. Quaff `potion of sickness` (an attribute drops), then `potion of restore ability`: it comes back. Quaff `potion of gain level` and `potion of monster detection`.
- [ ] (7) Read `scroll of genocide` and type `jackal`: "Wiped out all jackals."; Ctrl+g `jackal` now fails. Drop a `scroll of scare monster`, stand on it next to a created `jackal`: it never attacks in melee. Read `scroll of fire`.
- [ ] (8) Drop a `dagger` and some `gold piece`s in another room, come back and read `scroll of gold detection`: "You feel very greedy, and sense gold!" and the gold shows on the map; quaff `potion of object detection`: the dagger shows too. Read `scroll of magic mapping`: "A map coalesces in your mind!" and the level is drawn. Read `scroll of food detection` with a food ration out of sight: "Your nose tingles and you smell food."
- [ ] (8) Raise attack spells to Skilled (wizard) and **Wizard: cast** `fireball`: "Where do you want to cast the spell?" with the reachable cells highlighted; tap a monster twice: fireballs explode there. Below Skilled it asks a direction (a ray). Cast `magic missile` at a monster, `create familiar` (a tame pet appears), `cause fear` (monsters in sight flee), `clairvoyance` (the area around you is mapped) and `knock` at a `newt` ("The newt is knocked back!").

## 7f-a position prompt and teleport control

With `?wizard=1` (`Ctrl+w` wishes). The position prompt shows its question in the log, a cursor and **Pick** / **Cancel** buttons; a tap moves the cursor, a second tap on the same cell picks it. Keys work as in Look (`;`); `z`/`Z` jump between highlighted cells.

- [ ] Wish `blessed scroll of teleportation` and read it: "Where do you want to be teleported?" and the cursor on you. Tap a far spot in another room once (the cursor moves, nothing happens), tap it again: you are there. Read another and press **Cancel**: you stay put (the scroll is used up and known).
- [ ] Read one more and pick a wall: "Sorry..." and you land somewhere at random.
- [ ] Wish `ring of teleport control`, put it on. Wish `teleportation trap` (it appears under you, unseen), step off and back on: the prompt asks where; pick a spot and land there.
- [ ] Wish `level teleporter`, step off and back on: "To what level do you want to teleport?"; type a depth (e.g. 3): you arrive on that level ("You briefly feel centered."). Type nonsense at a second one: you are asked again with a hint.
- [ ] In the self-actions menu choose **Wizard: teleport**: the cursor appears without the ring too; pick a wall: "Sorry...". Pick a floor spot: you are there.
- [ ] Wish `jumping boots` and wear them: **Jump** appears in the self-actions menu (`Alt+j`). Choose it: "Where do you want to jump?" and the cells you can reach (up to 3 squares, not through walls or boulders) are highlighted; `z` cycles them. Tap one twice: you land there and lose a turn. Pick a cell outside the highlight four squares away: "Too far!" and no time passes.
- [ ] Create a `newt` (`Ctrl+g`) and jump to a cell straight past it: "You bump into a newt." and you stop short of it. Wish `pit`, step off it and back: you fall in. Jump out: "You leap from the pit!". Jump back across it: "You pass right over a pit."
- [ ] Take the boots off: **Jump** is gone. Wish `blessed spellbook of jumping`, read it, and cast jumping (`Z`; raise your level with the wizard level change if you lack energy): the same highlighted cursor (more cells once escape spells are Basic); Cancel says "Nothing happens." and still uses the move and energy. **Jump** is offered again while you know the spell and casts it.

## 7f-b invisibility

With `?wizard=1` (`Ctrl+w` wishes, `Ctrl+g` creates a monster: type `invisible jackal` for an invisible one). An `I` is a remembered, unseen creature; it stays on a square you can see until you find out what is there.

- [ ] Wish `wand of make invisible`, create a `jackal` a few squares away and zap the wand at it: it vanishes (the wand becomes known). When it bites you an `I` appears where it is ("It bites!").
- [ ] Walk into the `I`'s square while the jackal is there: you attack it. Create an `invisible jackal` (it is not shown) and walk into it: "Wait!  There's something there you can't see!", an `I` appears and the turn passes.
- [ ] After the jackal has moved off an `I`, tap the `I`: **Fight it** is offered (no Move there). Fight: "You attack thin air." and the `I` is gone. Search (`s`) next to an invisible jackal: "You feel an unseen monster!" and an `I`.
- [ ] Throw your dagger at an invisible jackal you know is in a line: an `I` is left where it was hit.
- [ ] Wish `potion of see invisible` and quaff it: the jackal shows (an `I` under it is replaced).
- [ ] New game. Wish `ring of invisibility` and put it on: "Suddenly you cannot see yourself." and your `@` is drawn dimmed; zapping a `wand of enlightenment` lists you as invisible. Wish `mummy wrapping` and wear it: "You can see yourself!" and the `@` is normal again; take it off: "You can no longer see yourself."
- [ ] Still invisible, create a `jackal` next to you and wait several turns: besides bites and misses, now and then "The jackal snaps wildly and misses!", "The jackal attacks a spot beside you." or "The jackal strikes at thin air!". Create a `water nymph`: now and then "The water nymph tries to touch you and misses!". Create a `woodland elf`: it never misses wildly (elves see invisible).
- [ ] Still invisible, create a `kobold shaman` next to you: now and then "The kobold shaman casts a spell at thin air!"; when it cannot cast, sometimes "The kobold shaman points and curses in your general direction." Create a `yellow light` next to you: sometimes "The yellow light explodes at a spot in thin air!" and you are not blinded.
- [ ] Level teleport to Minetown (`Ctrl+o` marks it; not Orcish Town) and walk to Izchak's lighting store with the ring on: at the door "Izchak senses your presence." "Invisible customers are not welcome!" He stays on his square inside the door, in your way, however long you wait. Take the ring off, step away and back: the usual welcome, and he steps aside.
- [ ] In Minetown with the ring on, wish `pick-axe` and dig at a town wall while a watchman is in view: no "Hey, stop damaging that wall!" (he cannot see you). Remove the ring and dig again: he warns you.
- [ ] New game. Wish `cloak of invisibility` (an "opera cloak") and wear it: "Suddenly you cannot see yourself." and the dimmed `@`; take it off: "Suddenly you can see yourself." Wish `wand of make invisible` and zap it at yourself: "Gee!  All of a sudden, you can't see yourself." (for good).

## 7f-c statues

With `?wizard=1` (`Ctrl+w` wishes, `Ctrl+g` creates a monster by name, `Ctrl+v` level teleports). A statue is drawn as the letter of the monster it shows, in white; Look (`;` or the Look button, then tap) tells it from a live monster. What is left out is in ROADMAP "7f-c done".

- [ ] Wish `statue of a gnome` (it may drop to the floor: "Oops!  The statue of a gnome drops to the floor!"; else drop it) and step off it: a white `G` on the floor. Create a `gnome` next to it and Look at both: "You see: floor of a room, a statue of a gnome." and "You see: gnome, floor of a room.". Step back onto the statue: "You see here a statue of a gnome."
- [ ] Walk away so the statue is out of sight: it is still drawn as `G` (remembered). Look at it: only the floor is named (DEVIATIONS "Look cursor").
- [ ] Tap the statue next to you and choose **Fight**: "You harmlessly attack a statue." Kick it: "You kick a statue of a gnome." "Thump!" and it stays.
- [ ] Wish `wand of striking` and zap it at the statue: "The statue shatters." and rocks are left. Wish another statue, wish `pick-axe` and apply it towards the statue: "You start chipping the statue." then "The statue shatters."
- [ ] Optional: level teleport to a deep level (20+) and wish a few `statue of a gnome lord` or walk ordinary levels until a statue turns up (about 1 room in 20): breaking one sometimes drops a spellbook.
- [ ] Wish `statue trap` (it is made under you with a statue of a random monster; the trap is not shown). Step off and back on: "The statue comes to life!" and the monster stands next to you, hostile, with its gear.
- [ ] Wish another `statue trap`, step off, and search (`s`) next to it: "You find a <monster> posing as a statue." Wish one more, step off and zap striking at it: "Instead of shattering, the statue of a <monster> suddenly comes to life!"
- [ ] Wish `blessed spellbook of stone to flesh` and read it (raise your level with the wizard level change if it is too hard or you lack energy). Wish `statue of a jackal`, drop it next to you and cast stone to flesh at it: "The statue of a jackal comes to life!" Wish `boulder` and cast at it: it becomes an enormous meatball. Cast at yourself while carrying rocks: they become meatballs.
- [ ] Create a `chickatrice` and let it hiss until "You are slowing down."; cast stone to flesh at yourself: "You feel limber!" and the stoning stops.
- [ ] Wish `leather gloves`, wear them, wish `cockatrice corpse` and wield it. Hit a `jackal`: "The jackal turns to stone." and a white `d` statue is left; Look: "a statue of a jackal". Create a `purple worm`, let it swallow you and drop the corpse (the actions menu): "You drop a cockatrice corpse into the purple worm's stomach." "The cockatrice corpse is instantly digested!" "The purple worm turns to stone." and you jump out of the new statue.

## 7f-d polymorph

With `?wizard=1` (`Ctrl+w` wishes, `Ctrl+g` creates a monster by name, `Ctrl+v` level teleports; **Wizard: polymorph self** and **Wizard: change experience level** are in the self-actions menu). While polymorphed the map shows your form's letter and the status line shows `HD:n` in place of `Xp`. What is left out is in ROADMAP "From 7f".

- [ ] Wish `wand of polymorph`, create a `jackal` and zap it: "The jackal turns into a <monster>!" (now and then "The jackal shudders!" and it dies with no corpse). Drop several things (a few daggers, a food ration, a wand), step off, step back and zap down (`>`): they change into other objects of their class; sometimes "You feel shuddering vibrations." and some are gone.
- [ ] Zap the wand at yourself: you turn into a random monster ("You turn into a ...!"), or "You shudder for a moment." (system shock, more likely with low Con), or "You feel like a new woman!".
- [ ] New game. Wish `ring of polymorph control`, put it on, zap a wished wand of polymorph at yourself: "Become what kind of monster? [type the name]"; type `gnome lord`: "You turn into a gnome lord!" (a `G`, `HD:` on the status line). Type nonsense first: "I've never heard of such monsters." and you are asked again. (1 time in 5 you are asked nothing and get "You feel like a new woman!": zap again.)
- [ ] New game. Wish `ring mail` and wear it. **Wizard: polymorph self**, type `mumak`: "You break out of your armor!" (the mail is gone) and "You find you must drop your spear!". **Wizard: polymorph self** again, type `gnome lord` with armor worn: "Your armor falls around you!" (it lies on the floor).
- [ ] As a `jackal` (Wizard: polymorph self): Wear, Wield and Throw are not offered for your things. As a `lichen`, picking up only looks. As a `ghoul`: wish `food ration` and eat it: "You cannot eat that!".
- [ ] As a `jaguar`, create a `jackal` next to you and fight it: two claws and a bite, each with its own hit or miss ("You hit the jackal." / "You bite the jackal."). Zap a wished `wand of enlightenment`: "You are polymorphed into a jaguar."
- [ ] As a `floating eye`, create a `jackal` next to you and wait: now and then after it bites you, "The jackal is frozen by your gaze!". Fight it: "You have no way to attack monsters physically."
- [ ] As a `newt`, create a `soldier ant` next to you and let it fight you: when the newt's hit points run out, "You return to human form!" with your own hit points back.
- [ ] At experience level 1 become a `mumak` (level 5: the form lasts 100 to 200 turns) and search or rest until "You return to human form!".
- [ ] Become a `newt`, then wish `amulet of unchanging` and put it on (with it on, polymorphing fails: "You fail to transform!"). Let a `soldier ant` kill you and answer yes to "Die?": the stone reads "killed while stuck in creature form" (try it last).
- [ ] New game. Wish `amulet of change` and put it on: "You are suddenly very masculine!" and the amulet is gone.
- [ ] Wish `potion of polymorph` and quaff it: "You feel a little strange." and you polymorph. Wish `polymorph trap` (made under you, unseen), step off and back on: "You feel a change coming over you." and you polymorph; the trap is used up. Wear wished `iron shoes` and step on another polymorph trap: "Your pair of hard shoes warps strangely." (they are kicking boots now).
- [ ] Polymorph into a `jackal` and zap a wished `wand of cancellation` at yourself: "You return to human form!" (your inventory is cancelled too).
- [ ] **#monster** (the self-actions menu's **Use monster ability**, `Alt+m`): first raise your energy with **Wizard: change experience level** (e.g. to 14). It is not offered in your own form, nor as a `jackal` or a `water nymph`.
- [ ] As a `winter wolf cub` with 15 or more energy: **Use monster ability**, pick the direction of a created `gnome` in line: "The blast of frost hits the gnome!" (or misses), and 15 energy is gone. Again at yourself (`.`): "You don't feel cold." (you resist). With less than 15 energy: "You don't have enough energy to breathe!".
- [ ] As a `cobra`, spit at a `gnome` two squares away: "The venom blinds the gnome!" (or "The splash of blinding venom misses the gnome." and "Splash!"). Spit at a wall: "Splash!".
- [ ] As a `pyrolisk` with 15 or more energy, create a `gnome` in sight and use the ability: "You attack the gnome with a fiery gaze!" and 15 energy is gone. With no one in sight: "You gaze at no place in particular.". In Minetown with a peaceful watchman in sight: "Really attack the watchman?" (No spares him). Create a `floating eye` and gaze: "You are frozen by the floating eye's gaze!".
- [ ] Become a lycanthrope: create a `werejackal` (Ctrl+g) and let it bite you until "You feel feverish.", then wish `unholy water` and quaff it: you turn into a werejackal (`d`). **Use monster ability** with 10 or more energy: "You call upon your brethren for help!" and tame jackals appear next to you.
- [ ] As a `gremlin`, use the ability away from a fountain: "There is no fountain here." (no time passes). Level teleport to Minetown, stand on a fountain `{` and use it: "You multiply!" and a tame gremlin stands next to you with half your hit points.
- [ ] As a `shrieker`, use the ability: "You shriek." and the sleeping monsters of the level wake.

## 12 special rooms

With `?wizard=1`: **Wizard: make this room special** (in the self-actions menu) turns the ordinary room you stand in into a chosen kind and fills it; **Wizard: wish** also takes terrain (`throne`, `altar`, `fountain`, `sink`, `tree`, `iron bars`) and makes it under you; **Wizard: level teleport** and **Wizard: map the level** find the rest. Steps 1-7; what is left out is in ROADMAP "From m12".

- [ ] (1) On DL5 or deeper, make a room a **throne room** and step out and back in: "You enter an opulent throne room!" once; the court sleeps, a ruler (an ogre king, dwarf king, gnome king...) sits by a throne `\` with a mace, and a chest holds gold. Do the same with a **leprechaun hall** ("You enter a leprechaun hall!", gold heaps growing away from the door) and a **treasure zoo** (sleeping monsters on gold).
- [ ] (2) Wish `throne` and **Sit** several times: the effects come one by one (an electric shock, "You feel much, much better!", a wish prompt, a genocide prompt, an audience of courtiers, ...), and at least once "The throne vanishes in a puff of logic." Wish another and **Kick** it: "Ouch!  That hurts!", now and then gold or gems fall out. Try to dig it with a pick-axe: "The throne is too hard to break apart."
- [ ] (3) Make a **beehive** ("You enter a giant beehive!": a queen bee, killer bees, lumps of royal jelly; wish `lump of royal jelly` and eat it: Str up), a **cockatrice nest** ("You enter a disgusting nest!", statues holding items), an **anthole** ("You enter an anthole!") and **barracks** ("You enter a military barracks!", sleeping soldiers with their officers).
- [ ] (4) Make a **morgue**: "You have an uncanny feeling..." (undead asleep, corpses, maybe a chest). Create a `ghost` (Wizard: create a monster) next to a wall and watch it drift through the wall and the rock.
- [ ] (5) Level teleport to DL9 and deeper until a temple appears (or make one): a priest by his altar greets you on entering. On some ordinary rooms an altar `_` or a sink `#` stands.
- [ ] (6) Level teleport around DL3-10 and map each level: about half have a closed 2x2 vault full of gold `$`. On some, search the walls of an ordinary room next to a dead-end niche: a secret corridor appears; step on it: a teleporter puts you inside the vault (it works once).
- [ ] (7) Wait in the vault (search with a count, or **Wait** many times): about 30 turns in, "Suddenly one of the Vault's guards enters!" and "Hello stranger, who are you?" with the phone keyboard. Type a name: "I don't know you." ... "Please drop that gold and follow me." Drop the gold and follow him: he digs a corridor to the nearest real one, disappears there ("Suddenly, the guard disappears."), and the corridor and his door close behind you. Next time answer `Croesus`: "Oh, yes, of course.  Sorry to have disturbed you." and he leaves. A third time keep the gold and wait: "I repeat, drop that gold and follow me!" then "You've been warned, knave!" and he attacks. Wish `cursed tin whistle` and apply it in the vault: the guard comes on the next turn. **#chat** with him: "Please drop that gold and follow me."

## 13 monster batch 2

With `?wizard=1`: **Wizard: create a monster** (`^g`) makes any monster by name next to you; **Wizard: wish** (`^w`) gives objects; **Wizard: make this room special** and **Wizard: level teleport** find shops, Sokoban and Mines' End. Steps 1-8; what is left out is in ROADMAP "From m13".

- [ ] (1) Wish a `dagger`, drop it, create a `garter snake` on it and step out of sight and back: only the dagger shows. Walk onto it: "Wait! There's a garter snake hiding under a dagger!" (the move is spent). Create a `rock piercer`, walk out of its view and back under its square: "A rock piercer suddenly drops from the ceiling!" (wear a hard hat: it bounces off). Create another one and **Search** next to it once it is hidden: "You find a rock piercer." Create a `trapper` and walk under it: it engulfs you.
- [ ] (2) Create a `giant mimic` in a doorway: it shows as a closed door, and Look names a door. Create one on the floor: it shows as an object or furniture. Walk into it: "Wait! That's a giant mimic!" and you are stuck to it until it dies. Walk away and come back: the disguise is remembered, not the mimic. Kill one, look at its square again: the remembered thing is gone.
- [ ] (3) Level teleport to DL5-12 and **Wizard: map the level** until a shop has an odd item that is a mimic (bump it). Go to Sokoban's first level (up from the level after the Oracle): two of the boulders are giant mimics (bump them). Mines' End (the Mimic of the Mines variant): some gray stones in the niches are mimics.
- [ ] (4) Create a unicorn of your alignment (a `white unicorn` if lawful, `gray unicorn` if neutral; enlightenment tells): it is peaceful; stand in a straight line with it: it keeps out of line or teleports away. Wish `unicorn horn`, get confused (a potion of confusion or booze) and **Apply** the horn: the confusion goes ("You feel less confused now."). Wish a `ruby` and **Throw** it at a co-aligned unicorn: "The white unicorn graciously accepts your gift." (or gray) (Luck up in enlightenment). Kill it: "You feel guilty..." and its corpse leaves a unicorn horn.
- [ ] (5) Create a `long worm`: its `~` tail follows it and grows over time. Hit the tail with a wielded long sword until "You cut part of the tail off" or "You cut the long worm in half." Kill the head: every segment goes and a worm tooth drops. Wield the tooth, read a scroll of enchant weapon: it is now a crysknife.
- [ ] (6) Create each golem (`straw golem` ... `iron golem`): each has its fixed hit points (probe it). Burn a `paper golem` with a wand of fire: it burns away, no scrolls. Zap a wand of cancellation at a `clay golem`: it dies. Cast or wish-read stone to flesh at a `stone golem`: it becomes a flesh golem. Drop several iron items (wish `5 iron shoes`) and zap polymorph at the pile: "Some iron objects meld, and an iron golem arises from the pile!" (when enough of them melt down).
- [ ] (7) Wish `blessed figurine of a kitten`, **Apply** it and pick a square next to you: "You set the figurine beside you and it transforms." into a tame kitten (most times). Wish `cursed figurine of a jackal` and carry it a long time (or wait many turns): it transforms on its own ("You see a jackal drop out of your pack!").
- [ ] (8) Create an `umber hulk` beyond a wall: it digs through rock and walls to you without a pick, and its gaze confuses you. Create a `xorn` and an `earth elemental` behind a wall: they walk through it. Create a `stalker` (invisible: an `I` when it hits), kill it and eat the corpse: "Gee!  All of a sudden, you can't see yourself."; eat another while still invisible: "You feel hidden!". Create a `black light` next to you: it explodes, "You are caught in a blast of kaleidoscopic light!" and you hallucinate. Create a `red naga` (it breathes fire at range) and a `red naga hatchling`; **#chat** with either: "mumbles incomprehensibly". Create a `Nazgul` and kill it: it drops a knife, a long sword and a cursed ring of invisibility. Read a confused scroll of light (cursed: black lights, unseen): "Lights appear all around you!" with tame yellow lights. Create a `jabberwock`: it is usually asleep and hard to wake.

## 14 monster item use

With `?wizard=1`: **Wizard: create a monster** (`^g`) makes any monster by name next to you (prefix `hostile` to make sure it attacks); **Wizard: wish** (`^w`) gives objects; **Wizard: level teleport** for the stairs checks. There is no wizard command to hand a monster an item: drop the item on the monster's square (or one step in front of it) and wait a turn; a hostile `hill orc` or `gnome lord` picks up what it can use ("The hill orc picks up a wand of fire."). To wound a monster without killing it, hit it a few times with a weak weapon (or throw daggers). Steps 1-7; what is left out is in ROADMAP "From m14".

- [ ] (1) Wish `potion of healing`, drop it, create a `hostile hill orc` on it and hit the orc down to a few hit points: it "drinks a potion of healing!" and "looks better." Level teleport to DL3, create a `hostile hill orc` on the down stairs and wound it: "escapes downstairs!"; go down: it is on or by the up stairs. On DL1, wound one standing on the up stairs: it escapes the dungeon for good.
- [ ] (2) Wish `wand of digging` and drop it for a `hostile gnome lord`; wound it: "zaps a wand of digging!", a hole, and it falls through. Do the same with a `scroll of teleportation`: it reads it and vanishes. Wish `unicorn horn`, let a hostile orc pick it up, then confuse it (throw a `potion of confusion` at it): it "uses a unicorn horn!".
- [ ] (3) Drop a `wand of fire` for a `hostile hill orc` and stand in a straight line with it a few squares away: "The hill orc zaps a wand of fire!"; the first bolt always misses, later ones can hit. Wish and wear a `shield of reflection`: the bolt reflects ("But it reflects from your shield!"). With a `wand of striking`: "The wand hits you!" or "Boing!". Anger a shopkeeper (DL5+, **Wizard: make this room special** a shop, or find one) and he zaps his wand at you.
- [ ] (4) Drop a `potion of sleeping` and a `potion of blindness` for a hostile orc and step into line with it: it "hurls a potion of sleeping!", the bottle shatters on your head and the vapors make you yawn or sleep. **Throw** a `potion of sleeping` at a monster: it shatters and the monster falls asleep. Drop a `scroll of earth` for a hostile orc and stand next to it: it reads it and boulders fall around (and on) both of you.
- [ ] (5) Drop a `potion of speed`, a `potion of invisibility` and a `potion of gain level` for a hostile `gnome` (a weak monster) in view: it drinks them ("is suddenly moving faster.", it vanishes, "seems more experienced."). Drop a `wand of polymorph` for another gnome: it zaps itself and turns into something else. Wield any weapon next to a hostile orc carrying a `bullwhip` it wields: sometimes it whips your weapon away.
- [ ] (6) Let a hostile orc pick up a `lizard corpse` (wish `lizard corpse`), then wish `cockatrice corpse` with `leather gloves` on and hit it with the corpse: it starts to stone and eats the lizard: "seems limber!". Let one pick up an `amulet of life saving` (it puts it on) and kill it: "But wait... The hill orc's medallion begins to glow!", "The medallion crumbles to dust!", and it lives once more.
- [ ] (7) Level teleport to DL8-12 and kill a few thinking monsters (orcs, gnome lords, dwarves, soldiers, liches): now and then one drops a wand, potion or scroll it was made with, and some use theirs on you before dying. A `hostile kobold shaman` (or `orc shaman`) picks up a ring or spellbook you drop (magic lovers). A pet does not pick up a cursed item you drop.
