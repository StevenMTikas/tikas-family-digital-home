"use client";

// Registers the service worker (public/sw.js) that receives Web Push events
// — see Notifications.md's Android push requirement. Registration itself
// doesn't need a logged-in user; the actual push *subscription* (requesting
// permission, sending the subscription to the host) happens separately once
// a user is logged in (see NotificationsProvider/PushSubscribe).

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
