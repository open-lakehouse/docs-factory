// ContentTable — the expandable, filterable table shared by the blog index and
// the four Diátaxis axis indexes. One row per content item (or grouped series);
// clicking a row reveals a detail panel. The blog table was the original; this
// generalizes its row primitive so every content axis renders identically.
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

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
  status?: string;
  detail: ReactNode;
}

export default function ContentTable({ rows }: { rows: ContentRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <div className="blog-table-wrap">
      <table className="blog-table">
        <thead>
          <tr>
            <th className="blog-th-chevron" aria-hidden="true" />
            <th>Title</th>
            <th className="blog-th-author">Author</th>
            <th className="blog-th-date">Date</th>
            <th className="blog-th-status">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              row={row}
              isOpen={open === row.id}
              onToggle={() => toggle(row.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  row,
  isOpen,
  onToggle,
}: {
  row: ContentRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
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
        <td className="blog-row-status">
          {row.status && <span className="blog-badge">{row.status}</span>}
        </td>
      </tr>
      {isOpen && (
        <tr className="blog-detail-row">
          <td />
          <td colSpan={4}>{row.detail}</td>
        </tr>
      )}
    </>
  );
}
