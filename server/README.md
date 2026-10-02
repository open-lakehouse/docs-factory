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
| `src/auth/provider.ts` | pluggable auth: Neon Auth (prod), mock (local), anon |
| `src/db.ts` | Neon Postgres client from `DATABASE_URL` |
| `src/gen/` | generated proto types (run `just buf-gen`) |
| `db/migrations/` | SQL migrations |

## Local dev

From the repo root, `just dev` runs the whole stack: Postgres (migrated +
seeded), this API under `AUTH_MODE=mock` with content versions registered, and
the site preview. Ctrl-C stops everything. To run the API on its own:

```bash
just db-up && just db-migrate && just db-seed
just server-dev            # AUTH_MODE=mock by default, http://localhost:8787
# smoke test (x-dev-persona: anon | reviewer | maintainer | admin[:<login>]):
curl -s -X POST localhost:8787/docs_factory.review.v1.ReviewService/GetViewer \
  -H 'Content-Type: application/json' -H 'Connect-Protocol-Version: 1' \
  -H 'x-dev-persona: maintainer' -d '{}'
```

`GetViewer` needs no database. Anything touching Postgres needs `DATABASE_URL`
(or the `PG*` parts in `server/.env`) pointed at a local Postgres or a Neon
branch, with `db/migrations/` applied.

## Content version registry (deploy-per-push)

The review layer keys comments to a content version. On each deploy:

1. `just version-manifest` writes `site/src/generated/content-versions.json`
   (gitignored; generated automatically by `just register-versions`). sha256 of
   each draft/doc body + its section anchors; heading ids match the rendered DOM
   exactly — same `github-slugger` as rehype-slug).
2. `just register-versions` (with `API_URL` + `BUILD_SECRET`) calls
   `RegisterVersion` per entry: idempotent upsert on `(area, slug, content_hash)`,
   replaces the version's section rows, and re-anchors open comment threads.

PR CI only checks that the manifest builds successfully; the `register-versions`
call runs in the deploy pipeline. Locally `just dev` registers versions for you.
By hand, run `API_URL=http://localhost:8787 just register-versions` against a
running `server-dev`. RegisterVersion is dev-open when no OIDC pin is set (see
`src/auth/github-oidc.ts`).

## Auth modes (`AUTH_MODE`)

- `mock` — local impersonation via an `x-dev-persona` header, which the site's
  dev persona menu sends. The local default; refused under `NODE_ENV=production`.
- `neon` — Neon Auth + GitHub OAuth (prod). The mock provider is never
  selectable under `neon`.
- `anon` — everyone anonymous. The server's fallback when `AUTH_MODE` is unset;
  locally the login-gated site admits nobody under it.
