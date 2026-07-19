// The shared Hono app: one Connect-mounted ReviewService, built once and used by
// both entrypoints (Neon Function `fetch` in prod, @hono/node-server locally).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mountConnect } from "./connect-hono.js";
import { registerReviewService } from "./services/review.js";
import { selectProvider } from "./auth/provider.js";

export async function createApp(): Promise<Hono> {
  const app = new Hono();

  // The SPA is served from a different origin (Vercel) than the API (Neon
  // Function), so the browser needs CORS with credentials. ALLOWED_ORIGIN is set
  // per deploy; default to permissive in local dev only. When credentials are
  // sent, the origin cannot be "*", so echo the request origin in that case.
  const allowed = process.env.ALLOWED_ORIGIN;
  app.use(
    "*",
    cors({
      origin: allowed ? allowed : (o) => o,
      credentials: true,
      allowHeaders: ["Content-Type", "Connect-Protocol-Version", "Authorization", "x-dev-persona"],
    }),
  );

  // Liveness probe (Neon Functions can be evicted when idle; this warms them).
  app.get("/healthz", (c) => c.json({ ok: true }));

  const auth = await selectProvider();
  mountConnect(app, (router) => registerReviewService(router, auth));

  return app;
}
