import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DynamicCharacterPortrait from './DynamicCharacterPortrait';

const dynamicCharacter = {
  name: 'Nim',
  profileDynamicPortraitEnabled: true,
  profilePortraitBackgroundImageUrl: 'https://images.example.com/forest.webp',
  profilePortraitCutoutImageUrl: 'https://images.example.com/nim.png',
  profilePortraitBackgroundScale: 100,
  profilePortraitBackgroundPositionX: 0,
  profilePortraitBackgroundPositionY: 0,
  profilePortraitCutoutScale: 100,
  profilePortraitCutoutPositionX: 0,
  profilePortraitCutoutPositionY: 0,
  profilePortraitFocusX: 50,
  profilePortraitFocusY: 0
};

describe('DynamicCharacterPortrait', () => {
  it('keeps both portrait layers by default', () => {
    const markup = renderToStaticMarkup(
      <DynamicCharacterPortrait character={dynamicCharacter} fallbackSrc="/fallback.png" alt="Nim" allowDynamic />
    );

    expect(markup).toContain('dynamic-character-portrait-background');
    expect(markup).toContain('dynamic-character-portrait-cutout');
  });

  it('can render only the cutout for Splash profiles', () => {
    const markup = renderToStaticMarkup(
      <DynamicCharacterPortrait character={dynamicCharacter} fallbackSrc="/fallback.png" alt="Nim" allowDynamic hideBackground />
    );

    expect(markup).not.toContain('dynamic-character-portrait-background');
    expect(markup).not.toContain('dynamic-character-portrait-depth');
    expect(markup).toContain('dynamic-character-portrait-cutout');
  });
});
