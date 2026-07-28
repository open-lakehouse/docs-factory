// Top-bar login/status control. Shown for all viewers:
//   - anonymous → a "Sign in" button (only when a hosted sign-in URL is
//     configured; hidden until Neon Auth is provisioned — see lib/auth-actions).
//   - authenticated → an avatar + login opening a menu with, for reviewers, a
//     three-state view-mode selector and a link to the /review dashboard, plus
//     Log out.
//
// The view-mode selector is the real, production-facing control that merges the
// review-chrome opt-in with a "view as anonymous" preview (see auth-context:
// viewMode / reviewActive / previewAsAnon). Local dev impersonation stays in
// DevPersonaSwitcher — orthogonal to this.
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth, type ViewMode } from "../../lib/auth-context";
import { canSignIn, signIn, signOut } from "../../lib/auth-actions";
import { initials } from "../../lib/initials";

export default function StatusMenu() {
  const { isLoading, isAuthenticated, isAllowlisted, viewer, viewMode, setViewMode } = useAuth();

  // Neutral placeholder while the viewer resolves — avoids a flash of "Sign in"
  // for an already-authenticated reviewer (matches DevPersonaSwitcher's "…").
  if (isLoading) {
    return <span className="status-menu-loading" aria-hidden />;
  }

  if (!isAuthenticated) {
    if (!canSignIn()) return null;
    return (
      <Button type="button" variant="outline" size="sm" onClick={signIn}>
        Sign in
      </Button>
    );
  }

  const login = viewer?.login ?? "";
  const displayName = viewer?.name || login;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="status-menu-trigger" aria-label="Account menu">
          <Avatar className="size-6">
            <AvatarImage src={`https://github.com/${login}.png?size=48`} alt="" />
            <AvatarFallback className="text-[0.6rem]">{initials(displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
        {isAllowlisted && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              View mode
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
            >
              {/* Keep the menu open on select so the state change is visible. */}
              <DropdownMenuRadioItem value="normal" onSelect={(e) => e.preventDefault()}>
                Normal
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="review" onSelect={(e) => e.preventDefault()}>
                Review
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="anon-preview" onSelect={(e) => e.preventDefault()}>
                View as anonymous
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/review">Review dashboard</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
