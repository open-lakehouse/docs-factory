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
 *      `ready` + `draft` with --drafts; `private` and `idea` never ship);
 *   2. project content/<project>/nav.yml onto the selection, including the
 *      other projects' pages it cross-publishes (`page: <project>:<bucket>/<slug>`):
 *      each is served at /<project>/<bucket>/<slug>, and its canonical URL, twin,
 *      and llms.txt line point at its own project's site, which it stays out of
 *      the sitemap for;
 *   3. render every page twice through the shared emitter core (emitOne): the
 *      site page (docs-site target) and its `.md` twin (md-twin target);
 *   4. add images, the LikeC4 web component, runnable scripts, the env
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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  companionsFrontmatter,
  companionsSection,
  environmentFrontmatter,
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
import {
  COVERAGE_FORMAT,
  COVERAGE_VERSION,
  coverageReports,
} from "../../site/src/content-core/coverage.mjs";
import {
  declaredEnvironment,
  environmentGuide,
  pageEnvironment,
  registryEnvironment,
} from "../../site/src/content-core/environment.mjs";
import { isEmitted, splitFrontmatter } from "../../site/src/content-core/frontmatter.mjs";
import { canonicalUrl, pageHead } from "../../site/src/content-core/head.mjs";
import { docIdentity } from "../../site/src/content-core/identity.mjs";
import { resolveNav } from "../../site/src/content-core/nav.mjs";
import { entryFor, gitSha } from "../../site/src/content-core/pipeline.mjs";
import { extractHeadings } from "../../site/src/content-core/slug.mjs";
import { walkContent } from "../../site/src/content-core/walk.mjs";
import { collapseCoverageEmbeds } from "../../site/src/plugins/remark-engine-coverage.mjs";
import remarkPrerequisitesEnv from "../../site/src/plugins/remark-prerequisites-env.mjs";
import remarkSourceLinks from "../../site/src/plugins/remark-source-links.mjs";
import { defaultModelDir, emitOne, generateLikeC4WebComponent } from "../emit.mjs";
import remarkAbsoluteLinks from "../plugins/remark-absolute-links.mjs";
import remarkModelLinks from "../plugins/remark-model-links.mjs";
import remarkScriptLinks from "../plugins/remark-script-links.mjs";
import remarkStripSourceMeta from "../plugins/remark-strip-source-meta.mjs";
import remarkUnwrapDeadLinks from "../plugins/remark-unwrap-dead-links.mjs";
import { docsSiteTarget, trestleSnapshotUrl } from "../targets/docs-site.mjs";
import mdTwin, { TRESTLE_ASSET_BASE } from "../targets/md-twin.mjs";
import { apiEntries, apiIndexRoute } from "./api.mjs";
import {
  conceptEnvironments,
  renderConcepts,
  renderLlmsFull,
  renderLlmsIndex,
  renderRobots,
  renderSitemap,
  sitemapUrls,
  toEntry,
} from "./discovery.mjs";
import { buildEnvBundles, loadRegistry } from "./env-bundle.mjs";
import { docPageHead } from "./heads.mjs";
import { loadCompat, loadModel, loadProjection, modelLinkResolver, trestleRefs } from "./model.mjs";
import { projectNav } from "./nav.mjs";
import { redirectErrors } from "./redirects.mjs";
import { searchContext, searchRecords } from "./search.mjs";
import { renderedSections } from "./sections.mjs";
import { DOCS_SITES } from "./sites/index.mjs";
import { guestKey, withGuests } from "./sites/routes.mjs";
import {
  applySync,
  diffPages,
  diskHasher,
  MANIFEST_FILE,
  planSync,
  renderReport,
} from "./sync.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENVS_DIR = join(REPO_ROOT, "envs");
const PLUGIN_DIR = join(REPO_ROOT, "site", "src", "plugins");

// The site page's engine reports become directives the shell renders; the twin
// keeps docsnip's table.
const remarkCollapseCoverage = (project) => (tree) => collapseCoverageEmbeds(tree, project);

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
  "remark-trestle-views.mjs",
  "remark-engine-coverage.mjs",
  "lib/mdx-helpers.mjs",
];

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

/** Where the site serves a manifest image: under its page's `assetBase`. */
function imageUrl(entry, assetBase) {
  return `${assetBase}/${entry.filename}`;
}

function inventory(contentDir) {
  return walkContent(contentDir).map((absPath) => {
    const { meta, body } = splitFrontmatter(readFileSync(absPath, "utf8"));
    return { absPath, meta, body, identity: docIdentity(absPath, meta) };
  });
}

/** The other projects' pages, keyed `<project>/<bucket>/<slug>`. */
function otherProjects(project) {
  const root = join(REPO_ROOT, "content");
  const pages = new Map();
  for (const name of readdirSync(root)) {
    if (name === project || !existsSync(join(root, name, "nav.yml"))) continue;
    for (const p of inventory(join(root, name))) pages.set(guestKey(p.identity), p);
  }
  return pages;
}

/**
 * The URL a cross-published copy defers to: the page on its own project's
 * site. A project with no site of its own has no original, so the copy is its
 * own canonical.
 */
function homeCanonical(identity, homes) {
  const home = homes.find((s) => s.project === identity.project);
  return home ? canonicalUrl(identity, home.origin, home.hrefFor) : null;
}

export async function emitDocs({ site: config, drafts = false, homes = DOCS_SITES }) {
  const isIncluded = (meta) => isEmitted(meta, { drafts });
  const contentDir = join(REPO_ROOT, "content", config.project);
  const files = new Map();
  const tmp = mkdtempSync(join(tmpdir(), "emit-docs-"));
  const likec4OutDir = join(tmp, "likec4");

  try {
    // 1. Inventory: this project's pages, plus the ones its nav.yml cross-publishes.
    const own = inventory(contentDir);
    const others = otherProjects(config.project);
    const docOf = (p) => ({ ...p.identity, title: p.meta.title ?? p.identity.slug });

    // 2. Navigation. Validated against every page so an orphan still fails here.
    const navPath = join(contentDir, "nav.yml");
    const { tree, errors: navErrors } = resolveNav(
      parseYaml(readFileSync(navPath, "utf8")),
      own.map(docOf),
      [...others.values()].map(docOf),
    );
    if (navErrors.length)
      throw new Error(`${relative(REPO_ROOT, navPath)}:\n  ${navErrors.join("\n  ")}`);
    const guestKeys = new Set();
    const collectGuests = (nodes) => {
      for (const n of nodes) {
        if (n.kind === "section") collectGuests(n.children);
        else if (n.kind === "page" && n.project) guestKeys.add(guestKey(n));
      }
    };
    collectGuests(tree);
    const site = { ...config, hrefFor: withGuests(config.hrefFor, guestKeys) };
    const { hrefFor, origin } = site;
    const all = [...own, ...[...guestKeys].map((key) => others.get(key))];
    const selected = all.filter((p) => isIncluded(p.meta));
    // Public payloads read the ready-only projection, even in a --drafts preview.
    const projection = loadProjection(site, all);
    const routes = new Set(selected.map((p) => hrefFor(p.identity)));
    // A cross-published copy names its original; a page of this project, itself.
    const canonicalOf = (identity) =>
      (identity.project !== site.project && homeCanonical(identity, homes)) ||
      canonicalUrl(identity, origin, hrefFor);
    const isGuest = (identity) => identity.project !== site.project;

    const routeFor = (bucket, slug, project = site.project) =>
      hrefFor({ area: "docs", project, bucket, slug });
    const { nav, order } = projectNav(tree, {
      isSelected: (bucket, slug, project) => routes.has(routeFor(bucket, slug, project)),
      routeFor,
    });
    // The shell's topbar links these, not the sidebar.
    const apis = apiEntries(site);
    const apiIndex = apis.length ? apiIndexRoute(site) : null;
    const byRoute = new Map(selected.map((p) => [hrefFor(p.identity), p]));
    const guidePage = (bucket, slug) => {
      const page = byRoute.get(routeFor(bucket, slug));
      return page ? { href: routeFor(bucket, slug), title: page.meta.title ?? slug } : null;
    };
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
        for (const h of s.helpers) {
          files.set(
            `public${h.fetchUrl}`,
            publishScript(readFileSync(join(REPO_ROOT, h.gitPath), "utf8")),
          );
        }
        return { ...s, summary: scriptSummary(source, s.kind) };
      });
    files.set("public/scripts.json", `${JSON.stringify({ version: 2, scripts }, null, 2)}\n`);
    const scriptUrls = new Map(scripts.map((s) => [s.gitPath, s.fetchUrl]));

    // Engine reports link only what this emit publishes; a draft claim counts
    // only in a --drafts preview.
    const matrixPath = join(contentDir, "compatibility.json");
    const coverage = existsSync(matrixPath)
      ? coverageReports(JSON.parse(readFileSync(matrixPath, "utf8")), {
          href: (page, anchor) => {
            const route = routeFor(page.bucket, page.slug);
            if (page.project !== site.project || !routes.has(route)) return null;
            return anchor ? `${route}#${anchor}` : route;
          },
          scriptUrl: (gitPath) => scriptUrls.get(gitPath) ?? null,
          drafts,
          pageTitle: (page) => byRoute.get(routeFor(page.bucket, page.slug))?.meta.title ?? null,
        })
      : [];
    files.set(
      "src/generated/coverage.json",
      `${JSON.stringify({ format: COVERAGE_FORMAT, version: COVERAGE_VERSION, engines: coverage }, null, 2)}\n`,
    );

    // The env archives. Their guide link only resolves when this emit publishes the page.
    const registry = loadRegistry(REPO_ROOT);
    let envBundle = null;
    if (site.env) {
      const guideRoute = routeFor(site.env.guide.bucket, site.env.guide.slug);
      envBundle = buildEnvBundles({
        repoRoot: REPO_ROOT,
        bundle: site.env.bundle,
        dirs: site.env.dirs,
        registry,
        origin,
        guideUrl: routes.has(guideRoute) ? `${origin}${guideRoute}` : null,
      });
      envBundle.guide = routes.has(guideRoute)
        ? { route: guideRoute, title: byRoute.get(guideRoute).meta.title }
        : null;
      // A registry guide may be unpublished in this emit, but it must exist.
      const allRoutes = new Set(all.map((p) => hrefFor(p.identity)));
      for (const [key, env] of Object.entries(registry)) {
        if (!site.env.dirs.includes(key.split("/")[0])) continue;
        const [bucket, slug] = (env.guide ?? "").split("#")[0].split("/");
        if (env.guide && !allRoutes.has(routeFor(bucket, slug)))
          throw new Error(`envs/environments.yml: ${key}: guide ${env.guide} is not a page`);
      }
      for (const [dir, archive] of envBundle.archives)
        files.set(`public/env/${dir}.tar.gz`, archive);
      const index = { ...envBundle.index, concepts: `${origin}/concepts.json` };
      files.set("public/env/environments.json", `${JSON.stringify(index, null, 2)}\n`);
    }

    // 3. Pages.
    const links = linkErrors();
    const model = loadModel();
    const compat = loadCompat(site);
    const explainers = new Map(
      selected
        .filter((p) => typeof p.meta.explains === "string")
        .map((p) => [p.meta.explains, hrefFor(p.identity)]),
    );
    const resolveModelLink = modelLinkResolver(model, explainers);
    // A link to another project's page stays on this site when the page is
    // cross-published here, and otherwise goes to the page on its own site.
    const elsewhere = new Set(
      [...others.values()]
        .filter((p) => isIncluded(p.meta) && !routes.has(hrefFor(p.identity)))
        .map((p) => homeCanonical(p.identity, homes))
        .filter(Boolean),
    );
    const linkHref = (identity) => {
      const href = hrefFor(identity);
      if (href || identity?.area !== "docs" || identity.project === site.project) return href;
      return homeCanonical(identity, homes);
    };
    const linkPlugins = (route) => [
      [
        remarkSourceLinks,
        {
          hrefFor: linkHref,
          knownHrefs: new Set([...routes, ...elsewhere]),
          onUnresolved: links.onUnresolved,
        },
      ],
      [remarkUnwrapDeadLinks],
      [remarkModelLinks, { resolve: (id) => resolveModelLink(id, { route }) }],
    ];
    const pages = [];
    const environments = new Map();
    const search = [];
    const manifestPages = {};
    let hasLikeC4 = false;
    let hasTrestle = false;
    let likec4Exported = false;
    for (const page of ordered) {
      const { absPath, identity, route } = page;
      const assetBase = `/assets${route}`;
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
            archiveBase: envBundle.archiveBase,
            declared: declaredEnvironment(page.body),
          });
      } catch (err) {
        throw new Error(`${relative(REPO_ROOT, absPath)}: ${err.message}`);
      }
      if (environment) environments.set(route, environment);
      const guide =
        environment &&
        environmentGuide(environment, {
          siteGuide: site.env.guide,
          resolve: guidePage,
          self: route,
        });
      const guideAt = (base) => guide && { href: `${base}${guide.href}`, title: guide.title };
      const servicesAt = (base) =>
        environment ? projection.serviceLinks(environment.key, { base, route }) : [];
      const diataxis = page.meta.diataxis ?? identity.bucket;
      const resolve =
        envBundle &&
        ((key) => {
          try {
            return registryEnvironment(key, {
              registry,
              bundle: site.env.bundle,
              archiveBase: envBundle.archiveBase,
            });
          } catch (err) {
            throw new Error(`${relative(REPO_ROOT, absPath)}: ${err.message}`);
          }
        });

      const rendered = await emitOne({
        ...common,
        target: docsSiteTarget({ assetBase }),
        prePlugins: [[remarkCollapseCoverage, site.project]],
        plugins: [
          ...linkPlugins(route),
          [remarkScriptLinks, { scripts: scriptUrls }],
          [remarkStripSourceMeta],
          [
            remarkPrerequisitesEnv,
            { environment, guide: guideAt(""), diataxis, resolve, envsDir: ENVS_DIR },
          ],
        ],
      });
      likec4Exported ||= rendered.likec4Dir !== null;
      common.likec4Exported = likec4Exported;
      const file = `${route.slice(1)}.md`;
      files.set(`src/content/${file}`, rendered.output);

      for (const image of rendered.manifest) {
        if (!image.localPath) continue;
        const url = imageUrl(image, assetBase);
        files.set(`public${url}`, readFileSync(image.localPath));
      }
      hasLikeC4 ||= rendered.likec4.length > 0;
      // remark-trestle-views fetches each diagram's snapshot from where the
      // docs-site target pointed its marker.
      for (const diagram of rendered.trestle) {
        const url = trestleSnapshotUrl(diagram, assetBase);
        const snapshot = readFileSync(diagram.snapshot);
        files.set(`public${url}`, snapshot);
        // A node's files open from beside the snapshot. Only the manifest ships,
        // and docsnip leaves sensitive files out of it.
        if (diagram.env) {
          for (const path of JSON.parse(snapshot.toString("utf8")).files ?? []) {
            files.set(
              `public${dirname(url)}/${path}`,
              readFileSync(join(dirname(diagram.snapshot), path)),
            );
          }
        }
        hasTrestle = true;
      }

      // Twin URLs are absolute: the twin is read away from the site.
      const twinTarget = {
        ...mdTwin,
        renderImage: (entry) => ({
          type: "paragraph",
          children: [
            {
              type: "image",
              url: `${origin}${imageUrl(entry, assetBase)}`,
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
          ...linkPlugins(route),
          [remarkAbsoluteLinks, { origin }],
          [
            remarkPrerequisitesEnv,
            {
              environment,
              guide: guideAt(origin),
              diataxis,
              resolve,
              envsDir: ENVS_DIR,
            },
          ],
        ],
      });
      let twinOut = injectCanonical(twin.output, canonicalOf(identity));
      if (owned.length) {
        const fm = [
          companionsFrontmatter(owned, origin),
          environmentFrontmatter(
            environment,
            `${origin}/env/environments.json`,
            servicesAt(origin).map((x) => x.id),
          ),
        ].filter(Boolean);
        twinOut = prependSection(
          injectFrontmatter(twinOut, fm.join("\n")),
          companionsSection(owned, origin, environment),
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
      search.push(
        ...searchRecords(
          { route, title, section: page.section },
          renderedBody,
          searchContext(page, { model, compat }),
        ),
      );
      pages.push({
        route,
        file,
        title,
        summary: typeof page.meta.summary === "string" ? page.meta.summary : null,
        diataxis,
        section: page.section,
        headings: pageHeadings,
        twin: `${route}.md`,
        environment: environment && {
          title: environment.title,
          bundle: environment.bundleUrl.slice(origin.length),
          commands: environment.commands,
        },
        scripts: [
          ...owned.map((s) => ({
            url: s.fetchUrl,
            file: s.fetchUrl.split("/").pop(),
            kind: s.kind,
            summary: s.summary,
          })),
          ...[...new Set(owned.flatMap((s) => s.helpers.map((h) => h.fetchUrl)))].map((url) => ({
            url,
            file: url.split("/").pop(),
            kind: "python",
            summary: "Imported by the scripts above; save it beside them.",
          })),
        ],
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

    // TrestleDiagram links each node's name and role through it.
    if (hasTrestle) {
      files.set(
        `public${TRESTLE_ASSET_BASE}/refs.json`,
        `${JSON.stringify(trestleRefs(model, resolveModelLink), null, 2)}\n`,
      );
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
      heads[p.route] = docPageHead(site, p, {
        projection,
        environment: environments.get(p.route) ?? null,
        canonical: isGuest(p.identity) ? canonicalOf(p.identity) : null,
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
    files.set("public/search-index.json", `${JSON.stringify({ version: 2, records: search })}\n`);
    files.set("src/generated/heads.json", `${JSON.stringify(heads, null, 2)}\n`);

    // A copy is listed where a reader of this site finds it, but credits its
    // original, so an agent that cites it cites the canonical URL.
    const entries = ordered
      .map((p) => toEntry(p.absPath, p.meta, p.body, origin, { hrefFor, isIncluded }))
      .filter(Boolean)
      .map((e) => {
        if (!isGuest(e.identity)) return e;
        const canonical = canonicalOf(e.identity);
        return { ...e, canonical, twin: `${canonical}.md` };
      });
    files.set(
      "public/llms.txt",
      renderLlmsIndex(entries, {
        title: `${site.title} documentation`,
        summary: `${site.tagline} Every page is available as Markdown at its route + \`.md\`.`,
        origin,
        apis,
        environments: envBundle && {
          index: `${origin}/env/environments.json`,
          guide: envBundle.guide && `${origin}${envBundle.guide.route}.md`,
        },
        concepts: true,
      }),
    );
    files.set(
      "public/concepts.json",
      renderConcepts(projection, {
        title: site.title,
        origin,
        environments: envBundle ? conceptEnvironments(site, registry) : [],
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
        sitemapUrls(
          ordered.filter((p) => !isGuest(p.identity) || !homeCanonical(p.identity, homes)),
          origin,
          {
            hrefFor,
            isIncluded,
            indexRoutes: ["/", ...apis.map((a) => a.route)],
          },
        ),
      ),
    );
    files.set("public/robots.txt", renderRobots(origin));

    const vercelPath = join(REPO_ROOT, "sites", config.name, "vercel.json");
    if (existsSync(vercelPath)) {
      const anchors = new Map([
        ["/", new Set()],
        ...pages.map((p) => [p.route, new Set(p.headings.map((h) => h.id))]),
        ...apis.map((a) => [a.route, new Set()]),
        ...(apiIndex ? [[apiIndex, new Set()]] : []),
      ]);
      const errors = redirectErrors(JSON.parse(readFileSync(vercelPath, "utf8")), {
        anchors,
        files,
      });
      if (errors.length) throw new Error(`redirects:\n  ${errors.join("\n  ")}`);
    }

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
