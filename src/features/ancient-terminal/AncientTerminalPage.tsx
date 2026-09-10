import { type CSSProperties, FormEvent, Fragment, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import {
  advanceAncientTerminalProgress,
  copyAncientTerminalFile,
  createAncientTerminalDirectory,
  deleteAncientTerminalFile,
  loadAncientTerminalProgress,
  loadAncientTerminalFiles,
  moveAncientTerminalEntry,
  replaceAncientTerminalAliases,
  resetAncientTerminalProgress,
  setAncientTerminalAlias,
  writeAncientTerminalFile,
  type AncientTerminalAction,
  type AncientTerminalFile,
} from './ancientTerminalService';
import {
  findTerminalEntries,
  formatAliasFile,
  formatTerminalTree,
  getCompletionCandidates,
  getDirectoryChildren,
  getManualEntry,
  grepText,
  normalizeTerminalPath,
  parseCommandLine,
  parseAliasDefinition,
  parseAliasFile,
  resolveTerminalDirectory,
  resolveTerminalEntry,
  storagePathToTerminalPath,
  terminalPathToStoragePath,
  TERMINAL_HOME,
  TERMINAL_ROOT,
  type TerminalAliases,
  type TerminalDirectory,
} from './ancientTerminalShell';
import { startOuroborosExecution, type OuroborosExecution } from './ouroborosClient';
import { formatOuroborosValue } from './ouroborosRuntime';
import { XtermCommandLine, type XtermCommandLineHandle } from './XtermCommandLine';
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
type EditorFileName = string;
type ConfirmationRequest = { action: 'exit' | 'reboot'; step: 1 | 2 };
type RebootPhase = 'crash' | 'static' | 'red' | 'purple';

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
  { voice: 'os', text: 'HELP  MAN  UPDATE  LS  DIR  CD  PWD  TREE  FIND  FILE  GREP' },
  { voice: 'os', text: 'TYPE  CAT  VIM  EDIT  OURO  ALIAS  MKDIR  TOUCH  CP  COPY  MV  MOVE' },
  { voice: 'os', text: 'RM  DEL  ECHO  HISTORY  CLEAR  CLS  EXIT  REBOOT' },
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
  { voice: 'os', text: '  MKDIR <path>      create a persistent directory beneath HOME' },
  { voice: 'os', text: '  TOUCH <file>      create an empty persistent .oro or .tot file beneath HOME' },
  { voice: 'os', text: '  CP / COPY <source> <target>  duplicate a player file' },
  { voice: 'os', text: '  MV / MOVE <source> <target>  move or rename a player path' },
  { voice: 'os', text: '  RM / DEL <path>   delete one player file or empty directory' },
  { voice: 'os', text: '  ECHO <text>       print text; > replaces a HOME file and >> appends' },
  { voice: 'muted', text: 'DISCOVERY' },
  { voice: 'os', text: '  TREE              display the indexed filesystem hierarchy' },
  { voice: 'os', text: '  FIND <text>       search paths and filenames' },
  { voice: 'os', text: '  FILE <path>       identify a file or directory' },
  { voice: 'os', text: '  GREP <text> <file> search file contents; quote text containing spaces' },
  { voice: 'os', text: '  MAN <command>     display one command manual entry' },
  { voice: 'muted', text: 'PROGRAMS' },
  { voice: 'os', text: '  OURO <file> <fn>  compile a .oro file and execute one function' },
  { voice: 'os', text: '  Example: OURO world_init.oro getTime' },
  { voice: 'muted', text: '  Ouroboros runs in an isolated process. Press CTRL+C to interrupt it.' },
  { voice: 'os', text: '  ALIAS             list saved aliases' },
  { voice: 'os', text: '  ALIAS <name> - <command>  create or overwrite an alias' },
  { voice: 'muted', text: 'SHELL' },
  { voice: 'os', text: '  UPDATE            install the newest local help index' },
  { voice: 'os', text: '  CLEAR / CLS       clear terminal output' },
  { voice: 'os', text: '  HISTORY [-c]      show or clear commands entered during this session' },
  { voice: 'os', text: '  EXIT              disconnect safely and return to the site' },
  { voice: 'os', text: '  REBOOT            erase progress and restore the original system image' },
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
  const [bootCycle, setBootCycle] = useState(0);
  const [loaderMs, setLoaderMs] = useState(0);
  const [bootIndex, setBootIndex] = useState(0);
  const [bootLines, setBootLines] = useState<TerminalLine[]>([]);
  const [history, setHistory] = useState<TimelineItem[]>([]);
  const [flushToken, setFlushToken] = useState(0);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(null);
  const [rebootPhase, setRebootPhase] = useState<RebootPhase | null>(null);
  const [cwd, setCwd] = useState<TerminalDirectory>(TERMINAL_ROOT);
  const [worldSource, setWorldSource] = useState(BROKEN_WORLD_SOURCE);
  const [cleanerSource, setCleanerSource] = useState(BROKEN_CLEANER_SOURCE);
  const [scriptFixed, setScriptFixed] = useState(false);
  const [eldritchAwakened, setEldritchAwakened] = useState(false);
  const [helpUpdated, setHelpUpdated] = useState(false);
  const [cleanerFixed, setCleanerFixed] = useState(false);
  const [filesRestored, setFilesRestored] = useState(false);
  const [aliases, setAliases] = useState<TerminalAliases>({});
  const [terminalFiles, setTerminalFiles] = useState<AncientTerminalFile[]>([]);
  const [aliasSource, setAliasSource] = useState(() => formatAliasFile({}));
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [horrorShake, setHorrorShake] = useState<HorrorPulse | null>(null);
  const [erasingGetPopId, setErasingGetPopId] = useState<string | null>(null);
  const [activeGlitchGetPopId, setActiveGlitchGetPopId] = useState<string | null>(null);
  const [vimFile, setVimFile] = useState<EditorFileName | null>(null);
  const [vimStoragePath, setVimStoragePath] = useState<string | null>(null);
  const [vimDraft, setVimDraft] = useState('');
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const [vimCommand, setVimCommand] = useState('');
  const [saveState, setSaveState] = useState(user ? 'RESTORING...' : 'LOCAL SESSION');
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<XtermCommandLineHandle>(null);
  const vimRef = useRef<HTMLTextAreaElement>(null);
  const vimCommandRef = useRef<HTMLInputElement>(null);
  const outputAvailableAtRef = useRef(0);
  const awakeningRef = useRef(eldritchAwakened);
  const aliasesRef = useRef<TerminalAliases>({});
  const shakeTimerRef = useRef(0);
  const navigationAuthorizedRef = useRef(false);
  const exitToHomeRef = useRef(false);
  const restoringHistoryGuardRef = useRef(false);
  const commandLogRef = useRef<string[]>([]);
  const activeExecutionRef = useRef<OuroborosExecution | null>(null);
  const vimOpen = vimFile !== null;
  const activeSource = vimStoragePath ? vimDraft : vimFile === 'alias.tot' ? aliasSource : vimFile === 'cleaner.oro' ? cleanerSource : worldSource;
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

  const restoreFactoryState = useCallback(() => {
    activeExecutionRef.current?.cancel();
    activeExecutionRef.current = null;
    window.clearTimeout(shakeTimerRef.current);
    awakeningRef.current = false;
    aliasesRef.current = {};
    outputAvailableAtRef.current = 0;
    commandLogRef.current = [];
    setLoaderMs(0);
    setBootIndex(0);
    setBootLines([]);
    setHistory([]);
    setFlushToken(0);
    setPendingConfirmation(null);
    setCwd(TERMINAL_ROOT);
    setWorldSource(BROKEN_WORLD_SOURCE);
    setCleanerSource(BROKEN_CLEANER_SOURCE);
    setScriptFixed(false);
    setEldritchAwakened(false);
    setHelpUpdated(false);
    setCleanerFixed(false);
    setFilesRestored(false);
    setAliases({});
    setTerminalFiles([]);
    setAliasSource(formatAliasFile({}));
    setSequenceRunning(false);
    setRuntimeBusy(false);
    setHorrorShake(null);
    setErasingGetPopId(null);
    setActiveGlitchGetPopId(null);
    setVimFile(null);
    setVimStoragePath(null);
    setVimDraft('');
    setVimMode('normal');
    setVimCommand('');
    setSaveState(user ? 'PROGRESS RESET' : 'LOCAL SESSION');
    setRebootPhase(null);
    setBootCycle(cycle => cycle + 1);
  }, [user]);

  useEffect(() => () => {
    window.clearTimeout(shakeTimerRef.current);
    activeExecutionRef.current?.cancel();
    activeExecutionRef.current = null;
  }, []);

  useEffect(() => {
    if (!rebootPhase) return;
    const phaseDuration = rebootPhase === 'crash' ? 1800 : rebootPhase === 'static' ? 1200 : rebootPhase === 'red' ? 950 : 1250;
    const timer = window.setTimeout(() => {
      if (rebootPhase === 'crash') setRebootPhase('static');
      else if (rebootPhase === 'static') setRebootPhase('red');
      else if (rebootPhase === 'red') setRebootPhase('purple');
      else restoreFactoryState();
    }, phaseDuration);
    return () => window.clearTimeout(timer);
  }, [rebootPhase, restoreFactoryState]);

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
  }, [bootCycle]);

  useEffect(() => {
    if (!user) {
      setTerminalFiles([]);
      return;
    }
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
    void loadAncientTerminalFiles().then(savedFiles => {
      if (current) setTerminalFiles(savedFiles);
    }).catch(() => {
      if (current) setTerminalFiles([]);
    });
    return () => { current = false; };
  }, [user]);

  const upsertTerminalFile = (savedFile: AncientTerminalFile) => {
    setTerminalFiles(current => [...current.filter(file => file.path !== savedFile.path), savedFile]
      .sort((left, right) => left.path.localeCompare(right.path)));
  };

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

  const beginReboot = async () => {
    setSequenceRunning(true);
    setSaveState(user ? 'ERASING PROGRESS...' : 'RESETTING...');
    try {
      if (user) await resetAncientTerminalProgress();
      setSaveState('SYSTEM FAILURE');
      setRebootPhase('crash');
    } catch {
      setSequenceRunning(false);
      setSaveState('RESET FAILED');
      append([
        { voice: 'error', text: 'REBOOT ABORTED: persistent storage rejected the reset.' },
        { voice: 'muted', text: 'No progress was erased.' },
      ]);
    }
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
    if (cwd.toUpperCase().startsWith(TERMINAL_HOME)) {
      const children = getDirectoryChildren(cwd, false, terminalFiles);
      if (children.length === 0) {
        append([{ voice: 'muted', text: 'Directory is empty.' }]);
        return;
      }
      append(children.map(name => {
        const entry = resolveTerminalEntry(cwd, name, false, terminalFiles);
        const savedFile = entry ? terminalFiles.find(file => storagePathToTerminalPath(file.path).toUpperCase() === entry.path.toUpperCase()) : null;
        return entry?.kind === 'directory'
          ? { voice: 'os' as const, text: `<DIR>  ${name}` }
          : { voice: 'os' as const, text: `${name.padEnd(24)} ${savedFile?.contents?.length ?? 0} bytes` };
      }));
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

  const getReadableSource = (rawPath: string): { name: string; source: string } | { error: string } => {
    const entry = resolveTerminalEntry(cwd, rawPath, Object.keys(aliasesRef.current).length > 0, terminalFiles);
    if (!entry) return { error: 'File not found.' };
    if (entry.kind === 'directory') return { error: `${entry.name}: is a directory.` };
    if (entry.kind === 'binary') return { error: `${entry.name}: binary file cannot be displayed.` };
    const storagePath = terminalPathToStoragePath(entry.path);
    if (storagePath) {
      const savedFile = terminalFiles.find(file => file.path === storagePath);
      if (!savedFile || savedFile.kind !== 'file') return { error: 'File not found.' };
      return { name: entry.name, source: savedFile.contents ?? '' };
    }
    if (entry.name.toLowerCase() === 'alias.tot') return { name: entry.name, source: aliasSource };
    if (entry.name.toLowerCase() === 'world_init.oro') return { name: entry.name, source: worldSource };
    if (entry.name.toLowerCase() === 'cleaner.oro') return { name: entry.name, source: cleanerSource };
    if (entry.name.toLowerCase() === 'clock.sys') return { name: entry.name, source: 'CHRONOS CLOCK // cycle 77,777 // drift +0.0003' };
    if ((entry.name.toLowerCase() === 'census.idx' || entry.name.toLowerCase() === 'recovery.tot') && !filesRestored) {
      return { error: `${entry.name}: ReadError: checksum mismatch` };
    }
    if (entry.name.toLowerCase() === 'census.idx') {
      return { name: entry.name, source: 'CENSUS_CORE // mirror index 03\nLAST COMPLETE SAMPLE: 8,388,608\nDISPLAY HANDOFF: interrupted' };
    }
    if (entry.name.toLowerCase() === 'recovery.tot') {
      return { name: entry.name, source: '03:16:58  census mirror opened\n03:17:00  display handoff interrupted\n03:17:00  writer identity unresolved' };
    }
    return { error: 'File not found.' };
  };

  const readFile = (rawFileName: string) => {
    const result = getReadableSource(rawFileName);
    if ('error' in result) {
      append([
        { voice: 'error', text: result.error },
        ...(result.error.includes('checksum') ? [{ voice: 'muted' as const, text: 'A local repair function may be available.' }] : []),
      ]);
      return;
    }
    append(result.source.split('\n').map(text => ({ voice: 'os', text })));
  };

  const openEditor = (rawFileName: string) => {
    const fileName = rawFileName.toLowerCase();
    const editableOuroborosFile = cwd.endsWith('\\SCRIPTS') && (fileName === 'world_init.oro' || fileName === 'cleaner.oro');
    const editableAliasFile = cwd === TERMINAL_ROOT && fileName === 'alias.tot' && Object.keys(aliases).length > 0;
    const entry = resolveTerminalEntry(cwd, rawFileName, Object.keys(aliasesRef.current).length > 0, terminalFiles);
    const storagePath = entry ? terminalPathToStoragePath(entry.path) : null;
    const savedFile = storagePath ? terminalFiles.find(file => file.path === storagePath && file.kind === 'file') : null;
    if (!editableOuroborosFile && !editableAliasFile && !savedFile) {
      append([{ voice: 'error', text: 'VIM: editable file not found in the current folder.' }]);
      return;
    }
    setVimFile(savedFile ? entry?.name ?? fileName : fileName);
    setVimStoragePath(savedFile ? savedFile.path : null);
    setVimDraft(savedFile?.contents ?? '');
    setVimMode('normal');
    window.setTimeout(() => vimRef.current?.focus(), 0);
  };

  const requirePersistentSession = () => {
    if (user) return true;
    append([
      { voice: 'error', text: 'HOME: authenticated session required for persistent changes.' },
      { voice: 'muted', text: 'No local-only copy was created.' },
    ]);
    return false;
  };

  const createPlayerDirectory = async (rawPath: string) => {
    if (!requirePersistentSession()) return;
    const path = normalizeTerminalPath(cwd, rawPath);
    if (!path || !terminalPathToStoragePath(path)) {
      append([{ voice: 'error', text: 'MKDIR: path must remain beneath C:\\ANCIENT\\HOME.' }]);
      return;
    }
    setSaveState('SAVING...');
    try {
      const savedFile = await createAncientTerminalDirectory(path);
      upsertTerminalFile(savedFile);
      setSaveState('PROGRESS SAVED');
      append([{ voice: 'os', text: `Directory created: ${storagePathToTerminalPath(savedFile.path)}` }]);
    } catch (error) {
      setSaveState('SAVE FAILED');
      append([{ voice: 'error', text: `MKDIR: ${error instanceof Error ? error.message : 'operation rejected'}` }]);
    }
  };

  const createPlayerFile = async (rawPath: string) => {
    if (!requirePersistentSession()) return;
    const path = normalizeTerminalPath(cwd, rawPath);
    if (!path || !terminalPathToStoragePath(path)) {
      append([{ voice: 'error', text: 'TOUCH: path must remain beneath C:\\ANCIENT\\HOME.' }]);
      return;
    }
    setSaveState('SAVING...');
    try {
      const savedFile = await writeAncientTerminalFile(path, '', 0);
      upsertTerminalFile(savedFile);
      setSaveState('PROGRESS SAVED');
      append([{ voice: 'os', text: `Created ${storagePathToTerminalPath(savedFile.path)}` }]);
    } catch (error) {
      setSaveState('SAVE FAILED');
      append([{ voice: 'error', text: `TOUCH: ${error instanceof Error ? error.message : 'operation rejected'}` }]);
    }
  };

  const removePlayerEntry = async (rawPath: string) => {
    if (!requirePersistentSession()) return;
    const entry = resolveTerminalEntry(cwd, rawPath, false, terminalFiles);
    const storagePath = entry ? terminalPathToStoragePath(entry.path) : null;
    const savedFile = storagePath ? terminalFiles.find(file => file.path === storagePath) : null;
    if (!entry || !storagePath || !savedFile) {
      append([{ voice: 'error', text: 'RM: player file or directory not found.' }]);
      return;
    }
    if (cwd.toUpperCase() === entry.path.toUpperCase() || cwd.toUpperCase().startsWith(`${entry.path.toUpperCase()}\\`)) {
      append([{ voice: 'error', text: 'RM: cannot remove the active directory.' }]);
      return;
    }
    setSaveState('SAVING...');
    try {
      await deleteAncientTerminalFile(storagePath, savedFile.revision);
      setTerminalFiles(current => current.filter(file => file.path !== storagePath));
      setSaveState('PROGRESS SAVED');
      append([{ voice: 'os', text: `Deleted ${entry.path}` }]);
    } catch (error) {
      setSaveState('SAVE FAILED');
      append([{ voice: 'error', text: `RM: ${error instanceof Error ? error.message : 'operation rejected'}` }]);
    }
  };

  const resolvePlayerOperation = (rawSource: string, rawTarget: string) => {
    const sourceEntry = resolveTerminalEntry(cwd, rawSource, false, terminalFiles);
    const sourceStoragePath = sourceEntry ? terminalPathToStoragePath(sourceEntry.path) : null;
    const sourceFile = sourceStoragePath ? terminalFiles.find(file => file.path === sourceStoragePath) : null;
    const existingTarget = resolveTerminalEntry(cwd, rawTarget, false, terminalFiles);
    const rawTargetPath = existingTarget?.kind === 'directory' && sourceEntry
      ? `${existingTarget.path}\\${sourceEntry.name}`
      : normalizeTerminalPath(cwd, rawTarget);
    const targetStoragePath = rawTargetPath ? terminalPathToStoragePath(rawTargetPath) : null;
    return { sourceEntry, sourceFile, sourceStoragePath, targetStoragePath };
  };

  const copyPlayerFile = async (rawSource: string, rawTarget: string) => {
    if (!requirePersistentSession()) return;
    const operation = resolvePlayerOperation(rawSource, rawTarget);
    if (!operation.sourceEntry || operation.sourceEntry.kind === 'directory' || !operation.sourceFile || !operation.sourceStoragePath) {
      append([{ voice: 'error', text: 'COPY: player source file not found.' }]);
      return;
    }
    if (!operation.targetStoragePath) {
      append([{ voice: 'error', text: 'COPY: target must remain beneath C:\\ANCIENT\\HOME.' }]);
      return;
    }
    setSaveState('SAVING...');
    try {
      const copiedFile = await copyAncientTerminalFile(operation.sourceStoragePath, operation.targetStoragePath, operation.sourceFile.revision);
      upsertTerminalFile(copiedFile);
      setSaveState('PROGRESS SAVED');
      append([{ voice: 'os', text: `Copied to ${storagePathToTerminalPath(copiedFile.path)}` }]);
    } catch (error) {
      setSaveState('SAVE FAILED');
      append([{ voice: 'error', text: `COPY: ${error instanceof Error ? error.message : 'operation rejected'}` }]);
    }
  };

  const movePlayerPath = async (rawSource: string, rawTarget: string) => {
    if (!requirePersistentSession()) return;
    const operation = resolvePlayerOperation(rawSource, rawTarget);
    if (!operation.sourceEntry || !operation.sourceFile || !operation.sourceStoragePath) {
      append([{ voice: 'error', text: 'MOVE: player source path not found.' }]);
      return;
    }
    if (!operation.targetStoragePath) {
      append([{ voice: 'error', text: 'MOVE: target must remain beneath C:\\ANCIENT\\HOME.' }]);
      return;
    }
    if (cwd.toUpperCase() === operation.sourceEntry.path.toUpperCase()
      || cwd.toUpperCase().startsWith(`${operation.sourceEntry.path.toUpperCase()}\\`)) {
      append([{ voice: 'error', text: 'MOVE: cannot move the active directory.' }]);
      return;
    }
    setSaveState('SAVING...');
    try {
      const savedFiles = await moveAncientTerminalEntry(
        operation.sourceStoragePath,
        operation.targetStoragePath,
        operation.sourceFile.revision,
      );
      setTerminalFiles(savedFiles);
      setSaveState('PROGRESS SAVED');
      append([{ voice: 'os', text: `Moved to ${storagePathToTerminalPath(operation.targetStoragePath)}` }]);
    } catch (error) {
      setSaveState('SAVE FAILED');
      append([{ voice: 'error', text: `MOVE: ${error instanceof Error ? error.message : 'operation rejected'}` }]);
    }
  };

  const echoText = async (text: string, redirect?: { append: boolean; path: string }) => {
    if (!redirect) {
      append([{ voice: 'os', text }]);
      return;
    }
    if (!requirePersistentSession()) return;
    const existingEntry = resolveTerminalEntry(cwd, redirect.path, false, terminalFiles);
    if (existingEntry?.kind === 'directory') {
      append([{ voice: 'error', text: 'ECHO: redirect target is a directory.' }]);
      return;
    }
    const targetPath = existingEntry?.path ?? normalizeTerminalPath(cwd, redirect.path);
    const storagePath = targetPath ? terminalPathToStoragePath(targetPath) : null;
    const currentFile = storagePath ? terminalFiles.find(file => file.path === storagePath && file.kind === 'file') : null;
    if (!storagePath || (existingEntry && !currentFile)) {
      append([{ voice: 'error', text: 'ECHO: redirect target must be an editable HOME file.' }]);
      return;
    }
    const contents = redirect.append
      ? `${currentFile?.contents ?? ''}${text}\n`
      : `${text}\n`;
    setSaveState('SAVING...');
    try {
      const savedFile = await writeAncientTerminalFile(storagePath, contents, currentFile?.revision ?? 0);
      upsertTerminalFile(savedFile);
      setSaveState('PROGRESS SAVED');
    } catch (error) {
      setSaveState('SAVE FAILED');
      append([{ voice: 'error', text: `ECHO: ${error instanceof Error ? error.message : 'redirect rejected'}` }]);
    }
  };

  const executeOuroborosFile = async (fileNameInput: string, functionNameInput: string) => {
    if (!fileNameInput) {
      append([{ voice: 'error', text: 'Usage: OURO <file.oro> [function]' }]);
      return;
    }
    const readable = getReadableSource(fileNameInput);
    if ('error' in readable || !readable.name.toLowerCase().endsWith('.oro')) {
      append([{ voice: 'error', text: `OURO: ${'error' in readable ? readable.error : 'source must be an editable .oro file.'}` }]);
      return;
    }
    const fileName = readable.name.toLowerCase();
    const functionName = functionNameInput.replace(/\(\)$/, '');
    const normalizedFunction = functionName.toLowerCase();

    // The incomplete system cleaner calls protected host APIs. Its effects remain
    // server-controlled until those APIs are exposed through a capability layer.
    if (fileName === 'cleaner.oro') {
      if (!functionName) append(cleanerFixed
        ? [{ voice: 'patch', text: 'OUROBOROS: compile complete. clean available.' }]
        : [{ voice: 'error', text: "cleaner.oro:6:26 SyntaxError: expected ':' after loop declaration" }]);
      else if (normalizedFunction !== 'clean') append([{ voice: 'error', text: `${readable.name}: function '${functionNameInput}' not found.` }]);
      else if (!cleanerFixed) append([
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

    append([{ voice: 'patch', text: `OUROBOROS: compiling ${readable.name}...`, charMs: 4 }]);
    const execution = startOuroborosExecution({
      source: readable.source,
      functionName: functionName || undefined,
      globals: {
        clock: { cycle: 77_777 },
        census: { total: 8_388_608 },
      },
    });
    activeExecutionRef.current = execution;
    setRuntimeBusy(true);
    const outcome = await execution.promise;
    if (activeExecutionRef.current !== execution) return;
    activeExecutionRef.current = null;
    setRuntimeBusy(false);

    if (!outcome.ok) {
      const error = outcome.error;
      append([{ voice: 'error', text: `${readable.name}:${error.line}:${error.column} ${error.kind}: ${error.message}` }]);
      return;
    }
    if (!functionName) {
      append([{ voice: 'patch', text: `OUROBOROS: compile complete. ${outcome.result.functions.length > 0 ? `${outcome.result.functions.join(', ')} available.` : 'No functions found.'}` }]);
      return;
    }
    if (fileName === 'world_init.oro' && normalizedFunction === 'getpop') {
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
    if (fileName === 'world_init.oro' && normalizedFunction === 'gettime') {
      const cycle = typeof outcome.result.result === 'number'
        ? outcome.result.result.toLocaleString('en-US')
        : formatOuroborosValue(outcome.result.result);
      append([
        { voice: 'patch', text: 'world_init.getTime() ................................... [RUN]' },
        { voice: 'os', text: `cycle ${cycle} // 03:17:09` },
      ]);
      return;
    }
    append([
      ...outcome.result.output.map(text => ({ voice: 'os' as const, text })),
      ...(outcome.result.result === null
        ? [{ voice: 'patch' as const, text: `${readable.name}.${functionName}() ............................... [OK]` }]
        : [{ voice: 'os' as const, text: `=> ${formatOuroborosValue(outcome.result.result)}` }]),
    ]);
  };

  const handleRuntimeInterrupt = () => {
    const execution = activeExecutionRef.current;
    if (!execution) {
      append([{ voice: 'muted', text: '^C' }]);
      return;
    }
    activeExecutionRef.current = null;
    execution.cancel();
    setRuntimeBusy(false);
    append([
      { voice: 'muted', text: '^C' },
      { voice: 'error', text: 'OUROBOROS: execution interrupted.' },
    ]);
  };

  const runCommand = (raw: string, aliasDepth = 0, echo = true) => {
    const value = raw.trim();
    const normalized = value.toLowerCase();
    const parsed = parseCommandLine(value);
    if ('error' in parsed) {
      if (echo) append([{ voice: 'user', text: `${cwd}> ${value}` }]);
      append([{ voice: 'error', text: parsed.error }]);
      return;
    }
    const commandName = parsed.command;
    const argumentParts = parsed.args;
    const argument = argumentParts.join(' ');
    if (echo) append([{ voice: 'user', text: `${cwd}> ${value}` }]);
    if (activeExecutionRef.current) {
      append([{ voice: 'error', text: 'OUROBOROS: runtime busy. Press CTRL+C to interrupt.' }]);
      return;
    }

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

    if (parsed.redirect && commandName.toLowerCase() !== 'echo') {
      append([{ voice: 'error', text: 'Output redirection is currently supported by ECHO.' }]);
      return;
    }

    if (commandName.toLowerCase() === 'echo') {
      void echoText(argument, parsed.redirect);
      return;
    }

    if (commandName.toLowerCase() === 'history') {
      if (argument.toLowerCase() === '-c') {
        commandLogRef.current = [];
        inputRef.current?.clearHistory();
        append([{ voice: 'muted', text: 'Command history cleared.' }]);
      } else if (argument) append([{ voice: 'error', text: 'Usage: HISTORY [-c]' }]);
      else append(commandLogRef.current.map((command, index) => ({ voice: 'os', text: `${String(index + 1).padStart(3, ' ')}  ${command}` })));
      return;
    }

    if (normalized === 'exit') {
      setPendingConfirmation({ action: 'exit', step: 1 });
      append([{ voice: 'os', text: 'Disconnect from ANCIENT and return to the site? [Y/N]' }]);
      return;
    }

    if (normalized === 'reboot') {
      setPendingConfirmation({ action: 'reboot', step: 1 });
      append([{ voice: 'os', text: 'REBOOT will permanently erase all terminal progress. Continue? [Y/N]' }]);
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
    else if (normalized === 'tree') {
      append(formatTerminalTree(Object.keys(aliasesRef.current).length > 0, terminalFiles).map(text => ({ voice: 'os', text })));
    }
    else if (commandName.toLowerCase() === 'find') {
      if (!argument) append([{ voice: 'error', text: 'Usage: FIND <text>' }]);
      else {
        const matches = findTerminalEntries(argument, Object.keys(aliasesRef.current).length > 0, terminalFiles);
        append(matches.length > 0
          ? matches.map(entry => ({ voice: 'os' as const, text: entry.path }))
          : [{ voice: 'muted', text: `No indexed paths contain '${argument}'.` }]);
      }
    }
    else if (commandName.toLowerCase() === 'file') {
      if (!argument) append([{ voice: 'error', text: 'Usage: FILE <path>' }]);
      else {
        const entry = resolveTerminalEntry(cwd, argument, Object.keys(aliasesRef.current).length > 0, terminalFiles);
        const corrupted = entry && !filesRestored && (entry.name === 'census.idx' || entry.name === 'recovery.tot');
        append([entry
          ? { voice: 'os', text: `${entry.path}: ${entry.kind}${corrupted ? ', corrupt' : ''}` }
          : { voice: 'error', text: `${argument}: cannot identify path.` }]);
      }
    }
    else if (commandName.toLowerCase() === 'grep') {
      if (argumentParts.length < 2) append([{ voice: 'error', text: 'Usage: GREP <text> <file>' }]);
      else {
        const fileName = argumentParts[argumentParts.length - 1];
        const query = argumentParts.slice(0, -1).join(' ');
        const result = getReadableSource(fileName);
        if ('error' in result) append([{ voice: 'error', text: result.error }]);
        else {
          const matches = grepText(result.source, query);
          append(matches.length > 0
            ? matches.map(text => ({ voice: 'os' as const, text: `${result.name}:${text}` }))
            : [{ voice: 'muted', text: `${result.name}: no matching lines.` }]);
        }
      }
    }
    else if (commandName.toLowerCase() === 'man') {
      const manual = getManualEntry(argumentParts[0] ?? '');
      append([manual
        ? { voice: 'os', text: manual }
        : { voice: 'error', text: argument ? `No manual entry for '${argument}'.` : 'Usage: MAN <command>' }]);
    }
    else if (commandName.toLowerCase() === 'mkdir') {
      if (!argument) append([{ voice: 'error', text: 'Usage: MKDIR <path>' }]);
      else void createPlayerDirectory(argument);
    }
    else if (commandName.toLowerCase() === 'touch') {
      if (!argument) append([{ voice: 'error', text: 'Usage: TOUCH <file.oro|file.tot>' }]);
      else void createPlayerFile(argument);
    }
    else if (commandName.toLowerCase() === 'cp' || commandName.toLowerCase() === 'copy') {
      if (argumentParts.length !== 2) append([{ voice: 'error', text: `Usage: ${commandName.toUpperCase()} <source> <target>` }]);
      else void copyPlayerFile(argumentParts[0], argumentParts[1]);
    }
    else if (commandName.toLowerCase() === 'mv' || commandName.toLowerCase() === 'move') {
      if (argumentParts.length !== 2) append([{ voice: 'error', text: `Usage: ${commandName.toUpperCase()} <source> <target>` }]);
      else void movePlayerPath(argumentParts[0], argumentParts[1]);
    }
    else if (commandName.toLowerCase() === 'rm' || commandName.toLowerCase() === 'del') {
      if (!argument) append([{ voice: 'error', text: `Usage: ${commandName.toUpperCase()} <path>` }]);
      else void removePlayerEntry(argument);
    }
    else if (commandName.toLowerCase() === 'cd') {
      const nextDirectory = resolveTerminalDirectory(cwd, argument, terminalFiles);
      if (nextDirectory) setCwd(nextDirectory);
      else append([{ voice: 'error', text: 'Path not found.' }]);
    }
    else if (commandName.toLowerCase() === 'type' || commandName.toLowerCase() === 'cat') {
      if (!argument) append([{ voice: 'error', text: `Usage: ${commandName.toUpperCase()} <file>` }]);
      else readFile(argument);
    }
    else if (commandName.toLowerCase() === 'vim' || commandName.toLowerCase() === 'edit') openEditor(argument);
    else if (commandName.toLowerCase() === 'ouro') {
      void executeOuroborosFile(argumentParts[0] ?? '', argumentParts[1] ?? '');
    } else if (normalized === 'clear' || normalized === 'cls') {
      setHistory([]);
      outputAvailableAtRef.current = Date.now();
    }
    else append([{ voice: 'error', text: `'${value}' is not recognized. Type HELP.` }]);
  };

  const handleConfirmationResponse = (value: string) => {
    if (!pendingConfirmation) return;
    const response = value.toUpperCase();
    if (response !== 'Y' && response !== 'N') {
      append([{ voice: 'error', text: 'Enter one character: Y or N.' }]);
      return;
    }
    if (response === 'N') {
      append([{ voice: 'muted', text: `${pendingConfirmation.action.toUpperCase()} canceled.` }]);
      setPendingConfirmation(null);
      return;
    }
    if (pendingConfirmation.action === 'exit') {
      setPendingConfirmation(null);
      navigationAuthorizedRef.current = true;
      exitToHomeRef.current = true;
      window.history.back();
      return;
    }
    if (pendingConfirmation.step === 1) {
      setPendingConfirmation({ action: 'reboot', step: 2 });
      append([{ voice: 'os', text: 'FINAL CONFIRMATION: destroy saved progress and restore factory state? [Y/N]' }]);
      return;
    }
    setPendingConfirmation(null);
    void beginReboot();
  };

  const submitCommand = (input: string) => {
    const value = input.trim();
    if (!value) return;
    setFlushToken(token => token + 1);
    outputAvailableAtRef.current = Date.now();
    if (pendingConfirmation) {
      append([{ voice: 'user', text: `CONFIRM> ${value}` }]);
      handleConfirmationResponse(value);
    } else {
      commandLogRef.current = [...commandLogRef.current, value].slice(-200);
      runCommand(value);
    }
  };

  const clearTerminalHistory = () => {
    setHistory([]);
    outputAvailableAtRef.current = Date.now();
  };

  const handleVimKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setVimMode('normal'); return; }
    if (vimMode === 'normal' && event.key.toLowerCase() === 'i') { event.preventDefault(); setVimMode('insert'); return; }
    if (vimMode === 'normal' && event.key === ':') { event.preventDefault(); setVimMode('command'); window.setTimeout(() => vimCommandRef.current?.focus(), 0); }
  };

  const savePlayerEditor = async (action: 'w' | 'wq') => {
    if (!vimStoragePath) return;
    const currentFile = terminalFiles.find(file => file.path === vimStoragePath && file.kind === 'file');
    if (!currentFile) {
      append([{ voice: 'error', text: `${vimFile ?? 'file'}: no longer exists.` }]);
      return;
    }
    setSaveState('SAVING...');
    try {
      const savedFile = await writeAncientTerminalFile(vimStoragePath, vimDraft, currentFile.revision);
      upsertTerminalFile(savedFile);
      setSaveState('PROGRESS SAVED');
      append([{ voice: 'patch', text: `${vimFile} written. revision ${savedFile.revision}.` }]);
      if (action === 'wq') {
        setVimFile(null);
        setVimStoragePath(null);
      } else setVimMode('normal');
    } catch (error) {
      setSaveState('SAVE CONFLICT');
      try {
        setTerminalFiles(await loadAncientTerminalFiles());
      } catch {
        // Keep the last known mirror; the editor buffer still remains intact.
      }
      append([
        { voice: 'error', text: `${vimFile}: ${error instanceof Error ? error.message : 'write rejected'}` },
        { voice: 'muted', text: 'Your editor buffer remains open. Quit and reopen to load the saved revision.' },
      ]);
      setVimMode('normal');
    }
    setVimCommand('');
  };

  const finishVimCommand = (event: FormEvent) => {
    event.preventDefault();
    const action = vimCommand.trim().toLowerCase();
    if (!vimFile) return;
    if (action === 'q!') {
      if (vimStoragePath) setVimDraft('');
      else if (vimFile === 'world_init.oro') setWorldSource(scriptFixed ? FIXED_WORLD_SOURCE : BROKEN_WORLD_SOURCE);
      else if (vimFile === 'cleaner.oro') setCleanerSource(cleanerFixed ? FIXED_CLEANER_SOURCE : BROKEN_CLEANER_SOURCE);
      else setAliasSource(formatAliasFile(aliasesRef.current));
      setVimFile(null);
      setVimStoragePath(null);
    }
    else if (action === 'w' || action === 'wq') {
      if (vimStoragePath) {
        void savePlayerEditor(action);
        return;
      }
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
        if (action === 'wq') {
          setVimFile(null);
          setVimStoragePath(null);
        } else setVimMode('normal');
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
      if (action === 'wq') {
        setVimFile(null);
        setVimStoragePath(null);
      } else setVimMode('normal');
    } else setVimMode('normal');
    setVimCommand('');
  };

  if (rebootPhase) {
    return <main className={`ancient-terminal reboot-screen reboot-phase-${rebootPhase}`} aria-live="assertive">
      <div className="reboot-static-field" aria-hidden="true" />
      {rebootPhase === 'crash' && <div className="reboot-crash-copy">
        <TypingLine line={{ id: 'reboot-1', voice: 'os', text: 'REBOOT: closing world handles........................ [OK]', charMs: 7 }} />
        <TypingLine line={{ id: 'reboot-2', voice: 'os', text: 'REBOOT: restoring origin image................... [FAILED]', charMs: 7, delay: 480 }} />
        <TypingLine line={{ id: 'reboot-3', voice: 'error', text: 'FATAL: DISPLAY CONTROLLER LOST', charMs: 5, delay: 1050 }} />
      </div>}
    </main>;
  }

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
        {ready && !sequenceRunning && <XtermCommandLine
          ref={inputRef}
          prompt={pendingConfirmation ? 'CONFIRM' : cwd}
          complete={value => pendingConfirmation ? [] : getCompletionCandidates(value, cwd, Object.keys(aliases), terminalFiles)}
          onClear={clearTerminalHistory}
          onInterrupt={handleRuntimeInterrupt}
          onSubmit={submitCommand}
        />}
      </div>
      {vimOpen && <section className="vim-window" onClick={event => event.stopPropagation()}>
        <header>{vimFile} — {vimFile?.toLowerCase().endsWith('.tot') ? 'TEXT' : 'OUROBOROS'}/VIM</header>
        <textarea ref={vimRef} value={activeSource} onChange={event => {
          if (vimMode !== 'insert') return;
          if (vimStoragePath) setVimDraft(event.target.value);
          else if (vimFile === 'alias.tot') setAliasSource(event.target.value);
          else if (vimFile === 'cleaner.oro') setCleanerSource(event.target.value);
          else setWorldSource(event.target.value);
        }} onKeyDown={handleVimKey} readOnly={vimMode !== 'insert'} spellCheck={false} aria-label={`Ouroboros source editor: ${vimFile}`} />
        <footer><strong>{vimMode === 'insert' ? '-- INSERT --' : vimMode === 'command' ? ':' : '-- NORMAL --'}</strong><span>i: insert · Esc: normal · :wq save + quit</span></footer>
        {vimMode === 'command' && <form className="vim-command" onSubmit={finishVimCommand}><label>:</label><input ref={vimCommandRef} value={vimCommand} onChange={event => setVimCommand(event.target.value)} aria-label="Vim command" /></form>}
      </section>}
    </section>
    <footer className="terminal-statusbar"><span><b /> CHANNEL OPEN</span><span>{runtimeBusy ? 'OUROBOROS ACTIVE // CTRL+C INTERRUPTS' : `OUROBOROS 0.3 // HELP ${helpUpdated ? '0.2' : '0.1'}`}</span><span>{saveState}</span></footer>
  </main>;
}
