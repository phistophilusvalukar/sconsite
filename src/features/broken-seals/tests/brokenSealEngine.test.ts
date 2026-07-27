import { describe, expect, it } from 'vitest';
import {
  createSealWords,
  evaluateSealAttempt,
  moveSealWord
} from '../engine/brokenSealEngine';
import { getBrokenSealPuzzle } from '../data/brokenSealPuzzles';

describe('broken seal engine', () => {
  it('evaluates solved incantations by word position', () => {
    const puzzle = getBrokenSealPuzzle('threshold-ward');
    const words = createSealWords(['Withhold', 'the', 'passage', 'of', 'evil', 'entities'], 'test');
    const attempt = evaluateSealAttempt(puzzle, words, 'attempt-1');

    expect(attempt.solved).toBe(true);
    expect(attempt.correctSlots).toEqual([true, true, true, true, true, true]);
  });

  it('marks only correctly placed words', () => {
    const puzzle = getBrokenSealPuzzle('threshold-ward');
    const words = createSealWords(['evil', 'entities', 'passage', 'of', 'Withhold', 'the'], 'test');
    const attempt = evaluateSealAttempt(puzzle, words, 'attempt-1');

    expect(attempt.solved).toBe(false);
    expect(attempt.correctSlots).toEqual([false, false, true, true, false, false]);
  });

  it('reorders seal words', () => {
    const puzzle = getBrokenSealPuzzle('threshold-ward');
    const words = createSealWords(puzzle.brokenWords, 'test');
    const movedWords = moveSealWord(words, 0, words.length - 1);

    expect(movedWords.map(word => word.text)).toEqual(['entities', 'withhold', 'the', 'passage', 'of', 'Evil']);
  });
});
