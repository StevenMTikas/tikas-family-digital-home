// Help. Referenced by Navigation.md's profile menu as a destination, but no
// module doc defines its content — there's no dedicated Help.md. Kept as a
// minimal placeholder until real content/FAQ is written.

export default function HelpPage() {
  return (
    <main className="p-6 max-w-[560px]">
      <h1 className="font-display text-2xl font-medium">Help</h1>
      <p className="text-ink-muted text-sm mt-1">
        Need a hand with something? For now, the best way to get help is to ask whoever set up the household — your
        Super Admin can add family members, reset a forgotten password, and manage devices from Administration.
      </p>
    </main>
  );
}
