// The discovery files an emitted docs site serves: sitemap.xml + robots.txt, and
// the llms.txt / llms-full.txt agent index (llmstxt.org convention: H1 +
// blockquote summary + H2 Diátaxis sections + a Blog section; each entry links
// the canonical HTML route AND its `.md` twin).
//
// The sitemap lists canonical HTML routes only — never the `.md` twins (they're
// noindex; the HTML is the indexed canonical). Pure over page records, except
// lastmod(), which asks git.
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { archiveUrl, composeParts } from "../../site/src/content-core/environment.mjs";
import { isPublic } from "../../site/src/content-core/frontmatter.mjs";
import {
  canonicalUrl,
  metaDescription,
  siteOrigin,
  twinUrl,
} from "../../site/src/content-core/head.mjs";
import { docIdentity, hrefFromIdentity } from "../../site/src/content-core/identity.mjs";
import { DIATAXIS } from "../../site/src/content-core/vocab.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const SECTION_TITLE = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanation",
};

/** A page's <lastmod>: git commit date (preferred), else mtime. A legacy
 *  frontmatter `date` is still honored when present. Returns an ISO date string. */
export function lastmod(absPath, meta) {
  if (typeof meta.date === "string" && ISO_DATE.test(meta.date)) return meta.date.slice(0, 10);
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", absPath], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    if (out) return out.slice(0, 10);
  } catch {
    /* fall through to mtime */
  }
  try {
    return statSync(absPath).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Build the sitemap URL list (pure, for testing). Each entry is `{ loc, lastmod }`
 * for a canonical HTML route. `pages` is `[{ absPath, meta }]`; the index routes
 * are prepended. Non-public pages and pages with no route are dropped. A site
 * passes its own `hrefFor` / `indexRoutes` / `isIncluded` (e.g. to keep drafts in
 * a local preview).
 */
export function sitemapUrls(
  pages,
  origin = siteOrigin(),
  { hrefFor = hrefFromIdentity, indexRoutes = ["/"], isIncluded = isPublic } = {},
) {
  const urls = indexRoutes.map((href) => ({
    loc: href === "/" ? origin : `${origin}${href}`,
    lastmod: null,
  }));
  for (const { absPath, meta } of pages) {
    if (!isIncluded(meta)) continue;
    const loc = canonicalUrl(docIdentity(absPath, meta), origin, hrefFor);
    if (!loc) continue;
    urls.push({ loc, lastmod: lastmod(absPath, meta) });
  }
  return urls;
}

export function renderSitemap(urls) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const { loc, lastmod: lm } of urls) {
    lines.push(
      lm
        ? `  <url><loc>${loc}</loc><lastmod>${lm}</lastmod></url>`
        : `  <url><loc>${loc}</loc></url>`,
    );
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

export function renderRobots(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${origin}/sitemap.xml`,
    "# Machine-readable corpus: /llms.txt, /llms-full.txt, /concepts.json, and per-page .md twins",
    "# (the .md twins are noindex; this HTML is the canonical).",
    "",
  ].join("\n");
}

/**
 * A page record with its resolved identity/routes, or null if not public/routable.
 * A site passes its own `hrefFor` / `isIncluded`.
 */
export function toEntry(
  absPath,
  meta,
  body,
  origin,
  { hrefFor = hrefFromIdentity, isIncluded = isPublic } = {},
) {
  if (!isIncluded(meta)) return null;
  const identity = docIdentity(absPath, meta);
  const href = hrefFor(identity);
  if (!href) return null;
  return {
    identity,
    href,
    canonical: canonicalUrl(identity, origin, hrefFor),
    twin: twinUrl(identity, origin, hrefFor),
    title: meta.title ?? href,
    description: meta.summary ?? metaDescription(meta, body),
    diataxis: meta.diataxis,
  };
}

/**
 * Render /llms.txt (pure, for testing). `entries` are toEntry() records. Docs group
 * by Diátaxis quadrant (from their identity/meta); blogs go under a Blog section.
 * Each line links the canonical route and its `.md` twin. `apis` (api.mjs
 * apiEntries) link their OpenAPI spec beside the twin. `environments`
 * (`{ index, guide }`) adds the env index the runnable scripts need,
 * `concepts` the site's concepts.json, and `home` the home page's twin.
 */
export function renderLlmsIndex(
  entries,
  { title, summary, origin = "", apis = [], environments = null, concepts = false, home = false },
) {
  const lines = [`# ${title}`, "", `> ${summary}`, ""];
  const bySection = Object.fromEntries(DIATAXIS.map((k) => [k, []]));
  const blog = [];

  for (const e of entries) {
    const line = `- [${e.title}](${e.canonical}) ([md](${e.twin})): ${e.description}`;
    if (e.identity.area === "blogs") blog.push(line);
    else if (e.diataxis && e.diataxis in bySection) bySection[e.diataxis].push(line);
  }

  for (const section of DIATAXIS) {
    if (bySection[section].length === 0) continue;
    lines.push(`## ${SECTION_TITLE[section]}`, "", ...bySection[section].sort(), "");
  }
  if (blog.length) lines.push("## Blog", "", ...blog.sort(), "");
  if (apis.length) {
    lines.push(
      "## API reference",
      "",
      ...apis.map(
        (a) =>
          `- [${a.title}](${origin}${a.route}) ([md](${origin}${a.route}.md), [OpenAPI](${a.specUrl})): ${a.summary}`,
      ),
      "",
    );
  }

  lines.push(
    "## Resources",
    "",
    ...(home ? [`- [Home](${origin}/index.md): a map of every page, with summaries.`] : []),
    `- [Full-text corpus](${origin}/llms-full.txt): every page's Markdown twin concatenated.`,
    `- [Runnable scripts index](${origin}/scripts.json): CI-verified PEP 723 tutorial scripts + their runtime contracts.`,
  );
  if (concepts) {
    lines.push(
      `- [Concepts](${origin}/concepts.json): the capabilities, specifications, and software these docs cover, how they relate, which edges a tested page proves, and what each local environment runs.`,
    );
  }
  if (environments) {
    const guide = environments.guide ? ` Setup guide: ${environments.guide}.` : "";
    lines.push(
      `- [Local environment](${environments.index}): the Docker Compose stacks the scripts run against, each with its own archive and exact start/stop commands; download one with \`curl -fsSL <archive> | tar -xz\`.${guide}`,
    );
  }
  lines.push("");

  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

/**
 * Render the home page's `.md` twin (/index.md, pure). The home page is curated
 * in the site's brand TSX, out of the emitter's reach, so the twin is the site
 * map an agent needs instead: the tagline, the commands that start the local
 * server (`start`: a page with an environment), and every nav page with its
 * summary. `nav` is the projected nav (site.json); `pages` its page records.
 */
export function renderHomeTwin({ title, tagline, origin, nav, pages, apis = [], start = null }) {
  const summaries = new Map(pages.map((p) => [p.route, p.summary]));
  const lines = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(tagline)}`,
    `canonical: ${origin}/`,
    "---",
    "",
    `# ${title}`,
    "",
    tagline,
  ];
  if (start?.environment?.commands.length) {
    lines.push(
      "",
      "## Run it locally",
      "",
      `These commands need only Docker. [${start.title}](${origin}${start.route}.md) walks through them.`,
      "",
      "```bash",
      ...start.environment.commands,
      "```",
    );
  }
  const walk = (items, depth) => {
    for (const item of items) {
      if (item.kind === "section") {
        lines.push("", `${"#".repeat(Math.min(depth, 4))} ${item.label}`, "");
        walk(item.items, depth + 1);
      } else {
        const summary = summaries.get(item.route);
        lines.push(`- [${item.label}](${origin}${item.route}.md)${summary ? `: ${summary}` : ""}`);
      }
    }
  };
  walk(nav, 2);
  if (apis.length) {
    lines.push("", "## API reference", "");
    for (const a of apis) lines.push(`- [${a.title}](${origin}${a.route}.md): ${a.summary}`);
  }
  // A section that opens with a subsection leaves two blank lines; keep one.
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

/**
 * Render /concepts.json (pure over a content-core public projection): the
 * site's public concepts with their typed edges, the docs environments and
 * the public services each runs, and the journeys a ready page proves. An
 * edge is `verified` when a working proof on this site exercises it.
 * `environments` is `[{ key, title, archive, guide }]` (archive its download
 * URL; guide a ready page's route, or null).
 */
export function renderConcepts(projection, { title, origin, environments = [] }) {
  const body = {
    version: 2,
    site: { title, origin },
    concepts: projection.elements().map(({ id, kind, title, summary, url, sameAs }) => ({
      id,
      kind,
      title,
      summary,
      url,
      sameAs,
    })),
    edges: projection.edges(),
    environments: environments.map((env) => ({
      key: env.key,
      title: env.title,
      archive: env.archive ?? null,
      guide:
        env.guide && projection.hasPage(env.guide.split("#")[0]) ? `${origin}${env.guide}` : null,
      services: projection
        .services(env.key)
        .map((s) => ({ element: s.id, role: s.role, url: s.endpoint })),
    })),
    journeys: projection.journeys(),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/**
 * The `environments` renderConcepts takes for `site`: each registry stack in
 * the site's env dirs, with its archive URL and its guide's route (the
 * registry's own guide, else the site's environment guide).
 */
export function conceptEnvironments(site, registry) {
  if (!site.env) return [];
  const routeFor = (bucket, slug) =>
    site.hrefFor({ area: "docs", project: site.project, bucket, slug });
  return Object.keys(registry)
    .filter((key) => site.env.dirs.includes(composeParts(key).dir))
    .map((key) => {
      const env = registry[key];
      const [path, anchor] = (env.guide ?? "").split("#");
      const [bucket, slug] = path.split("/");
      const guide = env.guide
        ? `${routeFor(bucket, slug)}${anchor ? `#${anchor}` : ""}`
        : routeFor(site.env.guide.bucket, site.env.guide.slug);
      return { key, title: env.title, archive: archiveUrl(key, `${site.origin}/env`), guide };
    });
}

/** Render /llms-full.txt (pure over entries + a body resolver, for testing). */
export function renderLlmsFull(entries, resolveBody) {
  const parts = [];
  for (const e of entries) {
    const body = resolveBody(e.href);
    if (!body) continue;
    parts.push(`# ${e.canonical}\n\n${body}`);
  }
  return `${parts.join("\n\n---\n\n")}\n`;
}
