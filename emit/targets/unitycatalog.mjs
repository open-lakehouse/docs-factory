/**
 * targets/unitycatalog.mjs — the unitycatalog.io site target.
 *
 * Unlike a FLATTENING target (md-twin), this is a RICH, component target: the sibling
 * `uc-website` repo (open-lakehouse/uc-website: TanStack Start, content-collections,
 * and @mdx-js/rollup) renders a draft's rich constructs from an `.mdx` post:
 *   - `::::journey`  → `<Journey><JourneyStep>` (rich timeline).
 *   - `likec4` block → `<LikeC4View viewId=…>` (interactive canvas via the
 *                       framework-agnostic web-component bundle emit.mjs generates).
 *   - `:::tip`/…     → LEFT AS-IS. The UC site styles the raw `:::` directive with
 *                       its own remark handler, so the emitter must NOT rewrite
 *                       callouts (no `constructs.callouts`).
 *   - code captions  → LEFT ON THE FENCE. The UC site renders code fences with
 *                       Expressive Code, which turns a fence's `title="x.py"` meta
 *                       into a native editor-frame filename tab. So — unlike a
 *                       flattening target, which has no code chrome and lifts the
 *                       title to a bold caption line via remark-code-caption — this
 *                       target does NOT run codeCaption; the `title=` meta that
 *                       remark-code-snippets already put on the fence passes straight
 *                       through.
 *
 * The post is written to `dist/unitycatalog/index.mdx` (the content-collection
 * filename) with UC-shaped YAML frontmatter. The site imports `.astro` component
 * paths it doesn't have, so it strips the imports and passes its own components
 * by name. Delivery — copying the folder into the sibling repo and reconciling
 * `authors` against its `profiles` collection — is the `/blog-emit` skill with
 * `--target unitycatalog` (see its references/unitycatalog-target.md runbook).
 */

import remarkImagesMd from "../plugins/remark-images-md.mjs";
import remarkJourneyMdx from "../plugins/remark-journey-mdx.mjs";
import remarkLikeC4Mdx, { renderLikeC4Mdx } from "../plugins/remark-likec4-mdx.mjs";
import remarkMdxSafeText from "../plugins/remark-mdx-safe-text.mjs";
import remarkStringifyMdx from "../plugins/remark-stringify-mdx.mjs";
import remarkTrestleMdx, { renderTrestleMdx } from "../plugins/remark-trestle-mdx.mjs";

/** Slugify an author's display name to a `profiles` collection id
 *  (`Robert Pack` → `robert-pack`). The delivery skill verifies the id exists. */
export function authorSlug(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Reformat an ISO date (`2026-07-03`) to the UC human string (`July 3, 2026`).
 *  Parsed as UTC parts to avoid timezone drift; falls back to the raw value if it
 *  isn't a plain `YYYY-MM-DD`. Drafts no longer carry a frontmatter date; emit
 *  stamps today (the ship day) when none is present. */
function humanDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return iso == null ? undefined : String(iso);
  const [, y, mo, d] = m;
  return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`;
}

/** A post's URL id on the site: its folder name after the date, lowercased
 *  (uc-website src/lib/post-id.mjs). */
export function postId(postDir) {
  return String(postDir)
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .toLowerCase();
}

export function emitDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Map the draft frontmatter → the UC blog collection's zod schema
 * (uc-website content-collections.ts): { title, authors[], category:"guide",
 * date, description?, thumbnail?, canonical? }. Deterministic — no
 * network. Author-profile EXISTENCE is reconciled by the delivery skill, not here.
 */
function frontmatter(draft, { canonical, thumbnail, published } = {}) {
  const fm = {
    title: draft.title,
    // A single-author draft carries `author` as one string; support a list too.
    authors: (Array.isArray(draft.author) ? draft.author : [draft.author])
      .filter(Boolean)
      .map(authorSlug),
    category: "guide", // the only value the UC schema's enum accepts today
    // A new post goes out today; an update keeps its published date.
    date: humanDate(draft.date ?? published ?? emitDay()),
  };
  // `summary` → optional `description`; omit when absent (schema marks it optional).
  if (draft.summary) fm.description = String(draft.summary);
  // The card image, delivered beside the post (emit.mjs findThumbnail).
  if (thumbnail) fm.thumbnail = thumbnail;
  // A cross-post points search engines at the primary target's copy.
  if (canonical) fm.canonical = canonical;
  // Drop draft-only fields (slug/status/tags/series/target): the folder name sets
  // the post's id, and an unknown `category` would fail the build. `topics` are
  // the site's editorial call: it infers them, or keeps the ones it curated.
  return fm;
}

const unitycatalog = {
  name: "unitycatalog",
  siteUrl: "https://unitycatalog.io",
  // The site routes a post by its folder name after the date (src/routes/blogs/$id.tsx).
  postUrl(postDir) {
    return `${this.siteUrl}/blogs/${postId(postDir)}/`;
  },
  outputFile: "index.mdx", // the content-collection entry filename
  // Base stringify options; remark-mdx does the actual serialization (JSX-aware).
  stringify: {
    bullet: "-",
    fences: true,
    fence: "`",
    rule: "-",
    listItemIndent: "one",
  },
  stringifyExtension: remarkStringifyMdx, // SERIALIZE-only MDX (no parser hook)
  safeText: remarkMdxSafeText, // escape bare <, >, {, } in prose so MDX stays valid
  titleAsH1: false, // the post page renders post.data.title as the <h1>
  unwrapProse: false, // MDX keeps authored line breaks
  frontmatter, // emit UC-shaped YAML frontmatter
  // Where the journey/likec4 plugins import their components from. The site
  // strips these imports and passes Journey, LikeC4View, and TrestleView by name.
  componentImportBase: "@/components/blog",
  likec4WebComponent: true, // generate dist/unitycatalog/likec4-webcomponent.mjs
  // Trestle diagrams draw in the <trestle-view> web component; the bundle and each
  // diagram's snapshot land under dist/unitycatalog/public/trestle/ for the site's public/.
  trestleWebComponent: true,
  trestleAssetBase: "/trestle",
  constructs: {
    // callouts: OMITTED — pass `:::tip`/… through untouched; the UC site styles them.
    // codeCaption: OMITTED — keep `title="x.py"` on the fence; Expressive Code
    //   renders it as a native filename frame (see the module comment above).
    journey: remarkJourneyMdx, // ::::journey → <Journey><JourneyStep>
    likec4: remarkLikeC4Mdx, // imports LikeC4View.astro for the rendered views
    trestle: remarkTrestleMdx, // imports TrestleView.astro for the rendered diagrams
    images: remarkImagesMd, // local images → `./<filename>` + manifest
  },
  renderLikeC4: renderLikeC4Mdx, // likec4 block → <LikeC4View viewId=… alt=…>
  renderTrestle: renderTrestleMdx, // trestle block → <TrestleView src=… alt=…>
  // Co-located post assets: the site resolves `./file.png` relative to index.mdx.
  renderImage(entry) {
    return { type: "image", url: `./${entry.filename}`, alt: entry.altText, title: null };
  },
};

export default unitycatalog;
