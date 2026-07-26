// Web Push delivery — Notifications.md's "Android push for MVP" requirement.
// A family member's browser subscribes once (see app/api/push/subscribe);
// from then on, any notification created for them (see lib/core/notifications)
// also gets pushed here so it can surface as an OS-level notification even
// when the app isn't open in a foreground tab.

import webpush from "web-push";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — see .env.example");
  webpush.setVapidDetails("mailto:admin@tikas.local", publicKey, privateKey);
  configured = true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Upserts by endpoint — resubscribing (e.g. after clearing site data) replaces the old keys rather than duplicating rows. */
export function saveSubscription(userId: string, subscription: PushSubscriptionInput): void {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM push_subscriptions WHERE endpoint = ?`).get(subscription.endpoint) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(`UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ? WHERE id = ?`).run(
      userId,
      subscription.keys.p256dh,
      subscription.keys.auth,
      existing.id
    );
  } else {
    db.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)`).run(
      randomUUID(),
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    );
  }
}

export function removeSubscription(endpoint: string): void {
  getDb().prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  id: string;
  text: string;
  severity: "routine" | "urgent";
  url?: string;
}

/** Pushes to every device this user has subscribed from. A dead subscription (410/404) is removed rather than retried. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const db = getDb();
  const subscriptions = db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`).all(
    userId
  ) as SubscriptionRow[];
  if (subscriptions.length === 0) return; // nothing to configure or send — the common case before a user opts in

  ensureConfigured();

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
        } else {
          console.error(`[push] Failed to send to subscription ${sub.id}:`, err);
        }
      }
    })
  );
}
