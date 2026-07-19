# Security model

## Trust boundaries

Browsers, display names, deck names, commands, sequence numbers, targets, and claimed state are hostile. Only protected Supabase server-side processing may update canonical state or use service credentials. Supabase anon credentials may ship to the browser; service-role credentials may not.

## Controls

- Verify Supabase JWTs server-side and bind users to one player seat.
- Validate wire payloads, cap serialized size, rate-limit commands, require monotonic sequence numbers, and cache idempotency keys.
- Recompute legality, targets, costs, life, zones, and timers server-side.
- Project per-player views: own private cards, opponent counts/backs only.
- Sanitize user-authored names and redact tokens/private card data from logs.
- Persist accepted commands/events and immutable result snapshots through server-only APIs.
- RLS limits decks/settings/collections to owners; event logs and authoritative writes require server privileges.

## Residual risks

Operational rate limiting, secret rotation, dependency auditing, replay retention, abuse monitoring, and production TLS/origin policy require deployment configuration and review.
