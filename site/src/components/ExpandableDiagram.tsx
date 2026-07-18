import { useEffect, useState, type ReactNode } from "react";

const MaximizeIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const MinimizeIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

/**
 * Frame that renders its child diagram inline and can expand it to a
 * near-fullscreen overlay. Escape or the backdrop collapses it.
 *
 * `children` is a render prop receiving the current `expanded` state. Callers
 * should key their diagram on it (ReactLikeC4 only auto-fits when its container
 * grows, so remounting on each toggle is what guarantees a correct refit when
 * collapsing back down — otherwise the viewport stays panned off-screen).
 */
export default function ExpandableDiagram({
  children,
}: {
  children: (expanded: boolean) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <>
      {expanded && (
        <button
          type="button"
          className="diagram-backdrop"
          aria-label="Collapse diagram"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className={expanded ? "diagram-frame diagram-frame-expanded" : "diagram-frame"}>
        <button
          type="button"
          className="diagram-expand-btn"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse diagram" : "Expand diagram"}
          aria-expanded={expanded}
        >
          {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
          <span>{expanded ? "Close" : "Expand"}</span>
        </button>
        {children(expanded)}
      </div>
    </>
  );
}
