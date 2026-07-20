import SemanticChip from "./SemanticChip";
import { getTag, tagCardData } from "../tags";

/** A single blog topic tag: clickable pill with a rich hover card. */
export default function TagChip({ slug }: { slug: string }) {
  const tag = getTag(slug);
  const href = `/blog?tag=${encodeURIComponent(slug)}`;

  return (
    <SemanticChip
      label={slug}
      href={href}
      card={tag.known ? tagCardData(slug) : null}
    />
  );
}
