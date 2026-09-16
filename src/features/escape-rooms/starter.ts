import type { Blueprint, PuzzleNode } from './model';

const node = (id: string, title: string, overrides: Partial<PuzzleNode>): PuzzleNode => ({
  id, title, kind: 'clue', prop: 'paper', location: '', text: '', backText: '', gmNotes: '',
  reveal: 'automatic', gate: 'all', requires: [], code: '', keyIds: [], ...overrides,
});
export const starter: Blueprint = {
  title: 'The Astronomer’s Last Secret',
  description: 'An abandoned observatory. Two forgotten experiments. One final discovery. Search the room in Foundry; examine your discoveries here.',
  nodes: [
    node('letter', 'A letter in the dust', { location: 'Observatory · writing desk', text: 'To my apprentice: the stars will guide you. Count the moons, then the suns, then the wandering stars.', backText: 'Three moons. One sun. Four wandering stars.', gmNotes: 'Reveal when the party searches the writing desk.', reveal: 'manual' }),
    node('cabinet', 'The brass cabinet', { kind: 'container', prop: 'chest', location: 'Observatory · north wall', text: 'Three rotating dials sit beneath an engraving of the night sky.', code: '314', requires: [{ nodeId: 'letter', state: 'known' }] }),
    node('key', 'A sun-shaped key', { kind: 'item', prop: 'key', location: 'Inside the brass cabinet', text: 'A heavy brass key. Its bow is shaped like the sun.', requires: [{ nodeId: 'cabinet', state: 'used' }] }),
    node('book', 'The star atlas', { prop: 'book', location: 'Observatory · bookcase', text: 'The last entry reads: “When the sky is dark, speak DAWN.”', backText: 'A sketch shows a metal rod fitted into the vault door.', reveal: 'manual', gmNotes: 'Reveal after the players search the bookcase. This begins the parallel branch.' }),
    node('case', 'The instrument case', { kind: 'container', prop: 'chest', location: 'Beneath the telescope', text: 'A word is etched above the latch: “Tomorrow?”', code: 'DAWN', requires: [{ nodeId: 'book', state: 'known' }] }),
    node('rod', 'The silver alignment rod', { kind: 'item', prop: 'rod', location: 'Inside the instrument case', text: 'A cold silver rod with a triangular notch.', requires: [{ nodeId: 'case', state: 'used' }] }),
    node('vault', 'The horizon vault', { kind: 'room', prop: 'door', location: 'Observatory · eastern alcove', text: 'A sun-shaped keyhole and a narrow triangular socket flank the door.', keyIds: ['key', 'rod'], requires: [{ nodeId: 'cabinet', state: 'used' }, { nodeId: 'case', state: 'used' }] }),
    node('treasure', 'The captive starlight', { kind: 'treasure', prop: 'crystal', location: 'Beyond the horizon vault', text: 'A small crystal holds a living constellation. The astronomer’s final discovery is yours. Claim it to finish the room.', requires: [{ nodeId: 'vault', state: 'used' }] }),
  ],
};
