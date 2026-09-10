import { describe, expect, it } from 'vitest';
import {
  formatAliasFile,
  findTerminalEntries,
  formatTerminalTree,
  getCompletionCandidates,
  getManualEntry,
  grepText,
  normalizeTerminalPath,
  parseCommandLine,
  parseAliasFile,
  resolveTerminalEntry,
  storagePathToTerminalPath,
  terminalPathToStoragePath,
  TERMINAL_HOME,
  resolveTerminalDirectory,
  TERMINAL_ROOT,
} from './ancientTerminalShell';

describe('ancient terminal shell helpers', () => {
  it('completes commands and cycles from shared prefixes', () => {
    expect(getCompletionCandidates('upd', TERMINAL_ROOT)).toEqual(['UPDATE']);
    expect(getCompletionCandidates('ex', TERMINAL_ROOT)).toEqual(['EXIT']);
    expect(getCompletionCandidates('reb', TERMINAL_ROOT)).toEqual(['REBOOT']);
    expect(getCompletionCandidates('get', TERMINAL_ROOT, ['getpop()'])).toEqual(['getpop()']);
  });

  it('completes folders and editable source files in context', () => {
    expect(getCompletionCandidates('cd sc', TERMINAL_ROOT)).toEqual(['cd SCRIPTS']);
    expect(getCompletionCandidates('vim cl', `${TERMINAL_ROOT}\\SCRIPTS`)).toEqual(['vim cleaner.oro']);
    expect(getCompletionCandidates('ouro world_init.oro get', `${TERMINAL_ROOT}\\SCRIPTS`)).toEqual([
      'ouro world_init.oro getTime',
      'ouro world_init.oro getPop',
    ]);
    expect(getCompletionCandidates('vim a', TERMINAL_ROOT, ['getpop()'])).toEqual(['vim alias.tot']);
    expect(getCompletionCandidates('file sy', TERMINAL_ROOT)).toEqual(['file SYSTEM']);
    expect(getCompletionCandidates('man gre', TERMINAL_ROOT)).toEqual(['man GREP']);
    expect(getCompletionCandidates('copy no', TERMINAL_HOME, [], [
      { path: 'home/notes.tot', kind: 'file' },
    ])).toEqual(['copy notes.tot']);
  });

  it('resolves child, parent, and absolute terminal paths', () => {
    expect(resolveTerminalDirectory(TERMINAL_ROOT, 'scripts')).toBe(`${TERMINAL_ROOT}\\SCRIPTS`);
    expect(resolveTerminalDirectory(`${TERMINAL_ROOT}\\SCRIPTS`, '..')).toBe(TERMINAL_ROOT);
    expect(resolveTerminalDirectory(`${TERMINAL_ROOT}\\SYSTEM`, 'C:\\ANCIENT')).toBe(TERMINAL_ROOT);
    expect(resolveTerminalDirectory(`${TERMINAL_ROOT}\\SYSTEM`, 'scripts')).toBeNull();
  });

  it('parses familiar quoted command arguments without treating DOS slashes as escapes', () => {
    expect(parseCommandLine('grep "return census" world_init.oro')).toEqual({
      command: 'grep',
      args: ['return census', 'world_init.oro'],
    });
    expect(parseCommandLine("type 'recovery.tot'")).toEqual({ command: 'type', args: ['recovery.tot'] });
    expect(parseCommandLine('type C:\\ANCIENT\\SYSTEM\\clock.sys')).toEqual({
      command: 'type',
      args: ['C:\\ANCIENT\\SYSTEM\\clock.sys'],
    });
    expect(parseCommandLine('grep "unfinished')).toEqual({ error: 'ParseError: missing closing "' });
  });

  it('parses replacement and append redirects outside quoted text', () => {
    expect(parseCommandLine('echo population > notes.tot')).toEqual({
      command: 'echo',
      args: ['population'],
      redirect: { append: false, path: 'notes.tot' },
    });
    expect(parseCommandLine('echo "signal > noise">>notes.tot')).toEqual({
      command: 'echo',
      args: ['signal > noise'],
      redirect: { append: true, path: 'notes.tot' },
    });
    expect(parseCommandLine('echo test >')).toEqual({ error: 'ParseError: expected one filename after output redirect' });
    expect(parseCommandLine('echo a > one.tot > two.tot')).toEqual({ error: 'ParseError: multiple output redirects' });
    expect(parseCommandLine('echo ""')).toEqual({ command: 'echo', args: [''] });
  });

  it('indexes, resolves, and searches the contained filesystem', () => {
    expect(resolveTerminalEntry(`${TERMINAL_ROOT}\\SCRIPTS`, '..')?.path).toBe(TERMINAL_ROOT);
    expect(resolveTerminalEntry(TERMINAL_ROOT, 'SYSTEM\\clock.sys')?.kind).toBe('system');
    expect(resolveTerminalEntry(TERMINAL_ROOT, 'C:\\WINDOWS\\system.ini')).toBeNull();
    expect(findTerminalEntries('cleaner').map(entry => entry.name)).toEqual(['cleaner.oro']);
    expect(formatTerminalTree(true).some(line => line.endsWith('alias.tot'))).toBe(true);
  });

  it('keeps player files beneath HOME and indexes nested saved directories', () => {
    const playerFiles = [
      { path: 'home/lab', kind: 'directory' as const },
      { path: 'home/lab/test.oro', kind: 'file' as const },
      { path: 'home/notes.tot', kind: 'file' as const },
    ];
    expect(storagePathToTerminalPath('home/lab/test.oro')).toBe(`${TERMINAL_HOME}\\lab\\test.oro`);
    expect(terminalPathToStoragePath(`${TERMINAL_HOME}\\LAB\\test.oro`)).toBe('home/lab/test.oro');
    expect(normalizeTerminalPath(TERMINAL_HOME, '..')).toBe(TERMINAL_ROOT);
    expect(resolveTerminalEntry(TERMINAL_HOME, 'lab', false, playerFiles)?.kind).toBe('directory');
    expect(resolveTerminalEntry(`${TERMINAL_HOME}\\lab`, 'test.oro', false, playerFiles)?.kind).toBe('ouroboros');
    expect(getCompletionCandidates('cd l', TERMINAL_HOME, [], playerFiles)).toEqual(['cd lab']);
    expect(formatTerminalTree(false, playerFiles).some(line => line.endsWith('test.oro'))).toBe(true);
  });

  it('provides manual entries and literal case-insensitive text search', () => {
    expect(getManualEntry('ls')).toContain('list the current directory');
    expect(getManualEntry('cp')).toContain('duplicate a player file');
    expect(getManualEntry('unknown')).toBeNull();
    expect(grepText('Alpha\nbeta ALPHA\ngamma', 'alpha')).toEqual(['1: Alpha', '2: beta ALPHA']);
  });

  it('parses alias files and lets the last duplicate overwrite the first', () => {
    const parsed = parseAliasFile([
      '# aliases',
      'alias getpop() - ouro world_init.oro getPop',
      'alias getpop() - ouro world_init.oro getTime',
    ].join('\n'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.aliases).toEqual({ 'getpop()': 'ouro world_init.oro getTime' });
    expect(formatAliasFile(parsed.aliases)).toContain('alias getpop() - ouro world_init.oro getTime');
  });

  it('reports malformed alias file lines', () => {
    expect(parseAliasFile('getpop = nope').errors).toEqual([
      'line 1: expected ALIAS <name> - <command>',
    ]);
  });
});
