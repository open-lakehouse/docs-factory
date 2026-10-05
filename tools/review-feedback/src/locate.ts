// Map a review comment's anchor onto the local working tree: which file, which
// lines. This is why the core runs next to the checkout rather than behind a
// hosted API. Identity, slugging, normalization, and line hashing all come
// from content-core, the same contract the site and server anchor with, so a
// heading id or line hash computed here matches the one the comment carries.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { splitFrontmatter } from "../../../site/src/content-core/frontmatter.mjs";
import { hashLineSync } from "../../../site/src/content-core/hash.mjs";
import { docIdentity } from "../../../site/src/content-core/identity.mjs";
import { normalizeText } from "../../../site/src/content-core/normalize.mjs";
import { extractHeadings, isPreambleAnchor } from "../../../site/src/content-core/slug.mjs";
import { walkContent } from "../../../site/src/content-core/walk.mjs";
import {
  type Comment,
  ContentArea,
  type ContentRef,
} from "./gen/docs_factory/review/v1/messages_pb.js";

export interface Location {
  /** Repo-relative path of the file to edit. */
  path: string;
  /** 1-based, inclusive. Absent when only the file could be determined. */
  startLine?: number;
  endLine?: number;
  /** The located lines, verbatim. */
  excerpt?: string;
  /** How precisely the anchor resolved. */
  precision: "quote" | "code-line" | "section" | "file";
  /** The file changed since the commit the comment was written against. */
  drifted: boolean;
  /** Human-readable caveat when the anchor didn't fully resolve. */
  note?: string;
}

const EXCERPT_MAX_LINES = 40;
/** Frontmatter fields the site renders above the body, so a reader can quote them. */
const RENDERED_FRONTMATTER = ["title", "summary", "description"];

/** The fields of content-core's extractHeadings result used here. */
interface Heading {
  id: string;
  fingerprint: string;
  level: number;
  offset?: number;
}

/** Repo-relative source file of a content ref, or undefined if it's not in this checkout. */
export function sourcePathForRef(repoRoot: string, ref: ContentRef): string | undefined {
  if (ref.area === ContentArea.BLOGS) {
    const p = join("blogs", ref.slug, "index.md");
    return existsSync(join(repoRoot, p)) ? p : undefined;
  }
  if (!ref.project || !ref.bucket) return undefined;
  // Walk the bucket rather than guessing filenames: identity strips `NNN-`
  // order prefixes and honors a `slug:` frontmatter override.
  const bucketDir = join(repoRoot, "content", ref.project, ref.bucket);
  for (const abs of walkContent(bucketDir)) {
    const rel = relative(repoRoot, abs);
    const { meta } = splitFrontmatter(readFileSync(abs, "utf8"));
    const id = docIdentity(rel, meta);
    if (id.project === ref.project && id.bucket === ref.bucket && id.slug === ref.slug) {
      // `snippets/` and other nested files under a folder-mode page also walk;
      // only the page itself parses to this identity.
      return rel;
    }
  }
  return undefined;
}

/** Whether `path` differs between `sha` and the working tree. Unknown sha → false. */
export function fileChangedSince(repoRoot: string, sha: string | undefined, path: string): boolean {
  if (!sha) return false;
  try {
    execFileSync("git", ["diff", "--quiet", sha, "--", path], { cwd: repoRoot, stdio: "ignore" });
    return false;
  } catch (e) {
    // Exit 1 = differs. Anything else (sha not fetched locally) = can't tell.
    return (e as { status?: number }).status === 1;
  }
}

function excerptOf(lines: string[], start: number, end: number): string {
  const last = Math.min(end, start + EXCERPT_MAX_LINES - 1);
  const text = lines.slice(start - 1, last).join("\n");
  return last < end ? `${text}\n… (${end - last} more lines)` : text;
}

/** Markdown source line → the prose a reader sees, for quote matching. */
function proseOf(line: string): string {
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links/images → their text
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, "") // block markers
    .replace(/[*_`~]/g, "");
}

/** A run of source lines (1-based, inclusive) and the prose a reader sees there. */
interface Segment {
  start: number;
  end: number;
  text: string;
}

/**
 * Find a normalized quote across segments, in order. Prose is normalized per
 * segment and joined, so a quote spanning a soft line break still matches.
 * When the whole quote doesn't match, its first and last 60 characters often
 * still do: an edit inside a long selection, or a selection across two rendered
 * blocks whose text the DOM joins without a space, keeps both ends intact.
 */
function matchQuote(
  segments: Segment[],
  quote: string,
): { start: number; end: number } | undefined {
  let joined = "";
  const starts: number[] = [];
  for (const seg of segments) {
    starts.push(joined.length);
    joined += `${normalizeText(seg.text)} `;
  }
  const segmentAt = (idx: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > idx) i--;
    return segments[i];
  };
  const q = normalizeText(quote);
  if (q.length < 4) return undefined;
  const at = joined.indexOf(q);
  if (at >= 0) return { start: segmentAt(at).start, end: segmentAt(at + q.length - 1).end };

  const head = q.slice(0, 60);
  const h = joined.indexOf(head);
  if (h < 0) return undefined;
  const tail = q.slice(-60);
  const t = joined.indexOf(tail, h);
  // A tail far past where the quote could end is a different passage.
  const end =
    t >= 0 && t + tail.length - h <= 2 * q.length ? t + tail.length - 1 : h + head.length - 1;
  return { start: segmentAt(h).start, end: segmentAt(end).end };
}

/** Find a normalized quote within source lines [from, to] (1-based, inclusive). */
export function findQuote(
  lines: string[],
  from: number,
  to: number,
  quote: string,
): { start: number; end: number } | undefined {
  const segments: Segment[] = [];
  for (let n = from; n <= to; n++)
    segments.push({ start: n, end: n, text: proseOf(lines[n - 1] ?? "") });
  return matchQuote(segments, quote);
}

/**
 * The rendered frontmatter fields as segments over their source lines. A field
 * runs from its `key:` line to the line before the next top-level key.
 */
function frontmatterSegments(lines: string[], meta: Record<string, unknown>): Segment[] {
  if (lines[0]?.trimEnd() !== "---") return [];
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === "---") + 1;
  if (close < 1) return [];
  const keyLines: number[] = [];
  for (let n = 2; n < close; n++) if (/^[A-Za-z_][\w-]*:/.test(lines[n - 1])) keyLines.push(n);
  const segments: Segment[] = [];
  for (const key of RENDERED_FRONTMATTER) {
    const value = meta[key];
    if (typeof value !== "string") continue;
    const i = keyLines.findIndex((n) => lines[n - 1].startsWith(`${key}:`));
    if (i < 0) continue;
    const end = (keyLines[i + 1] ?? close) - 1;
    segments.push({ start: keyLines[i], end: Math.max(keyLines[i], end), text: value });
  }
  return segments;
}

function locateProse(comment: Comment, path: string, raw: string): Omit<Location, "drifted"> {
  const lines = raw.split("\n");
  const { meta, body } = splitFrontmatter(raw);
  const bodyOffset = raw.length - body.length;
  const lineOfOffset = (offset = 0) => raw.slice(0, bodyOffset + offset).split("\n").length;
  const quote = comment.selector?.quote;
  const headings: Heading[] = extractHeadings(body);

  if (isPreambleAnchor(comment.anchorSlug)) {
    const bodyStart = lineOfOffset(0);
    const end = headings.length ? lineOfOffset(headings[0].offset) - 1 : lines.length;
    if (quote) {
      const segments = frontmatterSegments(lines, meta);
      for (let n = bodyStart; n <= end; n++) {
        segments.push({ start: n, end: n, text: proseOf(lines[n - 1] ?? "") });
      }
      const hit = matchQuote(segments, quote);
      if (hit) {
        return {
          path,
          startLine: hit.start,
          endLine: hit.end,
          excerpt: excerptOf(lines, hit.start, hit.end),
          precision: "quote",
          note:
            hit.start < bodyStart
              ? "starts in the frontmatter, which the site renders above the page"
              : undefined,
        };
      }
    }
    if (end < bodyStart) {
      return {
        path,
        precision: "file",
        note: quote ? "quoted text not found before the first heading" : undefined,
      };
    }
    return {
      path,
      startLine: bodyStart,
      endLine: end,
      excerpt: excerptOf(lines, bodyStart, end),
      precision: "section",
      note: quote
        ? "quoted text not found before the first heading; it has likely been edited"
        : undefined,
    };
  }

  let idx = headings.findIndex((h) => h.id === comment.anchorSlug);
  // A renamed heading changes its id but keeps a recognizable fingerprint.
  if (idx < 0 && comment.anchorFingerprint) {
    idx = headings.findIndex((h) => h.fingerprint === comment.anchorFingerprint);
  }
  if (idx < 0) {
    return {
      path,
      precision: "file",
      note: `heading "${comment.anchorSlug}" not found; it may have been renamed or removed`,
    };
  }
  const h = headings[idx];
  const next = headings.slice(idx + 1).find((n) => n.level <= h.level);
  const sectionStart = lineOfOffset(h.offset);
  const sectionEnd = next ? lineOfOffset(next.offset) - 1 : lines.length;

  if (quote) {
    const hit = findQuote(lines, sectionStart, sectionEnd, quote);
    if (hit) {
      return {
        path,
        startLine: hit.start,
        endLine: hit.end,
        excerpt: excerptOf(lines, hit.start, hit.end),
        precision: "quote",
      };
    }
  }
  return {
    path,
    startLine: sectionStart,
    endLine: sectionEnd,
    excerpt: excerptOf(lines, sectionStart, sectionEnd),
    precision: "section",
    note: quote ? "quoted text not found in the section; it has likely been edited" : undefined,
  };
}

function locateCode(comment: Comment, repoRoot: string): Omit<Location, "drifted"> {
  const sel = comment.codeSelector;
  if (!sel) throw new Error("not a code comment");
  const path = sel.path;
  const abs = join(repoRoot, path);
  if (!existsSync(abs)) {
    return { path, precision: "file", note: "snippet file not found in this checkout" };
  }
  const lines = readFileSync(abs, "utf8").split("\n");
  const span = Math.max(0, sel.endLine - sel.line);
  let start = sel.line;
  if (sel.lineHash && hashLineSync(lines[start - 1] ?? "") !== sel.lineHash) {
    // The line moved: take the matching line nearest its old position.
    let best: number | undefined;
    lines.forEach((l, i) => {
      if (hashLineSync(l) !== sel.lineHash) return;
      if (best === undefined || Math.abs(i + 1 - sel.line) < Math.abs(best - sel.line))
        best = i + 1;
    });
    if (best === undefined) {
      return {
        path,
        precision: "file",
        note: `commented line ${sel.line} no longer exists unchanged; it was likely edited`,
      };
    }
    start = best;
  }
  const end = Math.min(start + span, lines.length);
  return {
    path,
    startLine: start,
    endLine: end,
    excerpt: excerptOf(lines, start, end),
    precision: "code-line",
  };
}

/**
 * Locate a thread's root comment in the checkout at `repoRoot`. Returns
 * undefined when the content isn't in this checkout at all (wrong repo, or a
 * page deleted since).
 */
export function locate(repoRoot: string, comment: Comment): Location | undefined {
  const sha = comment.authoredGitSha;
  if (comment.codeSelector?.path) {
    const loc = locateCode(comment, repoRoot);
    return { ...loc, drifted: fileChangedSince(repoRoot, sha, loc.path) };
  }
  if (!comment.ref) return undefined;
  const path = sourcePathForRef(repoRoot, comment.ref);
  if (!path) return undefined;
  const loc = locateProse(comment, path, readFileSync(join(repoRoot, path), "utf8"));
  return { ...loc, drifted: fileChangedSince(repoRoot, sha, path) };
}
