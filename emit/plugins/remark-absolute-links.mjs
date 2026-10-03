/**
 * remark-absolute-links — prefix root-relative link, image, and definition URLs
 * with the site origin. A `.md` twin is read outside the site (pasted into a chat,
 * fetched by an agent), where `/how-to/x` resolves against nothing. Run after
 * remark-source-links, which maps source links to those routes.
 */
const ROOT_RELATIVE_RE = /^\/(?!\/)/;

export default function remarkAbsoluteLinks({ origin }) {
  return (tree) => {
    const walk = (node) => {
      if (
        (node.type === "link" || node.type === "image" || node.type === "definition") &&
        ROOT_RELATIVE_RE.test(node.url ?? "")
      ) {
        node.url = `${origin}${node.url}`;
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
