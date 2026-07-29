// Client-side auth actions (the deferred-login seam). The server resolves the
// viewer from the Neon Auth session (see server/src/auth/neon-auth.ts); the
// client initiates sign-in/sign-out AND hands the session token to the API.
//
// We use Neon's official SDK (@neondatabase/neon-js) rather than talking to auth
// endpoints by hand — createAuthClient returns a Better Auth vanilla client, so
// sign-in is `auth.signIn.social({ provider })` and sign-out is `auth.signOut()`.
// Going live is setting one env var (VITE_NEON_AUTH_URL) to the project's Neon
// Auth URL — the full URL shown in the Neon console, including its path, e.g.
// https://ep-….neonauth.<region>.aws.neon.tech/<db>/auth. Until it's set the
// client is undefined and the "Sign in" affordance is hidden.
//
// Why the API gets a *bearer token*, not the session cookie: Neon Auth sets its
// session cookie on the AUTH origin (VITE_NEON_AUTH_URL's host). The API is a
// different origin (the Neon Function, reached via the /api same-origin rewrite),
// so that cookie is never sent to it — a cross-origin cookie the browser scopes
// to the auth host. The fix is to read the session token client-side
// (`getSession().session.token`, which is the SAME opaque value the server
// matches against neon_auth.session.token) and send it as `Authorization:
// Bearer` on every RPC. The server already accepts a bearer (server/src/auth/
// neon-auth.ts), so no server change is needed.
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

// Cache only a RESOLVED (non-null) session token so the transport isn't a
// getSession() call per RPC. We deliberately do NOT cache a null: on a fresh
// load the Better Auth session store hydrates asynchronously, so an early
// getSession() legitimately returns no session — caching that null would make
// every later RPC go out token-less forever (the "signed in but GetViewer is
// anonymous" bug). Leaving null uncached lets the next call re-read once the
// store has hydrated. Cleared explicitly on sign-out.
let cachedToken: string | undefined;

/** The Better Auth session store (a nanostores atom), or undefined if unconfigured. */
function sessionStore() {
  return authClient()?.useSession;
}

/**
 * Subscribe to session changes; fires immediately with the current value and on
 * every hydration/sign-in/out. Returns an unsubscribe fn (no-op when unconfigured).
 * AuthProvider uses this to know when the session has resolved so it can enable
 * the getViewer query only once a bearer is actually available.
 */
export function subscribeSession(listener: () => void): () => void {
  const store = sessionStore();
  if (!store) {
    listener();
    return () => {};
  }
  return store.subscribe(() => listener());
}

/** True once the session store has finished its initial hydration (data or null). */
export function sessionResolved(): boolean {
  const store = sessionStore();
  if (!store) return true; // unconfigured → resolved-as-anonymous, don't block.
  return store.get()?.isPending === false;
}

/**
 * The current Neon Auth session token, or null when signed out / unconfigured.
 * This is the opaque value stored in neon_auth.session.token, which the server
 * matches directly — so sending it as a bearer authenticates the API request
 * even though the session cookie itself never reaches the Function's origin.
 *
 * Always resolved via getSession() (a fresh SDK read), NOT the useSession store
 * snapshot. The store's snapshot exposes the SDK's signed JWT (the `set-auth-jwt`
 * value the SDK caches), which is a DIFFERENT value from the opaque
 * `session.token`; sending the JWT as the bearer resolves to anonymous
 * server-side because the server matches the opaque token. getSession()'s return
 * value carries the opaque `session.token`. We only cache a resolved (non-null)
 * result so the transport isn't a network call per RPC.
 */
export async function sessionToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  return refreshSessionToken();
}

/** Re-read the session token from the SDK (after sign-in or a redirect). */
export async function refreshSessionToken(): Promise<string | null> {
  const c = authClient();
  if (!c) return null;
  // getSession() resolves to a Better Auth fetch result ({ data, error }); the
  // session (and its opaque token) live under `data`. Any error / no session →
  // null (request goes out anonymous), but we don't cache the null so a later
  // call re-reads once the session exists.
  const res = await c.getSession();
  const token = res.data?.session?.token ?? null;
  if (token) cachedToken = token;
  return token;
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
  cachedToken = undefined;
  window.location.reload();
}
