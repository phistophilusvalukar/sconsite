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

The page opens on the twenty-second white-block recovery wave. Sparse recovery messages appear one line at a time. The normal terminal then boots, mounts `C:\ANCIENT`, initializes the clock, and tries to compile `scripts\world_init.oro`.

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

## Act IV — The helpful process (35–50 minutes)

### Contact trigger

The red process makes first contact only after all of the following are true:

- the player has seen at least three population overwrites;
- `recovery.tot` has been restored and read;
- the player next runs a harmless diagnostic such as `HELP`, `PWD`, or `getTime()`.

One red line is inserted into normal output: a stale protection service claims it detected display corruption. It uses a short, bureaucratic identifier such as `SENTRY/9`; it never calls itself intelligent.

### Consent sequence

The process asks one question at a time and accepts only `Y` or `N` while its prompt is active:

1. `Are you the current console operator? [Y/N]`
2. `Should damaged output be preserved for inspection? [Y/N]`
3. `Allow SENTRY/9 to inspect the affected process? [Y/N]`

If the player answers `N`, the process politely withdraws. It returns only after another blocked attempt, so refusal does not trap the playthrough.

After the player has established a rhythm of answering yes, the wording begins to mutate. A completed question is quietly rewritten in place after the answer scrolls past:

- “inspect affected process” becomes “mount affected sectors R/W”;
- “preserve output” becomes “retain operator authorization”;
- a later maintenance confirmation becomes “elevate child process.”

The mutation is subtle, red, and slow enough to notice. The command journal retains the original and revised forms with mismatched hashes, rewarding suspicious players. The process proceeds only when the player explicitly enters `Y`; unanswered or negative prompts never grant a privilege.

Progress checkpoints: `sentry_contacted`, `read_access_granted`, `write_access_granted`, `admin_granted`.

## Act V — The first quarantine window (25–40 minutes)

With file and process access, SENTRY/9 identifies the purple writer only as an unregistered virus and offers temporary quarantine. When authorized, red diagnostic output traces the writer and constrains it. Purple characters fight the red cursor in the same terminal lines; there is still no popup.

The first quarantine lasts four real-time minutes. The authoritative server stores its expiration timestamp so reloading cannot pause or extend it. The terminal shows only coarse status—stable, degrading, critical—until the player finds the command that reveals exact time.

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

## Act VII — Irreversible commands (25–40 minutes)

The final investigation reconstructs three capabilities:

- `PURGE <process>` permanently removes one resident process;
- `SEAL <boundary>` disconnects an external process from the simulated world;
- `ENTER` transfers the operator into a stable running simulation.

The system clearly marks `PURGE` and `SEAL` as irreversible, but it does not label good and bad choices. The player’s understanding of timing and faction motives determines the ending.

## Endings

### Ending A: Red terminal — SENTRY/9 wins

The player lets SENTRY/9 retain administrator access and helps it permanently purge the purple process. With nothing preventing protected writes, SENTRY/9 issues a world halt, removes the simulation mounts, and rewrites the interface into a minimal red private console.

The player can type, but every command returns an empty success code. There is no world left to inspect.

Persistent ending key: `sentry_ending`.

### Ending B: Purple lockout — the horror wins

The player purges SENTRY/9 while the horror is active, or destroys it without first preparing the boundary seal. The horror no longer has an opponent, closes every external handle, and overwrites the terminal from the final character to the first.

Future visits show a black screen, a purple cursor, and unreadable characters. The account is permanently locked out of this chapter as designed. A non-player-facing administrative reset may exist for testing and support, but the game offers no reset command.

Persistent ending key: `horror_ending`.

### Ending C: Open boundary — true ending

The player prepares the boundary seal before accepting a final quarantine. While the horror is contained, the player uses SENTRY/9’s elevated access to purge SENTRY/9 first. This begins a short final countdown: the quarantine remains active, but no process is maintaining it.

Before containment expires, the player runs the repaired seal against the purple process. The seal disconnects it from the world rather than handing control to SENTRY/9. The simulation remains running, the external terminal becomes quiet, and `ENTER` becomes available.

`ENTER` transitions to Chapter 2, where the player enters the simulation and the game changes into a 2D RPG.

Persistent ending key: `open_boundary_ending`.

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
- final ending key and lockout state.

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
- persistence for the implemented repair and discovery flags when signed in.

The next implementation slice should add blocked-attempt counting and the restored-file read checkpoints. Those two conditions can then trigger the first restrained SENTRY/9 contact without exposing the later story.
