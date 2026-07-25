// Dashboard — the app's home screen. Default content on open is the Morning
// Briefing. See docs/02_Modules/Dashboard.md, docs/05_AI/Morning_Briefing.md,
// and docs/03_User_Experience/Dashboard_Layout.md for the full spec this page
// implements. A visual mockup of this screen (mobile + desktop) was approved
// during the design-language discussion — match that direction when building
// the real UI.

export default function DashboardPage() {
  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-medium">Good morning</h1>
      <p className="text-ink-muted text-sm mt-1">
        TODO: Morning Briefing content (today&apos;s events, tasks due,
        suggestions) — see Morning_Briefing.md and Advisor.md.
      </p>
    </main>
  );
}
