import { describe, expect, it } from 'vitest';
import { carouselOffset, wrapCarouselIndex } from './catalog';

describe('arcade cartridge carousel', () => {
  it('wraps continuously in either direction', () => {
    expect(wrapCarouselIndex(-1, 3)).toBe(2);
    expect(wrapCarouselIndex(3, 3)).toBe(0);
  });

  it('places neighboring cartridges on opposite sides of the selection', () => {
    expect(carouselOffset(2, 0, 3)).toBe(-1);
    expect(carouselOffset(1, 0, 3)).toBe(1);
    expect(carouselOffset(0, 0, 3)).toBe(0);
  });
});
