import { describe, expect, it } from 'vitest';
import {
  formatAliasFile,
  getCompletionCandidates,
  parseAliasFile,
  resolveTerminalDirectory,
  TERMINAL_ROOT,
} from './ancientTerminalShell';

describe('ancient terminal shell helpers', () => {
  it('completes commands and cycles from shared prefixes', () => {
    expect(getCompletionCandidates('upd', TERMINAL_ROOT)).toEqual(['UPDATE']);
    expect(getCompletionCandidates('ex', TERMINAL_ROOT)).toEqual(['EXIT']);
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
  });

  it('resolves child, parent, and absolute terminal paths', () => {
    expect(resolveTerminalDirectory(TERMINAL_ROOT, 'scripts')).toBe(`${TERMINAL_ROOT}\\SCRIPTS`);
    expect(resolveTerminalDirectory(`${TERMINAL_ROOT}\\SCRIPTS`, '..')).toBe(TERMINAL_ROOT);
    expect(resolveTerminalDirectory(`${TERMINAL_ROOT}\\SYSTEM`, 'C:\\ANCIENT')).toBe(TERMINAL_ROOT);
    expect(resolveTerminalDirectory(`${TERMINAL_ROOT}\\SYSTEM`, 'scripts')).toBeNull();
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
