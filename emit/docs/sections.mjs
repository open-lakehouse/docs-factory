/**
 * Per-section hashes of a RENDERED page body, for the change report.
 *
 * The factory's Merkle tree (content-core/tree.mjs) hashes a `file=` snippet by
 * its whole source file, so one edit marks every section quoting that file. The
 * emitted page already has the quoted regions inlined, so hashing it section by
 * section names exactly the sections a reader sees change. A section is a
 * heading's own content up to the next heading of any level; anything before
 * the first heading is PREAMBLE_KEY.
 */
import { extractHeadings } from "../../site/src/content-core/slug.mjs";
import { PREAMBLE_KEY } from "../../site/src/content-core/tree.mjs";
import { sha256 } from "./sync.mjs";

const hash = (text) => sha256(text).slice(0, 16);

export function renderedSections(body) {
  const headings = extractHeadings(body);
  const out = {};
  const preamble = body.slice(0, headings[0]?.offset ?? body.length);
  if (preamble.trim()) out[PREAMBLE_KEY] = hash(preamble);
  headings.forEach((h, i) => {
    out[h.id] = hash(body.slice(h.offset, headings[i + 1]?.offset ?? body.length));
  });
  return out;
}
