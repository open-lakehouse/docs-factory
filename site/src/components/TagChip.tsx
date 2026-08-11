import { getTag, tagCardData } from "../tags";
import SemanticChip from "./SemanticChip";

/**
 * A single blog topic tag: clickable pill with a rich hover card. In link mode
 * it navigates to the filtered blog index; when `onToggle` is set it becomes a
 * pressable filter facet reflecting `active`.
 */
export default function TagChip({
  slug,
  active,
  onToggle,
}: {
  slug: string;
  active?: boolean;
  onToggle?: (slug: string) => void;
}) {
  const tag = getTag(slug);
  const href = `/blog?tag=${encodeURIComponent(slug)}`;

  return (
    <SemanticChip
      label={slug}
      href={onToggle ? undefined : href}
      active={active}
      onToggle={onToggle ? () => onToggle(slug) : undefined}
      card={tag.known ? tagCardData(slug) : null}
    />
  );
}
