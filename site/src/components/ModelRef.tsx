import { lazy, Suspense, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { modelHref, findModelElement } from "../model-refs";

// The popup pulls in ReactLikeC4 (heavy); load it only when first opened.
const ModelDiagramModal = lazy(() => import("./ModelDiagramModal"));

const GraphIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="6" r="2.5" />
    <circle cx="19" cy="6" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <path d="M7.2 7.3 10 15.6" />
    <path d="M16.8 7.3 14 15.6" />
    <path d="M7.5 6h9" />
  </svg>
);

/**
 * Inline reference to a model element, produced from `[label](model:<id>)` by
 * remark-model-links. Renders the label (a link to the element's explanation
 * page when its kind has one) plus a small graph icon that pops open the
 * element's focused LikeC4 view. Falls back to plain text for an unknown id.
 */
export function ModelRef({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const el = findModelElement(id);
  const href = modelHref(id);
  const label = children ?? el?.title ?? id;

  if (!el) {
    // Unknown id: degrade to plain text, never break the page.
    return <span className="model-ref model-ref-unknown">{label}</span>;
  }

  return (
    <span className="model-ref">
      {href ? (
        <Link to={href} className="model-ref-label">
          {label}
        </Link>
      ) : (
        <span className="model-ref-label">{label}</span>
      )}
      <button
        type="button"
        className="model-ref-icon"
        onClick={() => setOpen(true)}
        aria-label={`Show ${el.title} in the model`}
        title={`Show ${el.title} in the model`}
      >
        <GraphIcon />
      </button>
      {open && (
        <Suspense fallback={null}>
          <ModelDiagramModal id={id} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </span>
  );
}

export default ModelRef;
