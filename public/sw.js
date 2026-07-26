// Service worker — exists solely to receive Web Push events and show OS
// notifications, per Notifications.md's "Android push for MVP" requirement.
// No offline caching for MVP — that's not something any doc asks for, and
// adding it would be scope beyond what's actually needed here.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { text: event.data.text() };
  }

  const isUrgent = payload.severity === "urgent";
  event.waitUntil(
    self.registration.showNotification(isUrgent ? "Tikas Family Digital Home — Urgent" : "Tikas Family Digital Home", {
      body: payload.text || "You have a new notification.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.id,
      data: { url: payload.url || "/dashboard" },
      requireInteraction: isUrgent,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
