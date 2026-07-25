import type { Metadata } from "next";
import "./globals.css";

// Root layout. Navigation shell (sidebar/tab bar, profile menu, Assistant
// chat bubble) belongs here once built — see docs/03_User_Experience/Navigation.md.

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
    <html lang="en">
      <body className="bg-base text-ink font-body">{children}</body>
    </html>
  );
}
