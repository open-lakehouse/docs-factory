/**
 * One site's public projection of the estate model: the only view of it that
 * concepts.json, JSON-LD, and the twins' environment service ids are built from.
 *
 * The selection is positive. An element is public only when the model tags it
 * `#public`; a page counts only when it is `ready`; an edge only when both its
 * ends are public; a proof only when its page is a ready page on this site.
 * A ready page referencing an internal element doesn't publish it. Every
 * record is rebuilt from an allow-list of fields, so whatever else the inputs
 * carry (metadata, script paths, styles) never reaches a reader.
 *
 * Pure: the caller reads model.json, the registry, and compatibility.json.
 */
import { isPublic } from "./frontmatter.mjs";

export const PUBLIC_TAG = "public";
const PARTIAL_TAG = "partial";
const MODEL_LINK_RE = /\]\(model:([\w.-]+)\)/g;
// What a page is about, as opposed to the software and specs it mentions.
const ABOUT_KINDS = new Set(["capability", "concern", "asset"]);

const text = (v) => (typeof v === "string" ? v : (v?.txt ?? "")).replace(/\s+/g, " ").trim();

function firstSentence(s) {
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : s;
}

/** An element's one-line summary: its `summary`, else its description's first sentence. */
export function elementSummary(el) {
  return text(el?.summary) || firstSentence(text(el?.description)) || null;
}

/** The element ids a page body links with `[label](model:<id>)`. */
export function modelLinkIds(body = "") {
  return [...String(body).matchAll(MODEL_LINK_RE)].map((m) => m[1]);
}

const unique = (xs) => [...new Set(xs)];
const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/**
 * @param {{
 *   model: { elements?: object, relations?: object },
 *   pages: { identity: object, meta: object, body?: string }[],
 *   hrefFor: (identity: object) => string | null,
 *   origin: string,
 *   registry?: Record<string, { services?: object[] }>,
 *   compat?: { journeys?: object[], interfaces?: object[], verifiedEdges?: object[] } | null,
 * }} input
 */
export function publicProjection({ model, pages, hrefFor, origin, registry = {}, compat = null }) {
  const raw = model?.elements ?? {};
  const isPublicId = (id) => Boolean(raw[id]?.tags?.includes(PUBLIC_TAG));

  const ready = pages
    .filter((p) => isPublic(p.meta))
    .map((p) => ({ ...p, route: hrefFor(p.identity) }))
    .filter((p) => p.route);
  // compatibility.json names a proof's page by project, bucket, and slug only.
  const routeOf = (identity) => {
    const route = identity && hrefFor({ area: "docs", ...identity });
    return route && ready.some((p) => p.route === route) ? route : null;
  };

  const explainers = new Map();
  for (const p of ready) {
    const id = p.meta.explains;
    if (typeof id === "string" && isPublicId(id) && !explainers.has(id))
      explainers.set(id, p.route);
  }

  const elements = new Map();
  for (const [id, el] of Object.entries(raw)) {
    if (!isPublicId(id)) continue;
    const link = el.links?.[0]?.url ?? null;
    const page = explainers.get(id) ?? null;
    const url = page ? `${origin}${page}` : link;
    elements.set(id, {
      id,
      kind: el.kind,
      title: el.title ?? id,
      summary: elementSummary(el),
      page,
      url,
      sameAs: link && link !== url ? [link] : [],
    });
  }

  const edges = Object.values(model?.relations ?? {})
    .map((r) => ({
      source: r.source?.model,
      kind: r.kind ?? null,
      title: text(r.title) || null,
      target: r.target?.model,
      partial: Boolean(r.tags?.includes(PARTIAL_TAG)),
    }))
    .filter((e) => elements.has(e.source) && elements.has(e.target))
    .sort((a, b) =>
      `${a.source} ${a.kind} ${a.target}`.localeCompare(`${b.source} ${b.kind} ${b.target}`),
    );

  // A journey × interface is proven here only by a working proof on a ready page of this site.
  const interfaceElement = new Map(
    (compat?.interfaces ?? []).map((i) => [i.key, typeof i.model === "string" ? i.model : null]),
  );
  const journeys = [];
  for (const j of compat?.journeys ?? []) {
    for (const [iface, cell] of Object.entries(j.cells ?? {})) {
      const proven = unique(
        (cell.proofs ?? [])
          .filter((proof) => proof.ready && proof.works)
          .map((proof) => {
            const route = routeOf(proof.page);
            if (!route) return null;
            return proof.anchor ? `${origin}${route}#${proof.anchor}` : `${origin}${route}`;
          })
          .filter(Boolean),
      ).sort();
      if (!proven.length) continue;
      const element = interfaceElement.get(iface);
      journeys.push({
        id: j.id,
        title: j.title ?? j.id,
        asset: isPublicId(j.asset) ? j.asset : null,
        interface: iface,
        element: isPublicId(element) ? element : null,
        pages: proven,
      });
    }
  }
  const proofOf = new Map(journeys.map((j) => [`${j.id} ${j.interface}`, j]));

  const verified = new Map();
  for (const v of compat?.verifiedEdges ?? []) {
    if (!elements.has(v.source) || !elements.has(v.target)) continue;
    const by = [];
    for (const journey of v.journeys ?? []) {
      for (const iface of v.interfaces ?? []) {
        const j = proofOf.get(`${journey} ${iface}`);
        if (j) by.push({ id: j.id, interface: j.interface, page: j.pages[0] });
      }
    }
    if (by.length) verified.set(`${v.source} ${v.kind} ${v.target}`, by);
  }

  const services = (key) =>
    (registry[key]?.services ?? [])
      .filter((s) => elements.has(s.element))
      .map((s) => ({ ...elements.get(s.element), role: s.role ?? null, endpoint: s.url ?? null }));

  /**
   * An environment's public services, linked for the site:
   * `{ id, title, href, summary, url }`, `href` the element's page under `base`
   * (none on that page itself), else its external link.
   */
  const serviceLinks = (key, { base = "", route = null } = {}) =>
    services(key).map((s) => ({
      id: s.id,
      title: s.title,
      href: s.page ? (s.page === route ? null : `${base}${s.page}`) : s.url,
      summary: s.summary,
      url: s.endpoint,
    }));

  /** `{ about, mentions }` element ids for one ready page; both empty for any other page. */
  const pageConcepts = ({ identity, meta, body = "" }) => {
    if (!isPublic(meta) || !routeOf(identity)) return { about: [], mentions: [] };
    const route = hrefFor(identity);
    const cited = unique([
      ...(typeof meta.explains === "string" ? [meta.explains] : []),
      ...ids(meta.references),
    ]).filter((id) => elements.has(id));
    const provenAssets = journeys
      .filter((j) => j.asset && j.pages.some((u) => u.split("#")[0] === `${origin}${route}`))
      .map((j) => j.asset);
    const about = unique([
      ...cited.filter((id) => ABOUT_KINDS.has(elements.get(id).kind)),
      ...provenAssets,
    ]);
    const mentions = unique([
      ...cited.filter((id) => !ABOUT_KINDS.has(elements.get(id).kind)),
      ...modelLinkIds(body),
    ]).filter((id) => elements.has(id) && !about.includes(id));
    return { about, mentions };
  };

  return {
    origin,
    /** Whether `route` is a ready page of this site. */
    hasPage: (route) => ready.some((p) => p.route === route),
    isPublic: (id) => elements.has(id),
    element: (id) => elements.get(id) ?? null,
    elements: () => [...elements.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: () =>
      edges.map((e) => {
        const by = verified.get(`${e.source} ${e.kind} ${e.target}`) ?? [];
        return { ...e, verified: by.length > 0, journeys: by };
      }),
    journeys: () => journeys,
    services,
    serviceLinks,
    pageConcepts,
  };
}
