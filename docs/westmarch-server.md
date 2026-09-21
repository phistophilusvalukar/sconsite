# Westmarch server deployment and operating notes

This checkpoint adds migration `20260917000100_westmarch_events.sql`. It does not deploy to the connected production database.

## Deploy and activate the worker

Apply existing migrations followed by the Westmarch migration through the normal Supabase release process. The browser calls `wm_snapshot()` and `wm_command(p_request_id, p_command)` as the signed-in user. Never expose the service-role key to the browser.

Schedule `public.wm_tick()` once per minute. When Supabase Cron (`pg_cron`) is enabled, an administrator can create the job in SQL:

```sql
select cron.schedule('westmarch-minute', '* * * * *', 'select public.wm_tick()');
```

Create this named job once; inspect existing jobs before deployment to avoid duplicates. Alternatively, a protected server worker can invoke the `wm_tick` RPC with the service-role key. The tick itself is transactional and serialized with player/staff commands, so overlapping calls do not duplicate outcomes, launches, or milestones. It is not executable by anonymous or authenticated browser users.

Monitor worker runs through Supabase Cron history or your worker's monitoring. If processing stops, contributions retain their original completion times. A later tick catches up in time order. New events always start at actual launch time, not a backdated scheduled time. Ordinary commands also catch up due work, but page reads do not replace the scheduled worker.

## Initial-release policy defaults

- Checks use total ≥ effective DC; natural 1/20 do not change the outcome. This provisional policy is deliberately explicit, pending the community's rules decision.
- One action day is 24 elapsed hours. Actions cost 1–168 hours, events last 1–2160 hours, and starts can be booked up to seven days ahead. Players cannot edit a committed roll.
- Modifiers are declared by the player, bounded to −20…100, and displayed in history. They are not verified against imported character sheets.
- Main aid reductions stack. A completed aid track benefits main work completing at or after the unlock time; equal-time aid is processed first. It never lowers aid DCs.
- A paused event keeps all timestamps and its occupied slot. It catches up on resume. Removal voids unfinished work, releases its calendar reservations, and retains completed history.
- Minor FIFO uses approval time and stable event ID. All slots have a 24-hour cooldown; meta events only launch manually. Staff may override cooldowns with a reason.
- Author reward codes identify the registered author; they are not bearer credentials. First approval issues exactly one code. Only admins can record external fulfillment. Cancellation does not silently revoke codes or external awards.
- Reputation amounts/eligibility are not configured. The snapshot intentionally returns an empty awards ledger rather than inventing community rewards.
- Regions are validated text tags in this checkpoint. A normalized region catalog/merge workflow remains a later schema step.
- Existing character rows are reused. Archiving retires an active owned character. A contribution's restrictive foreign key prevents deletion of its character; archival preserves historical identity.
- There is not yet an active-character cap or replacement-character approval policy. Decide this before broad public participation.

## Privacy and audit

Authentication and banned-account checks run on every command and snapshot. Staff authority is stored in the database, separate from site administration. Canonical Westmarch tables expose no direct client reads or writes. Snapshot filtering restricts applications to their author/admin, rewards to their author/admin, and operations logs to staff, with role/reward administration hidden from non-admin staff. Contribution descriptions and roll history are shared with signed-in participants as event activity; full private registry profiles are not serialized.

The initial read model returns the community's full contribution history. Pagination, server-side leaderboard aggregates, and scoped Realtime invalidation should precede large-scale usage. There is no Realtime publication of private canonical tables.

Requests use a caller-created UUID and retain the command payload. Reusing the same UUID with the same command returns the current authorized snapshot without repeating mutation; changing the payload with that UUID fails. Network retries must retain the original UUID. The audit log and staff operations share a transaction. A privileged database administrator can still perform maintenance; browser staff cannot edit or erase log entries.

## Smoke test before enabling public access

Use distinct author, reviewer, administrator, and ordinary-player accounts. Create a miniature event, approve it, verify one minor slot starts and one author code appears, create a real character, and commit a future action. Verify another overlapping booking fails. Exercise pause/resume, cancellation/replacement, manual meta launch, and staff revocation. Confirm the minute worker completes work and resolves events without another player command. Never manipulate production roll totals to run a test; use staging fixtures.
