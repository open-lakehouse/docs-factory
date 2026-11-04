/**
 * remark-callouts-jsx — `:::` callouts (and `:::tldr`) as a site's own callout
 * component, for an MDX target whose site has no remark-directive
 * (openlakehouse.io's `<Callout type="…" title="…">`).
 *
 * Options: `{ types, titles }`. `types` maps a draft callout name to the
 * component's `type`; a name it doesn't map is left for the directive guard to
 * report. `titles` gives a callout a title when the draft has no `[Label]`
 * (`tldr` → "TL;DR"). A directive label becomes `title`.
 *
 * Runs where the emitter runs callouts: before the journey, so a callout inside
 * a step is already converted.
 */
const NAME = "Callout";

function plainText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

export default function remarkCalloutsJsx({ types = {}, titles = {} } = {}) {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        walk(child);
        if (child.type !== "containerDirective" || !types[child.name]) return child;
        const [first, ...rest] = child.children ?? [];
        const labelled = first?.data?.directiveLabel;
        const title = labelled ? plainText(first).trim() : titles[child.name];
        const attributes = [{ type: "mdxJsxAttribute", name: "type", value: types[child.name] }];
        if (title) attributes.push({ type: "mdxJsxAttribute", name: "title", value: title });
        return {
          type: "mdxJsxFlowElement",
          name: NAME,
          attributes,
          children: labelled ? rest : (child.children ?? []),
        };
      });
    };
    walk(tree);
  };
}
