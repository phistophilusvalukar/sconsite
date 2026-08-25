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
  { value: 'mystery-quest', label: 'Mystery Quest', stack: '"Mystery Quest", Georgia, serif', category: 'Whimsical' },
  { value: 'press-start-2p', label: 'Press Start 2P', stack: '"Press Start 2P", monospace', category: 'Whimsical' }
] as const;

export const characterFontCategories = ['Classic', 'Savage', 'Fancy', 'Whimsical'] as const;

export const characterLayoutOptions = [
  { value: 'chronicle', label: 'Chronicle', description: 'A balanced, story-forward character page.' },
  { value: 'dossier', label: 'Dossier', description: 'A detective-noir case file with evidence photography and confidential records.' },
  { value: 'spotlight', label: 'Spotlight', description: 'A dramatic, portrait-led composition with ornamental framing and bold typography.' },
  { value: 'saga', label: 'Saga', description: 'An epic full-width hero with an arched portrait and sweeping records.' },
  { value: 'cyberpunk', label: 'Splash', description: 'A full-bleed, art-first profile with an overlaid title and a vertical story flow.' },
  { value: 'nostalgia', label: 'Minimal', description: 'A spacious modern profile with clean typography, quiet surfaces, and restrained details.' }
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
  buttonTextColor: '#111615',
  ...defaultProfileBackground
} as const;

export const defaultCharacterProfileTypography = {
  titleFontFamily: 'cinzel',
  subtitleFontFamily: 'cinzel',
  fontFamily: 'inter',
  accentFontFamily: 'inter',
  titleFontSize: 124,
  subtitleFontSize: 22,
  textFontSize: 16,
  accentFontSize: 13,
  themeMode: 'dark'
} as const;

export const defaultDynamicPortraitPlacement = {
  portraitBackgroundScale: 100,
  portraitBackgroundPositionX: 0,
  portraitBackgroundPositionY: 0,
  portraitCutoutScale: 100,
  portraitCutoutPositionX: 0,
  portraitCutoutPositionY: 0
} as const;

export const defaultCharacterProfileLayers = {
  atmosphereImageUrl: '',
  atmospherePositionX: 50,
  atmospherePositionY: 35,
  atmosphereSize: 60,
  atmosphereOpacity: 35,
  atmosphereParallax: false,
  foregroundImageUrl: '',
  foregroundAnchor: 'page',
  foregroundPositionX: 50,
  foregroundPositionY: 50,
  foregroundSize: 50,
  foregroundOpacity: 60,
  foregroundParallax: false
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
  titleFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  subtitleFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  accentFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  titleFontSize: z.number().int().min(40).max(180),
  subtitleFontSize: z.number().int().min(14).max(56),
  textFontSize: z.number().int().min(12).max(26),
  accentFontSize: z.number().int().min(10).max(28),
  themeMode: z.enum(['dark', 'light']),
  borderTheme: z.enum(profileDecorationThemeValues),
  backgroundTheme: z.enum(profileDecorationThemeValues),
  borderColorSource: z.enum(['base', 'accent']),
  backgroundColorSource: z.enum(['base', 'accent']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  buttonTextColor: hexColor,
  backgroundMode: z.enum(profileBackgroundModeValues),
  gradientColor: hexColor,
  gradientOrientation: z.enum(profileGradientOrientationValues),
  gradientTransitionRate: z.number().int().min(0).max(100),
  bannerImageUrl: externalImageUrl,
  portraitImageUrl: externalImageUrl,
  dynamicPortraitEnabled: z.boolean(),
  splashHideDynamicPortraitBackground: z.boolean(),
  atmosphereImageUrl: externalImageUrl,
  atmospherePositionX: z.number().int().min(0).max(100),
  atmospherePositionY: z.number().int().min(0).max(100),
  atmosphereSize: z.number().int().min(5).max(200),
  atmosphereOpacity: z.number().int().min(0).max(100),
  atmosphereParallax: z.boolean(),
  foregroundImageUrl: externalImageUrl,
  foregroundAnchor: z.enum(['page', 'left', 'right', 'portrait', 'backstory']),
  foregroundPositionX: z.number().int().min(0).max(100),
  foregroundPositionY: z.number().int().min(0).max(100),
  foregroundSize: z.number().int().min(5).max(200),
  foregroundOpacity: z.number().int().min(0).max(100),
  foregroundParallax: z.boolean(),
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
  layoutStyle: z.enum(['chronicle', 'dossier', 'spotlight', 'saga', 'cyberpunk', 'nostalgia']),
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
  accentFontFamily: character.profileAccentFontFamily || character.profileFontFamily,
  titleFontSize: character.profileTitleFontSize || defaultCharacterProfileTypography.titleFontSize,
  subtitleFontSize: character.profileSubtitleFontSize || defaultCharacterProfileTypography.subtitleFontSize,
  textFontSize: character.profileTextFontSize || defaultCharacterProfileTypography.textFontSize,
  accentFontSize: character.profileAccentFontSize || defaultCharacterProfileTypography.accentFontSize,
  themeMode: character.profileThemeMode || 'dark',
  borderTheme: character.profileBorderTheme || defaultProfileDecorations.borderTheme,
  backgroundTheme: character.profileBackgroundTheme || defaultProfileDecorations.backgroundTheme,
  borderColorSource: character.profileBorderColorSource || defaultProfileDecorations.borderColorSource,
  backgroundColorSource: character.profileBackgroundColorSource || defaultProfileDecorations.backgroundColorSource,
  fontColor: character.profileFontColor,
  baseColor: character.profileBaseColor,
  accentColor: character.profileAccentColor,
  buttonTextColor: character.profileButtonTextColor || defaultCharacterProfilePalette.buttonTextColor,
  backgroundMode: character.profileBackgroundMode,
  gradientColor: character.profileGradientColor,
  gradientOrientation: character.profileGradientOrientation,
  gradientTransitionRate: character.profileGradientTransitionRate,
  bannerImageUrl: character.profileBannerImageUrl || '',
  portraitImageUrl: character.profilePortraitImageUrl || '',
  dynamicPortraitEnabled: character.profileDynamicPortraitEnabled ?? false,
  splashHideDynamicPortraitBackground: character.profileSplashHidePortraitBackground ?? false,
  atmosphereImageUrl: character.profileAtmosphereImageUrl || '',
  atmospherePositionX: character.profileAtmospherePositionX ?? defaultCharacterProfileLayers.atmospherePositionX,
  atmospherePositionY: character.profileAtmospherePositionY ?? defaultCharacterProfileLayers.atmospherePositionY,
  atmosphereSize: character.profileAtmosphereSize ?? defaultCharacterProfileLayers.atmosphereSize,
  atmosphereOpacity: character.profileAtmosphereOpacity ?? defaultCharacterProfileLayers.atmosphereOpacity,
  atmosphereParallax: character.profileAtmosphereParallax ?? defaultCharacterProfileLayers.atmosphereParallax,
  foregroundImageUrl: character.profileForegroundImageUrl || '',
  foregroundAnchor: character.profileForegroundAnchor ?? defaultCharacterProfileLayers.foregroundAnchor,
  foregroundPositionX: character.profileForegroundPositionX ?? defaultCharacterProfileLayers.foregroundPositionX,
  foregroundPositionY: character.profileForegroundPositionY ?? defaultCharacterProfileLayers.foregroundPositionY,
  foregroundSize: character.profileForegroundSize ?? defaultCharacterProfileLayers.foregroundSize,
  foregroundOpacity: character.profileForegroundOpacity ?? defaultCharacterProfileLayers.foregroundOpacity,
  foregroundParallax: character.profileForegroundParallax ?? defaultCharacterProfileLayers.foregroundParallax,
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

export const resolveStoredCharacterProfile = (
  primary: CharacterProfileCustomizationInput,
  stored: unknown
): CharacterProfileCustomizationInput | null => {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;

  const storedRecord = stored as Record<string, unknown>;
  const merged = Object.fromEntries(
    Object.entries(primary).map(([key, fallback]) => [
      key,
      Object.prototype.hasOwnProperty.call(storedRecord, key) ? storedRecord[key] : fallback
    ])
  ) as Record<string, unknown>;
  const storedVisibility = storedRecord.sectionVisibility;
  if (storedVisibility && typeof storedVisibility === 'object' && !Array.isArray(storedVisibility)) {
    const visibilityRecord = storedVisibility as Record<string, unknown>;
    merged.sectionVisibility = Object.fromEntries(
      Object.entries(primary.sectionVisibility).map(([key, fallback]) => [
        key,
        Object.prototype.hasOwnProperty.call(visibilityRecord, key) ? visibilityRecord[key] : fallback
      ])
    );
  } else {
    merged.sectionVisibility = { ...primary.sectionVisibility };
  }

  merged.isPublic = primary.isPublic;
  const parsed = characterProfileCustomizationSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
};

export const resolveCharacterAlternateProfile = (character: Character): CharacterProfileCustomizationInput | null =>
  resolveStoredCharacterProfile(customizationFromCharacter(character), character.profileAlternateShape);
