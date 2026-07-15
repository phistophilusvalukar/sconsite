import { DisplayMode, GamePhase, MelodyNote, NoteValue, PerformanceScore, TimedNoteInput, ToneId, TONES } from './performanceGame.types';

const bottomLineY = 98;
const halfStaffStep = 6;

export const toneIds = TONES.map(tone => tone.id);

export const toneById = Object.fromEntries(TONES.map(tone => [tone.id, tone])) as Record<ToneId, (typeof TONES)[number]>;

export const keyToToneId = Object.fromEntries(TONES.map(tone => [tone.key, tone.id])) as Record<string, ToneId>;

export const sequencesMatch = (target: readonly ToneId[], player: readonly ToneId[]) =>
  target.length === player.length && target.every((toneId, index) => toneId === player[index]);

export const noteValueBeats: Record<NoteValue, number> = {
  eighth: 0.5,
  quarter: 1,
  half: 2,
};

const shorthandNoteValues: Record<string, NoteValue> = {
  e: 'eighth',
  eighth: 'eighth',
  8: 'eighth',
  q: 'quarter',
  quarter: 'quarter',
  4: 'quarter',
  h: 'half',
  half: 'half',
  2: 'half',
};

const notationKeys = Object.fromEntries(TONES.map(tone => [tone.label.toLowerCase(), tone.id])) as Record<string, ToneId>;

export const melodyToneIds = (melody: readonly MelodyNote[]) => melody.map(note => note.toneId);

export const getExpectedNoteStartMs = (melody: readonly MelodyNote[], index: number, beatMs: number) =>
  melody.slice(0, index).reduce((sum, note) => sum + note.beats * beatMs, 0);

export const getMelodyDurationMs = (melody: readonly MelodyNote[], beatMs: number) =>
  melody.reduce((sum, note) => sum + note.beats * beatMs, 0);

export const scorePerformance = (
  target: readonly MelodyNote[],
  timedInputs: readonly TimedNoteInput[],
  timingRequired: boolean,
  beatMs: number,
  toleranceMs: number
): PerformanceScore => {
  const player = timedInputs.map(input => input.toneId);
  const orderMatched = sequencesMatch(melodyToneIds(target), player);
  const maxTimingErrorMs = timedInputs.reduce((maxError, input, index) => {
    const expectedMs = getExpectedNoteStartMs(target, index, beatMs);
    return Math.max(maxError, Math.abs(input.enteredAtMs - expectedMs));
  }, 0);
  const timingMatched = !timingRequired || (
    timedInputs.length === target.length &&
    maxTimingErrorMs <= toleranceMs
  );

  return {
    success: orderMatched && timingMatched,
    orderMatched,
    timingMatched,
    maxTimingErrorMs,
  };
};

export const generateMelody = (length: number, availableToneIds: readonly ToneId[] = toneIds) => {
  const safeLength = Math.max(1, Math.floor(length));
  return Array.from({ length: safeLength }, () => {
    const index = Math.floor(Math.random() * availableToneIds.length);
    const values: NoteValue[] = ['eighth', 'quarter', 'half'];
    const value = values[Math.floor(Math.random() * values.length)];
    return {
      toneId: availableToneIds[index],
      value,
      beats: noteValueBeats[value],
    };
  });
};

export const parseCustomMelodyNotation = (notation: string): MelodyNote[] => {
  const tokens = notation
    .split(/[\s,]+/)
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Add at least one note.');
  }

  return tokens.map(token => {
    const match = /^([asdfg])(?::?([a-z0-9]+))?$/i.exec(token);
    if (!match) {
      throw new Error(`Invalid note token: ${token}`);
    }

    const toneId = notationKeys[match[1].toLowerCase()];
    const value = shorthandNoteValues[(match[2] || 'q').toLowerCase()];
    if (!toneId || !value) {
      throw new Error(`Invalid note token: ${token}`);
    }

    return {
      toneId,
      value,
      beats: noteValueBeats[value],
    };
  });
};

export const getNoteX = (index: number, sequenceLength: number, width: number) => {
  if (sequenceLength <= 1) return width / 2;
  const padding = Math.max(32, width * 0.08);
  const usableWidth = Math.max(1, width - padding * 2);
  return padding + (usableWidth / (sequenceLength - 1)) * index;
};

export const getNoteY = (staffStep: number) => bottomLineY - staffStep * halfStaffStep;

export const getVisibleTargetNotes = (
  mode: DisplayMode,
  phase: GamePhase,
  sequence: readonly MelodyNote[],
  revealedCount: number
) => {
  if (mode === 'ear') return [];
  if (mode === 'guided') return melodyToneIds(sequence);
  if (phase === 'playback' || phase === 'preparing') return melodyToneIds(sequence.slice(0, revealedCount));
  return [];
};

export const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
};
