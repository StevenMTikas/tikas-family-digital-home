# Tikas Connector (Reference Implementation)

A small script that scans designated folders on a family member's **computer**
and reports what it finds to the Tikas Family Digital Home host, per
[`File_Connector_Architecture.md`](../docs/01_System_Architecture/File_Connector_Architecture.md).
Nothing outside the designated folders is ever touched.

**Computers only.** Phones (especially iOS) can't run an arbitrary background
script the way this design assumes — a real phone connector would need a
native app, which isn't built. See `Future_Ideas.md` in the main docs.

## What it does

- Once a day (configurable), scans the folders you designate and reports
  **metadata only** (filename, folder type, modified date, and a small
  thumbnail for photos) to the host. It never uploads full files at this step.
- Every few minutes, checks whether anyone opened a file through the app that
  the host doesn't have yet, and if so, uploads that one file.
- Does not retry if the host is unreachable — it just waits for the next
  scheduled sync.

## Setup

This is a technical, one-time-per-device process (per the MVP design — a
non-technical installer is a future/commercial-version idea, not built).

1. **Pair the device first.** In the app, a Super Admin goes to
   Administration → Devices → Add Device, picks this computer's owner, names
   the device, and checks which folders to sync (Camera/Photos and/or
   Documents). Submitting shows a **device id and token — copy both now**;
   the token is never shown again (there's a "Regenerate Token" option later
   if it's lost).
2. **Install dependencies** (needs Node.js 18+ already installed):
   ```bash
   cd connector
   npm install
   ```
3. **Configure:**
   ```bash
   cp config.example.json config.json
   ```
   Edit `config.json`:
   - `hostUrl` — where the app is reachable on your home network (e.g. `http://192.168.1.20:3000`).
   - `deviceId` / `deviceToken` — from step 1.
   - `designatedFolders` — real paths on this computer for `camera_photos` and/or `documents`. Only include the ones you checked in step 1. Each entry can be a single path (a string) or, to sync more than one folder under the same type, an array of paths — e.g.:
     ```json
     "documents": ["C:\\Users\\YourName\\Documents", "C:\\Users\\YourName\\Desktop\\School Files"]
     ```
   - **These are only a fallback now.** The Super Admin can also set/change this device's watched folders directly from the Admin dashboard (Devices tab) — this connector checks in with the host every few minutes and uses whatever the dashboard has configured, for any folder type the dashboard has anything set for. `designatedFolders` in this file still applies to a folder type the dashboard hasn't touched, so it's still worth filling in at first setup, but don't expect to have to keep editing this file by hand going forward.
4. **Run it:**
   ```bash
   npm start
   ```
   Leave it running — it syncs immediately, then keeps itself running on the
   configured schedule. For it to actually run "fully automatic" as
   `File_Connector_Architecture.md` describes, set it up as a background
   service (Task Scheduler on Windows, a LaunchAgent on macOS, systemd/cron
   on Linux) so it starts automatically and doesn't depend on a terminal
   window staying open.

## If a device is revoked

Revoking a device from the Devices admin screen takes effect immediately —
the next request from that connector (sync or a pending-request poll) will
be rejected. The script itself won't stop running on its own; stop the
process/service on that computer when a device is retired or lost.
