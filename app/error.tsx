"use client";

// Route-level error boundary. Without this, an unhandled render error inside
// any page shows Next.js's generic error screen. This renders inside the root
// layout, so the nav shell stays usable — the family can always get back to
// somewhere that works. See global-error.tsx for the case where the layout
// itself is what failed.

import { useEffect } from "react";
import Link from "next/link";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server already logged the real error against this digest (see
    // server.log); this keeps the browser console useful for debugging too.
    console.error("Page error:", error);
  }, [error]);

  return (
    <main className="p-6 max-w-[560px] mx-auto text-center pt-16">
      <h1 className="font-display text-2xl font-medium text-ink">Something went wrong on this page</h1>
      <p className="text-sm text-ink-muted mt-3 leading-relaxed">
        The rest of the app is fine. Try again, or head back to the Dashboard. If it keeps happening, let your household admin know what
        you were doing when it appeared.
      </p>
      <div className="flex justify-center gap-3 mt-6">
        <button type="button" onClick={reset} className="rounded-xl bg-accent-strong text-white text-[13.5px] font-semibold px-5 py-2.5">
          Try again
        </button>
        <Link href="/dashboard" className="rounded-xl bg-surface text-ink text-[13.5px] font-semibold px-5 py-2.5 border border-ink/10">
          Go to Dashboard
        </Link>
      </div>
      {error.digest && <p className="text-[11.5px] text-ink-muted mt-6">Reference: {error.digest}</p>}
    </main>
  );
}
