// Client-side auth actions (the deferred-login seam). The server resolves the
// viewer from the Neon Auth session (see server/src/auth/neon-auth.ts); the only
// unwired client piece is *initiating* sign-in and sign-out.
//
// We use Neon's official SDK (@neondatabase/neon-js) rather than talking to auth
// endpoints by hand — createAuthClient returns a Better Auth vanilla client, so
// sign-in is `auth.signIn.social({ provider })` and sign-out is `auth.signOut()`.
// Going live is setting one env var (VITE_NEON_AUTH_URL) to the project's Neon
// Auth URL — the full URL shown in the Neon console, including its path, e.g.
// https://ep-….neonauth.<region>.aws.neon.tech/<db>/auth. Until it's set the
// client is undefined and the "Sign in" affordance is hidden.
//
// Locally, sign-in is unnecessary — the dev persona switcher (x-dev-persona)
// stands in for a real login, so these are effectively no-ops in dev.
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js";

/** The Neon Auth URL (full, incl. path), or undefined until provisioned. */
function authUrl(): string | undefined {
  return import.meta.env.VITE_NEON_AUTH_URL || undefined;
}

// One shared client, created lazily so an unconfigured bundle constructs nothing.
// Passing the vanilla adapter explicitly narrows the return type to the Better
// Auth vanilla client (signIn.social / signOut / getSession).
let client: ReturnType<typeof makeClient> | undefined;
function makeClient(url: string) {
  return createAuthClient(url, { adapter: BetterAuthVanillaAdapter() });
}
function authClient() {
  const url = authUrl();
  if (!url) return undefined;
  client ??= makeClient(url);
  return client;
}

/** True when a sign-in destination is configured (gates the "Sign in" affordance). */
export function canSignIn(): boolean {
  return authUrl() !== undefined;
}

/**
 * Start the hosted GitHub sign-in flow, carrying a return-to URL so Neon Auth
 * lands the user back where they were after the session is set. No-op when
 * unconfigured (the "Sign in" control is hidden in that case anyway).
 */
export async function signIn(): Promise<void> {
  const c = authClient();
  if (!c) return;
  await c.signIn.social({ provider: "github", callbackURL: window.location.href });
}

/**
 * Sign out via the SDK (clears the session), then reload so the viewer query
 * re-resolves. When unconfigured (local dev / not yet provisioned) there is no
 * session to clear, so we just reload.
 */
export async function signOut(): Promise<void> {
  const c = authClient();
  if (c) await c.signOut();
  window.location.reload();
}
