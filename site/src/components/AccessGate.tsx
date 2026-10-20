// The site-wide access gate: the whole site sits behind GitHub login, and
// nothing renders until a viewer is admitted. Wraps <App/> inside the providers
// (see main.tsx) so it can read useAuth() and drive sign-in.
//
// Three blocked states, all distinguishable from the resolved Viewer:
//   - !authenticated                 → "Sign in with GitHub"
//   - authenticated && !admitted     → "Access pending"
//   - loading                        → neutral splash (avoid flashing the wall
//                                       for an already-authenticated reviewer)
//
// Renders its own minimal chrome — NOT Shell, which assumes an admitted viewer
// and pulls in the topnav/StatusMenu.
import { type ReactNode, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { canSignIn, SESSION_VERIFIER_PARAM, signIn, signOut } from "../lib/auth-actions";
import { useAuth } from "../lib/auth-context";
import { SIGN_IN_PERSONAS, useDevPersona } from "../lib/dev-persona";

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="font-mono text-sm text-muted-foreground">~/open-lakehouse</div>
        {children}
      </div>
    </div>
  );
}

// The dev stand-in for GitHub sign-in: pick a mock persona (see dev-persona.ts).
function DevSignIn() {
  const [, switchPersona] = useDevPersona();
  return (
    <>
      <p className="text-sm text-muted-foreground">Local dev — sign in as a mock persona.</p>
      <div className="flex justify-center gap-2">
        {SIGN_IN_PERSONAS.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => switchPersona(p)}
          >
            {p}
          </Button>
        ))}
      </div>
    </>
  );
}

export default function AccessGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAllowlisted, hasScopedGrants } = useAuth();
  // A scoped grant (review invitation) admits a non-allowlisted contributor, but
  // only to the shared content (server-enforced per item); drafts/dashboard/admin
  // stay gated on isAllowlisted, so admission here grants no site-wide access.
  const admitted = isAllowlisted || hasScopedGrants;

  // Drop the spent OAuth verifier through the router (see SESSION_VERIFIER_PARAM).
  // Waiting for !isLoading keeps it in the URL until the SDK has exchanged it.
  const [params, setParams] = useSearchParams();
  const hasVerifier = params.has(SESSION_VERIFIER_PARAM);
  useEffect(() => {
    if (isLoading || !hasVerifier) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete(SESSION_VERIFIER_PARAM);
        return p;
      },
      { replace: true },
    );
  }, [isLoading, hasVerifier, setParams]);

  // Neutral splash while the viewer resolves, so an already-authenticated
  // reviewer never sees the sign-in wall flash.
  if (isLoading) {
    return <div className="flex min-h-dvh items-center justify-center bg-background" aria-hidden />;
  }

  if (isAuthenticated && admitted) {
    return <>{children}</>;
  }

  // Authenticated but neither allowlisted nor holding a scoped grant: known
  // identity, no access yet.
  if (isAuthenticated && !admitted) {
    return (
      <GateShell>
        <h1 className="text-lg font-semibold">Access pending</h1>
        <p className="text-sm text-muted-foreground">
          You're signed in, but your account isn't on the access list for this preview yet. Reach
          out to a maintainer to be added.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={signOut}>
          Log out
        </Button>
      </GateShell>
    );
  }

  // Not authenticated: offer GitHub sign-in when a hosted flow is configured.
  return (
    <GateShell>
      <h1 className="text-lg font-semibold">Sign in required</h1>
      {import.meta.env.DEV ? (
        <DevSignIn />
      ) : canSignIn() ? (
        <>
          <p className="text-sm text-muted-foreground">
            This preview is private. Sign in with GitHub to continue.
          </p>
          <Button type="button" onClick={signIn}>
            Sign in with GitHub
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sign-in isn't available in this environment yet.
        </p>
      )}
    </GateShell>
  );
}
