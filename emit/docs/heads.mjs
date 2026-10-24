/**
 * A content page's `<head>` as a docs site emits it. The emitter writes it to the
 * site's heads.json, and the review app's Head tab shows the same object, so
 * both must build it here.
 */
import { isPublic } from "../../site/src/content-core/frontmatter.mjs";
import { pageHead } from "../../site/src/content-core/head.mjs";

const RUNS_STACK = new Set(["how-to", "tutorial"]);

/**
 * What the page's JSON-LD names, from the site's public projection: its
 * concepts, and for a how-to or tutorial that runs an environment, the
 * environment's public services and its bundle. Nothing for an unpublished page.
 */
function pageConcepts(projection, page, environment) {
  if (!projection || !isPublic(page.meta)) return null;
  const { about, mentions } = projection.pageConcepts(page);
  const diataxis = page.meta.diataxis ?? page.identity.bucket;
  const runs = environment && RUNS_STACK.has(diataxis);
  return {
    about: about.map(projection.element),
    mentions: mentions.map(projection.element),
    tool: runs ? projection.services(environment.key) : [],
    dependencies: runs ? `${environment.title}: ${environment.bundleUrl}` : null,
  };
}

/**
 * `page` is `{ identity, meta, body }`, with `body` the raw markdown.
 * `projection` is the site's public projection (emit/docs/model.mjs
 * loadProjection) and `environment` the page's (content-core pageEnvironment).
 * @param {{ origin: string, hrefFor: Function, title: string }} site
 * @param {{ identity: object, meta: Record<string, unknown>, body: string }} page
 * `canonical` overrides the page's own URL, for a copy cross-published from
 * another project's site.
 * @param {{ projection?: ReturnType<typeof import("../../site/src/content-core/projection.mjs").publicProjection> | null,
 *   environment?: { key: string, title: string, bundleUrl: string } | null,
 *   canonical?: string | null }} [context]
 */
export function docPageHead(
  site,
  { identity, meta, body },
  { projection = null, environment = null, canonical = null } = {},
) {
  return pageHead({
    identity,
    meta,
    body,
    origin: site.origin,
    hrefFor: site.hrefFor,
    siteName: site.title,
    canonical,
    concepts: pageConcepts(projection, { identity, meta, body }, environment),
  });
}
