export const EMPTY_GLYPH_ID = 'empty-slot';

export function isEmptyGlyphId(glyphId: string | null | undefined): glyphId is null | undefined | '' | typeof EMPTY_GLYPH_ID {
  return !glyphId || glyphId === EMPTY_GLYPH_ID;
}
