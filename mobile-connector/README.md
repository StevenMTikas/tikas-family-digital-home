# Tikas Connector (Android)

A React Native/Expo app that lets a family member's Android phone act as a
**file connector** — the phone equivalent of the reference desktop connector
(`/connector`) — per
[`File_Connector_Architecture.md`](../docs/01_System_Architecture/File_Connector_Architecture.md).
Camera-roll photos only for now; documents sync and iOS support aren't built yet.

Unlike the desktop connector, phones can't run an arbitrary background script
indefinitely, so this is a real installed app: it syncs whenever opened (plus
a manual "Sync Now" button — see the note in `File_Connector_Architecture.md`
on why that's a deliberate exception to the "no manual sync" MVP rule), and
makes a best-effort attempt to sync in the background via Android's
OS-scheduled background fetch. Background execution is opportunistic, not a
guaranteed daily run — see `src/background.ts`'s comment for details.

## Setup

1. **Pair the device first**, same idea as the computer connector but a
   different mechanism: in the family app, a Super Admin goes to
   Administration → Devices → Add Device, picks the phone's owner, selects
   type "Phone", names the device, and checks "Camera / Photos". Submitting
   shows a **pairing QR code** — keep that screen open.
2. **Install dependencies:**
   ```bash
   cd mobile-connector
   npm install
   ```
3. **Run it** (needs the [Expo Go](https://expo.dev/go) app installed on the
   Android phone for quick iteration, or a dev-client/EAS build for full
   background-task fidelity — see note below):
   ```bash
   npm start
   ```
   Scan the Metro QR code with Expo Go on the phone to load the app.
4. **In the app**, grant camera access and scan the pairing QR code from
   step 1. The app verifies the pairing works before declaring success.
5. Grant photo-library access when prompted, then tap **Sync Now** for the
   first sync (or just wait for the app to sync automatically on open).

## Expo Go vs. a standalone build

Expo Go is the fastest way to iterate (no native build step), and covers
camera scanning, photo-library access, and thumbnail generation fine. Two
things behave differently in Expo Go vs. a real standalone/EAS build:

- **Background fetch reliability.** Expo Go's own background execution is
  more constrained than a standalone app's — for a real read on how often the
  best-effort background sync actually fires in practice, test with an EAS
  build (`npx eas build -p android --profile development` or `--profile
  preview`), not just Expo Go.
- **Distribution.** Since this isn't going through the Play Store, a real
  build is a signed APK installed by enabling "install from unknown sources"
  once — see [Expo's build docs](https://docs.expo.dev/build/introduction/).

## If a device is revoked

Same behavior as the computer connector: revoking from the Devices admin
screen takes effect immediately server-side, but the app itself doesn't know
until its next sync/poll attempt fails. The "Unpair This Phone" button in the
app just clears the locally stored credentials — use it (or just uninstall
the app) once a phone is retired or lost.
