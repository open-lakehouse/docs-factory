// Connect transport for the review API. connect-query hooks use this transport
// (provided via TransportProvider in main.tsx); a raw client is exported for
// non-hook call sites. VITE_API_URL is the Neon Function URL in prod and the
// local dev-server (http://localhost:8787) in dev.
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb";
import { DEV_PERSONA_HEADER, readDevPersona } from "./dev-persona";

export const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

// Live comment updates via the SSE endpoint (Phase 4B). Off by default; opt in
// with VITE_REVIEW_SSE=true once the server has REVIEW_SSE_ENABLED. When off,
// the poll interval alone keeps the rail live.
export const sseEnabled = import.meta.env.VITE_REVIEW_SSE === "true";

export const transport = createConnectTransport({
  baseUrl,
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    // In dev, attach the chosen impersonation persona so the server's mock
    // provider resolves the viewer. No-op in prod (mock is refused there).
    if (import.meta.env.DEV) {
      const persona = readDevPersona();
      if (persona) headers.set(DEV_PERSONA_HEADER, persona);
    }
    // Send credentials so the Neon Auth session cookie rides along in prod.
    return fetch(input, { ...init, headers, credentials: "include" });
  },
});

export const reviewClient: Client<typeof ReviewService> = createClient(
  ReviewService,
  transport,
);
