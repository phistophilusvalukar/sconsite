import { describe, expect, it } from 'vitest';
import {
  characterLayoutOptions,
  characterProfileCustomizationSchema,
  defaultCharacterProfileSectionVisibility,
  resolveStoredCharacterProfile
} from './characterProfileCustomization';

const validProfile = {
  isPublic: false,
  subtitle: 'Cartographer of impossible roads',
  titleFontFamily: 'metal-mania' as const,
  subtitleFontFamily: 'cinzel' as const,
  fontFamily: 'cormorant' as const,
  accentFontFamily: 'press-start-2p' as const,
  titleFontSize: 124,
  subtitleFontSize: 22,
  textFontSize: 16,
  accentFontSize: 13,
  themeMode: 'dark' as const,
  borderTheme: 'runes' as const,
  backgroundTheme: 'arcane' as const,
  borderColorSource: 'accent' as const,
  backgroundColorSource: 'base' as const,
  fontColor: '#f4efe6',
  baseColor: '#18201f',
  accentColor: '#c9954a',
  buttonTextColor: '#111615',
  backgroundMode: 'solid' as const,
  gradientColor: '#27302d',
  gradientOrientation: 'diagonal' as const,
  gradientTransitionRate: 100,
  bannerImageUrl: '',
  portraitImageUrl: '',
  dynamicPortraitEnabled: false,
  portraitBackgroundImageUrl: '',
  portraitCutoutImageUrl: '',
  portraitBackgroundScale: 100,
  portraitBackgroundPositionX: 0,
  portraitBackgroundPositionY: 0,
  portraitCutoutScale: 100,
  portraitCutoutPositionX: 0,
  portraitCutoutPositionY: 0,
  portraitFocusX: 50,
  portraitFocusY: 0,
  layoutStyle: 'chronicle' as const,
  sectionVisibility: { ...defaultCharacterProfileSectionVisibility }
};

describe('character profile customization', () => {
  it('presents the persisted nostalgia layout as Minimal', () => {
    expect(characterLayoutOptions.find(option => option.value === 'nostalgia')).toMatchObject({
      label: 'Minimal'
    });
  });

  it('accepts a complete profile presentation', () => {
    expect(characterProfileCustomizationSchema.safeParse(validProfile).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, themeMode: 'light' }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, themeMode: 'sepia' }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, layoutStyle: 'cyberpunk' }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, layoutStyle: 'nostalgia' }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, fontFamily: 'press-start-2p' }).success).toBe(true);
  });

  it('accepts an independently configured alternate shape', () => {
    const alternate = {
      ...validProfile,
      subtitle: 'The beast beneath the skin',
      layoutStyle: 'spotlight',
      accentColor: '#8b1e2d',
      dynamicPortraitEnabled: true,
      portraitBackgroundImageUrl: 'https://images.example.com/moon.webp',
      portraitCutoutImageUrl: 'https://images.example.com/beast.webp'
    } as const;
    expect(characterProfileCustomizationSchema.safeParse(alternate).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...alternate, accentColor: 'blood-red' }).success).toBe(false);
  });

  it('fills newer presentation fields when reading a legacy alternate shape', () => {
    const legacyAlternate = {
      subtitle: 'The beast beneath the skin',
      portraitImageUrl: 'https://images.example.com/beast.webp',
      sectionVisibility: { portrait: true, details: false }
    };
    const resolved = resolveStoredCharacterProfile({ ...validProfile, isPublic: true }, legacyAlternate);

    expect(resolved).toMatchObject({
      isPublic: true,
      subtitle: legacyAlternate.subtitle,
      portraitImageUrl: legacyAlternate.portraitImageUrl,
      accentFontFamily: validProfile.accentFontFamily,
      themeMode: validProfile.themeMode,
      sectionVisibility: {
        portrait: true,
        details: false,
        journal: true,
        relationships: true
      }
    });
  });

  it('requires an explicit public visibility setting', () => {
    const { isPublic: _isPublic, ...missingVisibility } = validProfile;
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, isPublic: true }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse(missingVisibility).success).toBe(false);
  });

  it('rejects unsafe colors and incomplete visibility settings', () => {
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, baseColor: 'red' }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, buttonTextColor: 'white' }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      sectionVisibility: { portrait: true }
    }).success).toBe(false);
  });

  it('validates dual-color gradient direction and transition rate', () => {
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      backgroundMode: 'gradient',
      gradientOrientation: 'vertical',
      gradientTransitionRate: 0
    }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, gradientTransitionRate: 101 }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, gradientOrientation: 'radial' }).success).toBe(false);
  });

  it('validates independent title, subtitle, text, and accent sizes', () => {
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, textFontSize: 26 }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, titleFontSize: 181 }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, subtitleFontSize: 13 }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, accentFontSize: 29 }).success).toBe(false);
  });

  it('validates fantasy decoration themes and their palette sources', () => {
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, borderTheme: 'dragons', backgroundTheme: 'fire' }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, borderTheme: 'laser-beams' }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, backgroundColorSource: 'custom' }).success).toBe(false);
  });

  it('accepts dramatic fonts and requires HTTPS banner artwork', () => {
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      fontFamily: 'uncial',
      layoutStyle: 'saga',
      bannerImageUrl: 'https://images.example.com/hero.webp'
    }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      bannerImageUrl: 'javascript:alert(1)'
    }).success).toBe(false);
  });

  it('accepts a standard HTTPS portrait without Dynamic Portrait mode', () => {
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      portraitImageUrl: 'https://images.example.com/alternate-form.webp',
      dynamicPortraitEnabled: false
    }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, portraitImageUrl: 'data:image/png;base64,nope' }).success).toBe(false);
  });

  it('supports the themed font collections and validates complete Dynamic Portraits', () => {
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      fontFamily: 'metal-mania',
      dynamicPortraitEnabled: true,
      portraitBackgroundImageUrl: 'https://images.example.com/ruins.webp',
      portraitCutoutImageUrl: 'https://images.example.com/ranger.png'
    }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      fontFamily: 'mystery-quest',
      dynamicPortraitEnabled: true,
      portraitBackgroundImageUrl: 'https://images.example.com/ruins.webp'
    }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      portraitFocusY: 140
    }).success).toBe(false);
  });

  it('validates independent Dynamic Portrait layer placement', () => {
    expect(characterProfileCustomizationSchema.safeParse({
      ...validProfile,
      portraitBackgroundScale: 175,
      portraitBackgroundPositionX: -20,
      portraitCutoutScale: 85,
      portraitCutoutPositionY: 30
    }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, portraitBackgroundScale: 251 }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, portraitCutoutPositionX: -51 }).success).toBe(false);
  });
});
