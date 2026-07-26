import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { isAiEnabledForUser } from "@/lib/core/ai";
import AssistantBubble from "@/components/AssistantBubble";

// Root layout. Sidebar/tab bar nav shell belongs here once built
// (Navigation.md is Phase 7). The Assistant bubble is rendered here now,
// ahead of that shell, since it's a self-contained global element and
// Assistant.md requires it "available on every screen" — it doesn't need
// the full nav shell to satisfy that.

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

  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable}`}>
      <body className="bg-base text-ink font-body">
        {children}
        {showAssistant && <AssistantBubble />}
      </body>
    </html>
  );
}
