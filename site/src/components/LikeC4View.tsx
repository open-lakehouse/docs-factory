import { LikeC4View as LikeC4ViewEmbed } from "likec4:react";
import ExpandableDiagram from "./ExpandableDiagram";

/**
 * Markdown-facing LikeC4 renderer. `remark-likec4-views` turns
 * `![...](... "likec4=<viewId>")` into this component, so blog and docs
 * diagrams use the same LikeC4 Vite plugin/runtime as /explain.
 *
 * Unlike the estate /explain graphs (which want a pannable, infinite canvas via
 * `ReactLikeC4`), blog diagrams — especially dynamic sequences — read best in a
 * contained, aspect-fit frame. We use the lighter `LikeC4View` embed for that:
 * inline it stays centered and non-pannable (you can't scroll out of it), and
 * the sequence walkthrough controls (play / pause / step) live in the toolbar.
 * The Expand affordance opens a pannable + zoomable copy for close inspection.
 */
export function LikeC4View({
  viewId,
  dynamicViewVariant = "sequence",
}: {
  viewId: string;
  dynamicViewVariant?: "sequence" | "diagram";
}) {
  return (
    <ExpandableDiagram inlineClassName="diagram-frame diagram-frame-fit">
      {(expanded) => (
        <LikeC4ViewEmbed
          key={expanded ? "expanded" : "inline"}
          viewId={viewId}
          dynamicViewVariant={dynamicViewVariant}
          controls
          enableDynamicViewWalkthrough
          enableElementDetails
          browser={false}
          pannable={expanded}
          zoomable={expanded}
          keepAspectRatio={!expanded}
          background={expanded ? "dots" : "transparent"}
          fitViewPadding={expanded ? "48px" : "16px"}
          // Inline: let the embed size to the view's aspect ratio (tall
          // sequences render elongated + legible). Expanded: fill the dialog.
          style={expanded ? { height: "100%", width: "100%" } : { width: "100%" }}
        />
      )}
    </ExpandableDiagram>
  );
}
