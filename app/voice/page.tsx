// Voice module. Per docs/02_Modules/Voice.md's Screen Layout: "Within the
// Assistant chat interface" — tap-to-talk and spoken replies are scoped to
// the Assistant bubble/panel (components/AssistantBubble.tsx) for MVP, not
// a dedicated screen. This route exists because the Phase 0 scaffold
// created it, but there's nothing module-specific to build here.

export default function VoicePage() {
  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-medium">Voice</h1>
      <p className="text-ink-muted text-sm mt-1">
        Voice input and spoken replies live inside the Assistant — tap the chat bubble in the corner, then the 🎤
        button next to the message box.
      </p>
    </main>
  );
}
