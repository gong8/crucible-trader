"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN_PATTERNS: RegExp[] = [/^\/strategies\/new/, /^\/strategies\/[^/]+\/edit/];

export function NavBar(): JSX.Element | null {
  const pathname = usePathname();
  if (pathname && HIDDEN_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="badge">crucible trader</div>
      <div className="nav-links">
        <Link href="/runs">runs</Link>
        <Link href="/new-run">new run</Link>
        <Link href="/strategies">strategies</Link>
        <Link href="/datasets">datasets</Link>
        <Link href="/risk">risk</Link>
        <Link href="/reports">reports</Link>
      </div>
    </nav>
  );
}
