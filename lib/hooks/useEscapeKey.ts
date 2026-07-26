"use client";

// Accessibility.md: "All interactive elements... are reachable and operable
// via keyboard." None of the app's modals/overlays had any keyboard-close
// path before this — only backdrop click. One shared hook rather than
// duplicating the same addEventListener/cleanup in every modal component.

import { useEffect } from "react";

/** Calls onEscape when the Escape key is pressed, only while `active` is true. */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onEscape]);
}
