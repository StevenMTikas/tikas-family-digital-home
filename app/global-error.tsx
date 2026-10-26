"use client";

// Last-resort boundary for when the root layout itself fails (e.g. the
// layout's own database read throws) — error.tsx can't catch that, since it
// renders inside the layout. This replaces the whole document, so it must
// supply its own <html>/<body>, and it uses plain inline styles rather than
// Tailwind/fonts because whatever just failed may be exactly what those depend on.
// Colours are Design_Language.md's base/ink/ink-muted/accent-strong.

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F6F3EE",
          color: "#3A342C",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Tikas Family Digital Home hit a problem</h1>
          <p style={{ fontSize: 14, color: "#6B6055", lineHeight: 1.6, marginTop: 12 }}>
            Nothing you did caused this. Try again — and if it keeps happening, let your household admin know so they can check on the
            server.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#9C6A2E",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && <p style={{ fontSize: 12, color: "#6B6055", marginTop: 20 }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
