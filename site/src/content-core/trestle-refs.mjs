/**
 * What a Trestle diagram node stands for in the estate model. A node carries
 * its module's implementation (`model`) and a Trestle `role`; the role means a
 * capability or concern only through architecture/integrations/trestle.yaml,
 * which reaches here as trestle-context.json's `roles`. Trestle never sees the
 * model: hosts look a node up here and inject links through the diagram's
 * `slots`.
 *
 * Pure and browser-safe: the emitter builds a site's refs.json with it, and the
 * review app and the docs shell read nodes with it.
 */

export const TRESTLE_REFS_FORMAT = "docs-factory-trestle-refs";
export const TRESTLE_REFS_VERSION = 1;

/** Human label for a kind badge. */
export function kindLabel(kind) {
  switch (kind) {
    case "capability":
      return "Capability";
    case "concern":
      return "Concern";
    case "openSpecification":
      return "Specification";
    case "implementation":
      return "Implementation";
    case "asset":
      return "Asset kind";
    default:
      return kind;
  }
}

/**
 * `{ name, role }` for a graph node: the implementation id behind its name
 * line, and the `{ id, scope }` its role contributes to. Either is null when
 * the node has none (the clients node, an unmapped infrastructure role).
 * `roles` is trestle-context.json's (or refs.json's) role map.
 */
export function nodeConcepts(node, roles = {}) {
  const mapped = node?.role ? roles[node.role] : null;
  const target = mapped?.target ?? mapped?.concept ?? null;
  return {
    name: node?.model ?? null,
    role: target ? { id: target, scope: mapped.scope ?? "full" } : null,
  };
}

/**
 * The asset kinds a node's implementation manages, as concept ids in model
 * order. `concepts` is trestle-context.json's (or refs.json's) concept map.
 */
export function nodeAssets(node, concepts = {}) {
  return (node?.model && concepts[node.model]?.assets) || [];
}

/**
 * A site's refs.json: the role map plus a card for every concept a diagram
 * node can point at, limited to what the site publishes. `element(id)` returns
 * `{ title, kind, summary, public }` or null; `href(id)` where the site links
 * it (null for no link). A role whose concept isn't public is dropped, so its
 * label stays plain text; so is a non-public asset from an implementation's
 * `assets`, which is left out when none remain.
 */
export function buildTrestleRefs({ context, element, href }) {
  const concepts = {};
  for (const id of Object.keys(context?.concepts ?? {}).sort()) {
    const el = element(id);
    if (!el?.public) continue;
    concepts[id] = {
      title: el.title,
      kind: el.kind,
      kindLabel: kindLabel(el.kind),
      summary: el.summary ?? null,
      href: href(id) ?? null,
    };
  }
  for (const [id, card] of Object.entries(concepts)) {
    const assets = nodeAssets({ model: id }, context.concepts).filter((a) => concepts[a]);
    if (assets.length) card.assets = assets;
  }
  const roles = {};
  for (const [role, mapped] of Object.entries(context?.roles ?? {}).sort()) {
    if (mapped?.target && concepts[mapped.target]) {
      roles[role] = { concept: mapped.target, scope: mapped.scope ?? "full" };
    }
  }
  return { format: TRESTLE_REFS_FORMAT, version: TRESTLE_REFS_VERSION, roles, concepts };
}
