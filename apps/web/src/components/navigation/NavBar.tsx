"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const EDIT_PATTERNS: RegExp[] = [/^\/strategies\/[^/]+\/edit/];
const WORKSPACE_EVENT = "crucible:workspace-mode";

export function NavBar(): JSX.Element | null {
  const pathname = usePathname();
  const [workspaceActive, setWorkspaceActive] = useState(false);

  useEffect(() => {
    const handleWorkspaceToggle = (event: Event): void => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setWorkspaceActive(Boolean(detail?.active));
    };
    window.addEventListener(WORKSPACE_EVENT, handleWorkspaceToggle as EventListener);
    return () => {
      window.removeEventListener(WORKSPACE_EVENT, handleWorkspaceToggle as EventListener);
    };
  }, []);

  const isStrategyNew = pathname === "/strategies/new";
  const hideForStrategyNew = isStrategyNew && workspaceActive;
  const hideForEdit = pathname ? EDIT_PATTERNS.some((pattern) => pattern.test(pathname)) : false;

  if (hideForStrategyNew || hideForEdit) {
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
