// Connect transport for the review API. connect-query hooks use this transport
// (provided via TransportProvider in main.tsx); a raw client is exported for
// non-hook call sites. VITE_API_URL is the Neon Function URL in prod and the
// local dev-server (http://localhost:8787) in dev.
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export const transport = createConnectTransport({
  baseUrl,
  // Send credentials so the Neon Auth session cookie rides along in prod.
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const reviewClient: Client<typeof ReviewService> = createClient(
  ReviewService,
  transport,
);
