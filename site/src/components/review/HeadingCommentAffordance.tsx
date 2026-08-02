// Hover affordance on article headings: hovering an h1–h4 with an id reveals an
// inline action after the title (the conventional markdown permalink position).
// In review mode it starts a section comment; otherwise it is the permalink.

import { Link2, MessageSquare } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../lib/auth-context";
import { useSelectionState } from "./selection-context";

export default function HeadingCommentAffordance({
  articleRef,
  isActive = true,
}: {
  articleRef: RefObject<HTMLElement | null>;
  isActive?: boolean;
}) {
  const { canComment } = useAuth();
  const { setPending } = useSelectionState();
  const [heading, setHeading] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) {
      setHeading(null);
      return;
    }
    const article = articleRef.current;
    if (!article) return;

    function headingFrom(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null;
      // The button is portaled into the heading; treat it as still "on" the heading.
      const h = target.closest("h1, h2, h3, h4");
      if (!(h instanceof HTMLElement) || !article!.contains(h) || !h.id) return null;
      return h;
    }

    function onOver(e: PointerEvent) {
      const h = headingFrom(e.target);
      if (h) setHeading(h);
    }

    function onOut(e: PointerEvent) {
      const from = headingFrom(e.target);
      if (!from) return;
      const to = e.relatedTarget;
      if (to instanceof Element && from.contains(to)) return;
      setHeading(null);
    }

    article.addEventListener("pointerover", onOver);
    article.addEventListener("pointerout", onOut);
    return () => {
      article.removeEventListener("pointerover", onOver);
      article.removeEventListener("pointerout", onOut);
    };
  }, [articleRef, isActive, canComment]);

  if (!isActive || !heading) return null;

  const text = (heading.textContent ?? "").trim();

  const action = canComment ? (
    <button
      type="button"
      className="heading-affordance-btn"
      aria-label={`Comment on section: ${text}`}
      title="Comment on section"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPending({
          kind: "section",
          anchorSlug: heading.id,
          headingText: text,
        });
        setHeading(null);
      }}
    >
      <MessageSquare size={14} aria-hidden />
    </button>
  ) : (
    <a
      className="heading-affordance-btn"
      href={`#${heading.id}`}
      aria-label={`Permalink to section: ${text}`}
      title="Link to section"
    >
      <Link2 size={14} aria-hidden />
    </a>
  );

  return createPortal(action, heading);
}
