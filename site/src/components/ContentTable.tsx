// ContentTable — the expandable, filterable table shared by the blog index and
// the four Diátaxis axis indexes. One row per content item (or grouped series);
// clicking a row reveals a detail panel. The blog table was the original; this
// generalizes its row primitive so every content axis renders identically.
//
// Status columns are viewer-dependent. Allowlisted reviewers see TWO columns —
// the git frontmatter authoring status and the DB review lifecycle state (the
// two orthogonal status axes) — so they can triage what still needs work.
// Anonymous viewers see neither: their table is already narrowed to published
// content, so a status column would be noise. Pass `showStatus` to toggle them.

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { ReviewState } from "../gen/docs_factory/review/v1/messages_pb";
import { ReviewStateBadge } from "../lib/review-status";
import { FrontmatterStatusBadge } from "./StatusBadge";

export interface ContentRow {
  /** Stable key + open/close identity. */
  id: string;
  icon: ReactNode;
  title: string;
  /** When set, the title is a link (and won't toggle the row). */
  titleHref?: string;
  /** Small count/label badge after the title (e.g. "3 posts"). */
  titleBadge?: string;
  author?: ReactNode;
  date?: string;
  /** Git frontmatter authoring status (draft/ready/…). Shown to reviewers only. */
  frontmatterStatus?: string;
  /** DB review lifecycle state. Shown to reviewers only; omit for non-content rows. */
  reviewState?: ReviewState;
  detail: ReactNode;
}

function TableColgroup({ showStatus }: { showStatus: boolean }) {
  return (
    <colgroup>
      <col className="blog-col-chevron" />
      <col className="blog-col-title" />
      <col className="blog-col-author" />
      <col className="blog-col-date" />
      {showStatus && (
        <>
          <col className="blog-col-status" />
          <col className="blog-col-status" />
        </>
      )}
    </colgroup>
  );
}

function TableHead({ showStatus }: { showStatus: boolean }) {
  return (
    <thead>
      <tr>
        <th className="blog-th-chevron" aria-hidden="true" />
        <th>Title</th>
        <th className="blog-th-author">Author</th>
        <th className="blog-th-date">Date</th>
        {showStatus && (
          <>
            <th className="blog-th-status">Author status</th>
            <th className="blog-th-status">Review</th>
          </>
        )}
      </tr>
    </thead>
  );
}

export default function ContentTable({
  rows,
  showStatus = false,
}: {
  rows: ContentRow[];
  /** Render the reviewer-only author-status + review-state columns. */
  showStatus?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <div className="blog-table-wrap">
      <table className="blog-table blog-table-head">
        <TableColgroup showStatus={showStatus} />
        <TableHead showStatus={showStatus} />
      </table>
      <div className="blog-table-scroll">
        <table className="blog-table blog-table-body">
          <TableColgroup showStatus={showStatus} />
          <tbody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                row={row}
                showStatus={showStatus}
                isOpen={open === row.id}
                onToggle={() => toggle(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow({
  row,
  showStatus,
  isOpen,
  onToggle,
}: {
  row: ContentRow;
  showStatus: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  // Non-content rows (e.g. explanation coverage gaps) have no review state; they
  // carry only a frontmatterStatus label ("No explanation yet") and no ref.
  const hasReview = row.reviewState !== undefined && row.reviewState !== ReviewState.UNSPECIFIED;
  // Detail spans every column to the right of the chevron.
  const detailSpan = showStatus ? 5 : 3;
  return (
    <>
      <tr
        className={isOpen ? "blog-row open" : "blog-row"}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <td className="blog-row-chevron">
          {isOpen ? (
            <ChevronDown className="blog-chevron" aria-hidden="true" />
          ) : (
            <ChevronRight className="blog-chevron" aria-hidden="true" />
          )}
        </td>
        <td className="blog-row-name">
          <span className="blog-row-title-wrap">
            {row.icon}
            {row.titleHref ? (
              <Link
                to={row.titleHref}
                className="blog-row-title"
                onClick={(e) => e.stopPropagation()}
              >
                {row.title}
              </Link>
            ) : (
              <span className="blog-row-title">{row.title}</span>
            )}
            {row.titleBadge && <span className="blog-row-count">{row.titleBadge}</span>}
          </span>
        </td>
        <td className="blog-row-author">{row.author}</td>
        <td className="blog-row-date mono">{row.date ?? "—"}</td>
        {showStatus && (
          <>
            <td className="blog-row-status">
              {row.frontmatterStatus && <FrontmatterStatusBadge status={row.frontmatterStatus} />}
            </td>
            <td className="blog-row-status">
              {hasReview && <ReviewStateBadge state={row.reviewState as ReviewState} />}
            </td>
          </>
        )}
      </tr>
      {isOpen && (
        <tr className="blog-detail-row">
          <td />
          <td colSpan={detailSpan}>{row.detail}</td>
        </tr>
      )}
    </>
  );
}
