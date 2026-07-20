import { Link } from "react-router-dom";

export interface MetaLinkItem {
  id: string;
  title: string;
  href: string | null;
  externalUrl?: string | null;
}

/** Console-style inline links for the Explain metadata table (neighbors, links). */
export default function MetaLinks({ items }: { items: MetaLinkItem[] }) {
  if (items.length === 0) return null;

  return (
    <span className="meta-links">
      {items.map((item) =>
        item.href ? (
          <Link key={item.id} to={item.href} className="meta-link">
            {item.title}
          </Link>
        ) : item.externalUrl ? (
          <a
            key={item.id}
            href={item.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="meta-link"
          >
            {item.title} ↗
          </a>
        ) : (
          <span key={item.id} className="meta-link meta-link-plain">
            {item.title}
          </span>
        ),
      )}
    </span>
  );
}
