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
  surfaceColor: '#1d2321',
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
});
