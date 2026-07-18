/**
 * remark-model-links — upgrade a plain Markdown link with a `model:` URL into an
 * interactive reference to an estate model element, at MDX-compile time.
 *
 *   [table format](model:deltaSpec)
 *
 * On static targets (GitHub, plain Markdown, the Google Docs export) this is
 * just a link with an unusual href — it renders as readable text. In this
 * preview harness (and on the published MDX site) this plugin swaps the link
 * node for
 *
 *   <ModelRef id="deltaSpec">table format</ModelRef>
 *
 * which renders the label plus a small graph icon; clicking the icon pops open
 * the element's focused LikeC4 view. Same philosophy as remark-likec4-views'
 * `likec4=` image-title trick: richness is a property of the renderer, never of
 * the source.
 *
 * GRACEFUL DEGRADATION: a link with any other protocol is left untouched. The
 * plugin never throws; an unknown id is handled at render time by <ModelRef>.
 */

const MODEL_URL_RE = /^model:(.+)$/;

const IMPORT_SOURCE = "@/components/ModelRef";
const IMPORT_NAME = "ModelRef";

/** Build the `import { ModelRef } from "@/components/ModelRef"` mdast node. */
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
            source: {
              type: "Literal",
              value: IMPORT_SOURCE,
              raw: `"${IMPORT_SOURCE}"`,
            },
          },
        ],
      },
    },
  };
}

/** Build `<ModelRef id="<id>">…children…</ModelRef>` as an inline JSX element. */
function modelRefNode(id, children) {
  return {
    type: "mdxJsxTextElement",
    name: IMPORT_NAME,
    attributes: [{ type: "mdxJsxAttribute", name: "id", value: id }],
    children,
  };
}

export default function remarkModelLinks() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "link" && typeof child.url === "string") {
          const m = child.url.match(MODEL_URL_RE);
          if (m) {
            node.children[i] = modelRefNode(m[1], child.children ?? []);
            used = true;
            continue;
          }
        }
        walk(child);
      }
    };
    walk(tree);

    if (used) tree.children.unshift(importNode());
  };
}
