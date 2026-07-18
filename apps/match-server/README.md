# Match server

Local development uses deliberately insecure development identities:

```powershell
$env:MATCH_SERVER_LOCAL_AUTH='true'; npm --prefix apps/match-server run dev
```

Connect to `ws://localhost:2567`, join room type `match`, and pass `{ accessToken: "local:alice" }`. Health is `GET http://localhost:2567/healthz`.

Production must leave `MATCH_SERVER_LOCAL_AUTH` unset and provide `SUPABASE_URL`; tokens are signature-, issuer-, audience-, and expiry-verified against Supabase JWKS. The in-memory persistence configured by the entrypoint is for the runnable vertical slice only; deployment must inject the Supabase-backed `MatchPersistence` adapter before durable match history can be claimed.
