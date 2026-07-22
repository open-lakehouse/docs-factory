import { LikeC4View as LikeC4ViewEmbed } from "likec4:react";

/**
 * Markdown-facing LikeC4 renderer. `remark-likec4-views` turns
 * `![...](... "likec4=<viewId>")` into this component, so blog and docs
 * diagrams use the same LikeC4 Vite plugin/runtime as /explain.
 *
 * The inline embed stays a contained, aspect-fit preview (non-pannable, so you
 * can't scroll out of it) with the sequence walkthrough controls in the toolbar.
 * Clicking it opens LikeC4's native popup browser — a pannable + zoomable,
 * searchable overlay for close inspection — which replaces our old hand-rolled
 * "Expand" dialog.
 */
export function LikeC4View({
  viewId,
  dynamicViewVariant = "sequence",
}: {
  viewId: string;
  dynamicViewVariant?: "sequence" | "diagram";
}) {
  return (
    <div className="diagram-frame diagram-frame-fit">
      <LikeC4ViewEmbed
        viewId={viewId}
        dynamicViewVariant={dynamicViewVariant}
        controls
        enableDynamicViewWalkthrough
        enableElementDetails
        keepAspectRatio
        fitViewPadding="16px"
        // Let the embed size to the view's aspect ratio (tall sequences render
        // elongated + legible); the native browser handles pan/zoom on click.
        style={{ width: "100%" }}
      />
    </div>
  );
}
