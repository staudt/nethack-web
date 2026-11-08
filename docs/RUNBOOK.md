# Runbook: unattended milestone loop

How an orchestrator session (started with `/loop Follow docs/RUNBOOK.md`) works through milestones while the user is away. The orchestrator delegates every plan and every step to a fresh subagent and only checks, records and decides. It never writes game code itself.

## Queue

Work through these in order. A milestone is done when all its plan steps are committed and green.

Done in run 1 (2026-11-03/04, merged to `main` at 3a62315): 6b3 shops, 7a spellcasting, 7c Mines' End/fountains/Orcish Town.

Run 4 (from 2026-11-07), budget **6M** with a fresh ledger section ("## Run 4"). One chain of branches, each off the previous tip: `tools` off `m7e`, then `m7e` fast-forwarded to `tools` for the 7e rest, then `m9` off `m7e`, then `m10` off `m9`.

1. **Speed-ups** (branch `tools` off `m7e`, two steps, no planning agent; golden must stay unchanged):
   - Step A, **data converter**: a script under `packages/testkit` (or `tools/`, Node only, never imported by `core`/`content`) that parses `vendor/nethack/include/monsters.h` and `objects.h` into the content def format, plus a test that checks every existing `nh:` monster and object def against the C row (stats, attacks, flags, weight, cost, probability), with the known intentional differences listed in the test. It does not replace existing defs or add new ones yet. Document how a later milestone uses it to add a batch.
   - Step B, **fast/slow tests and the port map**: split the slow random-play tests (soaks, golden, determinism, large replays) into a `slow` project or pattern, add `pnpm test:fast` for agents' iteration; `pnpm check` still runs everything. Generate `docs/PORTMAP.md` (NetHack file/function -> our file) from the `// ref:` citations with a script and `pnpm portmap`, and mention it in `CLAUDE.md`'s conventions so agents look things up there first.
2. **Rest of 7e** (branch `m7e`: `git checkout m7e && git merge --ff-only tools`): steps 6-8 of `~/.claude/plans/m7e.md` (#untrap; breaking wands with explode(); shop damage and repair), kickoff `docs/kickoff-m7e.md`; then move the 7e leftovers off ROADMAP and append the TESTPLAN lines. The plan's "Run 3 stop" bullet lists what remains; webs stay deferred to the monster batch.
3. **m9 damage types and attack styles** (branch `m9` off `m7e`, planning agent first): port the missing `AD_*` damage types and `AT_*` attack styles for all three directions (monster vs hero, hero vs monster, monster vs monster): stoning (and cockatrice corpses/eggs/touch), sliming, level drain, theft (nymph, leprechaun), engulfing/digestion, gaze, exploding monsters, rust/corrode/rot, lycanthropy, teleport, disease, hunger, sticky/wrap (drowning), curse items, slow, drain energy, and the passives. Add only the monsters needed to test them if any; the batch comes next. Polymorph-dependent effects go to 7f.
4. **m10 monster batch 1** (branch `m10` off `m9`, planning agent first): with the step-A converter, add the vanilla monsters up to about difficulty 10 whose attacks now exist, with their corpse effects, generation flags and webs (spiders). Expect the golden and random-roll changes on every batch step: verified cause in each commit.
5. **Draft only, read-only, alongside any step**: a planning agent writes `~/.claude/plans/m7f.md` (teleport control / position prompt, invisibility, statues, polymorph) with options and a recommendation each; nothing is built. Park it in `docs/DECISIONS-PENDING.md` for the user (the orchestrator commits that entry and `docs/kickoff-m7f.md` if the planner wrote its text into the plan file).

Roles and races are not in this run (user, 2026-11-07).

Run 3 (2026-11-07, stopped on budget at ~2.66M; `m8` finished, `m7e` steps 1-5):

1. **Finish release polish**: m8 steps 3-6 on branch `m8` (plan `~/.claude/plans/m8-polish.md`, kickoff `docs/kickoff-m8.md`). The high-score format is approved (see `docs/DECISIONS-PENDING.md`), so step 4 is unblocked.
2. **7e content-only leftovers**: branch `m7e` off `m8`; plan it (the 7e list in `docs/ROADMAP.md` "From 7d": #untrap, trapped doors/boxes, webs, rolling boulders, land mines, breaking wands, pick-axes), then its steps. Anything needing a core contract change goes to 7f / parked, not built.

Run 2 (2026-11-06/07, stopped on budget; branches `look`, `m7b`, `m7d`, `m8` steps 1-2):

1. **Look cursor by keyboard**: branch `look` off `main`, one step, no planning agent. Today `;` (and the Look button) only accept a mouse/tap target. Port C's `getpos()` cursor: after `;`, a cursor starts on the hero and moves with the direction keys (`hjklyubn`, capitals move 8, arrow keys and numpad too), `.`/`,`/`;`/`:` pick, Esc cancels; `<`/`>` jump to stairs, `m`/`M` cycle monsters, `o`/`O` objects, `@` back to self (the subset that fits). Tapping still picks directly. Same cursor for any other "pick a position" prompt that uses the same path (e.g. travel `_`, jumping, spell targets) if they share it. Phone: a tap still works; no feature may need a keyboard. Add a TESTPLAN section.
2. **Boulders and Sokoban**: plan approved at `~/.claude/plans/m7b-sokoban.md` (user took all four planner recommendations on 2026-11-06), kickoff `docs/kickoff-m7b.md`. Branch `m7b`: fast-forward it to the tip of `look` first (`git checkout m7b && git merge --ff-only look`), 8 steps.
3. **Deferred wands, rings and traps**: planned as m7d (`~/.claude/plans/m7d-wands.md`, branch `m7d` off `m7b`, 8 steps); the rest is split into 7e (content only: #untrap, trapped doors/boxes, webs, rolling boulders, land mines, breaking wands, pick-axes) and 7f (core contracts, needs the user: position prompt, invisibility, polymorph, statues). Originally: the 5b deferrals in `docs/ROADMAP.md` (wishing, digging, teleportation, polymorph and the other wands; the missing rings and amulets; the other trap types and `#untrap`).
4. **Release polish**: help and key-list screen, options screen, death screen (DYWYPI, tombstone), high-score list that skips games whose mod list includes `wiz`, title/new-game screen.

## Where am I?

On every wake-up, work out the state from disk, not from memory of the conversation: the ledger (last line), `git log --oneline -5` on the current branch, and the "Changes during work" bullets of the current plan. If an agent is still running (a spawn without a completion in the ledger), wait for its notification; on the `/loop` heartbeat, schedule the next wake-up 1800 s out and do nothing else.

## Budget and stops

Keep a ledger at `~/.claude/plans/overnight-ledger.md`: one line per agent with date, milestone, step, commit, `subagent_tokens` from its completion notification, and a running total. Add 10% to the total for the orchestrator's own turns.

Stop cleanly (finish nothing new, write the morning summary) when any of these happens:

- **Budget:** the running total with margin reaches the run's budget (run 4: **6,000,000 tokens**). Never start an agent whose typical cost (300k for a step, 250k for a plan) would cross it.
- **Red check:** `pnpm check` fails after one retry and one fix agent.
- **Unexplained golden:** a step changes the golden hash without a verified cause in its commit body.
- **Design stop:** an agent stops on a design question it says is costly to get wrong.
- **Usage limit twice:** the first time an agent hits the usage limit, wait for the reset (ScheduleWakeup) and resume the same agent with SendMessage; the second time in one night, stop.
- **Queue empty.**

## For each step

1. Spawn one `general-purpose` agent with the step brief below. Model tiering (run 4): porting mechanics, planning and fix agents use the default (Opus); docs-only wrap-ups, TESTPLAN sections and pure data batches use `model: sonnet`. Do not run two agents that write to the repo at the same time. A read-only planning agent may run alongside a step agent.
2. When it reports, verify yourself: `git status` clean and the commit is there. Then, from run 4, verify **in the verify worktree** so the next step can start at once: `git -C <verify> checkout -q --detach <hash>` (create it once with `git worktree add --detach /home/ricardo/git/nethack-verify <hash>`), `pnpm install --frozen-lockfile --offline` there only if the lockfile changed, then `pnpm check` there (with `export PATH=$HOME/.local/share/pnpm/bin:$PATH`), in the background, and spawn the next step agent meanwhile. Record and push only once that check is green; if it is red, stop the next agent, then follow the failure rule below. Never run two verify checks at once.
   - A timeout or SIGKILL (exit 137) under load: rerun once on a quiet machine.
   - A real failure: one fix agent (brief: the failing output, fix it in a new commit, same rules). Still red: stop.
3. Record the step in the ledger and one line in the memory file `m6-choice.md` (or the current milestone's memory file): commit hash, what it did.
4. Push the branch: `git push -u origin <branch>`. Never push `main`, never fast-forward `main`, never force-push.

### Step brief (fill in the brackets)

> You are implementing ONE step of milestone [id] in /home/ricardo/git/webhack (a NetHack TypeScript port), on branch `[branch]` (checked out, clean; latest commit [hash]: [subject]).
>
> Read first, and only these to start: `CLAUDE.md` (project rules: follow exactly), the plan `[plan path]` (Key decisions, Key types, Steps, User decisions, Changes during work: all earlier Step bullets), `[kickoff path]`. Then only the code the step touches.
>
> [Notes for this step from the previous step's report, verbatim where useful.]
>
> Your task: plan step [n] ("[title]") exactly as the plan describes it. Implement this step only. Decide the vendor port subset before reading vendor code, then read only those functions; `// ref:` citations on ported mechanics. [Golden: must stay unchanged / this is the golden update: explain and verify the cause in the commit body, e.g. neutralise it and get the old hash; fix seed-lucky tests by seed search, pinning or `debugMongen`, never by weakening real assertions.] Tests assert outcomes, not lucky seeds.
>
> Rules: pnpm via `export PATH=$HOME/.local/share/pnpm/bin:$PATH`; targeted tests while working; `pnpm boundaries` after new imports; prettier only on changed files (never whole packages, never `git checkout` to undo formatting); full `pnpm check` green before committing, with no other test run of yours still going; one commit, Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; do NOT push. Record deviations as a "Step [n]:" bullet under "## Changes during work" in the plan; NetHack rule differences in `DEVIATIONS.md`; core public-interface changes explained in `ARCHITECTURE.md` and the commit. If you hit a design decision the plan doesn't settle that is costly to get wrong, stop and report instead of guessing.
>
> Final report (compact): commit hash, files touched, ported/skipped, plan deviations, golden status, `pnpm check` result, what the next step needs to know. Last step only: a phone-check list for the user.

## Between milestones

1. When a milestone's last step is green and pushed, append its phone-check list to `docs/TESTPLAN.md` (see the format there) and commit that on the milestone branch.
2. Create the next milestone's branch from the previous milestone's branch (main stays where the user left it): `git checkout -b <next> <previous>`.
3. Spawn a planning agent (brief below). It writes `docs/kickoff-<id>.md` and `~/.claude/plans/<id>.md`, and takes its own recommendation for every open question.
4. Read its report. Any question it marks **costly to undo** (save-format design, a big core public-interface change, removing or reworking existing behaviour, anything touching the mod platform contract): write it to `docs/DECISIONS-PENDING.md` as **parked**, skip this milestone and plan the next one in the queue instead. Otherwise log every default it took in `docs/DECISIONS-PENDING.md` as **taken**, commit the kickoff and that file on the new branch, and start step 1.

### Planning brief

> You are PLANNING (not implementing) milestone [id: title] for /home/ricardo/git/webhack, a NetHack TypeScript port, on branch `[branch]` (latest commit [hash]). Do not change code. You write two files: `docs/kickoff-[id].md` (style of `docs/kickoff-m6b.md`) and `~/.claude/plans/[id].md` (style of `~/.claude/plans/m6b3-shops.md`: Key decisions, Key types, Steps sized for one agent session = one commit with `pnpm check` green, where the golden changes, module-graph pitfalls, phone check, Open questions).
>
> Scope: [queue entry text]. Read narrowly: `CLAUDE.md`, the latest plan's "Changes during work", `DEVIATIONS.md` and `docs/ROADMAP.md` deferrals for this area, the code the milestone touches, and only the vendor functions you will port. Decide the port subset before reading vendor code.
>
> For each open question give your recommendation and mark it **costly to undo** or **cheap to change later**. The loop will take your recommendation for cheap ones without asking.
>
> Final message: paths written, a ~12-line step summary, the open questions with recommendations and their marks.

## Morning summary

When stopping for any reason, write the final message for the user:

- what got done (milestones, commits, branches pushed), the stop reason, and the ledger total;
- `docs/DECISIONS-PENDING.md` items to review;
- the new `docs/TESTPLAN.md` sections to run;
- the merge needed: `main` is still at the commit the user left; each finished branch fast-forwards it once the test plan passes.
