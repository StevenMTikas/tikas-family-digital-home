// Content module. One nav destination covering Documents, Photos, Memory, and
// Family Knowledge via an internal tab switcher — per Navigation.md's grouped
// "Content" destination and the design handoff (Tikas Content.dc.html), not
// four separate top-level routes.
// This is a placeholder — build the tab switcher (activeTab client state)
// against Documents.md, Photos.md, Memory.md, and Family_Knowledge.md.

export default function ContentPage() {
  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-medium">Content</h1>
      <p className="text-ink-muted text-sm mt-1">
        TODO — tabs for Documents / Photos / Memory / Family Knowledge. See
        docs/02_Modules/Documents.md, Photos.md, Memory.md, Family_Knowledge.md
      </p>
    </main>
  );
}
