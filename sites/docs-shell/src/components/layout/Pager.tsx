import { Link } from "react-router-dom";
import type { PageLink } from "../../site";

export default function Pager({ prev, next }: { prev: PageLink | null; next: PageLink | null }) {
  if (!prev && !next) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      {prev ? (
        <Link to={prev.route} className="pager-link" data-dir="prev">
          <span className="pager-label">← prev</span>
          <span className="pager-title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to={next.route} className="pager-link" data-dir="next">
          <span className="pager-label">next →</span>
          <span className="pager-title">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
