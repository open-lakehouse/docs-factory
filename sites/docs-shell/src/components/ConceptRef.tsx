// A diagram node's link to the concept it stands for, with a hover card. The
// card portals where the diagram says: the body inline, but inside the expand
// dialog, a modal that draws above anything in the body.
import { useDiagramPortal } from "@open-lakehouse/trestle-diagram";
import { type ReactNode, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Concept = {
  title: string;
  kindLabel: string;
  summary: string | null;
  href: string | null;
};

const OPEN_DELAY_MS = 120;
const EDGE_GAP = 8;

export function ConceptRef({
  concept,
  note,
  children,
}: {
  concept: Concept;
  note?: string;
  children: ReactNode;
}) {
  const portal = useDiagramPortal();
  const cardId = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [at, setAt] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // Nodes on the right edge would push the card off-screen: pull it back in.
  useLayoutEffect(() => {
    const el = card.current;
    if (!at || !el) return;
    const max = window.innerWidth - el.offsetWidth - EDGE_GAP;
    el.style.left = `${Math.max(EDGE_GAP, Math.min(at.left, max))}px`;
  }, [at]);

  const show = useCallback((el: HTMLElement, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAt(el.getBoundingClientRect()), delay);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setAt(null);
  }, []);

  // The explaining page itself shows the label without a link to itself.
  const href =
    concept.href && typeof window !== "undefined" && concept.href === window.location.pathname
      ? null
      : concept.href;
  const external = href ? /^https?:/.test(href) : false;
  const handlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget, OPEN_DELAY_MS),
    onMouseLeave: hide,
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget, 0),
    onBlur: hide,
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Escape" && hide(),
    "aria-describedby": at ? cardId : undefined,
  };

  return (
    <>
      {href ? (
        <a
          className="concept-ref"
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          {...handlers}
        >
          {children}
        </a>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focus opens the card for keyboard readers.
        <span className="concept-ref" tabIndex={0} {...handlers}>
          {children}
        </span>
      )}
      {at &&
        createPortal(
          <div
            ref={card}
            id={cardId}
            role="tooltip"
            className="concept-card"
            style={{ left: at.left, top: at.bottom + 6 }}
          >
            <span className="concept-card-kind">{concept.kindLabel}</span>
            <strong className="concept-card-title">{concept.title}</strong>
            {concept.summary && <p>{concept.summary}</p>}
            {note && <p className="concept-card-note">{note}</p>}
          </div>,
          portal ?? document.body,
        )}
    </>
  );
}
