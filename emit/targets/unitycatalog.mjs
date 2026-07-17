/**
 * targets/unitycatalog.mjs — the UnityCatalog.io / OpenLakehouse.io site target.
 *
 * Unlike gdocs (a FLATTENING target), this is a RICH, component target: the sibling
 * `unitycatalog-website` repo is Astro 6 + `@astrojs/mdx`, so a draft's rich
 * constructs are emitted as an `.mdx` post that renders interactively:
 *   - `::::journey`  → `<Journey><JourneyStep>` (rich timeline, Journey.astro).
 *   - `likec4=` image → `<LikeC4View viewId=…>` (interactive canvas via the
 *                       framework-agnostic web-component bundle emit.mjs generates).
 *   - `:::tip`/…     → LEFT AS-IS. The UC site styles the raw `:::` directive with
 *                       its own remark handler, so the emitter must NOT rewrite
 *                       callouts (no `constructs.callouts`).
 *   - code captions  → shared `remark-code-caption` (renders fine as HTML in MDX).
 *
 * The post is written to `dist/unitycatalog/index.mdx` (the content-collection
 * filename) with UC-shaped YAML frontmatter. Delivery — copying the folder into the
 * sibling repo and reconciling `authors` against its `profiles` collection — is the
 * `/blog-emit-uc` skill, mirroring how gdocs delivery is `/blog-emit`.
 */
import remarkJourneyMdx from "../plugins/remark-journey-mdx.mjs";
import remarkLikeC4Mdx from "../plugins/remark-likec4-mdx.mjs";
import remarkCodeCaption from "../plugins/remark-code-caption.mjs";
import remarkMdxSafeText from "../plugins/remark-mdx-safe-text.mjs";
import remarkStringifyMdx from "../plugins/remark-stringify-mdx.mjs";

/** Slugify an author's display name to a `profiles` collection id
 *  (`Robert Pack` → `robert-pack`). The delivery skill verifies the id exists. */
function authorSlug(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Reformat a draft ISO date (`2026-07-03`) to the UC human string
 *  (`July 3, 2026`). Parsed as UTC parts to avoid timezone drift; falls back to
 *  the raw value if it isn't a plain `YYYY-MM-DD`. */
function humanDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return iso == null ? undefined : String(iso);
  const [, y, mo, d] = m;
  return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`;
}

/**
 * Map the draft frontmatter → the UC blog collection's zod schema
 * (src/content.config.ts): { title, authors[], category:"guide", date,
 * description?, thumbnail? }. Deterministic — no network. Author-profile EXISTENCE
 * is reconciled by the delivery skill, not here.
 */
function frontmatter(draft) {
  const fm = {
    title: draft.title,
    // A single-author draft carries `author` as one string; support a list too.
    authors: (Array.isArray(draft.author) ? draft.author : [draft.author])
      .filter(Boolean)
      .map(authorSlug),
    category: "guide", // the only value the UC schema's enum accepts today
    date: humanDate(draft.date),
  };
  // `summary` → optional `description`; omit when absent (schema marks it optional).
  if (draft.summary) fm.description = String(draft.summary);
  // Drop draft-only fields (slug/status/tags/series/target) — not in the UC schema,
  // and emitting `slug`/an unknown `category` would break the Astro build.
  return fm;
}

const unitycatalog = {
  name: "unitycatalog",
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
  titleAsH1: false, // BlogPost.astro renders post.data.title as the <h1>
  unwrapProse: false, // MDX keeps authored line breaks
  frontmatter, // emit UC-shaped YAML frontmatter
  // Where the journey/likec4 plugins import their .astro components from. The UC
  // repo's tsconfig maps `@` → src/, so components live at src/components/blog/.
  componentImportBase: "@/components/blog",
  likec4WebComponent: true, // generate dist/unitycatalog/likec4-webcomponent.mjs
  constructs: {
    // callouts: OMITTED — pass `:::tip`/… through untouched; the UC site styles them.
    journey: remarkJourneyMdx, // ::::journey → <Journey><JourneyStep>
    codeCaption: remarkCodeCaption, // shared verbatim (renders as HTML in MDX)
    likec4: remarkLikeC4Mdx, // likec4= image → <LikeC4View> + manifest + fallback PNG
  },
  // Co-located post assets: Astro resolves `./file.png` relative to index.mdx.
  renderImage(entry) {
    return { type: "image", url: `./${entry.filename}`, alt: entry.altText, title: null };
  },
};

export default unitycatalog;
