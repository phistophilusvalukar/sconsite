# Retro Arcade

Standalone route: `/arcade` (including trailing slash). No site header, footer, page-visibility gate, or admin Basic Auth. The existing Discord/Supabase session opens the library; login returns to `/arcade`. Site-wide account bans still apply.

X8, X16, and X64 share a monochrome terminal interface and use distinct CSS cartridge shells. The cartridge shelf supports pointer/touch swipes, arrow keys, on-screen arrows, direct selection, and continuous wraparound. Each system has three concept cartridges. Selecting a cartridge shows its description; all launch buttons are disabled and marked coming soon. No games, scores, or canonical game state are implemented yet.

Edit `src/features/arcade/catalog.ts` to change consoles and placeholder games. Artwork provenance is recorded in `arcadeAssetManifest` in that file. All current cartridge and console visuals are project-owned CSS shapes. Departure Mono 1.500 is bundled locally from its official repository under the SIL Open Font License 1.1; exact provenance is recorded beside the font asset. The interface takes general inspiration from Analogue 3D and the MIT-licensed A3D Manager's cartridge-library concepts; no third-party artwork or source code is copied.

Future playable games must validate network data and process authoritative commands behind protected server APIs. The current login screen is UI gating, not a substitute for server authorization.
