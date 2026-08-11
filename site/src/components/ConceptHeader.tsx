import { resolveRef } from "../model-refs";
import SemanticChip from "./SemanticChip";

/**
 * Small metadata header linking a content page to the model concepts it is
 * "about" (from `references:` frontmatter). Renders each concept as the same
 * recognizable semantic-tag pill used for blog topics.
 */
export default function ConceptHeader({ references }: { references?: string[] }) {
  const refs = (references ?? [])
    .map(resolveRef)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (refs.length === 0) return null;

  return (
    <aside className="concept-header" aria-label="Related concepts">
      <span className="concept-header-label">Concepts</span>
      <div className="tag-list">
        {refs.map((r) => (
          <SemanticChip
            key={r.id}
            label={r.title}
            href={r.href ?? r.externalUrl}
            card={{
              title: r.title,
              kindLabel: r.kindLabel,
              summary: r.summary,
              href: r.href ?? r.externalUrl,
              externalUrl: r.href ? r.externalUrl : null,
            }}
          />
        ))}
      </div>
    </aside>
  );
}
