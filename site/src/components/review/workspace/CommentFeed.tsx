// Recent threads across every page, grouped under quiet page headings. Opening
// a row snapshots the feed into the stepper queue, so the reviewer can walk
// the rest with ‹ › (or j/k) without coming back here. Shared by the right
// pane's "All comments" view and the Inbox.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { UserCheck } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { RecentComment } from "../../../gen/docs_factory/review/v1/messages_pb";
import { feedQueue } from "../../../lib/comment-feed";
import { modelOf, plannedOf } from "../../../lib/content-ref";
import { initials } from "../../../lib/initials";
import { relativeTime } from "../../../lib/relative-time";
import { useCommentFeed, useReviewInbox } from "../../../lib/review-inbox";
import { refKey } from "../../../lib/review-queries";
import { ShowResolvedToggle } from "../CommentSidebar";
import { useCommentQueue } from "./comment-queue-context";
import { tabLabel } from "./tab-label";

export default function CommentFeed({ compact = false }: { compact?: boolean }) {
  const titleOf = useCallback(
    (rc: RecentComment) => rc.contentTitle || (rc.ref ? tabLabel(rc.ref) : "(untitled)"),
    [],
  );
  const { groups, resolvedThreads, isLoading, showResolved, setShowResolved } =
    useCommentFeed(titleOf);
  const { toMe } = useReviewInbox();
  const { queue, index, start } = useCommentQueue();
  const current = queue[index]?.rootId;

  const requestedRefs = useMemo(
    () => new Set(toMe.flatMap((r) => (r.ref ? [refKey(r.ref)] : []))),
    [toMe],
  );
  const flat = useMemo(() => feedQueue(groups), [groups]);

  if (isLoading) return <p className="muted">Loading…</p>;

  return (
    <div className={cn("comment-feed", compact && "comment-feed-compact")}>
      {resolvedThreads > 0 && (
        <div className="review-comments-summary">
          <span>
            {flat.length} {flat.length === 1 ? "thread" : "threads"}
          </span>
          <ShowResolvedToggle
            count={resolvedThreads}
            show={showResolved}
            onChange={setShowResolved}
          />
        </div>
      )}
      {groups.length === 0 ? (
        <p className="review-empty">No open comments.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="comment-feed-group" aria-label={group.title}>
            <h3 className="comment-feed-page">
              <span className="truncate">{group.title}</span>
              {plannedOf(group.ref) && <span className="comment-feed-tag">planned</span>}
              {modelOf(group.ref) && <span className="comment-feed-tag">model</span>}
              {requestedRefs.has(group.key) && (
                <span className="comment-feed-requested" title="Review requested from you">
                  <UserCheck className="size-3" aria-label="Review requested from you" />
                </span>
              )}
            </h3>
            <ul className="comment-feed-list">
              {group.threads.map((t) => {
                const c = t.latest.comment;
                const author = c?.authorName || c?.authorLogin || "Someone";
                const when = c?.createdAt ? relativeTime(timestampDate(c.createdAt)) : "";
                return (
                  <li key={t.rootId}>
                    <button
                      type="button"
                      className={cn(
                        "comment-feed-row",
                        t.resolved && "resolved",
                        current === t.rootId && "current",
                      )}
                      aria-current={current === t.rootId || undefined}
                      onClick={() =>
                        start(
                          flat,
                          flat.findIndex((f) => f.rootId === t.rootId),
                        )
                      }
                    >
                      <Avatar className="size-6 comment-feed-avatar">
                        {c?.authorLogin && (
                          <AvatarImage
                            src={`https://github.com/${c.authorLogin}.png?size=48`}
                            alt=""
                          />
                        )}
                        <AvatarFallback className="text-[0.6rem]">
                          {initials(author)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="comment-feed-content">
                        <span className="comment-feed-meta">
                          <strong>{author}</strong>
                          {when && <time>{when}</time>}
                          {t.count > 1 && (
                            <span
                              className="review-count small"
                              title={`${t.count} recent comments`}
                            >
                              {t.count}
                            </span>
                          )}
                          {t.unread > 0 && (
                            <span className="review-unread-dot" title={`${t.unread} unread`}>
                              <span className="sr-only">{t.unread} unread</span>
                            </span>
                          )}
                        </span>
                        <span className="comment-feed-body">{c?.bodyMd}</span>
                        {(t.headingText || t.resolved) && (
                          <span className="comment-feed-section">
                            {t.headingText && <span className="truncate">§ {t.headingText}</span>}
                            {t.resolved && <span className="review-dash-resolved">resolved</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
