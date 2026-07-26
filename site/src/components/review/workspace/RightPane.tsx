// The workspace's right column. Two zones:
//   1. Cross-tab inbox sections (requested-from-me, latest comments) — NOT tied
//      to the active tab. Pending review lives on the left tree aggregates
//      instead. Clicking a row opens/activates that page's tab (and, for a
//      comment, carries a deep-link intent to select + scroll to the thread).
//   2. A portal slot the ACTIVE tab fills with its own comment view. The slot
//      lives here; the active ReviewTab renders into it from inside its
//      ReviewProvider so the comments follow the active tab for free.
import { PanelRightClose } from "lucide-react";
import type { ContentRef, RecentComment } from "../../../gen/docs_factory/review/v1/messages_pb";
import { ReviewRequestBadge } from "../../../lib/review-status";
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
  onCollapse,
  collapseDisabled = false,
}: {
  setSlot: (el: HTMLDivElement | null) => void;
  onCollapse?: () => void;
  collapseDisabled?: boolean;
}) {
  const { openTab } = useWorkspaceTabs();
  const { recent, toMe } = useReviewInbox();

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
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Inbox
          </p>
          {onCollapse && (
            <button
              type="button"
              className="workspace-pane-collapse-right"
              aria-label="Hide inbox"
              title="Hide inbox"
              onClick={onCollapse}
              tabIndex={collapseDisabled ? -1 : 0}
            >
              <PanelRightClose className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
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
