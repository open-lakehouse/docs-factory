// The shared Hono app: one Connect-mounted ReviewService, built once and used by
// both entrypoints (Neon Function `fetch` in prod, @hono/node-server locally).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { mountConnect } from "./connect-hono.js";
import { registerReviewService } from "./services/review.js";
import { selectProvider } from "./auth/provider.js";
import { listenerClient } from "./db.js";
import { COMMENTS_CHANNEL, sseEnabled } from "./notify.js";
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";

export async function createApp(): Promise<Hono> {
  const app = new Hono();

  // CORS is a BROWSER concern only: it governs which cross-origin browser
  // requests get their Origin reflected. It never gates whether the app runs —
  // server-to-server callers (e.g. RegisterVersion via connect-node) send no
  // Origin header and are unaffected by any of this. So the CORS policy lives
  // entirely inside the `origin` resolver below; there is no startup guard.
  //
  // In prod the browser reaches the API same-origin (Vercel rewrites `/api/*` →
  // this Function), so CORS is inert on that path — it's defense-in-depth for the
  // raw Function URL and the mechanism for additional first-party origins.
  // ALLOWED_ORIGIN is a comma-separated allowlist set per deploy: a single Vercel
  // origin in the soft launch; the custom docs domains (openlakehouse.io /
  // delta.io / unitycatalog.io) added later — no code change, just the env value.
  // Credentials forbid "*", so hono/cors echoes only a matching allowlisted origin.
  const allowed = process.env.ALLOWED_ORIGIN?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === "production";
  // Fail CLOSED for browsers, not for the app. When the allowlist is set, reflect
  // only listed origins. When it's UNSET: in prod deny every cross-origin browser
  // request (reflect nothing) — a missing allowlist must never mean "reflect any
  // origin with credentials"; in local dev keep the permissive echo for
  // convenience. Either way the app still serves same-origin and server-to-server
  // traffic, so a missing browser allowlist can't take down non-browser callers.
  const corsOrigin: string[] | ((origin: string) => string | undefined | null) =
    allowed && allowed.length ? allowed : isProd ? () => undefined : (o) => o;
  app.use(
    "*",
    cors({
      origin: corsOrigin,
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
        // A dedicated single-connection listener, NOT the shared query pool: a
        // LISTEN holds its connection for the whole stream lifetime, so drawing
        // from the max-5 pool would let a few open streams starve every unary
        // RPC of a connection. Each NOTIFY carries the changed ref; we forward
        // it as an `invalidate` event and let the client decide whether it
        // matches its current ref.
        const sql = listenerClient();
        const sub = await sql.listen(COMMENTS_CHANNEL, (payload) => {
          void stream.writeSSE({ event: "invalidate", data: payload });
        });
        // Keep the stream open until the client disconnects; unlisten and close
        // the dedicated connection on abort so it isn't leaked.
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            void sub
              .unlisten()
              .catch(() => {})
              .finally(() => sql.end().catch(() => {}))
              .finally(resolve);
          });
        });
        // `ref` is accepted for symmetry/logging; filtering happens client-side.
        void ref;
      });
    });
  }

  return app;
}
