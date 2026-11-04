/**
 * remark-trestle-mdx — Trestle environment diagrams for an MDX target
 * (unitycatalog.io, delta.io, openlakehouse.io). `renderTrestleMdx` is the
 * target's `renderTrestle`: a marker becomes `<TrestleView src=… alt=…/>`, the
 * site's wrapper around the `<trestle-view>` web component
 * (webcomponents/trestle). `src` is where the site serves the snapshot, which
 * the emitter ships with the post (`entry.url`, see remark-trestle-md); `alt`
 * is the diagram's text equivalent, which the wrapper keeps in the page. The
 * plugin then imports `TrestleView.astro` once, if any diagram was rendered.
 *
 * Options: `{ componentImportBase }`. Runs after remark-trestle-md.
 */
import { defaultImportNode, hasElement, prependImports } from "./mdx-import.mjs";

const DEFAULT_IMPORT_BASE = "@/components/blog";
export const TRESTLE_COMPONENT = "TrestleView";

const attr = (name, value) => ({ type: "mdxJsxAttribute", name, value });

/** The interactive diagram for a resolved marker entry. */
export function renderTrestleMdx(entry) {
  if (!entry.url) throw new Error(`trestle ${entry.ref}: no snapshot URL (pass urlBase)`);
  const attributes = [attr("src", entry.url)];
  if (entry.alt) attributes.push(attr("alt", entry.alt));
  return { type: "mdxJsxFlowElement", name: TRESTLE_COMPONENT, attributes, children: [] };
}

export default function remarkTrestleMdx(options = {}) {
  const base = options.componentImportBase ?? DEFAULT_IMPORT_BASE;
  return (tree) => {
    if (hasElement(tree, TRESTLE_COMPONENT)) {
      prependImports(tree, [defaultImportNode(TRESTLE_COMPONENT, base)]);
    }
  };
}
