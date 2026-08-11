// Connect transport for the review API. connect-query hooks use this transport
// (provided via TransportProvider in main.tsx); a raw client is exported for
// non-hook call sites. VITE_API_URL is the Neon Function URL in prod and the
// local dev-server (http://localhost:8787) in dev.
import { type Client, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb";
import { sessionToken } from "./auth-actions";
import { DEV_PERSONA_HEADER, readDevPersona } from "./dev-persona";

// Same-origin in prod: Vercel rewrites `/api/*` → the Neon Function (see
// site/vercel.json), so the browser never makes a cross-origin request. Auth
// rides as an `Authorization: Bearer` header (the Neon Auth JWT; see
// auth-actions.ts) rather than a cookie — Neon Auth scopes its session cookie to
// the auth origin, which is NOT the Function's origin, so the cookie would never
// reach the API. VITE_API_URL still overrides when set; in local dev we fall
// back to the cross-origin dev server on :8787 and use x-dev-persona instead.
export const baseUrl =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8787" : "/api");

// Live comment updates via the SSE endpoint (Phase 4B). Off by default; opt in
// with VITE_REVIEW_SSE=true once the server has REVIEW_SSE_ENABLED. When off,
// the poll interval alone keeps the rail live.
export const sseEnabled = import.meta.env.VITE_REVIEW_SSE === "true";

export const transport = createConnectTransport({
  baseUrl,
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    if (import.meta.env.DEV) {
      // In dev, attach the chosen impersonation persona so the server's mock
      // provider resolves the viewer. No real Neon Auth session exists here.
      const persona = readDevPersona();
      if (persona) headers.set(DEV_PERSONA_HEADER, persona);
    } else {
      // In prod, carry the Neon Auth JWT as a bearer so the server can resolve
      // the viewer (server/src/auth/neon-auth.ts verifies it via JWKS). The
      // auth cookie can't do this cross-origin.
      const token = await sessionToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }
    // credentials:"include" is retained so any same-origin cookie still rides
    // along, but the bearer header is what actually authenticates the API.
    return fetch(input, { ...init, headers, credentials: "include" });
  },
});

export const reviewClient: Client<typeof ReviewService> = createClient(ReviewService, transport);
