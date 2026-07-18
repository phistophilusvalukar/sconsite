import type { DeckDefinition } from "./schema";

const entries = (cards: ReadonlyArray<readonly [string, number]>): DeckDefinition["cards"] => cards.map(([cardId, count]) => ({ cardId, version: 1, count }));
export const prototypeDecks: readonly DeckDefinition[] = [
  { id: "thorns-and-thunder", version: 1, name: "Thorns & Thunder", format: "prototype-30", cards: entries([
    ["emberwell-font", 3], ["rootsong-font", 3], ["wayfarer-font", 2], ["bramble-runner", 3], ["cinder-tusk", 3], ["mossback-guardian", 2], ["storm-claw", 2], ["forgepath-scout", 2], ["spark-lance", 3], ["wild-renewal", 2], ["canopy-fury", 1], ["emberedge", 2], ["thunderseed-flask", 2],
  ]) },
  { id: "light-behind-the-veil", version: 1, name: "Light Behind the Veil", format: "prototype-30", cards: entries([
    ["sunward-font", 3], ["whisper-font", 3], ["mercy-font", 2], ["lantern-acolyte", 3], ["veil-confessor", 3], ["dawnshield-sentinel", 2], ["memory-moth", 2], ["grave-orchid-keeper", 2], ["gentle-radiance", 3], ["thought-fracture", 2], ["hymn-of-returning-light", 1], ["sun-thread-charm", 2], ["saintglass-vial", 2],
  ]) },
];
