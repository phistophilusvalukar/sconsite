export const TERMINAL_ROOT = 'C:\\ANCIENT' as const;
export const TERMINAL_HOME = `${TERMINAL_ROOT}\\HOME` as const;
export const TERMINAL_DIRECTORIES = [
  TERMINAL_ROOT,
  `${TERMINAL_ROOT}\\BIN`,
  TERMINAL_HOME,
  `${TERMINAL_ROOT}\\SCRIPTS`,
  `${TERMINAL_ROOT}\\SYSTEM`,
] as const;

export type TerminalDirectory = string;
export type EditableFileName = 'world_init.oro' | 'cleaner.oro';
export type TerminalAliases = Record<string, string>;

export type AliasFileParseResult = {
  aliases: TerminalAliases;
  errors: string[];
};

export type ParsedCommandLine = {
  command: string;
  args: string[];
  redirect?: {
    append: boolean;
    path: string;
  };
};

export type TerminalEntry = {
  kind: 'directory' | 'binary' | 'ouroboros' | 'text' | 'system' | 'index';
  name: string;
  path: string;
};

export type TerminalFileRecord = {
  path: string;
  kind: 'file' | 'directory';
};

export const EDITABLE_FILES: readonly EditableFileName[] = ['world_init.oro', 'cleaner.oro'];
const BIN_DIRECTORY = `${TERMINAL_ROOT}\\BIN` as const;
const HOME_DIRECTORY = TERMINAL_HOME;
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
  'TREE',
  'FIND',
  'FILE',
  'GREP',
  'MAN',
  'MKDIR',
  'TOUCH',
  'RM',
  'DEL',
  'CP',
  'COPY',
  'MV',
  'MOVE',
  'ECHO',
  'HISTORY',
  'CLEAR',
  'CLS',
  'EXIT',
  'REBOOT',
] as const;

const DIRECTORY_CHILDREN: Record<string, readonly string[]> = {
  [TERMINAL_ROOT]: ['BIN', 'HOME', 'SCRIPTS', 'SYSTEM'],
  [BIN_DIRECTORY]: ['ouro.exe', 'shell.exe', 'update.exe'],
  [HOME_DIRECTORY]: [],
  [SCRIPTS_DIRECTORY]: EDITABLE_FILES,
  [SYSTEM_DIRECTORY]: ['clock.sys', 'census.idx', 'recovery.tot'],
};

const MANUAL: Record<string, string> = {
  alias: 'ALIAS <name> - <command>  create or replace a saved command shortcut',
  cat: 'CAT <file>                  display a readable file',
  cd: 'CD <folder>                 change the current directory; CD .. moves upward',
  clear: 'CLEAR                     clear terminal output (alias: CLS)',
  dir: 'DIR                         list the current directory (alias: LS)',
  edit: 'EDIT <file>                open an editable .oro or .tot file (alias: VIM)',
  echo: 'ECHO <text> [> file]        print text, replace a file with >, or append with >>',
  exit: 'EXIT                       disconnect from ANCIENT after confirmation',
  file: 'FILE <path>                identify a file or directory without opening it',
  find: 'FIND <text>                search known paths and filenames',
  grep: 'GREP <text> <file>         show matching lines in a readable file',
  help: 'HELP                       list available shell commands',
  history: 'HISTORY [-c]               show this session command history or clear it',
  man: 'MAN <command>               display the manual entry for one command',
  ouro: 'OURO <file.oro> <function> compile or execute Ouroboros source',
  pwd: 'PWD                         print the current directory',
  reboot: 'REBOOT                     erase progress and restore the factory image',
  rm: 'RM <path>                   delete one player file or an empty directory (alias: DEL)',
  mkdir: 'MKDIR <path>                create a persistent directory beneath HOME',
  copy: 'COPY <source> <target>       duplicate a player file (alias: CP)',
  move: 'MOVE <source> <target>       move or rename a player path (alias: MV)',
  touch: 'TOUCH <file>                create an empty persistent .oro or .tot file beneath HOME',
  tree: 'TREE                        display the indexed filesystem hierarchy',
  type: 'TYPE <file>                display a readable file (alias: CAT)',
  update: 'UPDATE                      install the newest local help index',
  vim: 'VIM <file>                  open an editable .oro or .tot file',
};

export function parseCommandLine(input: string): ParsedCommandLine | { error: string } {
  const tokens: string[] = [];
  let token = '';
  let tokenStarted = false;
  let quote: '"' | "'" | null = null;

  const source = input.trim();
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (character === '>') {
      if (tokenStarted) tokens.push(token);
      token = '';
      tokenStarted = false;
      if (source[index + 1] === '>') {
        tokens.push('>>');
        index += 1;
      } else tokens.push('>');
      continue;
    }
    if (/\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(token);
        token = '';
        tokenStarted = false;
      }
      continue;
    }
    token += character;
    tokenStarted = true;
  }

  if (quote) return { error: `ParseError: missing closing ${quote}` };
  if (tokenStarted) tokens.push(token);
  const redirectIndexes = tokens.reduce<number[]>((indexes, value, index) => {
    if (value === '>' || value === '>>') indexes.push(index);
    return indexes;
  }, []);
  if (redirectIndexes.length > 1) return { error: 'ParseError: multiple output redirects' };
  let redirect: ParsedCommandLine['redirect'];
  if (redirectIndexes.length === 1) {
    const redirectIndex = redirectIndexes[0];
    if (redirectIndex < 1 || redirectIndex !== tokens.length - 2 || !tokens[redirectIndex + 1]) {
      return { error: 'ParseError: expected one filename after output redirect' };
    }
    redirect = { append: tokens[redirectIndex] === '>>', path: tokens[redirectIndex + 1] };
    tokens.splice(redirectIndex, 2);
  }
  const [command = '', ...args] = tokens;
  return redirect ? { command, args, redirect } : { command, args };
}

function terminalEntryKind(name: string): TerminalEntry['kind'] {
  const nameSegments = name.split('.');
  const extension = nameSegments[nameSegments.length - 1]?.toLowerCase();
  return extension === 'exe'
    ? 'binary'
    : extension === 'oro'
      ? 'ouroboros'
      : extension === 'tot'
        ? 'text'
        : extension === 'idx'
          ? 'index'
          : 'system';
}

export function storagePathToTerminalPath(storagePath: string): string {
  const relative = storagePath.replace(/\//g, '\\').replace(/^home(?:\\|$)/i, '');
  return relative ? `${TERMINAL_HOME}\\${relative}` : TERMINAL_HOME;
}

export function terminalPathToStoragePath(terminalPath: string): string | null {
  if (terminalPath.toUpperCase() === TERMINAL_HOME) return 'home';
  if (!terminalPath.toUpperCase().startsWith(`${TERMINAL_HOME}\\`)) return null;
  return `home/${terminalPath.slice(TERMINAL_HOME.length + 1).replace(/\\/g, '/').toLowerCase()}`;
}

export function normalizeTerminalPath(cwd: TerminalDirectory, rawTarget: string): string | null {
  const normalizedTarget = rawTarget.trim().replace(/\//g, '\\');
  if (!normalizedTarget) return null;
  let candidate = normalizedTarget;
  if (/^\\ANCIENT(?:\\|$)/i.test(candidate)) candidate = `C:${candidate}`;
  else if (!/^C:/i.test(candidate)) candidate = `${cwd}\\${candidate}`;
  const segments = candidate.split('\\');
  const normalizedSegments: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (normalizedSegments.length > 2) normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }
  const normalizedPath = normalizedSegments.join('\\');
  const normalizedUpper = normalizedPath.toUpperCase();
  if (normalizedUpper !== TERMINAL_ROOT && !normalizedUpper.startsWith(`${TERMINAL_ROOT}\\`)) return null;
  return normalizedPath;
}

export function getTerminalEntries(hasAliasFile = false, playerFiles: readonly TerminalFileRecord[] = []): TerminalEntry[] {
  const entries: TerminalEntry[] = [];
  for (const directory of TERMINAL_DIRECTORIES) {
    const segments = directory.split('\\');
    entries.push({ kind: 'directory', name: segments[segments.length - 1] ?? directory, path: directory });
  }
  for (const [directory, children] of Object.entries(DIRECTORY_CHILDREN) as [TerminalDirectory, readonly string[]][]) {
    for (const name of children) {
      const path = `${directory}\\${name}`;
      if (TERMINAL_DIRECTORIES.some(knownDirectory => knownDirectory.toUpperCase() === path.toUpperCase())) continue;
      entries.push({ kind: terminalEntryKind(name), name, path });
    }
  }
  if (hasAliasFile) entries.push({ kind: 'text', name: 'alias.tot', path: `${TERMINAL_ROOT}\\alias.tot` });
  for (const file of playerFiles) {
    const path = storagePathToTerminalPath(file.path);
    const segments = path.split('\\');
    const name = segments[segments.length - 1];
    entries.push({ kind: file.kind === 'directory' ? 'directory' : terminalEntryKind(name), name, path });
  }
  return entries;
}

export function resolveTerminalEntry(cwd: TerminalDirectory, rawTarget: string, hasAliasFile = false, playerFiles: readonly TerminalFileRecord[] = []): TerminalEntry | null {
  const normalizedPath = normalizeTerminalPath(cwd, rawTarget);
  if (!normalizedPath) return null;
  return getTerminalEntries(hasAliasFile, playerFiles).find(entry => entry.path.toUpperCase() === normalizedPath.toUpperCase()) ?? null;
}

export function findTerminalEntries(query: string, hasAliasFile = false, playerFiles: readonly TerminalFileRecord[] = []): TerminalEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return getTerminalEntries(hasAliasFile, playerFiles).filter(entry => entry.path.toLowerCase().includes(needle));
}

export function formatTerminalTree(hasAliasFile = false, playerFiles: readonly TerminalFileRecord[] = []): string[] {
  const lines = ['C:\\ANCIENT'];
  const entries = getTerminalEntries(hasAliasFile, playerFiles).filter(entry => entry.path !== TERMINAL_ROOT);
  const appendChildren = (parent: string, prefix: string) => {
    const children = entries
      .filter(entry => entry.path.slice(0, entry.path.lastIndexOf('\\')).toUpperCase() === parent.toUpperCase())
      .sort((left, right) => Number(right.kind === 'directory') - Number(left.kind === 'directory') || left.name.localeCompare(right.name));
    children.forEach((entry, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? '└──' : '├──'} ${entry.name}`);
      if (entry.kind === 'directory') appendChildren(entry.path, `${prefix}${last ? '    ' : '│   '}`);
    });
  };
  appendChildren(TERMINAL_ROOT, '');
  return lines;
}

export function grepText(source: string, query: string): string[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  return source.split(/\r?\n/)
    .map((text, index) => ({ line: index + 1, text }))
    .filter(line => line.text.toLowerCase().includes(needle))
    .map(line => `${line.line}: ${line.text}`);
}

export function getManualEntry(command: string): string | null {
  const normalized = command.trim().toLowerCase();
  const aliases: Record<string, string> = { cls: 'clear', cp: 'copy', del: 'rm', ls: 'dir', mv: 'move' };
  return MANUAL[aliases[normalized] ?? normalized] ?? null;
}

export function getDirectoryChildren(cwd: TerminalDirectory, hasAliasFile = false, playerFiles: readonly TerminalFileRecord[] = []): readonly string[] {
  const knownChildren = DIRECTORY_CHILDREN[cwd] ?? [];
  const dynamicChildren = getTerminalEntries(false, playerFiles)
    .filter(entry => entry.path.slice(0, entry.path.lastIndexOf('\\')).toUpperCase() === cwd.toUpperCase())
    .map(entry => entry.name);
  const children = [...knownChildren, ...dynamicChildren];
  if (cwd === TERMINAL_ROOT && hasAliasFile) children.push('alias.tot');
  return [...new Set(children)].sort((left, right) => left.localeCompare(right));
}

export function resolveTerminalDirectory(cwd: TerminalDirectory, rawTarget: string, playerFiles: readonly TerminalFileRecord[] = []): TerminalDirectory | null {
  const target = rawTarget.trim();
  if (!target || target === '.') return cwd;
  if (target === '..' && cwd === TERMINAL_ROOT) return TERMINAL_ROOT;
  const entry = resolveTerminalEntry(cwd, target, false, playerFiles);
  return entry?.kind === 'directory' ? entry.path as TerminalDirectory : null;
}

export function getCompletionCandidates(input: string, cwd: TerminalDirectory, aliasNames: readonly string[] = [], playerFiles: readonly TerminalFileRecord[] = []): string[] {
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
    candidates = ['..', ...getDirectoryChildren(cwd, false, playerFiles).filter(name => resolveTerminalEntry(cwd, name, false, playerFiles)?.kind === 'directory')];
  } else if (command === 'TYPE' || command === 'CAT' || command === 'FILE' || command === 'RM' || command === 'DEL'
    || command === 'CP' || command === 'COPY' || command === 'MV' || command === 'MOVE') {
    candidates = getDirectoryChildren(cwd, aliasNames.length > 0, playerFiles);
  } else if (command === 'MAN') {
    candidates = SHELL_COMMANDS;
  } else if (command === 'VIM' || command === 'EDIT') {
    if (cwd.endsWith('\\SCRIPTS')) candidates = EDITABLE_FILES;
    else if (cwd === TERMINAL_ROOT && aliasNames.length > 0) candidates = ['alias.tot'];
    else if (cwd.toUpperCase().startsWith(TERMINAL_HOME)) candidates = getDirectoryChildren(cwd, false, playerFiles).filter(name => /\.(oro|tot)$/i.test(name));
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
