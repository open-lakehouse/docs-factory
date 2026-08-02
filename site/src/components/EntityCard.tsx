import { Link } from "react-router-dom";

export interface ExternalRef {
  role: string;
  url: string;
}

/** Normalized metadata for hover cards on model refs and blog tags. */
export interface EntityCardData {
  title: string;
  kindLabel?: string;
  summary?: string;
  href?: string | null;
  externalUrl?: string | null;
  externalRefs?: ExternalRef[];
}

function ExternalLinkList({
  externalUrl,
  externalRefs,
}: {
  externalUrl?: string | null;
  externalRefs?: ExternalRef[];
}) {
  const refs = externalRefs ?? [];
  const hasPrimary = Boolean(externalUrl);
  if (!hasPrimary && refs.length === 0) return null;

  return (
    <div className="entity-card-links">
      {hasPrimary && (
        <a
          href={externalUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="entity-card-link"
          onClick={(e) => e.stopPropagation()}
        >
          {externalUrl} ↗
        </a>
      )}
      {refs.map((ref) => (
        <a
          key={`${ref.role}:${ref.url}`}
          href={ref.url}
          target="_blank"
          rel="noopener noreferrer"
          className="entity-card-link"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="entity-card-link-role">{ref.role}</span>
          <span className="entity-card-link-url">{ref.url}</span>
        </a>
      ))}
    </div>
  );
}

/** Shared hover-card body for model references and blog topic tags. */
export default function EntityCard({ data }: { data: EntityCardData }) {
  const { title, kindLabel, summary, href, externalUrl, externalRefs } = data;

  return (
    <div className="entity-card">
      <div className="entity-card-header">
        <p className="entity-card-title">{title}</p>
        {kindLabel && <span className="kind-badge entity-card-kind">{kindLabel}</span>}
      </div>
      {summary && <p className="entity-card-summary">{summary}</p>}
      <ExternalLinkList externalUrl={externalUrl} externalRefs={externalRefs} />
      {href &&
        (href.startsWith("http://") || href.startsWith("https://") ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="entity-card-cta"
            onClick={(e) => e.stopPropagation()}
          >
            Open page →
          </a>
        ) : (
          <Link to={href} className="entity-card-cta" onClick={(e) => e.stopPropagation()}>
            Open page →
          </Link>
        ))}
    </div>
  );
}
