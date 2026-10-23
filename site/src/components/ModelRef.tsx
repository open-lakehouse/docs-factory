import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { findModelElement, modelHref, resolveRef } from "../model-refs";
import EntityCard from "./EntityCard";

/**
 * Inline reference to a model element, produced from `[label](model:<id>)` by
 * remark-model-links.
 */
export function ModelRef({ id, children }: { id: string; children?: ReactNode }) {
  const el = findModelElement(id);
  const info = resolveRef(id);
  const href = modelHref(id);
  const externalUrl = info?.externalUrl ?? null;
  const label = children ?? el?.title ?? id;

  if (!el || !info) {
    return <span className="model-ref model-ref-unknown">{label}</span>;
  }

  const card = {
    title: info.title,
    kindLabel: info.kindLabel,
    summary: info.summary,
    href: href ?? externalUrl,
    externalUrl: href ? externalUrl : null,
  };

  const labelNode = href ? (
    <Link to={href} className="model-ref-label">
      {label}
    </Link>
  ) : externalUrl ? (
    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="model-ref-label">
      {label}
    </a>
  ) : (
    <span className="model-ref-label">{label}</span>
  );

  return (
    <span className="model-ref">
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <span className="model-ref-trigger" tabIndex={0} onClick={(e) => e.stopPropagation()}>
            {labelNode}
          </span>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="entity-hovercard">
          <EntityCard data={card} />
        </HoverCardContent>
      </HoverCard>
    </span>
  );
}

export default ModelRef;
