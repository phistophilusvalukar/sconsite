import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

export type XtermCommandLineHandle = {
  clearHistory: () => void;
  focus: () => void;
};

type XtermCommandLineProps = {
  prompt: string;
  complete: (input: string) => string[];
  onClear: () => void;
  onInterrupt: () => void;
  onSubmit: (input: string) => void;
};

type CompletionCycle = {
  candidates: string[];
  index: number;
};

export const XtermCommandLine = forwardRef<XtermCommandLineHandle, XtermCommandLineProps>(function XtermCommandLine({
  prompt,
  complete,
  onClear,
  onInterrupt,
  onSubmit,
}, forwardedRef) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const promptRef = useRef(prompt);
  const completeRef = useRef(complete);
  const clearRef = useRef(onClear);
  const interruptRef = useRef(onInterrupt);
  const submitRef = useRef(onSubmit);
  const bufferRef = useRef<string[]>([]);
  const cursorRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const historyDraftRef = useRef<string[]>([]);
  const completionRef = useRef<CompletionCycle | null>(null);

  const redraw = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const buffer = bufferRef.current.join('');
    terminal.write(`\r\x1b[2K${promptRef.current}>${buffer}`);
    const moveLeft = bufferRef.current.length - cursorRef.current;
    if (moveLeft > 0) terminal.write(`\x1b[${moveLeft}D`);
  }, []);

  const replaceBuffer = useCallback((value: string) => {
    bufferRef.current = Array.from(value);
    cursorRef.current = bufferRef.current.length;
    completionRef.current = null;
    redraw();
  }, [redraw]);

  useImperativeHandle(forwardedRef, () => ({
    clearHistory: () => {
      historyRef.current = [];
      historyIndexRef.current = null;
      historyDraftRef.current = [];
    },
    focus: () => terminalRef.current?.focus(),
  }), []);

  useEffect(() => {
    promptRef.current = prompt;
    redraw();
  }, [prompt, redraw]);

  useEffect(() => {
    completeRef.current = complete;
    clearRef.current = onClear;
    interruptRef.current = onInterrupt;
    submitRef.current = onSubmit;
  }, [complete, onClear, onInterrupt, onSubmit]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'block',
      disableStdin: false,
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: 14,
      letterSpacing: 0.35,
      lineHeight: 1.2,
      rows: 1,
      scrollback: 0,
      theme: {
        background: '#010304',
        cursor: '#e8edf1',
        cursorAccent: '#010304',
        foreground: '#e8edf1',
        selectionBackground: '#e8edf1',
        selectionForeground: '#010304',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;
    fitAddon.fit();
    redraw();
    terminal.focus();

    const moveHistory = (direction: -1 | 1) => {
      if (historyRef.current.length === 0) return;
      if (direction === -1) {
        if (historyIndexRef.current === null) {
          historyDraftRef.current = [...bufferRef.current];
          historyIndexRef.current = historyRef.current.length - 1;
        } else {
          historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
        }
        replaceBuffer(historyRef.current[historyIndexRef.current]);
        return;
      }
      if (historyIndexRef.current === null) return;
      if (historyIndexRef.current >= historyRef.current.length - 1) {
        historyIndexRef.current = null;
        bufferRef.current = [...historyDraftRef.current];
        cursorRef.current = bufferRef.current.length;
        redraw();
      } else {
        historyIndexRef.current += 1;
        replaceBuffer(historyRef.current[historyIndexRef.current]);
      }
    };

    const disposable = terminal.onData(data => {
      if (data === '\r') {
        const value = bufferRef.current.join('').trim();
        if (!value) return;
        if (historyRef.current[historyRef.current.length - 1] !== value) {
          historyRef.current.push(value);
          if (historyRef.current.length > 200) historyRef.current.shift();
        }
        historyIndexRef.current = null;
        historyDraftRef.current = [];
        completionRef.current = null;
        bufferRef.current = [];
        cursorRef.current = 0;
        submitRef.current(value);
        redraw();
        return;
      }
      if (data === '\u0003') {
        if (terminal.hasSelection()) return;
        terminal.write('^C');
        bufferRef.current = [];
        cursorRef.current = 0;
        completionRef.current = null;
        interruptRef.current();
        redraw();
        return;
      }
      if (data === '\u000c') {
        clearRef.current();
        redraw();
        return;
      }
      if (data === '\u0001' || data === '\x1b[H' || data === '\x1b[1~') {
        cursorRef.current = 0;
        redraw();
        return;
      }
      if (data === '\u0005' || data === '\x1b[F' || data === '\x1b[4~') {
        cursorRef.current = bufferRef.current.length;
        redraw();
        return;
      }
      if (data === '\x1b[A') { moveHistory(-1); return; }
      if (data === '\x1b[B') { moveHistory(1); return; }
      if (data === '\x1b[D') {
        cursorRef.current = Math.max(0, cursorRef.current - 1);
        redraw();
        return;
      }
      if (data === '\x1b[C') {
        cursorRef.current = Math.min(bufferRef.current.length, cursorRef.current + 1);
        redraw();
        return;
      }
      if (data === '\u007f') {
        if (cursorRef.current > 0) {
          bufferRef.current.splice(cursorRef.current - 1, 1);
          cursorRef.current -= 1;
          completionRef.current = null;
          redraw();
        }
        return;
      }
      if (data === '\x1b[3~') {
        if (cursorRef.current < bufferRef.current.length) {
          bufferRef.current.splice(cursorRef.current, 1);
          completionRef.current = null;
          redraw();
        }
        return;
      }
      if (data === '\t') {
        const current = bufferRef.current.join('');
        const active = completionRef.current;
        if (active && active.candidates[active.index] === current) {
          active.index = (active.index + 1) % active.candidates.length;
          replaceBuffer(active.candidates[active.index]);
          completionRef.current = active;
          return;
        }
        const candidates = completeRef.current(current);
        if (candidates.length > 0) {
          completionRef.current = { candidates, index: 0 };
          replaceBuffer(candidates[0]);
          completionRef.current = { candidates, index: 0 };
        }
        return;
      }

      const printable = Array.from(data.replace(/[\r\n]/g, ' ')).filter(character => character >= ' ' && character !== '\u007f');
      if (printable.length === 0) return;
      bufferRef.current.splice(cursorRef.current, 0, ...printable);
      cursorRef.current += printable.length;
      historyIndexRef.current = null;
      completionRef.current = null;
      redraw();
    });

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(host);
    return () => {
      resizeObserver.disconnect();
      disposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [redraw, replaceBuffer]);

  return <div className="xterm-command-host" ref={hostRef} aria-label={`${prompt} terminal command input`} />;
});
