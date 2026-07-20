import TagChip from "./TagChip";

/** Shared tag pill list for blog index and post headers. */
export default function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <TagChip key={tag} slug={tag} />
      ))}
    </div>
  );
}
