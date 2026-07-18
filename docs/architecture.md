# Architecture

The browser is an untrusted presentation client. React owns navigation, deck/collection UI, settings, and accessible overlays. Phaser renders match presentation from server snapshots and resolved events. The Colyseus match server verifies identity, orders and validates commands, invokes the pure rules engine, filters hidden information, and persists results/event logs through repository interfaces backed by Supabase.

Package dependency direction is `web/renderer/server -> protocol/cards/rules`; rules has no browser, React, Phaser, Colyseus, database, or network imports. Cards are declarative validated data. Protocol owns versioned wire schemas. Database owns persistence adapters and generated types.

The initial local mode uses the same command reducer in-process, allowing a playable slice before credentials are configured. Online mode replaces only the transport. Canonical state always belongs to rules/server, never renderer state.

Replays store initial deck versions, seed, rules/schema versions, accepted commands, resolved events, and result. Private views reveal the viewer's hand and only opponent zone counts.
