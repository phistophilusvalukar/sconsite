import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Music, Play, RotateCcw, SlidersHorizontal, Users, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { MusicStaff } from './MusicStaff';
import PerformanceChallengeService from './performanceChallengeService';
import { ToneControls } from './ToneControls';
import { useMelodyAudio } from './useMelodyAudio';
import { defaultMelodyPreset, melodyPresets } from './performanceMelodyPresets';
import {
  DisplayMode,
  EnsembleInstrument,
  EnsemblePart,
  GamePhase,
  PerformanceChallengeConfig,
  PerformanceScore,
  TimedNoteInput,
  ToneId,
} from './performanceGame.types';
import {
  generateMelody,
  getVisibleTargetNotes,
  isTypingTarget,
  keyToToneId,
  parseCustomMelodyNotation,
  scorePerformance,
  toneIds,
} from './performanceGame.utils';
import './performanceGame.css';

const TIMING_TOLERANCE_MS = 200;

const defaultConfig: PerformanceChallengeConfig = {
  title: 'Performance: Melody Challenge',
  displayMode: 'guided',
  sequence: defaultMelodyPreset.sequence,
  allowedReplays: 1,
  allowedAttempts: 3,
  timingRequired: false,
  beatMs: 550,
  timingToleranceMs: TIMING_TOLERANCE_MS,
  ensembleEnabled: false,
};

const ensembleInstruments: EnsembleInstrument[] = ['flute', 'clarinet', 'marimba', 'acousticGuitar'];

const instrumentLabels: Record<EnsembleInstrument, string> = {
  flute: 'Flute',
  clarinet: 'Clarinet',
  marimba: 'Marimba',
  acousticGuitar: 'Acoustic Guitar',
};

const instructions: Record<GamePhase, string> = {
  idle: 'Press Start to hear the melody.',
  preparing: 'Preparing the instrument.',
  playback: 'Listen.',
  countin: 'Count in.',
  input: 'Your turn.',
  success: 'Melody matched.',
  failure: 'The performance was incorrect.',
};

const modeLabels: Record<DisplayMode, string> = {
  guided: 'Guided',
  memory: 'Memory',
  ear: 'Ear',
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatTimingError = (score?: PerformanceScore) => {
  if (!score) return 'No timing score yet';
  if (score.maxTimingErrorMs === 0) return 'On the beat';
  return `${Math.round(score.maxTimingErrorMs)}ms max drift`;
};

export const PerformanceMelodyGame: React.FC<{ initialConfig?: PerformanceChallengeConfig }> = ({ initialConfig }) => {
  const { user } = useAuth();
  const service = useMemo(() => PerformanceChallengeService.getInstance(), []);
  const [config, setConfig] = useState<PerformanceChallengeConfig>(() => initialConfig || defaultConfig);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [selectedPresetId, setSelectedPresetId] = useState(defaultMelodyPreset.id);
  const [customMelodyText, setCustomMelodyText] = useState('A:q S:q D:h F:e G:e');
  const [customMelodyError, setCustomMelodyError] = useState<string | null>(null);
  const [playerSequence, setPlayerSequence] = useState<ToneId[]>([]);
  const [, setTimedInputs] = useState<TimedNoteInput[]>([]);
  const [revealedCount, setRevealedCount] = useState(config.displayMode === 'guided' ? config.sequence.length : 0);
  const [activeIndex, setActiveIndex] = useState<number | undefined>();
  const [activeToneId, setActiveToneId] = useState<ToneId | undefined>();
  const [replayCount, setReplayCount] = useState(0);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [muted, setMuted] = useState(false);
  const [metronomePulse, setMetronomePulse] = useState(false);
  const [countInBeat, setCountInBeat] = useState<number | undefined>();
  const [lastScore, setLastScore] = useState<PerformanceScore | undefined>();
  const [activePartId, setActivePartId] = useState('part-1');
  const [ensembleParts, setEnsembleParts] = useState<EnsemblePart[]>([]);
  const [isPlayingEnsemble, setIsPlayingEnsemble] = useState(false);
  const inputStartedAtRef = useRef<number>(0);
  const metronomeTimerRef = useRef<number>();
  const beatMs = config.beatMs ?? 550;
  const bpm = Math.round(60000 / beatMs);
  const timingToleranceMs = TIMING_TOLERANCE_MS;
  const timingRequired = Boolean(config.timingRequired);
  const ensembleEnabled = Boolean(config.ensembleEnabled);
  const audio = useMelodyAudio({ muted, beatMs });
  const canInput = phase === 'input';
  const canReplay = (phase === 'input' || phase === 'failure') && replayCount < config.allowedReplays;
  const canRetry = phase === 'failure' && attemptNumber < config.allowedAttempts;
  const visibleTargetNotes = getVisibleTargetNotes(config.displayMode, phase, config.sequence, revealedCount);
  const showTargetStaff = config.displayMode !== 'ear';
  const activePart = ensembleParts.find(part => part.id === activePartId);
  const recordedParts = ensembleParts.filter(part => part.timedInputs.length === config.sequence.length);

  const stopMetronome = useCallback(() => {
    if (metronomeTimerRef.current) {
      window.clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = undefined;
    }
    setMetronomePulse(false);
  }, []);

  const tickMetronome = useCallback(() => {
    setMetronomePulse(true);
    audio.playMetronome();
    window.setTimeout(() => setMetronomePulse(false), 110);
  }, [audio]);

  const startMetronome = useCallback(() => {
    if (!timingRequired) return;
    stopMetronome();
    tickMetronome();
    metronomeTimerRef.current = window.setInterval(tickMetronome, beatMs);
  }, [beatMs, stopMetronome, tickMetronome, timingRequired]);

  const resetAttemptState = useCallback((nextSequence = config.sequence) => {
    setPlayerSequence([]);
    setTimedInputs([]);
    setLastScore(undefined);
    setActiveIndex(undefined);
    setActiveToneId(undefined);
    setCountInBeat(undefined);
    setRevealedCount(config.displayMode === 'guided' ? nextSequence.length : 0);
    stopMetronome();
  }, [config.displayMode, config.sequence, stopMetronome]);

  const playChallenge = useCallback(async (isReplay = false) => {
    setPhase('preparing');
    resetAttemptState();
    await audio.initializeAudio();
    if (isReplay) {
      setReplayCount(count => count + 1);
    }
    setPhase('playback');
    await audio.playSequence(config.sequence, index => {
      const toneId = config.sequence[index].toneId;
      setActiveIndex(index);
      setActiveToneId(config.displayMode === 'ear' ? undefined : toneId);
      if (config.displayMode === 'memory') {
        setRevealedCount(index + 1);
      }
    });
    stopMetronome();
    setActiveIndex(undefined);
    setActiveToneId(undefined);

    const beginInput = async () => {
      setPhase('countin');
      setRevealedCount(0);
      await audio.playCountIn(4, beatMs, beat => {
        setCountInBeat(beat);
        setMetronomePulse(true);
        window.setTimeout(() => setMetronomePulse(false), 110);
      });
      setCountInBeat(undefined);
      inputStartedAtRef.current = performance.now();
      setPhase('input');
      startMetronome();
    };

    if (config.displayMode === 'memory') {
      window.setTimeout(() => {
        void beginInput();
      }, 400);
      return;
    }
    void beginInput();
  }, [audio, beatMs, config.displayMode, config.sequence, resetAttemptState, startMetronome, stopMetronome]);

  const saveEnsemblePart = useCallback((inputs: TimedNoteInput[], score: PerformanceScore) => {
    if (!ensembleEnabled) return;
    const partIndex = Number(activePartId.replace('part-', '')) || 1;
    const instrument = ensembleInstruments[(partIndex - 1) % ensembleInstruments.length];
    setEnsembleParts(current => {
      const nextPart: EnsemblePart = {
        id: activePartId,
        name: `Performer ${partIndex}`,
        instrument,
        sequence: config.sequence,
        timedInputs: inputs,
        success: score.success,
      };
      const withoutCurrent = current.filter(part => part.id !== activePartId);
      return [...withoutCurrent, nextPart].sort((a, b) => a.id.localeCompare(b.id));
    });
  }, [activePartId, config.sequence, ensembleEnabled]);

  const submitAttempt = useCallback((inputs: TimedNoteInput[]) => {
    stopMetronome();
    const sequence = inputs.map(input => input.toneId);
    const score = scorePerformance(config.sequence, inputs, timingRequired, beatMs, timingToleranceMs);
    setLastScore(score);
    setPhase(score.success ? 'success' : 'failure');
    saveEnsemblePart(inputs, score);
    void service.saveAttempt({
      challengeId: config.id,
      userId: user?.id,
      submittedSequence: sequence,
      displayMode: config.displayMode,
      success: score.success,
      replayCount,
      attemptNumber,
    });
  }, [attemptNumber, beatMs, config.displayMode, config.id, config.sequence, replayCount, saveEnsemblePart, service, stopMetronome, timingRequired, timingToleranceMs, user?.id]);

  const handleTone = useCallback((toneId: ToneId) => {
    if (!canInput) return;
    const enteredAtMs = Math.max(0, performance.now() - inputStartedAtRef.current);
    audio.playNote(toneId);
    setActiveToneId(toneId);
    window.setTimeout(() => setActiveToneId(current => current === toneId ? undefined : current), 180);
    setTimedInputs(current => {
      const next = [...current, { toneId, enteredAtMs }];
      setPlayerSequence(next.map(input => input.toneId));
      if (next.length === config.sequence.length) {
        window.setTimeout(() => submitAttempt(next), 0);
      }
      return next;
    });
  }, [audio, canInput, config.sequence.length, submitAttempt]);

  const retry = () => {
    if (!canRetry) return;
    setAttemptNumber(count => count + 1);
    setPhase('idle');
    setReplayCount(0);
    resetAttemptState();
  };

  const updateSequenceLength = (length: number) => {
    const nextLength = clamp(length, 3, 16);
    const nextSequence = generateMelody(nextLength, toneIds);
    setSelectedPresetId('custom');
    setConfig(current => ({ ...current, sequence: nextSequence }));
    setAttemptNumber(1);
    setReplayCount(0);
    setPhase('idle');
    resetAttemptState(nextSequence);
  };

  const newMelody = () => {
    updateSequenceLength(config.sequence.length);
  };

  const selectMelodyPreset = (presetId: string) => {
    const preset = melodyPresets.find(item => item.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setConfig(current => ({ ...current, sequence: preset.sequence }));
    setAttemptNumber(1);
    setReplayCount(0);
    setPhase('idle');
    resetAttemptState(preset.sequence);
  };

  const applyCustomMelody = () => {
    try {
      const nextSequence = parseCustomMelodyNotation(customMelodyText);
      setSelectedPresetId('custom');
      setCustomMelodyError(null);
      setConfig(current => ({ ...current, sequence: nextSequence }));
      setAttemptNumber(1);
      setReplayCount(0);
      setPhase('idle');
      resetAttemptState(nextSequence);
    } catch (error) {
      setCustomMelodyError(error instanceof Error ? error.message : 'Invalid melody.');
    }
  };

  const setDisplayMode = (displayMode: DisplayMode) => {
    setConfig(current => ({ ...current, displayMode }));
    setPhase('idle');
    resetAttemptState();
  };

  const playEnsemble = async () => {
    if (recordedParts.length === 0) return;
    setIsPlayingEnsemble(true);
    await audio.initializeAudio();
    await audio.playEnsemble(recordedParts.map(part => ({
      instrument: part.instrument,
      timedInputs: part.timedInputs,
    })));
    setIsPlayingEnsemble(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const toneId = keyToToneId[event.key.toLowerCase()];
      if (toneId) {
        event.preventDefault();
        handleTone(toneId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTone]);

  useEffect(() => () => stopMetronome(), [stopMetronome]);

  return (
    <div className="min-h-screen px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-yellow-300">GM Skill Checks</p>
            <h1 className="mt-3 font-fantasy text-4xl font-bold sm:text-5xl">{config.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/skill-checks" className="inline-flex items-center gap-2 rounded-lg bg-fantasy-800 px-4 py-2 text-sm font-bold text-gray-100 hover:bg-fantasy-700">
              <RotateCcw className="h-4 w-4" />
              <span>Thievery</span>
            </Link>
          </div>
        </div>

        <section className="performance-game">
          <div className="performance-topbar">
            <div>
              <p className="performance-mode">{modeLabels[config.displayMode]} Mode</p>
              <p className="performance-instruction">{instructions[phase]}</p>
            </div>
            <div className="performance-status-cluster">
              {timingRequired && (
                <div className={`metronome-indicator${metronomePulse ? ' metronome-indicator-active' : ''}`} aria-label="Metronome pulse">
                  <span />
                </div>
              )}
              <button type="button" className="performance-icon-button" onClick={() => setMuted(current => !current)} aria-label={muted ? 'Unmute melody audio' : 'Mute melody audio'}>
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="performance-options" aria-label="Performance challenge options">
            <label>
              <span>Melody</span>
              <select value={selectedPresetId} onChange={event => selectMelodyPreset(event.target.value)} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'}>
                <option value="custom" disabled>Custom Practice Melody</option>
                <optgroup label="Classic game style">
                  {melodyPresets.filter(preset => preset.era === 'classic').map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.title}</option>
                  ))}
                </optgroup>
                <optgroup label="Modern game style">
                  {melodyPresets.filter(preset => preset.era === 'modern').map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.title}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              <span><SlidersHorizontal className="h-4 w-4" /> Melody Length</span>
              <input type="range" min={3} max={16} value={config.sequence.length} onChange={event => updateSequenceLength(Number(event.target.value))} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'} />
              <strong>{config.sequence.length} notes</strong>
            </label>
            <label>
              <span>Display</span>
              <select value={config.displayMode} onChange={event => setDisplayMode(event.target.value as DisplayMode)} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'}>
                <option value="guided">Guided</option>
                <option value="memory">Memory</option>
                <option value="ear">Ear</option>
              </select>
            </label>
            <label className="performance-check-option">
              <input type="checkbox" checked={timingRequired} onChange={event => setConfig(current => ({ ...current, timingRequired: event.target.checked }))} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'} />
              <span>Score Timing</span>
            </label>
            <label>
              <span>BPM</span>
              <input type="number" min={50} max={200} step={1} value={bpm} onChange={event => {
                const nextBpm = clamp(Number(event.target.value), 50, 200);
                setConfig(current => ({ ...current, beatMs: Math.round(60000 / nextBpm) }));
              }} disabled={!timingRequired || phase === 'preparing' || phase === 'playback' || phase === 'countin'} />
              <strong>{beatMs}ms beat</strong>
            </label>
            <label className="performance-check-option">
              <input type="checkbox" checked={ensembleEnabled} onChange={event => setConfig(current => ({ ...current, ensembleEnabled: event.target.checked }))} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'} />
              <span>Ensemble Mode</span>
            </label>
          </div>

          <div className="custom-melody-panel">
            <label>
              <span>Private Melody</span>
              <textarea
                value={customMelodyText}
                onChange={event => setCustomMelodyText(event.target.value)}
                disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'}
                rows={2}
                spellCheck={false}
              />
            </label>
            <button type="button" onClick={applyCustomMelody} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'}>Apply Melody</button>
            {customMelodyError && <p role="alert">{customMelodyError}</p>}
          </div>

          {ensembleEnabled && (
            <div className="ensemble-panel">
              <div className="ensemble-controls">
                <label>
                  <span><Users className="h-4 w-4" /> Recording Part</span>
                  <select value={activePartId} onChange={event => {
                    setActivePartId(event.target.value);
                    setPhase('idle');
                    resetAttemptState();
                  }}>
                    {[1, 2, 3, 4].map(index => (
                      <option key={index} value={`part-${index}`}>Performer {index} ({instrumentLabels[ensembleInstruments[index - 1]]})</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => void playEnsemble()} disabled={recordedParts.length === 0 || isPlayingEnsemble}>
                  <Play className="h-4 w-4" />
                  <span>{isPlayingEnsemble ? 'Playing Ensemble' : 'Play Ensemble'}</span>
                </button>
              </div>
              <div className="ensemble-list">
                {[1, 2, 3, 4].map(index => {
                  const part = ensembleParts.find(item => item.id === `part-${index}`);
                  return (
                    <span key={index} className={part?.success ? 'ensemble-part-success' : part ? 'ensemble-part-failure' : ''}>
                      Performer {index}: {part ? `${part.sequence.length} notes, ${instrumentLabels[part.instrument]}, ${part.success ? 'matched' : 'needs work'}` : 'not recorded'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="performance-stage">
            {showTargetStaff && (
              <MusicStaff
                label="Original Melody"
                notes={visibleTargetNotes}
                activeIndex={config.displayMode === 'ear' ? undefined : activeIndex}
                hidden={config.displayMode === 'memory' && phase === 'input'}
              />
            )}
            <MusicStaff label={ensembleEnabled && activePart ? `${activePart.name} Performance` : 'Your Performance'} notes={playerSequence} />
          </div>

          {phase === 'countin' && (
            <div className="count-in-display" aria-live="polite">
              {[1, 2, 3, 4].map(beat => (
                <span key={beat} className={countInBeat === beat ? 'count-in-active' : ''}>{beat}</span>
              ))}
            </div>
          )}

          <ToneControls disabled={!canInput} activeToneId={activeToneId} onTone={handleTone} />

          <div className="performance-footer">
            <div className="performance-progress" aria-live="polite">
              <Music className="h-4 w-4" />
              <span>{playerSequence.length} / {config.sequence.length}</span>
              <span>Attempt {attemptNumber} / {config.allowedAttempts}</span>
              <span>Replays {replayCount} / {config.allowedReplays}</span>
              {timingRequired && <span>{formatTimingError(lastScore)} / {TIMING_TOLERANCE_MS}ms tolerance</span>}
            </div>
            <div className="performance-actions">
              <button type="button" onClick={() => void playChallenge(false)} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'}>Start Challenge</button>
              <button type="button" onClick={() => void playChallenge(true)} disabled={!canReplay}>Replay</button>
              <button type="button" onClick={retry} disabled={!canRetry}>Retry</button>
              <button type="button" onClick={newMelody} disabled={phase === 'preparing' || phase === 'playback' || phase === 'countin'}>New Melody</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PerformanceMelodyGame;
