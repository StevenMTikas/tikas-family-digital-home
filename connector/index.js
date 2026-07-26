#!/usr/bin/env node
// Reference File Connector — see the main app repo's
// docs/01_System_Architecture/File_Connector_Architecture.md, which this
// implements. Deliberately simple: "connector = scanner, host = brain"
// (System_Overview.md). This script does not decide what's a duplicate,
// what's sensitive, or how content gets categorized — it just reports what
// it sees in its designated folders and uploads a file when the host asks
// for one it's already seen.
//
// Computers only for MVP — phones (especially iOS) can't run an arbitrary
// background script like this one; a real phone connector needs a native
// app (see Future_Ideas.md).

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = process.env.CONNECTOR_CONFIG || path.join(__dirname, "config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`No config found at ${CONFIG_PATH}. Copy config.example.json to config.json and fill it in.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

const config = loadConfig();

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const THUMBNAIL_WIDTH = 200;

/** Recursively lists files under `dir`, skipping dotfiles/dotfolders. */
function listFiles(dir) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`Could not read designated folder "${dir}": ${err.message}`);
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Builds a small base64 thumbnail for an image file. Returns undefined (not an error) if sharp can't handle this file — a sync shouldn't fail just because one photo couldn't be thumbnailed. */
async function buildThumbnail(filePath) {
  if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return undefined;
  try {
    const sharp = require("sharp");
    const buffer = await sharp(filePath).resize({ width: THUMBNAIL_WIDTH }).jpeg({ quality: 60 }).toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.warn(`Could not build a thumbnail for ${filePath}: ${err.message}`);
    return undefined;
  }
}

/** Scans every designated folder and reports the connector's *entire* current view of them — the host does the diffing (new/changed/removed) against what it already has on file for this device. */
async function buildManifest() {
  const items = [];

  for (const [folderType, folderPath] of Object.entries(config.designatedFolders || {})) {
    if (!folderPath) continue;
    const files = listFiles(folderPath);

    for (const filePath of files) {
      const stat = fs.statSync(filePath);
      const item = {
        path: filePath, // stable identity for this device — used by the host to diff
        filename: path.basename(filePath),
        folderType,
        modifiedAt: stat.mtime.toISOString(),
      };
      if (folderType === "camera_photos") {
        const thumbnail = await buildThumbnail(filePath);
        if (thumbnail) item.thumbnail = thumbnail;
      }
      items.push(item);
    }
  }

  return items;
}

async function apiRequest(pathname, options = {}) {
  const res = await fetch(`${config.hostUrl}${pathname}`, {
    ...options,
    headers: {
      "x-device-id": config.deviceId,
      "x-device-token": config.deviceToken,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`${pathname} -> ${res.status}: ${body?.error?.message || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

async function runSync() {
  console.log(`[${new Date().toISOString()}] Scanning designated folders…`);
  const items = await buildManifest();
  console.log(`Reporting ${items.length} item(s) to the host.`);

  const result = await apiRequest("/api/connectors/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  console.log(`Sync complete: ${result.created} new, ${result.updated} updated, ${result.removed} removed.`);
}

/** The lighter, more frequent channel that lets an on-demand file open resolve well before the next full daily sync (File_Connector_Architecture.md's Sync Mechanics). */
async function pollPendingRequests() {
  let pending;
  try {
    pending = await apiRequest("/api/connectors/pending-requests");
  } catch (err) {
    console.warn(`Pending-request poll failed: ${err.message}`);
    return;
  }

  for (const request of pending) {
    try {
      const buffer = fs.readFileSync(request.sourcePath);
      const formData = new FormData();
      formData.set("contentType", request.contentType);
      formData.set("id", request.id);
      formData.set("file", new Blob([buffer]), path.basename(request.sourcePath));

      await apiRequest("/api/connectors/file", { method: "POST", body: formData });
      console.log(`Uploaded requested file: ${request.sourcePath}`);
    } catch (err) {
      console.warn(`Could not fulfill file request for ${request.sourcePath}: ${err.message}`);
    }
  }
}

async function main() {
  await runSync().catch((err) => console.error(`Sync failed: ${err.message}`));

  const syncIntervalMs = (config.syncIntervalHours || 24) * 60 * 60 * 1000;
  const pollIntervalMs = (config.pendingPollIntervalMinutes || 5) * 60 * 1000;

  setInterval(() => runSync().catch((err) => console.error(`Sync failed: ${err.message}`)), syncIntervalMs);
  setInterval(() => pollPendingRequests(), pollIntervalMs);

  console.log(
    `Connector running. Full sync every ${config.syncIntervalHours || 24}h, checking for requested files every ${
      config.pendingPollIntervalMinutes || 5
    }min. Press Ctrl+C to stop.`
  );
}

main();
