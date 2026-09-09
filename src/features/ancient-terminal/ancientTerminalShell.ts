export const TERMINAL_ROOT = 'C:\\ANCIENT' as const;
export const TERMINAL_DIRECTORIES = [
  TERMINAL_ROOT,
  `${TERMINAL_ROOT}\\BIN`,
  `${TERMINAL_ROOT}\\SCRIPTS`,
  `${TERMINAL_ROOT}\\SYSTEM`,
] as const;

export type TerminalDirectory = (typeof TERMINAL_DIRECTORIES)[number];
export type EditableFileName = 'world_init.oro' | 'cleaner.oro';
export type TerminalAliases = Record<string, string>;

export type AliasFileParseResult = {
  aliases: TerminalAliases;
  errors: string[];
};

export const EDITABLE_FILES: readonly EditableFileName[] = ['world_init.oro', 'cleaner.oro'];
const BIN_DIRECTORY = `${TERMINAL_ROOT}\\BIN` as const;
const SCRIPTS_DIRECTORY = `${TERMINAL_ROOT}\\SCRIPTS` as const;
const SYSTEM_DIRECTORY = `${TERMINAL_ROOT}\\SYSTEM` as const;

const SHELL_COMMANDS = [
  'HELP',
  'UPDATE',
  'LS',
  'DIR',
  'CD',
  'PWD',
  'TYPE',
  'CAT',
  'VIM',
  'EDIT',
  'OURO',
  'ALIAS',
  'CLEAR',
  'CLS',
] as const;

const DIRECTORY_CHILDREN: Record<TerminalDirectory, readonly string[]> = {
  [TERMINAL_ROOT]: ['BIN', 'SCRIPTS', 'SYSTEM'],
  [BIN_DIRECTORY]: ['ouro.exe', 'shell.exe', 'update.exe'],
  [SCRIPTS_DIRECTORY]: EDITABLE_FILES,
  [SYSTEM_DIRECTORY]: ['clock.sys', 'census.idx', 'recovery.tot'],
};

export function getDirectoryChildren(cwd: TerminalDirectory, hasAliasFile = false): readonly string[] {
  if (cwd === TERMINAL_ROOT && hasAliasFile) return [...DIRECTORY_CHILDREN[cwd], 'alias.tot'];
  return DIRECTORY_CHILDREN[cwd];
}

export function resolveTerminalDirectory(cwd: TerminalDirectory, rawTarget: string): TerminalDirectory | null {
  const target = rawTarget.trim().replace(/\//g, '\\').toUpperCase();
  if (!target || target === '.') return cwd;
  if (target === '\\ANCIENT' || target === 'C:\\ANCIENT') return TERMINAL_ROOT;
  if (target === '..') return cwd === TERMINAL_ROOT ? TERMINAL_ROOT : TERMINAL_ROOT;
  if (cwd !== TERMINAL_ROOT) return null;

  const match = TERMINAL_DIRECTORIES.find(path => path === `${TERMINAL_ROOT}\\${target}`);
  return match ?? null;
}

export function getCompletionCandidates(input: string, cwd: TerminalDirectory, aliasNames: readonly string[] = []): string[] {
  const leadingWhitespace = input.match(/^\s*/)?.[0] ?? '';
  const body = input.slice(leadingWhitespace.length);
  const firstSpace = body.indexOf(' ');

  if (firstSpace === -1) {
    const prefix = body.toUpperCase();
    return [...SHELL_COMMANDS, ...aliasNames]
      .filter(command => command.toUpperCase().startsWith(prefix))
      .map(command => `${leadingWhitespace}${command}`);
  }

  const command = body.slice(0, firstSpace).toUpperCase();
  const argumentPrefix = body.slice(firstSpace + 1);
  let candidates: readonly string[] = [];

  if (command === 'CD') {
    candidates = cwd === TERMINAL_ROOT ? ['BIN', 'SCRIPTS', 'SYSTEM'] : ['..'];
  } else if (command === 'TYPE' || command === 'CAT') {
    candidates = getDirectoryChildren(cwd, aliasNames.length > 0);
  } else if (command === 'VIM' || command === 'EDIT') {
    if (cwd.endsWith('\\SCRIPTS')) candidates = EDITABLE_FILES;
    else if (cwd === TERMINAL_ROOT && aliasNames.length > 0) candidates = ['alias.tot'];
  } else if (command === 'OURO' && cwd.endsWith('\\SCRIPTS')) {
    const secondSpace = argumentPrefix.indexOf(' ');
    if (secondSpace === -1) {
      candidates = EDITABLE_FILES;
    } else {
      const fileName = argumentPrefix.slice(0, secondSpace).toLowerCase();
      const functionPrefix = argumentPrefix.slice(secondSpace + 1);
      const functions = fileName === 'world_init.oro' ? ['getTime', 'getPop'] : fileName === 'cleaner.oro' ? ['clean'] : [];
      return functions
        .filter(functionName => functionName.toLowerCase().startsWith(functionPrefix.toLowerCase()))
        .map(functionName => `${leadingWhitespace}${body.slice(0, firstSpace)} ${argumentPrefix.slice(0, secondSpace)} ${functionName}`);
    }
  }

  return candidates
    .filter(candidate => candidate.toLowerCase().startsWith(argumentPrefix.toLowerCase()))
    .map(candidate => `${leadingWhitespace}${body.slice(0, firstSpace)} ${candidate}`);
}

export function parseAliasDefinition(input: string): { name: string; command: string } | null {
  const match = input.trim().match(/^alias\s+([a-z][a-z0-9_]*(?:\(\))?)\s+-\s+(.+)$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const command = match[2].trim();
  if (name.length > 48 || command.length > 180 || /[\r\n]/.test(command)) return null;
  return { name, command };
}

export function parseAliasFile(source: string): AliasFileParseResult {
  const aliases: TerminalAliases = {};
  const errors: string[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parsed = parseAliasDefinition(trimmed);
    if (!parsed) {
      errors.push(`line ${index + 1}: expected ALIAS <name> - <command>`);
      return;
    }
    aliases[parsed.name] = parsed.command;
  });
  return { aliases, errors };
}

export function formatAliasFile(aliases: TerminalAliases): string {
  const definitions = Object.entries(aliases)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, command]) => `alias ${name} - ${command}`);
  return ['# alias.tot', '# last definition wins', '', ...definitions, ''].join('\n');
}
