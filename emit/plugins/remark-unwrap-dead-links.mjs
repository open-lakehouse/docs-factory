/**
 * remark-unwrap-dead-links — replace any link still pointing at a relative
 * `.md`/`.mdx` source (one remark-source-links couldn't map to a published
 * route) with its label, so an emitted page never ships a link that 404s.
 * Run after remark-source-links.
 */
const MD_LINK_RE = /^(?![a-z][a-z0-9+.-]*:|\/|#)[^#?]*\.mdx?(?:[#?].*)?$/i;

export default function remarkUnwrapDeadLinks() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) =>
        child.type === "link" && MD_LINK_RE.test(child.url ?? "") ? child.children : [child],
      );
      for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
