import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { ReactLikeC4 } from "likec4:react";
import { resolveRef, focusedViewId } from "../model-refs";
import { likec4model, hasExplainPage, explainHref } from "../explain";

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

/** The element a view is `view of`, so in-diagram navigation can jump to its
 * explanation page. */
function viewSubjectId(viewId: string): string | null {
  const of = likec4model.findView(viewId)?.viewOf;
  return of ? String(of.id) : null;
}

/**
 * Never-inline popup: the scoped LikeC4 view for a model element, mounted only
 * while open (a fresh ReactLikeC4 each time, so it fits correctly on open).
 * Rendered through a portal with a backdrop; Escape or the backdrop closes it.
 */
export default function ModelDiagramModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const info = resolveRef(id);
  const viewId = focusedViewId(id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!info) return null;

  return createPortal(
    <button
      type="button"
      className="model-modal-backdrop"
      aria-label="Close"
      onClick={onClose}
    >
      <div
        className="model-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${info.kindLabel}: ${info.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="model-modal-header">
          <div className="model-modal-heading">
            <span className="kind-badge">{info.kindLabel}</span>
            <h2>{info.title}</h2>
          </div>
          <div className="model-modal-actions">
            {info.href && (
              <Link to={info.href} className="model-modal-link" onClick={onClose}>
                Open full explanation →
              </Link>
            )}
            <button
              type="button"
              className="model-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        {info.summary && <p className="model-modal-summary">{info.summary}</p>}
        <div className="model-modal-diagram">
          {viewId ? (
            <ReactLikeC4
              viewId={viewId}
              enableElementDetails
              controls={false}
              showNavigationButtons={false}
              enableSearch={false}
              fitViewPadding="48px"
              onNavigateTo={(to: string) => {
                const subject = viewSubjectId(to);
                if (subject && hasExplainPage(subject)) {
                  onClose();
                  navigate(explainHref(subject));
                }
              }}
              style={{ height: "100%", width: "100%" }}
            />
          ) : (
            <p className="muted model-modal-empty">
              No focused view for “{info.title}” yet.
              {info.href ? " Open the full explanation for context." : ""}
            </p>
          )}
        </div>
      </div>
    </button>,
    document.body,
  );
}
