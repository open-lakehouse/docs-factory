/**
 * Per-project curated navigation (`content/<project>/nav.yml`) → resolved tree.
 *
 * A manifest arranges links to canonical pages; it never owns a page. Each page
 * keeps exactly one Diátaxis home (its URL), may be linked from several sections,
 * and its FIRST occurrence in document order is its primary placement — the one
 * breadcrumbs and prev/next follow.
 *
 * Entries are one of:
 *   - { section: <label>, items: [...] }
 *   - { page: <bucket>/<slug>, id?: <backlog id>, label?: <override> }
 *   - { planned: <backlog id>, title: <working title>, request?: <uuid> }
 * `request:` links a planned slot to the review app's content request it was
 * promoted from. `page:` is the docIdentity bucket/slug (order prefix stripped, `slug:` override
 * applied), so renumbering a file never breaks the manifest.
 *
 * Pure and dependency-free (callers parse the YAML), so it is browser-safe and
 * shared by the sidebar and the prebuild check.
 */

/** Sections may nest at most this deep (top-level section = depth 1). */
export const MAX_NAV_DEPTH = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a parsed manifest against a project's docs.
 *
 * @param {unknown} manifest  parsed nav.yml (`{ nav: [...] }`)
 * @param {{bucket: string, slug: string, title: string}[]} docs  every doc of the project
 * @returns {{ tree: object[], errors: string[] }}
 */
export function resolveNav(manifest, docs) {
  const errors = [];
  const byKey = new Map(docs.map((d) => [`${d.bucket}/${d.slug}`, d]));
  const placed = new Set();
  const ids = new Set();

  const claimId = (id, where) => {
    if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };

  const resolveItems = (items, where, depth) => {
    if (!Array.isArray(items) || items.length === 0) {
      errors.push(`${where}: section has no items`);
      return [];
    }
    const out = [];
    items.forEach((entry, i) => {
      const node = resolveEntry(entry, `${where}[${i}]`, depth);
      if (node) out.push(node);
    });
    return out;
  };

  const resolveEntry = (entry, where, depth) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${where}: expected a mapping`);
      return null;
    }
    const kinds = ["section", "page", "planned"].filter((k) => k in entry);
    if (kinds.length !== 1) {
      errors.push(`${where}: needs exactly one of section/page/planned`);
      return null;
    }

    if (kinds[0] === "section") {
      if (depth >= MAX_NAV_DEPTH) {
        errors.push(`${where}: sections nest deeper than ${MAX_NAV_DEPTH}`);
        return null;
      }
      return {
        kind: "section",
        label: String(entry.section),
        children: resolveItems(entry.items, `${where}.items`, depth + 1),
      };
    }

    if (kinds[0] === "planned") {
      const id = String(entry.planned);
      claimId(id, where);
      if (typeof entry.title !== "string" || !entry.title) {
        errors.push(`${where}: planned "${id}" needs a title`);
      }
      if (entry.request != null && !UUID.test(String(entry.request))) {
        errors.push(`${where}: planned "${id}" request must be a content request id (uuid)`);
      }
      return {
        kind: "planned",
        id,
        title: entry.title ?? id,
        ...(entry.request != null ? { request: String(entry.request) } : {}),
      };
    }

    const key = String(entry.page);
    const doc = byKey.get(key);
    if (!doc) {
      errors.push(`${where}: unknown page "${key}"`);
      return null;
    }
    if (entry.id != null) claimId(String(entry.id), where);
    const primary = !placed.has(key);
    placed.add(key);
    return {
      kind: "page",
      bucket: doc.bucket,
      slug: doc.slug,
      label: typeof entry.label === "string" && entry.label ? entry.label : doc.title,
      ...(entry.id != null ? { id: String(entry.id) } : {}),
      primary,
    };
  };

  const top = manifest && typeof manifest === "object" ? manifest.nav : undefined;
  if (!Array.isArray(top)) {
    return { tree: [], errors: ["nav.yml: expected a top-level `nav:` list"] };
  }
  const tree = resolveItems(top, "nav", 0);

  // Reachability is the point of the manifest: a doc it doesn't list would be
  // invisible in the scoped site, so an orphan is an error, not a warning.
  for (const key of byKey.keys()) {
    if (!placed.has(key)) errors.push(`nav.yml: page "${key}" is not listed (orphan)`);
  }

  return { tree, errors };
}

/** Primary page placements in nav order, each with its section trail. */
export function primaryPlacements(tree) {
  const out = [];
  const visit = (nodes, trail) => {
    for (const node of nodes) {
      if (node.kind === "section") visit(node.children, [...trail, node.label]);
      else if (node.kind === "page" && node.primary) out.push({ node, trail });
    }
  };
  visit(tree, []);
  return out;
}
