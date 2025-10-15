import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "crucible trader",
  description: "phase 0 run console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>
        <nav className="navbar">
          <div className="badge">crucible trader</div>
          <div className="nav-links">
            <Link href="/runs">runs</Link>
            <Link href="/new-run">new run</Link>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
