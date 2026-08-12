import { z } from 'zod';
import type { Character } from '../../types/database';

export const characterFontOptions = [
  { value: 'cinzel', label: 'Cinzel', stack: 'Cinzel, Georgia, serif' },
  { value: 'cormorant', label: 'Cormorant', stack: '"Cormorant Garamond", Georgia, serif' },
  { value: 'merriweather', label: 'Merriweather', stack: 'Merriweather, Georgia, serif' },
  { value: 'inter', label: 'Inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif' }
] as const;

export const characterLayoutOptions = [
  { value: 'chronicle', label: 'Chronicle', description: 'A balanced, story-forward character page.' },
  { value: 'dossier', label: 'Dossier', description: 'An archival file with compact facts and records.' },
  { value: 'spotlight', label: 'Spotlight', description: 'A cinematic portrait-led presentation.' }
] as const;

export const defaultCharacterProfileSectionVisibility = {
  portrait: true,
  details: true,
  abilityMatrix: true,
  backstory: true,
  notes: true,
  journal: true,
  relationships: true
} as const;

export const defaultCharacterProfilePalette = {
  baseColor: '#111615',
  fontColor: '#f0ede7',
  accentColor: '#a09482',
  surfaceColor: '#1d2321'
} as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid six-digit color.');

export const characterProfileCustomizationSchema = z.object({
  subtitle: z.string().trim().max(140),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  surfaceColor: hexColor,
  layoutStyle: z.enum(['chronicle', 'dossier', 'spotlight']),
  sectionVisibility: z.object({
    portrait: z.boolean(),
    details: z.boolean(),
    abilityMatrix: z.boolean(),
    backstory: z.boolean(),
    notes: z.boolean(),
    journal: z.boolean(),
    relationships: z.boolean()
  }).strict()
}).strict();

export type CharacterProfileCustomizationInput = z.infer<typeof characterProfileCustomizationSchema>;

export const getCharacterFontStack = (fontFamily: Character['profileFontFamily']) =>
  characterFontOptions.find(option => option.value === fontFamily)?.stack || characterFontOptions[0].stack;

export const customizationFromCharacter = (character: Character): CharacterProfileCustomizationInput => ({
  subtitle: character.profileSubtitle,
  fontFamily: character.profileFontFamily,
  fontColor: character.profileFontColor,
  baseColor: character.profileBaseColor,
  accentColor: character.profileAccentColor,
  surfaceColor: character.profileSurfaceColor,
  layoutStyle: character.profileLayoutStyle,
  sectionVisibility: { ...character.profileSectionVisibility }
});
