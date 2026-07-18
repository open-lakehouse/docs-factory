import { lazy, Suspense, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import { modelHref, findModelElement } from "../model-refs";

const ModelDiagramModal = lazy(() => import("./ModelDiagramModal"));

/**
 * Inline reference to a model element, produced from `[label](model:<id>)` by
 * remark-model-links.
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
        <Network size={14} aria-hidden="true" />
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
