// Server-Sent Events stream for real-time in-app notification delivery —
// Notifications.md: "Notifications appear while the app is open, delivered
// in real time as their triggering event occurs." Backed by the in-process
// EventEmitter in lib/core/notifications (fine for this single self-hosted
// instance — Decision_Log.md #001 — not a multi-instance pub/sub problem).
//
// Needs the Node runtime (EventEmitter, better-sqlite3 via getAuthUser),
// not Edge — see instrumentation-node.ts's header comment for the same
// Edge-vs-Node bundling gotcha in this codebase.

import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { notificationEvents, type NotificationRecord } from "@/lib/core/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let listener: ((record: NotificationRecord) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      listener = (record) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(record)}\n\n`));
      };
      notificationEvents.on(actor.id, listener);

      req.signal.addEventListener("abort", () => {
        if (listener) notificationEvents.off(actor.id, listener);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (listener) notificationEvents.off(actor.id, listener);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
