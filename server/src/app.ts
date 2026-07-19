// The shared Hono app: one Connect-mounted ReviewService, built once and used by
// both entrypoints (Neon Function `fetch` in prod, @hono/node-server locally).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { mountConnect } from "./connect-hono.js";
import { registerReviewService } from "./services/review.js";
import { selectProvider } from "./auth/provider.js";
import { db } from "./db.js";
import { COMMENTS_CHANNEL, sseEnabled } from "./notify.js";
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";

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

  // Live comment updates (Phase 4B). A plain SSE endpoint — deliberately NOT a
  // Connect RPC — that relays Postgres NOTIFYs as invalidation hints. The client
  // re-runs the normal unary listComments query on each ping, so no comment data
  // travels over the stream and auth stays in the unary handler. Off unless
  // REVIEW_SSE_ENABLED=true, since holding a stream open on evictable serverless
  // compute is an anti-pattern; polling is always the guaranteed path.
  if (sseEnabled()) {
    app.get("/events/comments", async (c) => {
      // Allowlist-gate like the comment RPCs — comments are a reviewer artifact.
      const viewer = await auth.verify(new Headers(c.req.raw.headers));
      if (viewer.role !== Role.REVIEWER && viewer.role !== Role.MAINTAINER) {
        return c.text("forbidden", 403);
      }
      const ref = c.req.query("ref");
      return streamSSE(c, async (stream) => {
        // A dedicated listener connection (postgres.js manages it). Each NOTIFY
        // carries the changed ref; we forward it as an `invalidate` event and
        // let the client decide whether it matches its current ref.
        const sql = db();
        const sub = await sql.listen(COMMENTS_CHANNEL, (payload) => {
          void stream.writeSSE({ event: "invalidate", data: payload });
        });
        // Keep the stream open until the client disconnects; unlisten on abort.
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            void sub.unlisten().finally(resolve);
          });
        });
        // `ref` is accepted for symmetry/logging; filtering happens client-side.
        void ref;
      });
    });
  }

  return app;
}
