// The review timeline for one artifact: the append-only content_event log
// rendered most-recent-first. Read-only, allowlist-gated (the query is enabled
// only when review mode is active). Covers major lifecycle events — requests,
// state transitions, release/unpublish — but never frontmatter changes (those
// run through git/CI, not this app).
import { useQuery } from "@connectrpc/connect-query";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { listContentEvents } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { EventKind, type ContentEvent, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";

const KIND_LABEL: Record<number, string> = {
  [EventKind.REVIEW_REQUESTED]: "Review requested",
  [EventKind.REQUEST_SATISFIED]: "Review request satisfied",
  [EventKind.REQUEST_CANCELLED]: "Review request cancelled",
  [EventKind.STATE_IN_REVIEW]: "Moved to in review",
  [EventKind.STATE_CHANGES_REQUESTED]: "Changes requested",
  [EventKind.STATE_APPROVED]: "Approved",
  [EventKind.RELEASED]: "Released",
  [EventKind.UNPUBLISHED]: "Unpublished",
  [EventKind.REPUBLISHED]: "Republished",
};

/** Short relative time ("3h ago"), falling back to a date for older events. */
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

function eventDetail(e: ContentEvent): string {
  const parts: string[] = [];
  if (e.reviewerLogin) parts.push(e.reviewerLogin);
  if (e.note) parts.push(`“${e.note}”`);
  return parts.join(" · ");
}

export default function ContentEventTimeline({
  contentRef,
  heading = "Timeline",
}: {
  contentRef: ContentRef;
  heading?: string;
}) {
  const { reviewActive } = useAuth();
  const { data, isLoading } = useQuery(
    listContentEvents,
    { ref: contentRef },
    { enabled: reviewActive },
  );

  if (!reviewActive) return null;

  const events = data?.events ?? [];

  return (
    <div className="content-event-timeline">
      <p className="blog-aside-title">{heading}</p>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="review-empty">No lifecycle events yet.</p>
      ) : (
        <ul className="content-event-list">
          {events.map((e) => {
            const when = e.createdAt ? relativeTime(timestampDate(e.createdAt)) : "";
            const detail = eventDetail(e);
            return (
              <li key={e.id} className="content-event-row">
                <span className="content-event-kind">{KIND_LABEL[e.kind] ?? "Event"}</span>
                {e.actor && <span className="content-event-actor">{e.actor}</span>}
                {detail && <span className="content-event-detail">{detail}</span>}
                {when && <span className="content-event-time">{when}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
