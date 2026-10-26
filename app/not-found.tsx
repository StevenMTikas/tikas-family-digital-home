import Link from "next/link";

// Same reasoning as error.tsx: a mistyped or stale link should land somewhere
// the family can recover from, not Next.js's default 404.
export default function NotFound() {
  return (
    <main className="p-6 max-w-[560px] mx-auto text-center pt-16">
      <h1 className="font-display text-2xl font-medium text-ink">We couldn&apos;t find that page</h1>
      <p className="text-sm text-ink-muted mt-3 leading-relaxed">It may have been moved, or the link might be out of date.</p>
      <div className="flex justify-center mt-6">
        <Link href="/dashboard" className="rounded-xl bg-accent-strong text-white text-[13.5px] font-semibold px-5 py-2.5">
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
