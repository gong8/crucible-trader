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

  const isActive = (path: string): boolean => pathname === path;

  return (
    <nav className="navbar">
      <Link href="/runs" className="navbar-brand">
        crucible trader
      </Link>
      <div className="nav-links">
        <Link href="/new-run" className={isActive("/new-run") ? "active" : ""}>
          new run
        </Link>
        <Link href="/runs" className={isActive("/runs") ? "active" : ""}>
          runs
        </Link>
        <Link href="/strategies" className={isActive("/strategies") ? "active" : ""}>
          strategies
        </Link>
        <Link href="/optimize" className={isActive("/optimize") ? "active" : ""}>
          optimize
        </Link>
        <Link href="/reports" className={isActive("/reports") ? "active" : ""}>
          reports
        </Link>
        <Link href="/datasets" className={isActive("/datasets") ? "active" : ""}>
          datasets
        </Link>
        <Link href="/risk" className={isActive("/risk") ? "active" : ""}>
          risk
        </Link>
      </div>
    </nav>
  );
}
