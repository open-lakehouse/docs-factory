/**
 * remark-likec4-mdx — LikeC4 views for an MDX target (unitycatalog.io,
 * delta.io, openlakehouse.io). `renderLikeC4Mdx` is the target's `renderLikeC4`:
 * a marker becomes `<LikeC4View viewId=… alt=…/>`, the site's wrapper around the
 * `<likec4-view>` web component (the bundle emit.mjs generates), so the diagram
 * is interactive. `alt` is the view's text equivalent, which the wrapper keeps
 * in the page for crawlers and screen readers. The plugin then imports
 * `LikeC4View.astro` once, if any view was rendered; a target whose site
 * provides its components to MDX (openlakehouse.io) skips the plugin.
 *
 * Options: `{ componentImportBase }`. Runs after remark-likec4-blocks.
 */
import { defaultImportNode, hasElement, prependImports } from "./mdx-import.mjs";

const DEFAULT_IMPORT_BASE = "@/components/blog";
export const LIKEC4_COMPONENT = "LikeC4View";

const attr = (name, value) => ({ type: "mdxJsxAttribute", name, value });

/** The interactive view for a resolved marker entry. */
export function renderLikeC4Mdx(entry) {
  const attributes = [attr("viewId", entry.viewId)];
  if (entry.alt) attributes.push(attr("alt", entry.alt));
  return { type: "mdxJsxFlowElement", name: LIKEC4_COMPONENT, attributes, children: [] };
}

export default function remarkLikeC4Mdx(options = {}) {
  const base = options.componentImportBase ?? DEFAULT_IMPORT_BASE;
  return (tree) => {
    if (hasElement(tree, LIKEC4_COMPONENT)) {
      prependImports(tree, [defaultImportNode(LIKEC4_COMPONENT, base)]);
    }
  };
}
