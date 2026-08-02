import TagChip from "./TagChip";

/**
 * Shared tag pill list for blog index and post headers. Pass `onToggle` to turn
 * the pills into pressable filter facets (with `activeTags` marking selection).
 */
export default function TagList({
  tags,
  activeTags,
  onToggle,
}: {
  tags: string[];
  activeTags?: string[];
  onToggle?: (slug: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <TagChip key={tag} slug={tag} active={activeTags?.includes(tag)} onToggle={onToggle} />
      ))}
    </div>
  );
}
