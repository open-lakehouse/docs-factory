/**
 * remark-model-links-text — unwrap `[label](model:<element-id>)` links to their
 * label. The factory preview turns them into links into the LikeC4 model; an
 * emitted site has no model pages to link to yet, so the label stays as prose.
 */
export default function remarkModelLinksText() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) =>
        child.type === "link" && typeof child.url === "string" && child.url.startsWith("model:")
          ? child.children
          : [child],
      );
      for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
