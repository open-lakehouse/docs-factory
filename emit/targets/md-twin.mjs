/**
 * targets/md-twin.mjs — the ".md twin" target.
 *
 * A twin is the RICH, reader-optimized markdown an agent (or a crawler, via the
 * Phase-0 <noscript> shell) fetches instead of our authoring-shaped source. The
 * emitter flattens every rich construct to portable markdown: `file=` snippets
 * inlined, `:::callout`/`:::tldr` → bold-led blockquotes, `::::journey` → numbered
 * `### Step N — …`, and `likec4=<viewId>` images → a plain `![](…)` pointing at the
 * site-served PNG. The raw `content/**` / `blogs/*` source is NEVER served — only
 * this twin. See docs/design/agentic-docs.md (Phase 1a).
 *
 * A flattening target like gdocs (targets/gdocs.mjs) is the closest sibling; the
 * key differences:
 *   - `titleAsH1: false` — the twin route already carries the title; keep the body
 *     clean (the driver puts title in the twin's own frontmatter).
 *   - `unwrapProse: true` — reflow the authoring-time hard wraps (80-col line
 *     breaks) into clean single-line paragraphs. Hard wraps are an authoring
 *     artifact, not reader structure; keeping them (`unwrapProse: false`) also
 *     leaves adjacent blocks glued without their blank-line separators. A reflowed
 *     twin is what a human or agent actually wants to read.
 *   - `renderImage` points a likec4 view at `/assets/likec4/<viewId>.png` (the
 *     site-served copy the driver writes), not a Docs placeholder.
 *   - `frontmatter` emits a small agent-readable preamble; the driver post-injects
 *     the `canonical:` line (it alone knows identity/origin), so this module stays
 *     free of any site/content-core dependency.
 */
import remarkTldrMd from "../plugins/remark-tldr-md.mjs";
import remarkCalloutsMd from "../plugins/remark-callouts-md.mjs";
import remarkJourneyMd from "../plugins/remark-journey-md.mjs";
import remarkCodeCaption from "../plugins/remark-code-caption.mjs";
import remarkLikeC4Md from "../plugins/remark-likec4-md.mjs";

/** Where the twin driver serves the regenerated LikeC4 PNGs from. Kept here so the
 * driver's PNG copy destination and this renderImage URL agree on one path. */
export const LIKEC4_ASSET_BASE = "/assets/likec4";

/**
 * The mdast node left in the tree for a STANDALONE image. A likec4 view points at
 * the site-served PNG (`/assets/likec4/<viewId>.png`); any other image reduces to a
 * plain filename-only image. The image is wrapped in a `paragraph` (a block node):
 * the likec4-md plugin replaces the whole standalone-image *paragraph* with what
 * this returns, and remark-stringify only inserts blank-line separators between
 * BLOCK nodes — returning a bare inline `image` here glues the following block
 * (e.g. the next heading) onto it. Mirrors gdocs wrapping its placeholder in a
 * paragraph, for the same reason.
 */
export function renderImage(entry) {
  const url = entry.likec4 ? `${LIKEC4_ASSET_BASE}/${entry.likec4}.png` : entry.filename;
  return {
    type: "paragraph",
    children: [{ type: "image", url, alt: entry.altText, title: null }],
  };
}

/**
 * The twin's leading frontmatter block — a small, stable, agent-readable preamble
 * derived from the draft frontmatter alone. The `canonical:` line is intentionally
 * absent here; the driver post-injects it (it knows the site origin + identity),
 * keeping this module decoupled from site/content-core.
 */
export function frontmatter(draft) {
  const fm = {};
  if (draft.title) fm.title = String(draft.title);
  // `summary` is the one exposed description (see design Decisions); TL;DR is body.
  if (draft.summary) fm.summary = String(draft.summary);
  if (draft.diataxis) fm.diataxis = draft.diataxis;
  if (draft.project) fm.project = draft.project;
  return Object.keys(fm).length ? fm : null;
}

const mdTwin = {
  name: "md-twin",
  outputFile: undefined, // the driver writes to the twin route path explicitly
  // Same portable markdown flavor as gdocs: fenced code, `-` bullets.
  stringify: {
    bullet: "-",
    fences: true,
    fence: "`",
    rule: "-",
    listItemIndent: "one",
  },
  titleAsH1: false, // twin frontmatter carries the title; don't duplicate in body
  unwrapProse: true, // reflow authoring hard-wraps to clean paragraphs (see above)
  frontmatter,
  constructs: {
    tldr: remarkTldrMd, // :::tldr → **TL;DR** blockquote
    callouts: remarkCalloutsMd, // :::tip/:::warning/… → bold-led blockquote
    journey: remarkJourneyMd, // ::::journey → numbered ### Step N — … headings
    codeCaption: remarkCodeCaption, // title="x.py" → bold caption line, clean fence
    likec4: remarkLikeC4Md, // likec4= image → site-served PNG + manifest
  },
  renderImage,
};

export default mdTwin;
