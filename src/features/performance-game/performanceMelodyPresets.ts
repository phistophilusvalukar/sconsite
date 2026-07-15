import { MelodyNote, NoteValue, ToneId } from './performanceGame.types';
import { noteValueBeats } from './performanceGame.utils';

export interface MelodyPreset {
  id: string;
  title: string;
  era: 'classic' | 'modern';
  sequence: MelodyNote[];
}

const note = (toneId: ToneId, value: NoteValue): MelodyNote => ({
  toneId,
  value,
  beats: noteValueBeats[value],
});

export const melodyPresets: MelodyPreset[] = [
  {
    id: 'retro-hero-fanfare',
    title: 'Retro Hero Fanfare',
    era: 'classic',
    sequence: [
      note('middle', 'quarter'),
      note('midHigh', 'quarter'),
      note('high', 'half'),
      note('midHigh', 'eighth'),
      note('middle', 'eighth'),
      note('midLow', 'quarter'),
      note('middle', 'half'),
    ],
  },
  {
    id: 'dungeon-secret',
    title: 'Dungeon Secret',
    era: 'classic',
    sequence: [
      note('low', 'eighth'),
      note('middle', 'eighth'),
      note('midHigh', 'quarter'),
      note('high', 'quarter'),
      note('midHigh', 'eighth'),
      note('middle', 'eighth'),
      note('high', 'half'),
    ],
  },
  {
    id: 'arcade-rival-sprint',
    title: 'Arcade Rival Sprint',
    era: 'classic',
    sequence: [
      note('middle', 'eighth'),
      note('midHigh', 'eighth'),
      note('middle', 'eighth'),
      note('high', 'eighth'),
      note('midHigh', 'quarter'),
      note('middle', 'quarter'),
      note('midLow', 'quarter'),
      note('low', 'half'),
    ],
  },
  {
    id: 'airship-launch',
    title: 'Airship Launch',
    era: 'classic',
    sequence: [
      note('low', 'quarter'),
      note('midLow', 'quarter'),
      note('middle', 'quarter'),
      note('midHigh', 'quarter'),
      note('high', 'half'),
      note('midHigh', 'quarter'),
      note('middle', 'half'),
    ],
  },
  {
    id: 'neon-boss-alert',
    title: 'Neon Boss Alert',
    era: 'modern',
    sequence: [
      note('high', 'eighth'),
      note('high', 'eighth'),
      note('midHigh', 'quarter'),
      note('middle', 'eighth'),
      note('midHigh', 'eighth'),
      note('low', 'half'),
      note('middle', 'quarter'),
      note('high', 'quarter'),
    ],
  },
  {
    id: 'open-world-sunrise',
    title: 'Open World Sunrise',
    era: 'modern',
    sequence: [
      note('low', 'half'),
      note('midLow', 'quarter'),
      note('middle', 'quarter'),
      note('midHigh', 'half'),
      note('middle', 'quarter'),
      note('high', 'half'),
    ],
  },
  {
    id: 'cozy-town-bell',
    title: 'Cozy Town Bell',
    era: 'modern',
    sequence: [
      note('middle', 'quarter'),
      note('midLow', 'eighth'),
      note('middle', 'eighth'),
      note('midHigh', 'quarter'),
      note('middle', 'quarter'),
      note('low', 'half'),
      note('midLow', 'quarter'),
      note('middle', 'half'),
    ],
  },
  {
    id: 'galaxy-map-ping',
    title: 'Galaxy Map Ping',
    era: 'modern',
    sequence: [
      note('high', 'quarter'),
      note('middle', 'quarter'),
      note('midHigh', 'eighth'),
      note('high', 'eighth'),
      note('midLow', 'quarter'),
      note('middle', 'half'),
      note('low', 'quarter'),
      note('high', 'half'),
    ],
  },
];

export const defaultMelodyPreset = melodyPresets[0];
