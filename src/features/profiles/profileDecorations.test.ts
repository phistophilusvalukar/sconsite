import { describe, expect, it } from 'vitest';
import { defaultProfileDecorations, profileDecorationThemeValues } from './profileDecorations';

describe('profile decorations', () => {
  it('keeps decorative imagery disabled by default', () => {
    expect(defaultProfileDecorations.borderTheme).toBe('none');
    expect(defaultProfileDecorations.backgroundTheme).toBe('none');
  });

  it('retains legacy theme values for persisted profile compatibility', () => {
    expect(profileDecorationThemeValues).toContain('dragons');
    expect(profileDecorationThemeValues).toContain('runes');
  });
});
