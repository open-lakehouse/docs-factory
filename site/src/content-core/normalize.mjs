/**
 * Canonical text normalization + line hashing for the content pipeline.
 *
 * This is THE one implementation of the normalization contract that the render
 * side, the version manifest, the server re-anchoring (server/src/anchor.ts),
 * and the browser comment client (site/src/lib/content-ref.ts) all depend on.
 * Previously each of those re-implemented it with a "must match X" comment; they
 * now import from here so they cannot drift.
 *
 * DOM-free and Vite-free: importable by Node/Bun (the manifest script, the
 * server) and by the browser (via the thin re-exports in content-ref.ts).
 */
import { createHash } from "node:crypto";

/**
 * Normalize prose for anchoring: lowercase, collapse runs of whitespace to a
 * single space, and trim. Used for section-body matching, quote selectors, and
 * heading fingerprints so a selection captured in the browser matches the text
 * the server re-anchors against.
 */
export function normalizeText(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * A heading's re-anchor key: the normalized heading text. Identical to
 * {@link normalizeText} today (kept as a named export so call sites read as the
 * fingerprint contract rather than incidental normalization).
 */
export function fingerprint(headingText) {
  return normalizeText(headingText);
}

/**
 * Hash of a single source line for code re-anchoring: sha256 of the line with
 * trailing whitespace trimmed, first 16 hex chars. Matches the browser's async
 * SubtleCrypto implementation (content-ref.ts hashLine); a drift test asserts
 * the two agree.
 */
export function hashLineSync(line) {
  return createHash("sha256")
    .update(line.replace(/\s+$/, ""))
    .digest("hex")
    .slice(0, 16);
}
