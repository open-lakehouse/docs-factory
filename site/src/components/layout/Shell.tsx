import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "next-themes";
import { useQuery } from "@connectrpc/connect-query";
import { Monitor, Moon, Sun } from "lucide-react";
import TopbarPath from "./TopbarPath";
import StatusMenu from "./StatusMenu";
import { useAuth } from "../../lib/auth-context";
import { listReviewRequests } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { scopeAccent, useScope, withScope } from "../../scope";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Two top-level content areas: Docs (all four Diátaxis axes on one page) + blog. */
const NAV_AXES: { to: string; label: string }[] = [
  { to: "/docs", label: "Docs" },
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

// Reviewer-only top-nav entry linking to the /review workspace. Badges the
// count of open review requests addressed to the current viewer (same signal
// as the left-tree UserCheck indicators).
function ReviewNavItem() {
  const { reviewActive } = useAuth();
  const { data } = useQuery(
    listReviewRequests,
    { mine: true, openOnly: true },
    { enabled: reviewActive },
  );
  if (!reviewActive) return null;
  const requested = data?.requests.length ?? 0;
  return (
    <NavLink to="/review" className={({ isActive }) => (isActive ? "active" : undefined)}>
      Review
      {requested > 0 && <span className="topnav-badge">{requested}</span>}
    </NavLink>
  );
}

// Site-admin-only top-nav entry linking to the admin roster (/admin): allowlist
// management + registered-user discovery. Gated on isSiteAdmin (Neon Auth's
// admin role, not reviewActive) so it's reachable whenever a site admin is
// signed in, regardless of view mode. Hidden from plain maintainers.
function AdminNavItem() {
  const { isSiteAdmin } = useAuth();
  if (!isSiteAdmin) return null;
  return (
    <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : undefined)}>
      Admin
    </NavLink>
  );
}

type ThemeChoice = "system" | "light" | "dark";

function ThemeIcon({ theme }: { theme: ThemeChoice }) {
  switch (theme) {
    case "light":
      return <Sun aria-hidden />;
    case "dark":
      return <Moon aria-hidden />;
    case "system":
      return <Monitor aria-hidden />;
  }
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // next-themes may briefly report undefined before hydration; treat as system
  // (the ThemeProvider default) so the trigger doesn't flash the wrong glyph.
  const current: ThemeChoice =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="theme-toggle"
          aria-label={`Theme: ${current}`}
          title={`Theme: ${current}`}
        >
          <ThemeIcon theme={current} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system" onSelect={(e) => e.preventDefault()}>
            <Monitor aria-hidden />
            System
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" onSelect={(e) => e.preventDefault()}>
            <Sun aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" onSelect={(e) => e.preventDefault()}>
            <Moon aria-hidden />
            Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
            <AdminNavItem />
          </nav>
          <ThemeToggle />
          <StatusMenu />
        </header>
        <main className={wide ? "content content-wide" : "content"}>{children}</main>
      </div>
    </SidebarContext.Provider>
  );
}
