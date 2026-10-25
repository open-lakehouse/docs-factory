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
  CommentScope,
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
  /**
   * How precisely the anchor resolved. `moved`: the passage was found away from
   * where the comment was written (another section, or followed through the git
   * history since the authored commit); `note` says how.
   */
  precision: "quote" | "moved" | "code-line" | "section" | "file";
  /** The file changed since the commit the comment was written against. */
  drifted: boolean;
  /** Commits that touched the file since the authored commit, newest first. */
  history?: { commits: { sha: string; subject: string }[]; total: number };
  /** Human-readable caveat when the anchor didn't fully resolve. */
  note?: string;
}

const EXCERPT_MAX_LINES = 40;
const HISTORY_MAX_COMMITS = 5;
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

/** The file at `sha`, or undefined when the sha or the path isn't in this checkout. */
function fileAt(repoRoot: string, sha: string, path: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${sha}:${path}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

function historySince(
  repoRoot: string,
  sha: string | undefined,
  path: string,
): Location["history"] | undefined {
  if (!sha) return undefined;
  let out: string;
  try {
    out = execFileSync("git", ["log", "--format=%h %s", `${sha}..HEAD`, "--", path], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
  if (!out) return undefined;
  const lines = out.split("\n");
  const commits = lines.slice(0, HISTORY_MAX_COMMITS).map((l) => {
    const space = l.indexOf(" ");
    return { sha: l.slice(0, space), subject: l.slice(space + 1) };
  });
  return { commits, total: lines.length };
}

/** A `git diff -U0` hunk: old lines [oldStart, oldStart+oldCount) became the new ones. */
export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export function parseHunks(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    hunks.push({
      oldStart: Number(m[1]),
      oldCount: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]),
      newCount: m[4] === undefined ? 1 : Number(m[4]),
    });
  }
  return hunks;
}

/**
 * Map old lines [start, end] through `hunks` to the new file. A line inside a
 * hunk maps to that hunk's replacement, so `edited` says the range itself
 * changed. Undefined when every line in the range was deleted outright.
 * With a zero count, git's start is the line *before* the change.
 */
export function mapLines(
  hunks: Hunk[],
  start: number,
  end: number,
): { start: number; end: number; edited: boolean } | undefined {
  let edited = false;
  let survives = false;
  const mapOne = (line: number, side: "start" | "end"): number => {
    let delta = 0;
    for (const h of hunks) {
      if (h.oldCount === 0) {
        if (line > h.oldStart) delta += h.newCount;
        continue;
      }
      const oldEnd = h.oldStart + h.oldCount - 1;
      if (line < h.oldStart) break;
      if (line <= oldEnd) {
        if (h.newCount === 0) return side === "start" ? h.newStart + 1 : h.newStart;
        return side === "start" ? h.newStart : h.newStart + h.newCount - 1;
      }
      delta += h.newCount - h.oldCount;
    }
    return line + delta;
  };
  for (let line = start; line <= end; line++) {
    const h = hunks.find(
      (h) => h.oldCount > 0 && line >= h.oldStart && line < h.oldStart + h.oldCount,
    );
    if (h) edited = true;
    if (!h || h.newCount > 0) survives = true;
  }
  if (!survives) return undefined;
  const from = mapOne(start, "start");
  return { start: from, end: Math.max(from, mapOne(end, "end")), edited };
}

/**
 * Where old lines [start, end] went when the diff shows them deleted: the
 * densest run of their non-blank lines that still exist verbatim in the new
 * file. A moved paragraph keeps most of its soft-wrapped lines even when one
 * of them was edited. Lines that occur more than once can't say where they went.
 */
function movedLines(
  oldLines: string[],
  newLines: string[],
  start: number,
  end: number,
): { start: number; end: number; kept: number; of: number } | undefined {
  const at = new Map<string, number[]>();
  newLines.forEach((l, i) => {
    const key = l.trim();
    if (key) at.set(key, [...(at.get(key) ?? []), i + 1]);
  });
  const hits: number[] = [];
  let of = 0;
  for (let n = start; n <= end; n++) {
    const key = oldLines[n - 1]?.trim();
    if (!key) continue;
    of++;
    const found = at.get(key);
    if (found?.length === 1) hits.push(found[0]);
  }
  if (!hits.length) return undefined;
  hits.sort((a, b) => a - b);
  // The largest cluster of hits no further apart than the old range was long.
  const span = end - start + 1;
  let best = { from: 0, to: 0 };
  for (let i = 0, j = 0; j < hits.length; j++) {
    while (hits[j] - hits[i] >= 2 * span) i++;
    if (j - i > best.to - best.from) best = { from: i, to: j };
  }
  return { start: hits[best.from], end: hits[best.to], kept: best.to - best.from + 1, of };
}

function excerptOf(lines: string[], start: number, end: number): string {
  const last = Math.min(end, start + EXCERPT_MAX_LINES - 1);
  const text = lines.slice(start - 1, last).join("\n");
  return last < end ? `${text}\n… (${end - last} more lines)` : text;
}

/** Markdown source line → the prose a reader sees, for quote matching. */
function proseOf(line: string): string {
  return (
    line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links/images → their text
      .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, "") // block markers
      .replace(/[*`~]/g, "")
      // `_` marks emphasis only at a word edge; inside a word (`UC_DOCS_ROOT`) the
      // reader sees it.
      .replace(/(^|\W)_+|_+(?=\W|$)/g, "$1")
  );
}

/** A run of source lines (1-based, inclusive) and the prose a reader sees there. */
interface Segment {
  start: number;
  end: number;
  text: string;
}

/** Normalized `text` without whitespace, for matching that ignores how blocks were joined. */
function compact(text: string): string {
  return normalizeText(text).replace(/\s/g, "");
}

/**
 * Find a normalized quote across segments, in order. Whitespace is ignored on
 * both sides: a quote spans soft line breaks and blank lines, and the DOM joins
 * the text of two rendered blocks with or without a space, so the selection
 * can't say which. When the whole quote doesn't match, its first and last 60
 * characters often still do: an edit inside a long selection keeps both ends.
 */
function matchQuote(
  segments: Segment[],
  quote: string,
  context: QuoteContext = {},
): QuoteHit | undefined {
  let joined = "";
  const starts: number[] = [];
  for (const seg of segments) {
    starts.push(joined.length);
    joined += compact(seg.text);
  }
  const segmentAt = (idx: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > idx) i--;
    return segments[i];
  };
  const q = compact(quote);
  if (q.length < 4) return undefined;
  const at = pickOccurrence(joined, q, context);
  if (at >= 0) return { start: segmentAt(at).start, end: segmentAt(at + q.length - 1).end };

  const head = q.slice(0, 60);
  const h = joined.indexOf(head);
  if (h < 0) return undefined;
  const tail = q.slice(-60);
  const t = joined.indexOf(tail, h);
  // A tail far past where the quote could end is a different passage.
  const bothEnds = t >= 0 && t + tail.length - h <= 2 * q.length;
  const end = bothEnds ? t + tail.length - 1 : h + head.length - 1;
  return { start: segmentAt(h).start, end: segmentAt(end).end, partial: !bothEnds };
}

/** The text around a quote when it was selected, from its `TextSelector`. */
interface QuoteContext {
  prefix?: string;
  suffix?: string;
}

interface QuoteHit {
  start: number;
  end: number;
  /** Only the quote's first 60 characters matched, so `end` is a guess. */
  partial?: boolean;
}

/**
 * Offset of `q` in `text`, preferring the occurrence framed by the selection's
 * prefix, then its suffix, as the site's `locateSelector` does. -1 when absent.
 */
function pickOccurrence(text: string, q: string, { prefix, suffix }: QuoteContext): number {
  const found: number[] = [];
  for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + 1)) found.push(at);
  if (found.length < 2) return found[0] ?? -1;
  const pfx = compact(prefix ?? "");
  const sfx = compact(suffix ?? "");
  const byPrefix = pfx ? found.find((at) => text.slice(0, at).endsWith(pfx)) : undefined;
  const bySuffix = sfx ? found.find((at) => text.startsWith(sfx, at + q.length)) : undefined;
  return byPrefix ?? bySuffix ?? found[0];
}

/** Find a normalized quote within source lines [from, to] (1-based, inclusive). */
export function findQuote(
  lines: string[],
  from: number,
  to: number,
  quote: string,
  context?: QuoteContext,
): QuoteHit | undefined {
  const segments: Segment[] = [];
  for (let n = from; n <= to; n++)
    segments.push({ start: n, end: n, text: proseOf(lines[n - 1] ?? "") });
  return matchQuote(segments, quote, context);
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

type Located = Omit<Location, "drifted" | "history">;

const PARTIAL_NOTE = "only the start of the quote matched, so check where the passage ends";

function joinNotes(...notes: (string | undefined)[]): string | undefined {
  return notes.filter(Boolean).join("; ") || undefined;
}

function locateProse(comment: Comment, path: string, raw: string): Located {
  const lines = raw.split("\n");
  const { meta, body } = splitFrontmatter(raw);
  const bodyOffset = raw.length - body.length;
  const lineOfOffset = (offset = 0) => raw.slice(0, bodyOffset + offset).split("\n").length;
  const quote = comment.selector?.quote;
  const context = { prefix: comment.selector?.prefix, suffix: comment.selector?.suffix };
  const headings: Heading[] = extractHeadings(body);
  const bodyStart = lineOfOffset(0);
  const located = (hit: QuoteHit, precision: Located["precision"], note?: string): Located => ({
    path,
    startLine: hit.start,
    endLine: hit.end,
    excerpt: excerptOf(lines, hit.start, hit.end),
    precision,
    note: joinNotes(note, hit.partial ? PARTIAL_NOTE : undefined),
  });
  const bodySegments = (from: number, to: number): Segment[] => {
    const segments = frontmatterSegments(lines, meta);
    for (let n = from; n <= to; n++) {
      segments.push({ start: n, end: n, text: proseOf(lines[n - 1] ?? "") });
    }
    return segments;
  };
  const FRONTMATTER_NOTE = "starts in the frontmatter, which the site renders above the page";
  // The quote anywhere on the page: the passage moved to another section, or
  // its heading was renamed past recognition.
  const elsewhere = (): Located | undefined => {
    if (!quote) return undefined;
    const hit = matchQuote(bodySegments(bodyStart, lines.length), quote, context);
    if (!hit) return undefined;
    if (hit.start < bodyStart)
      return located(hit, "moved", `quoted text moved; ${FRONTMATTER_NOTE}`);
    const under = headings.filter((h) => lineOfOffset(h.offset) <= hit.start).at(-1);
    return located(
      hit,
      "moved",
      under ? `quoted text moved under #${under.id}` : "quoted text moved before the first heading",
    );
  };

  if (isPreambleAnchor(comment.anchorSlug)) {
    const end = headings.length ? lineOfOffset(headings[0].offset) - 1 : lines.length;
    if (quote) {
      const hit = matchQuote(bodySegments(bodyStart, end), quote, context);
      if (hit) return located(hit, "quote", hit.start < bodyStart ? FRONTMATTER_NOTE : undefined);
      const moved = elsewhere();
      if (moved) return moved;
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
    return (
      elsewhere() ?? {
        path,
        precision: "file",
        note: `heading "${comment.anchorSlug}" not found; it may have been renamed or removed`,
      }
    );
  }
  const h = headings[idx];
  const next = headings.slice(idx + 1).find((n) => n.level <= h.level);
  const sectionStart = lineOfOffset(h.offset);
  const sectionEnd = next ? lineOfOffset(next.offset) - 1 : lines.length;

  if (quote) {
    const hit = findQuote(lines, sectionStart, sectionEnd, quote, context);
    if (hit) return located(hit, "quote");
    const moved = elsewhere();
    if (moved) return moved;
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

/**
 * When the passage is gone from where the comment points, find it in the file
 * as of the authored commit, where it resolved exactly, and follow those lines
 * to the working tree: through the diff when they were edited in place, else
 * by the lines that survived verbatim elsewhere (a moved paragraph). No fuzzy
 * text matching, so the note can always say why these lines were chosen.
 */
function followHistory(
  repoRoot: string,
  comment: Comment,
  path: string,
  raw: string,
  current: Located,
): Located {
  const sha = comment.authoredGitSha;
  if (!sha || (current.precision !== "section" && current.precision !== "file")) return current;
  const oldRaw = fileAt(repoRoot, sha, path);
  if (oldRaw === undefined || oldRaw === raw) return current;
  const before = locateProse(comment, path, oldRaw);
  if (before.startLine === undefined || before.endLine === undefined) return current;
  // Only a range at least as precise as the current one is worth following. The
  // server relinks `anchorSlug` forward, so at the authored commit the quote can
  // sit outside that section and resolve as `moved`: still its exact old lines.
  const exactBefore = before.precision === "quote" || before.precision === "moved";
  if (!exactBefore && current.precision !== "file") return current;
  const lines = raw.split("\n");
  const where =
    before.startLine === before.endLine
      ? `line ${before.startLine} at ${sha.slice(0, 12)}`
      : `lines ${before.startLine}-${before.endLine} at ${sha.slice(0, 12)}`;
  const at = (start: number, end: number, note: string): Located => ({
    path,
    startLine: start,
    endLine: end,
    excerpt: excerptOf(lines, start, end),
    precision: "moved",
    note,
  });
  let diff: string;
  try {
    diff = execFileSync("git", ["diff", "-U0", "--no-color", "--no-ext-diff", sha, "--", path], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return current;
  }
  const mapped = mapLines(parseHunks(diff), before.startLine, before.endLine);
  if (mapped) {
    const how = mapped.edited ? "; edited since, so read around them" : "";
    return at(mapped.start, mapped.end, `followed from ${where} through the diff${how}`);
  }
  const moved = movedLines(oldRaw.split("\n"), lines, before.startLine, before.endLine);
  if (moved) {
    return at(
      moved.start,
      moved.end,
      `${where} were removed there; ${moved.kept} of their ${moved.of} lines are here unchanged`,
    );
  }
  return { ...current, note: joinNotes(current.note, `${where} were deleted since`) };
}

function locateCode(comment: Comment, repoRoot: string): Located {
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

/** Where a suggestion's original sits in the source, as the text to replace. */
export interface SuggestionMatch {
  startLine: number;
  endLine: number;
  /** The source text the suggestion's original corresponds to, verbatim. */
  source: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find a suggestion's `original` in the located lines of `raw`, so an agent
 * can replace it literally. Rendered prose joins soft-wrapped source lines with
 * a space, so whitespace runs match any whitespace; code compares trimmed lines
 * because the rendered snippet is dedented. Undefined when the passage carries
 * inline markup (or moved), which the agent must carry over by hand.
 */
export function matchSuggestion(
  raw: string,
  loc: Pick<Location, "startLine" | "endLine">,
  original: string,
  code: boolean,
): SuggestionMatch | undefined {
  if (loc.startLine === undefined || loc.endLine === undefined || !original.trim()) return;
  const lines = raw.split("\n");
  const from = loc.startLine;
  if (code) {
    const want = original.split("\n").map((l) => l.trim());
    const got = lines.slice(from - 1, from - 1 + want.length);
    if (got.length !== want.length || got.some((l, i) => l.trim() !== want[i])) return;
    return { startLine: from, endLine: from + want.length - 1, source: got.join("\n") };
  }
  const window = lines.slice(from - 1, loc.endLine).join("\n");
  const pattern = original.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  const m = new RegExp(pattern).exec(window);
  if (!m) return;
  const before = window.slice(0, m.index).split("\n").length - 1;
  const span = m[0].split("\n").length - 1;
  return { startLine: from + before, endLine: from + before + span, source: m[0] };
}

/**
 * Locate a thread's root comment in the checkout at `repoRoot`. Returns
 * undefined when the content isn't in this checkout at all (wrong repo, or a
 * page deleted since).
 */
export function locate(repoRoot: string, comment: Comment): Location | undefined {
  const sha = comment.authoredGitSha;
  const withDrift = (loc: Located): Location => {
    const drifted = fileChangedSince(repoRoot, sha, loc.path);
    const history = drifted ? historySince(repoRoot, sha, loc.path) : undefined;
    return history ? { ...loc, drifted, history } : { ...loc, drifted };
  };
  if (comment.codeSelector?.path) return withDrift(locateCode(comment, repoRoot));
  if (!comment.ref) return undefined;
  const path = sourcePathForRef(repoRoot, comment.ref);
  if (!path) return undefined;
  if (comment.scope === CommentScope.DOCUMENT) return withDrift({ path, precision: "file" });
  const raw = readFileSync(join(repoRoot, path), "utf8");
  return withDrift(followHistory(repoRoot, comment, path, raw, locateProse(comment, path, raw)));
}
