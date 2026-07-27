export type SealWord = {
  id: string;
  text: string;
};

export type SealAttempt = {
  id: string;
  words: string[];
  correctSlots: boolean[];
  solved: boolean;
};

export type BrokenSealPuzzle = {
  id: string;
  name: string;
  threat: string;
  targetPhrase: string;
  brokenWords: string[];
  maxAttempts: number;
};

export function phraseWords(phrase: string) {
  return phrase.trim().split(/\s+/).filter(Boolean);
}

export function normalizeSealWord(word: string) {
  return word.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

export function createSealWords(words: string[], puzzleId: string): SealWord[] {
  return words.map((text, index) => ({
    id: `${puzzleId}-${index}-${normalizeSealWord(text) || 'word'}`,
    text
  }));
}

export function moveSealWord(words: SealWord[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= words.length || toIndex >= words.length) {
    return words;
  }
  const next = [...words];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function evaluateSealAttempt(puzzle: BrokenSealPuzzle, words: SealWord[], id: string): SealAttempt {
  const targetWords = phraseWords(puzzle.targetPhrase);
  const currentWords = words.map(word => word.text);
  const correctSlots = currentWords.map((word, index) => (
    normalizeSealWord(word) === normalizeSealWord(targetWords[index] ?? '')
  ));

  return {
    id,
    words: currentWords,
    correctSlots,
    solved: currentWords.length === targetWords.length && correctSlots.every(Boolean)
  };
}
