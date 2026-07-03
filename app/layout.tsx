import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ShieldCheck, Trophy, UserRound } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCAF League",
  description: "Mobile sports league tournament management"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <Trophy size={24} aria-hidden />
              <span>SCAF League</span>
            </Link>
            <nav className="nav-actions" aria-label="Primary">
              <Link href="/admin" aria-label="Admin">
                <ShieldCheck size={20} />
              </Link>
              <Link href="/player" aria-label="Player matches">
                <UserRound size={20} />
              </Link>
              <Link href="/login" aria-label="Login">
                <CalendarDays size={20} />
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
