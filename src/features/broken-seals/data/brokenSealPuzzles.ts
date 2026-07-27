import type { BrokenSealPuzzle } from '../engine/brokenSealEngine';

export const brokenSealPuzzles: BrokenSealPuzzle[] = [
  {
    id: 'threshold-ward',
    name: 'Threshold Ward',
    threat: 'On the third failed invocation, the seal lashes back for force damage.',
    targetPhrase: 'Withhold the passage of evil entities',
    brokenWords: ['Evil', 'entities', 'withhold', 'the', 'passage', 'of'],
    maxAttempts: 3
  },
  {
    id: 'ember-cage',
    name: 'Ember Cage',
    threat: 'On the third failed invocation, a cinder wisp slips through the break.',
    targetPhrase: 'Bind the flame beneath silent stone',
    brokenWords: ['Flame', 'beneath', 'the', 'silent', 'stone', 'bind'],
    maxAttempts: 3
  },
  {
    id: 'mirror-ban',
    name: 'Mirror Ban',
    threat: 'On the third failed invocation, the mirror names one character as its reflection.',
    targetPhrase: 'Deny the mirror a living voice',
    brokenWords: ['Living', 'voice', 'deny', 'the', 'mirror', 'a'],
    maxAttempts: 3
  }
];

export function getBrokenSealPuzzle(puzzleId: string) {
  return brokenSealPuzzles.find(puzzle => puzzle.id === puzzleId) ?? brokenSealPuzzles[0];
}
