/**
 * remark-likec4-views — upgrade a static diagram image to an interactive
 * LikeC4 view, keyed off the image title, at MDX-compile time.
 *
 * Drafts stay plain, portable Markdown (see blogs/CONVENTIONS.md §5): a diagram
 * is embedded as its committed PNG, with the LikeC4 view id in the image title —
 *
 *   ![alt text](./assets/name.png "likec4=<viewId>")
 *
 * On static targets (GitHub, plain Markdown, the Google Docs export) that title
 * is just a tooltip and the PNG renders as-is. In this preview harness (and on
 * the published MDX site) this plugin swaps the image node for
 *
 *   <LikeC4View viewId="<viewId>" />
 *
 * backed by the model in `src/likec4.generated.tsx` (produced by
 * `likec4 codegen react`), which exports a ready-to-use `LikeC4View` bound to
 * the model — no provider wrapping needed. `LikeC4View` infers sequence vs.
 * diagram layout from the view definition, so we don't pass a variant.
 *
 * GRACEFUL DEGRADATION: an image with no `likec4=` title (a D2 SVG, a
 * screenshot) is left untouched as a normal image. The plugin never throws —
 * the worst case is the preview shows the same static image the source always
 * had. Richness is a property of the renderer, never of the source.
 */

const LIKEC4_TITLE_RE = /^likec4=(\S+)$/;

// The import for the rewritten JSX — the generated model module exports a
// ready-to-use LikeC4View. Injected once per document, only when at least one
// image is upgraded.
const IMPORT_SOURCE = "@/likec4.generated";
const IMPORT_NAME = "LikeC4View";

/** Build the `import { LikeC4View } from "@/likec4-views"` mdast node. */
function importNode() {
  return {
    type: "mdxjsEsm",
    value: `import { ${IMPORT_NAME} } from "${IMPORT_SOURCE}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportSpecifier",
                imported: { type: "Identifier", name: IMPORT_NAME },
                local: { type: "Identifier", name: IMPORT_NAME },
              },
            ],
            source: { type: "Literal", value: IMPORT_SOURCE, raw: `"${IMPORT_SOURCE}"` },
          },
        ],
      },
    },
  };
}

/** Build the `<LikeC4View viewId="<id>" dynamicViewVariant="sequence" />` mdast node.
 * Our diagrams are `dynamic view`s authored as sequences; default the render to
 * the sequence (lifeline) layout rather than the box-and-arrow graph. For a
 * non-dynamic view the prop is simply ignored. */
function likec4ViewNode(viewId) {
  return {
    type: "mdxJsxFlowElement",
    name: IMPORT_NAME,
    attributes: [
      { type: "mdxJsxAttribute", name: "viewId", value: viewId },
      { type: "mdxJsxAttribute", name: "dynamicViewVariant", value: "sequence" },
    ],
    children: [],
  };
}

/** If a node is a paragraph wrapping a single matching image, return the id. */
function soleLikeC4Image(node) {
  if (node.type !== "paragraph" || !node.children || node.children.length !== 1) {
    return null;
  }
  const only = node.children[0];
  if (only.type === "image" && typeof only.title === "string") {
    const m = only.title.match(LIKEC4_TITLE_RE);
    if (m) return m[1];
  }
  return null;
}

export default function remarkLikeC4Views() {
  return (tree) => {
    let upgraded = false;

    // Replace matching nodes in-place within their parent's children. A
    // standalone diagram is a `paragraph` wrapping one `image`; we replace the
    // *paragraph* with the flow element so <LikeC4View>'s <div> is a block-level
    // sibling, not nested inside a <p> (which is invalid HTML and warns on
    // hydration). A likec4= image that is NOT standalone (inline in prose) is
    // left as a static image — an interactive canvas mid-sentence is nonsense.
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const viewId = soleLikeC4Image(child);
        if (viewId) {
          node.children[i] = likec4ViewNode(viewId);
          upgraded = true;
          continue;
        }
        walk(child);
      }
    };
    walk(tree);

    // Inject the import once, at the top, only if we rewrote something.
    if (upgraded) tree.children.unshift(importNode());
  };
}
