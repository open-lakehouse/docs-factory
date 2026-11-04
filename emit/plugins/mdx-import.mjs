/**
 * mdx-import — the `import Name from "<base>/Name.astro"` nodes an Astro MDX
 * target (unitycatalog.io, delta.io) needs for the components a plugin emits.
 * Astro components are default exports, one per file.
 */

/** A default `import <name> from "<base>/<name>.astro"` mdast node. */
export function defaultImportNode(name, base) {
  const source = `${base}/${name}.astro`;
  return {
    type: "mdxjsEsm",
    value: `import ${name} from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [{ type: "ImportDefaultSpecifier", local: { type: "Identifier", name } }],
            source: { type: "Literal", value: source, raw: `"${source}"` },
          },
        ],
      },
    },
  };
}

/** Whether `tree` holds a `<name>` flow element. */
export function hasElement(node, name) {
  if (node.type === "mdxJsxFlowElement" && node.name === name) return true;
  return node.children?.some((child) => hasElement(child, name)) ?? false;
}

/** Insert `imports` at the top of `tree`, after a leading `yaml` frontmatter
 * node: MDX requires the frontmatter to come first. */
export function prependImports(tree, imports) {
  const at = tree.children[0]?.type === "yaml" ? 1 : 0;
  tree.children.splice(at, 0, ...imports);
}
