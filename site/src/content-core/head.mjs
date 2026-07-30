/**
 * Per-page HTML `<head>` metadata builders — framework-free and pure.
 *
 * Phase 0 of the agentic-docs plan: the site is a client-rendered SPA whose
 * `index.html` ships an empty shell, so crawlers and non-JS agents see no
 * per-page title/description/canonical/structured-data today. These builders
 * turn a page's `{identity, meta, body}` into the tags a prerender step
 * (prerender-shells.mjs) injects into a per-route static HTML shell.
 *
 * Everything here is derived from the CANONICAL identity (via hrefFromIdentity)
 * so the URLs match the routes the site serves and the llms.txt/twin generators
 * emit — one mapping, no drift. This module owns no I/O; callers pass in the
 * already-parsed frontmatter (`meta`) and markdown `body`.
 */
import { hrefFromIdentity } from "./identity.mjs";

/**
 * The site's public origin (no trailing slash). Configurable because the final
 * public URL isn't locked in yet; defaults to the openlakehouse.io origin the
 * C4 model's root element already points at. Scheme-agnostic callers should read
 * this rather than hard-coding a host.
 */
export function siteOrigin(env = process.env) {
  const raw = env.SITE_ORIGIN || env.VITE_SITE_ORIGIN || "https://openlakehouse.io";
  return raw.replace(/\/+$/, "");
}

/** Absolute canonical URL for a logical identity, or null if it has no route. */
export function canonicalUrl(identity, origin = siteOrigin()) {
  const href = hrefFromIdentity(identity);
  return href ? `${origin}${href}` : null;
}

/** The `.md` twin URL for a page (its canonical route + `.md`), or null. */
export function twinUrl(identity, origin = siteOrigin()) {
  const url = canonicalUrl(identity, origin);
  return url ? `${url}.md` : null;
}

/**
 * A short, plain-text page description: frontmatter `summary` if present, else
 * the first non-empty paragraph of the body, trimmed to ~200 chars on a word
 * boundary. Strips markdown emphasis/links/code markers to keep it prose.
 */
export function metaDescription(meta, body = "", max = 200) {
  const summary = typeof meta.summary === "string" ? meta.summary.trim() : "";
  const source = summary || firstParagraph(body);
  const text = stripInlineMarkdown(source).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The first substantial prose paragraph of a markdown body. Splits the body into
 * blank-line-separated blocks and returns the first block that is a plain prose
 * paragraph — skipping headings, lists, code, tables, images, blockquotes,
 * directives, HTML comments, and short label-only blocks like a bare
 * `**TL;DR**`. A block whose FIRST line is a block-level marker is skipped whole
 * (so list-item continuation lines never leak through as prose).
 */
function firstParagraph(body) {
  const cleaned = body.replace(/<!--[\s\S]*?-->/g, "");
  const blocks = cleaned.split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|:::|::::|\||!\[|<)/.test(lines[0])) continue;
    const text = lines.join(" ");
    if (isProse(text)) return text;
  }
  return "";
}

/**
 * A paragraph counts as prose if, once inline markers are stripped, it's a real
 * sentence — more than a couple of words and not a short label like "TL;DR".
 */
function isProse(s) {
  const text = stripInlineMarkdown(s).replace(/\s+/g, " ").trim();
  return text.split(" ").filter(Boolean).length >= 4;
}

/** Strip the common inline markdown markers so a description reads as prose. */
function stripInlineMarkdown(s) {
  return s
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/\*\*([^*]*)\*\*/g, "$1") // bold
    .replace(/\*([^*]*)\*/g, "$1") // italic
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links → link text
}

const PAGE_TITLE_SUFFIX = "Open Lakehouse";

/** The `<title>` text for a page: `<page title> — Open Lakehouse` (home: just the suffix). */
export function pageTitle(meta, identity) {
  const t = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : null;
  if (!t) return PAGE_TITLE_SUFFIX;
  return `${t} — ${PAGE_TITLE_SUFFIX}`;
}

/**
 * OpenGraph tags as `[property, content]` pairs. `image` (absolute URL) is
 * optional — Phase 2 supplies a LikeC4 PNG for pages that explain a concept.
 */
export function ogTags({ title, description, url, type = "article", image } = {}) {
  const tags = [
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ["og:type", type],
    ["og:site_name", PAGE_TITLE_SUFFIX],
  ];
  if (image) tags.push(["og:image", image]);
  return tags.filter(([, v]) => v != null && v !== "");
}

/** Twitter card tags as `[name, content]` pairs. */
export function twitterTags({ title, description, image } = {}) {
  const tags = [
    ["twitter:card", image ? "summary_large_image" : "summary"],
    ["twitter:title", title],
    ["twitter:description", description],
  ];
  if (image) tags.push(["twitter:image", image]);
  return tags.filter(([, v]) => v != null && v !== "");
}

/**
 * schema.org JSON-LD for a page, as a plain object ready to JSON.stringify.
 *   - home (`/`)      → WebSite + Organization
 *   - docs page       → TechArticle
 *   - blog post       → BlogPosting
 * Callers stringify and wrap in `<script type="application/ld+json">`.
 */
export function jsonLd({ identity, meta, url, description, origin = siteOrigin() }) {
  if (!identity || identity.area === "site") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: PAGE_TITLE_SUFFIX,
          url: origin,
        },
        {
          "@type": "Organization",
          name: PAGE_TITLE_SUFFIX,
          url: origin,
        },
      ],
    };
  }

  const base = {
    "@context": "https://schema.org",
    headline: typeof meta.title === "string" ? meta.title : undefined,
    description: description || undefined,
    url: url || undefined,
    author:
      typeof meta.author === "string" && meta.author
        ? { "@type": "Person", name: meta.author }
        : undefined,
  };

  if (identity.area === "blogs") {
    return prune({
      ...base,
      "@type": "BlogPosting",
      datePublished: normalizeDate(meta.date),
      keywords: Array.isArray(meta.tags) ? meta.tags.join(", ") : undefined,
    });
  }

  return prune({
    ...base,
    "@type": "TechArticle",
    // The Diátaxis quadrant is a useful proficiency/section hint for crawlers.
    articleSection: typeof meta.diataxis === "string" ? meta.diataxis : undefined,
    isPartOf:
      identity.area === "docs" && identity.project
        ? { "@type": "TechArticle", name: `${identity.project} documentation` }
        : undefined,
  });
}

/** ISO date passthrough (frontmatter `date` is already ISO8601), or undefined. */
function normalizeDate(date) {
  if (!date) return undefined;
  const s = String(date);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s : undefined;
}

/** Drop undefined keys so the emitted JSON-LD is clean. */
function prune(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * The full set of head inputs for a page, assembled once. prerender-shells.mjs
 * renders these into tags; keeping assembly here means the twin/sitemap
 * generators (later phases) reuse the exact same title/description/canonical.
 */
export function pageHead({ identity, meta, body = "", origin = siteOrigin(), type }) {
  const url = canonicalUrl(identity, origin);
  const title = pageTitle(meta, identity);
  const description = metaDescription(meta, body);
  const ogType = type || (identity?.area === "blogs" ? "article" : identity?.area === "site" ? "website" : "article");
  return {
    title,
    description,
    canonical: url,
    twin: twinUrl(identity, origin),
    og: ogTags({ title, description, url, type: ogType }),
    twitter: twitterTags({ title, description }),
    jsonLd: jsonLd({ identity, meta, url, description, origin }),
  };
}
