// Client-side auth actions (the deferred-login seam). The server already resolves
// the viewer from a Neon Auth session cookie (see server/src/auth/neon-auth.ts);
// the only unwired client piece is *initiating* sign-in and sign-out. We do that
// with a plain browser redirect to Neon Auth's hosted flow rather than embedding
// a client SDK — no heavy dependency, and the whole end-to-end path is designed:
// going live is just setting the two env vars below once the OAuth app is
// provisioned. Both are optional (undefined until then), mirroring how
// review-client treats VITE_API_URL / VITE_REVIEW_SSE as env-driven and optional.
//
// Locally, sign-in is unnecessary — the dev persona switcher (x-dev-persona)
// stands in for a real login, so these are effectively no-ops in dev.

/** Hosted Neon Auth sign-in URL, or undefined until provisioned. */
export function authSignInUrl(): string | undefined {
  return import.meta.env.VITE_AUTH_SIGNIN_URL || undefined;
}

/** Hosted Neon Auth sign-out URL, or undefined until provisioned. */
export function authSignOutUrl(): string | undefined {
  return import.meta.env.VITE_AUTH_SIGNOUT_URL || undefined;
}

/** True when a sign-in destination is configured (gates the "Sign in" affordance). */
export function canSignIn(): boolean {
  return authSignInUrl() !== undefined;
}

/**
 * Redirect to the hosted sign-in flow, carrying a return-to URL so Neon Auth
 * lands the user back where they were after setting the session cookie. No-op
 * when unconfigured (the "Sign in" control is hidden in that case anyway).
 */
export function signIn(): void {
  const base = authSignInUrl();
  if (!base) return;
  const url = new URL(base);
  url.searchParams.set("return_to", window.location.href);
  window.location.assign(url.toString());
}

/**
 * Sign out: hand off to the hosted sign-out URL when configured (it clears the
 * HttpOnly session cookie server-side and redirects back). When unconfigured
 * (e.g. local dev / not yet provisioned) there is no cookie we can clear from
 * JS, so we just reload — the viewer query re-resolves to whatever the server
 * returns.
 */
export function signOut(): void {
  const url = authSignOutUrl();
  if (url) {
    const u = new URL(url);
    u.searchParams.set("return_to", window.location.origin);
    window.location.assign(u.toString());
    return;
  }
  window.location.reload();
}
