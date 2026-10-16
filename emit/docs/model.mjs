// The estate model as an emitted site sees it: the committed
// architecture/dist/model.json (the same export `docsnip validate` checks
// references against), reduced to what reader pages use.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  elementSummary,
  PUBLIC_TAG,
  publicProjection,
} from "../../site/src/content-core/projection.mjs";
import { loadRegistry } from "../../site/src/content-core/registry.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const MODEL_JSON = join(REPO_ROOT, "architecture", "dist", "model.json");

const text = (v) => (typeof v === "string" ? v : (v?.txt ?? "")).replace(/\s+/g, " ").trim();

/** `{ elements: Map<id, {title, summary, link, public}>, views: Map<id, {title, description}> }`.
 *  `summary` is the element's `summary`, else the first sentence of its description. */
export function readModel(data) {
  const elements = new Map();
  for (const [id, el] of Object.entries(data.elements ?? {})) {
    elements.set(id, {
      title: el.title ?? id,
      summary: elementSummary(el),
      link: el.links?.[0]?.url ?? null,
      public: Boolean(el.tags?.includes(PUBLIC_TAG)),
    });
  }
  const views = new Map();
  for (const [id, v] of Object.entries(data.views ?? {})) {
    views.set(id, { title: v.title ?? id, description: text(v.description) || null });
  }
  return { elements, views };
}

function readModelJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/** The committed model, or an empty one when it hasn't been exported. */
export function loadModel(path = MODEL_JSON) {
  return readModel(readModelJson(path));
}

/**
 * The site's public projection (content-core projection.mjs) over the committed
 * model, the environment registry, and the project's compatibility.json.
 * `pages` is `[{ identity, meta, body }]`; only ready ones count.
 */
export function loadProjection(site, pages, { repoRoot = REPO_ROOT, modelPath = MODEL_JSON } = {}) {
  const compatPath = join(repoRoot, "content", site.project, "compatibility.json");
  return publicProjection({
    model: readModelJson(modelPath),
    pages,
    hrefFor: site.hrefFor,
    origin: site.origin,
    registry: loadRegistry(repoRoot),
    compat: existsSync(compatPath) ? JSON.parse(readFileSync(compatPath, "utf8")) : null,
  });
}

/**
 * Where a `model:<id>` link goes on an emitted site: the published page that
 * `explains:` the element, else the element's own external link, else nowhere
 * (the link unwraps to its label). A page never links to itself, and an
 * element without `#public` always unwraps.
 * `explainers` maps element id -> route of a page this emit publishes.
 */
export function modelLinkResolver(model, explainers) {
  return (id, { route } = {}) => {
    const el = model.elements.get(id);
    if (!el?.public) return null;
    const page = explainers.get(id);
    if (page && page !== route) return { url: page, title: el?.summary ?? null };
    if (page) return null;
    if (el?.link) return { url: el.link, title: el.summary };
    return null;
  };
}

/** A diagram's alt text when the author wrote none: the view's title and description. */
export function viewAltText(model, viewId) {
  const view = model.views.get(viewId);
  if (!view) return null;
  return view.description ? `${view.title}: ${view.description}` : view.title;
}
