import { prototypeCards, prototypeDecks, validateCardSet, validateDeck } from "../src/index";

const cards = validateCardSet(prototypeCards);
if (!cards.ok) {
  console.error("Prototype card validation failed", cards.issues);
  process.exitCode = 1;
} else {
  for (const deck of prototypeDecks) {
    const result = validateDeck(deck, cards.value);
    if (!result.ok) {
      console.error(`Deck ${deck.id} is illegal`, result.issues);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log(`Validated ${cards.value.length} cards and ${prototypeDecks.length} decks.`);
}
