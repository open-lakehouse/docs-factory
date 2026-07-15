/**
 * remark-callouts — turn `:::tip` / `:::warning` / `:::note` / `:::info` /
 * `:::caution` container directives into `<Callout type="…">` boxes.
 *
 *   :::tip
 *   Use an UNNAMED secret — a named one isn't wired into the request URL yet.
 *   :::
 *
 *   :::warning Title override
 *   This nightly extension moves fast; pin nothing you can't re-verify.
 *   :::
 *
 * Works anywhere prose does — standalone, or inside a `::::journey` step (the
 * journey uses 4 colons so a 3-colon callout nests cleanly). The directive label
 * (`:::tip[My title]` or the text right after the name) overrides the default
 * heading. Unknown directive names are left untouched for other plugins
 * (remark-journey owns `journey`).
 *
 * Runs AFTER remark-directive (needs the parsed containerDirective) and after
 * remark-directive-prose-guard (which only unwraps text/leaf directives, never
 * containers, so callouts survive it). Injects the `<Callout>` import once.
 */

const TYPES = new Set(["tip", "warning", "note", "info", "caution", "danger"]);

const IMPORT_SOURCE = "@/components/callout";
const IMPORT_NAME = "Callout";

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

/** A directive's optional label (`:::tip[Label]`) lives in a `directiveLabel`
 * paragraph as the node's first child; extract and remove it if present. */
function takeLabel(node) {
  const first = node.children?.[0];
  if (first && first.data?.directiveLabel) {
    node.children.shift();
    return first.children?.map((c) => c.value ?? "").join("") || undefined;
  }
  return undefined;
}

export default function remarkCallouts() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && TYPES.has(child.name)) {
          const title = takeLabel(child);
          // recurse first so nested directives inside a callout still transform
          walk(child);
          node.children[i] = {
            type: "mdxJsxFlowElement",
            name: IMPORT_NAME,
            attributes: [
              { type: "mdxJsxAttribute", name: "type", value: child.name },
              ...(title ? [{ type: "mdxJsxAttribute", name: "title", value: title }] : []),
            ],
            children: child.children,
          };
          used = true;
        } else {
          walk(child);
        }
      }
    };
    walk(tree);

    if (used) tree.children.unshift(importNode());
  };
}
