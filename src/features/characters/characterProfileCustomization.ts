import { z } from 'zod';
import type { Character } from '../../types/database';
import { defaultProfileDecorations, profileDecorationThemeValues } from '../profiles/profileDecorations';
import { defaultProfileBackground, profileBackgroundModeValues, profileGradientOrientationValues } from '../profiles/profileBackground';

export const characterFontOptions = [
  { value: 'cinzel', label: 'Cinzel', stack: 'Cinzel, Georgia, serif', category: 'Classic' },
  { value: 'cormorant', label: 'Cormorant', stack: '"Cormorant Garamond", Georgia, serif', category: 'Classic' },
  { value: 'merriweather', label: 'Merriweather', stack: 'Merriweather, Georgia, serif', category: 'Classic' },
  { value: 'inter', label: 'Inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif', category: 'Classic' },
  { value: 'alegreya', label: 'Alegreya', stack: 'Alegreya, Georgia, serif', category: 'Classic' },
  { value: 'im-fell', label: 'IM Fell English', stack: '"IM Fell English", Georgia, serif', category: 'Classic' },
  { value: 'uncial', label: 'Uncial Antiqua', stack: '"Uncial Antiqua", Georgia, serif', category: 'Classic' },
  { value: 'pirata', label: 'Pirata One', stack: '"Pirata One", Georgia, serif', category: 'Classic' },
  { value: 'grenze', label: 'Grenze Gotisch', stack: '"Grenze Gotisch", Georgia, serif', category: 'Classic' },
  { value: 'caesar', label: 'Caesar Dressing', stack: '"Caesar Dressing", Georgia, serif', category: 'Savage' },
  { value: 'metal-mania', label: 'Metal Mania', stack: '"Metal Mania", Georgia, serif', category: 'Savage' },
  { value: 'new-rocker', label: 'New Rocker', stack: '"New Rocker", Georgia, serif', category: 'Savage' },
  { value: 'trade-winds', label: 'Trade Winds', stack: '"Trade Winds", Georgia, serif', category: 'Savage' },
  { value: 'great-vibes', label: 'Great Vibes', stack: '"Great Vibes", cursive', category: 'Fancy' },
  { value: 'marcellus', label: 'Marcellus SC', stack: '"Marcellus SC", Georgia, serif', category: 'Fancy' },
  { value: 'cinzel-decorative', label: 'Cinzel Decorative', stack: '"Cinzel Decorative", Georgia, serif', category: 'Fancy' },
  { value: 'tangerine', label: 'Tangerine', stack: 'Tangerine, cursive', category: 'Fancy' },
  { value: 'almendra-display', label: 'Almendra Display', stack: '"Almendra Display", Georgia, serif', category: 'Whimsical' },
  { value: 'henny-penny', label: 'Henny Penny', stack: '"Henny Penny", Georgia, serif', category: 'Whimsical' },
  { value: 'macondo', label: 'Macondo', stack: 'Macondo, Georgia, serif', category: 'Whimsical' },
  { value: 'mystery-quest', label: 'Mystery Quest', stack: '"Mystery Quest", Georgia, serif', category: 'Whimsical' }
] as const;

export const characterFontCategories = ['Classic', 'Savage', 'Fancy', 'Whimsical'] as const;

export const characterLayoutOptions = [
  { value: 'chronicle', label: 'Chronicle', description: 'A balanced, story-forward character page.' },
  { value: 'dossier', label: 'Dossier', description: 'A detective-noir case file with evidence photography and confidential records.' },
  { value: 'spotlight', label: 'Spotlight', description: 'A theatrical playbill with marquee billing, stage curtains, and the character in the starring role.' },
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
  accentColor: '#a09482',
  ...defaultProfileBackground
} as const;

export const defaultCharacterProfileTypography = {
  titleFontFamily: 'cinzel',
  subtitleFontFamily: 'cinzel',
  fontFamily: 'inter',
  titleFontSize: 124,
  subtitleFontSize: 22,
  textFontSize: 16
} as const;

export const defaultDynamicPortraitPlacement = {
  portraitBackgroundScale: 100,
  portraitBackgroundPositionX: 0,
  portraitBackgroundPositionY: 0,
  portraitCutoutScale: 100,
  portraitCutoutPositionX: 0,
  portraitCutoutPositionY: 0
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
  isPublic: z.boolean(),
  subtitle: z.string().trim().max(140),
  titleFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest']),
  subtitleFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest']),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest']),
  titleFontSize: z.number().int().min(40).max(180),
  subtitleFontSize: z.number().int().min(14).max(56),
  textFontSize: z.number().int().min(12).max(26),
  borderTheme: z.enum(profileDecorationThemeValues),
  backgroundTheme: z.enum(profileDecorationThemeValues),
  borderColorSource: z.enum(['base', 'accent']),
  backgroundColorSource: z.enum(['base', 'accent']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  backgroundMode: z.enum(profileBackgroundModeValues),
  gradientColor: hexColor,
  gradientOrientation: z.enum(profileGradientOrientationValues),
  gradientTransitionRate: z.number().int().min(0).max(100),
  bannerImageUrl: externalImageUrl,
  dynamicPortraitEnabled: z.boolean(),
  portraitBackgroundImageUrl: externalImageUrl,
  portraitCutoutImageUrl: externalImageUrl,
  portraitBackgroundScale: z.number().int().min(50).max(250),
  portraitBackgroundPositionX: z.number().int().min(-50).max(50),
  portraitBackgroundPositionY: z.number().int().min(-50).max(50),
  portraitCutoutScale: z.number().int().min(50).max(250),
  portraitCutoutPositionX: z.number().int().min(-50).max(50),
  portraitCutoutPositionY: z.number().int().min(-50).max(50),
  portraitFocusX: z.number().min(0).max(100),
  portraitFocusY: z.number().min(0).max(100),
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
}).strict().superRefine((profile, context) => {
  if (!profile.dynamicPortraitEnabled) return;
  if (!profile.portraitBackgroundImageUrl) {
    context.addIssue({ code: 'custom', path: ['portraitBackgroundImageUrl'], message: 'Add a background image for the Dynamic Portrait.' });
  }
  if (!profile.portraitCutoutImageUrl) {
    context.addIssue({ code: 'custom', path: ['portraitCutoutImageUrl'], message: 'Add a transparent character cutout for the Dynamic Portrait.' });
  }
});

export type CharacterProfileCustomizationInput = z.infer<typeof characterProfileCustomizationSchema>;

export const getCharacterFontStack = (fontFamily: Character['profileFontFamily']) =>
  characterFontOptions.find(option => option.value === fontFamily)?.stack || characterFontOptions[0].stack;

export const customizationFromCharacter = (character: Character): CharacterProfileCustomizationInput => ({
  isPublic: character.profileIsPublic ?? false,
  subtitle: character.profileSubtitle,
  titleFontFamily: character.profileTitleFontFamily || character.profileFontFamily,
  subtitleFontFamily: character.profileSubtitleFontFamily || character.profileFontFamily,
  fontFamily: character.profileFontFamily,
  titleFontSize: character.profileTitleFontSize || defaultCharacterProfileTypography.titleFontSize,
  subtitleFontSize: character.profileSubtitleFontSize || defaultCharacterProfileTypography.subtitleFontSize,
  textFontSize: character.profileTextFontSize || defaultCharacterProfileTypography.textFontSize,
  borderTheme: character.profileBorderTheme || defaultProfileDecorations.borderTheme,
  backgroundTheme: character.profileBackgroundTheme || defaultProfileDecorations.backgroundTheme,
  borderColorSource: character.profileBorderColorSource || defaultProfileDecorations.borderColorSource,
  backgroundColorSource: character.profileBackgroundColorSource || defaultProfileDecorations.backgroundColorSource,
  fontColor: character.profileFontColor,
  baseColor: character.profileBaseColor,
  accentColor: character.profileAccentColor,
  backgroundMode: character.profileBackgroundMode,
  gradientColor: character.profileGradientColor,
  gradientOrientation: character.profileGradientOrientation,
  gradientTransitionRate: character.profileGradientTransitionRate,
  bannerImageUrl: character.profileBannerImageUrl || '',
  dynamicPortraitEnabled: character.profileDynamicPortraitEnabled ?? false,
  portraitBackgroundImageUrl: character.profilePortraitBackgroundImageUrl || '',
  portraitCutoutImageUrl: character.profilePortraitCutoutImageUrl || '',
  portraitBackgroundScale: character.profilePortraitBackgroundScale ?? defaultDynamicPortraitPlacement.portraitBackgroundScale,
  portraitBackgroundPositionX: character.profilePortraitBackgroundPositionX ?? defaultDynamicPortraitPlacement.portraitBackgroundPositionX,
  portraitBackgroundPositionY: character.profilePortraitBackgroundPositionY ?? defaultDynamicPortraitPlacement.portraitBackgroundPositionY,
  portraitCutoutScale: character.profilePortraitCutoutScale ?? defaultDynamicPortraitPlacement.portraitCutoutScale,
  portraitCutoutPositionX: character.profilePortraitCutoutPositionX ?? defaultDynamicPortraitPlacement.portraitCutoutPositionX,
  portraitCutoutPositionY: character.profilePortraitCutoutPositionY ?? defaultDynamicPortraitPlacement.portraitCutoutPositionY,
  portraitFocusX: character.profilePortraitFocusX ?? 50,
  portraitFocusY: character.profilePortraitFocusY ?? 0,
  layoutStyle: character.profileLayoutStyle,
  sectionVisibility: { ...character.profileSectionVisibility }
});
