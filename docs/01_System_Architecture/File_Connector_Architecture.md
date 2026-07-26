# File Connector Architecture

## Purpose

Defines how connectors — the lightweight agents running on family members' computers and phones — scan designated local folders and sync data back to the host. Covers scope of scanning, what actually syncs, setup/pairing, and sync mechanics for the MVP, with commercial-version considerations noted where they diverge.

## Goals

- Keep connectors simple and narrow in scope — scanners, not decision-makers (per `System_Overview.md`: "connector = scanner, host = brain").
- Sync only what's needed to make a device's content useful to the family system, without pulling full files unnecessarily.
- Make the MVP setup process honest about being technical for now, while flagging what a commercial version would need instead.

## Scope of Scanning

- A connector only scans **designated folders**, never the full device.
- Designated folders are set by the **Super Admin (Dad)** — there is no self-service folder selection by other family members in the MVP.
- Designated folder types include:
  - **Camera/photos** (e.g., camera roll on a phone, a photos folder on a computer)
  - **Downloaded documents** (e.g., a downloads or documents folder)
- Anything outside these designated folders is never touched or visible to the connector.

## What Syncs: Metadata First, Files On Demand

- On each sync, the connector reports **metadata only** back to the host — filename, file type, folder location, date, and (for photos) a thumbnail.
- The **actual file itself is not copied to the host** at sync time. It's pulled on demand, only when a family member actually opens/requests that specific file through the app.
- This keeps daily syncs lightweight and avoids duplicating large files across devices unnecessarily.

## Change Detection

- On the next scheduled sync, the connector detects and reflects:
  - **New files** added since the last sync
  - **Edited files** (e.g., updated modification date)
  - **Deleted files** (no longer present in the designated folder)
- The host's record of a device's content is only ever as current as the last completed sync — there's no real-time change detection for MVP, consistent with the once-daily, no-retry sync model in `System_Overview.md`.

## Duplicates

- **Not addressed in MVP.** If the same photo exists on two devices, no de-duplication is attempted for now.
- **Future (commercial) behavior:**
  - Attempt to detect identical photos (e.g., via file hash or similarity check) and de-duplicate automatically.
  - When files appear related but aren't confirmed identical, auto-rename to keep them distinguishable rather than silently overwriting — e.g., `Church Event`, `Church Event (1)`, `Church Event (2)`.

## Setup & Pairing

- **MVP:** a family member installs the connector by downloading and running a small script/app on their device. This is a technical process, done once per device, and paired with a device record the Super Admin creates in the Admin dashboard (per `Security_Architecture.md`'s device trust model). The device record's `auth_token` (generated and shown once at pairing time) is what the connector script authenticates with — there's no self-registration, so a connector with no matching trusted device + token can't reach the API at all.
- **Commercial version (future):** this process would need to be redesigned for a non-technical user — e.g., a simple installer with a pairing code or QR code, no script-running required. Flagged here as a known MVP-only limitation, not a final design.
- **Phones, specifically (found during Phase 5 implementation):** a real "small script" connector, as described above, is only realistic on a computer — phones (iOS in particular) don't allow an arbitrary background script to run and wake on a schedule the way this MVP design assumes. A real phone connector would need to be a native or cross-platform mobile app, which is a substantially bigger build than what's described here. **MVP as actually built only ships a computer connector** (a standalone Node.js script); phone support is left for a real mobile app effort, tracked in `Future_Ideas.md` rather than attempted as a script.

## Sync Mechanics

- **Schedule:** once per day for MVP (per `System_Overview.md`), fully automatic — the connector runs as a background service/app on the device and triggers its own sync at the scheduled time without the user having to open anything manually.
- **No retry:** if the host is unreachable at sync time, the connector does not retry — it waits for the next scheduled sync.
- **No manual "sync now" in MVP.** A manual sync trigger is a planned commercial-version feature, not built for MVP.
- **On-demand file fetch, reconciled with "no manual sync" (found during Phase 5 implementation):** requesting one specific file when a family member opens it (see Data Flow step 5) is a separate, much lighter-weight channel than the full folder scan above — the connector polls a small "anything requested?" endpoint every few minutes while its background service is running, distinct from its once-daily full metadata sync. This isn't a contradiction of "no manual sync now": that rule is about a person not being able to force a full re-scan of the designated folders on demand, not about disabling all communication between syncs.

## Data Flow: Typical Sync

1. At the scheduled time, the connector wakes automatically in the background.
2. It scans its designated folder(s) for anything new, changed, or deleted since the last sync.
3. It sends metadata for those changes to the host via the internal **Connector API** (`/app/api/connectors`, per `Application_Architecture.md`).
4. The host updates its records (e.g., Photo or Document metadata entries per `Data_Model.md`) to reflect the device's current state.
5. If a family member later opens a specific file through the app, the host marks that record as requested; the source device's connector picks up the request on its next "anything requested?" poll (see Sync Mechanics above) and uploads the file at that point — not instantly, but far sooner than the next full daily sync.

## Permissions

- A connector can only sync from a device that's been explicitly trusted by an admin (per `Security_Architecture.md`'s device trust model) — an untrusted or revoked device's connector cannot reach the Connector API.
- Metadata and files synced from a device are attributed to the User that device belongs to (per `Data_Model.md`'s Device → User link), which governs what permissions apply to that content once it's in the system.

## Dependencies

- Builds on `System_Overview.md` (connector = scanner, host = brain; once-daily sync), `Security_Architecture.md` (device trust), `Application_Architecture.md` (Connector API), and `Data_Model.md` (Photo/Document metadata fields).

## Future Enhancements

- Non-technical installer/pairing flow for a commercial version.
- Manual "sync now" option.
- Duplicate detection and auto-renaming for near-identical files.
- Possible expansion of designated folder types beyond camera/photos and documents, if family needs grow.

## Questions

Both resolved during implementation (Phase 5):

- **Per-device folder designation.** Each device's `designated_folders` is its own list, not a global setting — Vee's phone can sync Camera Roll + Downloads while Malachi's computer only syncs a school-documents folder. Storing one JSON list per device cost nothing extra over a uniform setting and matches how households actually use different devices.
- **Deleted-on-source handling.** The metadata record is kept, not deleted, with a `removed_from_source_at` timestamp set instead. A Memory or other reference elsewhere in the system can still point at it; the app can show it as "no longer on the source device" rather than losing the reference entirely.
