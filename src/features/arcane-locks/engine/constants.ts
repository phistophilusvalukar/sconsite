export const EMPTY_GLYPH_ID = 'empty-slot';

export function isEmptyGlyphId(glyphId: string | null | undefined) {
  return !glyphId || glyphId === EMPTY_GLYPH_ID;
}
