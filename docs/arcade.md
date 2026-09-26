# Retro Arcade

Standalone route: `/arcade` (including trailing slash). No site header, footer, page-visibility gate, or admin Basic Auth. The existing Discord/Supabase session opens the library; login returns to `/arcade`. Site-wide account bans still apply.

X8, X16, and X64 have separate palettes and original inline SVG artwork: monochrome pixels, colorful pixels, and polygon shapes respectively. Each has three concept cartridges. Selecting a cartridge shows its description; all launch buttons are disabled and marked coming soon. No games, scores, or canonical game state are implemented yet.

Edit `src/features/arcade/catalog.ts` to change consoles and placeholder games. Artwork provenance is recorded in `arcadeAssetManifest` in that file. All current images are project-owned placeholders drawn in SVG/CSS; no external media or fonts are loaded.

Future playable games must validate network data and process authoritative commands behind protected server APIs. The current login screen is UI gating, not a substitute for server authorization.
