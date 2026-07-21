import { createContext, useContext, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTheme } from "next-themes";
import TopbarPath from "./TopbarPath";

interface SidebarContextValue {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within Shell");
  }
  return ctx;
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light/dark"
    >
      {resolvedTheme === "dark" ? "☀︎" : "☾"}
    </button>
  );
}

interface ShellProps {
  children: ReactNode;
  /** Show the mobile sidebar toggle (docs routes). */
  showSidebarToggle?: boolean;
  /** Wider layout without the default content max-width (landing, indexes). */
  wide?: boolean;
  /** Per-project accent: delta | unitycatalog */
  accent?: "delta" | "unitycatalog";
}

export default function Shell({
  children,
  showSidebarToggle = false,
  wide = false,
  accent,
}: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{
        mobileOpen,
        setMobileOpen,
        toggleMobile: () => setMobileOpen((o) => !o),
      }}
    >
      <div className="shell" data-accent={accent}>
        <header className="topbar">
          {showSidebarToggle && (
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              <span className="sidebar-toggle-bar" />
              <span className="sidebar-toggle-bar" />
              <span className="sidebar-toggle-bar" />
            </button>
          )}
          <TopbarPath />
          <nav className="topnav">
            <NavLink
              to="/docs"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Docs
            </NavLink>
            <NavLink
              to="/concepts"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Concepts
            </NavLink>
            <NavLink
              to="/blog"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Blog
            </NavLink>
            <NavLink
              to="/explain"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Explain
            </NavLink>
          </nav>
          <ThemeToggle />
        </header>
        <main className={wide ? "content content-wide" : "content"}>{children}</main>
      </div>
    </SidebarContext.Provider>
  );
}
