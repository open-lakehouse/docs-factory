/**
 * remark-directive-guard — fail the emit on any directive left in the tree, for
 * a target whose site has no remark-directive: there a `:::prerequisites` or
 * `:::tab` would print as literal text. Runs after every construct plugin.
 */
const DIRECTIVES = new Set(["containerDirective", "leafDirective", "textDirective"]);

export default function remarkDirectiveGuard({ site = "this target" } = {}) {
  return (tree, file) => {
    const left = new Set();
    const walk = (node) => {
      if (DIRECTIVES.has(node.type)) left.add(node.name);
      node.children?.forEach(walk);
    };
    walk(tree);
    if (left.size) {
      const names = [...left].map((n) => `:::${n}`).join(", ");
      throw new Error(`${file?.path ?? "page"}: ${site} can't render ${names}`);
    }
  };
}
