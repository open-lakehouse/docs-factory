// Client-side auth actions (the deferred-login seam). The server resolves the
// viewer from the Neon Auth session (see server/src/auth/neon-auth.ts); the
// client initiates sign-in/sign-out AND hands the JWT to the API.
//
// We use Neon's official SDK (@neondatabase/neon-js). `createInternalNeonAuth`
// returns `{ adapter, getJWTToken }`: `adapter` is the Better Auth vanilla
// client (sign-in is `adapter.signIn.social({ provider })`, sign-out is
// `adapter.signOut()`, and `adapter.useSession` is the session nanostore), and
// `getJWTToken()` is the SDK's single-source-of-truth accessor for the signed
// JWT (see "the bearer is the JWT" below). We use the internal factory rather
// than `createAuthClient` because the latter returns ONLY `.adapter` and drops
// `getJWTToken` — leaving no supported way to read the JWT.
// Going live is setting one env var (VITE_NEON_AUTH_URL) to the project's Neon
// Auth URL — the full URL shown in the Neon console, including its path, e.g.
// https://ep-….neonauth.<region>.aws.neon.tech/<db>/auth. Until it's set the
// client is undefined and the "Sign in" affordance is hidden.
//
// Why the API gets a *bearer token*, not the session cookie: Neon Auth sets its
// session cookie on the AUTH origin (VITE_NEON_AUTH_URL's host). The API is a
// different origin (the Neon Function, reached via the /api same-origin rewrite),
// so that cookie is never sent to it — a cross-origin cookie the browser scopes
// to the auth host. So we read the JWT client-side and send it as `Authorization:
// Bearer` on every RPC; the server verifies it via JWKS (server/src/auth/
// neon-auth.ts).
//
// The bearer IS the signed JWT (Better Auth's `set-auth-jwt`), not the opaque
// session token. The Neon Auth adapter installs a Better Auth `onSuccess` hook
// that OVERWRITES `session.token` with the `set-auth-jwt` header value, and
// `getJWTToken()` returns exactly that injected JWT. We call `getJWTToken()`
// (the documented accessor) rather than reaching into `getSession().session.token`
// so we don't depend on that injection as an undocumented implementation detail.
//
// Locally, sign-in is unnecessary — the dev persona switcher (x-dev-persona)
// stands in for a real login, so these are effectively no-ops in dev.
import { createInternalNeonAuth } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js";

/** The Neon Auth URL (full, incl. path), or undefined until provisioned. */
function authUrl(): string | undefined {
  return import.meta.env.VITE_NEON_AUTH_URL || undefined;
}

// One shared NeonAuth instance, created lazily so an unconfigured bundle
// constructs nothing. `.adapter` is the Better Auth vanilla client
// (signIn.social / signOut / getSession / useSession); `.getJWTToken()` reads
// the signed JWT.
let neonAuth: ReturnType<typeof makeNeonAuth> | undefined;
function makeNeonAuth(url: string) {
  return createInternalNeonAuth(url, { adapter: BetterAuthVanillaAdapter() });
}
function neonAuthInstance() {
  const url = authUrl();
  if (!url) return undefined;
  neonAuth ??= makeNeonAuth(url);
  return neonAuth;
}

/** The Better Auth vanilla client (signIn / signOut / getSession / useSession). */
function authClient() {
  return neonAuthInstance()?.adapter;
}

/** True when a sign-in destination is configured (gates the "Sign in" affordance). */
export function canSignIn(): boolean {
  return authUrl() !== undefined;
}

// Cache only a RESOLVED (non-null) JWT so the transport isn't a getJWTToken()
// call per RPC. We deliberately do NOT cache a null: on a fresh load the Better
// Auth session store hydrates asynchronously, so an early read legitimately
// returns no token — caching that null would make every later RPC go out
// token-less forever (the "signed in but GetViewer is anonymous" bug). Leaving
// null uncached lets the next call re-read once the store has hydrated. Cleared
// explicitly on sign-out.
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
 * The current Neon Auth JWT, or null when signed out / unconfigured. This is the
 * signed `set-auth-jwt` the server verifies via JWKS (server/src/auth/
 * neon-auth.ts) — sending it as a bearer authenticates the API request even
 * though the session cookie itself never reaches the Function's origin.
 *
 * We only cache a resolved (non-null) result so the transport isn't a network
 * call per RPC.
 */
export async function sessionToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  return refreshSessionToken();
}

/** Re-read the JWT from the SDK (after sign-in or a redirect). */
export async function refreshSessionToken(): Promise<string | null> {
  const instance = neonAuthInstance();
  if (!instance) return null;
  // getJWTToken() is the SDK's single accessor for the signed JWT; it returns
  // the `set-auth-jwt` value the adapter injects onto the session (or null when
  // there's no session yet). Any error / no session → null (request goes out
  // anonymous), but we don't cache the null so a later call re-reads once the
  // session exists.
  const token = (await instance.getJWTToken().catch(() => null)) ?? null;
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
