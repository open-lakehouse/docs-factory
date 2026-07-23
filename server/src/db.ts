// Postgres client. One driver (postgres.js) for both local Postgres and the
// Neon Postgres a Neon Function talks to — Neon Functions run on Node.js 24
// (TCP available) and DATABASE_URL is a standard connection string, so no
// edge/serverless-specific driver is needed. The client is created lazily and
// cached across warm invocations.
import postgres, { type Sql as PostgresSql } from "postgres";

export type Sql = PostgresSql;

let cached: Sql | undefined;

/**
 * Resolve the connection string. In prod Neon injects DATABASE_URL; locally we
 * compose it from the PG* parts (server/.env) so no connection string literal
 * lives in a tracked file. Returns undefined if neither is available.
 */
export function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  if (PGUSER && PGHOST && PGDATABASE) {
    const auth = PGPASSWORD ? `${PGUSER}:${PGPASSWORD}` : PGUSER;
    return `postgres://${auth}@${PGHOST}:${PGPORT ?? "5432"}/${PGDATABASE}`;
  }
  return undefined;
}

/** Lazily create the shared SQL client. */
export function db(): Sql {
  if (cached) return cached;
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "No database connection. In prod Neon injects DATABASE_URL; locally set " +
        "DATABASE_URL or the PG* parts (copy server/.env.example to server/.env).",
    );
  }
  // Modest pool: Neon Functions are short-lived and can be evicted when idle.
  cached = postgres(url, { max: 5 });
  return cached;
}

/**
 * A dedicated single-connection client for a long-lived LISTEN. Each open SSE
 * stream needs its own connection for the duration it's held; taking that from
 * the shared query pool (max 5) would let a handful of streams starve every
 * unary RPC of a connection. This is NOT cached — the caller owns its lifetime
 * and must `await client.end()` when the stream closes.
 */
export function listenerClient(): Sql {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error("No database connection for the SSE listener (see db()).");
  }
  return postgres(url, { max: 1 });
}
