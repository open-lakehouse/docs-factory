#!/usr/bin/env bun
/**
 * emit-docs — render one project's documentation into a static target site
 * (sites/<name>/), deterministically and in full, then sync only what changed.
 *
 *   bun docs/emit-docs.mjs --site unitycatalog-docs [--out <dir>] [--drafts]
 *                          [--dry-run] [--report <file.md|file.json>]
 *
 * One run:
 *   1. inventory content/<project>/ and select pages (`status: ready`, or
 *      `ready` + `draft` with --drafts);
 *   2. project content/<project>/nav.yml onto the selection;
 *   3. render every page twice through the shared emitter core (emitOne): the
 *      site page (docs-site target) and its `.md` twin (md-twin target);
 *   4. add images, LikeC4 PNGs + web component, runnable scripts, the env
 *      bundle (env-bundle.mjs), the vendored
 *      remark plugins, site.json / heads.json, llms.txt, llms-full.txt,
 *      sitemap.xml, robots.txt, and the palette's search-index.json, plus a
 *      route per REST API reference the site declares (api.mjs);
 *   5. diff against the target's previous .docs-emit.json, write only changed
 *      files, delete stale ones, and print a page-level change report.
 *
 * Everything is built in memory first, so a failure leaves the target untouched.
 * A cross-page link this emit can't resolve (a page it doesn't publish, another
 * project, a typo) fails a publish emit. With --drafts it only warns, since a
 * preview routinely links to unfinished pages; either way the link is unwrapped
 * to its label rather than shipped as a 404.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  companionsFrontmatter,
  companionsSection,
  injectCanonical,
  injectFrontmatter,
  prependSection,
} from "../../site/scripts/build-md-twins.mjs";
import {
  publishScript,
  runDocsnipScripts,
  scriptEntry,
  scriptSummary,
} from "../../site/scripts/build-script-index.mjs";
import { pageEnvironment } from "../../site/src/content-core/environment.mjs";
import { isPublic, splitFrontmatter } from "../../site/src/content-core/frontmatter.mjs";
import { canonicalUrl, pageHead } from "../../site/src/content-core/head.mjs";
import { docIdentity } from "../../site/src/content-core/identity.mjs";
import { resolveNav } from "../../site/src/content-core/nav.mjs";
import { entryFor, gitSha } from "../../site/src/content-core/pipeline.mjs";
import { extractHeadings } from "../../site/src/content-core/slug.mjs";
import { walkContent } from "../../site/src/content-core/walk.mjs";
import remarkSourceLinks from "../../site/src/plugins/remark-source-links.mjs";
import { defaultModelDir, emitOne, generateLikeC4WebComponent } from "../emit.mjs";
import remarkAbsoluteLinks from "../plugins/remark-absolute-links.mjs";
import remarkModelLinksText from "../plugins/remark-model-links-text.mjs";
import remarkPrerequisitesEnv from "../plugins/remark-prerequisites-env.mjs";
import remarkScriptLinks from "../plugins/remark-script-links.mjs";
import remarkStripSourceMeta from "../plugins/remark-strip-source-meta.mjs";
import remarkUnwrapDeadLinks from "../plugins/remark-unwrap-dead-links.mjs";
import { docsSiteTarget } from "../targets/docs-site.mjs";
import mdTwin, { LIKEC4_ASSET_BASE } from "../targets/md-twin.mjs";
import { apiEntries, apiIndexRoute } from "./api.mjs";
import {
  renderLlmsFull,
  renderLlmsIndex,
  renderRobots,
  renderSitemap,
  sitemapUrls,
  toEntry,
} from "./discovery.mjs";
import { buildEnvBundle, loadRegistry } from "./env-bundle.mjs";
import { projectNav } from "./nav.mjs";
import { searchRecords } from "./search.mjs";
import { renderedSections } from "./sections.mjs";
import {
  applySync,
  diffPages,
  diskHasher,
  MANIFEST_FILE,
  planSync,
  renderReport,
} from "./sync.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGIN_DIR = join(REPO_ROOT, "site", "src", "plugins");

// The preview plugins the target renders directives with. Copied verbatim so a
// page renders the same in both; the shell's vite.config.ts loads them by name.
const VENDORED_PLUGINS = [
  "remark-directive-prose-guard.mjs",
  "remark-prerequisites.mjs",
  "remark-tldr.mjs",
  "remark-callouts.mjs",
  "remark-tabs.mjs",
  "remark-journey.mjs",
  "remark-fence-meta.mjs",
  "remark-likec4-views.mjs",
  "lib/mdx-helpers.mjs",
];

const EMIT_STATUSES = new Set(["draft", "ready"]);

function parseArgs(argv) {
  const out = { drafts: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--site") out.site = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--drafts") out.drafts = true;
    else if (a === "--dry-run") out.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.site) {
    throw new Error(
      "usage: bun docs/emit-docs.mjs --site <name> [--out <dir>] [--drafts] [--dry-run] [--report <file>]",
    );
  }
  return out;
}

function sourceState() {
  let dirty = false;
  try {
    dirty =
      execFileSync("git", ["status", "--porcelain", "--", "content", "architecture/model"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim() !== "";
  } catch {
    // Not a git checkout: report it as clean rather than guessing.
  }
  return { commit: gitSha(REPO_ROOT), dirty };
}

/** Collects every cross-page link this emit can't resolve (once per page + url). */
function linkErrors() {
  const errors = new Set();
  return {
    errors,
    onUnresolved: ({ url, mdPath }) =>
      errors.add(`${relative(REPO_ROOT, mdPath)}: ${url} is not a page this emit publishes`),
  };
}

export async function emitDocs({ site, drafts = false }) {
  const isIncluded = drafts ? (meta) => EMIT_STATUSES.has(meta.status) : isPublic;
  const { hrefFor, origin } = site;
  const contentDir = join(REPO_ROOT, "content", site.project);
  const files = new Map();
  const tmp = mkdtempSync(join(tmpdir(), "emit-docs-"));
  const likec4OutDir = join(tmp, "likec4");

  try {
    // 1. Inventory.
    const all = walkContent(contentDir).map((absPath) => {
      const { meta, body } = splitFrontmatter(readFileSync(absPath, "utf8"));
      return { absPath, meta, body, identity: docIdentity(absPath, meta) };
    });
    const selected = all.filter((p) => isIncluded(p.meta));
    const routes = new Set(selected.map((p) => hrefFor(p.identity)));

    // 2. Navigation. Validated against every page so an orphan still fails here.
    const navPath = join(contentDir, "nav.yml");
    const { tree, errors: navErrors } = resolveNav(
      parseYaml(readFileSync(navPath, "utf8")),
      all.map((p) => ({ ...p.identity, title: p.meta.title ?? p.identity.slug })),
    );
    if (navErrors.length)
      throw new Error(`${relative(REPO_ROOT, navPath)}:\n  ${navErrors.join("\n  ")}`);
    const routeFor = (bucket, slug) =>
      hrefFor({ area: "docs", project: site.project, bucket, slug });
    const { nav, order } = projectNav(tree, {
      isSelected: (bucket, slug) => routes.has(routeFor(bucket, slug)),
      routeFor,
    });
    // The shell's topbar links these, not the sidebar.
    const apis = apiEntries(site);
    const apiIndex = apis.length ? apiIndexRoute(site) : null;
    const byRoute = new Map(selected.map((p) => [hrefFor(p.identity), p]));
    const ordered = order.map(({ route, section }) => ({ ...byRoute.get(route), route, section }));

    // Runnable scripts first: twins list the ones their page owns.
    const indexed = runDocsnipScripts(REPO_ROOT);
    if (!indexed) console.warn("emit-docs: uv not found, so no runnable scripts are published");
    const scripts = (indexed?.scripts ?? [])
      .map((e) => scriptEntry(e, { hrefFor }))
      .filter((s) => s.fetchUrl && routes.has(s.tutorialRoute))
      .map((s) => {
        const source = readFileSync(join(REPO_ROOT, s.gitPath), "utf8");
        files.set(`public${s.fetchUrl}`, publishScript(source));
        return { ...s, summary: scriptSummary(source, s.kind) };
      });
    files.set("public/scripts.json", `${JSON.stringify({ version: 2, scripts }, null, 2)}\n`);
    const scriptUrls = new Map(scripts.map((s) => [s.gitPath, s.fetchUrl]));

    // The env bundle. Its guide link only resolves when this emit publishes the page.
    const registry = loadRegistry(REPO_ROOT);
    let envBundle = null;
    if (site.env) {
      const guideRoute = routeFor(site.env.guide.bucket, site.env.guide.slug);
      envBundle = buildEnvBundle({
        repoRoot: REPO_ROOT,
        bundle: site.env.bundle,
        dirs: site.env.dirs,
        registry,
        origin,
        siteTitle: site.title,
        guideUrl: routes.has(guideRoute) ? `${origin}${guideRoute}` : null,
      });
      envBundle.guide = routes.has(guideRoute)
        ? { route: guideRoute, title: byRoute.get(guideRoute).meta.title }
        : null;
      files.set(`public/env/${site.env.bundle}.tar.gz`, envBundle.archive);
      files.set("public/env/environments.json", `${JSON.stringify(envBundle.index, null, 2)}\n`);
    }

    // 3. Pages.
    const links = linkErrors();
    const linkPlugins = [
      [remarkSourceLinks, { hrefFor, knownHrefs: routes, onUnresolved: links.onUnresolved }],
      [remarkUnwrapDeadLinks],
      [remarkModelLinksText],
    ];
    const pages = [];
    const search = [];
    const manifestPages = {};
    let hasLikeC4 = false;
    let likec4Exported = false;
    for (const page of ordered) {
      const { absPath, identity, route } = page;
      const assetBase = `/assets/${identity.bucket}/${identity.slug}`;
      // The model export covers every view, so the first page that needs it pays once.
      const common = {
        inputPath: absPath,
        likec4OutDir,
        assetsDir: dirname(absPath),
        likec4Exported,
      };

      const owned = scripts.filter((s) => s.tutorialRoute === route);
      let environment = null;
      try {
        environment =
          envBundle &&
          pageEnvironment(owned, {
            registry,
            bundle: site.env.bundle,
            bundleUrl: envBundle.bundleUrl,
            origin,
          });
      } catch (err) {
        throw new Error(`${relative(REPO_ROOT, absPath)}: ${err.message}`);
      }
      const guide = envBundle?.guide?.route === route ? null : envBundle?.guide;
      const guideAt = (base) => guide && { href: `${base}${guide.route}`, title: guide.title };

      const rendered = await emitOne({
        ...common,
        target: docsSiteTarget({ assetBase }),
        plugins: [
          ...linkPlugins,
          [remarkScriptLinks, { scripts: scriptUrls }],
          [remarkStripSourceMeta],
          [remarkPrerequisitesEnv, { environment, guide: guideAt("") }],
        ],
      });
      likec4Exported ||= rendered.likec4Dir !== null;
      common.likec4Exported = likec4Exported;
      const file = `${identity.bucket}/${identity.slug}.md`;
      files.set(`src/content/${file}`, rendered.output);

      for (const image of rendered.manifest) {
        if (!image.localPath) continue;
        const url = image.likec4
          ? `/assets/likec4/${image.likec4}.png`
          : `${assetBase}/${image.filename}`;
        files.set(`public${url}`, readFileSync(image.localPath));
        hasLikeC4 ||= Boolean(image.likec4);
      }

      // Twin URLs are absolute: the twin is read away from the site.
      const twinTarget = {
        ...mdTwin,
        renderImage: (entry) => ({
          type: "paragraph",
          children: [
            {
              type: "image",
              url: entry.likec4
                ? `${origin}${LIKEC4_ASSET_BASE}/${entry.likec4}.png`
                : `${origin}${assetBase}/${entry.filename}`,
              alt: entry.altText,
              title: null,
            },
          ],
        }),
      };
      const twin = await emitOne({
        ...common,
        target: twinTarget,
        plugins: [
          ...linkPlugins,
          [remarkAbsoluteLinks, { origin }],
          [remarkPrerequisitesEnv, { environment, guide: guideAt(origin) }],
        ],
      });
      let twinOut = injectCanonical(twin.output, canonicalUrl(identity, origin, hrefFor));
      if (owned.length) {
        twinOut = prependSection(
          injectFrontmatter(twinOut, companionsFrontmatter(owned, origin)),
          companionsSection(owned, origin),
        );
      }
      files.set(`public${route}.md`, twinOut);

      const renderedBody = splitFrontmatter(rendered.output).body;
      const pageHeadings = extractHeadings(renderedBody).map(({ id, text, level }) => ({
        id,
        text,
        level,
      }));
      const title = page.meta.title ?? identity.slug;
      search.push(...searchRecords({ route, title, section: page.section }, renderedBody));
      pages.push({
        route,
        file,
        title,
        summary: typeof page.meta.summary === "string" ? page.meta.summary : null,
        diataxis: page.meta.diataxis ?? identity.bucket,
        section: page.section,
        headings: pageHeadings,
        twin: `${route}.md`,
        scripts: owned.map((s) => ({
          url: s.fetchUrl,
          file: s.fetchUrl.split("/").pop(),
          kind: s.kind,
          summary: s.summary,
        })),
      });

      const version = entryFor(absPath, REPO_ROOT);
      manifestPages[`${identity.project}/${identity.bucket}/${identity.slug}`] = {
        src: relative(REPO_ROOT, absPath),
        route,
        title,
        contentHash: version.contentHash,
        rootHash: version.rootHash,
        sections: renderedSections(renderedBody),
        outputs: [`src/content/${file}`, `public${route}.md`],
      };
    }
    if (links.errors.size) {
      const list = [...links.errors].join("\n  ");
      if (!drafts) throw new Error(`unresolved links:\n  ${list}`);
      console.warn(`emit-docs: unresolved links (unwrapped to text):\n  ${list}`);
    }

    pages.forEach((p, i) => {
      const link = (q) => (q ? { route: q.route, title: q.title } : null);
      p.prev = link(pages[i - 1]);
      p.next = link(pages[i + 1]);
    });

    if (hasLikeC4) {
      const bundle = join(tmp, "likec4-webcomponent.mjs");
      generateLikeC4WebComponent(defaultModelDir(), bundle, true);
      files.set("public/likec4/likec4-webcomponent.mjs", readFileSync(bundle));
    }

    for (const name of VENDORED_PLUGINS) {
      files.set(`src/vendor/plugins/${name}`, readFileSync(join(PLUGIN_DIR, name)));
    }

    // 4. Site data + GEO surfaces.
    files.set(
      "src/generated/site.json",
      `${JSON.stringify({ title: site.title, tagline: site.tagline, nav, pages, apis, apiIndex }, null, 2)}\n`,
    );
    const heads = {
      "/": {
        ...pageHead({
          identity: { area: "site" },
          meta: { summary: site.tagline },
          origin,
          hrefFor,
          siteName: site.title,
          type: "website",
        }),
        twin: null,
      },
    };
    for (const p of ordered) {
      heads[p.route] = pageHead({
        identity: p.identity,
        meta: p.meta,
        body: p.body,
        origin,
        hrefFor,
        siteName: site.title,
      });
    }
    for (const a of apis) {
      heads[a.route] = {
        ...pageHead({
          identity: { area: "api", slug: a.slug },
          meta: { title: a.title, summary: a.summary },
          origin,
          hrefFor,
          siteName: site.title,
        }),
        twin: null,
        alternates: [{ type: "application/yaml", href: a.specUrl, title: "OpenAPI" }],
      };
      search.push({
        id: a.route,
        route: a.route,
        anchor: null,
        page: a.title,
        heading: null,
        section: ["API reference"],
        text: `${a.summary} OpenAPI REST endpoints.`,
      });
    }
    // The section route shows the default API, so it shares that API's head
    // (canonical included) and stays out of the sitemap.
    const defaultApi = apis.find((a) => a.default);
    if (apiIndex && defaultApi) heads[apiIndex] = heads[defaultApi.route];
    // public/, not src/generated/: the palette fetches it on first open instead
    // of every page bundling it.
    files.set("public/search-index.json", `${JSON.stringify({ version: 1, records: search })}\n`);
    files.set("src/generated/heads.json", `${JSON.stringify(heads, null, 2)}\n`);

    const entries = ordered
      .map((p) => toEntry(p.absPath, p.meta, p.body, origin, { hrefFor, isIncluded }))
      .filter(Boolean);
    files.set(
      "public/llms.txt",
      renderLlmsIndex(entries, {
        title: `${site.title} documentation`,
        summary: `${site.tagline} Every page is available as Markdown at its route + \`.md\`.`,
        origin,
        apis,
      }),
    );
    files.set(
      "public/llms-full.txt",
      renderLlmsFull(entries, (href) => {
        const twin = files.get(`public${href}.md`);
        return twin ? splitFrontmatter(String(twin)).body.trim() : "";
      }),
    );
    files.set(
      "public/sitemap.xml",
      renderSitemap(
        sitemapUrls(ordered, origin, {
          hrefFor,
          isIncluded,
          indexRoutes: ["/", ...apis.map((a) => a.route)],
        }),
      ),
    );
    files.set("public/robots.txt", renderRobots(origin));

    return { files, manifestPages };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function readManifest(outDir) {
  const path = join(outDir, MANIFEST_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const site = (await import(`./sites/${args.site}.mjs`)).default;
  const outDir = resolve(args.out ?? join(REPO_ROOT, "sites", site.name));
  if (!existsSync(join(outDir, "package.json"))) {
    throw new Error(`${outDir} has no package.json; point --out at a site shell`);
  }

  const { files, manifestPages } = await emitDocs({ site, drafts: args.drafts });
  const previous = readManifest(outDir);
  const plan = planSync(files, previous, diskHasher(outDir));
  const source = sourceState();
  const manifest = {
    schema: 1,
    site: site.name,
    source,
    drafts: args.drafts,
    pages: manifestPages,
    files: plan.hashes,
  };
  const diff = diffPages(previous, manifest);
  const report = renderReport({ site: site.name, source, diff, plan });
  console.log(report);

  if (args.report) {
    const body = args.report.endsWith(".json")
      ? `${JSON.stringify({ source, diff, write: plan.write, remove: plan.remove }, null, 2)}\n`
      : report;
    writeFileSync(args.report, body);
  }
  if (args.dryRun) return;

  applySync(outDir, files, plan);
  const manifestPath = join(outDir, MANIFEST_FILE);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!existsSync(manifestPath) || readFileSync(manifestPath, "utf8") !== manifestText) {
    writeFileSync(manifestPath, manifestText);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`emit-docs: ${err.message}`);
    process.exitCode = 1;
  });
}
