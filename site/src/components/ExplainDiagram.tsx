import { Maximize2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { pickScopedViewId } from "../model-refs";
import ModelDiagram from "./ModelDiagram";

/**
 * The estate "in context" diagram for an explanation page. Dense neighborhoods
 * (e.g. Catalog) are illegible at the inline frame's height, so we offer an
 * Expand affordance that opens the SAME native ModelDiagram in a large modal.
 *
 * The only custom shell here is the button + modal container — `ReactLikeC4`
 * has no native fullscreen. Everything inside stays stock LikeC4 (pan/zoom,
 * controls, search, element details, our docs `onNavigateTo`), and the modal
 * copy is mounted only while open so it fits its larger container on open.
 */
export default function ExplainDiagram({ elementId }: { elementId: string }) {
  const viewId = pickScopedViewId(elementId);
  const [expanded, setExpanded] = useState(false);

  if (!viewId) {
    return (
      <p className="muted explain-diagram-empty">
        No diagram yet — this element does not appear in a rendered view.
      </p>
    );
  }

  return (
    <>
      <div className="diagram-frame">
        <button
          type="button"
          className="diagram-expand-btn"
          onClick={() => setExpanded(true)}
          aria-label="Expand diagram"
        >
          <Maximize2 size={15} aria-hidden="true" />
          <span>Expand</span>
        </button>
        <ModelDiagram viewId={viewId} />
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="diagram-frame-expanded" showCloseButton>
          <DialogTitle className="sr-only">Expanded diagram</DialogTitle>
          {expanded && (
            <div className="diagram-expanded-body">
              <ModelDiagram viewId={viewId} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
