import ModelDiagram from "./ModelDiagram";
import { pickScopedViewId } from "../model-refs";

export default function ExplainDiagram({ elementId }: { elementId: string }) {
  const viewId = pickScopedViewId(elementId);

  if (!viewId) {
    return (
      <p className="muted explain-diagram-empty">
        No diagram yet — this element does not appear in a rendered view.
      </p>
    );
  }

  return (
    <div className="diagram-frame">
      <ModelDiagram viewId={viewId} />
    </div>
  );
}
