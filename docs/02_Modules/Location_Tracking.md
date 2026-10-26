# Location Tracking

## Purpose

Defines the Location Tracking module — real-time family-member location sharing, reported by each family member's Android phone over the existing `mobile-connector` app, visible to every family member for mutual peace of mind, with a bounded 7-day history retained for a genuine emergency (e.g. a missing child) rather than an indefinite log. Originates from a direct product discussion with Steven (see `Future_Ideas.md`'s "Family location tracker" entry, 2026-08-04) — this doc supersedes that entry's "not yet scoped" note with a concrete design.

## Goals

- Let every family member see where every other family member currently is, without any of that traffic ever leaving the family's own Tailscale tailnet.
- Retain a short, bounded history (7 days) for the specific case of needing to reconstruct someone's recent movements — not an indefinite surveillance log.
- Make this data structurally unreachable by the frontier-model escalation path, full stop — a stronger guarantee than the sensitive-data approval gate every other sensitive data type goes through.
- Give a minor's account real, visible acknowledgment that it's being tracked, without offering an opt-out — while giving an adult's account a real one.

## User Stories

- As a family member, I want to see where everyone else in the family currently is, so I have peace of mind without having to ask.
- As Dad or Vee, I want an option to turn my own location sharing off, since as an adult it's my call whether to share it.
- As Steven, if a real emergency ever happened (a missing child), I want the last week of location data to exist so it can actually help, instead of the app having thrown it away.
- As Malachi, I want to be able to see that my location is being shared, even though I can't turn it off.
- As the Super Admin, I want to be the only one who can pull up someone's location *history*, not just their current position, since that's a materially more sensitive view than "where is everyone right now."

## Features

- **Tailnet-only transport, no Funnel, ever.** Unlike the External Family Viewer (which genuinely needs Tailscale Funnel because grandma's phone will never be a tailnet member), every reporting device here is a family member's own phone — already reachable as a tailnet member the same way `mobile-connector` already reaches the host for file sync away from home. There is no public listener for a broad-internet attacker to find, not merely one that's hidden. The in-repo record of what may ever be public is `lib/core/network/funnel-exposure.ts`'s allowlist (the External Family Viewer paths only): a test asserts location and connector routes aren't under any allowed prefix, and the hourly scheduler compares the live `tailscale serve` config against the allowlist and sends the Super Admin an urgent notification on drift. The one real residual risk is compromise of the Tailscale account itself, which is why 2FA on that account is separately flagged in `Future_Ideas.md` as a hard pre-commercial-release requirement.
- **Reported by `mobile-connector`, over a distinct channel from file sync.** Same app, same device pairing/auth (`devices.auth_token`, `authenticateConnector()`), but its own API route (`/api/connectors/location`) — location has a different cadence, different retention, and categorically higher sensitivity than file-sync metadata, so it deliberately isn't folded into `applySyncBatch()`'s batch/diff logic.
- **Push-triggered on-demand refresh — the phone does no continuous tracking.** When a family member opens `/location`, the host sends a high-priority, data-only push through Firebase Cloud Messaging to each sharing family member's phone whose latest reading is stale. The phone wakes (even if the app is closed), takes one fresh GPS fix, and answers over the normal connector endpoint — how fresh that fix actually is depends on Android's background limits, see "Fix freshness" under Known limits; the page shows "Refreshing…", polls for about 20 seconds, and falls back to "last known position" for any phone that doesn't answer (off, no signal, or Android declined to deliver). Server: `lib/core/location/refresh.ts` + `fcm.ts`, `POST /api/location/refresh`. Phone: `mobile-connector/src/push.ts`.
- **Three ways a reading is produced, each stored with a `source`.** `push_refresh` (woken by a push — the main path, a fresh fix), `foreground` (the connector app was opened), and `heartbeat` (an hourly background poll kept only so the 7-day emergency history isn't empty between checks). Heartbeat readings are best-effort and can be stale network-cache fixes, so `/location` labels them "Approximate" instead of presenting them with the same confidence as a fresh one.
- **The refresh rules (enforced server-side, tested in `refresh.test.ts`).** Opening `/location` refreshes only people whose reading is older than 3 minutes; the per-person Refresh button skips that check. Either way a phone is pushed at most once per minute, however often pages are opened. A push is never sent for someone whose `location_sharing_enabled` is off (even on a manual refresh) or for an `external_viewer`. A push token FCM reports as dead is forgotten rather than retried. The push carries no location data — only a "report now" signal — so a spoofed or replayed push can't inject a position (the phone answers over its device-authenticated endpoint).
- **The phone-side switch always wins.** The connector app keeps its own "sharing" flag (turned on by "Enable Location Sharing", off by "Turn Off"). When it's off the phone ignores refresh pushes and the heartbeat is unregistered, regardless of what the host asks — turning sharing off on the phone must actually stop reporting.
- **Required setup.** On the host: a Firebase service-account key referenced by `FCM_SERVICE_ACCOUNT_PATH` (key file in the git-ignored `secrets/`; if unset, refresh is simply skipped and `/location` says so). In the connector build: `google-services.json` for `com.tikasfamily.connector` (also git-ignored; `build-android.ps1` copies it into the short-path build). On each phone: location "Allow all the time", notifications allowed (that's what lets refresh pushes through), the app's battery setting on Unrestricted, and Android's "Pause app activity if unused" turned **off** (when it triggers, Android force-stops the app and revokes its permissions). Pushes are sent straight to Firebase with the household's own key — deliberately not through Expo's push service, so the key never leaves this machine.
- **Known limits.** Android may delay or drop a push while the device is in Doze, and a force-stopped app receives none until it's opened again. Firebase may also downgrade high-priority messages that never produce a visible notification to normal priority, based on 7 days of behavior — if refresh latency degrades over time, posting a brief visible "a family member checked your location" notice with each refresh is the fix to try (it's also consistent with the module's "visible to the person being tracked" principle). **Verified on a real device (2026-10-25/26, Motorola, Android 14):** a push wakes the phone from 33 minutes unplugged, locked, and idle in about 3 seconds, Android delivers it at full high priority (not downgraded), the payload is read correctly (the first version read it one level too shallow and silently ignored every push — only a device test could have caught that), and the phone reports to the host. Because of that, the temporary connector debug instrumentation used to verify it has been removed.

  **Fix freshness — a known, accepted limit.** The position reported during a wake is usually **30 seconds to ~5 minutes old**, not live. Android throttles background apps to a few location updates an hour and hands back a cached position; the location library accepts a cached fix only under 2 seconds old, so the override is Android's, not the library's. A foreground service is the sanctioned exemption, but Android 14 refuses to start one from a push wake on the test phone ("cannot be started when the application is in the background") even with the app battery-exempt and the push at full priority; a short plain location subscription never returned in a headless wake (and hung it), so it was removed. The real timestamp is reported either way, so `/location` shows "updated N min ago" truthfully instead of presenting a stale fix as current. **Steven's decision (2026-10-26): a ~5-minute-old position is good enough for this household, so this ships as is.** Two ways to improve it are logged in `Future_Ideas.md` (the "Display over other apps" permission as a cheap experiment, and a small piece of native Android code that starts the location service from inside the push receiver). The code still makes one fast attempt at the foreground-service route first (a wasted ~0.5 seconds here), so it will start working by itself on any phone or Android version that allows it.
- **Current position, visible to every family member.** Any logged-in family member (any role except `external_viewer`, which has no access to this module at all) can see every other family member's latest known position — mutual, not one-directional. A family member who has turned their own sharing off (see below) simply doesn't appear.
- **7-day rolling history, Super Admin only.** Every reading is kept for exactly 7 days, then purged — a deliberate revision from an initial "don't retain history at all" recommendation. Steven's call: a real emergency could need recent history, and the benefit outweighs the retention risk given it's bounded, tailnet-only, and never frontier-routed. Viewing that history (as opposed to a live current position) is restricted to the Super Admin — the emergency/police-report use case doesn't require every family member to be able to browse each other's movement history day-to-day.
- **Hard-excluded from frontier-model routing — not merely gated.** Every other sensitive data type in this app goes through the "Approve Outside Calls" + sensitive-data approval flow (`AI_Permissions.md`) before ever reaching the frontier model. Location skips that flow entirely by never being wired into anything the Assistant, Advisor, or frontier escalation path can reach — no tool, no memory-extraction source, no prompt context. This is enforced by omission (nothing reads `location_reports` from `lib/core/ai/*`) plus an explicit code comment at the point future AI-tool authors are most likely to reach for it (`lib/core/ai/tools.ts`). Since 2026-10-25 it is also enforced by test, not only by convention: `lib/core/location/isolation.test.ts` fails if any AI-layer file, Assistant route, or caller of the frontier client references the location module or table.
- **Visible but non-optional for a minor.** Malachi's account shows the same "your location is shared with your family" indicator everyone sees, but the sharing toggle described below simply isn't offered to a minor's account — enforced server-side from `date_of_birth`, not just hidden in the UI. Steven's reasoning, preserved as stated rather than softened: family/parent tracking isn't surveillance in his view — the distinction is *who* is doing the tracking (family vs. a government or other external entity), not the mere presence of tracking. He explicitly weighs the parental-safety benefit as outweighing the concern.
- **Optional for an adult.** Dad and Vee each get a real per-account toggle (`location_sharing_enabled`, default on), following the same simple pattern `ai_enabled` already uses — no special permission required, can only toggle your own.
- **Placement: left nav / bottom tab, right after Email.** Per Steven's requested layout — this is now the 9th primary nav destination (`Navigation.md` already flagged 8 as "visibly tight... a real candidate for a 'More' overflow item if a 9th destination is ever added"; that overflow problem isn't solved here, just newly triggered).

### Why it works this way (real-device investigation, 2026-08-23 → 26)

- A continuous location stream plus a periodic polling fallback (the original design) did not work on battery. A controlled 30-minute test with the phone locked and *charging* showed both background mechanisms firing reliably (stream ~9 times, fallback twice, real GPS fixes); the identical test *unplugged* showed the stream fire **zero** times and the fallback return stale, coarse network-cache fixes (a suspiciously round 100m accuracy, fix timestamps exactly 10 minutes apart regardless of when the task ran). Android's Doze power management suspends exactly this kind of background work whenever the phone isn't charging, which is why every real driving trip failed.
- Several things were fixed or ruled out along the way and are still worth knowing: `expo-location`'s `mayShowUserSettingsDialog` defaults to true on Android and can make a headless call silently return a stale fix instead of failing (the connector now passes `false`); "Pause app activity if unused" being on was a real, separate cause of the app being force-stopped; per-app "Unrestricted" battery is already the maximum exemption Android offers and still isn't enough; Adaptive Battery, charge level, and system Location Mode were ruled out. Android also treats `timeInterval` and `distanceInterval` as "whichever comes first", so a small distance threshold fires every few seconds at driving speed.
- Conclusion (Steven, 2026-08-26): stop fighting continuous background polling and wake the phone on demand instead. `react-native-background-geolocation` (a paid, purpose-built cross-platform library) was considered and set aside; it is logged in `Future_Ideas.md` as a possible paid add-on for a future commercial release.
- iOS later: the design carries over — FCM can also deliver to iOS via APNs, and an iOS background push can similarly wake an app — but it needs Apple credentials and the "Always" location permission, and none of it has been built or tested.

## Screen Layout

- **`/location`:** a list of family members with a shared/visible location, each showing their latest position, a relative "updated N minutes ago" timestamp, an embedded map (OpenStreetMap's free `export/embed.html`, no API key/paid dependency — same approach the app already uses for weather via Open-Meteo), and an "Open in Maps" link out to Google Maps for a full interactive view. Note the map embed means the *viewer's own browser* fetches public OSM tiles for a location it can already see on-screen — a much smaller, different exposure than a phone ever reporting to a third party, which the rest of this module is designed to prevent entirely.
- Opening the page triggers the on-demand refresh described under Features: anyone being refreshed shows "· Refreshing…" next to their timestamp; a phone that doesn't answer within ~20 seconds shows "Couldn't reach their phone just now — showing the last known position"; a heartbeat-sourced reading shows "Approximate — from a background check". Each person has a **Refresh** button (skips the staleness check, still rate-limited), and if the host has no push key configured the page says live refresh isn't set up rather than failing silently.
- A **"Share my location"** toggle for the current user's own account — rendered normally for an adult, replaced with a plain "Your location is shared with your family" statement (no control) for a minor.
- For the Super Admin only: a **"View 7-day history"** action per family member, opening a simple chronological list of that person's readings from the last 7 days.

## Data Stored

New **Location_Report** entity:

| Field | Notes |
|---|---|
| id | |
| user_id | the family member this reading belongs to (references `users`) |
| device_id | the phone that reported it (references `devices`) |
| latitude / longitude | |
| accuracy_m | device-reported horizontal accuracy, if available |
| recorded_at | when the phone took the fix (device clock) |
| source | `push_refresh` / `foreground` / `heartbeat` — how the reading was produced; the UI labels heartbeat readings as approximate. NULL for rows written before this column existed |
| received_at | when the host received it (server clock) — used for the 7-day purge, so clock skew on a phone can't extend its own retention |

Purged entirely once older than 7 days from `received_at` — a hard delete on a scheduled tick (see Dependencies), not a soft-delete/archive, consistent with how Notifications' capped list and the 30-day security-event purge already work.

Extends the existing **User** entity with:

| Field | Notes |
|---|---|
| location_sharing_enabled | boolean, default true; toggleable by the user themself if an adult; forced true and non-toggleable for a minor, enforced server-side from `date_of_birth` |

Extends the existing **Device** entity (phones only) with:

| Field | Notes |
|---|---|
| push_token | the phone's native Firebase Cloud Messaging token, reported by the connector so the host can wake it for a refresh; cleared when FCM reports it dead |
| last_refresh_push_at | when this phone was last sent a refresh push — drives the one-push-per-minute rate limit |

## AI Responsibilities

- None, deliberately. This is the one data domain in the app the AI layer (Assistant, Advisor, Guardian, memory extraction, frontier escalation) must never read, summarize, or reference — see Features above. If a future session is ever tempted to add a `get_family_location` Assistant tool, that's the one change this doc explicitly asks to be reconsidered carefully, not added by default.

## Permissions

- **Current position:** visible to any authenticated family member (`super_admin`, `admin`, `basic_user`) for any other family member whose `location_sharing_enabled` is true. Not visible to `external_viewer` accounts — this module isn't part of the external-viewer surface at all.
- **7-day history:** `role === 'super_admin'` only. Deliberately not reusing the existing `viewChildActivityLogs` grantable permission — that permission scopes a parent-role Admin to *their own children* for a different kind of activity log; location history is kept narrower, Super Admin only, per Steven's explicit instruction.
- **Sharing toggle:** a user can only toggle their own `location_sharing_enabled`, and only if they are not a minor (computed from `date_of_birth` at request time, not a stored flag that could drift).

## Dependencies

- Builds on `File_Connector_Architecture.md` and `Security_Architecture.md`'s device-trust model (device pairing, `auth_token`, tailnet-only reachability) — reuses the device identity `mobile-connector` already has, adds no new pairing flow.
- `mobile-connector` (Android phone connector) gains a push handler, an hourly heartbeat, and a foreground report, alongside its existing file-sync task — and `expo-notifications` to receive pushes.
- Firebase Cloud Messaging (HTTP v1), reached with the household's own service-account key via `google-auth-library`. This is the module's one outbound dependency on a third-party service — the push carries no location data, only a "report now" signal.
- Scheduler: the 7-day purge is a new function added to `scripts/scheduler-hourly.ts`'s existing tick, the same way `purgeOldSecurityEvents()` (30-day retention) already runs there.
- `Navigation.md` / `NavShell.tsx`: new nav destination.
- `AI_Permissions.md` / `Assistant.md`: the frontier hard-exclusion sits alongside, but is stricter than, the existing sensitive-data approval pattern those docs define.

## Future Enhancements

- **Geofencing / arrival-departure notifications** ("Malachi arrived at school") — a natural extension once current-position sharing is live, not built for this initial version.
- **iOS support**, once the household's device mix includes iPhones (mirrors the same gap already flagged for `mobile-connector`'s file-sync side).

## Questions

- **Can the position during a wake be made genuinely fresh?** Accepted as-is for now (see Fix freshness under Known limits); the options for improving it are in `Future_Ideas.md`. The earlier open question — whether a push wakes the phone from idle — is answered: it does.
- Should the Super Admin's 7-day history view itself be logged (who looked up whose history, when)? Not built for this initial version; worth a real answer before this feature has been live long enough for that question to matter in practice.
