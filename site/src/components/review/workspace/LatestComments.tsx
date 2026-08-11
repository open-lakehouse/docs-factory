// Latest-comments inbox for the Overview workspace tab. Cross-content recent
// activity; clicking a row opens that page with a deep-link to the thread.
// Cards for content with an open review request to the viewer get a highlight
// matching the left-tree UserCheck signal.

import { timestampDate } from "@bufbuild/protobuf/wkt";
import { UserCheck } from "lucide-react";
import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RecentComment } from "../../../gen/docs_factory/review/v1/messages_pb";
import { initials } from "../../../lib/initials";
import { useReviewInbox } from "../../../lib/review-inbox";
import { refKey } from "../../../lib/review-queries";
import { useWorkspaceTabs } from "./workspace-tabs-context";

function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function LatestComments() {
  const { openTab } = useWorkspaceTabs();
  const { recent, toMe, isLoading } = useReviewInbox();

  const requestedRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const request of toMe) {
      if (request.ref) refs.add(refKey(request.ref));
    }
    return refs;
  }, [toMe]);

  const openComment = (rc: RecentComment) => {
    if (!rc.ref) return;
    // A thread is keyed by its root comment's id: parent_id when this is a
    // reply, else the comment's own id (it is the root).
    const threadRoot = rc.comment ? rc.comment.parentId || rc.comment.id : undefined;
    openTab(rc.ref, { thread: threadRoot, anchor: rc.anchorSlug || undefined });
  };

  return (
    <section aria-label="Latest comments">
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="review-empty">No comments yet.</p>
      ) : (
        <ul className="review-dash-list">
          {recent.map((rc) => {
            const c = rc.comment;
            const label = rc.contentTitle || rc.ref?.slug || "(untitled)";
            const author = c?.authorName || c?.authorLogin || "Someone";
            const when = c?.createdAt ? relativeTime(timestampDate(c.createdAt)) : "";
            const requested = Boolean(rc.ref && requestedRefs.has(refKey(rc.ref)));
            return (
              <li key={c?.id} className="review-dash-comment latest-comment-card">
                <button
                  type="button"
                  className="latest-comment-row"
                  onClick={() => openComment(rc)}
                >
                  <Avatar className="size-8 latest-comment-avatar">
                    {c?.authorLogin && (
                      <AvatarImage src={`https://github.com/${c.authorLogin}.png?size=64`} alt="" />
                    )}
                    <AvatarFallback className="text-[0.65rem]">{initials(author)}</AvatarFallback>
                  </Avatar>
                  <span className="latest-comment-content">
                    <span className="latest-comment-meta">
                      <strong>{author}</strong>
                      {c?.authorLogin && c.authorName && <span>@{c.authorLogin}</span>}
                      {when && <time>{when}</time>}
                      {c?.editedAt && <span>edited</span>}
                    </span>
                    <span className="latest-comment-body">{c?.bodyMd}</span>
                    <span className="latest-comment-location">
                      <strong>{label}</strong>
                      {rc.headingText && <span> / {rc.headingText}</span>}
                      {rc.resolved && <span className="review-dash-resolved">resolved</span>}
                    </span>
                  </span>
                  {requested && (
                    // Wrap in a titled span: lucide icons don't render a `title`
                    // prop as an SVG <title> child, so a native hover tooltip
                    // needs the attribute on a wrapping element. aria-label on the
                    // icon supplies the accessible name.
                    <span className="latest-comment-requested" title="Review requested from you">
                      <UserCheck
                        className="latest-comment-requested-icon"
                        aria-label="Review requested from you"
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
