import type { Metadata, Viewport } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { getDb } from "@/db/client";
import { isAiEnabledForUser } from "@/lib/core/ai";
import AssistantBubble from "@/components/AssistantBubble";
import NotificationsCenter from "@/components/NotificationsCenter";
import NavShell from "@/components/NavShell";
import PwaRegistration from "@/components/PwaRegistration";

// Root layout. Navigation.md's nav shell (bottom tab bar / desktop sidebar
// / profile menu) now lives here, wrapping every authenticated page — the
// Assistant bubble and Notifications bell predate it (built as
// self-contained global elements before the shell existed) and stay
// separate floating elements rather than being folded into NavShell.

// Typefaces per Design_Language.md / the design handoff: Fraunces (display) +
// Public Sans (body) — see tailwind.config.ts fontFamily for how these plug in.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Tikas Family Digital Home",
  description: "A dependable member of the household.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#C98A3E",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Unset on /login (middleware.ts doesn't run there) and on any other
  // unauthenticated request — the bubble only shows once logged in, and
  // per AI.md, not at all when the user has turned their AI off.
  const userId = (await headers()).get("x-user-id");
  const showAssistant = userId ? await isAiEnabledForUser(userId) : false;
  // Notifications aren't an AI feature (reminders/admin alerts flow through
  // here too, per Notifications.md), so this only gates on being logged in.
  const showNotifications = !!userId;

  const navUser = userId
    ? (getDb().prepare(`SELECT full_name, photo, role FROM users WHERE id = ?`).get(userId) as
        | { full_name: string; photo: string | null; role: string }
        | undefined)
    : undefined;

  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable}`}>
      <body className="bg-base text-ink font-body">
        <PwaRegistration />
        {navUser ? (
          <>
            <NavShell fullName={navUser.full_name} photo={navUser.photo} isSuperAdmin={navUser.role === "super_admin"} />
            <div className="md:pl-56 pt-14 pb-16 md:pb-0">{children}</div>
          </>
        ) : (
          children
        )}
        {showNotifications && <NotificationsCenter />}
        {showAssistant && <AssistantBubble />}
      </body>
    </html>
  );
}
