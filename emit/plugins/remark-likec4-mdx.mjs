/**
 * remark-likec4-mdx — LikeC4 views for an Astro MDX target (unitycatalog.io,
 * delta.io). `renderLikeC4Mdx` is the target's `renderLikeC4`: a marker becomes
 * `<LikeC4View viewId=…/>`, the site's `LikeC4View.astro` wrapping the
 * `<likec4-view>` web component (the bundle emit.mjs generates), so the diagram
 * is interactive. The plugin then imports the component once, if any view was
 * rendered.
 *
 * Options: `{ componentImportBase }`. Runs after remark-likec4-blocks.
 */
const DEFAULT_IMPORT_BASE = "@/components/blog";
const IMPORT_NAME = "LikeC4View";

/** A default `import LikeC4View from "<base>/LikeC4View.astro"` (Astro
 * components are default exports). */
function importNode(base) {
  const source = `${base}/${IMPORT_NAME}.astro`;
  return {
    type: "mdxjsEsm",
    value: `import ${IMPORT_NAME} from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [
              { type: "ImportDefaultSpecifier", local: { type: "Identifier", name: IMPORT_NAME } },
            ],
            source: { type: "Literal", value: source, raw: `"${source}"` },
          },
        ],
      },
    },
  };
}

/** The interactive view for a resolved marker entry. */
export function renderLikeC4Mdx(entry) {
  return {
    type: "mdxJsxFlowElement",
    name: IMPORT_NAME,
    attributes: [{ type: "mdxJsxAttribute", name: "viewId", value: entry.viewId }],
    children: [],
  };
}

function hasView(node) {
  if (node.type === "mdxJsxFlowElement" && node.name === IMPORT_NAME) return true;
  return node.children?.some(hasView) ?? false;
}

export default function remarkLikeC4Mdx(options = {}) {
  const base = options.componentImportBase ?? DEFAULT_IMPORT_BASE;
  return (tree) => {
    if (!hasView(tree)) return;
    // After a leading `yaml` frontmatter node: MDX requires it to come first.
    const at = tree.children[0]?.type === "yaml" ? 1 : 0;
    tree.children.splice(at, 0, importNode(base));
  };
}
