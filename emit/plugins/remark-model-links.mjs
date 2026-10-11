/**
 * remark-model-links — resolve `[label](model:<element-id>)` links for a target
 * that has no model pages of its own. `resolve(id)` returns `{ url, title }` or
 * null; an unresolved link unwraps to its label, so a reader never meets a
 * `model:` URL. With no resolver every link unwraps.
 */
const MODEL_PREFIX = "model:";

export default function remarkModelLinks({ resolve = () => null } = {}) {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "link" || !child.url?.startsWith(MODEL_PREFIX)) return [child];
        const target = resolve(child.url.slice(MODEL_PREFIX.length));
        if (!target) return child.children;
        child.url = target.url;
        child.title = target.title ?? null;
        return [child];
      });
      for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
