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

Expo Go is the fastest way to load code onto a phone with zero build step,
but it's genuinely not capable of running this app for real — found the hard
way, not a theoretical caveat:

- **Photo-library access doesn't actually work in Expo Go.** On current
  Android, Expo Go's `requestPermissionsAsync` hard-rejects with "Expo Go can
  no longer provide full access to the media library... create a development
  build." This isn't a permissions-config problem on our end — it's an Expo
  Go limitation with no workaround. `sync.ts` and `StatusScreen.tsx`
  deliberately import from `expo-media-library/legacy` (not the package's
  SDK 57 default, which Expo Go's prebuilt binary doesn't even ship the
  native module for), but that only fixes the "cannot find native module"
  crash — it doesn't restore real access. Sync Now will fail in Expo Go no
  matter what.
- **Background fetch doesn't run in Expo Go at all** (its own error says so).
  `background.ts` detects Expo Go at runtime and skips registering it there
  rather than warning on every launch — see its comment.
- **Distribution.** Since this isn't going through the Play Store, a real
  build is a signed APK installed by enabling "install from unknown sources"
  once.

**Bottom line: use Expo Go only to sanity-check UI/navigation changes without
a rebuild. Anything touching photos or background sync needs a real build.**

## Building a real APK locally

```powershell
powershell -File build-android.ps1
```

Produces `mobile-connector/app-release.apk`. Install it by enabling "install
from unknown sources" for whatever app you use to open the file, or via
`adb install -r app-release.apk` with the phone connected over USB (with USB
debugging enabled in Developer Options).

**Release, not debug — deliberately.** A debug APK (`assembleDebug`) doesn't
bundle the JavaScript at all; it loads `index.android.bundle` live from a
running Metro server, so it only works while this PC is on, reachable, and
running `npm start`. First real-device install hit exactly this: "Unable to
load script... make sure you're running Metro." A release build
(`assembleRelease`) compiles the JS into the APK itself, so the installed app
works with this PC completely off — the actual point of a standalone build.
Expo's generated `android/app/build.gradle` signs the release build type with
the same debug keystore by default, so this produces a real installable,
verifiable-signed APK without needing a production keystore for local
testing.

**Why `app.json` sets `usesCleartextTraffic: true`.** Android release builds
block plain HTTP by default since Android 9 — first real-device pairing
attempt failed with `CLEARTEXT communication to <ip> not permitted by
network security policy`. This app talks to the family server over plain
HTTP by design, same as the desktop connector script and the main web app
itself — the whole system's trust model is "reachable only on the home
network / over Tailscale," not TLS. Allowing cleartext broadly (rather than
allowlisting one host) is intentional: the host address is something the
Super Admin types in at pairing time, not a fixed domain, so a per-host
allowlist isn't practical. Set via the `expo-build-properties` config plugin
rather than hand-editing the generated `AndroidManifest.xml`, since prebuild
regenerates that file from scratch every run.

Needs the Android SDK set up once first — JDK 17 at `D:\Software\Android\jdk`
and the SDK command-line tools at `D:\Software\Android\Sdk`, with
`JAVA_HOME`/`ANDROID_HOME` set (all one-time; see project memory for exact
setup commands if this needs redoing on another machine).

**Why the script copies everything to `D:\rn-build\connector` instead of
building in place:** this project's real path is deep enough that React
Native's native C++ build hits Windows' ~260-character path limit inside
`node_modules/expo-modules-core/android/.cxx/...`. Windows' long-path OS
setting doesn't fix it (some tool in the NDK/CMake/ninja chain ignores it), a
`subst` virtual drive doesn't fix it (breaks Node's module resolution
instead), and a directory junction doesn't fix it either (Node's `require()`
resolves junctions back to their real long path by default, so CMake still
sees the long path). Only a genuinely short, physically separate path works.
`build-android.ps1` automates that copy — don't try to `gradlew
assembleRelease` directly from this folder, it will fail.

## Building via EAS cloud (needed for iOS; optional for Android)

`eas.json` is already configured. iOS can only ever build this way (or on a
real Mac) — never locally on Windows.

```bash
npx eas login
npx eas build --platform android --profile development
```

## If a device is revoked

Same behavior as the computer connector: revoking from the Devices admin
screen takes effect immediately server-side, but the app itself doesn't know
until its next sync/poll attempt fails. The "Unpair This Phone" button in the
app just clears the locally stored credentials — use it (or just uninstall
the app) once a phone is retired or lost.
