/**
 * Project a resolved nav.yml tree (content-core resolveNav) onto the pages an
 * emit actually publishes: planned slots and unselected pages drop out, and a
 * section left empty goes with them. Pure, for testing.
 */

/**
 * @param {object[]} tree   resolveNav(...).tree
 * @param {{ isSelected: (bucket: string, slug: string) => boolean,
 *           routeFor: (bucket: string, slug: string) => string }} opts
 * @returns {{ nav: object[], order: { route: string, section: string[] }[] }}
 *   `nav` is the sidebar tree for site.json; `order` lists each page's primary
 *   placement in nav order (prev/next and breadcrumbs follow it).
 */
export function projectNav(tree, { isSelected, routeFor }) {
  const order = [];
  const project = (nodes, trail) => {
    const out = [];
    for (const node of nodes) {
      if (node.kind === "section") {
        const items = project(node.children, [...trail, node.label]);
        if (items.length) out.push({ kind: "section", label: node.label, items });
      } else if (node.kind === "page" && isSelected(node.bucket, node.slug)) {
        const route = routeFor(node.bucket, node.slug);
        if (node.primary) order.push({ route, section: trail });
        out.push({ kind: "page", route, label: node.label });
      }
    }
    return out;
  };
  return { nav: project(tree, []), order };
}
