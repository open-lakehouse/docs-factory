// The Inbox panel in the workspace middle pane. Mirrors ReviewTab's tabpanel
// shell (ARIA ids, keep-mounted / hide-when-inactive) but hosts the review
// requests addressed to the viewer and the latest comments (grouped by page)
// instead of a page.
import { cn } from "@/lib/utils";
import { useReviewInbox } from "../../../lib/review-inbox";
import { ReviewRequestBadge } from "../../../lib/review-status";
import CommentFeed from "./CommentFeed";
import { tabDomId, tabPanelDomId } from "./tab-ids";
import { tabLabel } from "./tab-label";
import { useWorkspaceTabs } from "./workspace-tabs-context";

export default function InboxTab({ token, isActive }: { token: string; isActive: boolean }) {
  const { toMe, isLoading } = useReviewInbox();
  const { openTab } = useWorkspaceTabs();
  return (
    <div
      id={tabPanelDomId(token)}
      role="tabpanel"
      aria-labelledby={tabDomId(token)}
      aria-label="Inbox"
      className={cn(
        "workspace-panel flex min-h-0 flex-1 flex-col overflow-y-auto",
        !isActive && "hidden",
      )}
    >
      <div className="workspace-panel-body">
        <h1>Inbox</h1>
        <section aria-label="Requested from me">
          <h2 className="blog-aside-title">Requested from me</h2>
          {isLoading ? (
            <p className="muted">Loading…</p>
          ) : toMe.length === 0 ? (
            <p className="review-empty">No open review requests addressed to you.</p>
          ) : (
            <ul className="review-dash-list">
              {toMe.map((r) => (
                <li key={r.id} className="review-dash-row">
                  {r.ref ? (
                    <button
                      type="button"
                      className="review-dash-title text-left"
                      onClick={() => r.ref && openTab(r.ref)}
                    >
                      {tabLabel(r.ref)}
                    </button>
                  ) : (
                    <span className="review-dash-title">(unknown)</span>
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
        <section aria-label="Latest comments" className="mt-8">
          <h2 className="blog-aside-title">Latest comments</h2>
          <CommentFeed />
        </section>
      </div>
    </div>
  );
}
