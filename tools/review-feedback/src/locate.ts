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
import { extractHeadings } from "../../../site/src/content-core/slug.mjs";
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

/**
 * Find a normalized quote within source lines [from, to] (1-based, inclusive).
 * Prose is normalized line by line and joined, so a quote spanning a soft line
 * break still matches. Falls back to the quote's first 60 characters, which
 * survive an edit to the end of a long selection.
 */
export function findQuote(
  lines: string[],
  from: number,
  to: number,
  quote: string,
): { start: number; end: number } | undefined {
  let joined = "";
  const starts: number[] = [];
  for (let n = from; n <= to; n++) {
    starts.push(joined.length);
    joined += `${normalizeText(proseOf(lines[n - 1] ?? ""))} `;
  }
  const lineAt = (idx: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > idx) i--;
    return from + i;
  };
  const q = normalizeText(quote);
  for (const needle of [q, q.slice(0, 60)]) {
    if (needle.length < 4) continue;
    const at = joined.indexOf(needle);
    if (at >= 0) return { start: lineAt(at), end: lineAt(at + needle.length - 1) };
  }
  return undefined;
}

function locateProse(comment: Comment, path: string, raw: string): Omit<Location, "drifted"> {
  const lines = raw.split("\n");
  const { body } = splitFrontmatter(raw);
  const bodyOffset = raw.length - body.length;
  const lineOfOffset = (offset = 0) => raw.slice(0, bodyOffset + offset).split("\n").length;

  const headings: Heading[] = extractHeadings(body);
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

  const quote = comment.selector?.quote;
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
