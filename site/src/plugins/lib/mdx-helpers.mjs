/**
 * Shared helpers for remark plugins that emit MDX JSX elements.
 * Centralises import injection and mdast node builders so each plugin
 * stays focused on its transform logic.
 */
import { visit } from "unist-util-visit";

/** Build an mdxjsEsm import node: `import { A, B } from "source"`. */
export function importNode(names, source) {
  const list = Array.isArray(names) ? names : [names];
  return {
    type: "mdxjsEsm",
    value: `import { ${list.join(", ")} } from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: list.map((name) => ({
              type: "ImportSpecifier",
              imported: { type: "Identifier", name },
              local: { type: "Identifier", name },
            })),
            source: { type: "Literal", value: source, raw: `"${source}"` },
          },
        ],
      },
    },
  };
}

/** Prepend an import once when `used` is true. */
export function injectImport(tree, { names, source, used }) {
  if (used) tree.children.unshift(importNode(names, source));
}

/** String attribute on an mdxJsx* element. */
export function stringAttr(name, value) {
  return { type: "mdxJsxAttribute", name, value };
}

/** Expression attribute carrying a JS string literal (multiline-safe). */
export function expressionAttr(name, value) {
  return {
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(value),
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [
            {
              type: "ExpressionStatement",
              expression: { type: "Literal", value, raw: JSON.stringify(value) },
            },
          ],
        },
      },
    },
  };
}

/** Block-level JSX element. */
export function jsxFlow(name, { attributes = [], children = [] } = {}) {
  return { type: "mdxJsxFlowElement", name, attributes, children };
}

/** Inline JSX element. */
export function jsxText(name, { attributes = [], children = [] } = {}) {
  return { type: "mdxJsxTextElement", name, attributes, children };
}

/** Depth-first visitor over all nodes with children. */
export function walkTree(tree, visitor) {
  visit(tree, (node, index, parent) => {
    if (parent != null && index != null) visitor(node, index, parent);
  });
}

/** Extract optional `[label]` from a directive's first directiveLabel child. */
export function takeDirectiveLabel(node) {
  const first = node.children?.[0];
  if (first?.data?.directiveLabel) {
    node.children.shift();
    return first.children?.map((c) => c.value ?? "").join("") || undefined;
  }
  return undefined;
}

/** Read a string attribute from a containerDirective node (remark-directive v4). */
export function directiveAttr(node, name) {
  const attrs = node.attributes;
  if (!attrs || typeof attrs !== "object") return undefined;
  if (Array.isArray(attrs)) {
    const entry = attrs.find((a) => a.name === name);
    return entry?.value ?? undefined;
  }
  return attrs[name];
}
