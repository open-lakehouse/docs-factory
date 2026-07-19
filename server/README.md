# Review & release API (`server/`)

The backend for the in-app review/release lifecycle. One **Hono + Connect RPC**
app, served two ways from the same code:

- **prod** — a [Neon Function](https://neon.com/docs/compute/functions/overview)
  (`src/handler.ts` exports `{ fetch }`; `DATABASE_URL` is injected by Neon).
- **local** — a Node HTTP server (`src/dev-server.ts`, via `@hono/node-server`).

The API surface is defined proto-first in `../proto` and served over the Connect
protocol (plain HTTP/1.1), so no gRPC server is needed — each RPC is mounted as a
fetch-native Hono route (`src/connect-hono.ts` using `createFetchHandler`). The
React SPA calls it with `@connectrpc/connect-web` + `@connectrpc/connect-query`.

## Layout

| File | Role |
|---|---|
| `src/app.ts` | builds the shared Hono app (CORS, healthz, Connect mount) |
| `src/handler.ts` | Neon Function entrypoint (`export default { fetch }`) |
| `src/dev-server.ts` | local Node entrypoint |
| `src/connect-hono.ts` | mounts a Connect router onto Hono as fetch routes |
| `src/services/review.ts` | `ReviewService` implementation |
| `src/auth/provider.ts` | pluggable auth (anon now; Neon Auth + mock in Phase 2) |
| `src/db.ts` | Neon Postgres client from `DATABASE_URL` |
| `src/gen/` | generated proto types (run `just buf-gen`) |
| `db/migrations/` | SQL migrations |

## Local dev

```bash
just server-dev            # AUTH_MODE=mock, http://localhost:8787
# smoke test:
curl -s -X POST localhost:8787/docs_factory.review.v1.ReviewService/GetViewer \
  -H 'Content-Type: application/json' -H 'Connect-Protocol-Version: 1' -d '{}'
```

`GetViewer` needs no database. Anything touching Postgres needs `DATABASE_URL`
pointed at a local Postgres or a Neon branch, and `db/migrations/` applied.

## Auth modes (`AUTH_MODE`)

- `anon` — everyone anonymous (Phase 0 default).
- `mock` — local impersonation via an `x-dev-persona` header (Phase 2).
- `neon` — Neon Auth + GitHub OAuth (prod, Phase 2). The mock provider is never
  selectable under `neon`.
