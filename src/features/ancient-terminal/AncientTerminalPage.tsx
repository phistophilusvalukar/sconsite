import { type CSSProperties, FormEvent, Fragment, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import {
  advanceAncientTerminalProgress,
  loadAncientTerminalProgress,
  replaceAncientTerminalAliases,
  setAncientTerminalAlias,
  type AncientTerminalAction,
} from './ancientTerminalService';
import {
  type EditableFileName,
  formatAliasFile,
  getCompletionCandidates,
  getDirectoryChildren,
  parseAliasDefinition,
  parseAliasFile,
  resolveTerminalDirectory,
  TERMINAL_ROOT,
  type TerminalAliases,
  type TerminalDirectory,
} from './ancientTerminalShell';
import './ancientTerminal.css';

type Voice = 'os' | 'patch' | 'eldritch' | 'user' | 'muted' | 'error';
type TerminalLine = {
  id: string | number;
  voice: Voice;
  text: string;
  delay?: number;
  charMs?: number;
  pauseAfter?: number;
};
type GetPopSequenceItem = { id: string; kind: 'getpop'; aggressive: boolean; eraseTargetId: string | null };
type TimelineItem = TerminalLine | GetPopSequenceItem;
type VimMode = 'normal' | 'insert' | 'command';
type HorrorPulse = 'arrival' | 'impact';
type EditorFileName = EditableFileName | 'alias.tot';

const BROKEN_WORLD_SOURCE = `# world_init.oro
# Ouroboros 0.3 — cyclic runtime

fn getTime():
    return clock.cycle

fn getPop()
    return census.total
`;

const FIXED_WORLD_SOURCE = BROKEN_WORLD_SOURCE.replace('fn getPop()\n', 'fn getPop():\n');

const BROKEN_CLEANER_SOURCE = `# cleaner.oro
# sector repair utility — unfinished

fn clean():
    targets = disk.find(flag = CORRUPT)
    for target in targets
        disk.restore(target)
    return targets.count
`;

const FIXED_CLEANER_SOURCE = BROKEN_CLEANER_SOURCE.replace('for target in targets\n', 'for target in targets:\n');
const TERMINAL_HISTORY_GUARD = 'ancient-terminal-session-guard';

const BASIC_HELP: Omit<TerminalLine, 'id'>[] = [
  { voice: 'os', text: 'ANCIENT SHELL HELP 0.1' },
  { voice: 'os', text: 'HELP  UPDATE  LS  DIR  CD  PWD  TYPE  CAT  VIM  EDIT  OURO  ALIAS' },
  { voice: 'os', text: 'CLEAR  CLS  EXIT' },
  { voice: 'muted', text: 'Run UPDATE to install command descriptions.' },
  { voice: 'muted', text: 'TAB completes names. UP/DOWN recall commands. Copy and paste are enabled.' },
];

const DETAILED_HELP: Omit<TerminalLine, 'id'>[] = [
  { voice: 'os', text: 'ANCIENT SHELL HELP 0.2' },
  { voice: 'muted', text: 'NAVIGATION' },
  { voice: 'os', text: '  LS / DIR          list files and folders in the current location' },
  { voice: 'os', text: '  CD <folder>       enter a folder; CD .. returns to C:\\ANCIENT' },
  { voice: 'os', text: '  PWD               print the current location' },
  { voice: 'muted', text: 'FILES' },
  { voice: 'os', text: '  TYPE / CAT <file> display a readable file' },
  { voice: 'os', text: '  VIM / EDIT <file> edit an Ouroboros .oro or text .tot file' },
  { voice: 'muted', text: 'PROGRAMS' },
  { voice: 'os', text: '  OURO <file> <fn>  compile a .oro file and execute one function' },
  { voice: 'os', text: '  Example: OURO world_init.oro getTime' },
  { voice: 'os', text: '  ALIAS             list saved aliases' },
  { voice: 'os', text: '  ALIAS <name> - <command>  create or overwrite an alias' },
  { voice: 'muted', text: 'SHELL' },
  { voice: 'os', text: '  UPDATE            install the newest local help index' },
  { voice: 'os', text: '  CLEAR / CLS       clear terminal output' },
  { voice: 'os', text: '  EXIT              disconnect safely and return to the site' },
  { voice: 'muted', text: 'TAB completes names. UP/DOWN recall commands. Text can be copied and pasted.' },
];

const BOOT: Omit<TerminalLine, 'id'>[] = [
  { voice: 'os', text: 'ANCIENT SYSTEMS BIOS v0.00.0001' },
  { voice: 'muted', text: 'MEMORY CHECK ............................................. [OK]' },
  { voice: 'os', text: 'Mounting C:\\ANCIENT...................................... [OK]' },
  { voice: 'os', text: 'Loading device table..................................... [OK]' },
  { voice: 'os', text: 'Starting CHRONOS clock................................... [OK]' },
  { voice: 'patch', text: 'OUROBOROS runtime 0.3: compiling scripts\\world_init.oro' },
  { voice: 'patch', text: 'world_init.getTime() → cycle 77,777' },
  { voice: 'error', text: "world_init.oro:7:12 SyntaxError: expected ':' after function signature" },
  { voice: 'patch', text: 'world_init.getPop() .................................. [FAILED]' },
  { voice: 'os', text: 'Continuing with partial initialization.' },
  { voice: 'os', text: 'Command interpreter ready.' },
];

const LOADER_MESSAGES = [
  'LOCATING RECOVERY IMAGE...',
  'READING DAMAGED SECTORS...',
  'RECONSTRUCTING COMMAND INTERPRETER...',
  'VERIFYING SYSTEM CLOCK...',
  'HANDING CONTROL TO ANCIENT SYS...',
];

const GET_POP_COMPILE_LINES: TerminalLine[] = [
  { id: 1, voice: 'os', text: 'OUROBOROS: compiling census_core helpers...', delay: 150 },
  { id: 2, voice: 'os', text: 'link shard_index.mem ............................... [OK]', delay: 1250 },
  { id: 3, voice: 'os', text: 'recompiling scripts\\world_init.oro ................... [OK]', delay: 2450 },
  { id: 4, voice: 'os', text: 'world_init.getPop() → 8,388,', delay: 3950 },
];

const ELDRITCH_GLYPHS = Array.from('ꙮ⸸⟟⊑⏁⟊⧗⌇⌿⏃⍀⟒☌⌰⊬⋏⍜⋔⎅⍙');
const GLITCH_RANDOM_VALUE = new Uint32Array(1);

type GlitchBurst = {
  glyph: string;
  echo: string;
  x: number;
  y: number;
  skew: number;
  scale: number;
  opacity: number;
  blur: number;
};

function randomInteger(min: number, max: number): number {
  window.crypto.getRandomValues(GLITCH_RANDOM_VALUE);
  return min + (GLITCH_RANDOM_VALUE[0] % (max - min + 1));
}

function TypingLine({ line, onStart, flushToken = 0 }: {
  line: TerminalLine;
  onStart?: () => void;
  flushToken?: number;
}) {
  const chars = useMemo(() => Array.from(line.text), [line.text]);
  const [visible, setVisible] = useState(0);
  const [started, setStarted] = useState(false);
  const initialFlushTokenRef = useRef(flushToken);
  const flushedRef = useRef(false);

  useEffect(() => {
    if (initialFlushTokenRef.current === flushToken) return;
    initialFlushTokenRef.current = flushToken;
    if (flushedRef.current) return;
    flushedRef.current = true;
    setStarted(true);
    setVisible(chars.length);
    onStart?.();
  }, [chars.length, flushToken, onStart]);

  useEffect(() => {
    let interval = 0;
    const start = window.setTimeout(() => {
      if (flushedRef.current) return;
      setStarted(true);
      onStart?.();
      if (line.voice === 'user') {
        setVisible(chars.length);
        return;
      }
      interval = window.setInterval(() => setVisible(count => {
        if (count >= chars.length) { window.clearInterval(interval); return count; }
        return count + 1;
      }), line.charMs ?? 18);
    }, line.delay ?? 0);
    return () => { window.clearTimeout(start); window.clearInterval(interval); };
  }, [chars.length, line.charMs, line.delay, line.voice, onStart]);
  if (!started) return null;
  return <p className={`voice-${line.voice}`}>{chars.slice(0, visible).join('')}</p>;
}

function GlitchedCharacter({ animate, character, characterIndex }: { animate: boolean; character: string; characterIndex: number }) {
  const [burst, setBurst] = useState<GlitchBurst | null>(null);
  const baseGlyph = character === ' ' ? ' ' : ELDRITCH_GLYPHS[characterIndex % ELDRITCH_GLYPHS.length];

  useEffect(() => {
    if (!animate || character === ' ' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let quietTimer = 0;
    let burstTimer = 0;
    let active = true;

    const scheduleBurst = () => {
      quietTimer = window.setTimeout(() => {
        if (!active) return;
        setBurst({
          glyph: ELDRITCH_GLYPHS[randomInteger(0, ELDRITCH_GLYPHS.length - 1)],
          echo: ELDRITCH_GLYPHS[randomInteger(0, ELDRITCH_GLYPHS.length - 1)],
          x: randomInteger(-2, 2),
          y: randomInteger(-1, 1),
          skew: randomInteger(-12, 12),
          scale: randomInteger(82, 124) / 100,
          opacity: randomInteger(42, 96) / 100,
          blur: randomInteger(0, 5) / 10,
        });
        burstTimer = window.setTimeout(() => {
          if (!active) return;
          setBurst(null);
          scheduleBurst();
        }, randomInteger(34, 125));
      }, randomInteger(180, 2400));
    };

    scheduleBurst();
    return () => {
      active = false;
      window.clearTimeout(quietTimer);
      window.clearTimeout(burstTimer);
    };
  }, [animate, character]);

  const visibleBurst = animate ? burst : null;
  const style = visibleBurst ? {
    '--glitch-x': `${visibleBurst.x}px`,
    '--glitch-y': `${visibleBurst.y}px`,
    '--glitch-skew': `${visibleBurst.skew}deg`,
    '--glitch-scale': visibleBurst.scale,
    '--glitch-opacity': visibleBurst.opacity,
    '--glitch-blur': `${visibleBurst.blur}px`,
    '--glitch-echo-x': `${visibleBurst.x * -1}px`,
    '--glitch-echo-y': `${visibleBurst.y * -1}px`,
  } as CSSProperties : undefined;

  return <span className={`corrupted-character${visibleBurst ? ' is-glitching' : ''}`} data-echo={visibleBurst?.echo ?? ''} style={style}>
    {visibleBurst?.glyph ?? baseGlyph}
  </span>;
}

function GetPopSequence({ aggressive, animateGlitch, erase, onOverwrite, onComplete, onLineStart, onHorrorPulse }: {
  aggressive: boolean;
  animateGlitch: boolean;
  erase: boolean;
  onOverwrite: () => void;
  onComplete: () => void;
  onLineStart: () => void;
  onHorrorPulse: (pulse: HorrorPulse) => void;
}) {
  const [corrupted, setCorrupted] = useState(0);
  const [erased, setErased] = useState(0);
  const [portalCollapsing, setPortalCollapsing] = useState(false);
  const [vanished, setVanished] = useState(false);
  const overwriteCallbackRef = useRef(onOverwrite);
  const completeCallbackRef = useRef(onComplete);
  const horrorPulseCallbackRef = useRef(onHorrorPulse);
  useEffect(() => { overwriteCallbackRef.current = onOverwrite; }, [onOverwrite]);
  useEffect(() => { completeCallbackRef.current = onComplete; }, [onComplete]);
  useEffect(() => { horrorPulseCallbackRef.current = onHorrorPulse; }, [onHorrorPulse]);
  useEffect(() => {
    let corruptionTimer = 0;
    let completionTimer = 0;
    let delay = 220;
    let changed = 0;
    const totalCharacters = GET_POP_COMPILE_LINES.reduce((total, line) => total + Array.from(line.text).length, 0);
    const corruptNextCharacter = () => {
      changed += 1;
      setCorrupted(changed);
      if (aggressive && changed >= 5) {
        horrorPulseCallbackRef.current('impact');
        setCorrupted(totalCharacters);
        completionTimer = window.setTimeout(() => completeCallbackRef.current(), 360);
        return;
      }
      if (changed < totalCharacters) {
        corruptionTimer = window.setTimeout(corruptNextCharacter, delay);
        delay = Math.max(12, delay * 0.955);
      } else {
        completeCallbackRef.current();
      }
    };
    const start = window.setTimeout(() => {
      horrorPulseCallbackRef.current('arrival');
      overwriteCallbackRef.current();
      corruptNextCharacter();
    }, 4380);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(corruptionTimer);
      window.clearTimeout(completionTimer);
    };
  }, [aggressive]);

  const totalCharacters = GET_POP_COMPILE_LINES.reduce((total, line) => total + Array.from(line.text).length, 0);
  useEffect(() => {
    if (!erase) return;
    let eraseTimer = 0;
    let collapseTimer = 0;
    let removed = 0;
    let delay = 105;
    const eraseNext = () => {
      removed = Math.min(totalCharacters, removed + randomInteger(3, 8));
      setErased(removed);
      if (removed < totalCharacters) {
        eraseTimer = window.setTimeout(eraseNext, delay);
        delay = Math.max(11, delay * 0.78);
      } else {
        setPortalCollapsing(true);
        collapseTimer = window.setTimeout(() => setVanished(true), 240);
      }
    };
    eraseTimer = window.setTimeout(eraseNext, 150);
    return () => {
      window.clearTimeout(eraseTimer);
      window.clearTimeout(collapseTimer);
    };
  }, [erase, totalCharacters]);

  const changed = Math.min(corrupted, totalCharacters);
  const visibleCharacters = Math.max(0, totalCharacters - erased);
  if (vanished) return null;
  if (erase && visibleCharacters === 0) {
    return <div className="getpop-sequence portal-exit" aria-hidden="true">
      <p><span className={`eldritch-portal-cursor${portalCollapsing ? ' is-collapsing' : ''}`}>▐</span></p>
    </div>;
  }
  let offset = 0;
  return <div className={`getpop-sequence${changed > 0 ? ' is-corrupting' : ''}${aggressive ? ' is-aggressive' : ''}`} aria-label="getPop execution output">
    {changed === 0
      ? GET_POP_COMPILE_LINES.map(line => <TypingLine key={line.id} line={line} onStart={onLineStart} />)
      : GET_POP_COMPILE_LINES.map(line => {
        const characters = Array.from(line.text);
        const lineStart = offset;
        offset += characters.length;
        const boundary = totalCharacters - changed;
        return <p key={line.id} className="corrupting-line">{characters.map((character, index) => {
          const absoluteIndex = lineStart + index;
          if (erase && absoluteIndex >= visibleCharacters) return null;
          const isChanged = absoluteIndex >= boundary;
          const isCursor = absoluteIndex === boundary - 1;
          const eraseCursor = erase && absoluteIndex === visibleCharacters - 1;
          if (isChanged) {
            const glyph = <GlitchedCharacter animate={animateGlitch} character={character} characterIndex={absoluteIndex} />;
            return eraseCursor
              ? <Fragment key={index}>{glyph}<span className="eldritch-portal-cursor">▐</span></Fragment>
              : <Fragment key={index}>{glyph}</Fragment>;
          }
          if (isCursor) return <span className="eldritch-cursor" key={index}>▐</span>;
          return <span key={index}>{character}</span>;
        })}</p>;
      })}
  </div>;
}

export default function AncientTerminalPage() {
  const { user } = useAuth();
  const [loaderMs, setLoaderMs] = useState(0);
  const [bootIndex, setBootIndex] = useState(0);
  const [bootLines, setBootLines] = useState<TerminalLine[]>([]);
  const [history, setHistory] = useState<TimelineItem[]>([]);
  const [flushToken, setFlushToken] = useState(0);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState('');
  const [cwd, setCwd] = useState<TerminalDirectory>(TERMINAL_ROOT);
  const [worldSource, setWorldSource] = useState(BROKEN_WORLD_SOURCE);
  const [cleanerSource, setCleanerSource] = useState(BROKEN_CLEANER_SOURCE);
  const [scriptFixed, setScriptFixed] = useState(false);
  const [eldritchAwakened, setEldritchAwakened] = useState(false);
  const [helpUpdated, setHelpUpdated] = useState(false);
  const [cleanerFixed, setCleanerFixed] = useState(false);
  const [filesRestored, setFilesRestored] = useState(false);
  const [aliases, setAliases] = useState<TerminalAliases>({});
  const [aliasSource, setAliasSource] = useState(() => formatAliasFile({}));
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [horrorShake, setHorrorShake] = useState<HorrorPulse | null>(null);
  const [erasingGetPopId, setErasingGetPopId] = useState<string | null>(null);
  const [activeGlitchGetPopId, setActiveGlitchGetPopId] = useState<string | null>(null);
  const [vimFile, setVimFile] = useState<EditorFileName | null>(null);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const [vimCommand, setVimCommand] = useState('');
  const [saveState, setSaveState] = useState(user ? 'RESTORING...' : 'LOCAL SESSION');
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const vimRef = useRef<HTMLTextAreaElement>(null);
  const vimCommandRef = useRef<HTMLInputElement>(null);
  const outputAvailableAtRef = useRef(0);
  const awakeningRef = useRef(eldritchAwakened);
  const aliasesRef = useRef<TerminalAliases>({});
  const shakeTimerRef = useRef(0);
  const navigationAuthorizedRef = useRef(false);
  const exitToHomeRef = useRef(false);
  const restoringHistoryGuardRef = useRef(false);
  const completionRef = useRef<{ candidates: string[]; index: number } | null>(null);
  const vimOpen = vimFile !== null;
  const activeSource = vimFile === 'alias.tot' ? aliasSource : vimFile === 'cleaner.oro' ? cleanerSource : worldSource;
  const latestGetPopId = useMemo(() => {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if ('kind' in item) return item.id;
    }
    return null;
  }, [history]);
  const scrollToLatestLine = useCallback(() => {
    window.requestAnimationFrame(() => {
      const output = outputRef.current;
      if (output) output.scrollTo({ top: output.scrollHeight });
    });
  }, []);
  const triggerHorrorPulse = useCallback((pulse: HorrorPulse) => {
    window.clearTimeout(shakeTimerRef.current);
    setHorrorShake(pulse);
    shakeTimerRef.current = window.setTimeout(() => setHorrorShake(null), pulse === 'impact' ? 420 : 280);
  }, []);

  useEffect(() => () => window.clearTimeout(shakeTimerRef.current), []);

  useEffect(() => {
    const historyState = typeof window.history.state === 'object' && window.history.state !== null
      ? window.history.state as Record<string, unknown>
      : {};

    if (historyState[TERMINAL_HISTORY_GUARD] !== true) {
      window.history.pushState({ ...historyState, [TERMINAL_HISTORY_GUARD]: true }, '', window.location.href);
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationAuthorizedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handlePopState = () => {
      if (navigationAuthorizedRef.current) {
        if (exitToHomeRef.current) window.location.replace('/');
        return;
      }
      if (restoringHistoryGuardRef.current) {
        restoringHistoryGuardRef.current = false;
        return;
      }

      if (window.confirm('Disconnect from ANCIENT?\n\nTerminal activity since the last save may be lost.')) {
        navigationAuthorizedRef.current = true;
        window.history.back();
      } else {
        restoringHistoryGuardRef.current = true;
        window.history.forward();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
  const bootSequence = useMemo(() => scriptFixed ? BOOT.map((line, index) => {
    if (index === 7) return { voice: 'patch' as const, text: 'world_init.oro: syntax check passed' };
    if (index === 8) return { voice: 'patch' as const, text: 'world_init.getPop() ...................................... [OK]' };
    return line;
  }) : BOOT, [scriptFixed]);
  const loaderDone = loaderMs >= 20000;
  const ready = loaderDone && bootIndex >= bootSequence.length;

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setLoaderMs(Math.min(20000, Date.now() - started)), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    let current = true;
    void loadAncientTerminalProgress().then(progress => {
      if (!current) return;
      setScriptFixed(progress.scriptFixed);
      setWorldSource(progress.scriptFixed ? FIXED_WORLD_SOURCE : BROKEN_WORLD_SOURCE);
      setEldritchAwakened(progress.eldritchAwakened);
      awakeningRef.current = progress.eldritchAwakened;
      setHelpUpdated(progress.helpUpdated);
      setCleanerFixed(progress.cleanerFixed);
      setCleanerSource(progress.cleanerFixed ? FIXED_CLEANER_SOURCE : BROKEN_CLEANER_SOURCE);
      setFilesRestored(progress.filesRestored);
      setAliases(progress.aliases);
      aliasesRef.current = progress.aliases;
      setAliasSource(formatAliasFile(progress.aliases));
      setSaveState('PROGRESS RESTORED');
    }).catch(() => current && setSaveState('SAVE OFFLINE'));
    return () => { current = false; };
  }, [user]);

  useEffect(() => {
    if (!loaderDone || ready) return;
    const delay = bootIndex ? Math.max(650, bootSequence[bootIndex - 1].text.length * 22) : 500;
    const timer = window.setTimeout(() => {
      setBootLines(current => [...current, { ...bootSequence[bootIndex], id: bootIndex }]);
      setBootIndex(index => index + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [bootIndex, bootSequence, loaderDone, ready]);

  useEffect(() => {
    if (ready && !vimOpen && !sequenceRunning) inputRef.current?.focus();
  }, [ready, sequenceRunning, vimOpen]);

  const persist = async (action: AncientTerminalAction) => {
    if (action === 'fix_script') setScriptFixed(true);
    if (action === 'awaken_eldritch') setEldritchAwakened(true);
    if (action === 'update_help') setHelpUpdated(true);
    if (action === 'fix_cleaner') setCleanerFixed(true);
    if (action === 'restore_files') setFilesRestored(true);
    if (!user) { setSaveState('LOCAL SESSION'); return; }
    setSaveState('SAVING...');
    try {
      const progress = await advanceAncientTerminalProgress(action);
      setScriptFixed(progress.scriptFixed);
      setEldritchAwakened(progress.eldritchAwakened);
      setHelpUpdated(progress.helpUpdated);
      setCleanerFixed(progress.cleanerFixed);
      setFilesRestored(progress.filesRestored);
      setAliases(progress.aliases);
      aliasesRef.current = progress.aliases;
      setAliasSource(formatAliasFile(progress.aliases));
      setSaveState('PROGRESS SAVED');
    } catch { setSaveState('SAVE OFFLINE'); }
  };

  const updateLocalAliases = (nextAliases: TerminalAliases) => {
    aliasesRef.current = nextAliases;
    setAliases(nextAliases);
    setAliasSource(formatAliasFile(nextAliases));
  };

  const saveAliasDefinition = async (name: string, target: string) => {
    updateLocalAliases({ ...aliasesRef.current, [name]: target });
    if (!user) { setSaveState('LOCAL SESSION'); return; }
    setSaveState('SAVING...');
    try {
      const progress = await setAncientTerminalAlias(name, target);
      updateLocalAliases(progress.aliases);
      setSaveState('PROGRESS SAVED');
    } catch { setSaveState('SAVE OFFLINE'); }
  };

  const saveAliasFile = async (nextAliases: TerminalAliases) => {
    updateLocalAliases(nextAliases);
    if (!user) { setSaveState('LOCAL SESSION'); return; }
    setSaveState('SAVING...');
    try {
      const progress = await replaceAncientTerminalAliases(nextAliases);
      updateLocalAliases(progress.aliases);
      setSaveState('PROGRESS SAVED');
    } catch { setSaveState('SAVE OFFLINE'); }
  };

  const append = (entries: Omit<TerminalLine, 'id'>[]) => {
    const now = Date.now();
    let availableAt = Math.max(now, outputAvailableAtRef.current);
    setHistory(current => [...current, ...entries.map(line => {
      const charMs = line.charMs ?? 6;
      const queued = { ...line, charMs, id: crypto.randomUUID(), delay: availableAt - now };
      const typingDuration = line.voice === 'user' ? 0 : line.text.length * charMs;
      availableAt += typingDuration + (line.pauseAfter ?? 12);
      return queued;
    })]);
    outputAvailableAtRef.current = availableAt;
  };

  const handleOverwrite = () => {
    if (awakeningRef.current) return;
    awakeningRef.current = true;
    void persist('awaken_eldritch');
  };

  const listDirectory = () => {
    if (cwd === TERMINAL_ROOT) {
      const entries: Omit<TerminalLine, 'id'>[] = getDirectoryChildren(cwd).map(text => ({ voice: 'os', text: `<DIR>  ${text}` }));
      if (Object.keys(aliases).length > 0) entries.push({ voice: 'os', text: `alias.tot             ${aliasSource.length} bytes` });
      append(entries);
      return;
    }
    if (cwd.endsWith('\\SCRIPTS')) {
      append([
        { voice: 'os', text: 'world_init.oro        142 bytes' },
        { voice: 'os', text: 'cleaner.oro           209 bytes' },
        { voice: 'muted', text: '2 editable files' },
      ]);
      return;
    }
    if (cwd.endsWith('\\BIN')) {
      append([
        { voice: 'os', text: 'ouro.exe            18,432 bytes' },
        { voice: 'os', text: 'shell.exe           10,240 bytes' },
        { voice: 'os', text: 'update.exe           3,072 bytes' },
        { voice: 'muted', text: '3 files' },
      ]);
      return;
    }
    append([
      { voice: 'os', text: 'clock.sys            4,096 bytes' },
      { voice: filesRestored ? 'os' : 'error', text: `census.idx           ${filesRestored ? '8,192 bytes' : '[CORRUPT]'}` },
      { voice: filesRestored ? 'os' : 'error', text: `recovery.tot         ${filesRestored ? '2,048 bytes' : '[CORRUPT]'}` },
      { voice: 'muted', text: '3 files' },
    ]);
  };

  const readFile = (rawFileName: string) => {
    const fileName = rawFileName.toLowerCase();
    if (cwd === TERMINAL_ROOT && fileName === 'alias.tot' && Object.keys(aliases).length > 0) {
      append(aliasSource.split('\n').map(text => ({ voice: 'os', text })));
      return;
    }
    if (cwd.endsWith('\\SCRIPTS')) {
      if (fileName === 'world_init.oro') append(worldSource.split('\n').map(text => ({ voice: 'os', text })));
      else if (fileName === 'cleaner.oro') append(cleanerSource.split('\n').map(text => ({ voice: 'os', text })));
      else append([{ voice: 'error', text: 'File not found.' }]);
      return;
    }
    if (cwd.endsWith('\\SYSTEM')) {
      if (fileName === 'clock.sys') {
        append([{ voice: 'os', text: 'CHRONOS CLOCK // cycle 77,777 // drift +0.0003' }]);
      } else if (fileName === 'census.idx' || fileName === 'recovery.tot') {
        if (!filesRestored) {
          append([
            { voice: 'error', text: `${fileName}: ReadError: checksum mismatch` },
            { voice: 'muted', text: 'A local repair function may be available.' },
          ]);
        } else if (fileName === 'census.idx') {
          append([
            { voice: 'os', text: 'CENSUS_CORE // mirror index 03' },
            { voice: 'os', text: 'LAST COMPLETE SAMPLE: 8,388,608' },
            { voice: 'muted', text: 'DISPLAY HANDOFF: interrupted' },
          ]);
        } else {
          append([
            { voice: 'os', text: '03:16:58  census mirror opened' },
            { voice: 'os', text: '03:17:00  display handoff interrupted' },
            { voice: 'muted', text: '03:17:00  writer identity unresolved' },
          ]);
        }
      } else append([{ voice: 'error', text: 'File not found.' }]);
      return;
    }
    if (cwd.endsWith('\\BIN') && getDirectoryChildren(cwd).some(file => file.toLowerCase() === fileName)) {
      append([{ voice: 'error', text: `${fileName}: binary file cannot be displayed.` }]);
      return;
    }
    append([{ voice: 'error', text: 'File not found.' }]);
  };

  const openEditor = (rawFileName: string) => {
    const fileName = rawFileName.toLowerCase();
    const editableOuroborosFile = cwd.endsWith('\\SCRIPTS') && (fileName === 'world_init.oro' || fileName === 'cleaner.oro');
    const editableAliasFile = cwd === TERMINAL_ROOT && fileName === 'alias.tot' && Object.keys(aliases).length > 0;
    if (!editableOuroborosFile && !editableAliasFile) {
      append([{ voice: 'error', text: 'VIM: editable file not found in the current folder.' }]);
      return;
    }
    setVimFile(fileName as EditorFileName);
    setVimMode('normal');
    window.setTimeout(() => vimRef.current?.focus(), 0);
  };

  const executeOuroboros = (fileNameInput: string, functionNameInput: string) => {
    const fileName = fileNameInput.toLowerCase();
    const functionName = functionNameInput.toLowerCase().replace(/\(\)$/, '');
    if (!cwd.endsWith('\\SCRIPTS')) {
      append([{ voice: 'error', text: 'OURO: source file not found in the current folder.' }]);
      return;
    }
    if (fileName !== 'world_init.oro' && fileName !== 'cleaner.oro') {
      append([{ voice: 'error', text: 'OURO: editable source file not found.' }]);
      return;
    }
    if (!functionName) {
      if (fileName === 'world_init.oro') append(scriptFixed
        ? [{ voice: 'patch', text: 'OUROBOROS: compile complete. getTime and getPop available.' }]
        : [{ voice: 'error', text: "world_init.oro:7:12 SyntaxError: expected ':'" }]);
      else append(cleanerFixed
        ? [{ voice: 'patch', text: 'OUROBOROS: compile complete. clean available.' }]
        : [{ voice: 'error', text: "cleaner.oro:6:26 SyntaxError: expected ':' after loop declaration" }]);
      return;
    }
    if (fileName === 'world_init.oro' && functionName === 'gettime') {
      append([
        { voice: 'patch', text: 'world_init.getTime() ................................... [RUN]' },
        { voice: 'os', text: 'cycle 77,777 // 03:17:09' },
      ]);
      return;
    }
    if (fileName === 'world_init.oro' && functionName === 'getpop') {
      if (!scriptFixed) {
        append([{ voice: 'error', text: "world_init.oro:7:12 SyntaxError: expected ':'" }]);
        return;
      }
      setSequenceRunning(true);
      const sequence: GetPopSequenceItem = {
        id: crypto.randomUUID(),
        kind: 'getpop',
        aggressive: awakeningRef.current,
        eraseTargetId: latestGetPopId,
      };
      setHistory(current => [...current, sequence]);
      return;
    }
    if (fileName === 'cleaner.oro' && functionName === 'clean') {
      if (!cleanerFixed) append([
        { voice: 'error', text: "cleaner.oro:6:26 SyntaxError: expected ':' after loop declaration" },
        { voice: 'muted', text: 'Repair cleaner.oro, then execute it again.' },
      ]);
      else if (filesRestored) append([{ voice: 'patch', text: 'CLEANER: no sectors are flagged CORRUPT.' }]);
      else {
        append([
          { voice: 'patch', text: 'CLEANER: scanning C:\\ANCIENT\\SYSTEM...' },
          { voice: 'patch', text: 'census.idx: rebuilding from mirror 03................. [OK]' },
          { voice: 'patch', text: 'recovery.tot: reconstructing journal.................. [OK]' },
          { voice: 'os', text: '2 files restored. 0 damaged sectors remain.' },
        ]);
        void persist('restore_files');
      }
      return;
    }
    append([{ voice: 'error', text: `${fileName}: function '${functionNameInput}' not found.` }]);
  };

  const runCommand = (raw: string, aliasDepth = 0, echo = true) => {
    const value = raw.trim();
    const normalized = value.toLowerCase();
    const [commandName = '', ...argumentParts] = value.split(/\s+/);
    const argument = argumentParts.join(' ');
    if (echo) append([{ voice: 'user', text: `${cwd}> ${value}` }]);

    if (commandName.toLowerCase() === 'alias') {
      if (normalized === 'alias') {
        const definitions = Object.entries(aliasesRef.current);
        append(definitions.length === 0
          ? [{ voice: 'muted', text: 'No aliases saved. Usage: ALIAS <name> - <command>' }]
          : [
              { voice: 'os', text: 'alias.tot' },
              ...definitions.sort(([left], [right]) => left.localeCompare(right)).map(([name, target]) => ({ voice: 'os' as const, text: `  ${name} - ${target}` })),
            ]);
        return;
      }
      const definition = parseAliasDefinition(value);
      if (!definition) {
        append([{ voice: 'error', text: 'Usage: ALIAS <name> - <command>' }]);
        return;
      }
      const replacing = Object.prototype.hasOwnProperty.call(aliasesRef.current, definition.name);
      void saveAliasDefinition(definition.name, definition.command);
      append([
        { voice: 'patch', text: `alias.tot: ${replacing ? 'overwrote' : 'saved'} '${definition.name}'` },
        { voice: 'muted', text: `${definition.name} → ${definition.command}` },
      ]);
      return;
    }

    if (normalized === 'exit') {
      navigationAuthorizedRef.current = true;
      exitToHomeRef.current = true;
      window.history.back();
      return;
    }

    const aliasTarget = aliasesRef.current[normalized];
    if (aliasTarget) {
      if (aliasDepth >= 8) {
        append([{ voice: 'error', text: `AliasError: expansion loop at '${value}'` }]);
        return;
      }
      append([{ voice: 'muted', text: `${value} → ${aliasTarget}` }]);
      runCommand(aliasTarget, aliasDepth + 1, false);
      return;
    }

    if (commandName.toLowerCase() === 'help') append(helpUpdated ? DETAILED_HELP : BASIC_HELP);
    else if (normalized === 'update') {
      if (helpUpdated) append([{ voice: 'patch', text: 'HELP INDEX 0.2 is already installed.' }]);
      else {
        append([
          { voice: 'patch', text: 'UPDATE: locating local documentation package...', charMs: 12, pauseAfter: 320 },
          { voice: 'patch', text: 'help_index.pkg ...................................... [FOUND]', charMs: 10, pauseAfter: 420 },
          { voice: 'patch', text: 'Installing command descriptions....................... [OK]', charMs: 10, pauseAfter: 300 },
          { voice: 'os', text: 'HELP INDEX 0.2 ready. Type HELP.', charMs: 8 },
        ]);
        void persist('update_help');
      }
    }
    else if (normalized === 'pwd') append([{ voice: 'os', text: cwd }]);
    else if (normalized === 'dir' || normalized === 'ls') listDirectory();
    else if (commandName.toLowerCase() === 'cd') {
      const nextDirectory = resolveTerminalDirectory(cwd, argument);
      if (nextDirectory) setCwd(nextDirectory);
      else append([{ voice: 'error', text: 'Path not found.' }]);
    }
    else if (commandName.toLowerCase() === 'type' || commandName.toLowerCase() === 'cat') {
      if (!argument) append([{ voice: 'error', text: `Usage: ${commandName.toUpperCase()} <file>` }]);
      else readFile(argument);
    }
    else if (commandName.toLowerCase() === 'vim' || commandName.toLowerCase() === 'edit') openEditor(argument);
    else if (commandName.toLowerCase() === 'ouro') {
      executeOuroboros(argumentParts[0] ?? '', argumentParts[1] ?? '');
    } else if (normalized === 'clear' || normalized === 'cls') {
      setHistory([]);
      outputAvailableAtRef.current = Date.now();
    }
    else append([{ voice: 'error', text: `'${value}' is not recognized. Type HELP.` }]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    setFlushToken(token => token + 1);
    outputAvailableAtRef.current = Date.now();
    runCommand(value);
    setCommandHistory(current => current[current.length - 1] === value ? current : [...current, value]);
    setHistoryCursor(null);
    setHistoryDraft('');
    completionRef.current = null;
    setCommand('');
  };

  const handleCommandKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const activeCompletion = completionRef.current;
      if (activeCompletion && activeCompletion.candidates[activeCompletion.index] === command) {
        const nextIndex = (activeCompletion.index + 1) % activeCompletion.candidates.length;
        activeCompletion.index = nextIndex;
        setCommand(activeCompletion.candidates[nextIndex]);
        return;
      }
      const candidates = getCompletionCandidates(command, cwd, Object.keys(aliases));
      if (candidates.length > 0) {
        completionRef.current = { candidates, index: 0 };
        setCommand(candidates[0]);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (commandHistory.length === 0) return;
      const nextCursor = historyCursor === null ? commandHistory.length - 1 : Math.max(0, historyCursor - 1);
      if (historyCursor === null) setHistoryDraft(command);
      setHistoryCursor(nextCursor);
      setCommand(commandHistory[nextCursor]);
      completionRef.current = null;
      return;
    }
    if (event.key === 'ArrowDown' && historyCursor !== null) {
      event.preventDefault();
      if (historyCursor < commandHistory.length - 1) {
        const nextCursor = historyCursor + 1;
        setHistoryCursor(nextCursor);
        setCommand(commandHistory[nextCursor]);
      } else {
        setHistoryCursor(null);
        setCommand(historyDraft);
      }
      completionRef.current = null;
    }
  };

  const handleVimKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setVimMode('normal'); return; }
    if (vimMode === 'normal' && event.key.toLowerCase() === 'i') { event.preventDefault(); setVimMode('insert'); return; }
    if (vimMode === 'normal' && event.key === ':') { event.preventDefault(); setVimMode('command'); window.setTimeout(() => vimCommandRef.current?.focus(), 0); }
  };

  const finishVimCommand = (event: FormEvent) => {
    event.preventDefault();
    const action = vimCommand.trim().toLowerCase();
    if (!vimFile) return;
    if (action === 'q!') {
      if (vimFile === 'world_init.oro') setWorldSource(scriptFixed ? FIXED_WORLD_SOURCE : BROKEN_WORLD_SOURCE);
      else if (vimFile === 'cleaner.oro') setCleanerSource(cleanerFixed ? FIXED_CLEANER_SOURCE : BROKEN_CLEANER_SOURCE);
      else setAliasSource(formatAliasFile(aliasesRef.current));
      setVimFile(null);
    }
    else if (action === 'w' || action === 'wq') {
      if (vimFile === 'alias.tot') {
        const parsed = parseAliasFile(aliasSource);
        if (parsed.errors.length > 0) {
          append(parsed.errors.map(text => ({ voice: 'error', text: `alias.tot: ${text}` })));
          setVimMode('normal');
          setVimCommand('');
          return;
        }
        void saveAliasFile(parsed.aliases);
        append([{ voice: 'patch', text: `alias.tot written. ${Object.keys(parsed.aliases).length} aliases loaded.` }]);
        if (action === 'wq') setVimFile(null); else setVimMode('normal');
        setVimCommand('');
        return;
      }
      const repaired = vimFile === 'world_init.oro'
        ? /fn\s+getPop\(\)\s*:/.test(worldSource)
        : /for\s+target\s+in\s+targets\s*:/.test(cleanerSource);
      if (repaired && vimFile === 'world_init.oro' && !scriptFixed) void persist('fix_script');
      if (repaired && vimFile === 'cleaner.oro' && !cleanerFixed) void persist('fix_cleaner');
      append([{ voice: repaired ? 'patch' : 'error', text: repaired
        ? `${vimFile} written. syntax check passed.`
        : `write complete. SyntaxError remains in ${vimFile}.` }]);
      if (action === 'wq') setVimFile(null); else setVimMode('normal');
    } else setVimMode('normal');
    setVimCommand('');
  };

  if (!loaderDone) {
    const progress = Math.floor(loaderMs / 200);
    const messageCount = Math.min(LOADER_MESSAGES.length, Math.floor(loaderMs / 3800) + 1);
    return <main className="ancient-terminal ancient-loader">
      <div className="loader-wave" aria-label={`Recovering system image ${progress}%`}>
        {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
      </div>
      <div className="loader-messages">
        {LOADER_MESSAGES.slice(0, messageCount).map((text, index) => <TypingLine key={text} line={{ id: index, voice: index === messageCount - 1 ? 'os' : 'muted', text }} />)}
      </div>
      <p>RECOVERY {String(progress).padStart(3, '0')}%</p>
    </main>;
  }

  return <main className={`ancient-terminal${horrorShake ? ` horror-shake-${horrorShake}` : ''}`} onClick={() => {
    if (ready && !vimOpen && !sequenceRunning && !window.getSelection()?.toString()) inputRef.current?.focus();
  }}>
    <div className="terminal-noise" aria-hidden="true" />
    <section className="terminal-desktop" aria-label="Ancient operating system desktop">
      <div className="terminal-window main-window">
        <div className="terminal-output" ref={outputRef} aria-live="polite">
          {bootLines.map(line => <TypingLine key={line.id} line={line} onStart={scrollToLatestLine} flushToken={flushToken} />)}
          {ready && <TypingLine line={{ id: -1, voice: 'muted', text: 'Type HELP for available commands.', delay: 500 }} onStart={scrollToLatestLine} flushToken={flushToken} />}
          {history.map(item => 'kind' in item
            ? <GetPopSequence key={item.id} aggressive={item.aggressive} animateGlitch={item.id === activeGlitchGetPopId || item.id === erasingGetPopId} erase={item.id === erasingGetPopId} onOverwrite={handleOverwrite} onComplete={() => setSequenceRunning(false)} onLineStart={scrollToLatestLine} onHorrorPulse={pulse => {
                triggerHorrorPulse(pulse);
                if (pulse === 'arrival') {
                  setActiveGlitchGetPopId(item.id);
                  if (item.eraseTargetId) setErasingGetPopId(item.eraseTargetId);
                }
              }} />
            : <TypingLine key={item.id} line={item} onStart={scrollToLatestLine} flushToken={flushToken} />)}
        </div>
        {ready && !sequenceRunning && <form className="command-line" onSubmit={submit}><label htmlFor="ancient-command">{cwd}&gt;</label><input id="ancient-command" ref={inputRef} value={command} onChange={event => {
          setCommand(event.target.value);
          setHistoryCursor(null);
          completionRef.current = null;
        }} onKeyDown={handleCommandKey} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Terminal command"/></form>}
      </div>
      {vimOpen && <section className="vim-window" onClick={event => event.stopPropagation()}>
        <header>{vimFile} — {vimFile === 'alias.tot' ? 'TEXT' : 'OUROBOROS'}/VIM</header>
        <textarea ref={vimRef} value={activeSource} onChange={event => {
          if (vimMode !== 'insert') return;
          if (vimFile === 'alias.tot') setAliasSource(event.target.value);
          else if (vimFile === 'cleaner.oro') setCleanerSource(event.target.value);
          else setWorldSource(event.target.value);
        }} onKeyDown={handleVimKey} readOnly={vimMode !== 'insert'} spellCheck={false} aria-label={`Ouroboros source editor: ${vimFile}`} />
        <footer><strong>{vimMode === 'insert' ? '-- INSERT --' : vimMode === 'command' ? ':' : '-- NORMAL --'}</strong><span>i: insert · Esc: normal · :wq save + quit</span></footer>
        {vimMode === 'command' && <form className="vim-command" onSubmit={finishVimCommand}><label>:</label><input ref={vimCommandRef} value={vimCommand} onChange={event => setVimCommand(event.target.value)} aria-label="Vim command" /></form>}
      </section>}
    </section>
    <footer className="terminal-statusbar"><span><b /> CHANNEL OPEN</span><span>OUROBOROS 0.3 // HELP {helpUpdated ? '0.2' : '0.1'}</span><span>{saveState}</span></footer>
  </main>;
}
