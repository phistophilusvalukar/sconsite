import { describe, expect, it } from 'vitest';
import { getProfileDecorationStyle, profileDecorationThemes } from './profileDecorations';

describe('profile decorations', () => {
  it('provides a complete background and border treatment for every motif', () => {
    for (const theme of profileDecorationThemes) {
      const style = getProfileDecorationStyle(theme.value, theme.value, '#112233', '#445566', '#f4f1eb') as unknown as Record<string, string>;
      expect(style['--profile-border-image']).toBeTruthy();
      expect(style['--profile-background-pattern']).toBeTruthy();
      expect(Object.values(style).join(' ')).not.toContain('undefined');
    }
  });

  it('uses purpose-built artwork for every named motif', () => {
    for (const theme of profileDecorationThemes.filter(theme => theme.value !== 'none')) {
      const style = getProfileDecorationStyle(theme.value, theme.value, '#112233', '#445566', '#f4f1eb') as unknown as Record<string, string>;
      expect(style['--profile-border-image']).toContain(`/assets/profile-decorations/${theme.value}-v1.webp`);
      expect(style['--profile-background-pattern']).toContain(`/assets/profile-decorations/${theme.value}-v1.webp`);
      expect(style['--profile-border-image']).not.toContain('gradient');
      expect(style['--profile-background-pattern']).not.toContain('gradient');
    }
  });
});
