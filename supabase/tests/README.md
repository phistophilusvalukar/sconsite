# Dungeon Relay special cards

The special-card migration applies to newly started runs. Existing runs retain their original decks. Apply `20260909000100_dungeon_relay_class_specials.sql` before deploying the updated client.

Every new deck has 60 cards: 15 doubles (three per color), three triples in the class's color, the specials below, and enough singles to reach 60. Non-class colors each have eight singles; the class color has seven, eight, or nine singles for classes with three, two, or one special respectively. Existing class powers remain available.

| Class | Triple color | Special copies | Effect |
| --- | --- | ---: | --- |
| Champion | Yellow shields | 1 | Defeat a Mini-Boss or Boss |
| Witch | Blue staves | 2 | Cancel an Event, or draw 2 outside an Event |
| Barbarian, Swashbuckler | Red swords | 3 | Defeat a Person |
| Wizard | Blue staves | 3 | Another surviving player draws 3 |
| Rogue, Investigator | Purple daggers | 3 | Choose any three symbols, including repeats |
| Cleric | Yellow shields | 3 | Share half the deck and revive the recipient, or all other surviving players draw 2 |
| Ranger | Green arrows | 3 | Defeat a Beast |
| Alchemist | Green arrows | 3 | One symbol of each color |

Cleric donations round down, take cards from the top of the donor's deck, and append them in order to the recipient's deck. A dead recipient revives immediately and draws up to five donated cards; even a one-card donation revives them. Zero-card donations are rejected without spending the special. Subsequent draws follow the existing deck-exhaustion rule.

Special cards travel with their effects when hands or decks change owners. The triple-color restriction applies to starting deck construction. Played specials enter the graveyard with other played cards at round end; specials discarded to pay a class power or event remain recoverable under the existing discard rules. Cancelling an event prevents its remaining effects, but does not refund cards already voluntarily played or discarded.

For discard events, Wild Three counts as a multi-symbol card. All Colors counts as both a multi-symbol card and a shield card. Other specials have no printed matching symbols. Bonus draws reopen the recipient's event confirmation so new eligible cards cannot bypass the event.

## PostgreSQL integration tests

Use a **fresh disposable PostgreSQL database**. The bootstrap creates minimal dependencies and an `authenticated` role; it is a test fixture, not a production migration. Pass your disposable connection options to each `psql` call and use `-v ON_ERROR_STOP=1`.

Apply these files in order:

1. `supabase/tests/dungeon_relay_bootstrap.sql`
2. `supabase/migrations/20260908000200_dungeon_relay_prototype.sql`
3. `supabase/migrations/20260908000300_dungeon_relay_special_cards.sql`
4. `supabase/migrations/20260908000400_dungeon_relay_classes.sql`
5. `supabase/migrations/20260908000500_dungeon_relay_run_timer.sql`
6. `supabase/migrations/20260909000100_dungeon_relay_class_specials.sql`
7. `supabase/tests/dungeon_relay_specials.sql`

The assertion suite rolls back its match fixtures. It checks deck composition for every class, every special effect, ownership and target validation, wildcard allocation, normal-card combinations, revival, conservation of cards, event confirmations, existing class-power costs, timer lockouts, boss victory, and snapshot privacy.
