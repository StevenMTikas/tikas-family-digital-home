"use client";

// Search module. See docs/02_Modules/Search.md: one search bar/screen across
// Documents, Photos, and Family Knowledge (incl. Password Entries), semantic
// (not just keyword) matching via lib/core/search. No initial server data to
// fetch — the screen is empty until a query is typed — so unlike most other
// modules this is a single client component rather than a
// page.tsx/PageClient.tsx split.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { search, routeForResult, SearchApiError, type SearchResultEntry } from "@/lib/api/search";

const TYPE_LABELS: Record<SearchResultEntry["type"], string> = {
  document: "Document",
  photo: "Photo",
  family_knowledge: "Family Knowledge",
  password: "Password",
};

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || searching) return;

    setSearching(true);
    setError(null);
    try {
      setResults(await search(trimmed));
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof SearchApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="p-6 max-w-[720px]">
      <h1 className="font-display text-2xl font-medium">Search</h1>
      <p className="text-ink-muted text-sm mt-1">
        Search across Documents, Photos, and Family Knowledge.
      </p>

      <form onSubmit={handleSearch} className="mt-5 flex gap-2.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. church outreach, tax return, Wi-Fi password…"
          className="flex-1 border border-ink/15 rounded-full px-4 py-2.5 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-5 py-2.5 rounded-full bg-accent-strong text-white text-[13.5px] font-medium disabled:opacity-60"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-urgent mt-3">
          {error}
        </p>
      )}

      {hasSearched && !searching && results.length === 0 && !error && (
        <p className="text-sm text-ink-muted mt-6">No matches found.</p>
      )}

      <div className="flex flex-col gap-2 mt-5">
        {results.map((result) => (
          <button
            key={`${result.type}-${result.id}`}
            type="button"
            onClick={() => router.push(routeForResult(result))}
            className="text-left bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)] flex items-start justify-between gap-3"
          >
            <div>
              <div className="text-[13.5px] text-ink font-medium">{result.title}</div>
              {result.subtitle && <div className="text-xs text-ink-muted mt-0.5">{result.subtitle}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {result.isSensitive && (
                <span className="text-[10.5px] text-urgent bg-urgent/[0.1] px-2 py-0.5 rounded-full font-medium">Sensitive</span>
              )}
              <span className="text-[10.5px] text-ink-muted bg-base px-2 py-0.5 rounded-full">{TYPE_LABELS[result.type]}</span>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
