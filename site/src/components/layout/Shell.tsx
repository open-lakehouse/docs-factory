import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "next-themes";
import TopbarPath from "./TopbarPath";
import { scopeAccent, useScope, withScope } from "../../scope";

/** The five content axes, in Diátaxis reading order + blog. */
const NAV_AXES: { to: string; label: string }[] = [
  { to: "/tutorials", label: "Tutorials" },
  { to: "/how-to", label: "How-to" },
  { to: "/reference", label: "Reference" },
  { to: "/explanation", label: "Explanation" },
  { to: "/blog", label: "Blog" },
];

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
  const { scopeId } = useScope();
  // Explicit accent wins; otherwise the active scope drives it site-wide.
  const effectiveAccent = accent ?? scopeAccent(scopeId);

  return (
    <SidebarContext.Provider
      value={{
        mobileOpen,
        setMobileOpen,
        toggleMobile: () => setMobileOpen((o) => !o),
      }}
    >
      <div className="shell" data-accent={effectiveAccent}>
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
            {NAV_AXES.map(({ to, label }) => (
              <NavLink
                key={to}
                to={withScope(to, scopeId)}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
        </header>
        <main className={wide ? "content content-wide" : "content"}>{children}</main>
      </div>
    </SidebarContext.Provider>
  );
}
