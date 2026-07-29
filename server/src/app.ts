// The shared Hono app: one Connect-mounted ReviewService, built once and used by
// both entrypoints (Neon Function `fetch` in prod, @hono/node-server locally).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { mountConnect } from "./connect-hono.js";
import { registerReviewService } from "./services/review.js";
import { selectProvider } from "./auth/provider.js";
import { db, listenerClient, resolveDatabaseUrl } from "./db.js";
import { COMMENTS_CHANNEL, sseEnabled } from "./notify.js";
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";

export async function createApp(): Promise<Hono> {
  const app = new Hono();

  // In prod the browser reaches the API same-origin (Vercel rewrites `/api/*` →
  // this Function), so CORS is inert on that path — it stays as defense-in-depth
  // for the raw Function URL and as the mechanism for any additional first-party
  // origins. ALLOWED_ORIGIN is a comma-separated allowlist set per deploy: a
  // single Vercel origin in the soft launch; the custom docs domains
  // (openlakehouse.io / delta.io / unitycatalog.io) added later — no code change,
  // just the env value. Credentials forbid "*", so hono/cors echoes the matching
  // allowlisted origin. Unset ⇒ permissive echo, local dev only.
  const allowed = process.env.ALLOWED_ORIGIN?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    "*",
    cors({
      origin: allowed && allowed.length ? allowed : (o) => o,
      credentials: true,
      allowHeaders: ["Content-Type", "Connect-Protocol-Version", "Authorization", "x-dev-persona"],
    }),
  );

  // Liveness probe (Neon Functions can be evicted when idle; this warms them).
  app.get("/healthz", (c) => c.json({ ok: true }));

  const auth = await selectProvider();

  // TEMPORARY diagnostic (gated behind REVIEW_DEBUG_VIEWER=true; a 404 otherwise).
  // GetViewer returns ANONYMOUS for a session the SQL proves is allowlisted, so
  // this reports what the RUNNING Function actually sees — the DB host/branch it
  // resolves at runtime (which may differ from the branch migrations/console
  // used), whether the bearer resolves to an allowlisted role, and what the raw
  // allowlist query returns against the Function's own connection. No secrets:
  // the connection string's password is redacted; only the host/db are shown.
  // Remove once the anonymous-viewer bug is diagnosed.
  if (process.env.REVIEW_DEBUG_VIEWER === "true") {
    app.get("/debug/viewer", async (c) => {
      const url = resolveDatabaseUrl();
      let host: string | null = null;
      let database: string | null = null;
      try {
        if (url) {
          const u = new URL(url);
          host = u.host;
          database = u.pathname.replace(/^\//, "") || null;
        }
      } catch {
        /* unparseable URL → leave null */
      }
      // What the auth provider resolves for THIS request's bearer/cookie.
      const viewer = await auth.verify(new Headers(c.req.raw.headers));
      // The raw allowlist rows the Function's own connection returns, so we can
      // see whether the seeded row is even visible to the running Function.
      let allowlist: unknown = null;
      try {
        allowlist = await db()<{ github_login: string | null; email: string | null; role: string }[]>`
          select github_login, email, role from reviewer_allowlist
        `;
      } catch (e) {
        allowlist = { error: String(e) };
      }
      return c.json({
        db: { host, database },
        viewer: {
          authenticated: viewer.authenticated,
          login: viewer.login,
          role: Role[viewer.role],
          isAllowlisted: viewer.isAllowlisted,
        },
        allowlist,
      });
    });
  }

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
