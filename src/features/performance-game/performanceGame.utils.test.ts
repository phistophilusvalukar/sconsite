import { describe, expect, it } from 'vitest';
import { melodyPresets } from './performanceMelodyPresets';
import { getExpectedNoteStartMs, getMelodyDurationMs, getNoteY, getVisibleTargetNotes, melodyToneIds, parseCustomMelodyNotation, scorePerformance, sequencesMatch } from './performanceGame.utils';
import { MelodyNote, ToneId } from './performanceGame.types';

const melody: ToneId[] = ['low', 'middle', 'high'];
const rhythmicMelody: MelodyNote[] = [
  { toneId: 'low', value: 'quarter', beats: 1 },
  { toneId: 'middle', value: 'half', beats: 2 },
  { toneId: 'high', value: 'eighth', beats: 0.5 },
];

describe('performance melody utilities', () => {
  it('scores only exact ordered sequences as matches', () => {
    expect(sequencesMatch(melody, ['low', 'middle', 'high'])).toBe(true);
    expect(sequencesMatch(melody, ['low', 'high', 'middle'])).toBe(false);
    expect(sequencesMatch(melody, ['low', 'middle'])).toBe(false);
  });

  it('places higher staff steps at higher visual positions', () => {
    expect(getNoteY(4)).toBeLessThan(getNoteY(0));
  });

  it('keeps guided targets visible throughout input', () => {
    expect(getVisibleTargetNotes('guided', 'input', rhythmicMelody, 0)).toEqual(melody);
  });

  it('reveals then hides memory targets', () => {
    expect(getVisibleTargetNotes('memory', 'playback', rhythmicMelody, 2)).toEqual(['low', 'middle']);
    expect(getVisibleTargetNotes('memory', 'input', rhythmicMelody, 3)).toEqual([]);
  });

  it('never visually reveals ear mode targets', () => {
    expect(getVisibleTargetNotes('ear', 'playback', rhythmicMelody, 3)).toEqual([]);
    expect(getVisibleTargetNotes('ear', 'input', rhythmicMelody, 3)).toEqual([]);
  });

  it('uses note values to calculate expected timing', () => {
    expect(melodyToneIds(rhythmicMelody)).toEqual(melody);
    expect(getExpectedNoteStartMs(rhythmicMelody, 2, 500)).toBe(1500);
    expect(getMelodyDurationMs(rhythmicMelody, 500)).toBe(1750);
  });

  it('passes timing when every note lands within tolerance', () => {
    expect(scorePerformance(rhythmicMelody, [
      { toneId: 'low', enteredAtMs: 30 },
      { toneId: 'middle', enteredAtMs: 520 },
      { toneId: 'high', enteredAtMs: 1510 },
    ], true, 500, 200)).toMatchObject({
      success: true,
      orderMatched: true,
      timingMatched: true,
    });
  });

  it('fails timing after the complete response when a note drifts too far', () => {
    expect(scorePerformance(rhythmicMelody, [
      { toneId: 'low', enteredAtMs: 0 },
      { toneId: 'middle', enteredAtMs: 720 },
      { toneId: 'high', enteredAtMs: 1500 },
    ], true, 500, 200)).toMatchObject({
      success: false,
      orderMatched: true,
      timingMatched: false,
    });
  });

  it('provides preset melodies with valid rhythmic notes', () => {
    expect(melodyPresets.length).toBeGreaterThan(4);
    melodyPresets.forEach(preset => {
      expect(preset.sequence.length).toBeGreaterThanOrEqual(6);
      expect(preset.sequence.every(note => note.beats > 0)).toBe(true);
      expect(getMelodyDurationMs(preset.sequence, 500)).toBeGreaterThan(0);
    });
  });

  it('parses private melody notation into rhythmic notes', () => {
    expect(parseCustomMelodyNotation('A:q S:e D:h')).toEqual([
      { toneId: 'low', value: 'quarter', beats: 1 },
      { toneId: 'midLow', value: 'eighth', beats: 0.5 },
      { toneId: 'middle', value: 'half', beats: 2 },
    ]);
  });

  it('rejects invalid private melody notation', () => {
    expect(() => parseCustomMelodyNotation('A:q Z:h')).toThrow('Invalid note token');
  });
});
