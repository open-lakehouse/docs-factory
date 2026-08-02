// Shared page metadata + review controls. The review workspace keeps this
// visible for page context; regular content pages show it only in review mode.
// The last-updated day opens a compact Merkle version history on hover.

import { type Timestamp, timestampDate } from "@bufbuild/protobuf/wkt";
import { useQuery } from "@connectrpc/connect-query";
import { FilePlus2, GitCommitHorizontal, History } from "lucide-react";
import { useMemo, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ContentPage } from "../../content";
import {
  ContentArea,
  type ContentRef,
  type ContentVersion,
} from "../../gen/docs_factory/review/v1/messages_pb";
import {
  listDrafts,
  listVersions,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { EffectiveStatusBadge } from "../../lib/effective-status";
import { sameRef } from "../../lib/review-queries";
import AuthorBadge from "../AuthorBadge";
import { FrontmatterStatusBadge } from "../StatusBadge";
import RequestReviewControl from "./RequestReviewControl";
import ReviewControls from "./ReviewControls";

interface ReviewPageChromeProps {
  contentRef: ContentRef;
  page: ContentPage;
  alwaysVisible?: boolean;
}

/** Format a protobuf Timestamp as YYYY-MM-DD (UTC calendar day). */
function dayLabel(ts: Timestamp | undefined): string | null {
  if (!ts) return null;
  return timestampDate(ts).toISOString().slice(0, 10);
}

function shortSha(sha: string): string {
  return sha && sha !== "unknown" ? sha.slice(0, 8) : "—";
}

function createdAtMs(ts?: Timestamp): number {
  return ts ? timestampDate(ts).getTime() : 0;
}

interface VersionRow {
  id: string;
  label: string;
  sha: string;
  when: string;
  rootShort: string | null;
}

/**
 * Compact Merkle registration history for one artifact. Oldest row is
 * "Document added"; later rows whose root_hash differs are "Content revised".
 * Same derivation ContentEventTimeline uses for version markers.
 */
function compactVersionRows(versions: ContentVersion[]): VersionRow[] {
  const chronological = [...versions].sort(
    (a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt),
  );
  const out: VersionRow[] = [];
  for (let i = 0; i < chronological.length; i++) {
    const version = chronological[i];
    const when = dayLabel(version.createdAt) ?? "—";
    const sha = shortSha(version.gitSha);
    const rootShort = version.rootHash ? version.rootHash.slice(0, 8) : null;
    if (i === 0) {
      out.push({ id: version.id, label: "Document added", sha, when, rootShort });
      continue;
    }
    const prev = chronological[i - 1];
    if (version.rootHash && prev.rootHash && version.rootHash === prev.rootHash) continue;
    out.push({ id: version.id, label: "Content revised", sha, when, rootShort });
  }
  out.reverse(); // newest first for the hover list
  return out;
}

function LastUpdatedWithHistory({
  contentRef,
  lastUpdated,
}: {
  contentRef: ContentRef;
  lastUpdated: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery(listVersions, { ref: contentRef }, { enabled: open });
  const rows = useMemo(
    () => compactVersionRows(data?.versions ?? []).slice(0, 12),
    [data?.versions],
  );

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="mono review-page-chrome-muted review-page-chrome-history inline-flex items-center gap-1"
          aria-label={`Last updated ${lastUpdated}. Show version history.`}
        >
          <History aria-hidden className="size-3.5" />
          {lastUpdated}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="version-history-hovercard">
        <p className="version-history-hovercard-title">Version history</p>
        {isLoading ? (
          <p className="version-history-hovercard-empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="version-history-hovercard-empty">No registered versions yet.</p>
        ) : (
          <ul className="version-history-hovercard-list">
            {rows.map((row) => {
              const Icon = row.label === "Document added" ? FilePlus2 : GitCommitHorizontal;
              return (
                <li key={row.id} className="version-history-hovercard-row">
                  <Icon aria-hidden className="version-history-hovercard-icon" />
                  <div className="version-history-hovercard-body">
                    <span className="version-history-hovercard-label">{row.label}</span>
                    <span className="version-history-hovercard-meta mono">
                      {row.sha}
                      {row.rootShort ? ` · Σ ${row.rootShort}` : ""}
                      {` · ${row.when}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export default function ReviewPageChrome({
  contentRef,
  page,
  alwaysVisible = false,
}: ReviewPageChromeProps) {
  const { reviewActive, isAllowlisted } = useAuth();
  const fm = page.frontmatter;
  const isBlog = contentRef.area === ContentArea.BLOGS;
  const { data } = useQuery(listDrafts, {}, { enabled: reviewActive && isAllowlisted });
  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const lastUpdated = dayLabel(summary?.latestVersion?.createdAt);
  const targetRelease = dayLabel(summary?.targetReleaseDate);

  if (!reviewActive && !alwaysVisible) return null;

  return (
    <div className="review-page-chrome" aria-label="Page metadata and review">
      <div className="review-page-chrome-meta">
        {/* Compact chrome leads with one effective status. Dual-axis display
            lives in detailed listings (blog pipeline, ContentTable). */}
        {reviewActive && (
          <EffectiveStatusBadge frontmatterStatus={fm.status} reviewState={summary?.reviewState} />
        )}
        {!reviewActive && fm.status && <FrontmatterStatusBadge status={fm.status} />}
        {isBlog && fm.author && <AuthorBadge byline={fm.author} />}
        {reviewActive && lastUpdated && (
          <LastUpdatedWithHistory contentRef={contentRef} lastUpdated={lastUpdated} />
        )}
        {reviewActive && targetRelease && (
          <span className="mono review-page-chrome-muted" title="Target release date">
            target {targetRelease}
          </span>
        )}
        {!isBlog && fm.diataxis && (
          <span className="mono review-page-chrome-muted">{fm.diataxis}</span>
        )}
        {!isBlog && page.project && (
          <span className="mono review-page-chrome-muted">
            {page.project}
            {page.bucket ? ` / ${page.bucket}` : ""}
          </span>
        )}
      </div>

      {reviewActive && (
        <div className="review-page-chrome-actions">
          <RequestReviewControl contentRef={contentRef}>
            <ReviewControls
              contentRef={contentRef}
              frontmatterStatus={fm.status}
              layout="inline"
              showStatus={false}
            />
          </RequestReviewControl>
        </div>
      )}
    </div>
  );
}
