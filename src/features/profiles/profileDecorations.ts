// Legacy values remain readable so existing saved profiles continue to validate.
// The page customizers no longer expose or render decorative image themes.
export const profileDecorationThemeValues = [
  'none',
  'fire',
  'ice',
  'earth',
  'water',
  'wood',
  'metal',
  'air',
  'electricity',
  'void',
  'vitality',
  'alchemy',
  'knights',
  'dragons',
  'pirates',
  'cats',
  'skulls',
  'arcane',
  'runes',
  'axes',
  'swords',
  'flintlocks',
  'daggers'
] as const;

export type ProfileDecorationTheme = typeof profileDecorationThemeValues[number];
export type ProfileDecorationColorSource = 'base' | 'accent';

export const defaultProfileDecorations = {
  borderTheme: 'none' as ProfileDecorationTheme,
  backgroundTheme: 'none' as ProfileDecorationTheme,
  borderColorSource: 'accent' as ProfileDecorationColorSource,
  backgroundColorSource: 'base' as ProfileDecorationColorSource
};
