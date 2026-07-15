/**
 * remark-code-block — turn every fenced `code` node into a `<CodeBlock>` MDX
 * element carrying the RAW code + language + filename as props, so the block is
 * highlighted CLIENT-side by Shiki (see src/components/code-block.tsx, wrapping
 * the Kibo code-block). This replaces build-time rehype-pretty-code highlighting.
 *
 * Why client-side: it sets up multi-file / multi-language TABS (Kibo's data-array
 * model) and a possible future live editor — neither of which build-time
 * highlighting supports. The cost (Shiki + grammars in the bundle, an async
 * highlight with a fallback) is acceptable for this throwaway preview harness.
 *
 * Runs LAST in the remark chain, after:
 *   - remark-code-snippets (inlined `file=` code, set the `title=`/basename),
 *   - remark-journey (already wrapped journey-step fences; but those code nodes
 *     are still plain `code` nodes inside <JourneyStep>, so this converts them too).
 *
 * Reads from each code node:
 *   - node.lang   → language
 *   - node.value  → raw code (the clipboard payload + what Shiki highlights)
 *   - node.meta   → `title="…"` for the filename (rest is ignored here)
 *
 * A `<CodeBlock>` import is injected once per document (mirrors
 * remark-likec4-views / remark-journey).
 */

const TITLE_RE = /\btitle="([^"]*)"/;

const IMPORT_SOURCE = "@/components/code-block";
const IMPORT_NAME = "CodeBlock";

/** Build `import { CodeBlock } from "@/components/code-block";`. */
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

/** A `<CodeBlock code={…} lang="…" filename="…" />` mdast JSX node. */
function codeBlockNode(node) {
  const titleM = (node.meta ?? "").match(TITLE_RE);
  const attrs = [
    { type: "mdxJsxAttribute", name: "lang", value: node.lang ?? "text" },
    // Pass the raw code as an expression attribute (a JS string literal) so
    // newlines/quotes survive intact — a plain string attribute would need
    // escaping and can't hold multiline content.
    {
      type: "mdxJsxAttribute",
      name: "code",
      value: {
        type: "mdxJsxAttributeValueExpression",
        value: JSON.stringify(node.value),
        data: {
          estree: {
            type: "Program",
            sourceType: "module",
            body: [
              {
                type: "ExpressionStatement",
                expression: { type: "Literal", value: node.value, raw: JSON.stringify(node.value) },
              },
            ],
          },
        },
      },
    },
  ];
  if (titleM) {
    attrs.push({ type: "mdxJsxAttribute", name: "filename", value: titleM[1] });
  }
  return {
    type: "mdxJsxFlowElement",
    name: IMPORT_NAME,
    attributes: attrs,
    children: [],
  };
}

export default function remarkCodeBlock() {
  return (tree) => {
    let converted = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "code") {
          node.children[i] = codeBlockNode(child);
          converted = true;
        } else {
          walk(child);
        }
      }
    };
    walk(tree);

    if (converted) tree.children.unshift(importNode());
  };
}
