// An interactive LikeC4 diagram via the framework-agnostic <likec4-view> web
// component, whose bundle the emitter ships at WEB_COMPONENT. The fallback sits
// in the element's light DOM, so it is what crawlers and no-JS readers get, and
// the component's shadow root replaces it once the bundle registers the element.
// The view's own `variant` picks diagram or sequence.
import { useEffect } from "react";
import { DiagramFallback } from "./DiagramFallback";

const WEB_COMPONENT = "/likec4/likec4-webcomponent.mjs";

function loadWebComponent() {
  if (document.querySelector(`script[src="${WEB_COMPONENT}"]`)) return;
  const script = document.createElement("script");
  script.type = "module";
  script.src = WEB_COMPONENT;
  document.head.append(script);
}

export function LikeC4View({
  viewId,
  alt,
  mermaid,
}: {
  viewId: string;
  alt?: string;
  mermaid?: string;
}) {
  useEffect(loadWebComponent, []);
  return (
    <div className="diagram-frame" role="figure" aria-label={alt || undefined}>
      <likec4-view view-id={viewId} className="likec4-view">
        <DiagramFallback alt={alt || `Diagram: ${viewId}`} mermaid={mermaid} />
      </likec4-view>
    </div>
  );
}
