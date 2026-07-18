import { Link, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ModelDiagram from "./ModelDiagram";
import { resolveRef, focusedViewId } from "../model-refs";
import { hasExplainPage, explainHref, likec4model } from "../explain";

function viewSubjectId(viewId: string): string | null {
  const of = likec4model.findView(viewId)?.viewOf;
  return of ? String(of.id) : null;
}

/**
 * Popup showing a model element's focused LikeC4 view. Mounted only while open
 * so ReactLikeC4 fits correctly on each open.
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

  if (!info) return null;

  const handleNavigateTo = (to: string) => {
    const subject = viewSubjectId(to);
    if (subject && hasExplainPage(subject)) {
      onClose();
      navigate(explainHref(subject));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="model-modal" showCloseButton>
        <DialogHeader className="model-modal-header">
          <div className="model-modal-heading">
            <span className="kind-badge">{info.kindLabel}</span>
            <DialogTitle>{info.title}</DialogTitle>
          </div>
          {info.href && (
            <Link to={info.href} className="model-modal-link" onClick={onClose}>
              Open full explanation →
            </Link>
          )}
        </DialogHeader>
        {info.summary && <p className="model-modal-summary">{info.summary}</p>}
        <div className="model-modal-diagram">
          {viewId ? (
            <ModelDiagram
              viewId={viewId}
              onNavigateTo={handleNavigateTo}
            />
          ) : (
            <p className="muted model-modal-empty">
              No focused view for “{info.title}” yet.
              {info.href ? " Open the full explanation for context." : ""}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
