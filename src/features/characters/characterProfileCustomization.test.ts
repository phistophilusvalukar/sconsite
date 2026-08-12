import { describe, expect, it } from 'vitest';
import {
  characterProfileCustomizationSchema,
  defaultCharacterProfileSectionVisibility
} from './characterProfileCustomization';

const validProfile = {
  subtitle: 'Cartographer of impossible roads',
  fontFamily: 'cormorant' as const,
  fontColor: '#f4efe6',
  baseColor: '#18201f',
  accentColor: '#c9954a',
  bannerImageUrl: '',
  dynamicPortraitEnabled: false,
  portraitBackgroundImageUrl: '',
  portraitCutoutImageUrl: '',
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
  });
});
