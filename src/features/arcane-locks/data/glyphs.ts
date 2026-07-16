import type { GlyphDefinition } from '../engine/types';

export const arcaneGlyphs: GlyphDefinition[] = [
  glyph('grass', 'Grass', 'M4 18c5-8 8-8 16-12M8 20c2-6 4-9 5-14M14 20c1-5 2-8 6-12', ['plant', 'food', 'life'], 'A cluster of bending grass blades.'),
  glyph('cow', 'Cow', 'M6 9l-2-3m14 3l2-3M7 8h10l3 4-2 7H6l-2-7 3-4zm3 4h.01M14 12h.01', ['animal', 'herbivore', 'food'], 'A broad-horned cow head.'),
  glyph('lion', 'Lion', 'M12 4l3 3 4 1-1 4 2 4-4 1-2 3-2-3-4-1 2-4-1-4 4-1 3-3z', ['animal', 'predator', 'crown'], 'A mane-ringed lion mark.'),
  glyph('rain', 'Rain', 'M7 5h10M6 9h12M8 13l-1 3m5-3l-1 3m6-3l-1 3', ['water', 'sky'], 'Falling rain below layered clouds.'),
  glyph('river', 'River', 'M5 7c4 4 10-4 14 0M5 13c4 4 10-4 14 0M5 19c4 4 10-4 14 0', ['water', 'path'], 'Three flowing river currents.'),
  glyph('ocean', 'Ocean', 'M4 15c3-4 6-4 9 0s5 4 8 0M5 20c4-3 8-3 14 0M8 10a4 4 0 018 0', ['water', 'depth'], 'A deep ocean swell beneath a rising wave.'),
  glyph('tree', 'Tree', 'M12 20V9m0 0L7 14m5-5l5 5M8 9a4 4 0 118 0 4 4 0 01-8 0z', ['plant', 'wood'], 'A tree with a forked trunk.'),
  glyph('moon', 'Moon', 'M16 3a8 8 0 10-2 18 7 7 0 012-18z', ['sky', 'night'], 'A crescent moon.'),
  glyph('tide', 'Tide', 'M4 16c3-3 5-3 8 0s5 3 8 0M6 11c2-2 4-2 6 0s4 2 6 0', ['water', 'moon'], 'Two crossing tide waves.'),
  glyph('fire', 'Fire', 'M12 21c4-2 6-5 4-9-2 1-3 1-4-5-4 4-7 7-4 11 1 2 2 3 4 3z', ['flame', 'change'], 'A tapered flame.'),
  glyph('smoke', 'Smoke', 'M8 20c6-2-2-5 4-8 5-3-1-5 4-8M15 20c4-3-2-4 2-8', ['air', 'fire'], 'Curling strands of smoke.'),
  glyph('wind', 'Wind', 'M4 8h10a2 2 0 10-2-2M4 13h16a2 2 0 11-2 2M4 18h9', ['air', 'motion'], 'Three sweeping wind lines.'),
  glyph('eye', 'Eye', 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6zm9 2a2 2 0 100-4 2 2 0 000 4z', ['sight', 'mind'], 'An open watching eye.'),
  glyph('iron', 'Iron', 'M6 4h12M8 4v16m8-16v16M5 20h14M8 10h8', ['metal', 'ward'], 'A forged iron bar sigil.'),
  glyph('wolf', 'Wolf', 'M5 18l2-10 4 3 2-5 3 5 4-3-1 10-4 2-3-3-3 3-3-3z', ['animal', 'predator'], 'A sharp-eared wolf face.'),
  glyph('goat', 'Goat', 'M7 8C5 5 5 3 8 3m9 5c2-3 2-5-1-5M7 8h10l2 6-3 5H8l-3-5 2-6z', ['animal', 'herbivore'], 'A curled-horn goat mark.'),
  glyph('wheat', 'Wheat', 'M12 21V4m0 4L8 6m4 5l4-3m-4 6l-4-2m4 5l4-2', ['plant', 'food'], 'A stalk of wheat.'),
  glyph('stone', 'Stone', 'M7 8l5-4 6 4 1 8-5 4-7-2-2-6 2-4z', ['earth', 'ward'], 'A faceted stone.'),
  glyph('crown', 'Crown', 'M4 17h16M5 17l1-10 5 5 3-7 4 7 4-5 1 10', ['rule', 'authority'], 'A three-pointed crown.'),
  glyph('bone', 'Bone', 'M7 8a2 2 0 112-2l6 6a2 2 0 112 2l-6-6a2 2 0 11-2 2z', ['death', 'body'], 'Crossed bone joints.'),
  glyph('star', 'Star', 'M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 17l-5.5 3.5L8 14 3 10l6.5-.5L12 3z', ['sky', 'guidance'], 'A many-pointed star.')
];

function glyph(id: string, label: string, symbol: string, semanticTags: string[], accessibleDescription: string): GlyphDefinition {
  return { id, label, symbol, semanticTags, accessibleDescription };
}
