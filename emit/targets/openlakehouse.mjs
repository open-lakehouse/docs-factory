/**
 * targets/openlakehouse.mjs — the openlakehouse.io blog (sibling `openlakehouse-io`
 * repo: Vite + React 18 + `@mdx-js/rollup`, posts under
 * `src/content/posts/<category>/<slug>/index.mdx`).
 *
 * A RICH, component target, but unlike the Astro targets the site has no
 * remark-directive and provides its components to every post through
 * `MdxProvider`, so the emitter writes the site's own JSX and no component
 * imports:
 *   - `:::tip`/… and `:::tldr` → `<Callout type="info|tip|warn" title="…">`.
 *   - `::::journey`  → `<Steps><Step title="…">` (the site's numbered steps).
 *   - `likec4` block → `<LikeC4View viewId alt>`, `trestle` block →
 *                       `<TrestleView src alt>`: the site's wrappers around the
 *                       web components, whose bundles (and the snapshots) land
 *                       under dist/openlakehouse/public/ for the site's public/.
 *   - local images   → imported, and drawn with `<Figure src={…} alt>`.
 *   - code captions  → left on the fence (`title="x.py"`); rehype-pretty-code
 *                       renders them.
 * Any other directive fails the emit: the page would print it as text, and a post
 * that names a component the site lacks crashes the page.
 *
 * Delivery is the `/blog-emit` skill with `--target openlakehouse` (see its
 * references/openlakehouse-target.md runbook).
 */
import remarkCalloutsJsx from "../plugins/remark-callouts-jsx.mjs";
import remarkDirectiveGuard from "../plugins/remark-directive-guard.mjs";
import remarkImageImports from "../plugins/remark-image-imports.mjs";
import remarkImagesMd from "../plugins/remark-images-md.mjs";
import remarkJourneyMdx from "../plugins/remark-journey-mdx.mjs";
import { renderLikeC4Mdx } from "../plugins/remark-likec4-mdx.mjs";
import remarkMdxSafeText from "../plugins/remark-mdx-safe-text.mjs";
import remarkStringifyMdx from "../plugins/remark-stringify-mdx.mjs";
import { renderTrestleMdx } from "../plugins/remark-trestle-mdx.mjs";
import { authorSlug, emitDay } from "./unitycatalog.mjs";

/** The components a post may use: the site's `MdxProvider` map. */
export const SITE_COMPONENTS = [
  "Callout",
  "Steps",
  "Step",
  "Figure",
  "LikeC4View",
  "TrestleView",
  "YouTubeEmbed",
  "FlowDiagram",
  "PromptBlock",
  "Tabs",
  "Tab",
];

/** Draft callout name → the site's `<Callout type>`; the site has info, tip,
 * warn, and success. */
const CALLOUT_TYPES = {
  tldr: "info",
  note: "info",
  info: "info",
  tip: "tip",
  warning: "warn",
  caution: "warn",
  danger: "warn",
};

/** The site's blog URL is `/blog/<category>/<slug>`, its category the post's
 * folder. A post goes under its first tag that names one, else `lakehouse`. */
const TAG_CATEGORIES = {
  agents: "agentic",
  "delta-lake": "delta-lake",
  "delta-kernel": "delta-lake",
  iceberg: "iceberg",
  "unity-catalog": "unity-catalog",
  lakehouse: "lakehouse",
};
const DEFAULT_CATEGORY = "lakehouse";

export function category(tags) {
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (TAG_CATEGORIES[tag]) return TAG_CATEGORIES[tag];
  }
  return DEFAULT_CATEGORY;
}

/** The site credits a republished post to its first publisher by name. */
const PUBLISHERS = {
  "www.unitycatalog.io": "Unity Catalog",
  "unitycatalog.io": "Unity Catalog",
  "delta.io": "Delta Lake",
};

function publisher(url) {
  const host = new URL(url).host;
  return PUBLISHERS[host] ?? host;
}

/**
 * Map the draft frontmatter → the site's post frontmatter (src/content/content.ts):
 * { title, date, authors[], excerpt?, tags, include, kind, originalUrl?,
 * originalPublisher? }. A cross-post is the site's "republished" post: it
 * renders `originalUrl` as its canonical and stays out of the sitemap.
 */
function frontmatter(draft, { canonical } = {}) {
  const fm = {
    title: draft.title,
    date: String(draft.date ?? emitDay()),
    authors: (Array.isArray(draft.author) ? draft.author : [draft.author])
      .filter(Boolean)
      .map(authorSlug),
  };
  if (draft.summary) fm.excerpt = String(draft.summary);
  fm.tags = Array.isArray(draft.tags) ? draft.tags : [];
  fm.include = ["blog"];
  fm.kind = "post";
  if (canonical) {
    fm.originalUrl = canonical;
    fm.originalPublisher = publisher(canonical);
  }
  return fm;
}

const journey = (options) =>
  remarkJourneyMdx({
    ...options,
    elements: { journey: "Steps", step: "Step", stepTitle: "title" },
    imports: false,
  });

const callouts = () => remarkCalloutsJsx({ types: CALLOUT_TYPES, titles: { tldr: "TL;DR" } });

/** Images are recorded and made `./<file>` (remark-images-md), then imported. */
function images(options) {
  const record = remarkImagesMd(options);
  const imports = remarkImageImports();
  return (tree, file) => {
    record(tree, file);
    imports(tree);
  };
}

/** Last, before the stringify: no directive may be left, then MDX-safe prose. */
function finish() {
  const guard = remarkDirectiveGuard({ site: "openlakehouse.io" });
  const safe = remarkMdxSafeText();
  return (tree, file) => {
    guard(tree, file);
    return safe(tree, file);
  };
}

const openlakehouse = {
  name: "openlakehouse",
  siteUrl: "https://openlakehouse.io",
  // `post_dir` is `<category>/<slug>`, the post's folder under src/content/posts/.
  postUrl(postDir) {
    return `${this.siteUrl}/blog/${postDir}`;
  },
  category,
  outputFile: "index.mdx",
  stringify: {
    bullet: "-",
    fences: true,
    fence: "`",
    rule: "-",
    listItemIndent: "one",
  },
  stringifyExtension: remarkStringifyMdx,
  safeText: finish,
  titleAsH1: false, // PostLayout renders the title
  unwrapProse: false,
  frontmatter,
  likec4WebComponent: true,
  trestleWebComponent: true,
  trestleAssetBase: "/trestle",
  constructs: {
    callouts, // :::tldr too

    journey,
    images,
  },
  renderLikeC4: renderLikeC4Mdx,
  renderTrestle: renderTrestleMdx,
  renderImage(entry) {
    return {
      type: "paragraph",
      children: [{ type: "image", url: `./${entry.filename}`, alt: entry.altText, title: null }],
    };
  },
};

export default openlakehouse;
