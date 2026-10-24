/**
 * What the docs pipeline derives from each model element and view, for the
 * review app's Model section: the pages that explain, reference, link, or embed
 * it (every status, so a reviewer sees drafts too), the compatibility journeys
 * that exercise it, the environments that run it, and whether each docs site's
 * public projection publishes it. Alongside it, each site's concepts.json
 * exactly as `just emit-docs` writes it.
 *
 * Node-only (reads the repo), like the page-heads build in vite.config.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { conceptEnvironments, renderConcepts } from "../../emit/docs/discovery.mjs";
import { loadCompat, loadProjection, MODEL_JSON } from "../../emit/docs/model.mjs";
import { DOCS_SITES } from "../../emit/docs/sites/index.mjs";
import { splitFrontmatter } from "../src/content-core/frontmatter.mjs";
import { docIdentity } from "../src/content-core/identity.mjs";
import { modelLinkIds, PUBLIC_TAG } from "../src/content-core/projection.mjs";
import { loadRegistry } from "../src/content-core/registry.mjs";
import { walkBlogs, walkContent } from "../src/content-core/walk.mjs";

// A ```` ```likec4 <viewId> ```` block, the form remark-likec4-views renders.
const VIEW_EMBED_RE = /^[ \t]*(?:`{3,}|~{3,})likec4[ \t]+([\w.-]+)/gm;

/** Every docs page under content/ and every blog post. */
export function readPages(repoRoot) {
  return [...walkContent(join(repoRoot, "content")), ...walkBlogs(join(repoRoot, "blogs"))].map(
    (absPath) => {
      const { meta, body } = splitFrontmatter(readFileSync(absPath, "utf8"));
      return { absPath, meta, body, identity: docIdentity(absPath, meta) };
    },
  );
}

const pageLink = ({ identity, meta }) => ({
  area: identity.area,
  project: identity.project,
  bucket: identity.bucket,
  slug: identity.slug,
  title: typeof meta.title === "string" ? meta.title : identity.slug,
  status: typeof meta.status === "string" ? meta.status : "draft",
});

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/**
 * `{ elements: { [id]: ElementIndex }, views: { [id]: { embeddedBy } } }`; see
 * src/lib/model-index.ts for the shape.
 */
export function buildModelIndex({ repoRoot, pages = readPages(repoRoot), model = null }) {
  const raw = model ?? (existsSync(MODEL_JSON) ? JSON.parse(readFileSync(MODEL_JSON, "utf8")) : {});
  const registry = loadRegistry(repoRoot);

  const elements = {};
  for (const [id, el] of Object.entries(raw.elements ?? {})) {
    elements[id] = {
      public: Boolean(el.tags?.includes(PUBLIC_TAG)),
      explainedBy: [],
      referencedBy: [],
      linkedFrom: [],
      journeys: [],
      verifiedEdges: [],
      environments: [],
      published: {},
    };
  }
  const views = Object.fromEntries(
    Object.keys(raw.views ?? {}).map((id) => [id, { embeddedBy: [] }]),
  );

  for (const page of pages) {
    const link = pageLink(page);
    const { meta, body } = page;
    if (typeof meta.explains === "string") elements[meta.explains]?.explainedBy.push(link);
    for (const id of new Set(strings(meta.references))) elements[id]?.referencedBy.push(link);
    for (const id of new Set(modelLinkIds(body))) elements[id]?.linkedFrom.push(link);
    for (const id of new Set([...String(body).matchAll(VIEW_EMBED_RE)].map((m) => m[1])))
      views[id]?.embeddedBy.push(link);
  }

  for (const site of DOCS_SITES) {
    const compat = loadCompat(site, { repoRoot });
    const ifaceElement = new Map(
      (compat?.interfaces ?? []).map((i) => [i.key, typeof i.model === "string" ? i.model : null]),
    );
    for (const j of compat?.journeys ?? []) {
      const cells = Object.entries(j.cells ?? {});
      const tested = cells.filter(([, c]) => c.status === "tested").length;
      if (j.asset && elements[j.asset]) {
        elements[j.asset].journeys.push({
          project: site.project,
          id: j.id,
          title: j.title ?? j.id,
          role: "asset",
          interface: null,
          status: `${tested}/${cells.length} tested`,
        });
      }
      for (const [iface, cell] of cells) {
        const el = ifaceElement.get(iface);
        if (!el || !elements[el]) continue;
        elements[el].journeys.push({
          project: site.project,
          id: j.id,
          title: j.title ?? j.id,
          role: "interface",
          interface: iface,
          status: cell.status ?? "unknown",
        });
      }
    }
    for (const v of compat?.verifiedEdges ?? []) {
      const edge = {
        project: site.project,
        source: v.source,
        kind: v.kind,
        target: v.target,
        journeys: (v.journeys ?? []).length,
      };
      elements[v.source]?.verifiedEdges.push(edge);
      if (v.target !== v.source) elements[v.target]?.verifiedEdges.push(edge);
    }

    const projection = loadProjection(
      site,
      pages.filter((p) => p.identity.project === site.project),
      { repoRoot },
    );
    for (const id of Object.keys(elements)) {
      const published = projection.element(id);
      elements[id].published[site.name] = {
        inConcepts: Boolean(published),
        url: published?.url ?? null,
      };
    }
  }

  for (const [key, env] of Object.entries(registry)) {
    for (const s of env.services ?? []) {
      elements[s.element]?.environments.push({ key, title: env.title, role: s.role ?? null });
    }
  }

  return { elements, views };
}

/** `{ [siteName]: concepts.json }`, rendered by the same calls as emit-docs. */
export function buildConcepts({ repoRoot, pages = readPages(repoRoot) }) {
  const registry = loadRegistry(repoRoot);
  return Object.fromEntries(
    DOCS_SITES.map((site) => {
      const projection = loadProjection(
        site,
        pages.filter((p) => p.identity.project === site.project),
        { repoRoot },
      );
      const json = renderConcepts(projection, {
        title: site.title,
        origin: site.origin,
        environments: conceptEnvironments(site, registry),
      });
      return [site.name, JSON.parse(json)];
    }),
  );
}
