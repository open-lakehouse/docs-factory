import { Link } from "react-router-dom";
import MetaLinks from "./MetaLinks";
import { resolveRef } from "../model-refs";

/**
 * Small metadata header linking a content page to the model concepts it is
 * "about" (from `references:` frontmatter).
 */
export default function ConceptHeader({ references }: { references?: string[] }) {
  const refs = (references ?? [])
    .map(resolveRef)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (refs.length === 0) return null;

  return (
    <aside className="concept-header" aria-label="Related concepts">
      <span className="concept-header-label">Concepts</span>
      <MetaLinks items={refs} />
    </aside>
  );
}
