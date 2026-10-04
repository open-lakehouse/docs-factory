import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getTag, tagCardData } from "../tags";
import EntityCard from "./EntityCard";

/** A single blog topic tag: a pill revealing the tag's EntityCard on hover. */
export default function TagChip({ slug }: { slug: string }) {
  const pill = <span className="tag">{slug}</span>;
  if (!getTag(slug).known) return pill;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{pill}</HoverCardTrigger>
      <HoverCardContent align="start" className="entity-hovercard">
        <EntityCard data={tagCardData(slug)} />
      </HoverCardContent>
    </HoverCard>
  );
}
