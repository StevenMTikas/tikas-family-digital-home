"use client";

// Minimal chrome for the External Viewer surface — a simple header + logout,
// deliberately not NavShell (which assumes a household member with
// Calendar/Tasks/Content/Search/Administration access). Additive to, not a
// replacement for, the root layout's suppression of NavShell/AssistantBubble/
// NotificationsCenter for this role (see app/layout.tsx). See
// Security_Architecture.md's External Viewer section.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/api/auth";

const NAV_ITEMS = [
  { href: "/family-view/photos", label: "Photos" },
  { href: "/family-view/board", label: "Family Board" },
];

export default function FamilyViewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await logout();
    router.push("/family-view/login");
    router.refresh();
  }

  const isLoginPage = pathname === "/family-view/login";

  return (
    <div className="min-h-screen bg-base text-ink font-body">
      {!isLoginPage && (
        <header className="sticky top-0 z-40 bg-surface border-b border-ink/[0.08] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="font-display text-lg font-semibold text-ink">Tikas</span>
            <span className="text-xs text-ink-muted">Family Sharing</span>
          </div>
          <nav className="flex items-center gap-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium ${
                  pathname.startsWith(item.href) ? "text-accent-strong" : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button onClick={handleSignOut} className="text-sm font-medium text-ink-muted">
              Sign Out
            </button>
          </nav>
        </header>
      )}
      <main className="px-4 py-6">{children}</main>
    </div>
  );
}
