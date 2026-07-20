import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import EntityCard, { type EntityCardData } from "./EntityCard";

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

/**
 * A recognizable "semantic tag" pill — the shared chip used by blog topic tags
 * and model concept references. Renders as a `.tag` link (or plain pill when it
 * has no destination) and reveals an EntityCard on hover when `card` is set.
 */
export default function SemanticChip({
  label,
  href,
  card,
}: {
  label: string;
  href?: string | null;
  card?: EntityCardData | null;
}) {
  let pill: ReactNode;
  if (href && isExternal(href)) {
    pill = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="tag tag-link"
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </a>
    );
  } else if (href) {
    pill = (
      <Link to={href} className="tag tag-link" onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>
    );
  } else {
    pill = <span className="tag">{label}</span>;
  }

  if (!card) return pill;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{pill}</HoverCardTrigger>
      <HoverCardContent align="start" className="entity-hovercard">
        <EntityCard data={card} />
      </HoverCardContent>
    </HoverCard>
  );
}
