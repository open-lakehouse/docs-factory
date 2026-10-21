// The article body of a model tab in the review workspace: the element's or
// view's diagram and what the docs derive from it. Its threads live in the
// rail beside it, like a planned slot's.
import { ExternalLink } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { likec4model } from "../../../explain";
import { type ModelTarget, modelHref } from "../../../lib/content-ref";
import ModelDiagram from "../../ModelDiagram";
import { ModelTargetDetails, type Select } from "../../model/ModelInspector";

/** The view to show for a target: the view itself, or the element's own view. */
function diagramFor(target: ModelTarget): string | null {
  if (target.kind === "view") return target.id;
  if (target.kind === "estate") return "index";
  const el = likec4model.findElement(target.id);
  const own = el && [...el.views()].find((v) => String(v.viewOf?.id ?? "") === target.id);
  return own?.id ?? el?.defaultView?.id ?? null;
}

export default function ModelTargetView({ target }: { target: ModelTarget }) {
  const navigate = useNavigate();
  const viewId = diagramFor(target);
  // Selecting anything else is exploring, which the Model section is for.
  const select: Select = ({ el, view }) => {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (el) params.set("el", el);
    navigate(`/model?${params}`);
  };
  return (
    <>
      <p className="mb-4">
        <Link to={modelHref(target)} className="text-sm">
          <ExternalLink className="mr-1 inline size-3.5" aria-hidden />
          Open in the Model explorer
        </Link>
      </p>
      {viewId && (
        <div className="model-tab-diagram">
          <ModelDiagram viewId={viewId} onNavigateTo={(to) => select({ view: to })} />
        </div>
      )}
      <div className="model-inspector">
        <ModelTargetDetails target={target} select={select} />
      </div>
    </>
  );
}
