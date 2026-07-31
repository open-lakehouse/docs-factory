// The review timeline for one artifact. Lifecycle events come from the
// append-only content_event log (requests, approvals, release). Version facts —
// "document added" and "content revised" — are DERIVED from content_version
// rows (the Merkle registration history), not stored as events. Read-only and
// allowlist-gated. Frontmatter authoring changes never appear here (git/CI).
import { useMemo } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";
import {
  Check,
  CircleDot,
  EyeOff,
  FilePlus2,
  GitCommitHorizontal,
  MessageSquare,
  Rocket,
  RotateCcw,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  listContentEvents,
  listVersions,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import {
  EventKind,
  type ContentEvent,
  type ContentRef,
  type ContentVersion,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";

const KIND_LABEL: Record<number, string> = {
  [EventKind.REVIEW_REQUESTED]: "Review requested",
  [EventKind.REQUEST_SATISFIED]: "Review request satisfied",
  [EventKind.REQUEST_CANCELLED]: "Review request cancelled",
  [EventKind.STATE_CHANGES_REQUESTED]: "Changes requested",
  [EventKind.STATE_APPROVED]: "Approved (override)",
  [EventKind.APPROVED]: "Approved",
  [EventKind.APPROVAL_DISMISSED]: "Approval dismissed",
  [EventKind.RELEASED]: "Released",
  [EventKind.UNPUBLISHED]: "Unpublished",
  [EventKind.REPUBLISHED]: "Republished",
};

interface TimelineItem {
  id: string;
  kindLabel: string;
  tone: TimelineTone;
  Icon: LucideIcon;
  actor?: string;
  detail?: string;
  createdAt?: Timestamp;
}

type TimelineTone = "version" | "review" | "success" | "danger" | "release" | "neutral";

function eventAppearance(kind: EventKind): { tone: TimelineTone; Icon: LucideIcon } {
  switch (kind) {
    case EventKind.REVIEW_REQUESTED:
      return { tone: "review", Icon: UserPlus };
    case EventKind.REQUEST_SATISFIED:
    case EventKind.APPROVED:
    case EventKind.STATE_APPROVED:
      return { tone: "success", Icon: Check };
    case EventKind.REQUEST_CANCELLED:
    case EventKind.STATE_CHANGES_REQUESTED:
    case EventKind.APPROVAL_DISMISSED:
      return { tone: "danger", Icon: X };
    case EventKind.RELEASED:
      return { tone: "release", Icon: Rocket };
    case EventKind.UNPUBLISHED:
      return { tone: "danger", Icon: EyeOff };
    case EventKind.REPUBLISHED:
      return { tone: "release", Icon: RotateCcw };
    default:
      return { tone: "neutral", Icon: MessageSquare };
  }
}

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

function shortSha(sha: string): string {
  return sha && sha !== "unknown" ? sha.slice(0, 8) : "";
}

function eventDetail(e: ContentEvent): string {
  const parts: string[] = [];
  if (e.reviewerLogin) parts.push(e.reviewerLogin);
  if (e.note) parts.push(`“${e.note}”`);
  return parts.join(" · ");
}

function createdAtMs(ts?: Timestamp): number {
  return ts ? timestampDate(ts).getTime() : 0;
}

/**
 * Derive version timeline markers from registered content_version rows.
 * Oldest → Document added; each later row whose Merkle root differs → Content revised.
 * Legacy content-revised rows in content_event are ignored in favor of this derivation.
 */
function derivedVersionItems(versions: ContentVersion[]): TimelineItem[] {
  const chronological = [...versions].sort(
    (a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt),
  );
  const out: TimelineItem[] = [];
  for (let i = 0; i < chronological.length; i++) {
    const version = chronological[i];
    const sha = shortSha(version.gitSha);
    if (i === 0) {
      out.push({
        id: `version-added:${version.id}`,
        kindLabel: "Document added",
        tone: "version",
        Icon: FilePlus2,
        actor: "build",
        detail: sha || undefined,
        createdAt: version.createdAt,
      });
      continue;
    }
    const prev = chronological[i - 1];
    // Only surface structural revisions. Identical roots mean the registration
    // didn't change the Merkle tree (shouldn't normally create a new row, but
    // guard anyway). Missing hashes still count as a revision of a new version.
    if (version.rootHash && prev.rootHash && version.rootHash === prev.rootHash) continue;
    out.push({
      id: `version-revised:${version.id}`,
      kindLabel: "Content revised",
      tone: "version",
      Icon: GitCommitHorizontal,
      actor: "build",
      detail: sha || undefined,
      createdAt: version.createdAt,
    });
  }
  return out;
}

function lifecycleItems(events: ContentEvent[]): TimelineItem[] {
  return events
    .filter((e) => e.kind !== EventKind.CONTENT_REVISED && e.kind !== EventKind.UNSPECIFIED)
    .map((e) => {
      const appearance = eventAppearance(e.kind);
      return {
        id: e.id,
        kindLabel: KIND_LABEL[e.kind] ?? "Event",
        ...appearance,
        actor: e.actor || undefined,
        detail: eventDetail(e) || undefined,
        createdAt: e.createdAt,
      };
    });
}

export default function ContentEventTimeline({
  contentRef,
  heading = "Timeline",
}: {
  contentRef: ContentRef;
  heading?: string;
}) {
  const { reviewActive } = useAuth();
  const { data: eventsData, isLoading: eventsLoading } = useQuery(
    listContentEvents,
    { ref: contentRef },
    { enabled: reviewActive },
  );
  const { data: versionsData, isLoading: versionsLoading } = useQuery(
    listVersions,
    { ref: contentRef },
    { enabled: reviewActive },
  );

  const items = useMemo(() => {
    const merged = [
      ...lifecycleItems(eventsData?.events ?? []),
      ...derivedVersionItems(versionsData?.versions ?? []),
    ];
    merged.sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));
    return merged;
  }, [eventsData, versionsData]);

  if (!reviewActive) return null;

  const isLoading = eventsLoading || versionsLoading;

  return (
    <div className="content-event-timeline">
      <p className="blog-aside-title">{heading}</p>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="review-empty">No events yet.</p>
      ) : (
        <ul className="content-event-list">
          {items.map((item) => {
            const when = item.createdAt ? relativeTime(timestampDate(item.createdAt)) : "";
            const Icon = item.Icon ?? CircleDot;
            return (
              <li key={item.id} className={`content-event-row event-${item.tone}`}>
                <span className="content-event-marker" aria-hidden="true">
                  <Icon />
                </span>
                <div className="content-event-body">
                  <div className="content-event-head">
                    <span className="content-event-kind">{item.kindLabel}</span>
                    {when && <time className="content-event-time">{when}</time>}
                  </div>
                  {(item.actor || item.detail) && (
                    <div className="content-event-meta">
                      {item.actor && <span className="content-event-actor">{item.actor}</span>}
                      {item.detail && <span className="content-event-detail">{item.detail}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
