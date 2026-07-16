import type { LockRuntimeState, PuzzleDefinition } from '../engine/types';
import { arcaneGlyphs } from './glyphs';
import { EMPTY_GLYPH_ID } from '../engine/constants';

function initial(rings: PuzzleDefinition['rings'], obstacleStates: LockRuntimeState['obstacleStates'] = {}): LockRuntimeState {
  const hasSocketedRing = rings.some(ring => ring.glyphSockets?.length);
  return {
    ringRotations: Object.fromEntries(rings.map(ring => [ring.id, ring.startingRotation])),
    poweredGlyphByRing: Object.fromEntries(rings.map(ring => [ring.id, null])),
    poweredSocketByRing: hasSocketedRing ? Object.fromEntries(rings.map(ring => [ring.id, null])) : undefined,
    obstacleStates,
    energyTrace: [],
    solved: false,
    lastInvokeFailed: false
  };
}

const tutorialRings = [
  {
    id: 'outer',
    name: 'Outer Ring',
    radius: 178,
    glyphIds: ['grass', 'rain', 'stone', 'wheat', 'moon', 'wind'],
    startingRotation: 0,
    conduits: [{ sourceGlyphId: 'grass', destinationOffset: 1, destinationRingId: 'middle' }]
  },
  {
    id: 'middle',
    name: 'Middle Ring',
    radius: 125,
    glyphIds: ['river', 'tree', 'cow', 'fire', 'goat', 'eye'],
    startingRotation: 0,
    conduits: [{ sourceGlyphId: 'cow', destinationOffset: -1, destinationRingId: 'inner' }]
  },
  {
    id: 'inner',
    name: 'Inner Ring',
    radius: 73,
    glyphIds: ['lion', EMPTY_GLYPH_ID, 'wolf', EMPTY_GLYPH_ID, 'crown', 'bone'],
    startingRotation: 0,
    conduits: [{ sourceGlyphId: 'lion', destinationOffset: 0 }]
  }
] satisfies PuzzleDefinition['rings'];

const decipherRings = [
  {
    id: 'outer',
    name: 'Cloud Ring',
    radius: 182,
    glyphIds: ['moon', 'rain', 'star', 'eye', 'wind', 'stone', 'grass', 'fire'],
    startingRotation: 1,
    conduits: [{ sourceGlyphId: 'moon', destinationOffset: 2, destinationRingId: 'middle' }]
  },
  {
    id: 'middle',
    name: 'Tide Ring',
    radius: 132,
    glyphIds: ['tide', 'river', 'smoke', 'tree', 'iron', 'cow', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 0,
    conduits: [{ sourceGlyphId: 'tide', destinationOffset: -2, destinationRingId: 'inner' }]
  },
  {
    id: 'inner',
    name: 'River Ring',
    radius: 78,
    glyphIds: ['river', 'bone', 'lion', 'wheat', 'crown', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 3,
    conduits: [{ sourceGlyphId: 'river', destinationOffset: 0 }]
  }
] satisfies PuzzleDefinition['rings'];

const routingRings = [
  {
    id: 'outer',
    name: 'Hunger Ring',
    radius: 188,
    glyphIds: ['wheat', 'grass', 'stone', 'rain', 'moon', 'wind', 'iron', 'star'],
    startingRotation: 0,
    conduits: [{ sourceGlyphId: 'wheat', destinationOffset: 1, destinationRingId: 'second' }]
  },
  {
    id: 'second',
    name: 'Horn Ring',
    radius: 142,
    glyphIds: ['goat', 'cow', 'tree', 'fire', 'river', 'eye', 'bone', EMPTY_GLYPH_ID],
    startingRotation: 2,
    conduits: [{ sourceGlyphId: 'goat', destinationOffset: 2, destinationRingId: 'third' }]
  },
  {
    id: 'third',
    name: 'Fang Ring',
    radius: 98,
    glyphIds: ['wolf', 'lion', 'smoke', 'crown', 'tide', 'grass', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 0,
    conduits: [{ sourceGlyphId: 'wolf', destinationOffset: -1, destinationRingId: 'inner' }],
    linkedRing: { ringId: 'inner', ratio: 1, direction: -1 }
  },
  {
    id: 'inner',
    name: 'Ash Ring',
    radius: 55,
    glyphIds: ['bone', 'fire', 'star', 'iron', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 1,
    conduits: [{ sourceGlyphId: 'bone', destinationOffset: 0 }]
  }
] satisfies PuzzleDefinition['rings'];

const expertRings = [
  {
    id: 'outer',
    name: 'Verdant Gate',
    radius: 194,
    glyphIds: ['grass', 'stone', 'wind', 'fire', 'rain', 'iron', 'star', 'wheat'],
    startingRotation: 0,
    conduits: [
      { sourceGlyphId: 'grass', destinationRingId: 'middle', destinationSlot: 0, destinationOffset: 0 },
      { sourceGlyphId: 'grass', destinationRingId: 'middle', destinationSlot: 1, destinationOffset: 0 }
    ]
  },
  {
    id: 'lunar',
    name: 'Twin Moon Ring',
    radius: 152,
    glyphIds: ['moon', 'moon', 'eye', 'tide', 'crown', 'bone', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    glyphSockets: [
      { id: 'lunar-moon-true', glyphId: 'moon' },
      { id: 'lunar-moon-false', glyphId: 'moon' },
      { id: 'lunar-eye', glyphId: 'eye' },
      { id: 'lunar-tide', glyphId: 'tide' },
      { id: 'lunar-crown', glyphId: 'crown' },
      { id: 'lunar-bone', glyphId: 'bone' },
      { id: 'lunar-empty-6', glyphId: EMPTY_GLYPH_ID },
      { id: 'lunar-empty-7', glyphId: EMPTY_GLYPH_ID }
    ],
    startingRotation: 0,
    conduits: [
      { sourceSocketId: 'lunar-moon-true', destinationRingId: 'deep', destinationSlot: 0, destinationOffset: 0 },
      { sourceSocketId: 'lunar-moon-false', destinationRingId: 'middle', destinationSlot: 1, destinationOffset: 0 }
    ]
  },
  {
    id: 'middle',
    name: 'Horn Return',
    radius: 112,
    glyphIds: ['cow', 'wolf', 'river', 'smoke', 'tree', 'goat', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 0,
    conduits: [
      { sourceGlyphId: 'cow', destinationRingId: 'outer', destinationSlot: 0, destinationOffset: 0 }
    ]
  },
  {
    id: 'ward',
    name: 'Ward Ring',
    radius: 75,
    glyphIds: ['iron', 'stone', 'fire', 'wind', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 0,
    conduits: []
  },
  {
    id: 'deep',
    name: 'Ocean Core Ring',
    radius: 42,
    glyphIds: ['ocean', 'river', 'star', 'bone', EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID, EMPTY_GLYPH_ID],
    startingRotation: 0,
    conduits: []
  }
] satisfies PuzzleDefinition['rings'];

export const puzzleTemplates: PuzzleDefinition[] = [
  {
    id: 'verdant-tutorial',
    name: 'Verdant Seal',
    version: 1,
    difficulty: 1,
    inscription: 'Grass feeds Cow. Cow feeds Lion.',
    obscuredInscription: 'The inscription is too distant to decipher.',
    translatedHint: 'Power each creature in the order named by the inscription.',
    glyphDictionary: arcaneGlyphs,
    rings: tutorialRings,
    powerSources: [{ id: 'source-outer', ringId: 'outer', slot: 0 }],
    obstacles: [],
    solutionRules: [{ id: 'food-chain', chain: ['grass', 'cow', 'lion'] }],
    initialRuntimeState: initial(tutorialRings),
    conduitRevealMode: 'always'
  },
  {
    id: 'lunar-deciphering',
    name: 'Lunar Seal',
    version: 1,
    difficulty: 2,
    inscription: 'The pale watcher draws the sea; the sea remembers the river.',
    obscuredInscription: 'Distant runes shimmer in unreadable silver bands.',
    translatedHint: 'Moon leads Tide, and Tide leads River.',
    glyphDictionary: arcaneGlyphs,
    rings: decipherRings,
    powerSources: [{ id: 'source-moon', ringId: 'outer', slot: 0 }],
    obstacles: [],
    solutionRules: [{ id: 'moon-tide-river', chain: ['moon', 'tide', 'river'] }],
    initialRuntimeState: initial(decipherRings),
    conduitRevealMode: 'powered'
  },
  {
    id: 'blood-routing',
    name: 'Blood Seal',
    version: 1,
    difficulty: 3,
    inscription: 'The field fills the horn, the horn calls the fang, the fang leaves bone.',
    obscuredInscription: 'A red wax glare hides the inscription.',
    translatedHint: 'Wheat feeds Goat; Goat draws Wolf; Wolf leaves Bone. The ward blocks false power.',
    glyphDictionary: arcaneGlyphs,
    rings: routingRings,
    powerSources: [{ id: 'source-wheat', ringId: 'outer', slot: 0 }],
    obstacles: [
      {
        id: 'ward-second-3',
        type: 'ward',
        ringId: 'third',
        blocks: [{ ringId: 'third', slot: 3 }],
        initialPosition: 3
      }
    ],
    solutionRules: [{ id: 'field-horn-fang-bone', chain: ['wheat', 'goat', 'wolf', 'bone'] }],
    initialRuntimeState: initial(routingRings, { 'ward-second-3': { position: 3, active: true } }),
    conduitRevealMode: 'hover'
  },
  {
    id: 'eclipse-labyrinth',
    name: 'Eclipse Labyrinth',
    version: 1,
    difficulty: 5,
    inscription: 'Grass feeds Cow, yet Cow remembers Grass. Of the twin moons, only the elder moon wakes the far Ocean. The false hunger must be barred.',
    obscuredInscription: 'Layered eclipse runes fold over one another, too distant to separate.',
    translatedHint: 'Power Grass, Cow, the elder Moon, and Ocean. Keep the ward blocking the false Grass branch.',
    glyphDictionary: arcaneGlyphs,
    rings: expertRings,
    powerSources: [
      { id: 'source-grass', ringId: 'outer', slot: 0 },
      { id: 'source-moon', ringId: 'lunar', slot: 0 }
    ],
    obstacles: [
      {
        id: 'false-hunger-block',
        type: 'blocker',
        ringId: 'middle',
        blocks: [{ ringId: 'middle', slot: 1 }],
        initialPosition: 1
      }
    ],
    solutionRules: [
      { id: 'grass-cow', chain: ['grass', 'cow'] },
      { id: 'cow-remembers-grass', chain: ['cow', 'grass'] },
      { id: 'elder-moon-ocean', chain: ['lunar-moon-true', 'ocean'] }
    ],
    initialRuntimeState: initial(expertRings, { 'false-hunger-block': { position: 1, active: true } }),
    conduitRevealMode: 'powered'
  }
];

export function getPuzzleTemplate(templateId: string): PuzzleDefinition {
  const template = puzzleTemplates.find(item => item.id === templateId);
  if (!template) throw new Error(`Unknown puzzle template: ${templateId}`);
  return template;
}
