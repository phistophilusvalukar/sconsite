import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { prototypeCards, prototypeDecks } from "@scon/cards";
import { DeckList, ErrorState, GameCard, GlossaryText, LoadingState, ManaCost, MatchLog } from "../src";

describe("shared UI", () => {
  it("renders textual mana labels", () => expect(renderToStaticMarkup(<ManaCost cost={{ generic: 2, primal: 1 }} />)).toContain("Mana cost: 2 Generic, 1 Primal"));
  it("exposes a card's complete rules", () => { const html = renderToStaticMarkup(<GameCard card={prototypeCards[8]!} />); expect(html).toContain(prototypeCards[8]!.rulesText); expect(html).toContain("power"); });
  it("renders a deck total and every known row", () => { const html = renderToStaticMarkup(<DeckList deck={prototypeDecks[0]!} catalog={prototypeCards} />); expect(html).toContain("30 cards"); expect(html).toContain("Bramble Runner"); });
  it("uses live regions for progress and events", () => { expect(renderToStaticMarkup(<LoadingState />)).toContain("role=\"status\""); expect(renderToStaticMarkup(<MatchLog entries={[{ id: "1", message: "Turn started" }]} />)).toContain("aria-live=\"polite\""); });
  it("announces errors", () => expect(renderToStaticMarkup(<ErrorState message="Connection lost" />)).toContain("role=\"alert\""));
  it("renders canonical terms as accessible tooltip triggers", () => { const html = renderToStaticMarkup(<GlossaryText>A Swift creature is ready to attack from beside a Font.</GlossaryText>); expect(html.match(/aria-expanded/g)).toHaveLength(3); expect(html).toContain("Swift"); });
});
