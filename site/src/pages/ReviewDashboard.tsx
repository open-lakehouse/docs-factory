// The consolidated reviewer home (/review). Reviewer-only. Gathers the scattered
// per-page review signals into one place:
//   1. Pending review — content actively in the review workflow.
//   2. Latest comments — recent comment activity, each linking back to its
//      content + heading anchor (traceable via the comment's stored ref/anchor).
//   3. Approved · not git-`ready` — Issue #40: content that has cleared review in
//      the DB but whose author hasn't flipped the frontmatter switch, so it can't
//      ship. A pure client-side filter over listDrafts (no schema change).
//   4. Review requests — placeholder; lands next iteration.
//
// All read-only over listDrafts + listRecentComments. Reuses the shared review
// state badge so rows render identically to the doc-page controls and indexes.

import { useQuery } from "@connectrpc/connect-query";
import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";
import BlogPipeline from "../components/review/BlogPipeline";
import ProductRollup from "../components/review/ProductRollup";
import { overviewTabsParam, overviewToken } from "../components/review/workspace/overview-token";
import {
  type DraftSummary,
  type ReviewRequest,
  ReviewState,
} from "../gen/docs_factory/review/v1/messages_pb";
import {
  listDrafts,
  listRecentComments,
  listReviewRequests,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../lib/auth-context";
import { refHref } from "../lib/content-ref";
import { ReviewRequestBadge, ReviewStateBadge } from "../lib/review-status";

const READY = "ready";

/** Deep-link into the desktop workspace Overview (ignored on narrow, where this
 *  dashboard itself surfaces the pipeline + rollup below). */
function overviewHref(): string {
  const search = new URLSearchParams({
    tabs: overviewTabsParam(),
    active: overviewToken("pipeline"),
  });
  return `/review?${search.toString()}`;
}

/** Review states that count as active pending work for a reviewer. */
const PENDING_STATES = new Set<ReviewState>([
  ReviewState.NEEDS_REVIEW,
  ReviewState.CHANGES_REQUESTED,
]);

function draftLabel(d: DraftSummary): string {
  return d.title || d.ref?.slug || "(untitled)";
}

function requestTargetLabel(r: ReviewRequest): string {
  return r.ref ? r.ref.slug : "(unknown)";
}

export default function ReviewDashboard() {
  const { isLoading: authLoading, isAllowlisted } = useAuth();
  const { data: draftsData, isLoading: draftsLoading } = useQuery(
    listDrafts,
    {},
    { enabled: isAllowlisted },
  );
  const { data: recentData, isLoading: recentLoading } = useQuery(
    listRecentComments,
    { limit: 20 },
    { enabled: isAllowlisted },
  );
  // Requests addressed to me (inbox) and requests I opened (outbox), open-only.
  const { data: toMeData, isLoading: toMeLoading } = useQuery(
    listReviewRequests,
    { mine: true, openOnly: true },
    { enabled: isAllowlisted },
  );
  const { data: byMeData, isLoading: byMeLoading } = useQuery(
    listReviewRequests,
    { byMe: true, openOnly: true },
    { enabled: isAllowlisted },
  );

  // Route guard: reviewer-only. Wait for the viewer to resolve before deciding
  // (mirrors DocPage) so we don't flash "not found" at an allowlisted reviewer.
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

  const drafts = draftsData?.drafts ?? [];
  const pending = drafts.filter((d) => PENDING_STATES.has(d.reviewState));
  // Issue #40: cleared review in the DB (approved/released) but still git-draft.
  const approvedNotReady = drafts.filter(
    (d) =>
      (d.reviewState === ReviewState.APPROVED || d.reviewState === ReviewState.RELEASED) &&
      d.frontmatterStatus !== READY,
  );
  const recent = recentData?.comments ?? [];
  const toMe = toMeData?.requests ?? [];
  const byMe = byMeData?.requests ?? [];

  return (
    <Shell wide>
      <div className="review-dashboard">
        <h1>Review</h1>
        <p className="muted">
          Pending work and recent activity across all content.{" "}
          <Link to={overviewHref()}>Overview →</Link>
        </p>

        <section className="review-dash-section">
          <h2>Pending review</h2>
          {draftsLoading ? (
            <p className="muted">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="review-empty">Nothing is currently in review.</p>
          ) : (
            <ul className="review-dash-list">
              {pending.map((d) => (
                <li key={d.ref && refHref(d.ref)} className="review-dash-row">
                  {d.ref ? (
                    <Link to={refHref(d.ref)} className="review-dash-title">
                      {draftLabel(d)}
                    </Link>
                  ) : (
                    <span className="review-dash-title">{draftLabel(d)}</span>
                  )}
                  <span className="review-dash-meta">
                    <ReviewStateBadge state={d.reviewState} />
                    {d.openCommentCount > 0 && (
                      <span className="review-dash-count">
                        {d.openCommentCount} open{" "}
                        {d.openCommentCount === 1 ? "comment" : "comments"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="review-dash-section">
          <h2>Latest comments</h2>
          {recentLoading ? (
            <p className="muted">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="review-empty">No comments yet.</p>
          ) : (
            <ul className="review-dash-list">
              {recent.map((rc) => {
                const c = rc.comment;
                const label = rc.contentTitle || rc.ref?.slug || "(untitled)";
                const section = rc.headingText ? ` · ${rc.headingText}` : "";
                return (
                  <li key={c?.id} className="review-dash-comment">
                    <Link
                      to={rc.ref ? refHref(rc.ref, rc.anchorSlug || undefined) : "#"}
                      className="review-dash-comment-target"
                    >
                      {label}
                      {section}
                    </Link>
                    <p className="review-dash-comment-body">
                      <span className="review-dash-comment-author">
                        {c?.authorName || c?.authorLogin || "someone"}:
                      </span>{" "}
                      {c?.bodyMd}
                    </p>
                    {rc.resolved && <span className="review-dash-resolved">resolved</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="review-dash-section">
          <h2>
            Approved · not <code>ready</code>
          </h2>
          <p className="muted review-dash-hint">
            Cleared review in the app, but the author hasn't marked the source <code>ready</code> —
            so it can't go live yet.
          </p>
          {draftsLoading ? (
            <p className="muted">Loading…</p>
          ) : approvedNotReady.length === 0 ? (
            <p className="review-empty">Nothing waiting on a git status flip.</p>
          ) : (
            <ul className="review-dash-list">
              {approvedNotReady.map((d) => (
                <li key={d.ref && refHref(d.ref)} className="review-dash-row">
                  {d.ref ? (
                    <Link to={refHref(d.ref)} className="review-dash-title">
                      {draftLabel(d)}
                    </Link>
                  ) : (
                    <span className="review-dash-title">{draftLabel(d)}</span>
                  )}
                  <span className="review-dash-meta">
                    <ReviewStateBadge state={d.reviewState} />
                    <span className="review-dash-count">
                      frontmatter: {d.frontmatterStatus || "draft"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="review-dash-section">
          <h2>Requested from me</h2>
          {toMeLoading ? (
            <p className="muted">Loading…</p>
          ) : toMe.length === 0 ? (
            <p className="review-empty">No open review requests addressed to you.</p>
          ) : (
            <ul className="review-dash-list">
              {toMe.map((r) => (
                <li key={r.id} className="review-dash-row">
                  {r.ref ? (
                    <Link to={refHref(r.ref)} className="review-dash-title">
                      {requestTargetLabel(r)}
                    </Link>
                  ) : (
                    <span className="review-dash-title">{requestTargetLabel(r)}</span>
                  )}
                  <span className="review-dash-meta">
                    <ReviewRequestBadge requirement={r.requirement} status={r.status} />
                    {r.note && <span className="review-dash-count">{r.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="review-dash-section">
          <h2>Requests I made</h2>
          {byMeLoading ? (
            <p className="muted">Loading…</p>
          ) : byMe.length === 0 ? (
            <p className="review-empty">You have no open review requests out.</p>
          ) : (
            <ul className="review-dash-list">
              {byMe.map((r) => (
                <li key={r.id} className="review-dash-row">
                  {r.ref ? (
                    <Link to={refHref(r.ref)} className="review-dash-title">
                      {requestTargetLabel(r)}
                    </Link>
                  ) : (
                    <span className="review-dash-title">{requestTargetLabel(r)}</span>
                  )}
                  <span className="review-dash-meta">
                    <span className="review-dash-count">
                      → {r.reviewerLogin || r.reviewerName || "someone"}
                    </span>
                    <ReviewRequestBadge requirement={r.requirement} status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Narrow / classic dashboard: Overview lives here because the 3-pane
            workspace (and its sidebar Overview item) only mounts on desktop. */}
        <section className="review-dash-section" aria-label="Blog pipeline">
          <BlogPipeline />
        </section>
        <section
          className="review-dash-section revops-product-rollup"
          aria-label="What changed by product"
        >
          <ProductRollup />
        </section>
      </div>
    </Shell>
  );
}
