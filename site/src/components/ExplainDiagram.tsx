import ModelDiagram, { RefitOnResize } from "./ModelDiagram";
import ExpandableDiagram from "./ExpandableDiagram";
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
    <ExpandableDiagram>
      {(expanded) => (
        <ModelDiagram
          key={expanded ? "expanded" : "inline"}
          viewId={viewId}
          showExplainActions
        >
          <RefitOnResize expanded={expanded} />
        </ModelDiagram>
      )}
    </ExpandableDiagram>
  );
}
