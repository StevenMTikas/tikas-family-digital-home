# Builds a real standalone Android RELEASE APK for Tikas Connector — NOT via
# Expo Go (can't do real photo-library access or background sync — see
# README.md's "Expo Go vs. a standalone build" section) and NOT a debug
# build either (a debug APK doesn't bundle the JS at all — it loads
# index.android.bundle live from a running Metro server, so it only works
# while this PC is on and reachable. First real-device test hit exactly
# this: "Unable to load script... make sure you're running Metro." A
# release build compiles the JS bundle into the APK itself, so the app
# works with this PC completely off.)
#
# Why this script exists instead of just running gradlew in mobile-connector/
# directly: this project's real path
# (D:\Python\Projects\TikasFamilyDigitalHome\tikas-family-digital-home\mobile-connector)
# is deep enough that React Native 0.86's native Fabric/New Architecture C++
# build hits Windows' ~260-character path limit inside
# node_modules\expo-modules-core\android\.cxx\... — even with Windows' long-path
# support enabled at the OS level (some tools in the NDK/CMake/ninja chain
# don't honor it). A `subst` virtual drive does NOT fix this — it breaks the
# Node-based autolinking step instead (subst drives confuse fs.realpath-style
# resolution). A directory junction (mklink /J) doesn't fix it either — Node's
# require() resolves junctions back to their real (long) path by default, so
# CMake still sees the long path. The only fix that actually works is
# building from a genuinely short, physically separate path — hence this
# script copies the source (not node_modules, not android/, both regenerated
# fresh every run) to D:\rn-build\connector and builds there.
#
# Usage: powershell -File build-android.ps1
# Requires: D:\Software\Android\jdk and D:\Software\Android\Sdk (see project
# memory / this repo's session history for how those were set up).

$ErrorActionPreference = "Stop"

$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir = "D:\rn-build\connector"

$env:JAVA_HOME = "D:\Software\Android\jdk"
$env:ANDROID_HOME = "D:\Software\Android\Sdk"

Write-Host "Setting up short-path build workspace ($BuildDir)..."

# The Gradle daemon from a previous run can still hold a lock on files
# under $BuildDir for a few seconds after that build finished - hit this
# for real running two builds back-to-back. Stop any daemon still around,
# then retry the cleanup a few times before giving up.
$existingGradlew = Join-Path $BuildDir "android\gradlew.bat"
if (Test-Path $existingGradlew) {
  Push-Location (Join-Path $BuildDir "android")
  & $existingGradlew --stop 2>&1 | Out-Null
  Pop-Location
}

if (Test-Path $BuildDir) {
  $attempts = 0
  $cleaned = $false
  while (-not $cleaned -and $attempts -lt 5) {
    try {
      Remove-Item $BuildDir -Recurse -Force -ErrorAction Stop
      $cleaned = $true
    } catch {
      $attempts++
      Write-Host "Build workspace still locked by another process, retrying in 3s ($attempts/5)..."
      Start-Sleep -Seconds 3
    }
  }
  if (-not $cleaned) { throw "Could not clean $BuildDir - a process still has a file open. Close any running Gradle/Java/adb processes and try again." }
}
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null

$topLevelFiles = @("App.tsx", "index.ts", "package.json", "package-lock.json", "app.json", "eas.json", "tsconfig.json", "README.md")
foreach ($f in $topLevelFiles) {
  $src = Join-Path $SourceDir $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $BuildDir $f) -Force }
}
Copy-Item (Join-Path $SourceDir "src") (Join-Path $BuildDir "src") -Recurse -Force
Copy-Item (Join-Path $SourceDir "assets") (Join-Path $BuildDir "assets") -Recurse -Force

Write-Host "Installing dependencies..."
Push-Location $BuildDir
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "Running expo prebuild..."
npx expo prebuild --platform android
if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed" }

# Prebuild's generated build.gradle references android/app/debug.keystore by
# a relative path, and Gradle auto-generates one if it's missing. Since this
# whole workspace is wiped and recreated every run, that meant every build
# got a brand-new random signing key — Android refuses to install an update
# signed with a different key than what's already on the phone, so every
# single rebuild required uninstalling the app first. Using the same
# persistent keystore every time (kept in the real source folder, not this
# disposable workspace) means later rebuilds can just install over the
# existing app.
$persistentKeystore = Join-Path $SourceDir "debug.keystore"
if (Test-Path $persistentKeystore) {
  Copy-Item $persistentKeystore "$BuildDir\android\app\debug.keystore" -Force
} else {
  Write-Host "No persistent debug.keystore found at $persistentKeystore - Gradle will generate one, and this build's signing key wont match any previous install."
}

Write-Host "Building release APK (this takes a few minutes)..."
Push-Location "$BuildDir\android"
.\gradlew.bat assembleRelease --console=plain
$buildExitCode = $LASTEXITCODE
Pop-Location
Pop-Location

if ($buildExitCode -ne 0) { throw "gradle build failed" }

$apkPath = "$BuildDir\android\app\build\outputs\apk\release\app-release.apk"
$destPath = Join-Path $SourceDir "app-release.apk"
Copy-Item $apkPath $destPath -Force

Write-Host ""
Write-Host "Build succeeded: $destPath"
Write-Host "Install on a connected phone with: adb install -r `"$destPath`""
