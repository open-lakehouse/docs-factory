// Top-bar login/status control. Shown for all viewers:
//   - anonymous → a "Sign in" button (only when a hosted sign-in URL is
//     configured; hidden until Neon Auth is provisioned — see lib/auth-actions).
//   - authenticated → an avatar + login opening a menu with, for reviewers, the
//     Site review mode toggle and a link to the /review dashboard, plus Log out.
//
// The review-mode toggle is the opt-in that turns the comment chrome on (see
// auth-context.reviewActive). Local impersonation stays in DevPersonaSwitcher;
// this is the real, production-facing control.
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "../../lib/auth-context";
import { canSignIn, signIn, signOut } from "../../lib/auth-actions";
import { initials } from "../../lib/initials";

export default function StatusMenu() {
  const { isLoading, isAuthenticated, isAllowlisted, viewer, reviewModeOn, setReviewMode } =
    useAuth();

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
            <DropdownMenuCheckboxItem
              checked={reviewModeOn}
              onCheckedChange={(v) => setReviewMode(Boolean(v))}
              // Keep the menu open on toggle so the state change is visible.
              onSelect={(e) => e.preventDefault()}
            >
              Site review mode
            </DropdownMenuCheckboxItem>
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
