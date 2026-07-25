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

- **MVP:** a family member installs the connector by downloading and running a small script/app on their device. This is a technical process, done once per device, and paired with a device record the Super Admin creates in the Admin dashboard (per `Security_Architecture.md`'s device trust model).
- **Commercial version (future):** this process would need to be redesigned for a non-technical user — e.g., a simple installer with a pairing code or QR code, no script-running required. Flagged here as a known MVP-only limitation, not a final design.

## Sync Mechanics

- **Schedule:** once per day for MVP (per `System_Overview.md`), fully automatic — the connector runs as a background service/app on the device and triggers its own sync at the scheduled time without the user having to open anything manually.
- **No retry:** if the host is unreachable at sync time, the connector does not retry — it waits for the next scheduled sync.
- **No manual "sync now" in MVP.** A manual sync trigger is a planned commercial-version feature, not built for MVP.

## Data Flow: Typical Sync

1. At the scheduled time, the connector wakes automatically in the background.
2. It scans its designated folder(s) for anything new, changed, or deleted since the last sync.
3. It sends metadata for those changes to the host via the internal **Connector API** (`/app/api/connectors`, per `Application_Architecture.md`).
4. The host updates its records (e.g., Photo or Document metadata entries per `Data_Model.md`) to reflect the device's current state.
5. If a family member later opens a specific file through the app, the host requests that one file from the connector at that time — not before.

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

- Should the Super Admin be able to designate **different** folders per device (e.g., Vee's phone syncs Camera Roll + Downloads, but Malachi's computer only syncs a school-documents folder), or should folder designation be uniform across all devices for MVP simplicity?
- When a file is detected as deleted on the original device, should its metadata record on the host be deleted too, or kept with a "removed from source" status (in case it's still referenced by a Memory or shared elsewhere in the system)?
