# Westmarch community events — implementation plan

Status: planning only. No feature implementation or deployment is authorized by this document alone. Confirmed requirements come from the design conversation; recommended defaults below remain proposals where the conversation left a choice open.

## 1. Purpose and scope

Build a standalone, account-connected community event experience. Players create lightweight versions of real registry characters, allocate those characters' time across events, roll on the website in advance, and collectively determine regional outcomes. Authors submit events for approval by an admin or Event Staff member and receive a creator reward code. Regional reputation and contribution leaderboards recognize participation. Players can apply for Event Staff; only admins approve or revoke that role.

Use the existing Supabase accounts and Discord login. There is no new account system, no main-navigation entry, and no separate navigation menu. Contextual links and task buttons connect pages. Discord links can be the primary entry point. Discord announcements are optional; Pf2ooler and a Discord listener are no longer dependencies.

Existing project findings:

- `src/App.tsx` already supports layouts without the standard site header and footer.
- The existing `/event` route has an unrelated rules/tutorial page; preserve it.
- `src/types/database.ts` and `src/services/characterService.ts` already support ancestry, heritage, primary/secondary classes, levels, character status, profiles, and Foundry data.
- Existing character profile routes are gated by registry visibility. New event-context profiles must work even while the full registry remains hidden, without bypassing character privacy settings.
- Extend existing character records rather than duplicating them. Audit current creation, deletion, ownership, and import behavior before migrations.

## 2. Pages and access

Proposed routes:

| Route | Purpose |
| --- | --- |
| `/westmarch` | Five minor-event slots, one meta slot, cooldowns, and active event cards |
| `/westmarch/events/:eventId` | Event story, actions, progress, aid tracks, contributors, outcome |
| `/westmarch/characters` | Manage the player's real characters using a compact form |
| `/westmarch/characters/:characterId` | Event-context profile using the existing character identity and privacy rules |
| `/westmarch/schedule` | Character schedule and contribution planning |
| `/westmarch/leaderboards` | Regional Fame and contribution rankings |
| `/westmarch/submissions` | Author's drafts, review status, queue placement, reward codes |
| `/westmarch/submissions/new` | Event authoring form |
| `/westmarch/staff/apply` | Event Staff application and the applicant's review status |
| `/westmarch/controls` | Event Controls for admins and Event Staff: review, slots, meta events, and lifecycle actions |
| `/westmarch/log` | Searchable event operations log for admins and Event Staff |
| `/westmarch/admin` | Admin-only staff applications, role grants/revocations, and reward policy administration |

Use a shared standalone layout, direct-link login, and return-to-page behavior. Desktop and mobile layouts must both work. In-page actions such as Plan contribution, Manage characters, View local Fame, and Return to event replace navigation menus.

Recommended access default: signed-in members can read published events and participate; authors see their own drafts and reward codes; Event Staff and admins see event moderation tools; only admins manage staff roles and reward policy. Applicants see their own application/status; admins see applications and private review notes. Make public event reading and a redacted player-facing operations log explicit later choices. Page visibility is not authorization: enforce ownership and role checks server-side. Preserve banned-account restrictions.

## 3. Real characters, minimal onboarding

Required mini-form data: name, ancestry, heritage where applicable, class or classes, and level. Support existing primary/secondary class fields; do not introduce arbitrary multiclass semantics. Images, backstory, background, and Foundry JSON are not prerequisites for participation.

List existing owned characters first so established players do not create duplicates. New characters immediately receive real IDs and profile pages. Later Foundry imports enrich that same character rather than creating a second record. Preserve existing profile privacy and unrelated data during compact-form edits.

Players may create, edit, level up, retire, or remove characters. Characters with contribution history should be archived rather than physically erased; only unused records are candidates for permanent deletion after checking other dependencies. Historical records retain their identity and the name/level snapshot used for the action. Retirement does not cancel rolled commitments or clear time reservations. Character edits affect future commitments only.

Open policy: maximum active participating characters per player and eligibility for newly created replacements. Unlimited new characters can evade the intent of per-character scheduling; solve this through an explicit server rule rather than unreliable name matching.

## 4. Event authoring and review

An event contains:

- Title, minor/meta classification, region, and author.
- Requester/NPC, location description, problem, stakes, and introduction.
- Duration measured from activation, success target percentage, and minimum completed main checks.
- Positive and negative outcome text.
- One or more main actions, each with permitted skills/checks, time cost, and difficulty adjustment.
- Zero or more independent aid actions, each with permitted skills/checks, time cost, difficulty adjustment, required successful completions, and main-DC reduction.
- Participant reward policy selected from admin-controlled options.
- Optional per-character action repetition limits.

Perception must be supported even though it is not technically a PF2e skill. Use canonical check identifiers for leaderboard aggregation; handle Lore categories deliberately. Author text never executes code. Validate all authoring and command data with Zod and enforce the same constraints in protected server operations.

Use searchable region records with stable IDs, display names, descriptions, and optional GM/setting attribution. Authors can propose new regions; admins resolve duplicates during approval. Renaming a region must not break reputation history.

Lifecycle: draft → submitted → approved/queued → active → completed. Review can return a submission for changes or reject it. Record success, failure, insufficient participation, or admin cancellation separately from lifecycle status. Authors can withdraw unstarted events under a defined policy.

Admins or Event Staff review narrative suitability, skills, duration, aid stacking, reward policy, and thresholds. Event Staff may approve other authors' events; recommend enforcing no self-approval for all reviewers, with any admin override explicitly reasoned and logged. Staff approval triggers only the configured creator reward, not arbitrary reward issuance. Material edits after approval require a new review and suspend launch eligibility. Active action rules are versioned and normally locked; emergency changes require an audit record and an explicit impact policy for booked work.

## 5. Slots and activation

Maintain five minor slots and one meta slot. A minor slot automatically takes the next eligible approved minor event. Recommended queue order is approval timestamp with a stable ID tie-breaker; the user has requested FIFO, but approval versus submission order still needs confirmation.

A slot enters a 24-hour cooldown when its event ends. Its next event starts only after that cooldown. A free slot with no queued event stays free; a later approval may fill it immediately. Queue positions can be shown, but activation estimates are not guaranteed dates.

Meta events have their own approved pool. Admins or Event Staff choose when to activate one in the single meta slot. Recommended interpretation: the meta slot also has a 24-hour cooldown, and never starts automatically. Staff may explicitly bypass an empty slot's cooldown using the controls described in section 16. Confirm the ordinary meta cooldown interpretation.

Set event start/deadline on actual activation. Scheduling is allowed only for active events, not events whose queue position implies an uncertain future start. Do not backdate the start of a newly activated event after service downtime.

Slot claims and activation must be transactional so concurrent workers cannot exceed capacity or start an event twice. Staff cancellation closes an occupied slot and starts its cooldown by default; explicit replacement and fire-now operations can override that cooldown with a recorded reason. FIFO governs automatic starts; logged staff overrides may select a different approved event.

## 6. Shared character time

Event creators define durations per action, in hours or days. Recommended interpretation: one day occupies 24 elapsed hours, with a one-hour minimum/granularity initially. Weekly planning is a view of real time, not a resetting allowance of attempts.

Every character has one schedule across all minor and meta events. Reservations cannot overlap. Adjacent reservations are allowed: one action may start exactly when another ends. Different characters have independent schedules.

Players may allocate a full week at once or book only part of it. Support multi-day actions and a rolling seven-day planning view, with adjacent dates available for actions crossing the view boundary. Recommended initial booking horizon is seven days ahead for action start times. Work must start at or after commitment and finish on or before the event deadline; no backdating or scheduling into the past.

Example: farmer aid occupies day 1, fishing occupies days 2–3, bakery aid occupies day 4, tavern performance occupies days 5–7. If each selection is a single multi-day action, that produces four rolls, not seven. Repeating a shorter action is a separate reservation and roll, subject to configured limits.

Draft plans reserve nothing. On confirmation, the server atomically validates and commits the entire submitted batch. Conflicting or stale plans fail before generating visible rolls. Generate and persist one roll for each committed action. A retry with the same request ID returns the same reservations and rolls.

After seeing a roll, the player cannot cancel, move, edit, or replace that contribution. This prevents rerolling failures or selectively moving promising work after seeing results. Uncommitted drafts remain freely editable. Admin cancellation of an event should release its unfinished reservations and void those pending contributions; keep completed history and an audit record. Ordinary player retirement does not release reservations.

Persist timestamps in UTC. Display the player's timezone and exact dates/times; explain that day means 24 hours, including across daylight-saving transitions.

## 7. Server rolls and check rules

For each action the player supplies a permitted check, their modifier, and a brief description. The server verifies character ownership/eligibility, event/action validity, schedule, modifier bounds, and rate limits before rolling.

Generate unpredictable randomness on the server, store the resulting d20, and pass that recorded value into deterministic rule evaluation. Never use client randomness or `Math.random` in the rules package. Replaying a contribution uses its stored die and rules version; it never generates another die.

Snapshot character level, check, modifier, action definition, and base DC at commitment. Level changes and Foundry imports cannot rewrite an existing roll.

Main effective DC = versioned level-based DC + action difficulty adjustment − aid reductions applicable at completion. Aid checks use their own level-based DC and difficulty adjustment; recommended default is that aid does not lower other aid DCs.

Before implementation, verify and document the chosen PF2e level DC table and natural 1/20/degree-of-success rules from a primary rules source. Decision required: full PF2e degrees or simple total-versus-DC. Recommended policy is PF2e degrees, with success/critical success each counting as one successful check, and failure/critical failure each counting as one failed check. Do not silently add double-progress criticals.

Modifiers are player declarations in this release, not verified character statistics. Display the breakdown and provide staff review tools. No automated semantic judgement of free-text roleplay is required for launch. Event authors define accepted approaches; staff can flag abuse and make audited corrections.

## 8. Stacked aid and delayed outcomes

Every aid action is an independent track. Example: Perception 20 successes grants −2 main DC; Nature 15 grants −2; Occultism 10 grants −2. All three complete for a total −6. A track grants its bonus once, regardless of excess successes. Failed aid attempts consume time and count in individual statistics but do not advance the threshold or the main outcome percentage.

Players see rolls immediately. Work contributes to the event only at its scheduled completion. Aid success advances a track at its own completion, not when rolled. Finalized main outcomes use milestones unlocked on or before their completion time, including the same timestamp.

Pending displays:

- Success — pending completion: currently succeeds with unlocked aid.
- Has Potential: currently fails, but remaining configured aid benefits could make the recorded roll succeed.
- Failure — pending completion: cannot succeed even if all remaining configured aid benefits unlock.
- Completed: finalized success/failure, with the recorded degree where applicable.

Potential evaluation must use the selected check rules, not just arithmetic margin, particularly if natural 1/20 adjustments apply. It is an optimistic possibility, not a promise that enough aid is scheduled or will succeed. Show the remaining benefit needed and total available benefit.

An aid unlock updates pending previews. Completed outcomes never change solely because later aid completes. Previews should respect logical completion times even if a background worker is delayed.

## 9. Completion ordering and the event outcome

Resolve due work in chronological logical-time order, independent of worker arrival order. For each timestamp: complete aid checks, unlock newly met milestones, then finalize main checks. At an event deadline, complete all work due at that time before resolving the event. Aid completed after a main action cannot retroactively help it, even if the worker processes both during one catch-up run.

Main success percentage = completed successful main checks / all completed main checks. Aid checks and pending contributions are excluded. Every completed main check has equal weight unless a future explicit design changes that rule.

The green/red bar shows success/failure proportions with counts and a target marker. Before any main completion, show No completed contributions. During the event show Currently meeting target or Below target; do not end early just because the target is temporarily met.

At the deadline, positive outcome requires the exact target percentage and configured minimum completed main checks. Use exact comparisons rather than rounded UI percentages. No checks or too few checks yield insufficient participation and no positive outcome under the recommended default. The author provides the corresponding consequence text or a fallback.

Finalize the outcome, contributor credits, reputation awards, and slot cooldown exactly once. Show completed contributor credits and distinguish attempts from successful work. Optional scheduled Discord announcements are a separate delivery step; failed notification delivery must not undo the outcome or grant rewards again.

## 10. Participant reputation and creator rewards

Recommended reputation model, pending confirmation: Notoriety is the awarded quantity; local Fame is a character's accumulated Notoriety in a region. Store an append-only award ledger with character, player, region, event, amount, reason, and unique award source. Support explicit reversal entries for corrections.

Unsettled participant policy: award amounts, whether valid unsuccessful helpers earn anything on a successful event, whether failed events award participation, and per-event caps. Use admin-defined reward policies, snapshot them at approval, and show eligibility before booking. Do not let authors select unlimited rewards.

Issue a creator reward code on the event's first approval. Tie it to the author, event, approved reward policy, and issuance time. Reapproval, revision, and retries must not issue another reward. Keep creator rewards separate from character reputation unless explicitly configured otherwise.

Initial redemption: author copies a code and formatted message to Discord; authorized staff look it up on the site, verify the claimant's linked identity, award externally, and mark redeemed. A posted code is a reference, not a bearer credential. Record reviewer, timestamps, and delivery reference. Because external rewards and database updates are not one transaction, track pending/fulfilled status and reconciliation rather than claiming exactly-once external delivery.

Decide whether unredeemed codes are revoked when an approved event is withdrawn/cancelled, and how already redeemed rewards are handled. No automatic Discord redemption or bot installation is required at launch. Automatic announcements/redemption can be added after the core feature works.

## 11. Leaderboards and records

Persist character/player IDs; event/region/action/check; natural die, modifier and total; level and DC snapshots; unlocked aid applied; degree/final outcome; booking/start/completion times; and correction/void status.

Official rankings include only completed, non-void contributions. Pending rolls remain visible in their contribution records but do not enter rankings. Use character rankings by default, with a player aggregate option.

| Category | Metric |
| --- | --- |
| Most Aid Checks | Completed aid attempts |
| Most Main Contributions | Completed main attempts |
| Leading Performer / other check specialists | Completed attempts using the selected check |
| Highest Roller | Maximum d20 + modifier for a selected check |
| Lowest Roller | Minimum d20 + modifier for a selected check |
| Most Diverse Helper | Distinct checks used in completed contributions |
| Most Successful Player | Finalized successful contributions, aid and main |
| Bad Omen Player | Finalized failed contributions, aid and main |
| Local Fame | Regional reputation awards minus reversals |

Filter by region, event, time period, and contribution type where relevant. Period rankings use completion time, except reputation uses award time. Preserve ties visibly with stable ordering. Diversity ties can use completed contribution count as a disclosed secondary statistic. Roll rankings show the natural die and declared modifier, not just the total. Optional success-rate rankings need a minimum attempt count and are not necessary for launch.

## 12. Data and server architecture

Suggested new entities: regions; events and reviewed versions; action definitions; review/audit entries; slot state; schedule reservations/contributions; milestone unlocks; reputation ledger; creator reward claims; and optional notification outbox. A contribution can hold the persisted roll directly with an audit history rather than needing an unnecessary independent roll subsystem.

Reuse existing users, characters, and admin roles. Add event-scoped staff applications and grant/revocation records; Event Staff is not a site-wide admin role. All canonical mutations go through protected Supabase commands/APIs, including mini-form character writes. Enable row-level security and restrict direct writes to event, roll, slot, reward, and schedule tables. Review existing character deletion behavior and cascade relationships before integrating immutable history.

Key commands: save/submit/review event; create/update/archive character; commit schedule and rolls; process due contributions; activate next minor event; start meta event; resolve event; redeem/reconcile creator reward; and audited staff correction.

Enforce schedule exclusion, capacity, valid transitions, unique award sources, and request idempotency in the database rather than just React. Use transactions and locking for batch commitments, milestone unlocks, slot claims, and reward issuance. Retry transient failures without rerolling.

Use a scheduled server worker for completion, deadline, and queue processing, with health reporting and chronological recovery after downtime. Precise logical timestamps govern outcomes even if updates appear a little later. Use Supabase Realtime for permitted event/schedule snapshots and a normal refresh fallback.

Keep scoring and aid evaluation in a deterministic domain module compatible with the existing rules architecture; do not entangle this feature with unrelated battlefield/card logic. React handles all feature UI; Phaser is unnecessary. Validate network inputs with Zod and use strict TypeScript without `any`.

Keep private drafts, secrets, and reward administration out of public realtime channels. Use scoped read models for event pages and rankings. Limit text lengths and permitted modifiers; audit staff corrections and invalidate derived rankings/rewards through explicit correction operations.

## 13. Delivery phases

1. **Rule and schema audit:** finalize outstanding decisions, inspect existing character ownership/deletion/import constraints, specify DC rules, plan additive migrations and route access.
2. **Character onboarding and shell:** standalone routes, login return path, mini creation/editing, owned-character list, profile reuse, retirement behavior.
3. **Authoring and administration:** regions, draft/submission/review workflow, approved versions, creator codes, reward validation interface, staff applications and admin-controlled role grants/revocations.
4. **Slots and event lifecycle:** minor FIFO activation, manual meta start, deadlines, cooldowns, lifecycle worker, Event Controls, pause/resume, removal/replacement, cooldown overrides, and immutable operations log.
5. **Scheduling and rolling:** shared timeline, duration validation, atomic multi-event bookings, server rolls, immutable snapshots, recovery-safe retries.
6. **Aid and outcomes:** stacked tracks, potential previews, deterministic chronological completion, deadline resolution, contributor credits, reputation ledger.
7. **Leaderboards and polish:** all requested rankings, filters, mobile/accessibility checks, operational audit tools, optional outgoing announcements.
8. **Staging pilot and release:** test with representative accounts and an accelerated test clock, correct issues, then enable direct-link production access through the project's release workflow.

Deliver a crop-plague sample event in test/staging only, plus a short event and a multi-week meta event to exercise timing. Preserve the existing `/event`, character registry, profile customization, and Foundry workflows.

## 14. Verification and release criteria

- Same login works across the site and standalone area; no new navigation menu appears.
- Mini characters use the existing registry IDs and can later accept profile and Foundry updates without duplication.
- Owners cannot edit another player's character or schedule; ordinary players cannot approve events; only admins grant/revoke Event Staff. Staff can approve other authors' events and operate slots, but cannot set dice results, elevate their own permissions, or mint arbitrary rewards.
- Revoked staff lose authorization on subsequent server commands even with an existing open session. Concurrent grants, revocations, and actions have a consistent transaction order and remain auditable.
- Staff operations and their audit entries commit together. Automatic starts name the system actor; manual starts, approvals, pauses, removals, replacements, and cooldown bypasses name the responsible person.
- Pause/resume preserves booked character time and chronological aid evaluation. Paused events retain their slots; cancelled pending work is void, never finalized as failure; replacements cannot double-occupy a slot.
- Simultaneous requests cannot book overlapping character time, overfill slots, reroll committed actions, or duplicate awards.
- Batch booking is all-or-nothing, with recovery after a lost response returning the original rolls.
- Multi-day actions generate one roll per booked action; main and aid reservations conflict across all events.
- Three −2 aid tracks stack to −6; same-time aid helps a completing main action; later aid does not.
- Potential states work with the chosen natural 1/20 rules and update as aid unlocks.
- Delayed workers reproduce on-time outcomes, including aid before/after completion and deadline boundaries.
- Event percentage excludes pending and aid checks; exact 75% passes a 75% target; rounded values never change outcomes.
- Empty/insufficient events do not win automatically; expired events resolve once and slots cool down for 24 hours.
- Meta events never auto-start; FIFO minor order remains stable under concurrent approvals and worker runs.
- Leaderboards respect completion, region, skill, ties, corrections, and archived characters.
- Reward codes bind to their authors, cannot be redeemed twice, and support reconciliation after an interrupted external award.
- Login redirects, keyboard controls, non-color outcome labels, mobile planning, UTC conversion, and daylight-saving behavior are checked.

Run the repository's lint, typecheck, tests, builds, and migration validation. Add focused domain tests, database/security/concurrency tests, and meaningful end-to-end workflow checks. Document existing failures separately from introduced failures. Do not deploy schema changes or turn on production jobs as part of planning.

## 15. Decisions to settle before dependent implementation

1. Notoriety/Fame relationship and participant reward eligibility/amounts.
2. Creator reward values for minor/meta events and cancellation/revocation policy.
3. Full PF2e degrees with natural 1/20 versus simple total comparison; exact level DC table.
4. Day equals 24 hours, minimum action duration, and forward booking horizon.
5. Active-character/replacement eligibility and optional repetition limits.
6. Queue order by approval time versus submission time; whether the meta slot shares the 24-hour cooldown.
7. Minimum main participation per event and treatment of insufficient participation.
8. Signed-in-only versus public reading, with existing profile privacy preserved.
9. Pause semantics: recommended operational hold with fixed scheduled timestamps versus a separate, explicitly designed clock-freezing policy.
10. Staff application questions, reapplication after revocation, and whether to expose a redacted operations log to players.

Other recommendations in this document are implementation defaults to review, not previously agreed requirements.

## 16. Event Staff applications, Event Controls, and accountability

Confirmed addition: players can apply for Event Staff. An admin approves the application to grant the role and can remove the role if abused. Event Staff can approve other authors' events, manually start meta events, remove minor/meta events, replace a slot's event, pause events, and start an event in an empty slot despite its cooldown. Event activity must record approvals and approvers, automatic launches, and all staff interventions.

### Applications and scoped authority

Proposed form: motivation, relevant GM/community experience, availability, and optional setting/region interests. The linked account identifies the applicant; do not ask them to provide credentials. Statuses: pending, approved, declined, withdrawn. Preserve past applications and staff tenure. Allow only one pending application per user. Revocation records who revoked access, when, and why; it does not delete historical approvals or automatically regrant access through an old application.

Only admins approve staff applications, grant/revoke roles, or change reward policy. Event Staff can review event submissions (approve, return for changes, reject), inspect approved pools, and use lifecycle controls. Event Staff receive no unrelated site administration or character ownership permissions. Existing staff cannot appoint other staff. Creator reward fulfillment authority remains admin-only by default until explicitly delegated separately.

Check current database-backed authorization inside every privileged command, not only in the UI or a stale token claim. Serialize conflicting privilege changes and commands where necessary so revocation has a defined effective order. Log any command committed before revocation; reject subsequent commands. Revocation does not automatically undo otherwise valid past actions; admins can inspect and correct them explicitly.

### Event Controls panel

Show all six slots with event title/type/region, status, time remaining, cooldown end, next queued event, and permitted actions. Include submission review and approved pool selection through contextual controls. Require a reason for disruptive actions and manual queue/cooldown overrides. Show the affected event, pending contribution count, and consequence before confirmation.

| Control | Proposed behavior |
| --- | --- |
| Approve / return / reject | Review another author's submitted version; approval joins the appropriate pool and issues the configured creator code once |
| Start meta | Select an approved meta event for the empty meta slot; any cooldown bypass is explicit |
| Fire empty slot now | Start the next eligible approved event immediately despite cooldown; optionally select another approved event as a separately logged queue override; fail without mutation if no eligible event exists |
| Remove queued event | Withdraw it from eligibility and retain submission/review history |
| Remove active minor/meta | Cancel the event, preserve completed history, void unfinished contributions and release their reservations, begin normal cooldown; no automatic positive outcome or completion rewards |
| Replace occupied slot | Atomically cancel the old event and start a selected approved event of the matching type; explicitly bypass normal cooldown; never transfer rolls or reservations to the replacement |
| Pause / resume | Hold an active event and later resume under the time policy below; retain slot occupancy |

A manual replacement is cancellation, not a completed failure. Existing awards and redeemed creator codes are not silently deleted; corrections/revocations follow the explicit reward policy. Removed events become archived/cancelled records, not hard-deleted records. Paused events cannot be treated as empty slots. Automatic workers and manual controls use the same transactional lifecycle checks and cannot race to claim a slot.

### Proposed pause policy — requires confirmation

Recommend an operational hold: stop new commitments, milestone application, contribution finalization, deadline resolution, and slot turnover while paused. Preserve all original work periods, rolls, and the deadline; do not shift character calendars or release booked time. Existing reservations continue occupying their original periods. Display a paused banner explaining that results are awaiting processing; freeze live potential projections at the hold state.

On resume, process due work chronologically using original completion timestamps, including aid-before-main ordering, then resolve an elapsed deadline. Ignore any hypothetical aid after the original deadline. If the deadline passed during the pause, resolve the event before reopening contribution booking. This avoids overlaps with other events already booked in the same character's calendar.

A narrative pause that stops elapsed time and extends deadlines would require a different design: shifting reservations can overlap unrelated events. Do not silently implement that policy. Any future rescheduling must validate affected calendars and specify player consent and immutable-roll handling.

### Event log

Write an append-only operations log containing submission/review decisions, approvals, automatic starts, manual starts, natural completion, pause/resume, removals, replacements, cooldown bypasses, reward-code changes, and role grants/revocations. Include actor account ID and name snapshot (or system), UTC time, event/version, slot, action, reason, relevant before/after values, and request/correlation ID. Log old and new event IDs on replacement. Review decisions identify the exact approved version.

Staff cannot edit or delete log entries; corrections append a new entry. The audit write and canonical mutation must share a transaction; if logging fails, the action fails. Notification delivery logs can be separate, linked by event/request ID. Duplicate request retries do not create duplicate actions or misleading duplicate success entries.

Provide filters for date, event, region, actor, action, and manual/system activity. Admins can inspect staff tenure and a staff member's complete action history when investigating abuse. Event Staff can inspect operational history, while application answers, private admin notes, and sensitive reward data remain restricted. A player-facing redacted log is optional and must not reveal those private fields.
