// The workspace's right column. Two zones:
//   1. Cross-tab inbox sections (pending review, latest comments, review
//      requests) — NOT tied to the active tab. Clicking a row opens/activates
//      that page's tab (and, for a comment, carries a deep-link intent that
//      Phase 3 will consume to select + scroll to the thread).
//   2. A portal slot the ACTIVE tab fills with its own comment view (Phase 2).
//      The slot lives here; the active ReviewTab renders into it from inside its
//      ReviewProvider so the comments follow the active tab for free.
import type { ContentRef, RecentComment } from "../../../gen/docs_factory/review/v1/messages_pb";
import { ReviewRequestBadge, ReviewStateBadge } from "../../../lib/review-status";
import { useReviewInbox } from "../../../lib/review-inbox";
import { useWorkspaceTabs } from "./workspace-tabs-context";

function OpenRow({
  ref: contentRef,
  label,
  onOpen,
  children,
}: {
  ref?: ContentRef;
  label: string;
  onOpen: (ref: ContentRef) => void;
  children?: React.ReactNode;
}) {
  return (
    <li className="review-dash-row">
      {contentRef ? (
        <button
          type="button"
          className="review-dash-title text-left hover:underline"
          onClick={() => onOpen(contentRef)}
        >
          {label}
        </button>
      ) : (
        <span className="review-dash-title">{label}</span>
      )}
      <span className="review-dash-meta">{children}</span>
    </li>
  );
}

export default function RightPane({
  setSlot,
}: {
  setSlot: (el: HTMLDivElement | null) => void;
}) {
  const { openTab } = useWorkspaceTabs();
  const { pending, recent, toMe } = useReviewInbox();

  const openComment = (rc: RecentComment) => {
    if (!rc.ref) return;
    // A thread is keyed by its root comment's id: parent_id when this is a
    // reply, else the comment's own id (it is the root).
    const threadRoot = rc.comment ? rc.comment.parentId || rc.comment.id : undefined;
    openTab(rc.ref, { thread: threadRoot, anchor: rc.anchorSlug || undefined });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Active tab's comment view renders here via portal — it follows the
          active tab (see ReviewTab + right-pane-slot). */}
      <div ref={setSlot} className="workspace-section-divider empty:hidden" />

      <div className="review-dashboard p-3">
        <p className="px-1 pb-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
          Inbox
        </p>
        <section className="review-dash-section">
          <h2>Pending review</h2>
          {pending.length === 0 ? (
            <p className="review-empty">Nothing in review.</p>
          ) : (
            <ul className="review-dash-list">
              {pending.map((d) => (
                <OpenRow
                  key={d.ref && `${d.ref.area}:${d.ref.slug}`}
                  ref={d.ref}
                  label={d.title || d.ref?.slug || "(untitled)"}
                  onOpen={openTab}
                >
                  <ReviewStateBadge state={d.reviewState} />
                </OpenRow>
              ))}
            </ul>
          )}
        </section>

        <section className="review-dash-section">
          <h2>Requested from me</h2>
          {toMe.length === 0 ? (
            <p className="review-empty">No open requests.</p>
          ) : (
            <ul className="review-dash-list">
              {toMe.map((r) => (
                <OpenRow key={r.id} ref={r.ref} label={r.ref?.slug ?? "(unknown)"} onOpen={openTab}>
                  <ReviewRequestBadge requirement={r.requirement} status={r.status} />
                </OpenRow>
              ))}
            </ul>
          )}
        </section>

        <section className="review-dash-section">
          <h2>Latest comments</h2>
          {recent.length === 0 ? (
            <p className="review-empty">No comments yet.</p>
          ) : (
            <ul className="review-dash-list">
              {recent.map((rc) => {
                const c = rc.comment;
                const label = rc.contentTitle || rc.ref?.slug || "(untitled)";
                const section = rc.headingText ? ` · ${rc.headingText}` : "";
                return (
                  <li key={c?.id} className="review-dash-comment">
                    <button
                      type="button"
                      className="review-dash-comment-target text-left hover:underline"
                      onClick={() => openComment(rc)}
                    >
                      {label}
                      {section}
                    </button>
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
      </div>
    </div>
  );
}
