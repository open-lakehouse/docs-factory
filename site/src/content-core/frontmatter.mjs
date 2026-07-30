/**
 * Canonical YAML frontmatter split + body hashing.
 *
 * The render side (remark-frontmatter), the version manifest, and docsnip each
 * split frontmatter from body; this is the JS authority the manifest uses, and a
 * drift test asserts it agrees with docsnip's Python `parse()` on the corpus.
 */
import { createHash } from "node:crypto";
import yaml from "js-yaml";

/**
 * The frontmatter `status` value at which a page becomes part of the PUBLIC
 * corpus — the single git-authoritative publish gate shared by every build
 * surface (llms.txt, prerendered shells, the .md twins). Pages default to
 * `draft` when unset. The review server keeps its own `READY_STATUS` mirror
 * (server/src/services/review.ts) by the repo's no-cross-package-import
 * convention; both must agree.
 */
export const PUBLISH_STATUS = "ready";

/** Whether a page's frontmatter marks it public (`status: ready`). */
export function isPublic(meta) {
  return (meta?.status ?? "draft") === PUBLISH_STATUS;
}

/** Split YAML frontmatter from the markdown body. */
export function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  let meta = {};
  try {
    meta = yaml.load(match[1]) ?? {};
  } catch {
    meta = {};
  }
  // Strip leading newlines after the closing `---` so the body starts at the
  // first line of prose. Matches docsnip's Python parse() (body.lstrip("\n")),
  // so the two frontmatter splitters produce the SAME body — and thus the same
  // contentHash — for every page (enforced by the cross-language drift test).
  return { meta, body: raw.slice(match[0].length).replace(/^\n+/, "") };
}

/** sha256 of the body (frontmatter excluded), normalized to \n line endings. */
export function hashBody(body) {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex");
}

/** sha256 of a full source file, normalized to \n line endings. */
export function hashSource(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}
