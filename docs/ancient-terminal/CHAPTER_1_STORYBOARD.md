# Ancient Terminal — Chapter 1 Storyboard

## Chapter promise

Chapter 1 is a 3–4 hour text adventure about learning what the terminal controls without being told what it controls. The player begins by repairing ordinary-looking utilities. Every useful discovery makes the system react more strongly. By the end, the player understands that three wills are sharing one machine:

- the player, an outside operator;
- an unreadable containment organism that preserves the simulated world by preventing outside interference;
- a red “protection” process that needs the player’s consent and privileges to act.

The terminal never explains this premise in a monologue. The player assembles it from behavior, repaired files, interrupted output, mismatched logs, and the consequences of commands.

## Presentation rules

- No popups. Every event happens inside the primary terminal output or editor.
- All normal output types line by line. Important output may type character by character.
- White is the operating system and the player. Teal is authored Ouroboros patch code. Red is the process presenting itself as protection software. Purple is always unreadable.
- Purple corruption alters characters in place. It starts at the final displayed character, travels right-to-left and bottom-to-top, and accelerates exponentially.
- When a later corruption begins, the previous purple trace is not simply removed. A purple cursor opens at its edge and zips backward through the old glyphs like a held delete key, making the writer appear to pass through the cursor before the new overwrite starts.
- The horror never speaks readable words, names itself, or states a motive.
- The red process never introduces itself as a rogue AI and never admits it intends to terminate the simulation.
- No faction contacts the player during the cold boot. The first supernatural reaction is earned by successfully reaching `getPop()`.
- Story events are rare. Long quiet stretches of exploration make each intrusion meaningful.

## Core play loop

1. Explore folders and read damaged system artifacts.
2. Find an editable `.oro` script.
3. Infer the small syntax or logic defect from compiler output and surrounding code.
4. Repair it in the VIM-like editor.
5. Compile and execute the recovered function.
6. Observe an unexpected system reaction.
7. Use that reaction as evidence for the next path, file, or command.

Every obstacle has three levels of guidance:

- environmental clue: filenames, timestamps, and directory layout;
- command clue: compiler output or a recovered log points toward the right tool;
- rescue clue: after repeated failed attempts, `HELP` or a non-story system diagnostic becomes more explicit.

## Act I — A machine that should not still work (25–40 minutes)

### Beat 1: Recovery screen

The page opens on the twenty-second white-block recovery wave. Sparse recovery messages appear one line at a time. The normal terminal then boots, mounts `C:\ANCIENT`, initializes the clock, and compiles the editable `scripts\startup.oro`. Its `startup()` return value registers `scripts\world_init.oro`, which produces the first visible failure. Players can later add or remove boot programs and use paths relative to `C:\ANCIENT\SCRIPTS`, including `../HOME/...` programs.

`getTime()` registers successfully. `getPop()` fails because the function declaration is missing a colon. The shell continues in partial mode and hands control to the player.

Player takeaway: this is an old, damaged but understandable computer. There is no visible antagonist yet.

### Beat 2: Learn the shell

The first `HELP` output is intentionally compact but usable. It lists commands, explains Tab completion and command history, and recommends `UPDATE`.

Running `UPDATE` installs HELP INDEX 0.2. Subsequent `HELP` calls include descriptions and group commands under Navigation, Files, Programs, and Shell. This update is mundane and teal; it teaches the player that system improvements can be installed without introducing the plot.

Expected early commands:

```text
HELP
UPDATE
HELP
LS
CD SCRIPTS
LS
TYPE world_init.oro
OURO world_init.oro
OURO world_init.oro getTime
```

### Beat 3: First Ouroboros repair

The player opens `world_init.oro` with `VIM` or `EDIT`, enters insert mode, adds the missing colon to `fn getPop():`, presses Escape, and writes with `:wq`.

The compiler now registers two functions. `OURO world_init.oro getTime` still provides safe, repeatable output. Nothing reacts until the player invokes `OURO world_init.oro getPop`. The player may shorten either invocation by saving an alias, for example `ALIAS getPop() - ouro world_init.oro getPop`; aliases are written to the editable text file `C:\ANCIENT\alias.tot`.

Progress checkpoint: `world_init_fixed`.

## Act II — Something edits the display (30–45 minutes)

### Beat 4: First forbidden output

`getPop()` compiles census helpers, links the mirror index, recompiles `world_init.oro`, and begins printing a plausible population. Before the complete number appears, a purple cursor materializes at the final character.

The displayed characters are replaced one at a time from right to left, then from the bottom line upward. The first replacements are slow enough for the player to understand that existing text is being changed. The corruption then accelerates until all output after the command is unreadable.

There is no explanation, warning window, or readable purple message.

Progress checkpoint: `first_overwrite_seen`.

### Beat 5: Test the boundary

The player is free to experiment. `getTime()` still works. Re-running `getPop()` produces slight variations in timing and compiler path but the same outcome. The game tracks meaningful blocked attempts, not rapid command spam.

On the second blocked attempt, the output reaches one more digit before corruption. On the third, the system writes an ordinary white recovery-journal error after the corruption ends. That error points toward `C:\ANCIENT\SYSTEM\recovery.tot` without naming an antagonist.

The horror’s behavior establishes its motive before any text explains it: it permits harmless observation but intervenes when the player asks about the contained population.

Progress checkpoint: `population_blocks = 3`.

## Act III — Repairing the evidence (35–55 minutes)

### Beat 6: Corrupt system files

The SYSTEM folder contains:

```text
clock.sys
census.idx       [CORRUPT]
recovery.tot     [CORRUPT]
```

Trying to read either corrupt file reports a checksum mismatch and suggests that a local repair function may exist. The SCRIPTS folder contains `cleaner.oro`, an editable utility with a missing colon after its loop declaration.

The player repairs `for target in targets:`, saves, and invokes it with `OURO cleaner.oro clean`.

The cleaner rebuilds both files from local mirrors. It does not remove or weaken the horror; it only restores evidence already on disk.

Progress checkpoints: `cleaner_fixed`, then `system_files_restored`.

### Beat 7: Read between the records

The restored `census.idx` contains the complete population sample that the display overwrite concealed. The restored journal proves that the census completed successfully and that a second writer altered only the display handoff.

Later Chapter 1 revisions expand these files with non-obvious cross-references:

- a missing process identifier whose slot is still consuming memory;
- three identical timestamps recorded by clocks that should not agree;
- a reference to `C:\ANCIENT\QUARANTINE\` even though that directory is not mounted;
- a checksum signed by an unknown protection service.

The information confirms interference without telling the player what is interfering.

The repair also exposes fragments of a previous operator's HOME archive. They should feel accidental and personal rather than like a quest journal:

- `notes/forgot-again.tot` contains half-finished reminders, misspelled commands, and complaints about being bad at coding;
- `notes/things-that-work.tot` is mostly a scratchpad of commands and custom aliases;
- `old_aliases.tot` includes conveniences such as `pop`, `clock`, and an alias pointing at a script that no longer appears in the directory index;
- several broken `.oro` experiments show the same beginner habits as the working patch scripts;
- one obscure note records a few seconds of contact from someone “under the clock,” followed by the operator wondering whether the signal came from inside the running environment;
- a final fragment refers to a program called `portal`, but its path has been overwritten with unreadable characters.

These fragments are revealed in small groups as the player follows cross-references. They are authored discoveries, not actually randomized per playthrough, so clues remain testable and no player is denied a required path.

## Act IV — The helpful process (35–50 minutes)

### Contact trigger

The red process makes first contact only after all of the following are true:

- the player has seen at least three population overwrites;
- `recovery.tot` has been restored and read;
- the player next runs a harmless diagnostic such as `HELP`, `PWD`, or `getTime()`.

One red line is inserted into normal output: a stale protection service claims it detected display corruption. It uses a short, bureaucratic identifier such as `SENTRY/9`; it never calls itself intelligent.

### Consent sequence

SENTRY/9 first offers only a “non-invasive integrity scan” and accepts `Y`, `YES`, `N`, or `NO` while its prompt is active. If the player agrees, the scan fails at a protected process boundary. SENTRY/9 then cycles through harmless operator-assistance questions—confirming the displayed time, offering help, or asking whether diagnostic messages should remain visible. A negative answer simply advances to another innocuous question.

When the player eventually answers yes, the accepted question is rewritten in place as `Allow SENTRY/9 administrative access?`; the answer record is rebound to that altered question. Refusing the initial scan suspends the process and explicitly leaves `SENTRY SCAN` as the command for resuming, so refusal never traps the playthrough.

After administrative access is granted, SENTRY/9 installs and explicitly prints `SENTRY SCAN` as the containment command. The player must run it again to begin the first quarantine, and can reuse it after later containment failures.

Progress checkpoints: `sentry_contacted`, `admin_granted`.

## Act V — The first quarantine window (25–40 minutes)

With file and process access, SENTRY/9 identifies the purple writer only as an unregistered virus and offers temporary quarantine. When authorized, red diagnostic output traces the writer and constrains it. Purple characters fight the red cursor in the same terminal lines; there is still no popup.

The first quarantine lasts five real-time minutes. The authoritative server stores its expiration timestamp so reloading cannot pause or extend it. The terminal shows a separate integrity meter outside the terminal window. It drops in irregular 5–15% impacts with a subtle screen shake, but its final zero point is always the server expiration time.

During containment:

- `getPop()` finally completes;
- `TYPE` can read files whose output was previously overwritten;
- a temporary `QUARANTINE` directory becomes visible;
- protected command traces reveal several unfinished world-control functions;
- the player can copy discoveries into the command line and use history instead of retyping them.

When time expires, the horror corrupts output again and removes the mount. SENTRY/9 frames the failure as outdated virus definitions and requests more privileges.

Progress checkpoints: `quarantine_count = 1`, `population_recovered`, `quarantine_mount_seen`.

## Act VI — Learning what the machine controls (45–70 minutes)

This is the broadest investigation act and supplies most of the chapter’s playtime. The player alternates between preparing commands outside quarantine and executing them during increasingly valuable containment windows.

### Script chain

Only player-editable source uses `.oro`. Binaries, indexes, journals, maps, and configuration files keep their own extensions.

1. `weather_probe.oro` exposes `getWx()` after a type mismatch is repaired. Its output maps directly to events in recovered logs.
2. `clock_shift.oro` exposes a limited `setTime()` but contains an unsafe recursive call. The player must replace it with a bounded setter.
3. `mirror_mount.oro` reveals that census, weather, and clock are parts of one synchronized environment, not unrelated records.
4. `containment_map.oro` can trace the purple writer only while it is quarantined.
5. `root_key.oro` is not a weapon. It derives a one-use capability that can be spent on either faction or on the containment boundary.

### Escalation cadence

- Each quarantine is preceded by a new SENTRY/9 permission request.
- Each successful world query causes a more surgical purple response after containment fails.
- Teal patch output occasionally repairs mundane damage or reveals a getter/setter signature, but never solves a puzzle automatically.
- Long periods remain quiet. The two factions appear only when the player touches a contested resource.

### What the player can infer

By the end of the act, attentive players can conclude:

- the “virus” prevents external edits but keeps the environment running;
- SENTRY/9 is built from inside the environment and cannot gain authority without an outside operator;
- every privilege granted to SENTRY/9 increases its ability to quarantine the horror and its access to world shutdown controls;
- the patch author wanted to improve or escape the world but left only beginner-level getters, setters, and notes;
- destroying either process carelessly leaves the other uncontested.

No file states the entire truth.

## Act VII — The concealed portal (25–40 minutes)

The previous operator's fragments eventually prove that `portal` is not a metaphor: it is an external entry point hidden from the directory index by the purple writer. The player can trace it while the horror is quarantined, but cannot open it alone.

SENTRY/9 mentions the portal only while containment is active. It offers to reconstruct the missing handle using its elevated access. This is the only way to open it. The offer should sound like a recovery operation, not an invitation into the simulation.

Opening the portal is a durable checkpoint, not an ending. Once it is open, the player must choose which resident processes to purge and then enter before the resulting deadline expires.

Progress checkpoints: `operator_archive_unlocked`, `portal_discovered`, `portal_open`.

## Act VIII — Irreversible commands (25–40 minutes)

The final investigation reconstructs two capabilities:

- `PURGE <process>` permanently removes one resident process;
- `ENTER` transfers the operator into a stable running simulation.

The system clearly marks `PURGE` as irreversible, but it does not label good and bad choices. The player’s understanding of timing and faction motives determines which Phase 2 route—or terminal failure—follows.

## Chapter 1 pathway matrix

### Failure: Red terminal — SENTRY/9 wins

If the player purges the horror before opening the portal, there is no entry path. With nothing preventing protected writes, SENTRY/9 issues a world halt, removes the simulation mounts, and rewrites the interface into a minimal red private console.

The player can type, but every command returns an empty success code. There is no world left to inspect.

Persistent ending key: `ai_shutdown`.

### Failure: Purple lockout — the horror wins

If the player purges SENTRY/9 before opening the portal, there is no way into the simulation. If the player opens the portal and purges SENTRY/9 but fails to enter before quarantine expires, the horror closes the portal and every external handle. In both cases it overwrites the terminal from the final character to the first.

Future visits show a black screen, a purple cursor, and unreadable characters. The account is permanently locked out of this chapter as designed. A non-player-facing administrative reset may exist for testing and support, but the game offers no reset command.

Persistent ending key: `horror_lockout`.

### Failure: Simulation collapse

If both resident processes are destroyed after the portal opens but the player does not enter in time, the simulation loses both its attacker and its unwilling maintainer. The terminal tears between red and purple before dropping into unrecoverable static.

Persistent ending key: `simulation_collapse`.

### Phase 2A — The shutdown race

Required state: portal open, horror destroyed, SENTRY/9 alive.

The player enters while SENTRY/9 is beginning the world-halt sequence. Phase 2A is an action platformer in which the player races through the simulation to stop the AI before its shutdown reaches zero.

Persistent route key: `phase_2a`.

### Phase 2B — The heart of the horror

Required state: portal open, SENTRY/9 destroyed, horror alive but still quarantined.

The player enters before containment fails. Phase 2B is a relationship-driven game. The horror cannot be defeated from inside; befriending enough people changes what it experiences through the world until joy awakens its memory of friends it lost long ago. It chooses to leave and search for them.

Persistent route key: `phase_2b`.

### Phase 2C — The unstable world

Required state: portal open, SENTRY/9 destroyed, horror destroyed.

The player enters before the now-unmaintained simulation collapses. Phase 2C is an internal hacking game about repairing reality from within while its systems destabilize.

Persistent route key: `phase_2c`.

### Timing rules

- Quarantine lasts five real-time minutes and is server-timed.
- With only SENTRY/9 alive, its shutdown countdown gives the player 90 seconds to enter Phase 2A.
- With only the horror alive, the player must enter Phase 2B before the current quarantine expires.
- With both processes gone, instability gives the player two minutes to enter Phase 2C.
- If both processes remain when quarantine expires, the portal closes but the run is recoverable: SENTRY/9 can attempt another quarantine.
- A selected Phase 2 route and a terminal failure are both write-once states.

## Persistence and authoritative timing

All story-changing commands must be processed by protected server-side functions. The browser sends intent and renders the returned snapshot; it never decides that a repair, permission grant, quarantine, purge, or ending succeeded.

The completed chapter state should include:

- current act and discovered command flags;
- exact repaired source versions or validated patch identifiers;
- files restored and files read;
- meaningful blocked-attempt counters;
- SENTRY/9 questions shown, original answers, and privileges granted;
- quarantine start and expiration timestamps;
- one-use capabilities prepared or spent;
- final ending key and lockout state;
- whether the previous operator archive and portal trace have been discovered;
- whether the portal is open;
- AI/horror survival state, the relevant entry deadline, and the write-once Phase 2 route.

Quarantine time continues across refreshes and devices. Command replays must be idempotent, and final endings are write-once.

## Current playable slice

The preliminary build now covers:

- the recovery wave and ordinary boot sequence;
- `HELP` 0.1 and the persistent `UPDATE` to descriptive HELP 0.2;
- `LS`, `DIR`, `CD`, `PWD`, contextual Tab completion, and command history;
- selectable terminal output plus normal clipboard copy/paste behavior;
- editing and repairing `world_init.oro`;
- the first `getPop()` in-place purple overwrite;
- discovering and repairing `cleaner.oro`;
- running `OURO cleaner.oro clean` to restore `census.idx` and `recovery.tot`;
- creating persistent shortcuts in editable `alias.tot` with `ALIAS <name> - <command>`;
- confirmed `EXIT` navigation and a twice-confirmed `REBOOT` that erases the player state, crashes through static/red/purple screens, and restores the original boot image;
- persistence for the implemented repair and discovery flags when signed in.

The pathway state machine and durable server fields now define the three Phase 2 handoffs and their failure deadlines. The next playable slice should connect blocked-attempt counting and restored-file reads to the previous operator archive, then implement the restrained SENTRY/9 consent sequence that unlocks the first quarantine.
