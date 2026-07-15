import { Link } from "react-router-dom";

export interface PagerItem {
  label: string;
  href: string;
}

interface PagerProps {
  prev?: PagerItem;
  next?: PagerItem;
}

export default function Pager({ prev, next }: PagerProps) {
  if (!prev && !next) return null;

  return (
    <nav className="pager" aria-label="Page navigation">
      {prev ? (
        <Link to={prev.href} className="pager-link pager-prev">
          <span className="pager-dir">Previous</span>
          <span className="pager-label">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={next.href} className="pager-link pager-next">
          <span className="pager-dir">Next</span>
          <span className="pager-label">{next.label}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
