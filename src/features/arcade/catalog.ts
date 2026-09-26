export type ConsoleId = 'x8' | 'x16' | 'x64';
export const consoles = [
  { id: 'x8', name: 'X8', bits: 8, label: 'THE POCKET ERA', description: 'Small screen. Endless possibilities.', detail: '4 shades / pixel worlds', games: [
    { name: 'MOON MAIL', genre: 'Exploration', art: 'moon', description: 'A tiny courier. A very big moon. A delivery worth taking the long way for.' },
    { name: 'MOSS HOLLOW', genre: 'Adventure', art: 'forest', description: 'Follow the little lights into a forest full of forgotten paths.' },
    { name: 'BLOCK SIGNAL', genre: 'Puzzle', art: 'blocks', description: 'Find the pattern. Clear the noise. Make a connection.' },
  ] },
  { id: 'x16', name: 'X16', bits: 16, label: 'THE ELECTRIC ERA', description: 'More color. More attitude.', detail: 'Vivid palettes / layered pixels', games: [
    { name: 'NEON COURIER', genre: 'Action', art: 'moon', description: 'One last delivery across a city that never powers down.' },
    { name: 'EMBER GROVE', genre: 'Adventure', art: 'forest', description: 'Chase a wandering spark through a world painted in twilight.' },
    { name: 'STATIC SHIFT', genre: 'Puzzle', art: 'blocks', description: 'Remix a restless grid, one colorful chain reaction at a time.' },
  ] },
  { id: 'x64', name: 'X64', bits: 64, label: 'THE POLYGON ERA', description: 'A whole new dimension.', detail: 'Low polygons / wide horizons', games: [
    { name: 'ORBIT POST', genre: 'Exploration', art: 'moon', description: 'Hop between quiet little planets at the edge of the star map.' },
    { name: 'FRAGMENT ISLE', genre: 'Adventure', art: 'forest', description: 'An island in the clouds. A world waiting to be pieced together.' },
    { name: 'PRISM CIRCUIT', genre: 'Puzzle', art: 'blocks', description: 'Turn a maze of floating shapes into one perfect circuit.' },
  ] },
] as const;

// Original inline SVG/CSS artwork. No third-party media or console trademarks.
export const arcadeAssetManifest = {
  source: 'Original artwork authored for SCON Retro Arcade',
  license: 'Project-owned',
  placeholder: true,
  assets: ['moon', 'forest', 'blocks', 'console-silhouettes'],
} as const;
