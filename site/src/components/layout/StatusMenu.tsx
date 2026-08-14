// Top-bar login/status control:
//   - anonymous → "Sign in" button, but only when a hosted sign-in URL is
//     configured (hidden until Neon Auth is provisioned — see lib/auth-actions).
//   - authenticated → avatar menu with Log out, plus (reviewers only) the
//     view-mode selector and a /review dashboard link.
//
// The view-mode selector is production-facing (auth-context: viewMode /
// reviewActive / previewAsAnon); local dev impersonation lives orthogonally in
// DevPersonaSwitcher.
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canSignIn, signIn, signOut } from "../../lib/auth-actions";
import { useAuth, type ViewMode } from "../../lib/auth-context";
import { initials } from "../../lib/initials";

export default function StatusMenu() {
  const { isLoading, isAuthenticated, isAllowlisted, viewer, viewMode, setViewMode } = useAuth();

  // Neutral placeholder while the viewer resolves, avoiding a flash of "Sign in"
  // for an already-authenticated reviewer.
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
