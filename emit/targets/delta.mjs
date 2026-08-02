/**
 * targets/delta.mjs — the Delta.io website (`delta-io/website`, sibling `../website`)
 * target.
 *
 * Like unitycatalog (and unlike a FLATTENING target), this is a RICH, component target: the draft's
 * rich constructs are emitted as an `.mdx` post that renders interactively on the
 * Astro site.
 *   - `::::journey`   → `<Journey><JourneyStep>` (rich timeline, Journey.astro).
 *   - `likec4=` image → `<LikeC4View viewId=…>` (interactive canvas via the
 *                       framework-agnostic web-component bundle emit.mjs generates).
 *   - `:::tip`/…      → passed through as `:::` directives BUT REMAPPED onto the
 *                       delta site's supported vocabulary (`note/info/warning/danger`).
 *                       The delta site's `lib/remarkPlugins.ts` handler styles those;
 *                       our `tip`/`caution` are renamed to `note`/`danger` first (see
 *                       remark-callouts-directive-remap). NOT flattened.
 *   - code captions   → LEFT ON THE FENCE (the site's Markdown pipeline keeps the
 *                       `title=` meta). Like UC, no codeCaption flatten.
 *
 * The delta site's blog collection zod schema (src/content.config.ts) differs from
 * UC's: { title, description (REQUIRED), author | author[] (reference profiles),
 * publishedAt (date), updatedAt?, thumbnail (REQUIRED image) }. The `frontmatter`
 * hook maps the draft to that shape; the delivery skill HALTS if `description` or a
 * `thumbnail` asset can't be satisfied (zod fails the build otherwise) and reconciles
 * `author` ids against the site's `profiles` collection.
 *
 * The post is written to `dist/delta/index.mdx`. Delivery — copying the folder into
 * `../website/src/content/blog/<publishedAt>-<slug>/` — is the `/blog-emit` skill
 * with `--target delta` (see references/delta-target.md), mirroring UC.
 */

import remarkCalloutsDirectiveRemap from "../plugins/remark-callouts-directive-remap.mjs";
import remarkJourneyMdx from "../plugins/remark-journey-mdx.mjs";
import remarkLikeC4Mdx from "../plugins/remark-likec4-mdx.mjs";
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

/** The delta site's `publishedAt` is `z.coerce.date()` — an ISO `YYYY-MM-DD` string
 *  coerces cleanly. Drafts no longer carry a frontmatter date; emit stamps today
 *  (the ship day) when none is present. */
function isoDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "").trim());
  return m ? m[0] : undefined;
}

function emitDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Map the draft frontmatter → the delta blog collection's zod schema
 * (src/content.config.ts): { title, description, author[], publishedAt, thumbnail }.
 * Deterministic — no network. `description` and `thumbnail` are REQUIRED by the
 * schema; we emit what the draft has and let the delivery skill HALT if either is
 * missing (it can't fabricate a thumbnail image or a meaningful description).
 * Author-profile EXISTENCE is reconciled by the delivery skill, not here.
 */
function frontmatter(draft) {
  const authors = (Array.isArray(draft.author) ? draft.author : [draft.author])
    .filter(Boolean)
    .map(authorSlug);
  const fm = {
    title: draft.title,
    // schema requires `description`; `summary` is the draft's field for it. Emit it
    // when present so the delivery skill can detect (and halt on) its absence rather
    // than the site build failing opaquely.
    description: draft.summary ? String(draft.summary) : undefined,
    // `author` accepts a single ref or an array; emit an array (1+ ids) uniformly.
    author: authors,
    publishedAt: isoDate(draft.date) ?? emitDay(),
  };
  // `thumbnail` is a REQUIRED image reference (`./<file>`). The draft may carry a
  // `thumbnail`/`hero`; emit it as a co-located `./` path when present, else leave
  // it out so the delivery skill halts with a clear "thumbnail required" message.
  const thumb = draft.thumbnail ?? draft.hero;
  if (thumb) fm.thumbnail = `./${String(thumb).replace(/^\.?\//, "")}`;
  // Drop draft-only fields (slug/status/tags/series/target) — not in the delta schema.
  return fm;
}

const delta = {
  name: "delta",
  outputFile: "index.mdx", // the content-collection entry filename
  // Base stringify options; remark-mdx does the JSX-aware serialization.
  stringify: {
    bullet: "-",
    fences: true,
    fence: "`",
    rule: "-",
    listItemIndent: "one",
  },
  stringifyExtension: remarkStringifyMdx, // SERIALIZE-only MDX (no parser hook)
  safeText: remarkMdxSafeText, // escape bare <, >, {, } in prose so MDX stays valid
  titleAsH1: false, // Post.astro renders post.data.title as the <h1>
  unwrapProse: false, // MDX keeps authored line breaks
  frontmatter, // emit delta-shaped YAML frontmatter
  // Where the journey/likec4 plugins import their .astro components from. The site
  // gets an `@` → src/ alias in this pass, so components live at src/components/blog/.
  componentImportBase: "@/components/blog",
  likec4WebComponent: true, // generate dist/delta/likec4-webcomponent.mjs
  constructs: {
    // callouts: REMAP our vocabulary to the delta site's supported set, then pass
    //   the `:::` directive through for the site's remarkPlugins.ts to style.
    callouts: remarkCalloutsDirectiveRemap,
    // codeCaption: OMITTED — keep `title="x.py"` meta on the fence.
    journey: remarkJourneyMdx, // ::::journey → <Journey><JourneyStep>
    likec4: remarkLikeC4Mdx, // likec4= image → <LikeC4View> + manifest + fallback PNG
  },
  // Co-located post assets: Astro resolves `./file.png` relative to index.mdx.
  renderImage(entry) {
    return { type: "image", url: `./${entry.filename}`, alt: entry.altText, title: null };
  },
};

export default delta;
