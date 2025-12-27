"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const EDIT_PATTERNS: RegExp[] = [/^\/strategies\/[^/]+\/edit/];
const WORKSPACE_EVENT = "crucible:workspace-mode";

export function NavBar(): JSX.Element | null {
  const pathname = usePathname();
  const [workspaceActive, setWorkspaceActive] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

  const toggleDropdown = (name: string): void => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const closeDropdowns = (): void => {
    setOpenDropdown(null);
  };

  return (
    <nav className="navbar" onMouseLeave={closeDropdowns}>
      <div className="badge">crucible trader</div>
      <div className="nav-links">
        <div className="nav-dropdown" onMouseEnter={() => toggleDropdown("backtests")}>
          <button className="nav-dropdown-trigger">
            backtests
            <span className="nav-dropdown-icon">▾</span>
          </button>
          {openDropdown === "backtests" && (
            <div className="nav-dropdown-menu">
              <Link href="/runs" onClick={closeDropdowns}>
                view runs
              </Link>
              <Link href="/new-run" onClick={closeDropdowns}>
                new run
              </Link>
              <Link href="/optimize" onClick={closeDropdowns}>
                optimize
              </Link>
            </div>
          )}
        </div>

        <Link href="/strategies">strategies</Link>

        <div className="nav-dropdown" onMouseEnter={() => toggleDropdown("data")}>
          <button className="nav-dropdown-trigger">
            data
            <span className="nav-dropdown-icon">▾</span>
          </button>
          {openDropdown === "data" && (
            <div className="nav-dropdown-menu">
              <Link href="/datasets" onClick={closeDropdowns}>
                datasets
              </Link>
            </div>
          )}
        </div>

        <div className="nav-dropdown" onMouseEnter={() => toggleDropdown("config")}>
          <button className="nav-dropdown-trigger">
            config
            <span className="nav-dropdown-icon">▾</span>
          </button>
          {openDropdown === "config" && (
            <div className="nav-dropdown-menu">
              <Link href="/risk" onClick={closeDropdowns}>
                risk profiles
              </Link>
            </div>
          )}
        </div>

        <Link href="/reports">reports</Link>
      </div>
    </nav>
  );
}
