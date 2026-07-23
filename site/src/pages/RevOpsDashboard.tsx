// The blog RevOps pipeline (/review/revops). Reviewer-only. Orders the blog
// backlog by priority and lets reviewers rank posts and set a target release
// date — the editorial "what ships next, and when" view.
//
// Priority + target date are DB-authoritative (content_revops), set here via
// SetPriority / SetTargetReleaseDate — NOT git frontmatter. Ideas
// (frontmatter_status "idea") show up here as first-class rows, so a post can be
// ranked and given a target date while it's still an early on-disk idea folder.
//
// Reorder is up/down swaps over an integer rank: moving a row swaps its priority
// with its neighbour's. Rows without a priority yet ("unranked") sort last and
// get a dense rank assigned the first time they're moved into the ranked list.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@connectrpc/connect-query";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  listDrafts,
  setPriority,
  setTargetReleaseDate,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import {
  ContentArea,
  type ContentRef,
  type DraftSummary,
} from "../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../lib/auth-context";
import { refHref } from "../lib/content-ref";
import { ReviewStateBadge } from "../lib/review-status";
import { statusBadgeClass } from "../lib/frontmatter-status";
import { useReviewInvalidation } from "../lib/review-queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Shell from "../components/layout/Shell";

function draftLabel(d: DraftSummary): string {
  return d.title || d.ref?.slug || "(untitled)";
}

/** A Timestamp -> "YYYY-MM-DD" for the date input (UTC calendar date). */
function toDateInput(ts: DraftSummary["targetReleaseDate"]): string {
  if (!ts) return "";
  return timestampDate(ts).toISOString().slice(0, 10);
}

export default function RevOpsDashboard() {
  const { isLoading: authLoading, isAllowlisted } = useAuth();
  const { invalidateDrafts } = useReviewInvalidation();
  const { data, isLoading: draftsLoading } = useQuery(
    listDrafts,
    { area: ContentArea.BLOGS, orderByPriority: true },
    { enabled: isAllowlisted },
  );

  const prioritize = useMutation(setPriority, {
    onSuccess: () => void invalidateDrafts(),
  });
  const retarget = useMutation(setTargetReleaseDate, {
    onSuccess: () => void invalidateDrafts(),
  });

  // Server already orders ranked-first / unranked-last; keep that order and just
  // track which rows are ranked so the up/down affordances know their bounds.
  const rows = useMemo(() => data?.drafts ?? [], [data]);
  const busy = prioritize.isPending || retarget.isPending;

  // Route guard: reviewer-only (mirrors ReviewDashboard). Wait for the viewer to
  // resolve before deciding so we don't flash "not found" at a reviewer.
  if (authLoading) {
    return (
      <Shell wide>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }
  if (!isAllowlisted) {
    return (
      <Shell wide>
        <p>
          Not found. <Link to="/">Back home.</Link>
        </p>
      </Shell>
    );
  }

  // Reorder by swapping priorities with the neighbour. Assign a dense 1..N rank
  // across the whole list first (idempotent — re-sending a row's current rank is
  // a no-op) so unranked rows get a concrete priority the moment they move.
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    if (!a.ref || !b.ref) return;
    // Dense ranks over the current visual order; a and b swap their slots.
    const ranks = rows.map((_, i) => i + 1);
    const aRank = ranks[target]; // a moves into b's slot
    const bRank = ranks[index]; // b moves into a's slot
    // Persist every row's baseline rank once (cheap upserts) so the ordering is
    // fully materialized, then the swapped pair land in their new slots.
    await Promise.all(
      rows.map((r, i) => {
        if (!r.ref) return Promise.resolve();
        const rank = i === index ? aRank : i === target ? bRank : ranks[i];
        return prioritize.mutateAsync({ ref: r.ref, priority: rank });
      }),
    );
  }

  async function onDateChange(ref: ContentRef | undefined, value: string) {
    if (!ref) return;
    if (!value) {
      await retarget.mutateAsync({ ref });
      return;
    }
    // Parse the date input as a UTC calendar date (midnight) for the wire.
    const date = new Date(`${value}T00:00:00.000Z`);
    await retarget.mutateAsync({ ref, targetReleaseDate: timestampFromDate(date) });
  }

  return (
    <Shell wide>
      <div className="revops-dashboard">
        <h1>Blog pipeline</h1>
        <p className="muted">
          The blog backlog in priority order. Rank posts and set target release
          dates — including early <code>idea</code> folders, so the pipeline
          reflects what's coming before it's fully drafted.
        </p>

        {draftsLoading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="review-empty">No blog posts yet.</p>
        ) : (
          <table className="revops-table">
            <thead>
              <tr>
                <th className="revops-col-rank">#</th>
                <th>Post</th>
                <th>Status</th>
                <th>Review</th>
                <th>Target release</th>
                <th className="revops-col-move">Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={d.ref && refHref(d.ref)} className="revops-row">
                  <td className="revops-col-rank mono">
                    {d.priority != null ? d.priority : "—"}
                  </td>
                  <td>
                    {d.ref ? (
                      <Link to={refHref(d.ref)} className="revops-title">
                        {draftLabel(d)}
                      </Link>
                    ) : (
                      <span className="revops-title">{draftLabel(d)}</span>
                    )}
                  </td>
                  <td>
                    {d.frontmatterStatus && (
                      <span className={cn("blog-badge", statusBadgeClass(d.frontmatterStatus))}>
                        {d.frontmatterStatus}
                      </span>
                    )}
                  </td>
                  <td>
                    <ReviewStateBadge state={d.reviewState} />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="revops-date"
                      value={toDateInput(d.targetReleaseDate)}
                      disabled={busy}
                      onChange={(e) => void onDateChange(d.ref, e.target.value)}
                    />
                  </td>
                  <td className="revops-col-move">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Move up"
                      disabled={busy || i === 0}
                      onClick={() => void move(i, -1)}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Move down"
                      disabled={busy || i === rows.length - 1}
                      onClick={() => void move(i, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
