// Postgres LISTEN/NOTIFY plumbing for live comment updates (Phase 4B).
//
// This is an *invalidation hint* channel, not a data channel: a mutation emits
// a NOTIFY carrying only the affected content ref, and the SSE endpoint relays
// it so clients re-run the normal unary listComments query. No comment bodies
// travel over the channel, so auth/anon logic stays in the unary handler.
//
// Polling (review-context.tsx) remains the guaranteed path; SSE is a latency
// upgrade that is gated behind REVIEW_SSE_ENABLED and safe to drop.
import type { Sql } from "./db.js";

export const COMMENTS_CHANNEL = "review_comments";

/** Whether the SSE endpoint is served. Off unless explicitly enabled, since a
 *  held connection on evictable serverless compute is an anti-pattern — see the
 *  plan's transport analysis. */
export function sseEnabled(): boolean {
  return process.env.REVIEW_SSE_ENABLED === "true";
}

/** A content ref reduced to the fields the client keys its query on. */
export interface RefKey {
  area: string;
  slug: string;
  project?: string | null;
  bucket?: string | null;
}

/**
 * Announce that comments for `ref` changed. Best-effort: a failed NOTIFY must
 * never fail the mutation that triggered it (polling will still catch up), so
 * callers should not await-throw on this.
 */
export async function notifyCommentsChanged(sql: Sql, ref: RefKey): Promise<void> {
  const payload = JSON.stringify({
    area: ref.area,
    slug: ref.slug,
    project: ref.project ?? null,
    bucket: ref.bucket ?? null,
  });
  try {
    // pg_notify() is the function form of NOTIFY and takes the payload as a bound
    // parameter (plain NOTIFY only accepts a string literal).
    await sql`select pg_notify(${COMMENTS_CHANNEL}, ${payload})`;
  } catch {
    // Swallow — the mutation already committed; the client's poll backstop will
    // reconcile even if this hint is lost.
  }
}
