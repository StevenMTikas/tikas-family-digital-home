"use client";

// Global navigation shell — see docs/03_User_Experience/Navigation.md:
// mobile-first bottom tab bar (Dashboard/Calendar/Tasks/Content/Search),
// a desktop sidebar showing the same destinations, and a top-right profile
// avatar/dropdown (My Profile, AI Settings, Help, Administration, Sign Out).
// Rendered once from app/layout.tsx for every authenticated page.
//
// Administration only appears for `role === "super_admin"` here, not
// "Admin or Super Admin" as Navigation.md's text literally says — the
// Administration route itself is hard-gated to super_admin only (a
// deliberate Phase 4 deferral: no scoped-Admin reduced view exists yet), so
// showing the menu item to a plain Admin would just route them into a wall.

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { logout } from "@/lib/api/auth";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/tasks", label: "Tasks", icon: "✅" },
  { href: "/content", label: "Content", icon: "📁" },
  { href: "/search", label: "Search", icon: "🔍" },
];

export interface NavShellProps {
  fullName: string;
  photo: string | null;
  isSuperAdmin: boolean;
}

function initialsOf(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export default function NavShell({ fullName, photo, isSuperAdmin }: NavShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  useEscapeKey(menuOpen, () => setMenuOpen(false));

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Top bar — profile avatar, present on both mobile and desktop per Navigation.md */}
      <div className="fixed top-0 left-0 right-0 md:left-56 h-14 bg-surface border-b border-ink/[0.08] z-40 flex items-center justify-end px-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Profile menu"
            // bg-accent fails WCAG AA for the white initials text (~2.9:1, Design_Language.md) — accent-strong passes (~4.66:1)
            className="w-9 h-9 rounded-full bg-accent-strong flex items-center justify-center text-white text-xs font-semibold overflow-hidden"
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              initialsOf(fullName)
            )}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-52 bg-surface rounded-2xl shadow-[0_16px_40px_rgba(58,52,44,0.18)] py-2 z-50">
                <MenuLink href="/users" label="My Profile" onClick={() => setMenuOpen(false)} />
                <MenuLink href="/ai-settings" label="AI Settings" onClick={() => setMenuOpen(false)} />
                <MenuLink href="/help" label="Help" onClick={() => setMenuOpen(false)} />
                {isSuperAdmin && <MenuLink href="/administration" label="Administration" onClick={() => setMenuOpen(false)} />}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2 text-[13px] text-urgent"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop sidebar */}
      <nav className="hidden md:flex fixed top-0 left-0 bottom-0 w-56 bg-surface border-r border-ink/[0.08] flex-col py-5 px-3 z-40">
        <div className="font-display text-lg font-medium text-ink px-3 pb-6">Tikas Home</div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${
              isActive(item.href) ? "bg-accent/[0.12] text-ink font-medium" : "text-ink-muted"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-ink/[0.08] flex z-40">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${
              isActive(item.href) ? "text-accent-strong font-medium" : "text-ink-muted"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function MenuLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2 text-[13px] text-ink">
      {label}
    </Link>
  );
}
