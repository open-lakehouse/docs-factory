// An interactive LikeC4 diagram via the framework-agnostic <likec4-view> web
// component. The emitter ships its bundle at WEB_COMPONENT and each view's PNG at
// /assets/likec4/<viewId>.png; the PNG sits in the element's light DOM, so it is
// what crawlers and no-JS readers get, and the component's shadow root replaces
// it once the bundle registers the element.
import { useEffect } from "react";

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
  dynamicViewVariant = "sequence",
}: {
  viewId: string;
  dynamicViewVariant?: "sequence" | "diagram";
}) {
  useEffect(loadWebComponent, []);
  return (
    <div className="diagram-frame">
      <likec4-view view-id={viewId} dynamic-variant={dynamicViewVariant} className="likec4-view">
        <img src={`/assets/likec4/${viewId}.png`} alt={`Diagram: ${viewId}`} loading="lazy" />
      </likec4-view>
    </div>
  );
}
