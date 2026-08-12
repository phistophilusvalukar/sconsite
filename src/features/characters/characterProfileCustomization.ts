import { z } from 'zod';
import type { Character } from '../../types/database';

export const characterFontOptions = [
  { value: 'cinzel', label: 'Cinzel', stack: 'Cinzel, Georgia, serif' },
  { value: 'cormorant', label: 'Cormorant', stack: '"Cormorant Garamond", Georgia, serif' },
  { value: 'merriweather', label: 'Merriweather', stack: 'Merriweather, Georgia, serif' },
  { value: 'inter', label: 'Inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { value: 'alegreya', label: 'Alegreya', stack: 'Alegreya, Georgia, serif' },
  { value: 'im-fell', label: 'IM Fell English', stack: '"IM Fell English", Georgia, serif' },
  { value: 'uncial', label: 'Uncial Antiqua', stack: '"Uncial Antiqua", Georgia, serif' },
  { value: 'pirata', label: 'Pirata One', stack: '"Pirata One", Georgia, serif' },
  { value: 'grenze', label: 'Grenze Gotisch', stack: '"Grenze Gotisch", Georgia, serif' }
] as const;

export const characterLayoutOptions = [
  { value: 'chronicle', label: 'Chronicle', description: 'A balanced, story-forward character page.' },
  { value: 'dossier', label: 'Dossier', description: 'An archival file with compact facts and records.' },
  { value: 'spotlight', label: 'Spotlight', description: 'A cinematic portrait-led presentation.' },
  { value: 'saga', label: 'Saga', description: 'An epic full-width hero with an arched portrait and sweeping records.' }
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
  accentColor: '#a09482'
} as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid six-digit color.');
export const isSafeCharacterBannerImageUrl = (value: string) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const externalImageUrl = z.string().trim().max(2000).refine(isSafeCharacterBannerImageUrl, 'Use a direct HTTPS image URL.');

export const characterProfileCustomizationSchema = z.object({
  subtitle: z.string().trim().max(140),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  bannerImageUrl: externalImageUrl,
  layoutStyle: z.enum(['chronicle', 'dossier', 'spotlight', 'saga']),
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
  bannerImageUrl: character.profileBannerImageUrl || '',
  layoutStyle: character.profileLayoutStyle,
  sectionVisibility: { ...character.profileSectionVisibility }
});
