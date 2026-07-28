// Client-side auth actions (the deferred-login seam). The server resolves the
// viewer from a Neon Auth session cookie (see server/src/auth/neon-auth.ts); the
// only unwired client piece is *initiating* sign-in and sign-out.
//
// Neon Auth is Better Auth, so we drive it with the Better Auth client rather
// than redirecting to a hosted URL — Better Auth has no plain GET sign-in URL;
// sign-in is `authClient.signIn.social({ provider })` (a POST that returns the
// GitHub redirect) and sign-out is `authClient.signOut()`. Going live is setting
// one env var (VITE_NEON_AUTH_BASE_URL) once the Neon Auth project + GitHub OAuth
// app are provisioned; until then the client is undefined and the "Sign in"
// affordance is hidden (mirroring how review-client treats VITE_API_URL).
//
// baseURL is the Neon Auth INSTANCE url (…neonauth.<region>.aws.neon.tech), not
// the site's same-origin /auth proxy: Better Auth builds the OAuth callback from
// its own baseURL and sets the state cookie on that origin, so the handshake must
// address the real host. Our site origin(s) must be listed in Neon Auth's
// trusted_origins (project_config.trusted_origins) or the post-login redirect is
// rejected. See docs/deploy/runbook.md.
//
// Locally, sign-in is unnecessary — the dev persona switcher (x-dev-persona)
// stands in for a real login, so these are effectively no-ops in dev.
import { createAuthClient } from "better-auth/client";

/** The Neon Auth instance base URL, or undefined until provisioned. */
function authBaseUrl(): string | undefined {
  return import.meta.env.VITE_NEON_AUTH_BASE_URL || undefined;
}

// One shared client, created lazily so an unconfigured bundle constructs nothing.
let client: ReturnType<typeof createAuthClient> | undefined;
function authClient() {
  const baseURL = authBaseUrl();
  if (!baseURL) return undefined;
  client ??= createAuthClient({ baseURL });
  return client;
}

/** True when a sign-in destination is configured (gates the "Sign in" affordance). */
export function canSignIn(): boolean {
  return authBaseUrl() !== undefined;
}

/**
 * Start the hosted GitHub sign-in flow, carrying a return-to URL so Neon Auth
 * lands the user back where they were after the session cookie is set. No-op
 * when unconfigured (the "Sign in" control is hidden in that case anyway).
 */
export async function signIn(): Promise<void> {
  const c = authClient();
  if (!c) return;
  await c.signIn.social({ provider: "github", callbackURL: window.location.href });
}

/**
 * Sign out via the Better Auth client (clears the session server-side), then
 * reload so the viewer query re-resolves. When unconfigured (local dev / not yet
 * provisioned) there is no session to clear, so we just reload.
 */
export async function signOut(): Promise<void> {
  const c = authClient();
  if (c) await c.signOut();
  window.location.reload();
}
