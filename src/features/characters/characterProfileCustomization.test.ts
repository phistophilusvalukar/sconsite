import { describe, expect, it } from 'vitest';
import {
  characterProfileCustomizationSchema,
  defaultCharacterProfileSectionVisibility
} from './characterProfileCustomization';

const validProfile = {
  subtitle: 'Cartographer of impossible roads',
  titleFontFamily: 'metal-mania' as const,
  subtitleFontFamily: 'cinzel' as const,
  fontFamily: 'cormorant' as const,
  titleFontSize: 124,
  subtitleFontSize: 22,
  textFontSize: 16,
  borderTheme: 'runes' as const,
  backgroundTheme: 'arcane' as const,
  borderColorSource: 'accent' as const,
  backgroundColorSource: 'base' as const,
  fontColor: '#f4efe6',
  baseColor: '#18201f',
  accentColor: '#c9954a',
  backgroundMode: 'solid' as const,
  gradientColor: '#27302d',
  gradientOrientation: 'diagonal' as const,
  gradientTransitionRate: 100,
  bannerImageUrl: '',
  dynamicPortraitEnabled: false,
  portraitBackgroundImageUrl: '',
  portraitCutoutImageUrl: '',
  portraitFocusX: 50,
  portraitFocusY: 0,
  layoutStyle: 'chronicle' as const,
  sectionVisibility: { ...defaultCharacterProfileSectionVisibility }
};

describe('character profile customization', () => {
  it('accepts a complete profile presentation', () => {
    expect(characterProfileCustomizationSchema.safeParse(validProfile).success).toBe(true);
  });

  it('rejects unsafe colors and incomplete visibility settings', () => {
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, baseColor: 'red' }).success).toBe(false);
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

  it('validates independent title, subtitle, and text sizes', () => {
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, textFontSize: 26 }).success).toBe(true);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, titleFontSize: 181 }).success).toBe(false);
    expect(characterProfileCustomizationSchema.safeParse({ ...validProfile, subtitleFontSize: 13 }).success).toBe(false);
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
});
