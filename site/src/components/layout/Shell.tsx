import { useQuery } from "@connectrpc/connect-query";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listReviewRequests } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import StatusMenu from "./StatusMenu";

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
// signed in. Hidden from plain maintainers.
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

export default function Shell({ children }: { children: ReactNode }) {
  const { reviewActive } = useAuth();
  return (
    <div className="shell" data-review-active={reviewActive}>
      <header className="topbar">
        <nav className="topbar-crumbtrail" aria-label="Home">
          <Link to="/review" className="brand">
            ~/open-lakehouse
          </Link>
        </nav>
        <nav className="topnav">
          <ReviewNavItem />
          <AdminNavItem />
        </nav>
        <ThemeToggle />
        <StatusMenu />
      </header>
      <main className="content content-wide">{children}</main>
    </div>
  );
}
