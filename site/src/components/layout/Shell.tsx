import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "next-themes";
import { useQuery } from "@connectrpc/connect-query";
import TopbarPath from "./TopbarPath";
import StatusMenu from "./StatusMenu";
import { useAuth } from "../../lib/auth-context";
import { listDrafts } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState } from "../../gen/docs_factory/review/v1/messages_pb";
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

// Reviewer-only top-nav entry linking to the /review dashboard. Badges the count
// of content actively in review so a reviewer sees pending work at a glance. The
// listDrafts query is shared (cached) with the dashboard and content-visibility.
function ReviewNavItem() {
  const { reviewActive } = useAuth();
  const { data } = useQuery(listDrafts, {}, { enabled: reviewActive });
  if (!reviewActive) return null;
  const pending = (data?.drafts ?? []).filter(
    (d) =>
      d.reviewState === ReviewState.IN_REVIEW ||
      d.reviewState === ReviewState.CHANGES_REQUESTED,
  ).length;
  return (
    <NavLink to="/review" className={({ isActive }) => (isActive ? "active" : undefined)}>
      Review
      {pending > 0 && <span className="topnav-badge">{pending}</span>}
    </NavLink>
  );
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
  const { reviewActive } = useAuth();
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
      <div className="shell" data-accent={effectiveAccent} data-review-active={reviewActive}>
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
            <ReviewNavItem />
          </nav>
          <ThemeToggle />
          <StatusMenu />
        </header>
        <main className={wide ? "content content-wide" : "content"}>{children}</main>
      </div>
    </SidebarContext.Provider>
  );
}
