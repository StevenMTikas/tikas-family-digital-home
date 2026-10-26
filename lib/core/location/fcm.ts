// Sends a data-only, high-priority FCM push to a phone connector's native
// device token, to wake it for an on-demand location refresh. See
// docs/02_Modules/Location_Tracking.md.
//
// Sent straight to Firebase (HTTP v1) with the household's own service-account
// key — deliberately not Expo's push service, so the key never leaves this
// machine. The payload carries NO location data, only a "report now" signal;
// the phone answers over its existing device-authenticated connector endpoint,
// so a spoofed or replayed push can't inject a position.
//
// Like the rest of lib/core/location, nothing here may import from
// lib/core/ai/*.

import fs from "fs";
import path from "path";
import { GoogleAuth } from "google-auth-library";

export type PushResult = "sent" | "invalid_token" | "error";
export type PushSender = (token: string, data: Record<string, string>) => Promise<PushResult>;

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const SEND_TIMEOUT_MS = 10_000;
// A refresh request that arrives after this is not worth acting on.
const MESSAGE_TTL = "60s";

let cached: { keyFile: string; projectId: string; auth: GoogleAuth } | undefined;

// Read lazily (never at module scope) — same env-var discipline as db/client.ts.
function getKeyFile(): string | null {
  const configured = process.env.FCM_SERVICE_ACCOUNT_PATH;
  return configured ? path.resolve(process.cwd(), configured) : null;
}

export function isFcmConfigured(): boolean {
  const keyFile = getKeyFile();
  return !!keyFile && fs.existsSync(keyFile);
}

function getClient() {
  const keyFile = getKeyFile();
  if (!keyFile) throw new Error("FCM_SERVICE_ACCOUNT_PATH is not set — see .env.example");
  if (!cached || cached.keyFile !== keyFile) {
    const projectId = JSON.parse(fs.readFileSync(keyFile, "utf8")).project_id as string;
    cached = { keyFile, projectId, auth: new GoogleAuth({ keyFile, scopes: [FCM_SCOPE] }) };
  }
  return cached;
}

export const sendFcmDataPush: PushSender = async (token, data) => {
  try {
    const { projectId, auth } = getClient();
    const accessToken = (await (await auth.getClient()).getAccessToken()).token;

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: MESSAGE_TTL } } }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return "sent";

    const body = await res.json().catch(() => ({}));
    const status = body?.error?.status as string | undefined;
    const message = (body?.error?.message as string | undefined) ?? "";
    // The token is dead (app uninstalled/reinstalled, data cleared) — the caller
    // should forget it rather than keep pushing to it. Other failures (auth,
    // quota, malformed message) say nothing about the token itself.
    if (status === "NOT_FOUND" || /registration token/i.test(message)) return "invalid_token";
    console.error(`[location] FCM send failed: HTTP ${res.status} ${status ?? ""} ${message}`);
    return "error";
  } catch (err) {
    console.error("[location] FCM send threw:", err instanceof Error ? err.message : err);
    return "error";
  }
};
