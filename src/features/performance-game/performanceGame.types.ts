export const TONES = [
  { id: 'low', key: 'a', label: 'A', pitch: 'E4', staffStep: 0 },
  { id: 'midLow', key: 's', label: 'S', pitch: 'F4', staffStep: 1 },
  { id: 'middle', key: 'd', label: 'D', pitch: 'G4', staffStep: 2 },
  { id: 'midHigh', key: 'f', label: 'F', pitch: 'A4', staffStep: 3 },
  { id: 'high', key: 'g', label: 'G', pitch: 'B4', staffStep: 4 },
] as const;

export type ToneId = (typeof TONES)[number]['id'];
export type DisplayMode = 'guided' | 'memory' | 'ear';
export type GamePhase = 'idle' | 'preparing' | 'playback' | 'countin' | 'input' | 'success' | 'failure';
export type EnsembleInstrument = 'flute' | 'clarinet' | 'marimba' | 'acousticGuitar';
export type NoteValue = 'eighth' | 'quarter' | 'half';

export interface MelodyNote {
  toneId: ToneId;
  value: NoteValue;
  beats: number;
}

export interface TimedNoteInput {
  toneId: ToneId;
  enteredAtMs: number;
}

export interface PerformanceScore {
  success: boolean;
  orderMatched: boolean;
  timingMatched: boolean;
  maxTimingErrorMs: number;
}

export interface EnsemblePart {
  id: string;
  name: string;
  instrument: EnsembleInstrument;
  sequence: MelodyNote[];
  timedInputs: TimedNoteInput[];
  success: boolean;
}

export interface PerformanceChallengeConfig {
  id?: string;
  title: string;
  displayMode: DisplayMode;
  sequence: MelodyNote[];
  allowedReplays: number;
  allowedAttempts: number;
  noteDurationMs?: number;
  noteGapMs?: number;
  timingRequired?: boolean;
  beatMs?: number;
  timingToleranceMs?: number;
  ensembleEnabled?: boolean;
}
