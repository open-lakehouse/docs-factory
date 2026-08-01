// The site-wide access gate. For the initial release the whole site sits behind
// a GitHub login and is restricted to allowlisted users; nothing renders until a
// viewer is both authenticated AND allowlisted. It wraps <App/> inside all the
// providers (see main.tsx) so it can read useAuth() and drive sign-in.
//
// Three blocked states, all distinguishable from the resolved Viewer:
//   - !authenticated                 → "Sign in with GitHub"
//   - authenticated && !allowlisted  → "Access pending / not authorized"
//   - loading                        → neutral splash (avoid flashing the wall
//                                       for an already-authenticated reviewer)
// Only when authenticated && allowlisted do we render the gated app.
//
// The gate renders its own minimal chrome — NOT Shell, which assumes an admitted
// viewer and pulls in the topnav/StatusMenu. In dev it also mounts the
// DevPersonaSwitcher (relocated here from App) so the persona can be flipped from
// the sign-in / pending screens, which is how you change identity locally.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../lib/auth-context";
import { canSignIn, signIn, signOut } from "../lib/auth-actions";
import DevPersonaSwitcher from "./DevPersonaSwitcher";

/** A centered single-panel layout for the pre-admission screens. */
function GateShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="font-mono text-sm text-muted-foreground">~/open-lakehouse</div>
          {children}
        </div>
      </div>
      {/* Dev-only; no-op in prod. Lets you flip persona from the gate screens. */}
      <DevPersonaSwitcher />
    </>
  );
}

export default function AccessGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAllowlisted, hasScopedGrants } = useAuth();
  // An external contributor (not allowlisted) is admitted when they hold a scoped
  // content grant — a review invitation. They see only the content shared with
  // them (server-enforced per item); every drafts/dashboard/admin surface stays
  // gated on isAllowlisted, so admission here grants no site-wide access.
  const admitted = isAllowlisted || hasScopedGrants;

  // Neutral splash while the viewer resolves — mirrors StatusMenu's loading
  // placeholder so an already-authenticated reviewer never sees the sign-in wall.
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" aria-hidden />
    );
  }

  // Admitted: render the real app. The dev switcher rides along (no-op in prod)
  // so you can flip persona — e.g. back to anon — from inside the admitted app.
  if (isAuthenticated && admitted) {
    return (
      <>
        {children}
        <DevPersonaSwitcher />
      </>
    );
  }

  // Authenticated but neither allowlisted nor holding a scoped grant: known
  // identity, no access yet.
  if (isAuthenticated && !admitted) {
    return (
      <GateShell>
        <h1 className="text-lg font-semibold">Access pending</h1>
        <p className="text-sm text-muted-foreground">
          You're signed in, but your account isn't on the access list for this
          preview yet. Reach out to a maintainer to be added.
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
      {canSignIn() ? (
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
