/**
 * remark-base-links — mount an authored root-relative link under the site's
 * base. Pages link each other by source path (remark-source-links routes those
 * with the base already), so a link a page writes as `/env/uc-hybrid.tar.gz`
 * names one of the site's own files, which a site mounted at `/docs` serves
 * at `/docs/env/uc-hybrid.tar.gz`. Content stays free of where its site lives.
 */
export default function remarkBaseLinks({ base = "" } = {}) {
  return (tree) => {
    if (!base) return;
    const walk = (node) => {
      if (
        (node.type === "link" || node.type === "definition") &&
        typeof node.url === "string" &&
        node.url.startsWith("/") &&
        !node.url.startsWith("//") &&
        node.url !== base &&
        !node.url.startsWith(`${base}/`)
      ) {
        node.url = `${base}${node.url}`;
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
