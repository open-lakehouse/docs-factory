import { Link } from "react-router-dom";
import { resolveRef } from "../model-refs";

/**
 * Small metadata header linking a content page to the model concepts it is
 * "about" (from `references:` frontmatter). Console-style links (shared
 * `.meta-links` styling): page-worthy elements link to their explanation page,
 * others render as plain muted labels. Renders nothing when there are no
 * resolvable references.
 */
export default function ConceptHeader({ references }: { references?: string[] }) {
  const refs = (references ?? [])
    .map(resolveRef)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (refs.length === 0) return null;

  return (
    <aside className="concept-header" aria-label="Related concepts">
      <span className="concept-header-label">Concepts</span>
      <span className="meta-links">
        {refs.map((r) =>
          r.href ? (
            <Link key={r.id} to={r.href} className="meta-link">
              {r.title}
            </Link>
          ) : (
            <span key={r.id} className="meta-link meta-link-plain">
              {r.title}
            </span>
          ),
        )}
      </span>
    </aside>
  );
}
