// Neon Postgres client. In a Neon Function DATABASE_URL is injected
// automatically; locally it points at a local Postgres or a Neon branch. Uses
// the HTTP driver, which is serverless/edge-friendly and works the same in both
// entrypoints.
import { neon } from "@neondatabase/serverless";

export type Sql = ReturnType<typeof neon>;

let cached: Sql | undefined;

/** Lazily create the shared SQL client from DATABASE_URL. */
export function db(): Sql {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. In prod Neon injects it; locally set it to a " +
        "local Postgres or Neon branch connection string.",
    );
  }
  cached = neon(url);
  return cached;
}
