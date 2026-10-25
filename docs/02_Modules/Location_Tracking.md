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

- **Tailnet-only transport, no Funnel, ever.** Unlike the External Family Viewer (which genuinely needs Tailscale Funnel because grandma's phone will never be a tailnet member), every reporting device here is a family member's own phone — already reachable as a tailnet member the same way `mobile-connector` already reaches the host for file sync away from home. There is no public listener for a broad-internet attacker to find, not merely one that's hidden. The one real residual risk is compromise of the Tailscale account itself, which is why 2FA on that account is separately flagged in `Future_Ideas.md` as a hard pre-commercial-release requirement.
- **Reported by `mobile-connector`, over a distinct channel from file sync.** Same app, same device pairing/auth (`devices.auth_token`, `authenticateConnector()`), but its own background task and its own API route — location has a different cadence, different retention, and categorically higher sensitivity than file-sync metadata, so it deliberately isn't folded into `applySyncBatch()`'s batch/diff logic.
- **Two independent reporting mechanisms, found necessary by real-device testing (2026-08-23).** A continuous location-updates stream alone wasn't reliable — real testing on a Motorola phone showed Android killing that continuous subscription after ~10-20 minutes even with the app's battery setting on "Unrestricted," a known hard problem worse on some OEM skins, and it does not self-restart once killed. `mobile-connector/src/location.ts` now also registers a second, independent BackgroundFetch one-shot poll (`registerLocationFallbackPoll`) — the same proven mechanism already used for file sync — as the real reliability floor: even if the continuous stream dies silently, this still delivers a fresh reading roughly every 15-30 minutes, best-effort, same honesty as file sync's own documented cadence. The continuous stream stays as a bonus for better real-time granularity while it's alive, but nothing in this module depends on it surviving.
- **Real bug found across two full real-device trips (2026-08-23/24), ruled out battery level, Adaptive Battery, and system Location Mode as causes first:** every reading during actual movement stayed within meters of the home starting point — not a delivery-cadence problem, a *data* problem. Root cause: `expo-location`'s `mayShowUserSettingsDialog` option defaults to `true` on Android, which prompts an improved-accuracy system dialog — but both background tasks run headless, with no Activity to show that dialog on. The location call doesn't throw when this can't resolve; it silently returns a stale/coarse fix instead, which is indistinguishable from "not moving" without knowing to look for it. Fixed by explicitly setting `mayShowUserSettingsDialog: false` (and requesting `Accuracy.High` instead of `Balanced`) on both the continuous stream and the fallback poll.
- **A likely second, possibly primary, contributing cause found the same day: Android's per-app "Pause app activity if unused" setting was ON for Tikas Connector.** This isn't just a background-execution throttle like battery optimization — when it triggers, Android can force-stop the app and revoke its runtime permissions outright, including background location. That cleanly explains both symptoms seen: the continuous stream dying entirely (force-stopped), and the fallback poll returning stale data (permission silently degraded). Steven found and disabled this via the phone's per-app permissions screen. **This is now a required device setting for reliable operation**, alongside per-app Battery set to Unrestricted — worth adding to a real onboarding/setup checklist for any future phone this app is installed on, not just a one-off fix for this device. Not yet confirmed by a clean real-device trip with all three fixes (`mayShowUserSettingsDialog`, `Accuracy.High`, and this setting) in place together — verify before considering this closed.
- **Root cause found (2026-08-25/26), and it's more fundamental than any single setting: Android's Doze power management, tied to charging state.** A controlled 30-minute test with the phone locked and *charging* showed both background mechanisms firing reliably (continuous stream ~9 times, fallback poll ~2 times, all real non-mocked GPS fixes). The same test repeated *on battery* (unplugged, otherwise identical) showed the continuous stream fire **zero times**, and the fallback poll fall back to a stale, coarse, network-based cached fix (a suspiciously round 100m accuracy, timestamps exactly 10 minutes apart regardless of when the task actually ran) instead of real GPS. Every real driving trip tested throughout this investigation was, naturally, on battery — which is why nothing worked despite fixing `mayShowUserSettingsDialog`, `Accuracy.High`, and "Pause app activity if unused" along the way. Those fixes weren't wrong, they just weren't sufficient: "Unrestricted" battery is already the maximum per-app exemption Android offers, and it still isn't enough to keep a foreground service alive or force real GPS access once genuinely unplugged and Doze-restricted. **Continuous background polling with `expo-location`/`expo-task-manager`/`expo-background-fetch` is not a reliable strategy for this app on this hardware.**
- **Direction chosen (2026-08-26): move away from continuous background polling toward a push-triggered on-demand model.** Instead of the phone continuously trying (and failing) to report in the background, the phone does no continuous location work at all; when a family member opens `/location`, the server sends a high-priority push (reusing the existing `lib/core/push` infrastructure) to wake the target phone just long enough to grab one fresh GPS fix and report it, then the phone goes back to idle. This trades true "live, continuously updating" position for "fresh as of when someone last checked, with a short wake-and-fetch delay" — a materially different but much more achievable reliability model given what real-device testing has shown. Not yet designed in detail or built — this doc will be updated once that design pass happens. `react-native-background-geolocation` (a purpose-built, cross-platform commercial library that specifically fights Doze/OEM battery managers) was considered and set aside for now — logged as a possible **paid add-on for a future commercial release** in `Future_Ideas.md`, not part of the free/MVP household version.
- **Current position, visible to every family member.** Any logged-in family member (any role except `external_viewer`, which has no access to this module at all) can see every other family member's latest known position — mutual, not one-directional. A family member who has turned their own sharing off (see below) simply doesn't appear.
- **7-day rolling history, Super Admin only.** Every reading is kept for exactly 7 days, then purged — a deliberate revision from an initial "don't retain history at all" recommendation. Steven's call: a real emergency could need recent history, and the benefit outweighs the retention risk given it's bounded, tailnet-only, and never frontier-routed. Viewing that history (as opposed to a live current position) is restricted to the Super Admin — the emergency/police-report use case doesn't require every family member to be able to browse each other's movement history day-to-day.
- **Hard-excluded from frontier-model routing — not merely gated.** Every other sensitive data type in this app goes through the "Approve Outside Calls" + sensitive-data approval flow (`AI_Permissions.md`) before ever reaching the frontier model. Location skips that flow entirely by never being wired into anything the Assistant, Advisor, or frontier escalation path can reach — no tool, no memory-extraction source, no prompt context. This is enforced by omission (nothing reads `location_reports` from `lib/core/ai/*`) plus an explicit code comment at the point future AI-tool authors are most likely to reach for it (`lib/core/ai/tools.ts`).
- **Visible but non-optional for a minor.** Malachi's account shows the same "your location is shared with your family" indicator everyone sees, but the sharing toggle described below simply isn't offered to a minor's account — enforced server-side from `date_of_birth`, not just hidden in the UI. Steven's reasoning, preserved as stated rather than softened: family/parent tracking isn't surveillance in his view — the distinction is *who* is doing the tracking (family vs. a government or other external entity), not the mere presence of tracking. He explicitly weighs the parental-safety benefit as outweighing the concern.
- **Optional for an adult.** Dad and Vee each get a real per-account toggle (`location_sharing_enabled`, default on), following the same simple pattern `ai_enabled` already uses — no special permission required, can only toggle your own.
- **Placement: left nav / bottom tab, right after Email.** Per Steven's requested layout — this is now the 9th primary nav destination (`Navigation.md` already flagged 8 as "visibly tight... a real candidate for a 'More' overflow item if a 9th destination is ever added"; that overflow problem isn't solved here, just newly triggered).

## Screen Layout

- **`/location`:** a list of family members with a shared/visible location, each showing their latest position, a relative "updated N minutes ago" timestamp, an embedded map (OpenStreetMap's free `export/embed.html`, no API key/paid dependency — same approach the app already uses for weather via Open-Meteo), and an "Open in Maps" link out to Google Maps for a full interactive view. Note the map embed means the *viewer's own browser* fetches public OSM tiles for a location it can already see on-screen — a much smaller, different exposure than a phone ever reporting to a third party, which the rest of this module is designed to prevent entirely.
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
| received_at | when the host received it (server clock) — used for the 7-day purge, so clock skew on a phone can't extend its own retention |

Purged entirely once older than 7 days from `received_at` — a hard delete on a scheduled tick (see Dependencies), not a soft-delete/archive, consistent with how Notifications' capped list and the 30-day security-event purge already work.

Extends the existing **User** entity with:

| Field | Notes |
|---|---|
| location_sharing_enabled | boolean, default true; toggleable by the user themself if an adult; forced true and non-toggleable for a minor, enforced server-side from `date_of_birth` |

## AI Responsibilities

- None, deliberately. This is the one data domain in the app the AI layer (Assistant, Advisor, Guardian, memory extraction, frontier escalation) must never read, summarize, or reference — see Features above. If a future session is ever tempted to add a `get_family_location` Assistant tool, that's the one change this doc explicitly asks to be reconsidered carefully, not added by default.

## Permissions

- **Current position:** visible to any authenticated family member (`super_admin`, `admin`, `basic_user`) for any other family member whose `location_sharing_enabled` is true. Not visible to `external_viewer` accounts — this module isn't part of the external-viewer surface at all.
- **7-day history:** `role === 'super_admin'` only. Deliberately not reusing the existing `viewChildActivityLogs` grantable permission — that permission scopes a parent-role Admin to *their own children* for a different kind of activity log; location history is kept narrower, Super Admin only, per Steven's explicit instruction.
- **Sharing toggle:** a user can only toggle their own `location_sharing_enabled`, and only if they are not a minor (computed from `date_of_birth` at request time, not a stored flag that could drift).

## Dependencies

- Builds on `File_Connector_Architecture.md` and `Security_Architecture.md`'s device-trust model (device pairing, `auth_token`, tailnet-only reachability) — reuses the device identity `mobile-connector` already has, adds no new pairing flow.
- `mobile-connector` (Android phone connector) gains a second background task and API call, alongside its existing file-sync one.
- Scheduler: the 7-day purge is a new function added to `scripts/scheduler-hourly.ts`'s existing tick, the same way `purgeOldSecurityEvents()` (30-day retention) already runs there.
- `Navigation.md` / `NavShell.tsx`: new nav destination.
- `AI_Permissions.md` / `Assistant.md`: the frontier hard-exclusion sits alongside, but is stricter than, the existing sensitive-data approval pattern those docs define.

## Future Enhancements

- **Geofencing / arrival-departure notifications** ("Malachi arrived at school") — a natural extension once current-position sharing is live, not built for this initial version.
- **iOS support**, once the household's device mix includes iPhones (mirrors the same gap already flagged for `mobile-connector`'s file-sync side).

## Questions

- Should the Super Admin's 7-day history view itself be logged (who looked up whose history, when)? Not built for this initial version; worth a real answer before this feature has been live long enough for that question to matter in practice.
