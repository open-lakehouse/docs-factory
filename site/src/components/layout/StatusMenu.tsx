// Top-bar login/status control:
//   - anonymous → "Sign in" button, but only when a hosted sign-in URL is
//     configured (hidden until Neon Auth is provisioned — see lib/auth-actions).
//     In dev it is a "sign in as…" persona menu instead (the mock login).
//   - authenticated → avatar menu with Log out. In dev it also carries a
//     persona switcher and the review display (rail/inline) toggle.

import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "../../lib/auth-context";
import { type DevPersona, SIGN_IN_PERSONAS, useDevPersona } from "../../lib/dev-persona";
import { initials } from "../../lib/initials";
import { type ReviewDisplayMode, useReviewDisplayMode } from "../../lib/review-display-mode";

function DevSignInMenu() {
  const [, switchPersona] = useDevPersona();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Sign in
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Sign in as (dev)
        </DropdownMenuLabel>
        {SIGN_IN_PERSONAS.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => switchPersona(p)}>
            {p}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DevMenuSection({ apiOffline }: { apiOffline: boolean }) {
  const [persona, switchPersona] = useDevPersona();
  const [displayMode, setDisplayMode] = useReviewDisplayMode();
  return (
    <>
      <DropdownMenuSeparator />
      {apiOffline ? (
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Review API not running — start it with <code>just dev</code>
        </DropdownMenuLabel>
      ) : (
        <>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Dev persona
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={persona}
            onValueChange={(v) => switchPersona(v as DevPersona)}
          >
            {SIGN_IN_PERSONAS.map((p) => (
              <DropdownMenuRadioItem key={p} value={p} onSelect={(e) => e.preventDefault()}>
                {p}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Review display
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={displayMode}
            onValueChange={(v) => setDisplayMode(v as ReviewDisplayMode)}
          >
            <DropdownMenuRadioItem value="rail" onSelect={(e) => e.preventDefault()}>
              rail
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="inline" onSelect={(e) => e.preventDefault()}>
              inline
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </>
      )}
    </>
  );
}

export default function StatusMenu() {
  const { isLoading, isAuthenticated, apiOffline, viewer } = useAuth();

  // Neutral placeholder while the viewer resolves, avoiding a flash of "Sign in"
  // for an already-authenticated reviewer.
  if (isLoading) {
    return <span className="status-menu-loading" aria-hidden />;
  }

  if (!isAuthenticated) {
    if (import.meta.env.DEV) return <DevSignInMenu />;
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
    <>
      {apiOffline && (
        <Badge
          variant="outline"
          className="border-amber-400/60 text-amber-400"
          title="Review API not running — start it with `just dev`"
        >
          API offline
        </Badge>
      )}
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
          {import.meta.env.DEV && <DevMenuSection apiOffline={apiOffline} />}
          {/* Offline there is no session to end — the local author is synthetic. */}
          {!apiOffline && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/tokens">Agent tokens</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={signOut}>Log out</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
