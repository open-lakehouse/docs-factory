// A diagram node's link to the concept it stands for, with a hover card.
import type { ReactNode } from "react";
import { useHoverCard } from "./useHoverCard";

export type Concept = {
  title: string;
  kindLabel: string;
  summary: string | null;
  href: string | null;
  /** Asset kinds an implementation manages, as concept ids. */
  assets?: string[];
};

/** The concept's link, or null on the explaining page itself. */
export function conceptHref(concept: Concept): string | null {
  return concept.href && typeof window !== "undefined" && concept.href === window.location.pathname
    ? null
    : concept.href;
}

export function externalAttrs(href: string) {
  return /^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function ConceptRef({
  concept,
  note,
  children,
}: {
  concept: Concept;
  note?: string;
  children: ReactNode;
}) {
  const { trigger, popover } = useHoverCard();
  const href = conceptHref(concept);

  return (
    <>
      {href ? (
        <a className="concept-ref" href={href} {...externalAttrs(href)} {...trigger}>
          {children}
        </a>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focus opens the card for keyboard readers.
        <span className="concept-ref" tabIndex={0} {...trigger}>
          {children}
        </span>
      )}
      {popover(
        "concept-card",
        <>
          <span className="concept-card-kind">{concept.kindLabel}</span>
          <strong className="concept-card-title">{concept.title}</strong>
          {concept.summary && <p>{concept.summary}</p>}
          {note && <p className="concept-card-note">{note}</p>}
        </>,
      )}
    </>
  );
}
