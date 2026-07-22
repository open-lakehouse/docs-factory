import { useNavigate } from "react-router-dom";
import { ReactLikeC4 } from "likec4:react";
import { likec4model } from "../explain";
import { explanationHref } from "../explain-bindings";

interface ModelDiagramProps {
  viewId: string;
  dynamicViewVariant?: "sequence" | "diagram";
  onNavigateTo?: (to: string) => void;
}

/**
 * Shared LikeC4 renderer for the estate model. Used by ExplainDiagram (inline)
 * and ModelDiagramModal (popup).
 *
 * We use the stock `ReactLikeC4` (not a custom wrapper) with its native
 * controls, search, element-details, and node navigation left on. The only
 * app-specific behaviour is `onNavigateTo`: LikeC4's native "go to this node's
 * view" action is remapped to route to the content page that explains the
 * view's subject, so the diagram doubles as a docs index. That single hook is
 * why we stay on `ReactLikeC4` — `LikeC4View` doesn't expose a navigation
 * callback (its popup browser owns navigation internally).
 */
export default function ModelDiagram({
  viewId,
  dynamicViewVariant,
  onNavigateTo,
}: ModelDiagramProps) {
  const navigate = useNavigate();

  const handleNavigateTo =
    onNavigateTo ??
    ((to: string) => {
      const view = likec4model.findView(to);
      const of = view?.viewOf;
      const to2 = of ? explanationHref(String(of.id)) : null;
      if (to2) navigate(to2);
    });

  return (
    <ReactLikeC4
      viewId={viewId}
      dynamicViewVariant={dynamicViewVariant}
      enableElementDetails
      controls
      enableSearch
      fitViewPadding="48px"
      onNavigateTo={handleNavigateTo}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
