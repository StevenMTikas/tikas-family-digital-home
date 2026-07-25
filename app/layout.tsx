import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import "./globals.css";

// Root layout. Navigation shell (sidebar/tab bar, profile menu, Assistant
// chat bubble) belongs here once built — see docs/03_User_Experience/Navigation.md.

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable}`}>
      <body className="bg-base text-ink font-body">{children}</body>
    </html>
  );
}
