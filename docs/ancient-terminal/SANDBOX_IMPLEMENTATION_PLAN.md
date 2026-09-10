# Ancient Terminal: Sandbox Implementation Plan

## Objective

Turn Ancient Terminal into a terminal that feels familiar to experienced command-line users while keeping every filesystem mutation and story-changing action inside a fictional, isolated operating system. Players will be able to create files, write `.oro` programs, execute them, diagnose failures, and solve Chapter 1 through programming rather than fixed dialogue choices.

The browser must never receive access to the host operating system or a production shell.

## Architecture

```text
xterm.js terminal surface
  -> line editor and command dispatcher
    -> deterministic Ancient Shell
      -> virtual filesystem snapshot
      -> read-only commands
      -> protected mutation commands
      -> Ouroboros runtime worker
        -> allowlisted world API
          -> protected Supabase command functions
```

React continues to own the page, boot and reboot screens, navigation guard, screen shake, and cinematic color overlays. xterm.js owns terminal cells, cursor behavior, selection, clipboard interaction, scrollback, ANSI sequences, and terminal dimensions.

Supabase remains authoritative for persistent progress, player-created files, and story-changing commands. The browser may maintain an optimistic mirror, but it never directly declares a canonical world-state change.

## Phase 1: Terminal surface

Install `@xterm/xterm` and `@xterm/addon-fit`, then introduce a React adapter with a narrow interface:

- write ordinary, patch, error, rogue, and eldritch output;
- write text immediately or at a controlled character cadence;
- clear or replace exact terminal cells for horror corruption;
- receive normalized key and paste events;
- resize without losing scrollback;
- expose a single real cursor at the current input position.

Preserve the existing twenty-second boot, reboot failure sequence, purple corruption, portal deletion, and screen shake during the migration. No story behavior should be removed merely because rendering moved to xterm.js.

Completion gate:

- existing commands behave as before;
- selection, copy/paste, history, Tab completion, Home/End, and cursor movement feel native;
- only the active input position owns a cursor;
- all existing Ancient Terminal tests, lint, and production build pass.

Current checkpoint: xterm.js owns the active command line, cursor, editing keys, paste handling, history recall, and completion. The cinematic transcript remains in React temporarily so its per-character corruption and portal deletion effects remain intact while the terminal-cell renderer is developed.

## Phase 2: Ancient Shell and virtual filesystem

Move command parsing and filesystem behavior out of the React page into a deterministic engine. Paths remain DOS-like (`C:\ANCIENT`) while command aliases accept familiar spellings where appropriate.

Initial commands:

- navigation: `pwd`, `cd`, `ls`, `dir`;
- files: `cat`, `type`, `touch`, `mkdir`, `cp`, `copy`, `mv`, `move`, `rm`, `del`;
- discovery: `find`, `grep`, `tree`, `file`;
- shell: `echo`, `history`, `clear`, `cls`, `alias`, `help`, `man`, `exit`, `reboot`;
- programs: `ouro`, `vim`.

The parser will support quoted arguments, relative and absolute paths, `.` and `..`, case-insensitive command names, exit codes, standard output, and standard error. Pipes and redirection are added only after individual commands are stable.

Current checkpoint: the deterministic parser and filesystem index are active. `TREE`, `FIND`, `FILE`, `GREP`, `MAN`, `ECHO`, and `HISTORY` provide familiar discovery and session tools. The parser recognizes quoted text plus `>` and `>>`; redirection is initially restricted to `ECHO`. Authenticated players can navigate `HOME`, create directories and empty `.oro`/`.tot` files, edit them in VIM, copy files, move or rename directory trees, and remove files or empty directories through protected commands.

Filesystem rules:

- `.oro` is reserved for editable Ouroboros source;
- `.tot` is ordinary editable text;
- system binaries and protected story files cannot be modified until the story grants the required capability;
- all paths are normalized and constrained beneath `C:\ANCIENT`;
- commands cannot address browser files, environment variables, cookies, credentials, or host resources.

## Phase 3: Durable filesystem state

Add server-owned filesystem records keyed by user and normalized path. Each file stores its kind, contents, revision, timestamps, and story-level access flags. Protected Supabase functions validate every create, write, move, and delete operation.

Requirements:

- compare-and-swap revisions prevent one tab from silently overwriting another;
- initial system files are generated from a versioned manifest;
- `REBOOT` replaces the player's filesystem with the current factory manifest;
- aliases become a normal `alias.tot` file without losing existing saved aliases;
- file contents and filenames are size-limited and validated;
- migrations preserve existing Chapter 1 progress.

Current checkpoint: the server-owned `HOME` filesystem schema and validated RPC boundary are connected for listing files, revision-checked writes, directory creation, copy, atomic move/rename, deletion, and factory reset. Save conflicts preserve the editor buffer and refresh the filesystem mirror instead of overwriting newer data. Alias definitions are mirrored into a protected `alias.tot` filesystem record and existing aliases are backfilled during migration.

## Phase 4: Ouroboros runtime

Run Ouroboros programs away from the UI thread. The first runtime uses a purpose-built parser and interpreter in a dedicated browser worker. It never translates source into JavaScript or calls `eval`. Ouroboros source is parsed and validated before execution.

Initial language features:

- values, variables, arithmetic, strings, lists, and dictionaries;
- `fn`, parameters, return values, and local scope;
- `if`/`else`, `for`, and bounded `while` loops;
- readable syntax and runtime errors with `.oro` line and column locations;
- `print`, file input/output, and a small documented standard library.

Runtime limits:

- execution deadline and instruction/iteration budget;
- output and file-size limits;
- worker termination for runaway programs and `Ctrl+C`;
- no JavaScript bridge, DOM, browser storage, cookies, credentials, or unrestricted network access;
- no direct mutation of story state.

The worker returns proposed effects. Protected server commands validate story-sensitive calls such as `setWeather` before applying them.

Current checkpoint: editable `.oro` files now compile and execute in a disposable worker. The implemented subset includes functions and parameters, local variables, arithmetic and comparisons, strings, lists, dictionaries, `if`/`else`, bounded `for` and `while`, `return`, and `print`, `range`, `len`, `str`, and `int`. Syntax/runtime errors carry line and column positions. Instruction, output, source-size, call-depth, and wall-clock limits are enforced; `Ctrl+C` terminates the active worker. Only explicit read-only globals are supplied to programs. File capabilities and server-validated proposed effects remain for the next checkpoint.

## Phase 5: First programming puzzle

Convert the current `getPop` repair into the tutorial path:

1. inspect `world_init.oro`;
2. identify and fix the syntax error;
3. compile the real file;
4. run `getTime` successfully;
5. run `getPop` and observe the horror corrupt terminal cells rather than fabricated React text;
6. create a diagnostic script that writes captured output to a file before display interception;
7. use the recovered data to unlock the next Chapter 1 clue.

The puzzle should teach editing, function calls, return values, standard output, files, and debugging without presenting itself as a lesson.

## Deferred deeper sandbox

Evaluate WebContainers only after the lightweight shell is stable. It can provide a more complete in-browser process and filesystem environment, but it requires cross-origin isolation headers, has browser compatibility considerations, and may require production licensing. If adopted, it becomes an unlockable deeper system layer rather than a dependency of the opening experience.

## Non-goals

- exposing PowerShell, Bash, the deployment host, or the player's computer;
- accepting arbitrary JavaScript from files or puzzle data;
- trusting client-reported script results for progression;
- reproducing every command or edge case from a modern operating system;
- allowing code execution to block terminal animation or the main browser thread.
