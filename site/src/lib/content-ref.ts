// Build the proto ContentRef the review API expects from a rendered page's
// identity, and compute a heading's fingerprint the same way the version
// manifest does (lowercased, whitespace-collapsed) so client-created comments
// re-anchor consistently.

import { create } from "@bufbuild/protobuf";
// normalizeText/fingerprint are canonical in content-core (shared with the
// version manifest and server/src/anchor.ts). Import locally for use below AND
// re-export so the browser comment client uses the exact same normalization.
import { fingerprint, normalizeText } from "../content-core/normalize.mjs";
import {
  ContentArea,
  type ContentRef,
  ContentRefSchema,
} from "../gen/docs_factory/review/v1/messages_pb";

export function blogRef(slug: string): ContentRef {
  return create(ContentRefSchema, { area: ContentArea.BLOGS, slug });
}

export function docRef(project: string, bucket: string, slug: string): ContentRef {
  return create(ContentRefSchema, {
    area: ContentArea.DOCS,
    slug,
    project,
    bucket,
  });
}

/**
 * The in-app route for a ContentRef, matching App.tsx: `/blog/<slug>` for blogs
 * and `/docs/<project>/<bucket>/<slug>` for docs. Pass `anchorSlug` to deep-link
 * to a section (the reviewer dashboard links comments back to their heading).
 */
export function refHref(ref: ContentRef, anchorSlug?: string): string {
  const base =
    ref.area === ContentArea.BLOGS
      ? `/blog/${ref.slug}`
      : `/docs/${ref.project ?? ""}/${ref.bucket ?? ""}/${ref.slug}`;
  return anchorSlug ? `${base}#${anchorSlug}` : base;
}

/**
 * URL-safe serialization of a ContentRef for the review workspace's tab list
 * (`?tabs=docs:slug:project:bucket,blogs:slug::`). Deliberately distinct from
 * refKey() in review-queries.ts, which uses a `\0` separator for cache-key
 * identity and is NOT URL-safe. The four fields never contain `:` or `,`
 * (they're path segments / enum names), so a positional colon join round-trips.
 */
export function refToParam(ref: ContentRef): string {
  const area = ref.area === ContentArea.BLOGS ? "blogs" : "docs";
  return [area, ref.slug, ref.project ?? "", ref.bucket ?? ""].join(":");
}

/** Parse one `refToParam` token back into a ContentRef, or null if malformed. */
export function refFromParam(token: string): ContentRef | null {
  const [area, slug, project, bucket] = token.split(":");
  if (!slug) return null;
  if (area === "blogs") return blogRef(slug);
  if (area === "docs") {
    if (!project || !bucket) return null;
    return docRef(project, bucket, slug);
  }
  return null;
}

export { fingerprint, normalizeText };

/**
 * Hash of a source line, matching content-core hashLineSync() / server anchor.ts
 * hashLine(): sha256 of the line with BOTH leading and trailing whitespace
 * trimmed, first 16 hex chars. Trimming leading whitespace makes the hash
 * dedent-invariant — this side hashes the rendered (dedented) line, the server
 * hashes the full indented source line, so both must ignore indentation to
 * agree. Kept as a browser-only async SubtleCrypto variant (Node crypto is not
 * available in the browser); a drift test asserts it agrees with hashLineSync.
 */
export async function hashLine(line: string): Promise<string> {
  const data = new TextEncoder().encode(line.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** How much surrounding context to capture on each side of a quote. */
const CONTEXT = 32;

export interface CapturedSelector {
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
}

/**
 * Capture a W3C-style text-quote selector for `range` within `sectionEl`. The
 * quote/prefix/suffix are normalized so they match server-side re-anchoring;
 * `start` is the quote's offset within the normalized section text (advisory).
 * Returns null if the selection is empty or lies outside the section.
 */
export function captureSelector(range: Range, sectionEl: HTMLElement): CapturedSelector | null {
  const quoteRaw = range.toString();
  if (!quoteRaw.trim()) return null;

  // Full section text and the offset of the selection start within it, via a
  // range from the section start to the selection start.
  const sectionText = sectionEl.textContent ?? "";
  const pre = range.cloneRange();
  pre.selectNodeContents(sectionEl);
  pre.setEnd(range.startContainer, range.startOffset);
  const rawStart = pre.toString().length;

  const prefixRaw = sectionText.slice(Math.max(0, rawStart - CONTEXT), rawStart);
  const suffixRaw = sectionText.slice(
    rawStart + quoteRaw.length,
    rawStart + quoteRaw.length + CONTEXT,
  );

  const quote = normalizeText(quoteRaw);
  if (!quote) return null;
  const normText = normalizeText(sectionText);
  const start = normText.indexOf(quote);

  return {
    quote,
    prefix: normalizeText(prefixRaw),
    suffix: normalizeText(suffixRaw),
    start: start === -1 ? 0 : start,
  };
}

/**
 * The DOM subtree that owns a heading-anchored comment: the heading's parent
 * (typically the section/article fragment), not the heading itself. Searching
 * only the `<h*>` misses body prose under it — QuoteHighlights, scroll jumps,
 * and document-order sorting all need this same root.
 */
export function sectionRootForAnchor(article: HTMLElement, anchorSlug?: string): HTMLElement {
  if (!anchorSlug) return article;
  const heading = article.querySelector<HTMLElement>(`#${CSS.escape(anchorSlug)}`);
  return heading?.parentElement ?? article;
}

/**
 * Locate a stored text-quote selector within `sectionEl` and return a DOM Range
 * covering it, or null if not found. Walks text nodes, builds the concatenated
 * raw text, finds the quote (normalized comparison via a folded index map), and
 * maps the match back to node offsets. Prefers a match near prefix/suffix when
 * the quote occurs more than once.
 */
export function locateSelector(
  selector: { quote: string; prefix?: string; suffix?: string },
  sectionEl: HTMLElement,
): Range | null {
  const quote = normalizeText(selector.quote);
  if (!quote) return null;

  // Collect text nodes and a parallel normalized string with an index map back
  // to (node, offset) for each normalized char.
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(sectionEl, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  let norm = "";
  const map: { node: Text; offset: number }[] = []; // norm index -> source pos
  let lastWasSpace = true; // collapse leading space like normalizeText
  for (const node of nodes) {
    const raw = node.textContent ?? "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
        if (lastWasSpace) continue;
        norm += " ";
        map.push({ node, offset: i });
        lastWasSpace = true;
      } else {
        norm += ch.toLowerCase();
        map.push({ node, offset: i });
        lastWasSpace = false;
      }
    }
  }
  // Trim a trailing collapsed space to match normalizeText's trim().
  const trimmed = norm.replace(/ $/, "");

  const candidates: number[] = [];
  let from = 0;
  for (;;) {
    const at = trimmed.indexOf(quote, from);
    if (at === -1) break;
    candidates.push(at);
    from = at + 1;
  }
  if (candidates.length === 0) return null;

  // Disambiguate by prefix/suffix proximity when repeated.
  let idx = candidates[0];
  if (candidates.length > 1 && (selector.prefix || selector.suffix)) {
    const pfx = normalizeText(selector.prefix ?? "");
    let best = -1;
    for (const c of candidates) {
      const before = trimmed.slice(Math.max(0, c - pfx.length), c);
      if (pfx && before.endsWith(pfx)) {
        best = c;
        break;
      }
    }
    if (best !== -1) idx = best;
  }

  const startPos = map[idx];
  const endPos = map[idx + quote.length - 1];
  if (!startPos || !endPos) return null;
  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset + 1);
  return range;
}
